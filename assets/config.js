// assets/config.js
// アプリケーション設定・定数定義

/**
 * アプリケーション設定
 * 各種パラメータ・定数を一元管理
 */
const AppConfig = {
  // === マップ設定 ===
  map: {
    initialCity: 'tokyo',
    minZoom: 8,
    maxZoom: 16,
    // 日本の東西南北 BBOX（北方領土を含む） [西, 南, 東, 北]
    maxBounds: [[123.0, 20.4], [149.0, 48.5]]
  },

  // === 都市座標 ===
  cities: {
    sapporo: {name: '札幌駅', lat: 43.0676, lon: 141.3511, zoom: 13},
    sendai: {name: '仙台駅', lat: 38.2605, lon: 140.8816, zoom: 13},
    tokyo: {name: '東京駅', lat: 35.6815, lon: 139.7654, zoom: 12},
    yokohama: {name: '横浜駅', lat: 35.4658, lon: 139.6213, zoom: 13},
    nagoya: {name: '名古屋駅', lat: 35.1710, lon: 136.8831, zoom: 13},
    osaka: {name: '大阪駅', lat: 34.7024, lon: 135.4960, zoom: 13},
    kobe: {name: '三宮駅', lat: 34.6946, lon: 135.1941, zoom: 13},
    kyoto: {name: '京都駅', lat: 34.9860, lon: 135.7590, zoom: 13},
    fukuoka: {name: '博多駅', lat: 33.5899, lon: 130.4195, zoom: 13}
  },

  // === 到達圏計算設定 ===
  isochrone: {
    walkKmh: 3.6,  // 歩行速度（km/h）
    stepMin: 5,                     // ステップ間隔（分）
    maxMin: 120,                    // 最大到達時間（分）
    nearestStationsMax: 10          // 計算用の最寄り駅数
  },

  // === データ URL ===
  data: {
    stations: './geojson/station.geojson',
    rails: './geojson/rail.geojson',
    graph: './station_graph.json'
  },

  // === MaplibreGL スタイル ===
  // GSI実験的ベクトルタイルを使用したシンプルなスタイル定義
  mapStyle: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'gsi-vector': {
        type: 'vector',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'],
        minzoom: 8,
        maxzoom: 16,
        attribution: '<a href="https://maps.gsi.go.jp/development/vt_expt.html" target="_blank">GSI実験的ベクトルタイル</a> | <a href="https://nlftp.mlit.go.jp" target="_blank">国土数値情報</a>を加工して作成'
      }
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f0ebe3' }
      },
      {
        id: 'waterarea',
        type: 'fill',
        source: 'gsi-vector',
        'source-layer': 'waterarea',
        paint: { 'fill-color': '#cce5ff' }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'gsi-vector',
        'source-layer': 'landuse',
        paint: { 'fill-color': '#f0ebe3' }
      },
      {
        id: 'building',
        type: 'fill',
        source: 'gsi-vector',
        'source-layer': 'building',
        paint: { 'fill-color': '#e5e0d9' }
      },
      {
        id: 'road',
        type: 'line',
        source: 'gsi-vector',
        'source-layer': 'road',
        paint: { 'line-color': '#ffffff', 'line-width': 1 }
      },
      {
        id: 'railway',
        type: 'line',
        source: 'gsi-vector',
        'source-layer': 'railway',
        paint: { 'line-color': '#cccccc', 'line-width': 0.8 }
      }
    ]
  },

  // === デバッグ設定 ===
  debug: {
    enabled: (new URLSearchParams(location.search).get('debug') || '') === '1' || 
             (new URLSearchParams(location.search).get('debug') || '') === 'true'
  },

  /**
   * 画面サイズに応じて動的にズームレベルを計算
   * 画面が小さいほどズームアウト、大きいほどズームインする
   * @returns {number} 計算されたズームレベル
   */
  calculateDynamicZoom: function() {
    // ビューポートの幅を取得
    const mapContainer = document.getElementById('map');
    if(!mapContainer) return 13; // フォールバック

    const width = mapContainer.offsetWidth;
    const height = mapContainer.offsetHeight;
    const aspectRatio = width / height;

    // 画面サイズに基づいてズームレベルを決定
    // 小さい画面（スマートフォン）: ズームアウト（12）
    // 中程度の画面（タブレット）: 標準（13）
    // 大きい画面（デスクトップ）: ズームイン（14）
    if(width < 480) {
      return 12;
    } else if(width < 768) {
      return 13;
    } else if(width < 1024) {
      return 13.5;
    } else {
      return 14;
    }
  }
};

// グローバルに設定を公開
window.AppConfig = AppConfig;
