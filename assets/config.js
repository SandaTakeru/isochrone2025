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
    minZoom: 6,
    maxZoom: 18
  },

  // === 都市座標 ===
  cities: {
    sapporo: {name: '札幌市', lat: 43.0642, lon: 141.3469, zoom: 13},
    sendai: {name: '仙台市', lat: 38.2688, lon: 140.8694, zoom: 13},
    tokyo: {name: '東京都', lat: 35.6895, lon: 139.6917, zoom: 12},
    yokohama: {name: '横浜市', lat: 35.4437, lon: 139.6380, zoom: 13},
    nagoya: {name: '名古屋市', lat: 35.1815, lon: 136.9066, zoom: 13},
    osaka: {name: '大阪市', lat: 34.6937, lon: 135.5023, zoom: 13},
    kobe: {name: '神戸市', lat: 34.6901, lon: 135.1955, zoom: 13},
    kyoto: {name: '京都市', lat: 35.0116, lon: 135.7681, zoom: 13},
    fukuoka: {name: '福岡市', lat: 33.5904, lon: 130.4017, zoom: 13}
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
  mapStyle: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      gsi: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a> | <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-v3_1.html" target="_blank">国土数値情報</a>'
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

  // === デバッグ設定 ===
  debug: {
    enabled: (new URLSearchParams(location.search).get('debug') || '') === '1' || 
             (new URLSearchParams(location.search).get('debug') || '') === 'true'
  }
};

// グローバルに設定を公開
window.AppConfig = AppConfig;
