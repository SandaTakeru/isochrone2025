// assets/main.js
// MaplibreGL を使用した到達圏マップ - メイン制御

// メイン処理
(async function(){
  
  // 日本の主要都市座標
  const cities = {
    sapporo: {name: '札幌市', lat: 43.0642, lon: 141.3469, zoom: 13},
    sendai: {name: '仙台市', lat: 38.2688, lon: 140.8694, zoom: 13},
    tokyo: {name: '東京都', lat: 35.6895, lon: 139.6917, zoom: 12},
    yokohama: {name: '横浜市', lat: 35.4437, lon: 139.6380, zoom: 13},
    nagoya: {name: '名古屋市', lat: 35.1815, lon: 136.9066, zoom: 13},
    osaka: {name: '大阪市', lat: 34.6937, lon: 135.5023, zoom: 13},
    kobe: {name: '神戸市', lat: 34.6901, lon: 135.1955, zoom: 13},
    kyoto: {name: '京都市', lat: 35.0116, lon: 135.7681, zoom: 13},
    fukuoka: {name: '福岡市', lat: 33.5904, lon: 130.4017, zoom: 13}
  };
  
  const initialCity = cities.sapporo;
  const initialCenter = {lng: initialCity.lon, lat: initialCity.lat};
  const initialZoom = initialCity.zoom;
  
  // MaplibreGL マップの初期化
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        gsi: {
          type: 'raster',
          tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>'
        }
      },
      layers: [
        {
          id: 'gsi-base',
          type: 'raster',
          source: 'gsi',
          minzoom: 0,
          maxzoom: 18
        }
      ]
    },
    center: initialCenter,
    zoom: initialZoom,
    minZoom: 6,
    maxZoom: 18,
    pitch: 0,
    bearing: 0
  });
  
  console.log('[Init] Map initialized successfully');

  // グローバル状態
  let origin = null;
  let originMarkerSource = null;
  let isIsochroneLocked = false; // 到達圏が固定されているかどうか
  const stationUrl = './geojson/station.geojson';
  const graphUrl = './railway_graph_final.json';

  // 定数
  const WALK_KMH = 4.8 / Math.sqrt(2);
  const STEP_MIN = 5;
  const MAX_MIN = 120;

  // デバッグモード
  const DEBUG_FROM_URL = (new URLSearchParams(location.search).get('debug') || '') === '1' || (new URLSearchParams(location.search).get('debug') || '') === 'true';
  let DEBUG = DEBUG_FROM_URL;

  // レイヤマネージャー初期化
  const layerManager = new MapLayerManager(map);

  // ズーム表示更新
  function updateZoomDisplay() {
    const zl = document.getElementById('zoomLevel');
    if(zl) zl.textContent = String(Math.round(map.getZoom()));
    layerManager.updateLayersByZoom();
  }

  map.on('zoom', updateZoomDisplay);
  
  // マップ読み込み完了後の処理
  map.on('load', async () => {
    updateZoomDisplay();

    // データ読み込み
    status('ネットワークデータを読み込み中...');
    const graph = await fetchJson(graphUrl);
    status('ネットワークデータ読み込み完了。');

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
    const stations = {};
    await layerManager.loadRails('./geojson/rail.geojson');
    await layerManager.loadStations(stationUrl, stations);

    // マウスオーバーポップアップを有効にする
    layerManager.enableHoverPopups();

    // 到達圏計算
    const isochroneCalc = new IsochroneCalculator(WALK_KMH, STEP_MIN, MAX_MIN);
    isochroneCalc.setDebug(DEBUG);

    // 出発地点マーカー設定
    function setOriginMarker(originLonLat) {
      // 既存のマーカーソースがあれば削除
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
          properties: {name: '出発地点'}
        }
      };
      
      map.addSource('origin-marker', originMarkerSource);
      
      map.addLayer({
        id: 'origin-marker-layer',
        type: 'circle',
        source: 'origin-marker',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ff0000',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        },
        minzoom: 0,
        maxzoom: 24
      });
      
      // 出発地点情報表示
      const originInfoEl = id('originInfo');
      const originCoordsEl = id('originCoords');
      const originStationEl = id('originStation');
      
      if(originInfoEl && originCoordsEl && originStationEl) {
        originInfoEl.style.display = 'block';
        originCoordsEl.textContent = `[${originLonLat[1].toFixed(6)}, ${originLonLat[0].toFixed(6)}]`;
        originStationEl.textContent = '';
      }
    }

    // 到達圏計算実行
    async function computeIsochrones() {
      if(!origin) {
        alert('地図をクリックして出発地点を指定してください');
        return;
      }

      // 到達圏が固定されている場合は再計算しない
      if(isIsochroneLocked) {
        console.log('[Info] 到達圏が固定されているため、再計算はできません');
        return;
      }
      
      const walkSpeed = WALK_KMH * 1000 / 3600;
      status('最短経路計算を実行中...');

      // 最寄り駅を複数取得（最大10件）
      const nearestStations = isochroneCalc.findNearestStations(origin, stations, 10);
      
      if(!nearestStations || nearestStations.length === 0) {
        // ノードが見つからない場合：開始地点を1点の駅として表現
        status('ネットワーク外のため、開始地点のみを表示します');
        
        // 開始地点を1つの駅フィーチャとして生成
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
        
        // マップに追加
        layerManager.addIsochrones([originFeature], ['#ff0000'], STEP_MIN, MAX_MIN);
        
        // 駅テーブル表示（1件のみ）
        displayStationTable([originFeature]);
        status('完了');
        return;
      }
      
      status(`最寄りノード${nearestStations.length}件から統合解析中...`);
      
      // 各ノードからのDijkstra計算を実施して結果を統合
      // 各駅に対して、すべてのノードから到達した中での最小コストを採用
      const mergedCosts = {};
      const maxSeconds = MAX_MIN * 60;
      const nodeResults = [];
      
      for(const candidate of nearestStations) {
        const { nodeId, distM } = candidate;
        const walkSecToNode = distM / walkSpeed;
        const stationInitial = {};
        stationInitial[Number(nodeId)] = walkSecToNode;
        
        // Dijkstra計算
        const costs = dijkstraVirtualAdj(adj, nodes, stationInitial);
        nodeResults.push({ nodeId, distM, costs });
        
        // 各駅のコストを比較して最小値を保持
        for(const sid in costs) {
          if(costs[sid] !== undefined && costs[sid] <= maxSeconds) {
            if(mergedCosts[sid] === undefined || costs[sid] < mergedCosts[sid]) {
              mergedCosts[sid] = costs[sid];
            }
          }
        }
      }
      
      if(Object.keys(mergedCosts).length === 0) {
        alert('到達圏の計算に失敗しました。');
        return;
      }
      
      status(`${nearestStations.length}ノードから統合解析完了`);
      
      if(DEBUG) {
        isochroneCalc.buildDebugTable(mergedCosts, stations);
      }

      // 到達圏フィーチャ生成
      const { features: allIsochroneFeatures, colors } = isochroneCalc.generateIsochroneFeatures(mergedCosts, stations);

      if(DEBUG) console.log(`[DEBUG] Generated ${allIsochroneFeatures.length} isochrone point features from ${nearestStations.length} nodes`);

      // レイヤ追加
      layerManager.addIsochrones(allIsochroneFeatures, colors, STEP_MIN, MAX_MIN);

      // 駅テーブル表示
      displayStationTable(allIsochroneFeatures);
      
      // 固定ボタンを表示
      const lockBtn = id('lockBtn');
      if(lockBtn) {
        lockBtn.style.display = 'inline-block';
      }
      
      status('完了');
    }

    // 駅テーブル表示関数
    function displayStationTable(allIsochroneFeatures) {
      // コストでソート（昇順）
      const sortedFeatures = allIsochroneFeatures
        .slice()
        .sort((a, b) => a.properties.cost_seconds - b.properties.cost_seconds);
      
      const tableBody = id('stationTableBody');
      const stationTableDiv = id('stationTable');
      const totalCountEl = id('totalCount');
      
      if(!stationTableDiv || !tableBody) return;
      
      stationTableDiv.style.display = 'block';
      
      // 総件数を表示
      totalCountEl.textContent = sortedFeatures.length;
      
      // すべての駅を表示
      tableBody.innerHTML = '';
      for(let i = 0; i < sortedFeatures.length; i++) {
        const f = sortedFeatures[i];
        const costMinutes = Math.round(f.properties.cost_seconds / 60 * 10) / 10;
        const stationName = f.properties.station_name || '駅';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="border: 1px solid #ddd; padding: 6px;">${stationName}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${costMinutes}分</td>
        `;
        tableBody.appendChild(tr);
      }
    }

    // リセット
    function resetAll() {
      if(map.getSource('origin-marker')) {
        map.removeLayer('origin-marker-layer');
        map.removeSource('origin-marker');
      }
      origin = null;
      isIsochroneLocked = false; // 固定フラグもリセット
      layerManager.clearIsochrones();
      
      // ボタン表示を更新
      const lockBtn = id('lockBtn');
      const unlockBtn = id('unlockBtn');
      if(lockBtn) lockBtn.style.display = 'none';
      if(unlockBtn) unlockBtn.style.display = 'none';
      
      const originInfoEl = id('originInfo');
      if(originInfoEl) {
        originInfoEl.style.display = 'none';
        id('originCoords').textContent = '';
        id('originStation').textContent = '';
      }
      
      const stationTableDiv = id('stationTable');
      if(stationTableDiv) {
        stationTableDiv.style.display = 'none';
      }
      status('リセットしました');
    }

    // UIイベントハンドラ
    id('resetBtn').addEventListener('click', resetAll);
    
    // 到達圏固定ボタン
    const lockBtn = id('lockBtn');
    if(lockBtn) {
      lockBtn.addEventListener('click', function() {
        isIsochroneLocked = true;
        lockBtn.style.display = 'none';
        const unlockBtn = id('unlockBtn');
        if(unlockBtn) {
          unlockBtn.style.display = 'inline-block';
        }
        status('到達圏を固定しました。クリックで再計算できません。');
      });
    }
    
    // 到達圏固定解除ボタン
    const unlockBtn = id('unlockBtn');
    if(unlockBtn) {
      unlockBtn.addEventListener('click', function() {
        isIsochroneLocked = false;
        unlockBtn.style.display = 'none';
        if(lockBtn) {
          lockBtn.style.display = 'inline-block';
        }
        status('到達圏の固定を解除しました。');
      });
    }
    
    // 都市選択
    const citySelectEl = id('citySelect');
    if(citySelectEl) {
      citySelectEl.addEventListener('change', function() {
        const cityKey = this.value;
        if(cityKey && cities[cityKey]) {
          const city = cities[cityKey];
          map.jumpTo({center: [city.lon, city.lat], zoom: city.zoom});
          resetAll();
        }
      });
    }

    // 地図クリックで出発地点設定 -> 自動計算
    map.on('click', async function(e) {
      // 到達圏が固定されている場合はクリック処理をスキップ
      if(isIsochroneLocked) {
        console.log('[Info] 到達圏が固定されているため、クリックで再計算できません');
        return;
      }
      
      origin = [e.lngLat.lng, e.lngLat.lat];
      setOriginMarker(origin);
      if(DEBUG) console.log('[DEBUG] origin set:', {lon: origin[0], lat: origin[1]});
      
      // 前回の到達圏をクリア
      layerManager.clearIsochrones();
      
      // 自動的に到達圏を計算
      await computeIsochrones();
    });
  });

})();
