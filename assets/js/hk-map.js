/* hk-map.js — 路線圖（拓樸示意圖）：自動由路網產生「只用 0°／45°／90° 的線」的示意圖。
 * 作法：以實際座標為起點，用力導向（錨定位置＋邊長彈簧＋站間斥力＋邊角度吸附到 45° 倍數）整理出乾淨的版面，
 * 最後把每一站對齊到格線；每條邊畫成最多兩段的八方向折線。
 * 站位如果不滿意，可在 data/layout.json 用 { "車站中文名": [格x, 格y] } 手動指定，其餘車站會自動配合。
 * 沒有 DOM 相依的部分（layout）Node 也能跑。 */
(function (root) {
  'use strict';
  const GRID = 12;
  const SQ = Math.SQRT1_2;
  const DIRS8 = [[1, 0], [SQ, SQ], [0, 1], [-SQ, SQ], [-1, 0], [-SQ, -SQ], [0, -1], [SQ, -SQ]];

  function nearestDir(dx, dy) {
    let best = 0, bd = -2; const l = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 8; k++) { const d = (dx * DIRS8[k][0] + dy * DIRS8[k][1]) / l; if (d > bd) { bd = d; best = k; } }
    return DIRS8[best];
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * vx, cy = ay + t * vy;
    return { d: Math.hypot(px - cx, py - cy), cx, cy, t };
  }

  /** 計算版面。回傳 { pos: Map(id→{x,y}), paths: [{a,b,pts:[[x,y]…],svcs}], width, height }。 */
  function layoutOnce(H, opts, prm) {
    opts = opts || {};
    const st = H.stations, n = st.length, idx = new Map(st.map((s, i) => [s.id, i]));
    const W = opts.width || 1280, HT = opts.height || 820, PAD = 90;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    st.forEach(s => { minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); minz = Math.min(minz, s.z); maxz = Math.max(maxz, s.z); });
    const sc = Math.min((W - 2 * PAD) / Math.max(1, maxx - minx), (HT - 2 * PAD) / Math.max(1, maxz - minz));
    const p0 = st.map(s => [(s.x - minx) * sc + PAD, (s.z - minz) * sc + PAD]);
    const rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(prm.seed || 0);
    const p = p0.map(a => prm.jit ? [a[0] + (rnd() - 0.5) * 2 * prm.jit, a[1] + (rnd() - 0.5) * 2 * prm.jit] : a.slice());
    const E = H.edges.map(e => ({ i: idx.get(e.a), j: idx.get(e.b), real: e.len * sc, e }));
    const L = E.map(e => Math.max(prm.Lmin, Math.min(190, e.real * 0.9)));
    const R = 74, ITER = opts.iterations || 700;
    const fixed = new Map();
    const ov = opts.override || {};
    st.forEach((s, i) => { if (ov[s.zh]) fixed.set(i, [ov[s.zh][0] * GRID, ov[s.zh][1] * GRID]); });
    fixed.forEach((v, i) => { p[i] = v.slice(); });

    for (let it = 0; it < ITER; it++) {
      const w = Math.min(1, it / (ITER * 0.55));            // 角度吸附逐漸加強
      const fx = new Float64Array(n), fy = new Float64Array(n);
      for (let i = 0; i < n; i++) { fx[i] += prm.ka * (p0[i][0] - p[i][0]); fy[i] += prm.ka * (p0[i][1] - p[i][1]); }
      E.forEach((e, k) => {
        const dx = p[e.j][0] - p[e.i][0], dy = p[e.j][1] - p[e.i][1], len = Math.hypot(dx, dy) || 1e-6;
        const ux = dx / len, uy = dy / len, lf = 0.22 * (len - L[k]);
        fx[e.i] += ux * lf; fy[e.i] += uy * lf; fx[e.j] -= ux * lf; fy[e.j] -= uy * lf;
        const d8 = nearestDir(dx, dy), tx = d8[0] * len - dx, ty = d8[1] * len - dy, aw = prm.aw * w;
        fx[e.i] -= tx * aw * 0.5; fy[e.i] -= ty * aw * 0.5; fx[e.j] += tx * aw * 0.5; fy[e.j] += ty * aw * 0.5;
      });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], d = Math.hypot(dx, dy) || 1e-6;
        if (d < R) { const f = (R - d) * 0.35, ux = dx / d, uy = dy / d; fx[i] -= ux * f; fy[i] -= uy * f; fx[j] += ux * f; fy[j] += uy * f; }
      }
      for (let k = 0; k < n; k++) for (const e of E) {
        if (e.i === k || e.j === k) continue;
        const r = segDist(p[k][0], p[k][1], p[e.i][0], p[e.i][1], p[e.j][0], p[e.j][1]);
        if (r.d < 34 && r.t > 0 && r.t < 1) {
          let nx = p[k][0] - r.cx, ny = p[k][1] - r.cy; const nl = Math.hypot(nx, ny) || 1e-6; nx /= nl; ny /= nl;
          const f = (34 - r.d) * 0.4; fx[k] += nx * f; fy[k] += ny * f; fx[e.i] -= nx * f * 0.5; fy[e.i] -= ny * f * 0.5; fx[e.j] -= nx * f * 0.5; fy[e.j] -= ny * f * 0.5;
        }
      }
      const step = 0.6 * (1 - it / ITER * 0.7);
      for (let i = 0; i < n; i++) { if (fixed.has(i)) continue; p[i][0] += Math.max(-12, Math.min(12, fx[i] * step)); p[i][1] += Math.max(-12, Math.min(12, fy[i] * step)); }
    }

    // 對齊格線；同格衝突時往外找最近的空格
    const used = new Map(), cell = (a, b) => a + ',' + b;
    const order = [...Array(n).keys()].sort((a, b) => (fixed.has(b) ? 1 : 0) - (fixed.has(a) ? 1 : 0));
    const G = [];
    for (const i of order) {
      let gx = Math.round(p[i][0] / GRID), gy = Math.round(p[i][1] / GRID);
      if (!fixed.has(i)) for (let r = 0; r < 12 && used.has(cell(gx, gy)); r++) { /* 往外圈找 */
        let found = false;
        for (let dx = -r; dx <= r && !found; dx++) for (let dy = -r; dy <= r && !found; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !used.has(cell(Math.round(p[i][0] / GRID) + dx, Math.round(p[i][1] / GRID) + dy))) { gx = Math.round(p[i][0] / GRID) + dx; gy = Math.round(p[i][1] / GRID) + dy; found = true; }
      }
      used.set(cell(gx, gy), i); G[i] = [gx, gy];
    }
    // 平移到邊界內
    let gminx = Infinity, gminy = Infinity, gmaxx = -Infinity, gmaxy = -Infinity;
    G.forEach(g => { gminx = Math.min(gminx, g[0]); gminy = Math.min(gminy, g[1]); gmaxx = Math.max(gmaxx, g[0]); gmaxy = Math.max(gmaxy, g[1]); });
    const ox = PAD - gminx * GRID, oy = PAD - gminy * GRID;
    const pos = new Map();
    st.forEach((s, i) => pos.set(s.id, { x: G[i][0] * GRID + ox, y: G[i][1] * GRID + oy, i }));

    // 邊：八方向折線（最多一個折點，折點放在度數較小的那一端附近）
    const deg = new Map(); st.forEach(s => deg.set(s.id, 0));
    H.edges.forEach(e => { deg.set(e.a, deg.get(e.a) + 1); deg.set(e.b, deg.get(e.b) + 1); });
    const paths = H.edges.map(e => {
      const A = pos.get(e.a), B = pos.get(e.b), dx = B.x - A.x, dy = B.y - A.y, ax = Math.abs(dx), ay = Math.abs(dy);
      const pts = [[A.x, A.y]];
      if (ax > 0.5 && ay > 0.5 && Math.abs(ax - ay) > 0.5) {
        const m = Math.min(ax, ay), sx = Math.sign(dx), sy = Math.sign(dy);
        const diagFirst = deg.get(e.a) <= deg.get(e.b);
        if (diagFirst) pts.push([A.x + sx * m, A.y + sy * m]);
        else pts.push(ax > ay ? [B.x - sx * m, B.y - sy * m] : [B.x - sx * m, B.y - sy * m]);
        if (!diagFirst) { /* 先走直線再斜線：折點 = B 往回退 m 的斜線起點，上面已算好 */ }
      }
      pts.push([B.x, B.y]);
      // 折點修正：diagFirst 時折點在 A 斜走 m；否則在 B 往回斜走 m（兩者都保證其餘一段是水平／垂直）
      return { a: e.a, b: e.b, pts, svcs: e.svcs, len: e.len };
    });
    // 交叉數（診斷用）
    let cross = 0;
    const segs = paths.flatMap((pp, k) => pp.pts.slice(1).map((q, m) => [k, pp.pts[m], q]));
    const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (segs[i][0] === segs[j][0]) continue;
      const [, a, b] = segs[i], [, c, d] = segs[j];
      const share = [a, b].some(u => [c, d].some(v => Math.abs(u[0] - v[0]) < 0.5 && Math.abs(u[1] - v[1]) < 0.5));
      if (share) continue;
      if (ccw(a, c, d) * ccw(b, c, d) < 0 && ccw(a, b, c) * ccw(a, b, d) < 0) cross++;
    }
    let maxX = 0, maxY = 0; pos.forEach(v => { maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); });
    let bends = 0; paths.forEach(pp => { if (pp.pts.length > 2) bends++; });
    let disp = 0; st.forEach((s, i) => { const q = pos.get(s.id); disp += Math.hypot(q.x - p0[i][0] - (ox - PAD + PAD - PAD), q.y - p0[i][1] - (oy - PAD + PAD - PAD)); });
    return { pos, paths, width: maxX + PAD, height: maxY + PAD, crossings: cross, bends, disp: disp / n, grid: GRID };
  }

  /** 多組參數與隨機種子各算一次（可重現），挑「交叉最少、折點最少、離實際位置最近」的版面。
   * opts.tries：嘗試次數（網頁即時算用少一點；離線預算用多一點）。 */
  function layout(H, opts) {
    opts = opts || {};
    const tries = opts.tries || 10;
    const KA = [0.006, 0.012, 0.022, 0.035], LM = [66, 78, 92], AW = [0.45, 0.6, 0.8];
    let best = null;
    for (let k = 0; k < tries; k++) {
      const prm = k === 0 ? { ka: 0.012, Lmin: 78, aw: 0.55, seed: 0, jit: 0 }
        : { ka: KA[k % 4], Lmin: LM[(k >> 2) % 3], aw: AW[(k * 7) % 3], seed: k, jit: 10 + (k % 5) * 8 };
      const r = layoutOnce(H, opts, prm);
      r.score = r.crossings * 1000 + r.bends * 40 + r.disp * 0.8;
      if (!best || r.score < best.score) best = r;
      if (opts.stopAtZero && best.crossings === 0 && k >= 5) break;
    }
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
