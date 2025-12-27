# 🚉 くろのまっぷ：鉄道到達圏地図（AIによる下書きです）

**一定時間内に鉄道で移動できるエリアを視覚的に表示するインタラクティブな地図アプリケーション**

| 特徴 | 説明 |
|------|------|
| 🗺️ **高速レンダリング** | MaplibreGL による100万ピクセル単位の即座表示 |
| 🧭 **最短経路計算** | Dijkstraアルゴリズムで全駅への到達時間を一括算出 |
| 🌡️ **ヒートマップ表示** | グラデーションで時間帯別到達エリアを可視化 |
| 🔍 **住所検索** | 日本全国の駅・市区町村から検索可能 |
| 📍 **URL共有** | 現在地と条件をリンクで即座に共有 |
| 📱 **マルチデバイス対応** | PCからスマートフォンまでレスポンシブ対応 |

## 🚀 はじめ方（2分で開始）

### 最速スタート

```bash
cd /path/to/App/MAIN
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

### URL パラメータで条件指定

```
http://localhost:8000/?lat=35.6895&lng=139.6917&time=60
```

**パラメータ**:
- `lat`: 緯度
- `lng`: 経度  
- `time`: 到達時間（分）

例） 東京駅から60分圏内：`?lat=35.6762&lng=139.7674&time=60`

## � ユーザーガイド

### 基本操作

| 操作 | 結果 |
|------|------|
| **地図をクリック** | その場所から検索開始 |
| **「主要都市」で選択** | サンプル都市（札幌・東京・大阪など）に即座切替 |
| **検索ボックスに住所入力** | 全国の駅・地名から検索 |
| **スライダー調整** | 5～720分の到達時間を変更（色が自動変更） |
| **「固定」ボタン** | 現在の到達圏をロック→新しい基準点で比較可能 |
| **駅リストをクリック** | その駅から再計算 |

### ヒートマップの読み方

**色が明るい（赤→黄→緑）ほど早く到達できます**
- 赤: 0～20分（最速）
- 黄: 20～40分
- 緑: 40～60分
- 青: 60分以降

## 🏗️ 技術スタック

| 役割 | 採用技術 |
|------|---------|
| **地図表示** | MaplibreGL 5.0.0 |
| **最短経路** | Dijkstraアルゴリズム（自実装） |
| **地理計算** | Turf.js, proj4.js |
| **UI制御** | Vanilla JavaScript（フレームワークなし） |
| **データ形式** | GeoJSON（緯度経度）, JSON（鉄道グラフ） |

## 📂 ファイル構成

```
MAIN/
├── index.html                    # エントリーポイント
├── README.md                     # このファイル
├── station_graph.json            # 鉄道グラフ（駅間接続情報）
│
├── assets/
│   ├── main.js                   # メイン実行ファイル（初期化・イベント処理）
│   ├── config.js                 # 設定・定数（都市座標、パラメータ）
│   ├── isochrone-service.js      # 到達圏計算エンジン
│   ├── dijkstra.js               # 最短経路計算アルゴリズム
│   ├── map-layers.js             # MapLibreGL レイヤ管理
│   ├── ui-controller.js          # UI・イベントハンドラ
│   ├── address-search.js         # 住所・駅検索機能
│   ├── loading-manager.js        # ローディング表示管理
│   ├── mercator-correction.js    # 緯度による距離補正
│   ├── utils.js                  # ユーティリティ関数
│   └── style.css                 # スタイル定義
│
└── geojson/
    ├── station.geojson           # 駅の座標（GeoJSON）
    ├── rail.geojson              # 鉄道路線（GeoJSON）
    ├── prefecture.geojson        # 都道府県境界
    ├── town.geojson              # 市区町村境界
    └── airport.geojson           # 空港位置（参考）
```

## 🔧 開発者向け情報

### スクリプト読み込み順序（重要）

各スクリプトは依存関係がある順序で読み込まれます：

```
loading-manager.js    → 初期化システム
utils.js             → ユーティリティ関数
config.js            → 設定定義
dijkstra.js          → グラフアルゴリズム
isochrone-service.js → 計算エンジン
ui-controller.js     → UI制御
map-layers.js        → レイヤ管理
address-search.js    → 検索機能
mercator-correction.js → 距離補正
main.js (IIFE)       → メイン実行（即座実行関数）
```

### 初期化フロー

```
ページロード
  ↓
config.js で定数定義
  ↓
main.js の IIFE 実行
  ├─ UIController初期化
  ├─ MaplibreGL初期化
  ├─ 5ファイルを並列ダウンロード
  │  ├─ station_graph.json
  │  ├─ rail.geojson
  │  ├─ station.geojson
  │  ├─ prefecture.geojson
  │  └─ town.geojson
  ├─ レイヤ作成・設定
  └─ ユーザー入力待機
```

### 設定値の変更（config.js）

```javascript
const AppConfig = {
  map: {
    initialCity: 'tokyo',        // 初期表示都市
    minZoom: 8,
    maxZoom: 16,
  },
  isochrone: {
    walkKmh: 3.6,                // 徒歩速度（km/h）
    maxMin: 720,                 // 最大到達時間（分）
    nearestStationsMax: 10       // 計算用駅数
  }
};
```

### 新機能追加のポイント

| 機能 | ファイル |
|------|---------|
| UI要素追加 | `ui-controller.js`, `style.css` |
| 到達圏の計算ロジック変更 | `isochrone-service.js` |
| 地図レイヤの変更 | `map-layers.js` |
| 定数・パラメータ変更 | `config.js` |

### デバッグのコツ

```javascript
// ブラウザコンソール（F12）で実行可能
window.AppConfig           // 設定確認
window.map                 // MapLibreGL インスタンス
window.IsochroneService    // 到達圏計算サービス
```

## ⚠️ トラブルシューティング

| 問題 | 原因・解決方法 |
|------|-----------------|
| ページが真っ白 | コンソール（F12）でエラー確認→スクリプト読み込み順序チェック |
| 地図が表示されない | MapLibreGL CDN が利用可能か確認 |
| 「undefined」エラー | `mercator-correction.js` のロード確認 |
| 補正値がおかしい | 緯度の単位が度数法（-90～90）か確認 |
| CORS エラー | localhost で動作確認 |

## 🌍 Web メルカトル補正について

### なぜ補正が必要か

Web メルカトル投影法（ブラウザの地図標準）では、北に行くほど東西方向の距離が圧縮されます。

**札幌と沖縄では同じピクセル距離でも実距離が異なります**

| 都市 | 緯度 | 補正率 |
|------|------|--------|
| 沖縄 | 26.21° | +6.3% |
| 東京 | 35.68° | +12.2% |
| 札幌 | 43.06° | +18.7% |

### 補正式

$$\text{補正半径} = \frac{\text{元の半径}}{\sqrt{\cos(\varphi)}}$$

ここで $\varphi$ は緯度（ラジアン）

## 📖 その他の情報

### 使用データ・ライセンス

- **地図**: [国土地理院ベクトルタイル](https://maps.gsi.go.jp/)
- **アプリケーション**: MIT ライセンス

### 外部ライブラリ

| 名前 | バージョン | 用途 |
|------|-----------|------|
| MaplibreGL | 5.0.0 | 地図表示 |
| Turf.js | 最新 | 地理空間計算 |
| proj4.js | 2.8.0 | 座標変換 |

### 参考資料

- [MaplibreGL ドキュメント](https://maplibre.org/)
- [国土地理院 ベクトルタイル](https://maps.gsi.go.jp/development/vectile.html)
- [Web メルカトル投影法](https://en.wikipedia.org/wiki/Web_Mercator_projection)
