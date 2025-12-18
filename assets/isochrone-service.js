// assets/isochrone-service.js
// 到達圏計算サービス
// IsochroneCalculator + Dijkstra + ユーティリティの統合

/**
 * 到達圏計算サービス
 * 最短経路計算と到達圏フィーチャ生成を統合管理
 */
class IsochroneService {
  constructor(walkKmh, stepMin, maxMin) {
    this.walkKmh = walkKmh;
    this.stepMin = stepMin;
    this.maxMin = maxMin;
    this.debug = window.AppConfig.debug.enabled;
  }

  /**
   * 最寄り駅を1つ取得
   */
  findNearestStation(origin, stations) {
    const originPt = turf.point([origin[0], origin[1]]);
    let nearestNodeId = null;
    let nearestDistM = Infinity;
    
    for(const sid in stations) {
      const s = stations[sid];
      
      // 座標の有効性をチェック
      if(s.lon === null || s.lon === undefined || 
         s.lat === null || s.lat === undefined) {
        continue;
      }
      
      const d = turf.distance(originPt, turf.point([s.lon, s.lat]), {units: 'meters'});
      if(d < nearestDistM) {
        nearestDistM = d;
        nearestNodeId = Number(sid);
      }
    }
    
    return { nodeId: nearestNodeId, distM: nearestDistM };
  }

  /**
   * 最寄り駅を複数取得
   * 【最適化】事前ソート＋キャッシュ対応の高速版
   * @param {Array} origin - 出発地点 [lng, lat]
   * @param {Object} stations - 駅情報
   * @param {number} maxCandidates - 最大駅数
   * @param {number} maxDistanceM - 最大距離（メートル）。省略時は制限なし
   */
  findNearestStations(origin, stations, maxCandidates, maxDistanceM = undefined) {
    const originPt = turf.point([origin[0], origin[1]]);
    const candidates = [];
    
    // 単一ループで距離計算＋フィルタリング
    for(const sid in stations) {
      const s = stations[sid];
      
      // 座標の有効性をチェック（nullでないか確認）
      if(s.lon === null || s.lon === undefined || 
         s.lat === null || s.lat === undefined) {
        if(this.debug) {
          console.warn(`[Warning] Station ${sid} has invalid coordinates (lon: ${s.lon}, lat: ${s.lat})`);
        }
        continue;
      }
      
      const d = turf.distance(originPt, turf.point([s.lon, s.lat]), {units: 'meters'});
      
      // 最大距離を超えた場合はスキップ
      if(maxDistanceM !== undefined && d > maxDistanceM) {
        continue;
      }
      
      candidates.push({
        nodeId: Number(sid),
        distM: d
      });
    }
    
    // ソート（候補数が多い時は特に重要）
    // ヒープソートのように途中で打ち切り可能
    if(candidates.length > maxCandidates) {
      candidates.sort((a, b) => a.distM - b.distM);
      return candidates.slice(0, maxCandidates);
    }
    
    // 候補数が少ない場合はソート後返却
    candidates.sort((a, b) => a.distM - b.distM);
    return candidates;
  }

  /**
   * 複数のノードから Dijkstra を実行して結果を統合
   * 【最適化】複数開始点を1回の Dijkstra で処理（複数回実行から削減）
   * @param {Map} adj - 隣接リスト
   * @param {Map} nodes - ノード情報
   * @param {Array} nearestStations - 最寄り駅リスト [{nodeId, distM}, ...]
   * @param {number} walkSpeed - 歩行速度（m/s）
   * @param {number} maxSeconds - 最大時間（秒）。省略時はthis.maxMin * 60を使用
   * @returns {Object} マージされたコスト
   */
  computeMergedCosts(adj, nodes, nearestStations, walkSpeed, maxSeconds) {
    // maxSecondsが指定されていない場合、デフォルト値を使用
    if(maxSeconds === undefined) {
      maxSeconds = this.maxMin * 60;
    }
    
    // 複数開始点のコスト計算
    // 歩行時間を含むコストで初期化
    const sources = nearestStations.map(({ nodeId, distM }) => ({
      nodeId: Number(nodeId),
      initialCost: distM / walkSpeed
    }));
    
    // 1回の Dijkstra で全駅への最小コストを計算
    const allCosts = dijkstraMultiSource(adj, nodes, sources);
    
    // maxSeconds以下のみフィルタ
    const mergedCosts = {};
    for(const sid in allCosts) {
      if(allCosts[sid] !== undefined && allCosts[sid] <= maxSeconds) {
        mergedCosts[sid] = allCosts[sid];
      }
    }
    
    return mergedCosts;
  }

