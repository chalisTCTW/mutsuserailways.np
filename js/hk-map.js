/* hk-map.js — 路線圖（示意圖）：以車站「實際座標」為底，每段線路吸附到 8 個方向（水平、垂直、45°）。
 * 作法（2026-10 第三版，0.17.0）：
 *   1. 每段連線先取實際方位角；分歧站（3 條以上）的每條線分配到「彼此不同、順序不變」的方向。
 *   2. 兩個分歧／終點之間的車站鏈，用動態規劃（Viterbi）決定每一段的方向：偏離實際方位越小越好，轉折越少越好
 *      → 實際上緩緩彎曲的線路會變成「一條直線＋少數轉折」，不會每站就左右鋸齒。
 *   3. 以最小平方法解出所有車站的位置：每條線必須沿著它的方向（垂直分量為 0）、長度接近目標值（長距離壓縮、短距離照比例）、
 *      並被輕輕拉回實際位置（所以整體形狀與地圖一致，不會憑空折返）。
 *   4. 多組參數各算一次（固定，不含隨機），挑「交叉、過近、轉折、偏離實際方位」綜合分數最低者。
 * 每次載入都重算（約數十毫秒），所以路網更新後版面一定同步更新。沒有 DOM 相依，Node 也能跑。
 * 手動固定：layout.json 的 override { "車站中文名": [格x, 格y] }（格＝12px）視為固定點。 */
