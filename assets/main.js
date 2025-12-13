// assets/main.js
// MaplibreGL を使用した到達圏マップ - メイン制御
// 各機能は外部モジュールに分離：
//   - config.js: 設定・定数
//   - ui-controller.js: UI操作
//   - isochrone-service.js: 到達圏計算
//   - dijkstra.js: 最短経路アルゴリズム
//   - isochrone.js: 到達圏フィーチャ生成（レガシー、isochrone-service.js へ統合予定）
//   - map-layers.js: レイヤ管理

(async function(){
  
  // === ローディングマネージャーの参照を取得 ===
  const loadingManager = window.loadingManager;
  
  // === UI コントローラー初期化 ===
  const uiController = new UIController();
  uiController.initMobileMenu();
  
  // === マップ初期化 ===
  const config = window.AppConfig;
  const initialCity = config.cities[config.map.initialCity];
  const initialCenter = {lng: initialCity.lon, lat: initialCity.lat};
  const initialZoom = initialCity.zoom;
  
  const map = new maplibregl.Map({
    container: 'map',
    style: config.mapStyle,
    center: initialCenter,
    zoom: initialZoom,
    minZoom: config.map.minZoom,
    maxZoom: config.map.maxZoom,
    pitch: 0,
    bearing: 0
  });
  
  // グローバルに map を保存（LoadingManager が参照できるように）
  window.map = map;
  
  console.log('[Init] Map initialized successfully');

  // === グローバル状態 ===
  let origin = null;
  let originMarkerSource = null;
  let isIsochroneLocked = false;
  const stationUrl = config.data.stations;
  const graphUrl = config.data.graph;
  
  const WALK_KMH = config.isochrone.walkKmh;
  const STEP_MIN = config.isochrone.stepMin;
  const MAX_MIN = config.isochrone.maxMin;

  // === レイヤマネージャー ===
  const layerManager = new MapLayerManager(map);

  // === ズーム表示更新 ===
  function updateZoomDisplay() {
    const zl = document.getElementById('zoomLevel');
    if(zl) zl.textContent = String(Math.round(map.getZoom()));
    layerManager.updateLayersByZoom();
  }

  map.on('zoom', updateZoomDisplay);
  
  // === マップ読み込み完了後の処理 ===
  map.on('load', async () => {
    // ローディング開始
    loadingManager.start('地図データを読み込み中...');
    loadingManager.setProgress(10);

    updateZoomDisplay();

    // データ読み込み
    try {
      loadingManager.setText('ネットワークデータを読み込み中...');
      loadingManager.setProgress(20);
      const graph = await fetchJson(graphUrl);
      loadingManager.setProgress(30);

      // グラフ準備
      const nodes = new Map();
      graph.nodes.forEach(n => {
        nodes.set(n.id, {name: n.name});
      });
      
      const adj = new Map();
      graph.edges.forEach(e => {
        if(!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from).push({to: e.to, cost: e.cost});
        if(!adj.has(e.to)) adj.set(e.to, []);
        adj.get(e.to).push({to: e.from, cost: e.cost});
      });

      // 駅・線路データ読み込み
      loadingManager.setText('駅データを読み込み中...');
      loadingManager.setProgress(50);
      const stations = {};
      await layerManager.loadRails(config.data.rails);
      loadingManager.setProgress(70);
      await layerManager.loadStations(stationUrl, stations);
      loadingManager.setProgress(85);

      // マウスオーバーポップアップを有効にする
      layerManager.enableHoverPopups();
      
      loadingManager.setProgress(95);

      // === 到達圏計算サービス ===
      const isochroneService = new IsochroneService(WALK_KMH, STEP_MIN, MAX_MIN);
      
      // ローディング完了
      loadingManager.setText('準備完了');
      await loadingManager.end(200);

      // === 出発地点マーカー設定 ===
      function setOriginMarker(originLonLat) {
        if(map.getSource('origin-marker')) {
          map.removeLayer('origin-marker-layer');
          map.removeSource('origin-marker');
        }
        
        originMarkerSource = {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [originLonLat[0], originLonLat[1]]
            },
            properties: {name: '出発地点（0分）'}
          }
        };
        
        map.addSource('origin-marker', originMarkerSource);
        map.addLayer({
          id: 'origin-marker-layer',
          type: 'circle',
          source: 'origin-marker',
          paint: {
            'circle-radius': 10,
            'circle-color': '#ff0000',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff'
          },
          minzoom: 0,
          maxzoom: 24
        });
        
        uiController.displayOriginInfo(originLonLat);
      }

      // === 到達圏計算実行 ===
      async function computeIsochrones() {
        if(!origin) {
          alert('地図をクリックして出発地点を指定してください');
          return;
        }

        if(isIsochroneLocked) {
          console.log('[Info] 到達圏が固定されているため、再計算はできません');
          return;
        }

        // 到達圏計算前に駅一覧を初期化
        uiController.clearStationTable();

        try {
          const walkSpeed = WALK_KMH * 1000 / 3600;

          const nearestStations = isochroneService.findNearestStations(
            origin, 
            stations, 
            config.isochrone.nearestStationsMax
          );
          
          if(!nearestStations || nearestStations.length === 0) {
            const originFeature = {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [origin[0], origin[1]]
              },
              properties: {
                cost_seconds: 0,
                station_name: '開始地点',
                lat: origin[1],
                lon: origin[0]
              }
            };
            
            layerManager.addIsochrones([originFeature], ['#ff0000'], STEP_MIN, MAX_MIN);
            uiController.displayStationTable([originFeature]);
            return;
          }
          
          // 複数駅から Dijkstra を実行して結果を統合
          const mergedCosts = isochroneService.computeMergedCosts(
            adj, 
            nodes, 
            nearestStations, 
            walkSpeed
          );
          
          if(Object.keys(mergedCosts).length === 0) {
            alert('到達圏の計算に失敗しました。');
            return;
          }
          
          isochroneService.buildDebugTable(mergedCosts, stations);

          // 到達圏フィーチャ生成
          const { features: allIsochroneFeatures, colors } = isochroneService.generateIsochroneFeatures(
            mergedCosts, 
            stations
          );

          if(window.AppConfig.debug.enabled) {
            console.log(`[DEBUG] Generated ${allIsochroneFeatures.length} isochrone point features from ${nearestStations.length} nodes`);
          }

          // レイヤ追加
          layerManager.addIsochrones(allIsochroneFeatures, colors, STEP_MIN, MAX_MIN);

          // 駅テーブル表示
          uiController.displayStationTable(allIsochroneFeatures);
          
          // ロックボタンを表示
          uiController.setLockButtonsVisibility(false);
        } catch (error) {
          console.error('[Error] Failed to compute isochrones:', error);
          alert('到達圏の計算に失敗しました。');
        }
      }

      // === リセット ===
      function resetAll() {
        if(map.getSource('origin-marker')) {
          map.removeLayer('origin-marker-layer');
          map.removeSource('origin-marker');
        }
        origin = null;
        isIsochroneLocked = false;
        layerManager.clearIsochrones();
        
        uiController.clearOriginInfo();
        uiController.clearStationTable();
        uiController.setLockButtonsVisibility(false);
        
        status('リセットしました');
      }

      // === UI イベントハンドラ ===
      id('resetBtn').addEventListener('click', resetAll);
      
      // 到達圏固定ボタン
      const lockBtn = id('lockBtn');
      if(lockBtn) {
        lockBtn.addEventListener('click', function() {
          isIsochroneLocked = true;
          uiController.setLockButtonsVisibility(true);
          status('到達圏を固定しました。クリックで再計算できません。');
        });
      }
      
      // 到達圏固定解除ボタン
      const unlockBtn = id('unlockBtn');
      if(unlockBtn) {
        unlockBtn.addEventListener('click', function() {
          isIsochroneLocked = false;
          uiController.setLockButtonsVisibility(false);
          status('到達圏の固定を解除しました。');
        });
      }
      
      // 都市選択
      const citySelectEl = id('citySelect');
      if(citySelectEl) {
        citySelectEl.addEventListener('change', function() {
          const cityKey = this.value;
          if(cityKey && config.cities[cityKey]) {
            const city = config.cities[cityKey];
            loadingManager.start('都市を読み込み中...');
            loadingManager.setProgress(30);
            map.jumpTo({center: [city.lon, city.lat], zoom: city.zoom});
            loadingManager.setProgress(70);
            resetAll();
            loadingManager.setProgress(95);
            loadingManager.end(200);
          }
        });
      }

      // === 駅テーブル行のクリックハンドラ ===
      uiController.setStationTableRowClickHandler((stationLon, stationLat, stationName) => {
        map.flyTo({
          center: [stationLon, stationLat],
          duration: 500
        });
        
        map.once('moveend', function() {
          const renderedFeatures = map.queryRenderedFeatures(
            {layers: [layerManager.stationsLayerId]}
          );
          
          let stationFeature = null;
          if(renderedFeatures && renderedFeatures.length > 0) {
            for(const feature of renderedFeatures) {
              const featureLon = feature.geometry.coordinates[0];
              const featureLat = feature.geometry.coordinates[1];
              const dist = Math.sqrt(
                Math.pow(featureLon - stationLon, 2) + 
                Math.pow(featureLat - stationLat, 2)
              );
              if(dist < 0.0001) {
                stationFeature = feature;
                break;
              }
            }
          }
          
          if(layerManager.currentPopup) {
            layerManager.currentPopup.remove();
            layerManager.currentPopup = null;
          }
          
          if(stationFeature) {
            layerManager.currentPopup = layerManager._createStationPopup(stationFeature);
            layerManager.currentPopup.addTo(map);
          }
          
          if(window.AppConfig.debug.enabled) {
            console.log('[DEBUG] Jumped to station:', stationName, {lon: stationLon, lat: stationLat});
          }
        });
      });

      // === 地図クリックで出発地点設定 ===
      map.on('click', async function(e) {
        if(isIsochroneLocked) {
          console.log('[Info] 到達圏が固定されているため、クリックで再計算できません');
          return;
        }
        
        // スマホ版：当たり判定エリア内に駅または線路がある場合は出発地点登録を行わない
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if(isMobile) {
          const HIT_BOX_SIZE = layerManager.HIT_BOX_SIZE;
          const features = map.queryRenderedFeatures(
            [
              [e.point.x - HIT_BOX_SIZE, e.point.y - HIT_BOX_SIZE],
              [e.point.x + HIT_BOX_SIZE, e.point.y + HIT_BOX_SIZE]
            ],
            {layers: [layerManager.stationsLayerId, layerManager.railLayerId]}
          );
          
          if(features && features.length > 0) {
            console.log('[Info] スマホ版で駅/線路がタップされたため、出発地点登録はスキップします');
            return;
          }
        }
        
        origin = [e.lngLat.lng, e.lngLat.lat];
        setOriginMarker(origin);
        if(window.AppConfig.debug.enabled) {
          console.log('[DEBUG] origin set:', {lon: origin[0], lat: origin[1]});
        }
        
        layerManager.clearIsochrones();
        await computeIsochrones();
      });
    } catch (error) {
      console.error('[Error] Failed to initialize map:', error);
      loadingManager.setText('初期化エラー');
      await loadingManager.end(500);
    }
  });

})();
