// assets/map-layers.js
// レイヤ管理とマップコンポーネント

// ヒートマップグラデーション定義
const HEATMAP_GRADIENTS = {
  positive: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(255, 255, 255, 0)',
    0.05, 'rgba(255, 220, 100, 1)',
    0.1, 'rgba(100, 255, 60, 1)',
    1, 'rgba(100, 255, 60, 1)'
  ],
  negative: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(128, 128, 128, 1)',
    0.05, 'rgba(128, 128, 128, 1)',
    0.1, 'rgba(128, 128, 128, 0)',
    1, 'rgba(128, 128, 128, 0)'
  ]
};

class MapLayerManager {
  constructor(map) {
    this.map = map;
    this.stationsLayerId = 'stations-layer';
    this.railLayerId = 'rail-layer';
    this.isochronesPointLayerId = 'isochrones-point-layer';
    this.isochronesHeatmapLayerId = 'isochrones-heatmap-layer';
    this.HIT_BOX_SIZE = 15; // タップ判定エリアサイズ（ピクセル）
    this.heatmapGradientType = 'positive'; // デフォルトはポジティブ表示
    
    // 【最適化】ズームレベル用キャッシュ
    this._lastStationFilter = null;
    this._heatmapRadiusExprCache = null;
    this._lastCorrectionValue = null;
  }

  // 駅レイヤの作成と追加（新版：データをパラメータで受け取る）
  async loadStationsWithData(stationFC, stations) {
    try {
      perfStart('stations-parse');
      
      // CRS detection and conversion
      const stationCrsName = stationFC.crs && stationFC.crs.properties && stationFC.crs.properties.name || '';
      const stationIs3857 = stationCrsName.indexOf('3857') !== -1;
      
      perfStart('stations-iterate');
      stationFC.features.forEach(f => {
        const pid = f.properties.id;
        const coords = f.geometry.coordinates;
        let lon, lat;
        
        if(stationIs3857) {
          const lonlat = proj4('EPSG:3857','WGS84', coords);
          lon = lonlat[0];
          lat = lonlat[1];
        } else {
          lon = coords[0];
          lat = coords[1];
        }
        
        stations[pid] = {id: pid, props: f.properties, lon, lat, feature: f};
      });
      perfEnd('stations-iterate');
      
      // GeoJSONソースとレイヤの作成
      perfStart('stations-map');
      const stationFeatures = Object.values(stations).map(s => {
        return {
          type: 'Feature',
          id: s.id,
          geometry: {
            type: 'Point',
            coordinates: [s.lon, s.lat]
          },
          properties: {
            name: s.props.s || s.props.name || '駅',
            id: s.id,
            line: s.props.n || s.props.route || '',
            type: s.props.t,
            company: s.props.o,
            station_name: s.props.s || '駅'
          }
        };
      });
      
      // tの値が大きい順（降順）にソート
      // 値が大きい = 優先度が低い = 下（裏）に描画
      // 値が小さい = 優先度が高い = 上（表）に描画
      stationFeatures.sort((a, b) => {
        const typeA = a.properties.type || 0;
        const typeB = b.properties.type || 0;
        return typeB - typeA;
      });
      
      perfEnd('stations-map');
      
      // ソースを追加
      if(!this.map.getSource('stations')) {
        perfStart('stations-add-source');
        this.map.addSource('stations', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: stationFeatures
          },
          buffer: 0
        });
        perfEnd('stations-add-source');
      }
      
