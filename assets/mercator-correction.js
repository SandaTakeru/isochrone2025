/**
 * Web メルカトル投影法の緯度による歪み補正
 * 
 * このモジュールは、Web メルカトルにおける緯度が高いほど距離と面積が誇張される
 * という歪みを補正し、実距離ベースのヒートマップ半径を適切に計算します。
 * 
 * 使用中の関数：
 * - calculateLatitudeCorrection() : 出発地点の緯度から補正係数を計算
 * - generateFixedCorrectionExpression() : MapLibreの補正済みexpression生成
 */

/**
 * 緯度に基づくヒートマップ半径補正係数を計算（実装中のみ使用）
 * 
 * 補正式：correction = 1 / sqrt(cos(φ))
 * φ: 緯度（ラジアン）
 * 
 * @param {number} latitude - 緯度（度数法）
 * @returns {number} 補正係数（1.0～1.41 の範囲）
 */
function calculateLatitudeCorrection(latitude) {
  const latRad = latitude * (Math.PI / 180); // 度数法をラジアンに変換
  const cosLat = Math.cos(latRad);
  
  // cos(φ) は 0 に近づくと 1/sqrt(cos(φ)) は無限大に
  // 安全性のため、最小値を 0.001 に設定
  const safeCosPhi = Math.max(0.001, cosLat);
  
  return 1 / Math.sqrt(safeCosPhi);
}

/**
 * MapLibre heatmap-radius 用の expression を生成（統一補正係数版）
 * 実装で実際に使用している唯一の補正expression生成関数
 * 
 * @param {number} correctionFactor - 補正係数（例：1.15）
 * @returns {Array} MapLibre expression
 */
function generateFixedCorrectionExpression(correctionFactor) {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, ['*', ['get', 'remaining_cost_seconds'], 0.000018 * correctionFactor],
    1, ['*', ['get', 'remaining_cost_seconds'], 0.000036 * correctionFactor],
    2, ['*', ['get', 'remaining_cost_seconds'], 0.000072 * correctionFactor],
    3, ['*', ['get', 'remaining_cost_seconds'], 0.000144 * correctionFactor],
    4, ['*', ['get', 'remaining_cost_seconds'], 0.000288 * correctionFactor],
    5, ['*', ['get', 'remaining_cost_seconds'], 0.000576 * correctionFactor],
    6, ['*', ['get', 'remaining_cost_seconds'], 0.001152 * correctionFactor],
    7, ['*', ['get', 'remaining_cost_seconds'], 0.002304 * correctionFactor],
    8, ['*', ['get', 'remaining_cost_seconds'], 0.0048 * correctionFactor],
    9, ['*', ['get', 'remaining_cost_seconds'], 0.0096 * correctionFactor],
    10, ['*', ['get', 'remaining_cost_seconds'], 0.0192 * correctionFactor],
    11, ['*', ['get', 'remaining_cost_seconds'], 0.0384 * correctionFactor],
    12, ['*', ['get', 'remaining_cost_seconds'], 0.0768 * correctionFactor],
    13, ['*', ['get', 'remaining_cost_seconds'], 0.1536 * correctionFactor],
    14, ['*', ['get', 'remaining_cost_seconds'], 0.3072 * correctionFactor],
    15, ['*', ['get', 'remaining_cost_seconds'], 0.6144 * correctionFactor],
    16, ['*', ['get', 'remaining_cost_seconds'], 1.2288 * correctionFactor],
    17, ['*', ['get', 'remaining_cost_seconds'], 2.4576 * correctionFactor],
    18, ['*', ['get', 'remaining_cost_seconds'], 4.9152 * correctionFactor],
    19, ['*', ['get', 'remaining_cost_seconds'], 9.8304 * correctionFactor],
    20, ['*', ['get', 'remaining_cost_seconds'], 19.6608 * correctionFactor]
  ];
}

// ========================================
// 以下の関数は実装では使用されていません
// 参考用にコメント化して保留
// ========================================

/*
 * Web メルカトルの Y 座標（メートル）から緯度（度数法）を逆算
 * （使用予定なし - per-feature補正は未実装）
 
function webMercatorYToLatitude(y) {
  const EARTH_RADIUS = 6371008.8;
  const normalizedY = Math.max(-20037508.34, Math.min(20037508.34, y));
  const lat = 2 * Math.atan(Math.exp(normalizedY / EARTH_RADIUS)) - Math.PI / 2;
  return lat * (180 / Math.PI);
}
*/

/*
 * フィーチャに補正係数を事前計算して追加
 * （使用予定なし - 統一補正を採用）
 
function addLatitudeCorrectionToFeatures(features) {
  return features.map(feature => {
    // ... implementation omitted
  });
}
*/

/*
 * 開始地点の座標から補正係数を計算
 * (注：calculateLatitudeCorrection()で十分)
 
function calculateOriginOnlyCorrectionFactor(originLatitude) {
  return calculateLatitudeCorrection(originLatitude);
}
*/

/*
 * MapLibre expression で動的に補正
 * （使用予定なし - 静的補正（generateFixedCorrectionExpression）を採用）
 
function generateDynamicCorrectionExpression(latitudePropertyName = 'latitude') {
  // ... implementation omitted
}
*/

/*
 * フィーチャごとの補正係数を使用したexpression生成
 * （使用予定なし - 統一補正を採用）
 
function generatePerFeatureCorrectionExpression() {
  // ... implementation omitted
}
*/

// エクスポート（実装で使用する関数のみ）
window.MercatorCorrection = {
  calculateLatitudeCorrection,
  generateFixedCorrectionExpression
};