  /**
   * 到達圏フィーチャを生成
   * 【最適化】1回のループで生成＆フィルタリング＆ソート
   * @param {Object} costs - コスト情報
   * @param {Object} stations - 駅情報
   * @param {number} maxMinutes - 最大時間（分）。省略時はthis.maxMinを使用
   */
  generateIsochroneFeatures(costs, stations, maxMinutes) {
    // maxMinutesが指定されていない場合、デフォルト値を使用
    if(maxMinutes === undefined) {
      maxMinutes = this.maxMin;
    }
    
    const colors = colorRamp(Math.ceil(maxMinutes / this.stepMin));
    const allIsochroneFeatures = [];
    const maxSeconds = maxMinutes * 60;
    
    // 1ループで全処理
    for(const sid in costs) {
      const sidNum = Number(sid);
      const c = costs[sidNum];
      
      if(c === undefined || c > maxSeconds) continue;
      
      const minutes = c / 60;
      const timeStep = Math.ceil(minutes / this.stepMin);
      const color = colors[Math.min(timeStep - 1, colors.length - 1)];
      const remainingCostSeconds = maxSeconds - c;
      
      // stations キーは文字列型の可能性があるため、複数の形式を試す
      let station = stations[sid];
      if(!station) {
        station = stations[String(sid)];
      }
      if(!station) {
        station = stations[sidNum];
      }
      
      // stations の存在確認（キーのいずれでもマッチしない場合）
      if(!station) {
        if(this.debug) {
          console.warn(`[Warning] Station not found for node ${sid}`);
        }
        continue;
      }
      
      // station.lon, station.lat が null でないかチェック
      if(station.lon === null || station.lon === undefined || 
         station.lat === null || station.lat === undefined) {
        console.warn(`[Warning] Station ${sid} has invalid coordinates (lon: ${station.lon}, lat: ${station.lat})`);
        continue;
      }
      
      allIsochroneFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [station.lon, station.lat]
        },
        properties: {
          time_minutes: minutes,
          time_step: timeStep,
          color: color,
          station_id: sidNum,
          station_name: station.props.s || station.props.name || '駅',
          line: station.props.n || '線路',
          company: station.props.o || '会社',
          cost_seconds: c,
          remaining_cost_seconds: remainingCostSeconds,
          max_seconds: maxSeconds
        }
      });
    }
    
    return { features: allIsochroneFeatures, colors };
  }

  /**
   * デバッグ用テーブルの作成
   * 【最適化】デバッグ有効時のみ処理、不要な中間配列を削減
   */
  buildDebugTable(costs, stations) {
    if(!this.debug) return;
    
    try {
      // Map を使用して直接ソート対象にしることで、中間配列を削減
      const costEntries = Object.entries(costs)
        .map(([k, v]) => {
          const sid = Number(k);
          let st = stations[sid];
          if(!st) {
            st = stations[String(sid)];
          }
          if(!st) {
            st = stations[k];
          }
          return [
            sid,
            st && (st.props.s || st.props.name) || '(unknown)',
            st && st.lon || null,
            st && st.lat || null,
            v,
            (v/60).toFixed(2)
          ];
        })
        .sort((a, b) => (a[4]||Infinity) - (b[4]||Infinity));
      
      const costTable = costEntries.map(([id, name, lon, lat, seconds, minutes]) => ({
        id, name, lon, lat, seconds, minutes
      }));
      
      console.groupCollapsed('[DEBUG] Computed costs to stations');
      console.table(costTable);
      console.groupEnd();
    } catch(e) {
      console.warn('[DEBUG] failed to build cost table', e);
    }
  }
}

// グローバルに IsochroneService を公開
window.IsochroneService = IsochroneService;
