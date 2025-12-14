// assets/main.js
// MaplibreGL を使用した到達圏マップ - メイン制御ロジック
// 
// アーキテクチャ：
//   - config.js: 設定・定数管理
//   - ui-controller.js: UI操作・イベント管理
//   - isochrone-service.js: 到達圏計算ロジック
//   - dijkstra.js: 最短経路アルゴリズム
//   - map-layers.js: MaplibreGL レイヤ管理
//   - utils.js: ユーティリティ関数
//   - address-search.js: 住所検索機能

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
    maxBounds: config.map.maxBounds,
    pitch: 0,
    bearing: 0,
    renderWorldCopies: false
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
  
  // === グローバル時間設定 ===
  let selectedTimeMinutes = 0;  // ユーザーが選択した時間（分）

  // === レイヤマネージャー ===
  const layerManager = new MapLayerManager(map);

  // === ズーム表示更新 ===
  function updateZoomDisplay() {
    const zl = document.getElementById('zoomLevel');
    if(zl) zl.textContent = String(map.getZoom().toFixed(1));
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
      loadingManager.setText('データを読み込み中...');
      loadingManager.setProgress(20);

      // === 最適化: 全データを並列読み込み ===
      // network graph + geojson を並列で取得（直列の30～40%高速化）
      // 注: 大容量ファイル（graph, rails, stations）はキャッシュせず、
      //     常にネットワークから取得（gzip圧縮による高速化）
      //     localStorage容量の制限を回避し、常に最新データを保証
      const dataStartTime = performance.now();
      
      const [graph, railFC, stationFC] = await Promise.all([
        fetchJson(graphUrl),               // 3.3MB - キャッシュなし（容量大）
        fetchJson(config.data.rails),      // 14MB - キャッシュなし（容量大）
        fetchJson(stationUrl)              // 2.2MB - キャッシュなし（容量大）
      ]);
      
      const dataLoadTime = (performance.now() - dataStartTime) / 1000;
      console.log(`[Perf] All data loaded in ${dataLoadTime.toFixed(2)}s (parallel)`);
      
      loadingManager.setProgress(40);

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

      // 駅・線路データ処理
      loadingManager.setText('地図データを処理中...');
      loadingManager.setProgress(50);
      const stations = {};
      await layerManager.loadRailsWithData(railFC);
      loadingManager.setProgress(70);
      await layerManager.loadStationsWithData(stationFC, stations);
      loadingManager.setProgress(85);

      // 路線テキストラベルレイヤを追加
      layerManager.addRailLabels();

      // マウスオーバーポップアップを有効にする
      layerManager.enableHoverPopups();
      
      loadingManager.setProgress(95);

      // === 到達圏計算サービス ===
      const isochroneService = new IsochroneService(WALK_KMH, STEP_MIN, MAX_MIN);
      
      // ローディング完了
      loadingManager.setText('準備完了');
      await loadingManager.end(200);
      status('地図を読み込みました');

      // === 初期都市の中心を自動登録して到達圏を計算 ===
      const initialCityData = config.cities[config.map.initialCity];
      origin = [initialCityData.lon, initialCityData.lat];

      // === 出発地点マーカー設定 ===
      // ビーコン点滅アニメーション（灯台型：2秒周期で0.5秒間に2回点滅）
      let beaconAnimationId = null;
      function startBeaconAnimation(layerId) {
        // 前のアニメーションをキャンセル
        if(beaconAnimationId) cancelAnimationFrame(beaconAnimationId);
        
        let elapsedTime = 0;  // ミリ秒単位での経過時間
        const cycleDuration = 2500;  // 2.5秒周期
        const flashDuration = 1000;   // 1秒間点滅
        const flashCount = 2;        // 1秒間に2回点滅
        
        const animateBeacon = (timestamp) => {
          if(!startTime) startTime = timestamp;
          elapsedTime = (timestamp - startTime) % cycleDuration;
          
          if(map.getLayer(layerId)) {
            let color;
            
            if(elapsedTime < flashDuration) {
              // 点滅フェーズ（0.5秒間に2回点滅）
              const flashProgress = (elapsedTime / flashDuration);
              // 三角波を2回繰り返す (0->1->0->1->0)
              let doubleFlash = (flashProgress * flashCount) % 1;
              let pulseValue = doubleFlash < 0.5 
                ? doubleFlash * 2 
                : (1 - doubleFlash) * 2;
              
              const r = 255;
              const g = Math.round(0 + (204 * pulseValue));
              const b = Math.round(0 + (204 * pulseValue));
              color = `rgb(${r}, ${g}, ${b})`;
            } else {
              // 消灯フェーズ（1.5秒間）: 赤色のまま
              color = '#ff0000';
            }
            
            map.setPaintProperty(layerId, 'circle-color', color);
          }
          
          beaconAnimationId = requestAnimationFrame(animateBeacon);
        };
        
        let startTime = null;
        animateBeacon(performance.now());
      }
      
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
        
        // ビーコン点滅アニメーションを開始
        startBeaconAnimation('origin-marker-layer');
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
          
          // ユーザーが選択した時間を使用
          const maxTimeSeconds = selectedTimeMinutes * 60;

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
            
            layerManager.addIsochrones([originFeature], ['#ff0000'], STEP_MIN, selectedTimeMinutes);
            // テーブルには開始地点を表示しない（空配列）
            uiController.displayStationTable([]);
            return;
          }
          
          // 複数駅から Dijkstra を実行して結果を統合
          const mergedCosts = isochroneService.computeMergedCosts(
            adj, 
            nodes, 
            nearestStations, 
            walkSpeed,
            maxTimeSeconds  // ユーザーが選択した時間を渡す
          );
          
          // Dijkstra計算が失敗した場合は開始地点のみで表示
          if(Object.keys(mergedCosts).length === 0) {
            // 開始地点のみのシンプルなカラー配列を生成
            const originOnlyColors = ['#FF6B6B'];  // 赤系
            
            const originFeature = {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [origin[0], origin[1]]
              },
              properties: {
                time_minutes: 0,
                time_step: 1,
                color: originOnlyColors[0],
                station_id: -1,
                station_name: '開始地点',
                line: '',
                company: '',
                cost_seconds: 0,
                remaining_cost_seconds: selectedTimeMinutes * 60,
                max_seconds: selectedTimeMinutes * 60,
                is_origin: true
              }
            };
            
            layerManager.addIsochrones([originFeature], originOnlyColors, STEP_MIN, selectedTimeMinutes);
            // テーブルには開始地点を表示しない（空配列）
            uiController.displayStationTable([]);
            
            if(window.AppConfig.debug.enabled) {
              console.log('[DEBUG] Dijkstra calculation returned no results, displaying origin only');
            }
            return;
          }
          
          isochroneService.buildDebugTable(mergedCosts, stations);

          // 到達圏フィーチャ生成
          const { features: allIsochroneFeatures, colors } = isochroneService.generateIsochroneFeatures(
            mergedCosts, 
            stations,
            selectedTimeMinutes  // ユーザーが選択した時間を渡す
          );

          // === 開始地点をフィーチャとして追加 ===
          // 到達コスト: 0秒
          // 残り時間: 設定時間全量
          const originFeature = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [origin[0], origin[1]]
            },
            properties: {
              time_minutes: 0,
              time_step: 1,
              color: colors[0],  // 最初の色を使用
              station_id: -1,  // 開始地点は特別なID
              station_name: '開始地点',
              line: '',
              company: '',
              cost_seconds: 0,
              remaining_cost_seconds: selectedTimeMinutes * 60,
              max_seconds: selectedTimeMinutes * 60,
              is_origin: true  // 開始地点フラグ
            }
          };
          
          // 開始地点をフィーチャの先頭に追加
          allIsochroneFeatures.unshift(originFeature);

          if(window.AppConfig.debug.enabled) {
            console.log(`[DEBUG] Generated ${allIsochroneFeatures.length} isochrone point features from ${nearestStations.length} nodes (including origin)`);
          }

          // レイヤ追加
          layerManager.addIsochrones(allIsochroneFeatures, colors, STEP_MIN, selectedTimeMinutes);

          // 駅テーブル表示（開始地点を除外）
          const stationFeaturesForTable = allIsochroneFeatures.filter(f => !f.properties.is_origin);
          uiController.displayStationTable(stationFeaturesForTable);
          
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
        
        uiController.clearStationTable();
        uiController.setLockButtonsVisibility(false);
        
        status('リセットしました');
      }

      // === UI イベントハンドラ ===
      id('resetBtn').addEventListener('click', resetAll);
      
      // === 時間入力イベントハンドラ ===
      const timeSlider = id('timeSlider');
      const timeDisplay = id('timeDisplay');
      
      /**
       * スライダー値を分に変換（5分単位）
       */
      function sliderToMinutes(sliderValue) {
        return parseInt(sliderValue) * 5;
      }
      
      /**
       * 分をスライダー値に変換
       */
      function minutesToSlider(minutes) {
        return Math.round(minutes / 5);
      }
      
      /**
       * 分を表示形式に変換
       */
      function minutesToDisplayText(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if(hours === 0) {
          return mins + '分';
        } else if(mins === 0) {
          return hours + '時間';
        } else {
          return `${hours}時間${String(mins).padStart(2, '0')}分`;
        }
      }
      
      /**
       * 時間表示を更新
       */
      function updateTimeDisplay(minutes) {
        minutes = Math.max(0, Math.min(720, minutes));
        timeDisplay.textContent = minutesToDisplayText(minutes);
        selectedTimeMinutes = minutes;
      }
      
      /**
       * 表示テキストを分に変換
       */
      function parseDisplayText(text) {
        let minutes = 0;
        
        // "時間"と"分"を抽出
        const hourMatch = text.match(/(\d+)\s*時間/);
        const minMatch = text.match(/(\d+)\s*分/);
        
        if(hourMatch) {
          minutes += parseInt(hourMatch[1]) * 60;
        }
        if(minMatch) {
          minutes += parseInt(minMatch[1]);
        }
        
        return Math.max(0, Math.min(720, minutes));
      }
      
      // スライダーイベント（5分単位）
      // input イベント：表示だけ更新（スライダードラッグ中は計算しない）
      if(timeSlider) {
        timeSlider.addEventListener('input', function() {
          const minutes = sliderToMinutes(this.value);
          updateTimeDisplay(minutes);
        });
        
        // change イベント：ドラッグ終了時に再解析を実行
        timeSlider.addEventListener('change', function() {
          if(origin) {
            computeIsochrones();
          }
          const minutes = sliderToMinutes(this.value);
          status(`到達時間を ${minutesToDisplayText(minutes)} に変更しました`);
        });
      }
      
      // timeDisplay編集イベント（contenteditable）
      if(timeDisplay) {
        timeDisplay.addEventListener('blur', function() {
          const minutes = parseDisplayText(this.textContent);
          // スライダーを同期（5分単位に丸める）
          timeSlider.value = minutesToSlider(minutes);
          updateTimeDisplay(minutes);
          // 時間設定が変更されたら、現在の出発地点で再解析を実行
          if(origin) {
            computeIsochrones();
          }
          status(`到達時間を ${minutesToDisplayText(minutes)} に変更しました`);
        });
        
        // Enterキーで確定
        timeDisplay.addEventListener('keypress', function(e) {
          if(e.key === 'Enter') {
            e.preventDefault();
            this.blur();
          }
        });
      }
      
      // 初期値を1時間（60分）に設定
      updateTimeDisplay(60);
      
      // 到達圏固定ボタン
      const lockBtn = id('lockBtn');
      if(lockBtn) {
        lockBtn.addEventListener('click', function() {
          isIsochroneLocked = true;
          uiController.setLockButtonsVisibility(true);
          status('到達圏を固定しました。');
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
        citySelectEl.addEventListener('change', async function() {
          const cityKey = this.value;
          if(cityKey && config.cities[cityKey]) {
            const city = config.cities[cityKey];
            loadingManager.start('都市を読み込み中...');
            loadingManager.setProgress(30);
            const dynamicZoom = config.calculateDynamicZoom();
            map.jumpTo({center: [city.lon, city.lat], zoom: dynamicZoom});
            loadingManager.setProgress(50);
            
            // 都市中心を出発地点として登録し、到達圏を計算
            origin = [city.lon, city.lat];
            setOriginMarker(origin);
            loadingManager.setProgress(70);
            
            layerManager.clearIsochrones();
            await computeIsochrones();
            
            loadingManager.setProgress(95);
            loadingManager.end(200);
            
            status(`${city.name} を選択しました`);
            
            // 住所検索のクリア
            if(window.addressSearchUI) {
              window.addressSearchUI.clear();
            }
          }
        });
      }

      // === 住所検索イベントハンドラ ===
      document.addEventListener('addressLocationSelected', async (e) => {
        const { lat, lon, name } = e.detail;
        
        loadingManager.start('位置を読み込み中...');
        loadingManager.setProgress(30);
        
        // マップをズーム・移動
        const dynamicZoom = config.calculateDynamicZoom();
        map.jumpTo({center: [lon, lat], zoom: dynamicZoom});
        loadingManager.setProgress(50);
        
        // 出発地点として登録し、到達圏を計算
        origin = [lon, lat];
        setOriginMarker(origin);
        loadingManager.setProgress(70);
        
        layerManager.clearIsochrones();
        await computeIsochrones();
        
        loadingManager.setProgress(95);
        loadingManager.end(200);
        
        status(`${name} を登録しました`);
        
        // 都市選択をクリア
        if(citySelectEl) {
          citySelectEl.value = '';
        }
      });

      // === 初期都市の到達圏を計算 ===
      setOriginMarker(origin);
      await computeIsochrones();

      // === 駅テーブル行のクリックハンドラ ===
      uiController.setStationTableRowClickHandler((stationLon, stationLat, stationName) => {
        map.flyTo({
          center: [stationLon, stationLat],
          duration: 500
        });
        
        // 開始地点の場合は特別処理（駅レイヤにないため）
        if(stationName === '開始地点') {
          map.once('moveend', function() {
            if(layerManager.currentPopup) {
              layerManager.currentPopup.remove();
              layerManager.currentPopup = null;
            }
            // 開始地点用のシンプルなポップアップ
            const popup = new maplibregl.Popup()
              .setLngLat([stationLon, stationLat])
              .setHTML('<div style="padding: 8px;"><strong>開始地点</strong><br/>到達コスト: 0分</div>')
              .addTo(map);
            layerManager.currentPopup = popup;
          });
          return;
        }
        
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
        
        // スマホ版：駅がタップされた場合は出発地点登録をスキップ（ポップアップ表示のため）
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if(isMobile) {
          const HIT_BOX_SIZE = layerManager.HIT_BOX_SIZE;
          const features = map.queryRenderedFeatures(
            [
              [e.point.x - HIT_BOX_SIZE, e.point.y - HIT_BOX_SIZE],
              [e.point.x + HIT_BOX_SIZE, e.point.y + HIT_BOX_SIZE]
            ],
            {layers: [layerManager.stationsLayerId]}
          );
          
          if(features && features.length > 0) {
            console.log('[Info] スマホ版で駅がタップされたため、出発地点登録はスキップします');
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
        
        status(`地図上の地点を登録しました (${origin[0].toFixed(4)}, ${origin[1].toFixed(4)})`);
      });
    } catch (error) {
      console.error('[Error] Failed to initialize map:', error);
      loadingManager.setText('初期化エラー');
      await loadingManager.end(500);
    }
  });

})();