(function (root) {
  'use strict';
  const GRID = 12, SQ = Math.SQRT1_2;
  const DIRS8 = [[1, 0], [SQ, SQ], [0, 1], [-SQ, SQ], [-1, 0], [-SQ, -SQ], [0, -1], [SQ, -SQ]];
  const angIdx = (dx, dy) => { const a = Math.atan2(dy, dx) / (Math.PI / 4); return ((a % 8) + 8) % 8; };
  const cdiff = (a, b) => { let d = Math.abs(a - b) % 8; return d > 4 ? 8 - d : d; };
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * vx, cy = ay + t * vy;
    return { d: Math.hypot(px - cx, py - cy), cx, cy, t };
  }
  /** 解稠密線性方程組（高斯消去，部分選主元）。A 為 n×n（會被修改）。 */
  function solve(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (p !== c) { const t = A[c]; A[c] = A[p]; A[p] = t; const tb = b[c]; b[c] = b[p]; b[p] = tb; }
      const d = A[c][c] || 1e-9;
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / (A[r][r] || 1e-9); }
    return x;
  }

  /** 把 A→B 畫成「沿指定方向 d＋最多一次 45° 轉折」；殘差在 2.5px 內直接畫直線。A、Bq 為 [x,y]。 */
  function decompose(A, Bq, d) {
    const vx = Bq[0] - A[0], vy = Bq[1] - A[1], u = DIRS8[d];
    if (Math.abs(vx * u[1] - vy * u[0]) < 2.5 && vx * u[0] + vy * u[1] > 0) return [A, Bq];
    const tries = [(d + 1) % 8, (d + 7) % 8, (d + 2) % 8, (d + 6) % 8];
    let best = null;
    for (const d2 of tries) {
      const w = DIRS8[d2], det = u[0] * w[1] - u[1] * w[0]; if (Math.abs(det) < 1e-6) continue;
      const a = (vx * w[1] - vy * w[0]) / det, c = (u[0] * vy - u[1] * vx) / det;
      if (a >= -0.5 && c >= -0.5) { const cost = (cdiff(d, d2) === 1 ? 0 : 1) + (a < 4 || c < 4 ? 2 : 0); if (!best || cost < best.cost) best = { cost, a: Math.max(0, a), c: Math.max(0, c), d2 }; }
    }
    if (!best) return [A, Bq];
    const mid = [A[0] + u[0] * best.a, A[1] + u[1] * best.a];
    return [A, mid, Bq];
  }

  /* 1.1.2：高速鉄道的路線圖線形——跟一般鐵路共用「只接受 45°／90° 單位轉彎」的畫法（decompose），
   * 但不參與一般鐵路的最小平方法位置求解：車站位置完全沿用一般鐵路排好的結果（H.edges／layoutOnce 算出的 pos），
   * 高速鉄道只在既有站位之間，另外挑一個貼近實際方位、轉折最少的方向畫線——這樣可以保證「一般鐵路的線形優先」：
   * 不管高速鉄道怎麼繞，都不會回頭去動一般鐵路已經排好的車站位置或線形。
   * 做法跟 layoutOnce 的步驟 1～2 一樣（分歧站分配方向、車站鏈用 Viterbi 選轉折最少的方向），只是跳過步驟 3
   * 的位置求解（因為站位是「借」一般鐵路的，不能動），直接用 decompose 把兩個既有站位接成折線。
   * 1.9.4：前輩指出——上羽本線（一般路線，已經在 H.edges／一般拓樸裡）跟高速鉄道上羽線直通車（isHS）現在共用同一段
   * 實體軌道（新勝守～上羽神別～…～汐崎），兩者都會各畫一條線，變成兩條平行的獨立路線，但實際上是同一段軌道，這樣不對。
   * 修正：高速鉄道的虛線疊加只畫在「一般拓樸裡還沒有這對站」的路段（例如地圖外延伸段）；只要這對站已經有一般路線的
   * 實體連線（H.edges），就不再另外疊一條高速鉄道虛線——用同一條線代表兩者共用軌道，車站的「可轉乘」徽章與時刻表
   * 本來就會正確列出高速鉄道也有停靠，不會漏資訊。 */
  /** 1.9.4：判斷高速鉄道的一段直通／跳站連線（a→b）是不是「其實是借用一般鐵路已經鋪好的同一段軌道」：
   *  從 a 出發，只要沿途都是「單純過路站」（在一般拓樸 H.adj 裡分支數 ≤2，不是轉乘樞紐）就能走到 b，
   *  就代表這整段在一般路網裡本來就是一條沒有分岔的直線——高速鉄道只是在這段track上「不停某些站」，
   *  不是真的另外一條獨立軌道，所以不用再疊一條高速鉄道虛線，直接讓一般路線的線形代表這一段即可。
   *  a（起點）本身可以是分岔站（不限制分支數），只有「中間經過的站」才要求是單純過路站。 */
  function hsChordCovered(adj, a, b, maxHops) {
    if (a === b) return false;
    let frontier = [a]; const visited = new Set([a]);
    for (let hop = 0; hop < (maxHops || 24); hop++) {
      const next = [];
      for (const cur of frontier) {
        for (const nb of (adj.get(cur) || [])) {
          if (nb.to === b) return true;
          if (visited.has(nb.to)) continue;
          if ((adj.get(nb.to) || []).length <= 2) { visited.add(nb.to); next.push(nb.to); }
        }
      }
      if (!next.length) return false;
      frontier = next;
    }
    return false;
  }
  function layoutHsPaths(H, pos) {
    const all = (H.hsEdges || []).filter(e => e.a !== e.b && pos.has(e.a) && pos.has(e.b) && !hsChordCovered(H.adj, e.a, e.b) && !hsChordCovered(H.adj, e.b, e.a));
    const ids = [...new Set(all.flatMap(e => [e.a, e.b]))];
    const vidx = new Map(ids.map((id, i) => [id, i]));
    const n = ids.length, m = all.length;
    const adj = Array.from({ length: n }, () => []);
    const E = all.map((e, k) => { const i = vidx.get(e.a), j = vidx.get(e.b); adj[i].push({ to: j, k }); adj[j].push({ to: i, k }); return { i, j }; });
    if (!m) return [];
    const geo = E.map(e => angIdx(pos.get(ids[e.j]).x - pos.get(ids[e.i]).x, pos.get(ids[e.j]).y - pos.get(ids[e.i]).y));
    const seen = (k, v) => E[k].i === v ? geo[k] : (geo[k] + 4) % 8;
    const dirOf = new Array(m).fill(-1);
    const dirFrom = (k, v) => dirOf[k] < 0 ? -1 : (E[k].i === v ? dirOf[k] : (dirOf[k] + 4) % 8);
    const setFrom = (k, v, d) => { dirOf[k] = E[k].i === v ? d : (d + 4) % 8; };
    const B = 2.5;
    const turnCost = t => t < 0.5 ? 0 : t < 1.5 ? B : t < 2.5 ? 2.5 * B : t < 3.5 ? 6 * B : 12 * B;
    // 分歧站（含「高速鉄道有停＋一般路網轉乘」節點）：每條線分到不同方向，順序不變（跟 layoutOnce 步驟 1 相同）
    const junc = [...Array(n).keys()].filter(v => adj[v].length >= 3).sort((a, b) => adj[b].length - adj[a].length);
    for (const v of junc) {
      const inc = adj[v].map(a => ({ k: a.k, g: seen(a.k, v), lock: dirFrom(a.k, v) })).sort((a, b) => a.g - b.g);
      const kk = inc.length; if (kk > 8) continue;
      let best = null;
      const subsets = [];
      (function pick(start, cur) { if (cur.length === kk) { subsets.push(cur.slice()); return; } for (let d = start; d < 8; d++) { cur.push(d); pick(d + 1, cur); cur.pop(); } })(0, []);
      for (const S of subsets) for (let r = 0; r < kk; r++) {
        let cost = 0;
        inc.forEach((x, t) => { const d = S[(t + r) % kk]; cost += cdiff(x.g, d) ** 2 + (x.lock >= 0 && x.lock !== d ? 100 : 0); });
        if (!best || cost < best.cost) best = { cost, S, r };
      }
      if (best) inc.forEach((x, t) => setFrom(x.k, v, best.S[(t + best.r) % kk]));
    }
    // 車站鏈：兩個分歧／終點之間，用 Viterbi 決定每段方向（跟 layoutOnce 步驟 2 相同）
    const visited = new Array(m).fill(false), chains = [];
    const walk = (a, first) => {
      const nodes = [a], ks = [first.k]; visited[first.k] = true;
      let cur = first.to; nodes.push(cur);
      while (adj[cur].length === 2) {
        const nx = adj[cur].find(x => !visited[x.k]); if (!nx) break;
        visited[nx.k] = true; ks.push(nx.k); cur = nx.to; nodes.push(cur);
      }
      chains.push({ nodes, ks });
    };
    for (let v = 0; v < n; v++) if (adj[v].length !== 2) for (const a of adj[v]) if (!visited[a.k]) walk(v, a);
    for (let k = 0; k < m; k++) if (!visited[k]) walk(E[k].i, { to: E[k].j, k });
    for (const ch of chains) {
      const T = ch.ks.length;
      const g = ch.ks.map((k, t) => seen(k, ch.nodes[t]));
      const force = ch.ks.map((k, t) => dirFrom(k, ch.nodes[t]));
      const cost = [], from = [];
      for (let t = 0; t < T; t++) {
        cost.push(new Float64Array(8)); from.push(new Int8Array(8));
        for (let d = 0; d < 8; d++) {
          let u = cdiff(g[t], d) ** 2; if (force[t] >= 0 && force[t] !== d) u += 1e6;
          if (t === 0) { cost[t][d] = u; continue; }
          let bc = Infinity, bd = 0;
          for (let p = 0; p < 8; p++) { const c = cost[t - 1][p] + turnCost(cdiff(p, d)); if (c < bc) { bc = c; bd = p; } }
          cost[t][d] = bc + u; from[t][d] = bd;
        }
      }
      let d = 0, bc = Infinity; for (let q = 0; q < 8; q++) if (cost[T - 1][q] < bc) { bc = cost[T - 1][q]; d = q; }
      for (let t = T - 1; t >= 0; t--) { setFrom(ch.ks[t], ch.nodes[t], d); d = from[t][d]; }
    }
    for (let k = 0; k < m; k++) if (dirOf[k] < 0) dirOf[k] = Math.round(geo[k]) % 8;
    return E.map((e, k) => {
      const A = [pos.get(ids[e.i]).x, pos.get(ids[e.i]).y], Bp = [pos.get(ids[e.j]).x, pos.get(ids[e.j]).y];
      return { a: all[k].a, b: all[k].b, pts: decompose(A, Bp, dirOf[k]), walk: !!all[k].walk };
    });
  }

  /** 一組參數的版面。 */
  function layoutOnce(H, opts, prm) {
    opts = opts || {};
    const st = H.stations, n = st.length, idx = new Map(st.map((s, i) => [s.id, i]));
    const PAD = 90;
    const E = [];
    H.edges.forEach(e => { const i = idx.get(e.a), j = idx.get(e.b); if (i != null && j != null && i !== j) E.push({ i, j, real: Math.max(1, e.len), e }); });
    const m = E.length;
    const adj = Array.from({ length: n }, () => []);
    E.forEach((e, k) => { adj[e.i].push({ to: e.j, k }); adj[e.j].push({ to: e.i, k }); });
    // 實際方位（從 i 看 j）：z 往下＝畫面 y 往下，所以北在上
    const geo = E.map(e => angIdx(st[e.j].x - st[e.i].x, st[e.j].z - st[e.i].z));
    const seen = (k, v) => E[k].i === v ? geo[k] : (geo[k] + 4) % 8;     // 從 v 看這條線的方位
    const dirOf = new Array(m).fill(-1);                                    // 方向（從 i 看 j）
    const dirFrom = (k, v) => dirOf[k] < 0 ? -1 : (E[k].i === v ? dirOf[k] : (dirOf[k] + 4) % 8);
    const setFrom = (k, v, d) => { dirOf[k] = E[k].i === v ? d : (d + 4) % 8; };
    const B = prm.beta;
    const turnCost = t => t < 0.5 ? 0 : t < 1.5 ? B : t < 2.5 ? 2.5 * B : t < 3.5 ? 6 * B : 12 * B;

    const preset = Array.isArray(prm.dirs) && prm.dirs.length === m ? prm.dirs : null;
    if (preset) for (let k = 0; k < m; k++) dirOf[k] = preset[k];
    // 1. 分歧站：每條線分到不同的方向，順序不變
    const junc = preset ? [] : [...Array(n).keys()].filter(v => adj[v].length >= 3).sort((a, b) => adj[b].length - adj[a].length);
    for (const v of junc) {
      const inc = adj[v].map(a => ({ k: a.k, g: seen(a.k, v), lock: dirFrom(a.k, v) })).sort((a, b) => a.g - b.g);
      const kk = inc.length; if (kk > 8) continue;
      let best = null;
      const subsets = [];
      (function pick(start, cur) { if (cur.length === kk) { subsets.push(cur.slice()); return; } for (let d = start; d < 8; d++) { cur.push(d); pick(d + 1, cur); cur.pop(); } })(0, []);
      for (const S of subsets) for (let r = 0; r < kk; r++) {
        let cost = 0;
        inc.forEach((x, t) => { const d = S[(t + r) % kk]; cost += cdiff(x.g, d) ** 2 + (x.lock >= 0 && x.lock !== d ? 100 : 0); });
        if (!best || cost < best.cost) best = { cost, S, r };
      }
      if (best) inc.forEach((x, t) => setFrom(x.k, v, best.S[(t + best.r) % kk]));
    }

    // 2. 車站鏈：兩個分歧／終點之間，用 Viterbi 決定每段方向（偏離實際少、轉折少）
    const visited = new Array(m).fill(false), chains = [];
    const walk = (a, first) => {
      const nodes = [a], ks = [first.k]; visited[first.k] = true;
      let cur = first.to; nodes.push(cur);
      while (adj[cur].length === 2) {
        const nx = adj[cur].find(x => !visited[x.k]); if (!nx) break;
        visited[nx.k] = true; ks.push(nx.k); cur = nx.to; nodes.push(cur);
      }
      chains.push({ nodes, ks });
    };
    if (!preset) {
    for (let v = 0; v < n; v++) if (adj[v].length !== 2) for (const a of adj[v]) if (!visited[a.k]) walk(v, a);
    for (let k = 0; k < m; k++) if (!visited[k]) walk(E[k].i, { to: E[k].j, k });   // 純環狀
    }
    for (const ch of (preset ? [] : chains)) {
      const T = ch.ks.length;
      const g = ch.ks.map((k, t) => seen(k, ch.nodes[t]));
      const force = ch.ks.map((k, t) => dirFrom(k, ch.nodes[t]));
      const cost = [], from = [];
      for (let t = 0; t < T; t++) {
        cost.push(new Float64Array(8)); from.push(new Int8Array(8));
        for (let d = 0; d < 8; d++) {
          let u = cdiff(g[t], d) ** 2; if (force[t] >= 0 && force[t] !== d) u += 1e6;
          if (t === 0) { cost[t][d] = u; continue; }
          let bc = Infinity, bd = 0;
          for (let p = 0; p < 8; p++) { const c = cost[t - 1][p] + turnCost(cdiff(p, d)); if (c < bc) { bc = c; bd = p; } }
          cost[t][d] = bc + u; from[t][d] = bd;
        }
      }
      let d = 0, bc = Infinity; for (let q = 0; q < 8; q++) if (cost[T - 1][q] < bc) { bc = cost[T - 1][q]; d = q; }
      // 末端若鎖定（另一端分歧站）要符合：把 force 也套到最後一段（上面已含 u 懲罰）
      for (let t = T - 1; t >= 0; t--) { setFrom(ch.ks[t], ch.nodes[t], d); d = from[t][d]; }
    }
    for (let k = 0; k < m; k++) if (dirOf[k] < 0) dirOf[k] = Math.round(geo[k]) % 8;

    // 3. 最小平方法解位置
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    st.forEach(s => { minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); minz = Math.min(minz, s.z); maxz = Math.max(maxz, s.z); });
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 1; };
    const Lt = E.map(e => prm.Lmin + prm.kL * Math.sqrt(e.real));          // 目標長度：長距離壓縮、短距離照比例
    const sc0 = med(Lt) / med(E.map(e => e.real)) * prm.pull;              // 位置牽引用的全域縮放
    const p0 = st.map(s => [(s.x - minx) * sc0 + PAD, (s.z - minz) * sc0 + PAD]);
    const ov = opts.override || {}, fixed = new Map();
    st.forEach((s, i) => { if (ov[s.zh]) fixed.set(i, [ov[s.zh][0] * GRID, ov[s.zh][1] * GRID]); });
    const ml = new Array(m).fill(1);
    let p = null;
    for (let iter = 0; iter < 8; iter++) {
      const N = Array.from({ length: 2 * n }, () => new Float64Array(2 * n)), b = new Float64Array(2 * n);
      const add = (cols, coef, rhs, w) => {       // 一條殘差：Σ coef[c]·x[cols[c]] − rhs，權重 w
        for (let a = 0; a < cols.length; a++) { b[cols[a]] += w * w * coef[a] * rhs; for (let c = 0; c < cols.length; c++) N[cols[a]][cols[c]] += w * w * coef[a] * coef[c]; }
      };
      E.forEach((e, k) => {
        const u = DIRS8[dirOf[k]], nx = -u[1], ny = u[0];
        add([2 * e.j, 2 * e.j + 1, 2 * e.i, 2 * e.i + 1], [nx, ny, -nx, -ny], 0, prm.wn);
        add([2 * e.j, 2 * e.j + 1, 2 * e.i, 2 * e.i + 1], [u[0], u[1], -u[0], -u[1]], Lt[k], prm.wl * ml[k]);
      });
      for (let i = 0; i < n; i++) {
        const f = fixed.get(i), w = f ? 30 : prm.lam, tg = f || p0[i];
        add([2 * i], [1], tg[0], w); add([2 * i + 1], [1], tg[1], w);
      }
      p = solve(N, b);
      let bad = false;
      E.forEach((e, k) => { const u = DIRS8[dirOf[k]], al = (p[2 * e.j] - p[2 * e.i]) * u[0] + (p[2 * e.j + 1] - p[2 * e.i + 1]) * u[1]; if (al < 0.55 * Lt[k] && ml[k] < 40) { ml[k] *= 3; bad = true; } });
      if (!bad) break;
    }
    const pos0 = st.map((s, i) => [p[2 * i], p[2 * i + 1]]);

    // 4. 每條線畫成「沿指定方向＋最多一次 45° 轉折」；殘差在 2.5px 內直接畫直線
    let gx = Infinity, gy = Infinity;
    pos0.forEach(q => { gx = Math.min(gx, q[0]); gy = Math.min(gy, q[1]); });
    const polys = E.map((e, k) => decompose(pos0[e.i], pos0[e.j], dirOf[k]));
    polys.forEach(pl => pl.forEach(q => { gx = Math.min(gx, q[0]); gy = Math.min(gy, q[1]); }));
    const ox = PAD - gx, oy = PAD - gy;
    const pos = new Map(); st.forEach((s, i) => pos.set(s.id, { x: pos0[i][0] + ox, y: pos0[i][1] + oy, i }));
    const paths = E.map((e, k) => ({ a: st[e.i].id, b: st[e.j].id, pts: polys[k].map(q => [q[0] + ox, q[1] + oy]), svcs: e.e.svcs, len: e.e.len }));
    // 孤立站（沒有任何連線）：放在牽引位置
    st.forEach((s, i) => { if (!adj[i].length) pos.set(s.id, { x: p0[i][0] + ox - 0, y: p0[i][1] + oy, i }); });

    // 診斷
    let cross = 0;
    const segs = paths.flatMap((pp, k2) => pp.pts.slice(1).map((q2, mm) => [k2, pp.pts[mm], q2]));
    const ccw = (A2, B2, C2) => (C2[1] - A2[1]) * (B2[0] - A2[0]) - (B2[1] - A2[1]) * (C2[0] - A2[0]);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (segs[i][0] === segs[j][0]) continue;
      const [, a2, b2] = segs[i], [, c2, d2] = segs[j];
      if ([a2, b2].some(u => [c2, d2].some(v => Math.abs(u[0] - v[0]) < 0.6 && Math.abs(u[1] - v[1]) < 0.6))) continue;
      if (ccw(a2, c2, d2) * ccw(b2, c2, d2) < 0 && ccw(a2, b2, c2) * ccw(a2, b2, d2) < 0) cross++;
    }
    let maxX = 0, maxY = 0; pos.forEach(v => { maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); });
    paths.forEach(pp => pp.pts.forEach(q => { maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); }));
    let bends = 0, offGrid = 0;
    paths.forEach(pp => { bends += Math.max(0, pp.pts.length - 2); for (let t = 1; t < pp.pts.length; t++) { const dx = pp.pts[t][0] - pp.pts[t - 1][0], dy = pp.pts[t][1] - pp.pts[t - 1][1]; if (Math.hypot(dx, dy) < 1) continue; const a = angIdx(dx, dy), r = Math.abs(a - Math.round(a)) * 45; if (r > 2.5) offGrid++; } });
    // 度數 2 的車站：前後兩段方向不同＝轉折
    for (let v = 0; v < n; v++) if (adj[v].length === 2) {
      const dirsAt = adj[v].map(a => { const pp = paths[a.k], first = pp.a === st[v].id; const q1 = first ? pp.pts[0] : pp.pts[pp.pts.length - 1], q2 = first ? pp.pts[1] : pp.pts[pp.pts.length - 2]; return angIdx(q2[0] - q1[0], q2[1] - q1[1]); });
      if (cdiff(dirsAt[0], (dirsAt[1] + 4) % 8) > 0.15) bends++;
    }
    let near = 0, touch = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a2 = pos.get(st[i].id), b2 = pos.get(st[j].id), dd = Math.hypot(a2.x - b2.x, a2.y - b2.y); if (dd < 24) near += 3; else if (dd < 44) near++; }
    for (let i = 0; i < n; i++) { const q2 = pos.get(st[i].id); for (const pp of paths) { if (pp.a === st[i].id || pp.b === st[i].id) continue; for (let t = 1; t < pp.pts.length; t++) { const sd = segDist(q2.x, q2.y, pp.pts[t - 1][0], pp.pts[t - 1][1], pp.pts[t][0], pp.pts[t][1]); if (sd.d < 9) touch++; else if (sd.d < 16) near++; } } }
    // 與實際方位的差（度）：越小越貼近真實地圖
    let dev = 0; E.forEach((e, k) => { const a = pos.get(st[e.i].id), c = pos.get(st[e.j].id); dev += cdiff(geo[k], angIdx(c.x - a.x, c.y - a.y)) * 45; });
    dev = m ? dev / m : 0;
    // 1.1.2：高速鉄道線形——借用上面已經排好的一般鐵路車站位置（pos），另外挑一組只接受 45°／90° 轉彎的折線，
    // 完全不影響一般鐵路的 pos／paths／分數（crossings、bends 等診斷值都還是只算一般鐵路），所以一般鐵路的線形永遠優先。
    const hsPaths = layoutHsPaths(H, pos);
    hsPaths.forEach(hp => hp.pts.forEach(q => { maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); }));
    return { pos, paths, hsPaths, width: maxX + PAD, height: maxY + PAD, crossings: cross, bends, offGrid, near, touch, disp: dev, dev, grid: GRID, dirs: dirOf.slice() };
  }

  const COMBOS = (() => {
    const out = [];
    for (const beta of [1.2, 2.5, 4.5]) for (const lam of [0.02, 0.06, 0.15]) for (const Lmin of [38, 46, 54])
      out.push({ beta, lam, Lmin, kL: 0.5, pull: 1.2, wn: 4, wl: 0.7 });
    return out;
  })();
  const scoreOf = r => r.crossings * 1000 + r.touch * 500 + r.near * 90 + r.bends * 45 + r.offGrid * 120 + r.dev * 1.5 + Math.max(0, Math.max(r.width, r.height) - 900) * 0.4;

  /** 邊的穩定鍵（車站 id，不受改名影響）與「從較小 id 看較大 id」的方向。 */
  const edgeKey = (a, b) => (String(a) < String(b) ? a + '~' + b : b + '~' + a);
  function seedOf(H, dirs) {
    const st = H.stations, ok = new Set(st.map(q => q.id)), out = {}; let k = 0;
    H.edges.forEach(e => { if (!ok.has(e.a) || !ok.has(e.b) || e.a === e.b) return; const d = dirs[k++]; out[edgeKey(e.a, e.b)] = String(e.a) < String(e.b) ? d : (d + 4) % 8; });
    return out;
  }
  /** 以舊版面（seed）為起點：沿用還在的連線的方向；新增／改變的連線取實際方位或鄰近舊線的方向，再只對「新線與它的鄰線」做有限次數的區域搜尋（次數固定，不看時間，所以每台裝置結果相同）。 */
  function layoutSeeded(H, opts, prm, seed) {
    const st = H.stations, idx = new Map(st.map((q, i) => [q.id, i]));
    const E = []; H.edges.forEach(e => { const i = idx.get(e.a), j = idx.get(e.b); if (i != null && j != null && i !== j) E.push({ i, j, a: e.a, b: e.b }); });
    const m = E.length, dirs = new Array(m).fill(-1), free = new Array(m).fill(false);
    E.forEach((e, k) => { const sd = seed[edgeKey(e.a, e.b)]; if (sd != null) dirs[k] = String(e.a) < String(e.b) ? sd : (sd + 4) % 8; });
    const geoOf = k => angIdx(st[E[k].j].x - st[E[k].i].x, st[E[k].j].z - st[E[k].i].z);
    const seedAt = new Map();                    // 車站 id → 舊版面中從該站出發的各方向
    Object.keys(seed).forEach(key => { const [u, w] = key.split('~'); const d = seed[key]; (seedAt.get(u) || seedAt.set(u, []).get(u)).push(d); (seedAt.get(w) || seedAt.set(w, []).get(w)).push((d + 4) % 8); });
    for (let k = 0; k < m; k++) if (dirs[k] < 0) {
      free[k] = true; const g = geoOf(k); let pick = Math.round(g) % 8, bd = 9;
      // 新站插進舊線中間時，沿用舊線在這一端的方向（與實際方位相差 ≤45°），線形不變
      const cand = (seedAt.get(String(E[k].a)) || []).concat((seedAt.get(String(E[k].b)) || []).map(d => (d + 4) % 8));
      cand.forEach(d => { const c = cdiff(g, d); if (c <= 1 && c < bd) { bd = c; pick = d; } });
      dirs[k] = pick;
    }
    const withDirs = (d) => Object.assign({}, prm, { dirs: d });
    let best = layoutOnce(H, opts, withDirs(dirs)); best.score = scoreOf(best); best.prm = prm;
    const nFree = free.filter(Boolean).length;
    if (nFree || best.crossings || best.touch || best.near) {
      // 只動：新增的線、與新線相鄰的線；若仍有交叉／過近則放寬到全部。次數固定
      const touchNew = new Set(); E.forEach((e, k) => { if (free[k]) { touchNew.add(k); E.forEach((f, q) => { if (f.i === e.i || f.i === e.j || f.j === e.i || f.j === e.j) touchNew.add(q); }); } });
      const rounds = [[...touchNew], [...Array(m).keys()]];
      let evals = 0; const cap = 700;
      for (const set of rounds) {
        let improved = true, pass = 0;
        while (improved && pass < 4 && evals < cap) {
          improved = false; pass++;
          for (const k of set) {
            if (evals >= cap) break;
            for (const dd of [1, 7, 2, 6]) {
              const d2 = best.dirs.slice(); d2[k] = (d2[k] + dd) % 8;
              const r = layoutOnce(H, opts, withDirs(d2)); evals++; r.score = scoreOf(r); r.prm = prm;
              if (r.score < best.score - 1e-6) { best = r; improved = true; break; }
            }
          }
        }
        if (!best.crossings && !best.touch && !best.near) break;
      }
    }
    best.recipe = { prm, dirs: best.dirs, seed: seedOf(H, best.dirs) };
    return best;
  }

  /** 版面。recipe＝{ prm, dirs }：直接重現（不搜尋）。否則：固定參數組各算一次，再對最好的一組做「逐條線改方向」的區域搜尋，降低交叉、過近與轉折。 */

  /* ════════════════════════════════════════════════════════════════════════
   * 2.4.0 新排版（v3）。舊排版（layoutOnce／COMBOS／區域搜尋）整個保留，
   * 在 site-config.js 把 mapAlgo 設成 'legacy' 就會切回去。
   *
   * 舊排版的兩個問題（前輩回報「加入單軌後地圖整個變形」「中央戸宮被放到很奇怪的地方」）：
   *   (1) 所有車站丟進一組全域最小平方法一次解完，而「沒有直接連線的兩站」之間沒有任何約束，
   *       所以中央戸宮與戸宮（分屬不同線）的相對方位完全沒人管，實測方位差到 147°。
   *   (2) 多一條線就改變整個方程組，加上會試數十組參數挑最低分，常常跳到形狀完全不同的另一組解。
   *       實測加一條線後 64 站有 54 站位置大幅改變。
   *
   * v3 改成兩階段：
   *   階段一 爬山法：從真實座標出發，每個車站只在附近格點微調，只有總成本下降才移動。
   *     成本＝八方向貼合＋邊長一致＋相對位置保持（對地理上最近的鄰居，方位不可以跑掉）
   *           ＋站距＋壓線＋交叉＋轉折＋站外轉乘錨定（CFG.walkLinks 的兩站鎖成固定距離）。
   *     因為每一步都是局部移動，加新線只會擾動附近——實測位移大的站從 54 降到 7。
   *   階段二 最小平方法：用階段一的結果決定方向，再解一次讓每段剛好是 45°／90°。
   *     牽引目標是階段一排好的位置，而且只解一次、不做參數搜尋。
   *
   * 轉彎規則（前輩指定）：車站不可以是轉角，線經過車站必須筆直穿過；方向要改變時，
   * 轉折點落在兩站之間「等比例」的位置。做法是給每個車站一個通過方向，一段 A→B 離開 A 走 u、
   * 抵達 B 走 w；要讓轉折剛好在正中間（兩段等長）＝ B−A 必須平行於 u+w，這條直接寫進最小平方法，
   * 解出來的站位自然滿足。u、w 夾 45° 時弦指向 22.5°，但真正畫出來的兩段仍嚴格是 45°／90°。
   * ════════════════════════════════════════════════════════════════════════ */

  const V3_DEF = {
    iters: 14, radius: 3, target: 70, sep: 4.6, wSep: 60,
    wOcti: 1.6, wLen: 0.9, wRel: 2.6, wOccl: 2.2, wBend: 0.7, wCross: 90,
    wOsi: 26, osiGap: 1.9, wn: 6, wl: 1.0, lam: 0.9
  };
  const V3_COMBOS = [
    {}, { target: 76, sep: 5.0, wSep: 80 }, { target: 76, sep: 5.0, wSep: 80, radius: 4, iters: 20 },
    { wRel: 3.4 }, { target: 66, sep: 4.2, wSep: 50, wRel: 2.2 },
    { target: 82, sep: 5.4, wSep: 100, radius: 4, iters: 20 }
  ];

  /** 階段一：爬山法。回傳格點座標（單位＝GRID）。 */
  function v3Hill(H, opts, P) {
    const st = H.stations, n = st.length, idx = new Map(st.map((s, i) => [s.id, i]));
    const E = [];
    H.edges.forEach(e => { const i = idx.get(e.a), j = idx.get(e.b); if (i != null && j != null && i !== j) E.push({ i, j, e }); });
    const adj = Array.from({ length: n }, () => []);
    E.forEach((e, k) => { adj[e.i].push({ to: e.j, k }); adj[e.j].push({ to: e.i, k }); });

    let minx = Infinity, minz = Infinity;
    st.forEach(s => { minx = Math.min(minx, s.x); minz = Math.min(minz, s.z); });
    const rl = E.map(e => Math.hypot(st[e.j].x - st[e.i].x, st[e.j].z - st[e.i].z)).filter(v => v > 0).sort((a, b) => a - b);
    const sc = P.target / Math.max(1, rl.length ? rl[rl.length >> 1] : 1);
    const pos = st.map(s => [Math.round((s.x - minx) * sc / GRID), Math.round((s.z - minz) * sc / GRID)]);
    const geoDir = E.map(e => angIdx(st[e.j].x - st[e.i].x, st[e.j].z - st[e.i].z));

    const fixed = new Set(), ov = opts.override || {};
    st.forEach((s, i) => { if (ov[s.zh]) { pos[i] = [ov[s.zh][0], ov[s.zh][1]]; fixed.add(i); } });

    // 地理上最近的鄰居（相對位置保持的對象）
    const K = 6, nb = [];
    for (let i = 0; i < n; i++) {
      const ds = [];
      for (let j = 0; j < n; j++) if (j !== i) ds.push([Math.hypot(st[j].x - st[i].x, st[j].z - st[i].z), j]);
      ds.sort((a, b) => a[0] - b[0]);
      nb.push(ds.slice(0, K).map(d => ({ j: d[1], ang: angIdx(st[d[1]].x - st[i].x, st[d[1]].z - st[i].z) })));
    }
    // 站外轉乘錨定
    const osiOf = Array.from({ length: n }, () => []);
    (H.walkLinks || []).forEach(w => {
      const i = idx.get(w.a), j = idx.get(w.b);
      if (i == null || j == null || i === j) return;
      const a = angIdx(st[j].x - st[i].x, st[j].z - st[i].z);
      osiOf[i].push({ to: j, ang: a }); osiOf[j].push({ to: i, ang: (a + 4) % 8 });
    });

    function costAt(i, px, py) {
      let c = 0;
      for (const a of adj[i]) {
        const q = pos[a.to], dx = q[0] - px, dy = q[1] - py, L = Math.hypot(dx, dy);
        if (L < 1e-6) return 1e9;
        const ai = angIdx(dx, dy);
        c += P.wOcti * Math.pow(Math.abs(ai - Math.round(ai)), 2) * 8;
        const want = P.target / GRID;
        c += P.wLen * Math.pow((L - want) / want, 2);
        const g = (E[a.k].i === i) ? geoDir[a.k] : (geoDir[a.k] + 4) % 8;
        c += P.wRel * Math.pow(cdiff(g, ai), 2);
      }
      for (const b of nb[i]) {
        const q = pos[b.j], dx = q[0] - px, dy = q[1] - py;
        if (Math.hypot(dx, dy) < 1e-6) return 1e9;
        c += P.wRel * 0.8 * Math.pow(cdiff(b.ang, angIdx(dx, dy)), 2);
      }
      for (const o of osiOf[i]) {
        const q = pos[o.to], dx = q[0] - px, dy = q[1] - py, L = Math.hypot(dx, dy);
        if (L < 1e-6) return 1e9;
        c += P.wOsi * Math.pow(L - P.osiGap, 2) + P.wOsi * 0.5 * Math.pow(cdiff(o.ang, angIdx(dx, dy)), 2);
      }
      for (let j = 0; j < n; j++) {
        if (j === i || osiOf[i].some(o => o.to === j)) continue;
        const q = pos[j], dx = q[0] - px, dy = q[1] - py;
        if (Math.abs(dx) > P.sep || Math.abs(dy) > P.sep) continue;
        const L = Math.hypot(dx, dy);
        if (L < 1e-6) return 1e9;
        if (L < P.sep) c += P.wSep * Math.pow(P.sep - L, 2);
      }
      for (let k = 0; k < E.length; k++) {
        const e2 = E[k];
        if (e2.i === i || e2.j === i) continue;
        const r1 = pos[e2.i], r2 = pos[e2.j];
        if (Math.min(r1[0], r2[0]) - P.sep > px || Math.max(r1[0], r2[0]) + P.sep < px
          || Math.min(r1[1], r2[1]) - P.sep > py || Math.max(r1[1], r2[1]) + P.sep < py) continue;
        const vx = r2[0] - r1[0], vy = r2[1] - r1[1], l2 = vx * vx + vy * vy;
        let t = l2 ? ((px - r1[0]) * vx + (py - r1[1]) * vy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dd = Math.hypot(px - (r1[0] + t * vx), py - (r1[1] + t * vy));
        if (dd < P.sep * 0.8) c += P.wOccl * Math.pow(P.sep * 0.8 - dd, 2);
      }
      for (const a of adj[i]) {
        const q = pos[a.to];
        for (let k = 0; k < E.length; k++) {
          if (k === a.k) continue;
          const e2 = E[k];
          if (e2.i === i || e2.j === i || e2.i === a.to || e2.j === a.to) continue;
          const r1 = pos[e2.i], r2 = pos[e2.j];
          if (Math.min(px, q[0]) > Math.max(r1[0], r2[0]) || Math.max(px, q[0]) < Math.min(r1[0], r2[0])
            || Math.min(py, q[1]) > Math.max(r1[1], r2[1]) || Math.max(py, q[1]) < Math.min(r1[1], r2[1])) continue;
          const cw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
          const p1 = [px, py];
          if (cw(p1, r1, r2) * cw(q, r1, r2) < 0 && cw(p1, q, r1) * cw(p1, q, r2) < 0) c += P.wCross;
        }
      }
      if (adj[i].length === 2) {
        const q1 = pos[adj[i][0].to], q2 = pos[adj[i][1].to];
        c += P.wBend * Math.pow(4 - cdiff(angIdx(q1[0] - px, q1[1] - py), angIdx(q2[0] - px, q2[1] - py)), 2);
      }
      return c;
    }

    const order = [...Array(n).keys()].sort((a, b) => adj[b].length - adj[a].length);
    for (let it = 0; it < P.iters; it++) {
      const r = Math.max(1, P.radius - Math.floor(it / 5));
      let moved = 0;
      for (const i of order) {
        if (fixed.has(i) || !adj[i].length) continue;
        const cx = pos[i][0], cy = pos[i][1];
        let best = costAt(i, cx, cy), bx = cx, by = cy;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dy) continue;
          const c = costAt(i, cx + dx, cy + dy);
          if (c < best - 1e-9) { best = c; bx = cx + dx; by = cy + dy; }
        }
        if (bx !== cx || by !== cy) { pos[i] = [bx, by]; moved++; }
      }
      if (!moved) break;
    }
    return { pos, E, adj, idx };
  }

  /** 階段二：方向決定＋最小平方法，轉折落在兩站正中間。 */
  function layoutV3(H, opts, prm) {
    const P = Object.assign({}, V3_DEF, prm || {});
    const st = H.stations, n = st.length;
    const { pos, E, adj } = v3Hill(H, opts, P);
    const hp = pos.map(q => [q[0] * GRID, q[1] * GRID]);
    const m = E.length;

    // 每條邊兩端的方向：度數 2 的站取一條軸（線筆直穿過），其餘每條邊各自取最近方向且不重複
    const dirI = new Array(m).fill(-1), dirJ = new Array(m).fill(-1);
    const DOT = (d, dx, dy) => DIRS8[d][0] * dx + DIRS8[d][1] * dy;
    for (let v = 0; v < n; v++) {
      const a = adj[v]; if (!a.length) continue;
      if (a.length === 2) {
        const p1 = hp[a[0].to], p2 = hp[a[1].to];
        const ax = Math.round(angIdx(p2[0] - p1[0], p2[1] - p1[1])) % 8;
        for (const x of a) {
          const q = hp[x.to];
          const d = DOT(ax, q[0] - hp[v][0], q[1] - hp[v][1]) >= 0 ? ax : (ax + 4) % 8;
          if (E[x.k].i === v) dirI[x.k] = d; else dirJ[x.k] = (d + 4) % 8;
        }
      } else {
        const used = new Set();
        for (const x of a) {
          const q = hp[x.to];
          let d = Math.round(angIdx(q[0] - hp[v][0], q[1] - hp[v][1])) % 8;
          if (used.has(d)) for (let off = 1; off <= 4; off++) {
            const c1 = (d + off) % 8, c2 = (d + 8 - off) % 8;
            if (!used.has(c1)) { d = c1; break; }
            if (!used.has(c2)) { d = c2; break; }
          }
          used.add(d);
          if (E[x.k].i === v) dirI[x.k] = d; else dirJ[x.k] = (d + 4) % 8;
        }
      }
    }
    const chord = E.map((e, k) => {
      let u = dirI[k] < 0 ? Math.round(angIdx(hp[e.j][0] - hp[e.i][0], hp[e.j][1] - hp[e.i][1])) % 8 : dirI[k];
      let w = dirJ[k] < 0 ? u : dirJ[k];
      if (cdiff(u, w) >= 3) w = u;                        // 夾角 ≥135°：不彎，整段走 u
      let cx = DIRS8[u][0] + DIRS8[w][0], cy = DIRS8[u][1] + DIRS8[w][1];
      const L = Math.hypot(cx, cy);
      if (L < 1e-6) { cx = DIRS8[u][0]; cy = DIRS8[u][1]; } else { cx /= L; cy /= L; }
      return { u, w, cx, cy, straight: u === w };
    });

    const Lt = E.map((e, k) => Math.max(P.target * 0.55, Math.hypot(hp[e.j][0] - hp[e.i][0], hp[e.j][1] - hp[e.i][1])));
    const ov = opts.override || {}, fx = new Map();
    st.forEach((s, i) => { if (ov[s.zh]) fx.set(i, [ov[s.zh][0] * GRID, ov[s.zh][1] * GRID]); });
    const N = Array.from({ length: 2 * n }, () => new Float64Array(2 * n)), b = new Float64Array(2 * n);
    const add = (cols, coef, rhs, w) => {
      for (let a = 0; a < cols.length; a++) { b[cols[a]] += w * w * coef[a] * rhs; for (let c = 0; c < cols.length; c++) N[cols[a]][cols[c]] += w * w * coef[a] * coef[c]; }
    };
    E.forEach((e, k) => {
      const c = chord[k], nx = -c.cy, ny = c.cx;
      add([2 * e.j, 2 * e.j + 1, 2 * e.i, 2 * e.i + 1], [nx, ny, -nx, -ny], 0, P.wn);
      add([2 * e.j, 2 * e.j + 1, 2 * e.i, 2 * e.i + 1], [c.cx, c.cy, -c.cx, -c.cy], Lt[k], P.wl);
    });
    for (let i = 0; i < n; i++) {
      const f = fx.get(i), w = f ? 30 : P.lam, tg = f || hp[i];
      add([2 * i], [1], tg[0], w); add([2 * i + 1], [1], tg[1], w);
    }
    const sol = solve(N, b);
    const pos0 = st.map((s, i) => [sol[2 * i], sol[2 * i + 1]]);
    const polys = E.map((e, k) => {
      const A = pos0[e.i], B = pos0[e.j], c = chord[k];
      if (c.straight) return [A, B];
      const u = DIRS8[c.u], w = DIRS8[c.w];
      const det = u[0] * w[1] - u[1] * w[0];
      const vx = B[0] - A[0], vy = B[1] - A[1];
      if (Math.abs(det) < 1e-6 || Math.hypot(vx, vy) < 1) return [A, B];
      const s2 = (vx * w[1] - vy * w[0]) / det;
      if (!(s2 > 0.5)) return [A, B];
      const bend = [A[0] + u[0] * s2, A[1] + u[1] * s2];
      if (Math.hypot(B[0] - bend[0], B[1] - bend[1]) < 0.5) return [A, B];
      return [A, bend, B];
    });

    const PAD = 90;
    let gx = Infinity, gy = Infinity;
    pos0.forEach(q => { gx = Math.min(gx, q[0]); gy = Math.min(gy, q[1]); });
    polys.forEach(pl => pl.forEach(q => { gx = Math.min(gx, q[0]); gy = Math.min(gy, q[1]); }));
    const ox = PAD - gx, oy = PAD - gy;
    const posMap = new Map();
    st.forEach((s, i) => posMap.set(s.id, { x: pos0[i][0] + ox, y: pos0[i][1] + oy, i }));
    st.forEach((s, i) => { if (!adj[i].length) posMap.set(s.id, { x: hp[i][0] + ox, y: hp[i][1] + oy, i }); });
    const paths = E.map((e, k) => ({ a: st[e.i].id, b: st[e.j].id, pts: polys[k].map(q => [q[0] + ox, q[1] + oy]), svcs: e.e.svcs, len: e.e.len }));
    let maxX = 0, maxY = 0;
    posMap.forEach(v => { maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); });
    paths.forEach(p => p.pts.forEach(q => { maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); }));
    const hsPaths = layoutHsPaths(H, posMap);
    hsPaths.forEach(hp2 => hp2.pts.forEach(q => { maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); }));
    const R = { pos: posMap, paths, hsPaths, width: maxX + PAD, height: maxY + PAD, grid: GRID, v3: true };
    return Object.assign(R, v3Diag(H, R));
  }

  /** v3 的診斷值：交叉、過近、壓線、車站轉角（前輩要求這個要 0）、偏離實際方位。 */
  function v3Diag(H, R) {
    const st = H.stations;
    const segs = R.paths.flatMap((p, k) => p.pts.slice(1).map((q, i) => [k, p.pts[i], q]));
    const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
    let crossings = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (segs[i][0] === segs[j][0]) continue;
      const [, a, b2] = segs[i], [, c, d] = segs[j];
      if ([a, b2].some(u => [c, d].some(v => Math.abs(u[0] - v[0]) < 0.6 && Math.abs(u[1] - v[1]) < 0.6))) continue;
      if (ccw(a, c, d) * ccw(b2, c, d) < 0 && ccw(a, b2, c) * ccw(a, b2, d) < 0) crossings++;
    }
    const at = new Map(); st.forEach(s => at.set(s.id, []));
    R.paths.forEach(p => {
      const t = p.pts.length - 1;
      if (at.has(p.a)) at.get(p.a).push(angIdx(p.pts[1][0] - p.pts[0][0], p.pts[1][1] - p.pts[0][1]));
      if (at.has(p.b)) at.get(p.b).push(angIdx(p.pts[t - 1][0] - p.pts[t][0], p.pts[t - 1][1] - p.pts[t][1]));
    });
    let corner = 0;
    at.forEach(ds => { if (ds.length === 2 && cdiff(ds[0], (ds[1] + 4) % 8) > 0.15) corner++; });
    let near = 0, touch = 0;
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = R.pos.get(st[i].id), b2 = R.pos.get(st[j].id);
      if (!a || !b2) continue;
      const dd = Math.hypot(a.x - b2.x, a.y - b2.y);
      if (dd < 24) near += 3; else if (dd < 44) near++;
    }
    for (let i = 0; i < st.length; i++) {
      const q = R.pos.get(st[i].id); if (!q) continue;
      for (const p of R.paths) {
        if (p.a === st[i].id || p.b === st[i].id) continue;
        for (let t = 1; t < p.pts.length; t++) {
          const sd = segDist(q.x, q.y, p.pts[t - 1][0], p.pts[t - 1][1], p.pts[t][0], p.pts[t][1]);
          if (sd.d < 9) touch++; else if (sd.d < 16) near++;
        }
      }
    }
    let bends = 0, offGrid = 0;
    R.paths.forEach(p => { bends += Math.max(0, p.pts.length - 2); });
    return { crossings, bends, offGrid, near, touch, corner, dev: 0, disp: 0 };
  }

  const v3Score = r => r.corner * 400 + r.crossings * 1000 + r.near * 60 + r.touch * 150
    + Math.max(0, Math.max(r.width, r.height) - 1900) * 0.5;

  function bestV3(H, opts) {
    let best = null;
    for (const prm of V3_COMBOS) {
      let r; try { r = layoutV3(H, opts, prm); } catch (e) { continue; }
      r.score = v3Score(r); r.prm = prm;
      if (!best || r.score < best.score) best = r;
    }
    if (!best) best = layoutOnce(H, opts, COMBOS[0]);
    best.recipe = { v3: true };
    return best;
  }

  function layout(H, opts) {
    opts = opts || {};
    /* 2.4.0：預設走新排版 v3；site-config.js 的 mapAlgo 設成 'legacy' 可切回舊排版。
     * v3 是確定性的、約 1 秒，所以不吃 recipe／seed 快取（重算一次就好，而且路網變了也不會沿用舊形狀）。 */
    const CFGX = (root.HK && root.HK.CFG) || root.HK_CONFIG || {};
    const algo = opts.algo || CFGX.mapAlgo || 'v3';
    if (algo !== 'legacy') return bestV3(H, opts);
    const withDirs = (prm, dirs) => Object.assign({}, prm, { dirs });
    if (opts.seed && !opts.recipe) { const r = layoutSeeded(H, opts, opts.seedPrm || COMBOS[4], opts.seed); r.seeded = true; return r; }
    if (opts.recipe) { const r = layoutOnce(H, opts, withDirs(opts.recipe.prm || opts.recipe, opts.recipe.dirs)); r.recipe = opts.recipe; r.score = scoreOf(r); return r; }
    const n = Math.max(1, Math.min(COMBOS.length, opts.tries && opts.tries < COMBOS.length ? opts.tries : COMBOS.length));
    let best = null;
    for (let k = 0; k < n; k++) {
      const r = layoutOnce(H, opts, COMBOS[k]); r.score = scoreOf(r); r.prm = COMBOS[k];
      if (opts.debug) console.log(k, JSON.stringify(COMBOS[k]), 'cross', r.crossings, 'bends', r.bends, 'touch', r.touch, 'near', r.near, 'dev', Math.round(r.dev), 'w', Math.round(r.width), 'h', Math.round(r.height), 'score', Math.round(r.score));
      if (!best || r.score < best.score) best = r;
    }
    // 區域搜尋：每條線試著把方向改 ±1、±2（45°、90°），分數更低就採用
    const t0 = Date.now(), budget = opts.refineMs != null ? opts.refineMs : 4000;
    let improved = true, pass = 0;
    while (improved && pass < 8 && Date.now() - t0 < budget) {
      improved = false; pass++;
      for (let k = 0; k < best.dirs.length && Date.now() - t0 < budget; k++) {
        for (const dd of [1, 7, 2, 6]) {
          const dirs = best.dirs.slice(); dirs[k] = (dirs[k] + dd) % 8;
          const r = layoutOnce(H, opts, withDirs(best.prm, dirs)); r.score = scoreOf(r); r.prm = best.prm;
          if (r.score < best.score - 1e-6) { best = r; improved = true; break; }
        }
      }
    }
    // 第二階段：相鄰兩條線同時改方向（單條改不動時，例如要一起繞開另一條線）
    if (best.crossings > 0 || best.touch > 0 || best.near > 0) {
      const st = H.stations, idx = new Map(st.map((q, i) => [q.id, i])), ends = H.edges.map(e => [idx.get(e.a), idx.get(e.b)]);
      const pairs = []; for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if (ends[i].some(v => ends[j].includes(v))) pairs.push([i, j]);
      let again = true, rounds = 0;
      while (again && rounds < 3 && Date.now() - t0 < budget * 2) {
        again = false; rounds++;
        for (const [i, j] of pairs) {
          if (Date.now() - t0 >= budget * 2) break;
          let hit = false;
          for (const [d1, d2] of [[1, 1], [7, 7], [1, 7], [7, 1], [2, 1], [6, 7], [1, 2], [7, 6], [2, 2], [6, 6]]) {
            const dirs = best.dirs.slice(); dirs[i] = (dirs[i] + d1) % 8; dirs[j] = (dirs[j] + d2) % 8;
            const r = layoutOnce(H, opts, withDirs(best.prm, dirs)); r.score = scoreOf(r); r.prm = best.prm;
            if (r.score < best.score - 1e-6) { best = r; again = true; hit = true; break; }
          }
          if (hit && best.crossings === 0 && best.touch === 0 && best.near === 0) { again = false; break; }
        }
      }
    }
    best.recipe = { prm: best.prm, dirs: best.dirs, seed: seedOf(H, best.dirs) };
    return best;
  }

  /** 路徑上的位置：沿折線長度的 t（0–1）。 */
  function pointAt(pts, t) {
    let tot = 0; const ls = [];
    for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); ls.push(l); tot += l; }
    let d = Math.max(0, Math.min(1, t)) * tot;
    for (let k = 0; k < ls.length; k++) { if (d <= ls[k] || k === ls.length - 1) { const f = ls[k] ? d / ls[k] : 0; return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f]; } d -= ls[k]; }
    return pts[pts.length - 1];
  }

  const api = { layout, pointAt, GRID, seedOf };
  root.HK = Object.assign(root.HK || {}, { map: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
