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
   */
  findNearestStations(origin, stations, maxCandidates) {
    const originPt = turf.point([origin[0], origin[1]]);
    const candidates = [];
    
    for(const sid in stations) {
      const s = stations[sid];
      const d = turf.distance(originPt, turf.point([s.lon, s.lat]), {units: 'meters'});
      candidates.push({
        nodeId: Number(sid),
        distM: d
      });
    }
    
    candidates.sort((a, b) => a.distM - b.distM);
    return candidates.slice(0, Math.min(maxCandidates, candidates.length));
  }

  /**
   * 複数のノードから Dijkstra を実行して結果を統合
   * @param {Map} adj - 隣接リスト
   * @param {Map} nodes - ノード情報
   * @param {Array} nearestStations - 最寄り駅リスト
   * @param {number} walkSpeed - 歩行速度（m/s）
   * @param {number} maxSeconds - 最大時間（秒）。省略時はthis.maxMin * 60を使用
   * @returns {Object} マージされたコスト
   */
  computeMergedCosts(adj, nodes, nearestStations, walkSpeed, maxSeconds) {
    // maxSecondsが指定されていない場合、デフォルト値を使用
    if(maxSeconds === undefined) {
      maxSeconds = this.maxMin * 60;
    }
    
    const mergedCosts = {};
    
    for(const candidate of nearestStations) {
      const { nodeId, distM } = candidate;
      const walkSecToNode = distM / walkSpeed;
      const stationInitial = {};
      stationInitial[Number(nodeId)] = walkSecToNode;
      
      // Dijkstra 計算
      const costs = dijkstraVirtualAdj(adj, nodes, stationInitial);
      
      // 各駅のコストを比較して最小値を保持
      for(const sid in costs) {
        if(costs[sid] !== undefined && costs[sid] <= maxSeconds) {
          if(mergedCosts[sid] === undefined || costs[sid] < mergedCosts[sid]) {
            mergedCosts[sid] = costs[sid];
          }
        }
      }
    }
    
    return mergedCosts;
  }

  /**
   * 到達圏フィーチャを生成
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
    
    for(const sid in stations) {
      const sidNum = Number(sid);
      const c = costs[sidNum];
      
      if(c === undefined || c > maxSeconds) continue;
      
      const minutes = c / 60;
      const timeStep = Math.ceil(minutes / this.stepMin);
      const color = colors[Math.min(timeStep - 1, colors.length - 1)];
      const remainingCostSeconds = maxSeconds - c;
      
      allIsochroneFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [stations[sid].lon, stations[sid].lat]
        },
        properties: {
          time_minutes: minutes,
          time_step: timeStep,
          color: color,
          station_id: sidNum,
          station_name: stations[sid].props.N02_005 || stations[sid].props.name || '駅',
          line: stations[sid].props.N02_003 || '線路',
          company: stations[sid].props.N02_004 || '会社',
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
   */
  buildDebugTable(costs, stations) {
    if(!this.debug) return;
    
    try {
      const costTable = Object.keys(costs).map(k => {
        const sid = Number(k);
        const st = stations[sid];
        return {
          id: sid,
          name: st && (st.props.N02_005 || st.props.name) || '(unknown)',
          lon: st && st.lon,
          lat: st && st.lat,
          seconds: costs[k],
          minutes: (costs[k]/60).toFixed(2)
        };
      }).sort((a,b) => (a.seconds||Infinity) - (b.seconds||Infinity));
      
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
