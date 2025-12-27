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
  uiController.initHeatmapGradientUI();
  uiController.initCopyStationListButton();
  
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
    const locked = params.get('locked');  // 到達圏固定状態
    const gradient = params.get('gradient');  // ヒートマップグラデーション設定
    
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
      time: time ? parseInt(time) : 60,  // デフォルト60分
      locked: locked === 'true',  // 到達圏固定状態（デフォルトはfalse）
      gradient: gradient && (gradient === 'positive' || gradient === 'negative') ? gradient : 'positive'  // グラデーション設定
    };
  }
  
  /**
   * 現在の状態をURLに保存
   */
  function updateUrlWithState(originLngLat, timeMinutes, isLocked = false, gradientType = 'positive') {
    if(!originLngLat) return;
    
    const params = new URLSearchParams();
    params.set('lat', originLngLat[1].toFixed(6));  // lat
    params.set('lng', originLngLat[0].toFixed(6));  // lng
    params.set('time', timeMinutes);
    params.set('gradient', gradientType);  // グラデーション設定を保存
    if(isLocked) {
      params.set('locked', 'true');  // 固定状態を保存
    }
    
    window.history.replaceState({}, '', `?${params.toString()}`);
  }
  
  /**
   * 現在のURLをクリップボードにコピー
   * 到達圏の固定状態を選択するダイアログを表示
   */
  function copyUrlToClipboard() {
    const url = window.location.href;
    
    // ダイアログを表示して固定状態を選択
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 28px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      max-width: 380px;
      text-align: center;
      font-family: system-ui, -apple-system, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP';
    `;
    
    const title = document.createElement('h3');
    title.textContent = '🔗 リンクを共有';
    title.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    `;
    
    const description = document.createElement('p');
    description.textContent = '共有モードを選択してください';
    description.style.cssText = `
      margin: 0 0 24px 0;
      font-size: 14px;
      color: #666;
      line-height: 1.5;
    `;
    
    const optionsContainer = document.createElement('div');
    optionsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    
    // オプション1：編集モードON
    const option1 = document.createElement('div');
    option1.style.cssText = `
      display: flex;
      align-items: center;
      padding: 14px;
      border: 2px solid #d0d0d0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #f0f0f0;
    `;
    
    const radio1 = document.createElement('input');
    radio1.type = 'radio';
    radio1.name = 'share-option';
    radio1.value = 'dynamic';
    radio1.checked = true;
    radio1.style.cssText = `
      margin-right: 12px;
      cursor: pointer;
      width: 18px;
      height: 18px;
    `;
    
    const label1 = document.createElement('div');
    label1.style.cssText = `
      flex: 1;
      text-align: left;
    `;
    const label1Title = document.createElement('div');
    label1Title.textContent = '🕹️ 編集モードで共有';
    label1Title.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      color: #1a1a1a;
      margin-bottom: 2px;
    `;
    const label1Desc = document.createElement('div');
    label1Desc.textContent = '共有相手も出発地点を変更できます';
    label1Desc.style.cssText = `
      font-size: 12px;
      color: #888;
    `;
    label1.appendChild(label1Title);
    label1.appendChild(label1Desc);
    
    option1.appendChild(radio1);
    option1.appendChild(label1);
    
    // オプション2：固定
    const option2 = document.createElement('div');
    option2.style.cssText = `
      display: flex;
      align-items: center;
      padding: 14px;
      border: 2px solid #e8e8e8;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #fafafa;
    `;
    
    const radio2 = document.createElement('input');
    radio2.type = 'radio';
    radio2.name = 'share-option';
    radio2.value = 'fixed';
    radio2.style.cssText = `
      margin-right: 12px;
      cursor: pointer;
      width: 18px;
      height: 18px;
      accent-color: #0066cc;
    `;
    
    const label2 = document.createElement('div');
    label2.style.cssText = `
      flex: 1;
      text-align: left;
    `;
    const label2Title = document.createElement('div');
    label2Title.textContent = '🔒 固定モードで共有';
    label2Title.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      color: #1a1a1a;
      margin-bottom: 2px;
    `;
    const label2Desc = document.createElement('div');
    label2Desc.textContent = '共有相手は出発地点を変更できません';
    label2Desc.style.cssText = `
      font-size: 12px;
      color: #888;
    `;
    label2.appendChild(label2Title);
    label2.appendChild(label2Desc);
    
    option2.appendChild(radio2);
    option2.appendChild(label2);
    
    // スタイル定義
    // スタイル定義（共通化）
    const colorConfig = {
      selected: { border: '#0066cc', bg: '#f0f4ff', hoverBorder: '#0052a3', hoverBg: '#e8f2ff' },
      unselected: { border: '#e8e8e8', bg: '#fafafa', hoverBorder: '#d0d0d0', hoverBg: '#f5f5f5' }
    };
    
    const styles = {
      option1: colorConfig,
      option2: colorConfig
    };
    
    // スタイル適用関数（状態とホバー状態に応じて色を設定）
    function applyOptionStyle(option, radio, styleSet, isHover = false) {
      const state = radio.checked ? 'selected' : 'unselected';
      const color = styleSet[state];
      option.style.borderColor = isHover ? color.hoverBorder : color.border;
      option.style.background = isHover ? color.hoverBg : color.bg;
    }
    
    // 全オプションのスタイルを更新
    function updateAllOptionStyles() {
      applyOptionStyle(option1, radio1, styles.option1);
      applyOptionStyle(option2, radio2, styles.option2);
    }
    
    // option1のイベント
    option1.addEventListener('mouseenter', () => {
      applyOptionStyle(option1, radio1, styles.option1, true);
    });
    option1.addEventListener('mouseleave', () => {
      applyOptionStyle(option1, radio1, styles.option1, false);
    });
    option1.addEventListener('click', () => {
      radio1.checked = true;
      updateAllOptionStyles();
    });
    
    // option2のイベント
    option2.addEventListener('mouseenter', () => {
      applyOptionStyle(option2, radio2, styles.option2, true);
    });
    option2.addEventListener('mouseleave', () => {
      applyOptionStyle(option2, radio2, styles.option2, false);
    });
    option2.addEventListener('click', () => {
      radio2.checked = true;
      updateAllOptionStyles();
    });
    
    // 初期スタイルを設定
    updateAllOptionStyles();
    
    optionsContainer.appendChild(option1);
    optionsContainer.appendChild(option2);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 24px;
    `;
    
    // キャンセルボタン
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'キャンセル';
    btnCancel.style.cssText = `
      flex: 1;
      padding: 11px 16px;
      border: 1px solid #d0d0d0;
      background: white;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    btnCancel.addEventListener('mouseenter', function() {
      this.style.background = '#f8f8f8';
      this.style.borderColor = '#c0c0c0';
    });
    btnCancel.addEventListener('mouseleave', function() {
      this.style.background = 'white';
      this.style.borderColor = '#d0d0d0';
    });
    btnCancel.addEventListener('click', () => {
      dialog.remove();
    });
    
    // コピーボタン
    const btnCopy = document.createElement('button');
    btnCopy.textContent = 'リンクを共有';
    btnCopy.style.cssText = `
      flex: 1;
      padding: 11px 16px;
      border: none;
      background: #0066cc;
      color: white;
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    btnCopy.addEventListener('mouseenter', function() {
      this.style.background = '#0052a3';
    });
    btnCopy.addEventListener('mouseleave', function() {
      this.style.background = '#0066cc';
    });
    btnCopy.addEventListener('click', function() {
      // 選択されたオプションに基づいてURL生成
      const isFixed = radio2.checked;
      const params = new URLSearchParams();
      params.set('lat', url.split('lat=')[1]?.split('&')[0] || '');
      params.set('lng', url.split('lng=')[1]?.split('&')[0] || '');
      params.set('time', url.split('time=')[1]?.split('&')[0] || '60');
      params.set('gradient', layerManager.heatmapGradientType || 'positive');  // グラデーション設定を追加
      
      if(isFixed) {
        params.set('locked', 'true');
      }
      
      const shareUrl = window.location.origin + window.location.pathname + '?' + params.toString();
      
      navigator.clipboard.writeText(shareUrl).then(() => {
        const successMsg = isFixed 
          ? '固定状態のリンクをコピーしました ✓'
          : '編集可能なリンクをコピーしました ✓';
        alert(successMsg);
        dialog.remove();
      }).catch((err) => {
        console.error('URLコピー失敗:', err);
        alert('コピーに失敗しました。');
        dialog.remove();
      });
    });
    
    buttonContainer.appendChild(btnCancel);
    buttonContainer.appendChild(btnCopy);
    
    content.appendChild(title);
    content.appendChild(description);
    content.appendChild(optionsContainer);
    content.appendChild(buttonContainer);
    dialog.appendChild(content);
    
    // ダイアログ背景クリックで閉じる
    dialog.addEventListener('click', (e) => {
      if(e.target === dialog) {
        dialog.remove();
      }
    });
    
    document.body.appendChild(dialog);
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
  let isIsochroneLocked = urlState.locked || false;  // URLから読み込まれた固定状態
  const stationUrl = config.data.stations;
  const graphUrl = config.data.graph;
  
  const WALK_KMH = config.isochrone.walkKmh;
  const STEP_MIN = config.isochrone.stepMin;
  const MAX_MIN = config.isochrone.maxMin;
  
  // === グローバル時間設定 ===
  let selectedTimeMinutes = urlState.time || 0;  // URLから読み込まれた時間、またはデフォルト値

  // === レイヤマネージャー ===
  const layerManager = new MapLayerManager(map);
  uiController.setLayerManager(layerManager);
  
  // === URLから読み込んだグラデーション設定をUIと layerManager に反映 ===
  if(urlState.gradient) {
    layerManager.heatmapGradientType = urlState.gradient;
    // ラジオボタンを更新
    const gradientRadios = document.getElementsByName('heatmapGradient');
    gradientRadios.forEach(radio => {
      if(radio.value === urlState.gradient) {
        radio.checked = true;
      }
    });
  }

  // === グラデーション変更時のコールバック（URL自動更新） ===
  uiController.setOnGradientChange((gradientType) => {
    // 出発地点が設定されている場合のみURLを更新
    if(origin) {
      updateUrlWithState(origin, selectedTimeMinutes, isIsochroneLocked, gradientType);
    }
  });

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
      
      const [graph, railFC, stationFC, prefectureFC, townFC, airportFC, ferryFC] = await Promise.all([
        fetchJson(graphUrl),               // 3.3MB - キャッシュなし（容量大）
        fetchJson(config.data.rails),      // 14MB - キャッシュなし（容量大）
        fetchJson(stationUrl),             // 2.2MB - キャッシュなし（容量大）
        fetchJson('./geojson/prefecture.geojson'),
        fetchJson('./geojson/town.geojson'),
        fetchJson('./geojson/airport.geojson'),
        fetchJson('./geojson/ferry.geojson')
      ]);
      
      const dataLoadTime = (performance.now() - dataStartTime) / 1000;
      console.log(`[Perf] All data loaded in ${dataLoadTime.toFixed(2)}s (parallel)`);
      
      loadingManager.setProgress(40);

      // === グラフ形式判定と変換 ===
      // railway_graph_final.json形式: {nodes: [], edges: []}
      // station_graph.json形式: {nodeId: {connectedId: cost, ...}, ...} (隣接リスト)
      const nodes = new Map();
      const adj = new Map();
      
      if(graph.nodes && Array.isArray(graph.nodes)) {
        // 旧形式: nodes + edges 配列
        console.log('[Graph] Loading old format (nodes/edges arrays)');
        graph.nodes.forEach(n => {
          nodes.set(n.id, {name: n.name});
        });
        graph.edges.forEach(e => {
          if(!adj.has(e.from)) adj.set(e.from, []);
          adj.get(e.from).push({to: e.to, cost: e.cost});
          if(!adj.has(e.to)) adj.set(e.to, []);
          adj.get(e.to).push({to: e.from, cost: e.cost});
        });
      } else {
        // 新形式: 隣接リスト {nodeId: {connectedId: cost, ...}}
        console.log('[Graph] Loading new format (adjacency list)');
        // 隣接リストをそのまま adj Map に変換
        for(const nodeId in graph) {
          const nodeIdNum = Number(nodeId);
          nodes.set(nodeIdNum, {name: ''});  // 駅名はgeojsonから補填
          
          const adjacencies = graph[nodeId];
          const edges = [];
          for(const connectedId in adjacencies) {
            const cost = adjacencies[connectedId];
            edges.push({to: Number(connectedId), cost: cost});
          }
          adj.set(nodeIdNum, edges);
        }
      }

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
      loadingManager.setProgress(88);

      // フェリーレイヤを追加
      await layerManager.loadFerriesWithData(ferryFC);
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
            map.setPaintProperty(layerId, 'circle-color', '#1a1a1a');
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
            'circle-color': isIsochroneLocked ? '#1a1a1a' : '#ff0000',
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
      
      async function computeIsochrones(skipCacheCheck = false, isInitialComputation = false) {
        if(!origin) {
          alert('地図をクリックして出発地点を指定してください');
          return;
        }

        // ロック状態の場合、初期計算以外はスキップ
        if(isIsochroneLocked && !isInitialComputation) {
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
                remaining_cost_seconds: selectedTimeMinutes * 60,
                station_name: '開始地点',
                lat: origin[1],
                lon: origin[0]
              }
            };
            
            const selectedGradient = layerManager.heatmapGradientType || 'positive';
            layerManager.addIsochrones([originFeature], ['#ff0000'], STEP_MIN, selectedTimeMinutes, selectedGradient);
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
            
            const selectedGradient = layerManager.heatmapGradientType || 'positive';
            layerManager.addIsochrones([originFeature], originOnlyColors, STEP_MIN, selectedTimeMinutes, selectedGradient);
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

          // レイヤ追加（グラデーション設定を取得）
          const selectedGradient = layerManager.heatmapGradientType || 'positive';
          layerManager.addIsochrones(allIsochroneFeatures, colors, STEP_MIN, selectedTimeMinutes, selectedGradient);

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
      
      // === 時間入力制御（ドロップダウン） ===
      const hourSelect = id('hourSelect');
      const minuteSelect = id('minuteSelect');
      
      const MIN_MINUTES = 5;    // 最小値：5分
      const MAX_MINUTES = 720;  // 最大値：12時間
      
      let debounceTimer = null;
      const DEBOUNCE_DELAY = 500; // デバウンス遅延（ミリ秒）
      
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
       * 再計算処理（デバウンス付き）
       */
      function debouncedCompute() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if(origin && !isIsochroneLocked) {
            computeIsochrones(true);  // skipCacheCheck=true で必ず再計算
          }
        }, DEBOUNCE_DELAY);
      }
      
      /**
       * 時間表示を更新
       */
      function updateTimeDisplay(minutes) {
        minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, minutes));
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        // ドロップダウンを更新
        if(hourSelect) {
          hourSelect.value = hours;
        }
        if(minuteSelect) {
          minuteSelect.value = mins;
        }
        
        selectedTimeMinutes = minutes;
        
        // コピーボタンをリセット
        uiController.resetCopyStationListBtn();
        
        // URL状態を更新（固定状態も含める）
        if(origin) {
          updateUrlWithState(origin, minutes, isIsochroneLocked, layerManager.heatmapGradientType);
        }
      }
      
      // 時間選択変更イベント
      if(hourSelect) {
        hourSelect.addEventListener('change', function() {
          const hours = parseInt(hourSelect.value, 10);
          const minutes = parseInt(minuteSelect.value, 10);
          const totalMinutes = hours * 60 + minutes;
          
          // 最小値チェック（5分未満は5分に、12時間超は12時間に）
          let finalMinutes = totalMinutes;
          if(finalMinutes < MIN_MINUTES) {
            finalMinutes = MIN_MINUTES;
            updateTimeDisplay(finalMinutes);
          } else if(finalMinutes > MAX_MINUTES) {
            finalMinutes = MAX_MINUTES;
            updateTimeDisplay(finalMinutes);
          }
          
          selectedTimeMinutes = finalMinutes;
          updateUrlWithState(origin, finalMinutes, isIsochroneLocked, layerManager.heatmapGradientType);
          debouncedCompute();
          status(`到達時間を ${minutesToDisplayText(finalMinutes)} に変更しました`);
        });
      }
      
      // 分選択変更イベント
      if(minuteSelect) {
        minuteSelect.addEventListener('change', function() {
          const hours = parseInt(hourSelect.value, 10);
          const minutes = parseInt(minuteSelect.value, 10);
          const totalMinutes = hours * 60 + minutes;
          
          // 最小値チェック（5分未満は5分に、12時間超は12時間に）
          let finalMinutes = totalMinutes;
          if(finalMinutes < MIN_MINUTES) {
            finalMinutes = MIN_MINUTES;
            updateTimeDisplay(finalMinutes);
          } else if(finalMinutes > MAX_MINUTES) {
            finalMinutes = MAX_MINUTES;
            updateTimeDisplay(finalMinutes);
          }
          
          selectedTimeMinutes = finalMinutes;
          updateUrlWithState(origin, finalMinutes, isIsochroneLocked, layerManager.heatmapGradientType);
          debouncedCompute();
          status(`到達時間を ${minutesToDisplayText(finalMinutes)} に変更しました`);
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
          label: 'リセット',
          description: '到達圏をクリア',
          icon: '🔄',
          action: () => resetAll(),
          color: '#ff6b6b'
        });
        
        menuItems.push(null); // 分割線プレースホルダー
        
        // ロック/アンロック選択肢
        if(origin) {
          if(isIsochroneLocked) {
            menuItems.push({
              label: '固定モード OFF',
              description: '編集をアンロックします',
              icon: '🔓',
              action: () => {
                isIsochroneLocked = false;
                // マーカーの色を赤に戻し、点滅を再開
                if(map.getLayer('origin-marker-layer')) {
                  map.setPaintProperty('origin-marker-layer', 'circle-color', '#ff0000');
                  startBeaconAnimation('origin-marker-layer', false);
                }
                // URLを更新（locked パラメータを削除）
                if(origin) {
                  updateUrlWithState(origin, selectedTimeMinutes, false);
                }
                status('到達圏の固定を解除しました。');
              },
              color: '#4ecdc4'
            });
          } else {
            menuItems.push({
              label: '固定モード ON',
              description: '編集をロックします',
              icon: '🔒',
              action: () => {
                isIsochroneLocked = true;
                // マーカーの色を黒に、点滅を停止
                if(map.getLayer('origin-marker-layer')) {
                  map.setPaintProperty('origin-marker-layer', 'circle-color', '#1a1a1a');
                  startBeaconAnimation('origin-marker-layer', true);
                }
                // URLを更新（locked パラメータを追加）
                if(origin) {
                  updateUrlWithState(origin, selectedTimeMinutes, true, layerManager.heatmapGradientType);
                }
                status('到達圏を固定しました。');
              },
              color: '#1a1a1a'
            });
          }
        }
        
        // メニューコンテナ生成
        const menuContainer = document.createElement('div');
        menuContainer.style.cssText = `
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          overflow: hidden;
          z-index: 10000;
          position: fixed;
          min-width: 200px;
          font-family: system-ui, -apple-system, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP';
        `;
        
        // メニュー項目を生成
        for(let i = 0; i < menuItems.length; i++) {
          const item = menuItems[i];
          
          if(item === null) {
            // 分割線
            const divider = document.createElement('div');
            divider.style.cssText = `
              height: 1px;
              background: #f0f0f0;
              margin: 6px 0;
            `;
            menuContainer.appendChild(divider);
          } else {
            // メニューアイテム
            const itemEl = document.createElement('div');
            itemEl.style.cssText = `
              padding: 12px 16px;
              cursor: pointer;
              user-select: none;
              display: flex;
              align-items: center;
              gap: 12px;
              transition: all 0.15s ease;
              border-left: 3px solid transparent;
            `;
            
            const iconEl = document.createElement('span');
            iconEl.textContent = item.icon;
            iconEl.style.cssText = `
              font-size: 16px;
            `;
            
            const textEl = document.createElement('div');
            textEl.style.cssText = `
              flex: 1;
            `;
            
            const labelEl = document.createElement('div');
            labelEl.textContent = item.label;
            labelEl.style.cssText = `
              font-weight: 500;
              font-size: 14px;
              color: #1a1a1a;
            `;
            
            const descEl = document.createElement('div');
            descEl.textContent = item.description;
            descEl.style.cssText = `
              font-size: 12px;
              color: #999;
              margin-top: 2px;
            `;
            
            textEl.appendChild(labelEl);
            textEl.appendChild(descEl);
            
            itemEl.appendChild(iconEl);
            itemEl.appendChild(textEl);
            
            // ホバー効果
            itemEl.addEventListener('mouseenter', function() {
              this.style.backgroundColor = item.color + '15';  // 色を薄くしたバージョン
              this.style.borderLeftColor = item.color;
            });
            itemEl.addEventListener('mouseleave', function() {
              this.style.backgroundColor = 'transparent';
              this.style.borderLeftColor = 'transparent';
            });
            itemEl.addEventListener('click', () => {
              item.action();
              if(contextMenu) contextMenu.remove();
              contextMenu = null;
            });
            
            menuContainer.appendChild(itemEl);
          }
        }
        
        // 位置設定（画面の外に出ないように調整）
        menuContainer.style.left = clientX + 'px';
        menuContainer.style.top = clientY + 'px';
        
        document.body.appendChild(menuContainer);
        contextMenu = menuContainer;
        
        // メニューが画面外に出ないように調整
        setTimeout(() => {
          const rect = menuContainer.getBoundingClientRect();
          if(rect.right > window.innerWidth) {
            menuContainer.style.left = (clientX - rect.width) + 'px';
          }
          if(rect.bottom > window.innerHeight) {
            menuContainer.style.top = (clientY - rect.height) + 'px';
          }
        }, 0);
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
            isIsochroneLocked = false;  // 新しい地点を選択したので、固定状態をリセット
            setOriginMarker(origin);
            updateUrlWithState(origin, selectedTimeMinutes, false);  // URL更新
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
        isIsochroneLocked = false;  // 新しい地点を選択したので、固定状態をリセット
        setOriginMarker(origin);
        updateUrlWithState(origin, selectedTimeMinutes, false, layerManager.heatmapGradientType);  // URL更新
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
      // 初期計算フラグを指定（URLから固定状態を読み込んだ場合も計算を実行）
      await computeIsochrones(true, true);  // skipCacheCheck=true, isInitialComputation=true

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
            const popup = new maplibregl.Popup({ anchor: 'bottom' })
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
        isIsochroneLocked = false;  // 新しい地点をクリックしたので、固定状態をリセット
        setOriginMarker(origin);
        updateUrlWithState(origin, selectedTimeMinutes, false, layerManager.heatmapGradientType);  // URL更新
        uiController.resetCopyStationListBtn();  // コピーボタンをリセット
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