      // 駅レイヤを追加（ズームレベル0から常に表示）
      if(!this.map.getLayer(this.stationsLayerId)) {
        perfStart('stations-add-layer');
        this.map.addLayer({
          id: this.stationsLayerId,
          type: 'circle',
          source: 'stations',
          minzoom: 0,
          maxzoom: 24,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              [
                'match',
                ['get', 'type'],
                1, 10,
                2, 8,
                3, 6,
                4, 6,
                5, 6,
                8
              ],
              [
                'match',
                ['get', 'type'],
                1, 8,
                2, 6,
                3, 4,
                4, 4,
                5, 4,
                6
              ]
            ],
            'circle-color': [
              'match',
              ['get', 'type'],
              1, 'rgb(255, 0, 0)',
              2, 'rgb(0, 170, 0)',
              3, 'rgb(0, 0, 255)',
              4, 'rgb(255, 153, 0)',
              5, 'rgb(153, 0, 255)',
              'rgb(0, 119, 204)'
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
            'circle-opacity': 1
          }
        });
        perfEnd('stations-add-layer');
      }
      
      perfEnd('stations-parse');
    } catch(e) {
      console.error('[Error] loadStationsWithData failed:', e);
      throw e;
    }
  }



  // 鉄道線路レイヤの作成と追加（新版：データをパラメータで受け取る）
  async loadRailsWithData(railFC) {
    try {
      perfStart('rails-parse');
      
      // CRS detection
      const railCrsName = railFC.crs && railFC.crs.properties && railFC.crs.properties.name || '';
      const railIs3857 = railCrsName.indexOf('3857') !== -1;

      perfStart('rails-transform');
      const railFeatures = [];
      
      railFC.features.forEach(f => {
        const coords = f.geometry.coordinates;
        
        // MultiLineString の場合は各ラインセグメントを個別のFeatureに
        if(f.geometry.type === 'MultiLineString') {
          // MultiLineString: [[[x,y], [x,y], ...], [[x,y], ...]]
          coords.forEach(lineCoords => {
            let processedCoords;
            if(railIs3857) {
              processedCoords = lineCoords.map(pair => {
                const [x, y] = proj4('EPSG:3857', 'WGS84', pair);
                return [x, y];
              });
            } else {
              processedCoords = lineCoords;
            }
            
            const lineDirection = this._calculateLineDirection(processedCoords);
            
            railFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: processedCoords
              },
              properties: {
                type: f.properties.t,
                name: f.properties.n || '線路',
                direction: lineDirection
              }
            });
          });
        } else {
          // LineString: [[x,y], [x,y], ...]
          let processedCoords;
          if(railIs3857) {
            processedCoords = coords.map(pair => {
              const [x, y] = proj4('EPSG:3857', 'WGS84', pair);
              return [x, y];
            });
          } else {
            processedCoords = coords;
          }
          
          const lineDirection = this._calculateLineDirection(processedCoords);
          
          railFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: processedCoords
            },
            properties: {
              type: f.properties.t,
              name: f.properties.n || '線路',
              direction: lineDirection
            }
          });
        }
      });
      
      // tの値が大きい順（降順）にソート
      // 値が大きい = 優先度が低い = 下（裏）に描画
      // 値が小さい = 優先度が高い = 上（表）に描画
      railFeatures.sort((a, b) => {
        const typeA = a.properties.type || 0;
        const typeB = b.properties.type || 0;
        return typeB - typeA;
      });
      
      perfEnd('rails-transform');

      // ソースを追加
      if(!this.map.getSource('rails')) {
        perfStart('rails-add-source');
        this.map.addSource('rails', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: railFeatures
          },
          buffer: 0
        });
        perfEnd('rails-add-source');
      }
      
      // レイヤを追加
      if(!this.map.getLayer(this.railLayerId)) {
        perfStart('rails-add-layer');
        this.map.addLayer({
          id: this.railLayerId,
          type: 'line',
          source: 'rails',
          minzoom: 0,
          maxzoom: 24,
          paint: {
            'line-color': [
              'match',
              ['get', 'type'],
              1, 'rgb(255, 0, 0)',
              2, 'rgb(0, 170, 0)',
              3, 'rgb(0, 0, 255)',
              4, 'rgb(255, 153, 0)',
              5, 'rgb(153, 0, 255)',
              'rgb(0, 119, 204)'
            ],
            'line-width': [
              'match',
              ['get', 'type'],
              1, 4,
              2, 2,
              1
            ]
          }
        });
        perfEnd('rails-add-layer');
      }
      
      perfEnd('rails-parse');
    } catch(e) {
      console.error('[Error] loadRailsWithData failed:', e);
      throw e;
    }
  }

  // 都道府県・市区町村ラベルレイヤの作成と追加
  // 都道府県: ズームレベル 0-11 で表示
  // 市区町村: ズームレベル 11-24 で表示
  async loadPrefectureAndTownLabels(prefectureFC, townFC) {
    try {
      // === 都道府県ラベルレイヤ ===
      if (prefectureFC && prefectureFC.features && prefectureFC.features.length > 0) {
        // 都道府県ソースを追加
        if(!this.map.getSource('prefecture')) {
          this.map.addSource('prefecture', {
            type: 'geojson',
            data: prefectureFC
          });
        } else {
          this.map.getSource('prefecture').setData(prefectureFC);
        }

        // 都道府県ラベルレイヤを追加（ズーム 0-11）
        if(!this.map.getLayer('prefecture-label-layer')) {
          this.map.addLayer({
            id: 'prefecture-label-layer',
            type: 'symbol',
            source: 'prefecture',
            minzoom: 0,
            maxzoom: 11,
            layout: {
              'text-field': ['get', 'n'],
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
              'text-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 20,
                5, 24,
                8, 28,
                11, 32
              ],
              'text-allow-overlap': false,
              'text-ignore-placement': true
            },
            paint: {
              'text-color': '#333333',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
              'text-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 0.3,
                6, 0.6,
                11, 0.8
              ]
            }
          });
        }
      }

      // === 市区町村ラベルレイヤ ===
      if (townFC && townFC.features && townFC.features.length > 0) {
        // 市区町村ソースを追加
        if(!this.map.getSource('town')) {
          this.map.addSource('town', {
            type: 'geojson',
            data: townFC
          });
        } else {
          this.map.getSource('town').setData(townFC);
        }

        // 市区町村ラベルレイヤを追加（ズーム 11-24）
        if(!this.map.getLayer('town-label-layer')) {
          this.map.addLayer({
            id: 'town-label-layer',
            type: 'symbol',
            source: 'town',
            minzoom: 11,
            maxzoom: 24,
            layout: {
              'text-field': ['get', 'n'],
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
              'text-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11, 12,
                13, 13,
                16, 14,
                24, 16
              ],
              'text-allow-overlap': false,
              'text-ignore-placement': false
            },
            paint: {
              'text-color': '#555555',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.2,
              'text-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 0.3,
                13, 0.65,
                16, 0.9
              ]
            }
          });
        }
      }

      if(window.AppConfig.debug.enabled) {
        console.log('[DEBUG] Prefecture and town labels loaded successfully');
      }
    } catch(e) {
      console.warn('[Warn] Failed to load prefecture and town labels:', e);
    }
  }

  // 路線テキストラベルレイヤを追加
  addRailLabels() {
    try {
      // ラベルレイヤを追加
      if(!this.map.getLayer('rail-label-layer')) {
        this.map.addLayer({
          id: 'rail-label-layer',
          type: 'symbol',
          source: 'rails',
          minzoom: 13,
          maxzoom: 24,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13, 11,
              16, 14,
              20, 16
            ],
            'text-rotation-alignment': 'viewport',
            'text-pitch-alignment': 'viewport',
            'symbol-placement': 'line',
            'text-keep-upright': true,
            'text-offset': ['literal', [0, -1.5]],
            'text-anchor': 'center'
          },
          paint: {
            'text-color': [
              'match',
              ['get', 'type'],
              1, 'rgb(255, 0, 0)',
              2, 'rgb(0, 170, 0)',
              3, 'rgb(0, 0, 255)',
              4, 'rgb(255, 153, 0)',
              5, 'rgb(153, 0, 255)',
              'rgb(0, 119, 204)'
            ],
            'text-halo-color': '#fff',
            'text-halo-width': 2,
            'text-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 0.3,
              13, 0.5,
              16, 0.8
            ]
          }
        });
      }
    } catch(e) {
      console.warn('[Warn] Failed to add rail labels:', e);
    }
  }

  // 線の方向を計算（-180度 ~ 180度）
  _calculateLineDirection(coords) {
    if(coords.length < 2) return 0;
    
    const start = coords[0];
    const end = coords[coords.length - 1];
    
    // 最初と最後の座標から方向を計算
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // -180 ~ 180 の範囲に正規化
    if(angle > 180) angle -= 360;
    if(angle < -180) angle += 360;
    
    return angle;
  }
  addIsochrones(allIsochroneFeatures, colors, STEP_MIN, MAX_MIN, gradientType = 'positive') {
    this.clearIsochrones();
    this.heatmapGradientType = gradientType;
    
    // === ヒートマップレイヤの作成（全ズームレベルで表示） ===
    // 【最適化】余分なプロパティを除外、必要最小限のデータのみ保持
    const heatmapFeatures = allIsochroneFeatures.map(f => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: f.geometry.coordinates
      },
      properties: {
        remaining_cost_seconds: f.properties.remaining_cost_seconds
      }
    }));
    
    // ヒートマップ用ソース
    if(!this.map.getSource('isochrones-heatmap')) {
      this.map.addSource('isochrones-heatmap', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: heatmapFeatures
        }
      });
    } else {
      this.map.getSource('isochrones-heatmap').setData({
        type: 'FeatureCollection',
        features: heatmapFeatures
      });
    }
    
    // ヒートマップレイヤを追加（全ズームレベルで表示）
    // 海・陸より上、建物・道路より下に配置するため、buildingレイヤの前に挿入
    if(!this.map.getLayer(this.isochronesHeatmapLayerId)) {
      this.map.addLayer({
        id: this.isochronesHeatmapLayerId,
        type: 'heatmap',
        source: 'isochrones-heatmap',
        minzoom: 0,
        maxzoom: 24,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            9, 4
          ],
          'heatmap-color': HEATMAP_GRADIENTS[gradientType],
          // 1秒=1mのスケールで固定
          // 残り秒数（メートル）をズームレベルに応じてピクセルに変換
          // 係数: 2^(zoom-8) / 156543.03（Web Mercator投影）
          // linearで滑らかに補間
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, ['*', ['get', 'remaining_cost_seconds'], 0.000018],
            1, ['*', ['get', 'remaining_cost_seconds'], 0.000036],
            2, ['*', ['get', 'remaining_cost_seconds'], 0.000072],
            3, ['*', ['get', 'remaining_cost_seconds'], 0.000144],
            4, ['*', ['get', 'remaining_cost_seconds'], 0.000288],
            5, ['*', ['get', 'remaining_cost_seconds'], 0.000576],
            6, ['*', ['get', 'remaining_cost_seconds'], 0.001152],
            7, ['*', ['get', 'remaining_cost_seconds'], 0.002304],
            8, ['*', ['get', 'remaining_cost_seconds'], 0.0048],
            9, ['*', ['get', 'remaining_cost_seconds'], 0.0096],
            10, ['*', ['get', 'remaining_cost_seconds'], 0.0192],
            11, ['*', ['get', 'remaining_cost_seconds'], 0.0384],
            12, ['*', ['get', 'remaining_cost_seconds'], 0.0768],
            13, ['*', ['get', 'remaining_cost_seconds'], 0.1536],
            14, ['*', ['get', 'remaining_cost_seconds'], 0.3072],
            15, ['*', ['get', 'remaining_cost_seconds'], 0.6144],
            16, ['*', ['get', 'remaining_cost_seconds'], 1.2288],
            17, ['*', ['get', 'remaining_cost_seconds'], 2.4576],
            18, ['*', ['get', 'remaining_cost_seconds'], 4.9152],
            19, ['*', ['get', 'remaining_cost_seconds'], 9.8304],
            20, ['*', ['get', 'remaining_cost_seconds'], 19.6608]
          ],
          'heatmap-opacity': 0.5
        }
      }, 'building');
    } else {
      // レイヤが既に存在する場合はグラデーションを更新
      this.map.setPaintProperty(this.isochronesHeatmapLayerId, 'heatmap-color', HEATMAP_GRADIENTS[gradientType]);
    }
    
    // === 到達コスト用の別ソースを作成（駅ソースを修正しない） ===
    // 到達圏フィーチャから直接ラベル用フィーチャを生成
    // 【最適化】矢印関数と簡潔なプロパティ定義で生成効率化
    const labelFeatures = allIsochroneFeatures
      .filter(f => !f.properties.is_origin)  // 開始地点は除外
      .map(f => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: f.geometry.coordinates
        },
        properties: {
          cost_minutes: Math.round(f.properties.cost_seconds / 60 * 10) / 10
        }
      }));
    
    // コスト表示用の専用ソース
    if(!this.map.getSource('isochrones-cost-labels')) {
      this.map.addSource('isochrones-cost-labels', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: labelFeatures
        }
      });
    } else {
      this.map.getSource('isochrones-cost-labels').setData({
        type: 'FeatureCollection',
        features: labelFeatures
      });
    }
    
    // コスト表示用ラベルレイヤ
    const stationLabelLayerId = 'stations-cost-label-layer';
    if(!this.map.getLayer(stationLabelLayerId)) {
      this.map.addLayer({
        id: stationLabelLayerId,
        type: 'symbol',
        source: 'isochrones-cost-labels',
        minzoom: 12,
        maxzoom: 24,
        layout: {
          'text-field': '{cost_minutes}分',
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-ignore-placement': false
        },
        paint: {
          'text-color': '#000',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0.3,
            12, 0.7,
            16, 0.95
          ]
        }
      });
    } else {
      // レイヤが存在する場合はデータのみ更新
      this.map.getSource('isochrones-cost-labels').setData({
        type: 'FeatureCollection',
        features: labelFeatures
      });
    }
  }

  // 到達圏レイヤの削除
  clearIsochrones() {
    if(this.map.getLayer(this.isochronesPointLayerId)) {
      this.map.removeLayer(this.isochronesPointLayerId);
    }
    if(this.map.getLayer(this.isochronesHeatmapLayerId)) {
      this.map.removeLayer(this.isochronesHeatmapLayerId);
    }
    if(this.map.getLayer('isochrones-label-layer')) {
      this.map.removeLayer('isochrones-label-layer');
    }
    if(this.map.getLayer('stations-cost-label-layer')) {
      this.map.removeLayer('stations-cost-label-layer');
    }
    if(this.map.getSource('isochrones-labels')) {
      this.map.removeSource('isochrones-labels');
    }
    if(this.map.getSource('isochrones-cost-labels')) {
      this.map.removeSource('isochrones-cost-labels');
    }
  }

  // ズーム変更時のレイヤ表示制御
  updateLayersByZoom() {
    const zoom = Math.round(this.map.getZoom());
    
    // 【最適化】駅マーカーのフィルター変更時のみ setFilter を呼び出し
    if(this.map.getLayer(this.stationsLayerId)) {
      // ズームレベル12以上：フィルター不要（すべて表示）
      // ズームレベル12未満：t=1のみ表示
      let newFilter;
      if(zoom >= 12) {
        newFilter = null;
      } else {
        newFilter = ['==', ['get', 'type'], 1];
      }
      
      // フィルター変更判定（毎回 setFilter を呼ぶのは無駄）
      const filterChanged = !this._lastStationFilter || 
                           JSON.stringify(newFilter) !== JSON.stringify(this._lastStationFilter);
      if(filterChanged) {
        this.map.setFilter(this.stationsLayerId, newFilter);
        this._lastStationFilter = newFilter;
      }
    }
  }
  
  /**
   * 【最適化】レイヤズームレベル範囲の初期化
   * setLayerZoomRange は頻繁に呼ぶと重いため、初期化時のみ実行
   */
  initializeLayerZoomRanges() {
    if(this.map.getLayer(this.isochronesPointLayerId)) {
      this.map.setLayerZoomRange(this.isochronesPointLayerId, 13, 24);
    }
    if(this.map.getLayer(this.isochronesHeatmapLayerId)) {
      this.map.setLayerZoomRange(this.isochronesHeatmapLayerId, 0, 24);
    }
    if(this.map.getLayer('isochrones-label-layer')) {
      this.map.setLayerZoomRange('isochrones-label-layer', 10, 24);
    }
    if(this.map.getLayer('stations-cost-label-layer')) {
      this.map.setLayerZoomRange('stations-cost-label-layer', 12, 24);
    }
    if(this.map.getLayer('stations-label-layer')) {
      this.map.setLayerZoomRange('stations-label-layer', 10, 24);
    }
    if(this.map.getLayer('rail-label-layer')) {
      this.map.setLayerZoomRange('rail-label-layer', 13, 24);
    }
    // 都道府県ラベル: ズーム 0-11
    if(this.map.getLayer('prefecture-label-layer')) {
      this.map.setLayerZoomRange('prefecture-label-layer', 0, 12);
    }
    // 市区町村ラベル: ズーム 11-24
    if(this.map.getLayer('town-label-layer')) {
      this.map.setLayerZoomRange('town-label-layer', 10, 24);
    }
  }

  /**
   * ヒートマップのグラデーションを切り替える
   * @param {string} gradientType - 'positive' または 'negative'
   */
  switchHeatmapGradient(gradientType) {
    if(!HEATMAP_GRADIENTS[gradientType]) {
      console.warn(`[Warn] Invalid gradient type: ${gradientType}`);
      return;
    }
    
    this.heatmapGradientType = gradientType;
    
    if(this.map.getLayer(this.isochronesHeatmapLayerId)) {
      this.map.setPaintProperty(this.isochronesHeatmapLayerId, 'heatmap-color', HEATMAP_GRADIENTS[gradientType]);
    }
  }

  /**
   * 【最適化】メルカトル補正表現をキャッシュして効率化
   * @param {number} correctionValue - 補正係数
   */
  applyHeatmapCorrectionIfChanged(correctionValue) {
    // 補正値が変わっていなければ何もしない
    if(this._lastCorrectionValue === correctionValue) {
      return;
    }
    
    // 補正値が変わった場合のみ setPaintProperty を呼び出し
    if(!this.map.getLayer(this.isochronesHeatmapLayerId)) {
      return;
    }
    
    const expr = window.MercatorCorrection.generateFixedCorrectionExpression(correctionValue);
    this.map.setPaintProperty(this.isochronesHeatmapLayerId, 'heatmap-radius', expr);
    this._lastCorrectionValue = correctionValue;
  }

  // ポップアップシステムの設定（PC版：ホバー、モバイル版：タップ）
  /**
   * 完全に一致した座標を持つすべての駅を取得
   * @param {number} targetLng - 対象の経度
   * @param {number} targetLat - 対象の緯度
   * @returns {Array} 一致した駅フィーチャーの配列
   */
  _getStationsAtExactCoordinate(targetLng, targetLat) {
    // すべての駅フィーチャーを取得
    const allStations = this.map.querySourceFeatures('stations', {
      layers: [this.stationsLayerId]
    });

    // 完全に一致した座標の駅をフィルタリング
    const matchedStations = allStations.filter(feature => {
      const coords = feature.geometry.coordinates;
      return coords[0] === targetLng && coords[1] === targetLat;
    });

    return matchedStations;
  }

  enableHoverPopups() {
    // デバイス検出：モバイルの場合はタップで対応
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    this.currentPopup = null;
    this.lastClickedFeature = null; // スマホ版で駅/線路タップを記録
    let lastHoveredId = null;
    let lastMoveTime = 0;
    const THROTTLE_MS = 50; // mousemove を50msごとに実行
    const HIT_BOX_SIZE = this.HIT_BOX_SIZE; // クラスプロパティから参照

    // ===============================
    // PC版: マウスホバーでポップアップ表示
    // ===============================
    if(!isMobile) {
      this.map.on('mousemove', (e) => {
        // throttle処理：高速なmousemove呼び出しを制限
        const now = Date.now();
        if(now - lastMoveTime < THROTTLE_MS) {
          return;
        }
        lastMoveTime = now;

        // マウス位置の周囲範囲のフィーチャーを検出
        const features = this.map.queryRenderedFeatures(
          [
            [e.point.x - HIT_BOX_SIZE, e.point.y - HIT_BOX_SIZE],
            [e.point.x + HIT_BOX_SIZE, e.point.y + HIT_BOX_SIZE]
          ],
          {layers: [this.stationsLayerId, this.railLayerId]}
        );

        let hoveredStation = null;
        let hoveredRail = null;

        // 駅を優先して検索
        if(features && features.length > 0) {
          for(const feature of features) {
            if(feature.layer.id === this.stationsLayerId) {
              hoveredStation = feature;
              break;
            }
          }

          // 駅がなければ線路を探す
          if(!hoveredStation) {
            for(const feature of features) {
              if(feature.layer.id === this.railLayerId) {
                hoveredRail = feature;
                break;
              }
            }
          }
        }

        // ホバー対象のIDを決定
        let hoveredId = null;
        if(hoveredStation) {
          hoveredId = 'station-' + hoveredStation.id;
        } else if(hoveredRail) {
          hoveredId = 'rail-' + hoveredRail.id;
        }

        // 同じものがホバーされている場合はスキップ
        if(lastHoveredId === hoveredId && hoveredId !== null) {
          return;
        }

        // 前のホバー状態をクリア
        if(lastHoveredId) {
          const [type, id] = lastHoveredId.split('-');
          if(type === 'station') {
            this.map.setFeatureState(
              {source: 'stations', id: parseInt(id)},
              {hover: false}
            );
          } else if(type === 'rail') {
            this.map.setFeatureState(
              {source: 'rails', id: id},
              {hover: false}
            );
          }
        }

        lastHoveredId = hoveredId;

        // 新しいホバー状態を設定
        if(hoveredStation) {
          const stationId = hoveredStation.id !== undefined ? hoveredStation.id : hoveredStation.properties?.id;
          if(stationId !== undefined) {
            this.map.setFeatureState(
              {source: 'stations', id: stationId},
              {hover: true}
            );
          }
        } else if(hoveredRail) {
          const railId = hoveredRail.id !== undefined ? hoveredRail.id : hoveredRail.properties?.id;
          if(railId !== undefined) {
            this.map.setFeatureState(
              {source: 'rails', id: railId},
              {hover: true}
            );
          }
        }

        // 既存ポップアップを必ず削除
        if(this.currentPopup) {
          this.currentPopup.remove();
          this.currentPopup = null;
        }

        // 新しいポップアップを表示
        if(hoveredStation) {
          // 完全に一致した座標のすべての駅を取得
          const stationsAtCoord = this._getStationsAtExactCoordinate(
            hoveredStation.geometry.coordinates[0],
            hoveredStation.geometry.coordinates[1]
          );
          
          if(stationsAtCoord.length > 1) {
            // 複数駅がある場合
            this.currentPopup = this._createMultiStationPopup(stationsAtCoord, hoveredStation);
          } else {
            // 単一駅の場合
            this.currentPopup = this._createStationPopup(hoveredStation);
          }
          
          this.currentPopup.addTo(this.map);
        }
        // 路線ポップアップは削除（テキストラベルで表示する）
      });

      // mouseleave時にホバー状態をクリア
      this.map.on('mouseleave', () => {
        // ホバー状態をクリア
        if(lastHoveredId) {
          const [type, id] = lastHoveredId.split('-');
          if(type === 'station') {
            this.map.setFeatureState(
              {source: 'stations', id: parseInt(id)},
              {hover: false}
            );
          } else if(type === 'rail') {
            this.map.setFeatureState(
              {source: 'rails', id: id},
              {hover: false}
            );
          }
        }
        lastHoveredId = null;
        // ポップアップは削除しない - 新しいポップアップ作成時のみ削除される
      });
    }

    // ===============================
    // モバイル版: クリック（タップ）でポップアップ表示
    // ===============================
    else {
      this.map.on('click', (e) => {
        // タップ周囲の広い範囲でフィーチャーを検出
        const features = this.map.queryRenderedFeatures(
          [
            [e.point.x - HIT_BOX_SIZE, e.point.y - HIT_BOX_SIZE],
            [e.point.x + HIT_BOX_SIZE, e.point.y + HIT_BOX_SIZE]
          ],
          {layers: [this.stationsLayerId, this.railLayerId]}
        );

        let clickedStation = null;
        let clickedRail = null;

        // 駅を優先して検索
        if(features && features.length > 0) {
          for(const feature of features) {
            if(feature.layer.id === this.stationsLayerId) {
              clickedStation = feature;
              break;
            }
          }

          // 駅がなければ線路を探す
          if(!clickedStation) {
            for(const feature of features) {
              if(feature.layer.id === this.railLayerId) {
                clickedRail = feature;
                break;
              }
            }
          }
        }

        // 駅または線路をタップした場合
        if(clickedStation || clickedRail) {
          // 駅/線路がタップされたことをフラグで記録
          this.lastClickedFeature = clickedStation || clickedRail;
          
          // 既存ポップアップを削除
          if(this.currentPopup) {
            this.currentPopup.remove();
            this.currentPopup = null;
          }

          // クリックされたフィーチャーのポップアップを表示
          if(clickedStation) {
            // 完全に一致した座標のすべての駅を取得
            const stationsAtCoord = this._getStationsAtExactCoordinate(
              clickedStation.geometry.coordinates[0],
              clickedStation.geometry.coordinates[1]
            );
            
            if(stationsAtCoord.length > 1) {
              // 複数駅がある場合
              this.currentPopup = this._createMultiStationPopup(stationsAtCoord, clickedStation);
            } else {
              // 単一駅の場合
              this.currentPopup = this._createStationPopup(clickedStation);
            }
            
            this.currentPopup.addTo(this.map);
          }
          // 路線ポップアップは削除（テキストラベルで表示する）
        } else {
          // 駅/線路がない空いている場所をタップした場合
          this.lastClickedFeature = null;
          
          if(this.currentPopup) {
            this.currentPopup.remove();
            this.currentPopup = null;
          }
        }
      });
    }
  }

  /**
   * 複数駅のポップアップを作成
   * type と station_name が一致している駅のグループをまとめて表示
   * 同じグループ内の line と company を「・」で連結
   * @param {Array} stationsAtCoord - 同じ座標の駅フィーチャー配列
   * @param {Object} primaryStation - クリック/ホバーされた駅
   * @returns {maplibregl.Popup} ポップアップオブジェクト
   */
  _createMultiStationPopup(stationsAtCoord, primaryStation) {
    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      width: 140px;
    `;

    // type と station_name が一致しているグループを作成
    const typeStationGroups = {};
    stationsAtCoord.forEach((stationFeature) => {
      const type = stationFeature.properties.type || 'unknown';
      const stationName = stationFeature.properties.station_name || '駅';
      const groupKey = `${type}||${stationName}`; // type と station_name で複合キーを作成
      
      if(!typeStationGroups[groupKey]) {
        typeStationGroups[groupKey] = [];
      }
      typeStationGroups[groupKey].push(stationFeature);
    });

    // 垂直方向にグループを並べるコンテナ
    const groupsContainer = document.createElement('div');
    groupsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0;
    `;

    // 各グループ（タイプ＋駅名ごと）の行を作成
    const groupEntries = Object.entries(typeStationGroups);
    groupEntries.forEach((entry, groupIndex) => {
      const stations = entry[1];

      const stationName = stations[0].properties.station_name || '駅';
      const stationType = stations[0].properties.type;
      const colorRGB = getStationColor(stationType);
      const bgColor = `rgb(${colorRGB[0]},${colorRGB[1]},${colorRGB[2]})`;

      // 路線名（n）を「・」で連結（重複を除く）
      const linesSet = new Set(stations.map(s => s.properties.line || '線路'));
      const lines = Array.from(linesSet).join('・');
      
      // 運営会社（o）を「・」で連結（重複を除く）
      const companiesSet = new Set(stations.map(s => s.properties.company || '不明'));
      const companies = Array.from(companiesSet).join('・');

      const groupRow = document.createElement('div');
      groupRow.style.cssText = `
        display: flex;
        flex-direction: column;
        ${groupIndex > 0 ? 'border-top: 1px solid #e0e0e0;' : ''}
      `;

      groupRow.innerHTML = `
        <div class="stationPopupHeader" style="background: ${bgColor}; padding: 8px; font-weight: bold; color: white;">${stationName}駅</div>
        <div class="stationPopupLine" style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f0f0f0; word-wrap: break-word;">${lines}</div>
        <div class="stationPopupCompany" style="padding: 6px 8px; font-size: 12px; color: #666;">${companies}</div>
      `;

      groupsContainer.appendChild(groupRow);
    });

    container.appendChild(groupsContainer);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -15]
    });

    popup.setDOMContent(container);
    popup.setLngLat([primaryStation.geometry.coordinates[0], primaryStation.geometry.coordinates[1]]);

    return popup;
  }

  // 駅ポップアップの作成
  _createStationPopup(stationFeature) {
    const stationType = stationFeature.properties.type;
    const colorRGB = getStationColor(stationType);
    const bgColor = `rgb(${colorRGB[0]},${colorRGB[1]},${colorRGB[2]})`;
    const stationName = stationFeature.properties.station_name || '駅';
    const line = stationFeature.properties.line || '線路';
    const company = stationFeature.properties.company || '会社';

    const div = document.createElement('div');
    div.style.cssText = `
      background: white;
      padding: 0;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      min-width: 140px;
    `;
    div.innerHTML = `
      <div class="stationPopupHeader" style="background: ${bgColor};">${stationName}駅</div>
      <div class="stationPopupLine">${line}</div>
      <div class="stationPopupCompany">${company}</div>
    `;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -15]
    });

    popup.setDOMContent(div);
    popup.setLngLat([stationFeature.geometry.coordinates[0], stationFeature.geometry.coordinates[1]]);

    return popup;
  }

  // 線路ポップアップの作成
  _createRailPopup(railFeature, lngLat) {
    const line = railFeature.properties.name || '線路';

    const div = document.createElement('div');
    div.className = 'railPopup';
    div.textContent = line;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -10]
    });

    popup.setDOMContent(div);
    popup.setLngLat(lngLat);

    return popup;
  }

  // 空港レイヤの作成と追加
  async loadAirportsWithData(airportFC) {
    try {
      perfStart('airports-parse');
      
      // CRS detection and conversion
      const airportCrsName = airportFC.crs && airportFC.crs.properties && airportFC.crs.properties.name || '';
      const airportIs3857 = airportCrsName.indexOf('3857') !== -1;
      
      perfStart('airports-iterate');
      const airportFeatures = [];
      
      airportFC.features.forEach(f => {
        const coords = f.geometry.coordinates;
        let lon, lat;
        
        if(airportIs3857) {
          const lonlat = proj4('EPSG:3857','WGS84', coords);
          lon = lonlat[0];
          lat = lonlat[1];
        } else {
          lon = coords[0];
          lat = coords[1];
        }
        
        airportFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          properties: {
            name: f.properties.n || '空港',
            id: f.properties.id || ''
          }
        });
      });
      perfEnd('airports-iterate');
      
      // ソースを追加
      if(!this.map.getSource('airports')) {
        perfStart('airports-add-source');
        this.map.addSource('airports', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: airportFeatures
          },
          buffer: 0
        });
        perfEnd('airports-add-source');
      }
      
      // SVG アイコン画像を登録
      const iconImage = this._createAirportIcon();
      if(!this.map.hasImage('airport-icon')) {
        this.map.addImage('airport-icon', iconImage, { sdf: false });
      }
      
      // 空港シンボルレイヤを追加
      const airportSymbolLayerId = 'airports-symbol-layer';
      if(!this.map.getLayer(airportSymbolLayerId)) {
        perfStart('airports-add-symbol-layer');
        this.map.addLayer({
          id: airportSymbolLayerId,
          type: 'symbol',
          source: 'airports',
          minzoom: 0,
          maxzoom: 24,
          layout: {
            'icon-image': 'airport-icon',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 0.4,
              8, 0.6,
              15, 0.8
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 1
          }
        });
        perfEnd('airports-add-symbol-layer');
      }
      
      // 空港名ラベルレイヤを追加（ズームレベル 12 以上で表示）
      const airportLabelLayerId = 'airports-label-layer';
      if(!this.map.getLayer(airportLabelLayerId)) {
        perfStart('airports-add-label-layer');
        this.map.addLayer({
          id: airportLabelLayerId,
          type: 'symbol',
          source: 'airports',
          minzoom: 12,
          maxzoom: 24,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 10,
              18, 14
            ],
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5
          }
        });
        perfEnd('airports-add-label-layer');
      }
      
      perfEnd('airports-parse');
    } catch(e) {
      console.error('[Error] loadAirportsWithData failed:', e);
      throw e;
    }
  }

  async loadFerriesWithData(ferryFC) {
    try {
      perfStart('ferries-parse');
      
      // CRS detection and conversion
      const ferryCrsName = ferryFC.crs && ferryFC.crs.properties && ferryFC.crs.properties.name || '';
      const ferryIs3857 = ferryCrsName.indexOf('3857') !== -1;
      
      perfStart('ferries-iterate');
      const ferryFeatures = [];
      
      ferryFC.features.forEach(f => {
        const coords = f.geometry.coordinates;
        let lon, lat;
        
        if(ferryIs3857) {
          const lonlat = proj4('EPSG:3857','WGS84', coords);
          lon = lonlat[0];
          lat = lonlat[1];
        } else {
          lon = coords[0];
          lat = coords[1];
        }
        
        ferryFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          properties: {
            name: f.properties.n || 'フェリー',
            id: f.properties.id || ''
          }
        });
      });
      perfEnd('ferries-iterate');
      
      // ソースを追加
      if(!this.map.getSource('ferries')) {
        perfStart('ferries-add-source');
        this.map.addSource('ferries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: ferryFeatures
          },
          buffer: 0
        });
        perfEnd('ferries-add-source');
      }
      
      // SVG アイコン画像を登録
      const iconImage = this._createFerryIcon();
      if(!this.map.hasImage('ferry-icon')) {
        this.map.addImage('ferry-icon', iconImage, { sdf: false });
      }
      
      // フェリーシンボルレイヤを追加
      const ferrySymbolLayerId = 'ferries-symbol-layer';
      if(!this.map.getLayer(ferrySymbolLayerId)) {
        perfStart('ferries-add-symbol-layer');
        this.map.addLayer({
          id: ferrySymbolLayerId,
          type: 'symbol',
          source: 'ferries',
          minzoom: 0,
          maxzoom: 24,
          layout: {
            'icon-image': 'ferry-icon',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 0.4,
              8, 0.6,
              15, 0.8
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 1
          }
        });
        perfEnd('ferries-add-symbol-layer');
      }
      
      // フェリー名ラベルレイヤを追加（ズームレベル 12 以上で表示）
      const ferryLabelLayerId = 'ferries-label-layer';
      if(!this.map.getLayer(ferryLabelLayerId)) {
        perfStart('ferries-add-label-layer');
        this.map.addLayer({
          id: ferryLabelLayerId,
          type: 'symbol',
          source: 'ferries',
          minzoom: 12,
          maxzoom: 24,
          layout: {
            'text-field': ['concat', ['get', 'name'], '港'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 10,
              18, 14
            ],
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5
          }
        });
        perfEnd('ferries-add-label-layer');
      }
      
      perfEnd('ferries-parse');
    } catch(e) {
      console.error('[Error] loadFerriesWithData failed:', e);
      throw e;
    }
  }

  _createFerryIcon() {
    const width = 32;
    const height = 32;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // 背景を透明にする
    ctx.clearRect(0, 0, width, height);
    
    // 黒い錨のアイコン（絵文字⚓️ スタイル - 中サイズで太めに）
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(width / 2, height / 2);
    
    // 上部のリング（1.2倍にスケール）
    ctx.beginPath();
    ctx.arc(0, -8.4, 2.4, 0, Math.PI * 2);
    ctx.stroke();
    
    // シャフト（中央の軸）
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 4.2);
    ctx.stroke();
    
    // 左の爪（カーブして上に反る - 1.2倍にスケール）
    ctx.beginPath();
    ctx.moveTo(0, 4.2);
    ctx.bezierCurveTo(-3.6, 7.2, -6, 5.4, -6, 1.8);
    ctx.stroke();
    
    // 右の爪（カーブして上に反る - 1.2倍にスケール）
    ctx.beginPath();
    ctx.moveTo(0, 4.2);
    ctx.bezierCurveTo(3.6, 7.2, 6, 5.4, 6, 1.8);
    ctx.stroke();
    
    ctx.restore();
    
    // Canvas から ImageData を取得して返す
    return ctx.getImageData(0, 0, width, height);
  }

  // 空港アイコンの SVG 画像を作成
  _createAirportIcon() {
    const width = 32;
    const height = 32;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // 背景を透明にする
    ctx.clearRect(0, 0, width, height);
    
    // 黒い飛行機アイコン（主翼に角度をつけたリアルなデザイン）
    ctx.fillStyle = '#000000';
    ctx.save();
    ctx.translate(width / 2, height / 2);
    
    // 胴体（細い筒状）
    ctx.beginPath();
    ctx.fillRect(-1.5, -8, 3, 14);
    ctx.fill();
    
    // 前部（コックピット - 丸い先端）
    ctx.beginPath();
    ctx.arc(0, -8, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 主翼（V字に角度をつけたリアルな形 - 外側が下、さらに大きめ）
    // 左翼
    ctx.beginPath();
    ctx.moveTo(-11, 1.5);
    ctx.lineTo(-1.5, -2);
    ctx.lineTo(-1.5, 2);
    ctx.lineTo(-11, 2.5);
    ctx.closePath();
    ctx.fill();
    
    // 右翼
    ctx.beginPath();
    ctx.moveTo(11, 1.5);
    ctx.lineTo(1.5, -2);
    ctx.lineTo(1.5, 2);
    ctx.lineTo(11, 2.5);
    ctx.closePath();
    ctx.fill();
    
    // 垂直尾翼（ファーストラック）
    ctx.beginPath();
    ctx.moveTo(-1.5, 6);
    ctx.lineTo(1.5, 6);
    ctx.lineTo(1.5, 9);
    ctx.lineTo(-1.5, 9);
    ctx.closePath();
    ctx.fill();
    
    // 水平尾翼（小さな後部翼）
    ctx.beginPath();
    ctx.fillRect(-5, 7, 10, 2.5);
    ctx.fill();
    
    ctx.restore();
    
    // Canvas から ImageData を取得して返す
    return ctx.getImageData(0, 0, width, height);
  }

  // スケールバーを追加
  addScaleControl() {
    try {
      const scaleControl = new maplibregl.ScaleControl({
        maxWidth: 200,
        unit: 'metric'
      });
      this.map.addControl(scaleControl, 'bottom-left');
    } catch(e) {
      console.warn('[Warn] Failed to add scale control:', e);
    }
  }
}
