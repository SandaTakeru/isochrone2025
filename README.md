# 🚉 くろのまっぷ：鉄道到達圏地図

**一定時間内に鉄道で移動できるエリアを表示するインタラクティブな地図アプリケーション**

- 🗺️ MaplibreGL による高速レンダリング
- 🧭 Dijkstra アルゴリズムで最短経路計算
- 🌡️ 到達時間をヒートマップで可視化
- 📱 レスポンシブデザイン（PC/タブレット/スマートフォン）
- 🔍 住所検索対応
- 🌐 URL 共有機能

## クイックスタート

### ローカル実行

```bash
cd /path/to/App/MAIN
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### デバッグモード

詳細ログを表示：

```
http://localhost:8000/?debug=1
```

### URL でお気に入り地点を共有

```
http://localhost:8000/?lat=35.6895&lng=139.6917&time=60
```

パラメータ：
- `lat`: 緯度
- `lng`: 経度  
- `time`: 到達時間（分）

## 📋 目次

- [主要機能](#主要機能)
- [ファイル構成](#ファイル構成)
- [アーキテクチャ](#アーキテクチャ)
- [設定](#設定)
- [Web メルカトル補正](#web-メルカトル補正)
- [開発ガイド](#開発ガイド)
- [トラブルシューティング](#トラブルシューティング)

## 主要機能

### 地図表示

- **ベースマップ**: 国土地理院の GSI ベクトルタイル
- **ラベルレイヤ**:
  - 都道府県：ズーム 5～12 で表示
  - 市区町村：ズーム 8～24 で表示
  - 鉄道路線：ズーム 13+ で表示
- **ヒートマップ**: 全ズームレベルで到達時間をカラー表示

### ユーザーインタラクション

- **出発地点選択**: 地図クリック / 都市ドロップダウン / 住所検索
- **到達時間設定**: スライダー（5～720分）/ 直接入力
- **到達圏固定**: 計算結果をロック保持
- **駅リスト表示**: ソート可能なテーブル
- **URL 共有**: 現在の設定をリンクで共有

### レスポンシブ対応

- PC: サイドバー常時表示
- タブレット/スマートフォン: ハンバーガーメニュー

## ファイル構成

```
MAIN/
├── index.html                    # メインHTML
├── README.md                     # このファイル
│
├── assets/                       # 本体実装
│   ├── main.js                   # メイン制御・初期化 (1087行)
│   ├── config.js                 # 設定・定数定義 (142行)
│   ├── utils.js                  # ユーティリティ関数 (68行) ★整理済み
│   ├── loading-manager.js        # ローディング管理 (176行)
│   ├── dijkstra.js               # 最短経路アルゴリズム (130行)
│   ├── isochrone-service.js      # 到達圏計算 (253行)
│   ├── ui-controller.js          # UI/イベント管理 (286行)
│   ├── map-layers.js             # MapLibreGLレイヤ (1173行)
│   ├── address-search.js         # 住所検索機能 (256行)
│   ├── mercator-correction.js    # Web メルカトル補正 (124行) ★最適化
│   ├── style.css                 # スタイル定義
│   └── favicon.svg               # アイコン
│
├── geojson/                      # 地理データ
│   ├── station.geojson           # 駅位置 (EPSG:3857)
│   ├── rail.geojson              # 鉄道路線 (EPSG:3857)
│   ├── prefecture.geojson        # 都道府県 (WGS84)
│   └── town.geojson              # 市区町村 (WGS84)
│
├── railway_graph_final.json      # 鉄道グラフ（ノード/エッジ）
├── light.json.txt                # 設定補足
│
└── _dev/                         # 開発・参考ファイル
    ├── mercator-correction-examples.js  # 補正実装例
    ├── HEATMAP_SIMULATOR.md            # シミュレータ（参考）
    ├── HEATMAP_VISUAL_EFFECT.md        # 視覚効果説明（参考）
    ├── CODE_REFACTORING_REPORT.md      # 整理レポート
    └── REFACTORING_LOG.md              # 整理ログ
```

## アーキテクチャ

### スクリプト読み込み順序

```html
<!-- 外部ライブラリ -->
<script src="https://unpkg.com/proj4@2.8.0/dist/proj4.js"></script>
<script src="https://unpkg.com/@turf/turf/turf.min.js"></script>

