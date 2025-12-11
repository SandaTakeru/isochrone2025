// assets/utils.js
// ヘルパー関数とユーティリティ

function id(n) {
  return document.getElementById(n);
}

async function fetchJson(url) {
  const r = await fetch(url);
  if(!r.ok) throw new Error('fetch failed ' + url);
  return r.json();
}

function status(s) {
  const statusEl = id('status');
  if(statusEl) statusEl.textContent = s;
}

// パフォーマンス計測用ヘルパー関数（デバッグモードのみ使用）
const perfMarks = {};
function perfStart(label) {
  if(window.DEBUG) {
    perfMarks[label] = {start: performance.now(), label};
    performance.mark(`${label}-start`);
  }
}
function perfEnd(label) {
  if(window.DEBUG && perfMarks[label]) {
    const duration = performance.now() - perfMarks[label].start;
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  }
}

// Color ramp - 緑から赤へのグラデーション
function colorRamp(n) {
  const out = [];
  for(let i = 0; i < n; i++) {
    const t = i / (Math.max(1, n - 1));
    out.push(interpolateColor([0, 200, 0], [200, 0, 0], t));
  }
  return out;
}

function interpolateColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// 駅タイプ別のカラーマッピング
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

function getStationColor(stationType) {
  return colorByType[stationType] || [0, 119, 204];
}
