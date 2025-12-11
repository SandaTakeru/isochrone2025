// assets/isochrone.js
// 到達圏計算ロジック

class IsochroneCalculator {
  constructor(WALK_KMH, STEP_MIN, MAX_MIN) {
    this.WALK_KMH = WALK_KMH;
    this.STEP_MIN = STEP_MIN;
    this.MAX_MIN = MAX_MIN;
    this.DEBUG = false;
  }

  setDebug(debug) {
    this.DEBUG = debug;
  }

  // 最寄りの駅を見つける
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

  // 最寄りの駅を複数取得（最大10件）
  findNearestStations(origin, stations, maxCandidates = 10) {
    const originPt = turf.point([origin[0], origin[1]]);
    const candidates = [];
    
    // すべての駅との距離を計算
    for(const sid in stations) {
      const s = stations[sid];
      const d = turf.distance(originPt, turf.point([s.lon, s.lat]), {units: 'meters'});
      candidates.push({
        nodeId: Number(sid),
        distM: d
      });
    }
    
    // 距離でソート（昇順）
    candidates.sort((a, b) => a.distM - b.distM);
    
    // 最大10件を取得
    return candidates.slice(0, Math.min(maxCandidates, candidates.length));
  }

  // 到達圏フィーチャの生成
  generateIsochroneFeatures(costs, stations) {
    const colors = colorRamp(Math.ceil(this.MAX_MIN / this.STEP_MIN));
    const allIsochroneFeatures = [];
    const maxSeconds = this.MAX_MIN * 60;
    
    for(const sid in stations) {
      const sidNum = Number(sid);
      const c = costs[sidNum];
      
      if(c === undefined || c > maxSeconds) continue;
      
      // 到達時間に基づいて色を決定
      const minutes = c / 60;
      const timeStep = Math.ceil(minutes / this.STEP_MIN);
      const color = colors[Math.min(timeStep - 1, colors.length - 1)];
      
      // 残りコスト（秒）を計算
      const remainingCostSeconds = maxSeconds - c;
      
      // ポイント特性として駅を追加
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
          cost_seconds: c,
          remaining_cost_seconds: remainingCostSeconds,
          max_seconds: maxSeconds
        }
      });
    }
    
    return { features: allIsochroneFeatures, colors };
  }

  // デバッグ用テーブルの作成
  buildDebugTable(costs, stations) {
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

  // 計算後のログ出力
  logComputationResult(origin, nearestNodeId, nearestDistM, allIsochroneFeatures) {
    if(this.DEBUG) {
      console.groupCollapsed('[DEBUG] Isochrone compute start');
      console.log('origin:', {lon: origin[0], lat: origin[1]});
      console.log('nearestNodeId:', nearestNodeId, 'nearestDistM(m):', Math.round(nearestDistM));
    }
    
    if(this.DEBUG) console.log(`[DEBUG] Generated ${allIsochroneFeatures.length} isochrone point features`);
  }
}