<!-- 本体スクリプト（順序重要） -->
<script src="assets/loading-manager.js"></script>    <!-- 初期化プリミティブ -->
<script src="assets/utils.js"></script>              <!-- ユーティリティ -->
<script src="assets/config.js"></script>             <!-- 設定定義 -->
<script src="assets/dijkstra.js"></script>           <!-- アルゴリズム -->
<script src="assets/isochrone-service.js"></script>  <!-- ロジック -->
<script src="assets/ui-controller.js"></script>      <!-- UI制御 -->
<script src="assets/map-layers.js"></script>         <!-- レイヤ管理 -->
<script src="assets/address-search.js"></script>     <!-- 住所検索 -->
<script src="assets/mercator-correction.js"></script><!-- メルカトル補正 -->
<script src="assets/main.js"></script>               <!-- メイン（IIFE実行） -->
```

### モジュール責務

| モジュール | 行数 | 責務 | キークラス/関数 |
|-----------|------|------|----------------|
| **loading-manager.js** | 176 | ローディング管理 | `LoadingManager` |
| **utils.js** | 68 | ユーティリティ関数 | `id()`, `fetchJson()`, `colorRamp()` 等 |
| **config.js** | 142 | 設定・定数 | `AppConfig` |
| **dijkstra.js** | 130 | グラフ計算 | `TinyQueue`, `dijkstraVirtualAdj()` |
| **isochrone-service.js** | 253 | 到達圏計算 | `IsochroneService` |
| **ui-controller.js** | 286 | UI・イベント | `UIController` |
| **map-layers.js** | 1173 | マップレイヤ | `MapLayerManager` |
| **address-search.js** | 256 | 住所検索 | `AddressSearch`, `AddressSearchUI` |
| **mercator-correction.js** | 124 | メルカトル補正 | `MercatorCorrection` |
| **main.js** | 1087 | 制御フロー・初期化 | イベントハンドラ |

**合計**: 3,767 行（2025年12月19日版）

### 初期化フロー

```
HTMLロード
  ↓
スクリプト順次実行
  ├─ LoadingManager インスタンス作成
  ├─ AppConfig 定義
  └─ 外部ライブラリロード
  ↓
main.js IIFE実行
  ├─ UIController初期化（モバイルメニュー）
  ├─ MaplibreGL 初期化
  ├─ データ並列読み込み
  │   ├─ railway_graph_final.json
  │   ├─ rail.geojson
  │   ├─ station.geojson
  │   ├─ prefecture.geojson
  │   └─ town.geojson
  ├─ レイヤ作成・設定
  ├─ イベントハンドラ登録
  └─ ユーザー入力待機
```

## 設定

`config.js` で全設定を一元管理：

```javascript
const AppConfig = {
  // === マップ設定 ===
  map: {
    initialCity: 'sapporo',           // 初期都市
    minZoom: 8,                       // 最小ズーム
    maxZoom: 16,                      // 最大ズーム
    maxBounds: [[123.0, 20.4], [149.0, 48.5]]  // 日本BBOX
  },

  // === 都市座標 ===
  cities: {
    sapporo: {name: '札幌市', lat: 43.0645, lon: 141.3469, zoom: 13},
    tokyo: {name: '東京都', lat: 35.6895, lon: 139.6917, zoom: 12},
    // ... 他の都市
  },

  // === 到達圏パラメータ ===
  isochrone: {
    walkKmh: 3.6,              // 歩行速度（km/h）
    stepMin: 5,                // 時間ステップ（分）
    maxMin: 120,               // 最大到達時間（分）
    nearestStationsMax: 10     // 計算用の最寄り駅数
  },

  // === データ URL ===
  data: {
    stations: './geojson/station.geojson',
    rails: './geojson/rail.geojson',
    graph: './railway_graph_final.json'
  },

  // === MaplibreGL スタイル ===
  mapStyle: { /* ... */ }
};
```

## Web メルカトル補正

### 問題

Web メルカトル投影法（EPSG:3857）では、緯度が高い（北に行く）ほど東西方向の距離が圧縮される。地図上での視覚的距離感が実距離と乖離する。

### 解決策

緯度に応じた補正係数を適用：

$$\text{補正後半径} = \frac{\text{元の半径}}{\sqrt{\cos(\varphi)}}$$

ここで $\varphi$ は緯度（ラジアン）

### 日本国内の補正値

| 地点 | 緯度 | 補正係数 | 増加率 |
|------|------|---------|--------|
| 沖縄 | 26.21° | 1.063 | +6.3% |
| 福岡 | 33.59° | 1.105 | +10.5% |
| 大阪 | 34.69° | 1.114 | +11.4% |
| 東京 | 35.68° | 1.122 | +12.2% |
| 札幌 | 43.06° | 1.187 | +18.7% |

### 実装パターン（推奨）

```javascript
// 開始地点の緯度のみ使用（最軽量）
const originLatitude = origin[1];
const factor = window.MercatorCorrection.calculateLatitudeCorrection(originLatitude);
const expr = window.MercatorCorrection.generateFixedCorrectionExpression(factor);
map.setPaintProperty('isochrone-heatmap', 'heatmap-radius', expr);
```

### API

```javascript
// 補正係数を計算
window.MercatorCorrection.calculateLatitudeCorrection(latitude)
  → number (1.0～1.41)

