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
  
  // === URL状態管理関数 ===
  /**
   * URLパラメータから初期状態を読み込む
   * 座標が maxBounds の範囲外の場合は null を返す
   */
  function loadStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    
    const lat = params.get('lat');
    const lng = params.get('lng');
    const time = params.get('time');
    
    // 座標の有効性をチェック（maxBounds の範囲内かどうか）
    let validLat = null;
    let validLng = null;
    
    if(lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      
      // maxBounds: [[西, 南], [東, 北]]
      // [[123.0, 20.4], [149.0, 48.5]]
      const maxBounds = window.AppConfig.map.maxBounds;
      const minLng = maxBounds[0][0];
      const minLat = maxBounds[0][1];
      const maxLng = maxBounds[1][0];
      const maxLat = maxBounds[1][1];
      
      // 範囲内かチェック
      if(parsedLng >= minLng && parsedLng <= maxLng && 
         parsedLat >= minLat && parsedLat <= maxLat) {
        validLat = parsedLat;
        validLng = parsedLng;
      } else {
        console.warn(`[Warning] URL座標 (${parsedLng}, ${parsedLat}) が範囲外です。デフォルト座標を使用します。`);
      }
    }
    
    return {
      lat: validLat,
      lng: validLng,
      time: time ? parseInt(time) : 60  // デフォルト60分
    };
  }
  
  /**
   * 現在の状態をURLに保存
   */
  function updateUrlWithState(originLngLat, timeMinutes) {
    if(!originLngLat) return;
    
    const params = new URLSearchParams();
    params.set('lat', originLngLat[1].toFixed(6));  // lat
    params.set('lng', originLngLat[0].toFixed(6));  // lng
    params.set('time', timeMinutes);
    
    window.history.replaceState({}, '', `?${params.toString()}`);
  }
  
  /**
   * 現在のURLをクリップボードにコピー
   */
  function copyUrlToClipboard() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('設定をコピーしました！リンクを共有してください。');
    }).catch((err) => {
      console.error('URLコピー失敗:', err);
      alert('コピーに失敗しました。');
    });
  }
  
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

  // === マウスコントローラーの明示的な有効化 ===
  // 右クリックメニュー実装後も、通常のドラッグが動作するよう保証
  map.dragPan.enable();
  map.touchZoomRotate.enable();
  
  // === 中ボタン（ホイール）ドラッグ実装 ===
  // MapLibreGLはネイティブに中ボタンドラッグをサポートしていないため、カスタム実装が必要
  const canvas = map.getCanvas();
  let isMiddleMousePressed = false;
  let middleMouseStartX = 0;
  let middleMouseStartY = 0;
  
  document.addEventListener('mousedown', (e) => {
    // 中ボタン（button = 1）が押された場合
    if(e.button === 1) {
      isMiddleMousePressed = true;
      middleMouseStartX = e.clientX;
      middleMouseStartY = e.clientY;
      // デフォルトの中ボタン動作（オートスクロール）を防止
      e.preventDefault();
      if(window.AppConfig.debug.enabled) {
        console.log('[DEBUG] Middle mouse button pressed at:', e.clientX, e.clientY);
      }
    }
  }, false);
  
  document.addEventListener('mousemove', (e) => {
    if(isMiddleMousePressed) {
      // 移動距離を計算
      const deltaX = e.clientX - middleMouseStartX;
      const deltaY = e.clientY - middleMouseStartY;
      
      // 移動があった場合、dragPanをプログラムで起動
      if(deltaX !== 0 || deltaY !== 0) {
        // MapLibreGLの内部メソッドを使用してパンを実行
        const mapCenter = map.getCenter();
        const zoom = map.getZoom();
        
        // ピクセルから地理座標への変換
        const newCenter = map.unproject({
          x: map.project(mapCenter).x - deltaX,
          y: map.project(mapCenter).y - deltaY
        });
        
        map.setCenter(newCenter);
        
        // 開始位置を更新（連続移動対応）
        middleMouseStartX = e.clientX;
        middleMouseStartY = e.clientY;
      }
    }
  }, false);
  
  document.addEventListener('mouseup', (e) => {
    if(e.button === 1) {
      isMiddleMousePressed = false;
      if(window.AppConfig.debug.enabled) {
        console.log('[DEBUG] Middle mouse button released');
      }
    }
  }, false);

  // === URLから初期状態を読み込み ===
  const urlState = loadStateFromUrl();
  
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
  let selectedTimeMinutes = urlState.time || 0;  // URLから読み込まれた時間、またはデフォルト値

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
      
      const [graph, railFC, stationFC, prefectureFC, townFC, airportFC] = await Promise.all([
        fetchJson(graphUrl),               // 3.3MB - キャッシュなし（容量大）
        fetchJson(config.data.rails),      // 14MB - キャッシュなし（容量大）
        fetchJson(stationUrl),             // 2.2MB - キャッシュなし（容量大）
        fetchJson('./geojson/prefecture.geojson'),
        fetchJson('./geojson/town.geojson'),
        fetchJson('./geojson/airport.geojson')
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
      loadingManager.setProgress(65);
      await layerManager.loadStationsWithData(stationFC, stations);
      loadingManager.setProgress(80);

      // 都道府県・市区町村ラベルレイヤを追加
      await layerManager.loadPrefectureAndTownLabels(prefectureFC, townFC);
      loadingManager.setProgress(85);

      // 空港レイヤを追加
      await layerManager.loadAirportsWithData(airportFC);
      loadingManager.setProgress(90);

      // 路線テキストラベルレイヤを追加
      layerManager.addRailLabels();

      // マウスオーバーポップアップを有効にする
      layerManager.enableHoverPopups();

      // スケールバーを追加
      layerManager.addScaleControl();
      
      // レイヤズームレベル範囲を初期化
      layerManager.initializeLayerZoomRanges();
      
      loadingManager.setProgress(95);

      // === 到達圏計算サービス ===
      const isochroneService = new IsochroneService(WALK_KMH, STEP_MIN, MAX_MIN);
      
      // ローディング完了
      loadingManager.setText('準備完了');
      await loadingManager.end(200);
      status('地図を読み込みました');

      // === 初期都市の中心を自動登録して到達圏を計算 ===
      // URLパラメータが指定されていれば、それを使用。なければ初期都市を使用
      if(urlState.lat !== null && urlState.lng !== null) {
        origin = [urlState.lng, urlState.lat];
        map.jumpTo({center: origin, zoom: map.getZoom()});
      } else {
        const initialCityData = config.cities[config.map.initialCity];
        origin = [initialCityData.lon, initialCityData.lat];
      }

      // === 出発地点マーカー設定 ===
      // ビーコン点滅アニメーション（灯台型：2秒周期で0.5秒間に2回点滅）
      let beaconAnimationId = null;
      function startBeaconAnimation(layerId, isLocked = false) {
        // 前のアニメーションをキャンセル
        if(beaconAnimationId) cancelAnimationFrame(beaconAnimationId);
        
        // ロック状態では点滅しない（固定色）
        if(isLocked) {
          if(map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'circle-color', '#9933ff'); // 紫色
          }
          return;
        }
        
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
            'circle-color': isIsochroneLocked ? '#9933ff' : '#ff0000',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff'
          },
          minzoom: 0,
          maxzoom: 24
        });
        
        // ビーコン点滅アニメーションを開始（ロック状態を反映）
        startBeaconAnimation('origin-marker-layer', isIsochroneLocked);
      }

      // === 到達圏計算実行 ===
      let isComputingIsochrones = false;  // 計算中フラグ
      let lastComputedOrigin = null;      // 最後に計算した出発地点
      let lastComputedTime = null;        // 最後に計算した時間
      let lastComputedStations = null;    // 最後に計算した最寄り駅キャッシュ
      
      async function computeIsochrones(skipCacheCheck = false) {
        if(!origin) {
          alert('地図をクリックして出発地点を指定してください');
          return;
        }

        if(isIsochroneLocked) {
          console.log('[Info] 到達圏が固定されているため、再計算はできません');
          return;
        }

        // 計算中の場合はスキップ（重複実行防止）
        if(isComputingIsochrones) {
          if(window.AppConfig.debug.enabled) {
            console.log('[DEBUG] 計算中のため、新しい計算リクエストをスキップします');
          }
          return;
        }

        // キャッシュチェック：出発地点と時間が変わっていない場合はスキップ
        if(!skipCacheCheck && lastComputedOrigin && lastComputedTime === selectedTimeMinutes) {
          const distToLastOrigin = Math.sqrt(
            Math.pow(origin[0] - lastComputedOrigin[0], 2) + 
            Math.pow(origin[1] - lastComputedOrigin[1], 2)
          );
          // 出発地点が0.001度（約111m）以内の移動の場合はスキップ
          if(distToLastOrigin < 0.001) {
            if(window.AppConfig.debug.enabled) {
              console.log('[DEBUG] キャッシュ使用：出発地点の変化が小さいため再計算をスキップ');
            }
            return;
          }
        }

        isComputingIsochrones = true;
        // 到達圏計算前に駅一覧を初期化
        uiController.clearStationTable();

        try {
          const walkSpeed = WALK_KMH * 1000 / 3600;
          
          // ユーザーが選択した時間を使用
          const maxTimeSeconds = selectedTimeMinutes * 60;
          
          // 距離制限を計算：1分あたり60m、最大10kmの制限を適用
          const maxDistanceM = Math.min(selectedTimeMinutes * 60, 10000);

          const nearestStations = isochroneService.findNearestStations(
            origin, 
            stations, 
            config.isochrone.nearestStationsMax,
            maxDistanceM
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

          // === Web メルカトル投影補正を適用 ===
          const correction = window.MercatorCorrection.calculateLatitudeCorrection(origin[1]);
          const expr = window.MercatorCorrection.generateFixedCorrectionExpression(correction);
          map.setPaintProperty('isochrones-heatmap-layer', 'heatmap-radius', expr);

          // 駅テーブル表示（開始地点を除外）
          const stationFeaturesForTable = allIsochroneFeatures.filter(f => !f.properties.is_origin);
          uiController.displayStationTable(stationFeaturesForTable);
          
          // キャッシュ更新：計算成功時のみ
          lastComputedOrigin = [origin[0], origin[1]];
          lastComputedTime = selectedTimeMinutes;
          lastComputedStations = nearestStations;
        } catch (error) {
          console.error('[Error] Failed to compute isochrones:', error);
          alert('到達圏の計算に失敗しました。');
        } finally {
          // 計算フラグをリセット
          isComputingIsochrones = false;
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
        
        status('リセットしました');
      }

      // === UI イベントハンドラ ===
      // (リセット、ロック機能は右クリックメニューで実装)
      
      // === 時間入力制御（スライダー＋ボタン） ===
      const timeSlider = id('timeSlider');
      const timeDisplay = id('timeDisplay');
      const timeDecreaseBtn = id('timeDecreaseBtn');
      const timeIncreaseBtn = id('timeIncreaseBtn');
      
      const MIN_MINUTES = 10;   // 最小値：10分
      const MAX_MINUTES = 720;  // 最大値：12時間
      const STEP_MINUTES = 10;  // スライダーステップ：10分
      
      /**
       * スライダー値を分に変換（10分単位）
       */
      function sliderToMinutes(sliderValue) {
        return parseInt(sliderValue) * STEP_MINUTES;
      }
      
      /**
       * 分をスライダー値に変換
       */
      function minutesToSlider(minutes) {
        return Math.round(minutes / STEP_MINUTES);
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
        minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, minutes));
        timeDisplay.textContent = minutesToDisplayText(minutes);
        selectedTimeMinutes = minutes;
        
        // スライダーを同期
        timeSlider.value = minutesToSlider(minutes);
        
        // ボタンの有効/無効を更新
        if(timeDecreaseBtn) {
          timeDecreaseBtn.disabled = minutes <= MIN_MINUTES;
        }
        if(timeIncreaseBtn) {
          timeIncreaseBtn.disabled = minutes >= MAX_MINUTES;
        }
        
        // URL状態を更新
        if(origin) {
          updateUrlWithState(origin, minutes);
        }
      }
      
      // スライダーイベント（10分単位）
      if(timeSlider) {
        // input イベント：表示だけ更新（スライダードラッグ中は計算しない）
        timeSlider.addEventListener('input', function() {
          const minutes = sliderToMinutes(this.value);
          updateTimeDisplay(minutes);
        });
        
        // change イベント：ドラッグ終了時に再解析を実行
        timeSlider.addEventListener('change', function() {
          const minutes = sliderToMinutes(this.value);
          if(origin && !isIsochroneLocked) {
            computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
          }
          status(`到達時間を ${minutesToDisplayText(minutes)} に変更しました`);
        });
      }
      
      // 減少ボタンイベント（1分単位で減少）
      if(timeDecreaseBtn) {
        timeDecreaseBtn.addEventListener('click', function() {
          const currentMinutes = selectedTimeMinutes;
          const newMinutes = Math.max(MIN_MINUTES, currentMinutes - 1);
          updateTimeDisplay(newMinutes);
          
          if(origin && !isIsochroneLocked) {
            computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
          }
          status(`到達時間を ${minutesToDisplayText(newMinutes)} に変更しました`);
        });
      }
      
      // 増加ボタンイベント（1分単位で増加）
      if(timeIncreaseBtn) {
        timeIncreaseBtn.addEventListener('click', function() {
          const currentMinutes = selectedTimeMinutes;
          const newMinutes = Math.min(MAX_MINUTES, currentMinutes + 1);
          updateTimeDisplay(newMinutes);
          
          if(origin && !isIsochroneLocked) {
            computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
          }
          status(`到達時間を ${minutesToDisplayText(newMinutes)} に変更しました`);
        });
      }
      
      // 初期値を設定（URLから読み込まれた値、またはデフォルトの1時間）
      updateTimeDisplay(urlState.time || 60);
      
      // === 共有ボタンイベント ===
      const shareBtn = id('shareBtn');
      if(shareBtn) {
        shareBtn.addEventListener('click', () => {
          if(!origin) {
            alert('地図をクリックして出発地点を指定してください。');
            return;
          }
          copyUrlToClipboard();
        });
      }
      
      // === 右クリックコンテキストメニュー実装 ===
      let contextMenu = null;
      
      // メニュー生成・表示の共通関数
      function showContextMenu(clientX, clientY) {
        // 既存メニューを削除
        if(contextMenu) {
          contextMenu.remove();
        }
        
        // メニュー項目を構築
        const menuItems = [];
        
        // リセットボタン
        menuItems.push({
          label: '到達圏をリセット',
          icon: '🔄',
          action: () => resetAll()
        });
        
        menuItems.push(null); // 分割線プレースホルダー
        
        // ロック/アンロック選択肢
        if(origin) {
          if(isIsochroneLocked) {
            menuItems.push({
              label: '固定を解除',
              icon: '🔓',
              action: () => {
                isIsochroneLocked = false;
                // マーカーの色を赤に戻し、点滅を再開
                if(map.getLayer('origin-marker-layer')) {
                  map.setPaintProperty('origin-marker-layer', 'circle-color', '#ff0000');
                  startBeaconAnimation('origin-marker-layer', false);
                }
                status('到達圏の固定を解除しました。');
              }
            });
          } else {
            menuItems.push({
              label: '到達圏を固定',
              icon: '🔒',
              action: () => {
                isIsochroneLocked = true;
                // マーカーの色を紫に、点滅を停止
                if(map.getLayer('origin-marker-layer')) {
                  map.setPaintProperty('origin-marker-layer', 'circle-color', '#9933ff');
                  startBeaconAnimation('origin-marker-layer', true);
                }
                status('到達圏を固定しました。');
              }
            });
          }
        }
        
        // メニューHTML生成
        let menuHTML = '<div style="background: white; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 10000; position: fixed;">';
        
        for(const item of menuItems) {
          if(item === null) {
            menuHTML += '<div style="height: 1px; background: #eee; margin: 4px 0;"></div>';
          } else {
            menuHTML += `
              <div class="contextMenuItem" style="padding: 10px 16px; cursor: pointer; user-select: none; white-space: nowrap; display: flex; align-items: center; gap: 8px;">
                <span>${item.icon}</span>
                <span>${item.label}</span>
              </div>
            `;
          }
        }
        menuHTML += '</div>';
        
        // DOM作成
        const div = document.createElement('div');
        div.innerHTML = menuHTML;
        contextMenu = div.firstChild;
        
        // 位置設定
        contextMenu.style.left = clientX + 'px';
        contextMenu.style.top = clientY + 'px';
        
        document.body.appendChild(contextMenu);
        
        // ホバースタイル設定（実際のメニュー項目のみ）
        const menuItems_el = contextMenu.querySelectorAll('.contextMenuItem');
        let itemIndex = 0;
        
        for(let i = 0; i < menuItems.length; i++) {
          if(menuItems[i] === null) continue; // 分割線スキップ
          
          const el = menuItems_el[itemIndex];
          const currentItem = menuItems[i];
          
          el.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f0f0f0';
          });
          el.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'transparent';
          });
          el.addEventListener('click', () => {
            currentItem.action();
            if(contextMenu) contextMenu.remove();
            contextMenu = null;
          });
          
          itemIndex++;
        }
      }
      
      map.on('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY);
      });
      
      // === 開始地点マーカーのタップ/クリック対応（スマホ版） ===
      map.on('click', 'origin-marker-layer', (e) => {
        // フラグを設定してマップクリックイベントをスキップ
        isOriginMarkerClickProcessing = true;
        
        if(e.originalEvent) {
          e.originalEvent.stopPropagation();
        }
        
        // メニューを表示（タップ位置またはマーカー位置に表示）
        const x = e.originalEvent ? e.originalEvent.clientX : window.innerWidth / 2;
        const y = e.originalEvent ? e.originalEvent.clientY : window.innerHeight / 2;
        showContextMenu(x, y);
      });
      
      // 別の場所クリック時にメニュー閉じる
      document.addEventListener('click', () => {
        if(contextMenu) {
          contextMenu.remove();
          contextMenu = null;
        }
      });
      
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
            updateUrlWithState(origin, selectedTimeMinutes);  // URL更新
            loadingManager.setProgress(70);
            
            layerManager.clearIsochrones();
            await computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
            
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
        updateUrlWithState(origin, selectedTimeMinutes);  // URL更新
        loadingManager.setProgress(70);
        
        layerManager.clearIsochrones();
        await computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
        
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
      await computeIsochrones(true);  // skipCacheCheck=true で初期計算も必ず実行

      // === Debounce関数の定義（マップ移動時の頻繁な再計算を防ぐ） ===
      function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
      }

      // ズーム状態を追跡
      let isMapZooming = false;
      
      // ズーム開始時にフラグを設定
      map.on('zoomstart', () => {
        isMapZooming = true;
      });

      // マップ移動時に到達圏を自動再計算する関数（ズーム中はスキップ）
      const debouncedRecomputeIsochrones = debounce(async () => {
        if(!origin || isIsochroneLocked || isMapZooming) {
          return;
        }
        
        try {
          if(window.AppConfig.debug.enabled) {
            console.log('[DEBUG] Map moved - Auto-recomputing isochrones for origin:', origin);
          }
          await computeIsochrones();
        } catch (error) {
          console.error('[Error] Failed to auto-recompute isochrones on map move:', error);
        }
      }, 800); // debounce遅延を800msに短縮（レスポンス改善）

      // マップの moveend イベントでヒートマップを再計算
      map.on('moveend', () => {
        isMapZooming = false;  // ズーム終了フラグをリセット
        debouncedRecomputeIsochrones();
      });

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
      let isOriginMarkerClickProcessing = false;
      map.on('click', async function(e) {
        // マーカークリックで処理中の場合はスキップ
        if(isOriginMarkerClickProcessing) {
          isOriginMarkerClickProcessing = false;
          return;
        }
        
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
        updateUrlWithState(origin, selectedTimeMinutes);  // URL更新
        if(window.AppConfig.debug.enabled) {
          console.log('[DEBUG] origin set:', {lon: origin[0], lat: origin[1]});
        }
        
        layerManager.clearIsochrones();
        await computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
        
        status(`地図上の地点を登録しました (${origin[0].toFixed(4)}, ${origin[1].toFixed(4)})`);
      });
    } catch (error) {
      console.error('[Error] Failed to initialize map:', error);
      loadingManager.setText('初期化エラー');
      await loadingManager.end(500);
    }
  });

})();
