// assets/dijkstra.js
// Dijkstra最短経路アルゴリズムとプリミティブデータ構造

// Tiny binary heap
function TinyQueue() {
  this.data = [];
  this.length = 0;
}

TinyQueue.prototype.push = function(x) {
  this.data.push(x);
  this.length++;
  this._up(this.length - 1);
};

TinyQueue.prototype.pop = function() {
  if(this.length === 0) return undefined;
  const top = this.data[0];
  const last = this.data.pop();
  this.length--;
  if(this.length > 0) {
    this.data[0] = last;
    this._down(0);
  }
  return top;
};

TinyQueue.prototype._up = function(i) {
  let j = i;
  while(j > 0) {
    const p = Math.floor((j-1)/2);
    if(this.data[p].dist <= this.data[j].dist) break;
    [this.data[p], this.data[j]] = [this.data[j], this.data[p]];
    j = p;
  }
};

TinyQueue.prototype._down = function(i) {
  let j = i;
  while(true) {
    const l = 2*j + 1;
    const r = l + 1;
    let smallest = j;
    if(l < this.length && this.data[l].dist < this.data[smallest].dist) smallest = l;
    if(r < this.length && this.data[r].dist < this.data[smallest].dist) smallest = r;
    if(smallest === j) break;
    [this.data[j], this.data[smallest]] = [this.data[smallest], this.data[j]];
    j = smallest;
  }
};

// Dijkstra algorithm
function dijkstraVirtualAdj(adj, nodes, stationInitial) {
  const dist = {};
  const visited = new Set();
  const pq = new TinyQueue();

  for(const [id] of nodes) {
    dist[id] = Infinity;
  }

  for(const sid in stationInitial) {
    const s = Number(sid);
    if(dist[s] === undefined) continue;
    dist[s] = stationInitial[s];
    pq.push({node: s, dist: dist[s]});
  }

  while(pq.length > 0) {
    const {node: u, dist: du} = pq.pop();
    if(visited.has(u)) continue;
    visited.add(u);

    if(!adj.has(u)) continue;
    for(const {to: v, cost: c} of adj.get(u)) {
      const dv = du + c;
      if(dv < dist[v]) {
        dist[v] = dv;
        pq.push({node: v, dist: dv});
      }
    }
  }

  return dist;
}
