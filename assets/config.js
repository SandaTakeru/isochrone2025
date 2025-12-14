// assets/config.js
// アプリケーション設定・定数定義

/**
 * アプリケーション設定
 * 各種パラメータ・定数を一元管理
 */
const AppConfig = {
  // === マップ設定 ===
  map: {
    initialCity: 'sapporo',
    minZoom: 8,
    maxZoom: 16,
    // 日本の東西南北 BBOX（北方領土を含む） [西, 南, 東, 北]
    maxBounds: [[123.0, 20.4], [149.0, 48.5]]
  },

  // === 都市座標 ===
  cities: {
    sapporo: {name: '札幌市（北海道庁）', lat: 43.0645, lon: 141.3469, zoom: 13},
    sendai: {name: '仙台市（宮城県庁）', lat: 38.2699, lon: 140.8720, zoom: 13},
    tokyo: {name: '東京都（東京都庁）', lat: 35.6895, lon: 139.6917, zoom: 12},
    yokohama: {name: '横浜市（神奈川県庁）', lat: 35.4456, lon: 139.6386, zoom: 13},
    nagoya: {name: '名古屋市（愛知県庁）', lat: 35.1803, lon: 136.9066, zoom: 13},
    osaka: {name: '大阪市（大阪府庁）', lat: 34.6869, lon: 135.5203, zoom: 13},
    kobe: {name: '神戸市（兵庫県庁）', lat: 34.6728, lon: 135.1826, zoom: 13},
    kyoto: {name: '京都市（京都府庁）', lat: 35.0113, lon: 135.7585, zoom: 13},
    fukuoka: {name: '福岡市（福岡県庁）', lat: 33.5841, lon: 130.4008, zoom: 13}
  },

  // === 到達圏計算設定 ===
  isochrone: {
    walkKmh: 4.8 / Math.sqrt(2),  // 歩行速度（km/h）
    stepMin: 5,                     // ステップ間隔（分）
    maxMin: 120,                    // 最大到達時間（分）
    nearestStationsMax: 10          // 計算用の最寄り駅数
  },

  // === データ URL ===
  data: {
    stations: './geojson/station.geojson',
    rails: './geojson/rail.geojson',
    graph: './railway_graph_final.json'
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
        minzoom: 4,
        maxzoom: 16,
        attribution: '<a href="https://maps.gsi.go.jp/" target="_blank">国土地理院</a>'
      }
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f5f5f0' }
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
