# 鉄道到達圏マップ

## 概要

MaplibreGL を使用した到達圏（isochrone）可視化アプリケーション。ユーザーが地図上で出発地点を指定すると、各駅までの最短時間を Dijkstra アルゴリズムで計算し、到達可能エリアをヒートマップで表示します。

モジュール化されたアーキテクチャで、保守性と拡張性を重視した設計になっています。

## ファイル構成

```
assets/
├── main.js                # メイン制御・アプリケーション初期化
├── config.js              # 設定・定数管理（AppConfig）
├── ui-controller.js       # UI操作・イベント管理（UIController）
├── isochrone-service.js   # 到達圏計算ロジック（IsochroneService）
├── map-layers.js          # MaplibreGL レイヤ管理（MapLayerManager）
├── dijkstra.js            # Dijkstra最短経路アルゴリズム
├── utils.js               # ユーティリティ関数
└── style.css              # スタイル定義

geojson/
├── station.geojson        # 駅位置データ（EPSG:3857）
└── rail.geojson           # 鉄道線路データ（EPSG:3857）

railway_graph_final.json    # 鉄道グラフ（ノード/エッジ、コストは秒単位）
```

## アーキテクチャ

### モジュール依存関係

```
index.html
  ↓
外部ライブラリ（MaplibreGL, Turf.js, proj4.js）
  ↓
ユーティリティ（utils.js, dijkstra.js）
  ↓
設定（config.js）
  ↓
機能モジュール（isochrone-service.js, ui-controller.js, map-layers.js）
  ↓
メイン（main.js）
```

### 機能モジュール分割

| モジュール | 責務 | キー関数/クラス |
|-----------|------|-----------------|
| **config.js** | 設定・定数の一元管理 | `AppConfig` オブジェクト |
| **ui-controller.js** | UI操作・イベント処理 | `UIController` クラス |
| **isochrone-service.js** | 到達圏計算ロジック | `IsochroneService` クラス |
| **map-layers.js** | マップレイヤ管理 | `MapLayerManager` クラス |
| **dijkstra.js** | グラフアルゴリズム | `dijkstraVirtualAdj()`, `TinyQueue` |
| **utils.js** | ユーティリティ | `id()`, `fetchJson()`, `status()`, `colorRamp()` など |

### 初期化フロー

1. `index.html` が複数のスクリプトを読み込む（依存順）
2. `config.js` で設定をグローバルに定義
3. `main.js` が IIFE で実行開始
4. `UIController` でモバイルメニューを初期化
5. `MaplibreGL` マップを初期化
6. マップ読み込み完了後、`IsochroneService` で計算開始

## インストール・実行

### ローカル実行

```bash
cd /path/to/App/MAIN
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### デバッグモード

URLパラメータ `?debug=1` を付与するとコンソールに詳細ログが出力されます。

```
http://localhost:8000/?debug=1
```

## 主要な設定

`config.js` の `AppConfig` オブジェクトで以下を管理：

- **都市座標**: `cities` オブジェクト
- **到達圏パラメータ**: `isochrone.walkKmh`, `stepMin`, `maxMin`
- **データURL**: `data.stations`, `data.rails`, `data.graph`
- **MaplibreGL スタイル**: `mapStyle`

新しい設定項目は `AppConfig` に追加するだけで、全モジュールから参照可能です。

## 外部ライブラリ

- **MaplibreGL** — 地図表示
- **Turf.js** — 地理空間計算
- **proj4.js** — 座標変換（EPSG:3857 ↔ WGS84）

## パフォーマンス最適化

- Dijkstra計算時に最寄り駅を最大10個まで限定
- 複数駅からのコストを統合して最小値を採用
- ズームレベルに応じたレイヤ表示制御
- マウスムーブイベントに throttle 処理を適用

## 開発ガイド

### モジュール詳細

#### config.js
アプリケーション設定の一元管理。すべての設定をここで定義し、他のモジュールからは `window.AppConfig` でアクセスします。

#### ui-controller.js
UI操作・ユーザーインタラクション管理。主要メソッド：
- `initMobileMenu()` — モバイルメニュー開閉
- `displayOriginInfo()` — 出発地点情報表示
- `displayStationTable()` — 駅テーブル表示・更新
- `setStationTableRowClickHandler()` — テーブル行のクリックハンドラ設定

UI状態管理をカプセル化し、HTML操作を集中管理します。

#### isochrone-service.js
到達圏計算ロジック。Dijkstra アルゴリズムを使用して最短経路を計算し、到達可能エリアを算出します。

#### map-layers.js
MaplibreGL のレイヤ管理。レイヤの追加・更新・削除を統一的に処理します。

### 新機能追加時

1. **UI関連**: `ui-controller.js` にメソッド追加
2. **計算処理**: `isochrone-service.js` にメソッド追加
3. **レイヤ管理**: `map-layers.js` にメソッド追加
4. **設定変更**: `config.js` の `AppConfig` を更新

すべてのモジュールは独立しており、影響範囲を最小化できます。

例：最大到達時間を120分から180分に変更

```javascript
// config.js
isochrone: {
  maxMin: 180,  // 180分に変更
  // ...
}
```

## 後方互換性

`isochrone.js` は従来の `IsochroneCalculator` クラスを保持していますが、新しいコードでは `isochrone-service.js` の `IsochroneService` を使用してください。
- Turf の `union` は複雑なポリゴンの結合で失敗することがあります（ブラウザ側の計算コストも高くなります）。大きな範囲や多数の駅を処理する場合はサーバ側で事前に集約することを推奨します。

今後の改善案
- 乗換待ちや列車ダイヤを反映する（グラフのエッジに時間帯情報を付与）
- 出発地点→駅を単に徒歩とせず、経路（道路ネットワーク）での接続を行う
- UI の改良（時間レンジスライダー、色・レイヤー切替）

質問や追加要望があれば教えてください。
