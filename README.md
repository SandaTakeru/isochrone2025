# 到達圏マップ (GitHub Pages 用)

概要
- ローカルの鉄道グラフ `railway_graph_final.json`（ノード/エッジ、cost は秒）と駅 GeoJSON `geojson/station.geojson` を使って到達圏（isochrone）を計算・描画する静的サイトです。
- ユーザーが地図上で出発地点（職場・学校）を指定すると、各駅までの最短コスト（鉄道コスト + 出発地→駅の歩行時間）を Dijkstra で計算し、各駅を中心に残り歩行可能時間分だけバッファを作り、5分刻み（設定可能）で重なった領域を融合して描画します。

使い方
1. このフォルダを GitHub リポジトリのルートに置くか、そのまま Pages に公開します。
2. `index.html` をブラウザで開く（ローカルでテストする場合は静的サーバを推奨）。
3. 地図をクリックして出発地点を指定し、`到達圏を計算` を押す。

ローカルでの素早い確認方法
macOS の場合、プロジェクトの `index.html` があるディレクトリで次を実行します：

```bash
# Python 3 の http.server を使う例
cd /path/to/App/MAIN
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

主要ファイル
- `index.html` — UI とライブラリ読み込み（Leaflet, proj4, Turf）
- `assets/main.js` — データ読み込み、Dijkstra、バッファ生成、マップ描画のロジック
- `assets/style.css` — 簡単なレイアウト
- `railway_graph_final.json` — 鉄道グラフ（既に存在）
- `geojson/station.geojson` — 駅位置（EPSG:3857）

注意事項
- `station.geojson` は EPSG:3857（WebMercator）なので、クライアント側で `proj4` を使って経度緯度に戻しています。
- Turf の `union` は複雑なポリゴンの結合で失敗することがあります（ブラウザ側の計算コストも高くなります）。大きな範囲や多数の駅を処理する場合はサーバ側で事前に集約することを推奨します。

今後の改善案
- 乗換待ちや列車ダイヤを反映する（グラフのエッジに時間帯情報を付与）
- 出発地点→駅を単に徒歩とせず、経路（道路ネットワーク）での接続を行う
- UI の改良（時間レンジスライダー、色・レイヤー切替）

質問や追加要望があれば教えてください。