// 統一補正の expression 生成
window.MercatorCorrection.generateFixedCorrectionExpression(factor)
  → Array (MapLibre expression)
```

詳細な実装例は `_dev/mercator-correction-examples.js` を参照

## パフォーマンス最適化

- **データ読み込み**: 5ファイルを Promise.all() で並列読み込み
- **キャッシング**: 小さいメタデータのみ localStorage キャッシュ
- **Dijkstra**: 最寄り駅最大10個から計算して複数結果をマージ
- **イベント throttle**: マウスムーブを50ms間隔に制限
- **レイヤズーム制御**: ズームレベルに応じて自動表示・非表示

## 開発ガイド

### 新機能追加

1. **UI 要素の追加**: `ui-controller.js`
2. **計算ロジック**: `isochrone-service.js`
3. **地図レイヤ**: `map-layers.js`
4. **設定値**: `config.js`

例：最大到達時間を180分に変更

```javascript
// config.js
isochrone: {
  maxMin: 180,  // 120 → 180
}
```

### デバッグのコツ

```javascript
// ブラウザコンソール
?debug=1                    // 詳細ログ有効
window.AppConfig            // 設定確認
window.map                  // MapLibreGL インスタンス
window.IsochroneService     // 到達圏計算クラス
```

## データ座標系

- **駅・線路**: EPSG:3857（Web メルカトル）→ proj4.js で WGS84 に変換
- **ラベル**: WGS84（EPSG:4326）→ 直接使用

## 外部ライブラリ

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| MaplibreGL | 5.0.0 | 地図表示・インタラクション |
| Turf.js | - | 地理空間計算（距離測定） |
| proj4.js | 2.8.0 | 座標変換（EPSG:3857 ↔ WGS84） |

## トラブルシューティング

### Q: ページが真っ白で何も表示されない

A: ブラウザコンソール（F12 → Console）でエラーを確認してください
- スクリプトの読み込み順序をチェック
- 外部ライブラリの CDN が利用可能か確認

### Q: `undefined` エラーが出る

A: `mercator-correction.js` がロードされているか確認

### Q: 補正値がおかしい

A: 緯度の単位が度数法（-90～90）であることを確認

### Q: ローカルホストで CORS エラー

A: http.server ではなく HTTPS が必要な機能があります
- 本番環境でテスト
- またはローカル CORS プロキシを設定

## 今後の改善案

- [ ] 乗換待ち時間の反映
- [ ] 経路 API（OSRM）統合で実際の道順を計算
- [ ] UI 強化（時間レンジスライダー、カラーパレット選択）
- [ ] Service Worker による完全オフライン対応
- [ ] GraphQL API 化（バックエンド化）

## ライセンス

- **地図データ**: [国土地理院](https://maps.gsi.go.jp/) ベクトルタイル
- **アプリケーション**: MIT ライセンス

## 参考資料

- [MaplibreGL ドキュメント](https://maplibre.org/)
- [Turf.js ドキュメント](https://turfjs.org/)
- [国土地理院 GSI ベクトルタイル](https://maps.gsi.go.jp/development/vectile.html)
- [Web メルカトル投影](https://en.wikipedia.org/wiki/Web_Mercator_projection)
