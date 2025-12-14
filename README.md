# 鉄道到達圏マップ

## 概要

MaplibreGL を使用した到達圏（isochrone）可視化アプリケーション。ユーザーが地図上で出発地点を指定すると、各駅までの最短時間を Dijkstra アルゴリズムで計算し、到達可能エリアをヒートマップで表示します。

モジュール化されたアーキテクチャで、保守性と拡張性を重視した設計になっています。

## ファイル構成

```
assets/
├── main.js                  # メイン制御・アプリケーション初期化
├── config.js                # 設定・定数管理（AppConfig）
├── ui-controller.js         # UI操作・イベント管理（UIController）
├── isochrone-service.js     # 到達圏計算ロジック（IsochroneService）
├── map-layers.js            # MaplibreGL レイヤ管理（MapLayerManager）
├── dijkstra.js              # Dijkstra最短経路アルゴリズム（TinyQueue, dijkstraVirtualAdj）
├── utils.js                 # ユーティリティ関数
├── loading-manager.js       # ローディング状態管理（LoadingManager）
├── address-search.js        # 住所検索機能（AddressSearch, AddressSearchUI）
└── style.css                # スタイル定義

geojson/
├── station.geojson          # 駅位置データ（EPSG:3857）
└── rail.geojson             # 鉄道線路データ（EPSG:3857）

railway_graph_final.json      # 鉄道グラフ（ノード/エッジ、コストは秒単位）
```

## アーキテクチャ

### スクリプト読み込み順序

```
index.html
  ├─ 外部ライブラリ（proj4.js, turf.js）
  ├─ loading-manager.js      # ローディング管理・初期化
  ├─ utils.js                # ユーティリティ関数
  ├─ config.js               # 設定定義
  ├─ dijkstra.js             # アルゴリズム
  ├─ isochrone-service.js    # ロジック
  ├─ ui-controller.js        # UI制御
  ├─ map-layers.js           # レイヤ管理
  ├─ address-search.js       # 住所検索
  └─ main.js                 # メイン（IIFE で即座実行）
```

依存関係を明確にし、上位層が下位層を参照する単一方向の依存です。

### モジュール責務

| モジュール | 役割 | キークラス/関数 |
|-----------|------|-----------------|
| **config.js** | 設定・定数管理 | `AppConfig` オブジェクト |
| **utils.js** | ヘルパー関数 | `id()`, `fetchJson()`, `status()`, `colorRamp()` など |
| **dijkstra.js** | グラフ計算 | `TinyQueue`, `dijkstraVirtualAdj()` |
| **loading-manager.js** | ローディングUI | `LoadingManager` クラス |
| **isochrone-service.js** | 到達圏計算 | `IsochroneService` クラス |
| **ui-controller.js** | UI/イベント管理 | `UIController` クラス |
| **map-layers.js** | マップレイヤ管理 | `MapLayerManager` クラス |
| **address-search.js** | 住所検索 | `AddressSearch`, `AddressSearchUI` クラス |
| **main.js** | 制御フロー | イベントハンドラ統合 |

### 初期化フロー

1. HTML読み込み → スクリプト順次実行
2. `loading-manager.js`: グローバル `window.loadingManager` インスタンス作成
3. `config.js`: グローバル `window.AppConfig` 定義
4. `main.js`: IIFE で即座実行
   - UIController初期化（モバイルメニュー）
   - マップ初期化
   - データ並列読み込み
   - レイヤ・イベントハンドラ設定

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

`config.js` の `AppConfig` で管理：

- **都市座標**: `cities` — 都市名とズームレベル
- **到達圏パラメータ**:
  - `walkKmh`: 歩行速度（km/h、斜め方向に補正）
  - `stepMin`: 時間ステップ間隔（分）
  - `maxMin`: 最大到達時間（分）
- **データURL**: `data.stations`, `data.rails`, `data.graph`
- **MaplibreGL スタイル**: `mapStyle`

## 外部ライブラリ

- **MaplibreGL 5.0.0** — 地図表示・インタラクション
- **Turf.js** — 地理空間計算（距離測定など）
- **proj4.js** — 座標変換（EPSG:3857 ↔ WGS84）

## パフォーマンス最適化

- **データ読み込み**: 大容量ファイル（graph, rails, stations）を並列読み込み
- **キャッシング**: 小さいメタデータのみ localStorage でキャッシュ（1MB以下）
- **Dijkstra最適化**: 最寄り駅最大10個から計算、複数駅結果をマージ
- **イベント throttle**: マウスムーブを50ms間隔に制限
- **レイヤ制御**: ズームレベルに応じて表示・非表示を自動切り替え

## 主要な機能

### 地図操作
- **出発地点登録**: 地図クリック または 都市選択 または 住所検索
- **到達時間設定**: スライダー（5分単位）または直接入力（contenteditable）
- **到達圏固定**: 計算結果をロック状態で保持

### 到達圏表示
- **ヒートマップ**: 全ズームレベルで表示（残り時間を半径にマッピング）
- **駅マーカー**: ズーム13以上で表示（駅タイプで色分け）
- **コストラベル**: 駅の到達時間を分単位で表示

### テーブル表示
- **到達駅一覧**: 到達時間・駅名・路線・運営会社でソート可能
- **行クリック**: 選択駅にマップをアニメーション移動

## 開発ガイド

### 新機能追加時

1. **UI 変更**: `ui-controller.js` にメソッド追加
2. **計算処理**: `isochrone-service.js` にメソッド追加
3. **レイヤ追加**: `map-layers.js` にメソッド追加
4. **設定変更**: `config.js` の `AppConfig` を更新

例：最大到達時間を180分に変更

```javascript
// config.js
const AppConfig = {
  isochrone: {
    maxMin: 180,  // 180分に変更
    // ...
  }
}
```

### デバッグのコツ

- `?debug=1` でコンソール詳細ログ有効化
- `window.AppConfig` でアプリ設定確認
- `window.map` でMaplibreGLインスタンス確認
- Dijkstra計算結果は `[DEBUG] Computed costs to stations` テーブルで表示

## 今後の改善案

- 乗換待ち時間を反映（グラフのエッジに時間帯情報を付与）
- 経路API（OSRM など）で出発地点→駅の実際の道順を計算
- UI改良（時間レンジスライダー、色パレット選択）
- オフライン対応（Service Worker）

## ライセンス

データは国土地理院の提供するベクトルタイルを使用しています。詳細は [国土地理院](https://maps.gsi.go.jp/) を参照してください。
