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
    const decompose = (A, Bq, d) => {
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
    };
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
    return { pos, paths, width: maxX + PAD, height: maxY + PAD, crossings: cross, bends, offGrid, near, touch, disp: dev, dev, grid: GRID, dirs: dirOf.slice() };
  }

  const COMBOS = (() => {
    const out = [];
    for (const beta of [1.2, 2.5, 4.5]) for (const lam of [0.02, 0.06, 0.15]) for (const Lmin of [38, 46, 54])
      out.push({ beta, lam, Lmin, kL: 0.5, pull: 1.2, wn: 4, wl: 0.7 });
    return out;
  })();
  const scoreOf = r => r.crossings * 1000 + r.touch * 500 + r.near * 90 + r.bends * 45 + r.offGrid * 120 + r.dev * 1.5 + Math.max(0, Math.max(r.width, r.height) - 900) * 0.4;

  /** 版面。recipe＝{ prm, dirs }：直接重現（不搜尋）。否則：固定參數組各算一次，再對最好的一組做「逐條線改方向」的區域搜尋，降低交叉、過近與轉折。 */
  function layout(H, opts) {
    opts = opts || {};
    const withDirs = (prm, dirs) => Object.assign({}, prm, { dirs });
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
    best.recipe = { prm: best.prm, dirs: best.dirs };
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

  const api = { layout, pointAt, GRID };
  root.HK = Object.assign(root.HK || {}, { map: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
