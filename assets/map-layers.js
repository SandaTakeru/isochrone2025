// assets/map-layers.js
// レイヤ管理とマップコンポーネント

class MapLayerManager {
  constructor(map) {
    this.map = map;
    this.stationsLayerId = 'stations-layer';
    this.railLayerId = 'rail-layer';
    this.isochronesPointLayerId = 'isochrones-point-layer';
    this.isochronesHeatmapLayerId = 'isochrones-heatmap-layer';
    this.HIT_BOX_SIZE = 15; // タップ判定エリアサイズ（ピクセル）
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
          geometry: {
            type: 'Point',
            coordinates: [s.lon, s.lat]
          },
          properties: {
            name: s.props.N02_005 || s.props.name || '駅',
            id: s.id,
            line: s.props.N02_003 || s.props.route || '',
            type: s.props.N02_002,
            company: s.props.N02_004,
            station_name: s.props.N02_005 || '駅'
          }
        };
      });
      
      // N02_002の値が大きい順（降順）にソート
      // 値が大きい = 優先度が低い = 下（裏）に描画
      // 値が小さい = 優先度が高い = 上（表）に描画
      stationFeatures.sort((a, b) => {
        const typeA = parseInt(a.properties.type) || 0;
        const typeB = parseInt(b.properties.type) || 0;
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
      
      // レイヤを追加
      if(!this.map.getLayer(this.stationsLayerId)) {
        perfStart('stations-add-layer');
        this.map.addLayer({
          id: this.stationsLayerId,
          type: 'circle',
          source: 'stations',
          minzoom: 10,
          maxzoom: 24,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              8,
              6
            ],
            'circle-color': [
              'match',
              ['get', 'type'],
              '1', 'rgb(255, 0, 0)',
              '2', 'rgb(0, 170, 0)',
              '3', 'rgb(0, 0, 255)',
              '4', 'rgb(255, 153, 0)',
              '5', 'rgb(153, 0, 255)',
              '6', 'rgb(255, 0, 153)',
              '7', 'rgb(0, 255, 255)',
              '8', 'rgb(255, 255, 0)',
              'rgb(0, 119, 204)'
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
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
      const railFeatures = railFC.features.map(f => {
        const coords = f.geometry.coordinates;
        
        let processedCoords;
        if(railIs3857) {
          // バッチ処理でproj4変換を高速化
          processedCoords = coords.map(pair => {
            const [x, y] = proj4('EPSG:3857', 'WGS84', pair);
            return [x, y];
          });
        } else {
          processedCoords = coords;
        }
        
        // 線の方向を計算（最初と最後の座標から）
        const lineDirection = this._calculateLineDirection(processedCoords);
        
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: processedCoords
          },
          properties: {
            type: f.properties.N02_002,
            name: f.properties.N02_003 || '線路',
            direction: lineDirection
          }
        };
      });
      
      // N02_002の値が大きい順（降順）にソート
      // 値が大きい = 優先度が低い = 下（裏）に描画
      // 値が小さい = 優先度が高い = 上（表）に描画
      railFeatures.sort((a, b) => {
        const typeA = parseInt(a.properties.type) || 0;
        const typeB = parseInt(b.properties.type) || 0;
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
              '1', 'rgb(255, 0, 0)',
              '2', 'rgb(0, 170, 0)',
              '3', 'rgb(0, 0, 255)',
              '4', 'rgb(255, 153, 0)',
              '5', 'rgb(153, 0, 255)',
              '6', 'rgb(255, 0, 153)',
              '7', 'rgb(0, 255, 255)',
              '8', 'rgb(255, 255, 0)',
              'rgb(0, 119, 204)'
            ],
            'line-width': 2
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
              13, 9,
              16, 12,
              20, 14
            ],
            'text-rotation-alignment': 'viewport',
            'text-pitch-alignment': 'viewport',
            'symbol-placement': 'line',
            'text-keep-upright': true,
            'text-offset': ['literal', [0, -1.5]],
            'text-anchor': 'center'
          },
          paint: {
            'text-color': 'rgba(0, 0, 0, 0.75)',
            'text-halo-color': 'rgba(255, 255, 255, 0.9)',
            'text-halo-width': 1.2
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
  addIsochrones(allIsochroneFeatures, colors, STEP_MIN, MAX_MIN) {
    this.clearIsochrones();
    
    // === ヒートマップレイヤの作成（全ズームレベルで表示） ===
    const heatmapFeatures = allIsochroneFeatures.map(f => {
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: f.geometry.coordinates
        },
        properties: {
          remaining_cost_seconds: f.properties.remaining_cost_seconds,
          cost_seconds: f.properties.cost_seconds,
          max_seconds: f.properties.max_seconds
        }
      };
    });
    
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
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(255, 255, 255, 0)',
            0.2, 'rgba(255, 220, 100, 1)',
            1, 'rgba(100, 255, 60, 1)'
          ],
          // 1秒=1mのスケールで固定
          // 残り秒数（メートル）をズームレベルに応じてピクセルに変換
          // 係数: 2^(zoom-8) / 156543.03（Web Mercator投影）
          // linearで滑らかに補間
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, ['*', ['get', 'remaining_cost_seconds'], 0.000006],
            1, ['*', ['get', 'remaining_cost_seconds'], 0.000012],
            2, ['*', ['get', 'remaining_cost_seconds'], 0.000024],
            3, ['*', ['get', 'remaining_cost_seconds'], 0.000048],
            4, ['*', ['get', 'remaining_cost_seconds'], 0.000096],
            5, ['*', ['get', 'remaining_cost_seconds'], 0.000192],
            6, ['*', ['get', 'remaining_cost_seconds'], 0.000384],
            7, ['*', ['get', 'remaining_cost_seconds'], 0.000768],
            8, ['*', ['get', 'remaining_cost_seconds'], 0.0016],
            9, ['*', ['get', 'remaining_cost_seconds'], 0.0032],
            10, ['*', ['get', 'remaining_cost_seconds'], 0.0064],
            11, ['*', ['get', 'remaining_cost_seconds'], 0.0128],
            12, ['*', ['get', 'remaining_cost_seconds'], 0.0256],
            13, ['*', ['get', 'remaining_cost_seconds'], 0.0512],
            14, ['*', ['get', 'remaining_cost_seconds'], 0.1024],
            15, ['*', ['get', 'remaining_cost_seconds'], 0.2048],
            16, ['*', ['get', 'remaining_cost_seconds'], 0.4096],
            17, ['*', ['get', 'remaining_cost_seconds'], 0.8192],
            18, ['*', ['get', 'remaining_cost_seconds'], 1.6384],
            19, ['*', ['get', 'remaining_cost_seconds'], 3.2768],
            20, ['*', ['get', 'remaining_cost_seconds'], 6.5536]
          ],
          'heatmap-opacity': 0.5
        }
      }, 'building');
    }
    
    // === 到達コスト用の別ソースを作成（駅ソースを修正しない） ===
    // 到達圏フィーチャから直接ラベル用フィーチャを生成
    const labelFeatures = allIsochroneFeatures.map(f => {
      const costSeconds = f.properties.cost_seconds;
      const costMinutes = Math.round(costSeconds / 60 * 10) / 10;
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: f.geometry.coordinates
        },
        properties: {
          cost_minutes: costMinutes,
          station_id: f.properties.station_id
        }
      };
    });
    
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
        minzoom: 10,
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
          'text-opacity': 0.95
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
      this.map.setLayerZoomRange('stations-cost-label-layer', 10, 24);
    }
    if(this.map.getLayer('stations-label-layer')) {
      this.map.setLayerZoomRange('stations-label-layer', 10, 24);
    }
    // 路線テキストラベルレイヤをズームレベルに応じて表示制御
    if(this.map.getLayer('rail-label-layer')) {
      this.map.setLayerZoomRange('rail-label-layer', 13, 24);
    }
  }

  // ポップアップシステムの設定（PC版：ホバー、モバイル版：タップ）
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
          hoveredId = 'station-' + hoveredStation.properties.id;
        } else if(hoveredRail) {
          hoveredId = 'rail-' + hoveredRail.id;
        }

        // 同じものがホバーされている場合はスキップ
        if(lastHoveredId === hoveredId && hoveredId !== null) {
          return;
        }

        lastHoveredId = hoveredId;

        // 既存ポップアップを必ず削除
        if(this.currentPopup) {
          this.currentPopup.remove();
          this.currentPopup = null;
        }

        // 新しいポップアップを表示
        if(hoveredStation) {
          this.currentPopup = this._createStationPopup(hoveredStation);
          this.currentPopup.addTo(this.map);
        }
        // 路線ポップアップは削除（テキストラベルで表示する）
      });

      // mouseleave時にポップアップを削除しない（新しいポップアップ作成時のみ削除）
      this.map.on('mouseleave', () => {
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
            this.currentPopup = this._createStationPopup(clickedStation);
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
}
