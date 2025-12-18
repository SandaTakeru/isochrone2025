// assets/utils.js
// ヘルパー関数とユーティリティ
// 
// 提供する機能：
// - DOM操作: id()
// - データ取得: fetchJson()
// - 状態表示: status()
// - パフォーマンス計測: perfStart(), perfEnd()
// - 色管理: colorRamp(), interpolateColor(), getStationColor()

// ============================================
// DOM操作
// ============================================

/**
 * 要素IDから要素を取得（shorthand）
 * @param {string} n - 要素ID
 * @returns {HTMLElement|null}
 */
function id(n) {
  return document.getElementById(n);
}

// ============================================
// データ取得
// ============================================

/**
 * URLからJSONをfetchして解析
 * @param {string} url
 * @returns {Promise<Object>}
 * @throws {Error} レスポンスが失敗した場合
 */
async function fetchJson(url) {
  const r = await fetch(url);
  if(!r.ok) throw new Error('fetch failed ' + url);
  return r.json();
}

// ============================================
// UI状態表示
// ============================================

/**
 * ステータス表示欄にテキストを設定
 * @param {string} s - 表示するテキスト
 */
function status(s) {
  const statusEl = id('status');
  if(statusEl) statusEl.textContent = s;
}

// ============================================
// パフォーマンス計測
// ============================================

// パフォーマンス計測用ヘルパー（デバッグモードのみ有効）
const perfMarks = {};

/**
 * パフォーマンス計測開始
 * @param {string} label - ラベル
 */
function perfStart(label) {
  if(window.DEBUG) {
    perfMarks[label] = {start: performance.now(), label};
    performance.mark(`${label}-start`);
  }
}

/**
 * パフォーマンス計測終了＆ログ出力
 * @param {string} label - ラベル
 */
function perfEnd(label) {
  if(window.DEBUG && perfMarks[label]) {
    const duration = performance.now() - perfMarks[label].start;
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  }
}

// ============================================
// 色管理（到達圏ヒートマップとStation表示用）
// ============================================

/**
 * 緑～赤グラデーションのカラーパレット生成
 * 到達時間が短い → 緑、長い → 赤
 * @param {number} n - 色の数
 * @returns {Array<string>} RGB文字列配列
 */
function colorRamp(n) {
  const out = [];
  for(let i = 0; i < n; i++) {
    const t = i / (Math.max(1, n - 1));
    out.push(interpolateColor([0, 200, 0], [200, 0, 0], t));
  }
  return out;
}

/**
 * 2色間の線形補間（RGB）
 * @param {Array<number>} a - RGB値 [r, g, b] (0-255)
 * @param {Array<number>} b - RGB値 [r, g, b] (0-255)
 * @param {number} t - 補間率 (0-1)
 * @returns {string} RGB文字列 "rgb(r,g,b)"
 */
function interpolateColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * 駅タイプ別RGB色定義
 * 種別コード：
 * - '1': 新幹線（JR） 赤
 * - '2': 在来線（JR） 緑
 * - '3': 公営鉄道 青
 * - '4': 民営鉄道 オレンジ
 * - '5': 第三セクター 紫
 * - '6-8': その他
 */
const colorByType = {
  '1': [255, 0, 0],      // 赤
  '2': [0, 170, 0],      // 緑
  '3': [0, 0, 255],      // 青
  '4': [255, 153, 0],    // オレンジ
  '5': [153, 0, 255],    // 紫
  '6': [255, 0, 153],    // ピンク
  '7': [0, 255, 255],    // シアン
  '8': [255, 255, 0]     // 黄
};

/**
 * 駅タイプからRGB色を取得
 * @param {string|number} stationType - 駅タイプコード
 * @returns {Array<number>} RGB値 [r, g, b]
 */
function getStationColor(stationType) {
  return colorByType[stationType] || [0, 119, 204];  // デフォルト：青系
}
