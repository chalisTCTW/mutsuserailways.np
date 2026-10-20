/* hk-map.js — 路線圖（拓樸示意圖）：自動由路網產生「只用 0°／45°／90° 的線」的示意圖，並盡量減少轉折。
 * 作法（2026-10 改版）：
 *   1. 以實際座標為起點，用力導向（錨定位置＋邊長彈簧＋站間斥力＋角度吸附＋「中間站拉向前後站連線」的拉直力）取得概略位置。
 *   2. 把路網切成「幹線段」（兩個分歧點／終點之間的車站鏈），每段再依偏離量切成最少的「直線區間」。
 *   3. 每個區間只用八方向（水平、垂直、45°）畫：偏差很小就畫成一條直線；否則畫成「一條主方向線＋一小段 45° 斜線」。
 *      區間之間的接續方向優先對齊，所以線型落差不大的地方會是一直線，不會每站就轉一次。
 *   4. 中間站依實際站距比例排在區間線上。
 * 站位如果不滿意，可在 data/layout.json 用 { "stations": { "車站中文名": [格x, 格y] } } 手動指定（指定的站視為固定點）。
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
    const nb0 = Array.from({ length: n }, () => []);
    E.forEach(e => { if (e.i !== e.j) { if (!nb0[e.i].includes(e.j)) nb0[e.i].push(e.j); if (!nb0[e.j].includes(e.i)) nb0[e.j].push(e.i); } });
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
      if (prm.ks) for (let i = 0; i < n; i++) {   // 中間站（恰兩個鄰站）：拉向前後站連線，讓整條線自然變直
        if (nb0[i].length !== 2) continue;
        const a = p[nb0[i][0]], b = p[nb0[i][1]], r = segDist(p[i][0], p[i][1], a[0], a[1], b[0], b[1]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, kk = prm.ks * w;
        fx[i] += (r.cx - p[i][0]) * kk * 2 + (mx - p[i][0]) * kk * 0.15; fy[i] += (r.cy - p[i][1]) * kk * 2 + (my - p[i][1]) * kk * 0.15;
      }
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

    // ───── 以下：幹線段 → 直線區間 → 八方向折線 ─────
    const nb = Array.from({ length: n }, () => []);
    E.forEach(e => { if (e.i !== e.j) { if (!nb[e.i].includes(e.j)) nb[e.i].push(e.j); if (!nb[e.j].includes(e.i)) nb[e.j].push(e.i); } });
    const anchor = new Set();
    for (let i = 0; i < n; i++) if (nb[i].length !== 2 || fixed.has(i)) anchor.add(i);
    // 純環狀（沒有任何分歧／端點）：挑最左的站當錨點
    { const seen = new Set(); const stack = []; for (let i = 0; i < n; i++) { if (seen.has(i)) continue; const comp = []; stack.push(i); seen.add(i); while (stack.length) { const u = stack.pop(); comp.push(u); nb[u].forEach(v => { if (!seen.has(v)) { seen.add(v); stack.push(v); } }); } if (!comp.some(u => anchor.has(u))) anchor.add(comp.reduce((b2, u) => p[u][0] < p[b2][0] ? u : b2, comp[0])); } }

    // 錨點對齊格線；同格衝突時往外找最近的空格
    const used = new Map(), cell = (a, b) => a + ',' + b, A = new Map();
    const aorder = [...anchor].sort((x, y) => (fixed.has(y) ? 1 : 0) - (fixed.has(x) ? 1 : 0));
    for (const i of aorder) {
      const bx = Math.round(p[i][0] / GRID), by = Math.round(p[i][1] / GRID);
      let gx = bx, gy = by;
      if (!fixed.has(i)) for (let r = 1; r < 12 && used.has(cell(gx, gy)); r++) {
        let found = false;
        for (let dx = -r; dx <= r && !found; dx++) for (let dy = -r; dy <= r && !found; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !used.has(cell(bx + dx, by + dy))) { gx = bx + dx; gy = by + dy; found = true; }
      }
      used.set(cell(gx, gy), i); A.set(i, [gx * GRID, gy * GRID]);
    }

    // 幹線段
    const chains = [], edgeSeen = new Set(), ek = (u, v) => u < v ? u + '|' + v : v + '|' + u;
    for (const a0 of anchor) for (const first of nb[a0]) {
      if (edgeSeen.has(ek(a0, first))) continue;
      const nodes = [a0, first]; edgeSeen.add(ek(a0, first));
      let prev = a0, cur = first;
      while (!anchor.has(cur)) { const nx = nb[cur].find(v => v !== prev) ; if (nx === undefined) break; edgeSeen.add(ek(cur, nx)); nodes.push(nx); prev = cur; cur = nx; }
      chains.push(nodes);
    }

    // 八方向工具
    const dirIdx = (dx, dy) => { let best = 0, bd = -2; const l = Math.hypot(dx, dy) || 1; for (let k = 0; k < 8; k++) { const d = (dx * DIRS8[k][0] + dy * DIRS8[k][1]) / l; if (d > bd) { bd = d; best = k; } } return best; };
    const TOL = prm.tol || 30, SNAP = (prm.snapDeg || 17) * Math.PI / 180;
    const place = new Array(n).fill(null);
    for (const [i, v] of A) place[i] = v.slice();
    const chainPolys = new Map();   // ek → 該邊的折線（由小 id 的車站往大 id 的車站，之後再依方向反轉）
    let prevDirGlobal = -1;

    function subPath(poly, cum, s0, s1) {
      const out = [];
      const at = s => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const l = cum[k] - cum[k - 1] || 1, f = Math.max(0, Math.min(1, (s - cum[k - 1]) / l)); return [poly[k - 1][0] + (poly[k][0] - poly[k - 1][0]) * f, poly[k - 1][1] + (poly[k][1] - poly[k - 1][1]) * f]; };
      out.push(at(s0));
      for (let k = 1; k < poly.length - 1; k++) if (cum[k] > s0 + 0.5 && cum[k] < s1 - 0.5) out.push(poly[k].slice());
      out.push(at(s1));
      return out;
    }
    // 把向量拆成兩個相鄰八方向的和：回傳 [d1, a, d2, b]（d1 為主方向）
    function decompose(vx, vy) {
      const k1 = dirIdx(vx, vy), d1 = DIRS8[k1];
      const cands = [(k1 + 1) % 8, (k1 + 7) % 8];
      let best = null;
      for (const k2 of cands) {
        const d2 = DIRS8[k2], det = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(det) < 1e-6) continue;
        const a = (vx * d2[1] - vy * d2[0]) / det, b = (d1[0] * vy - d1[1] * vx) / det;
        if (a >= -1e-6 && b >= -1e-6) { best = [k1, Math.max(0, a), k2, Math.max(0, b)]; break; }
      }
      if (!best) best = [k1, Math.hypot(vx, vy), k1, 0];
      return best;
    }

    for (const nodes of chains) {
      const k = nodes.length - 1;
      const q = nodes.map(i => p[i]);
      const c = [0]; for (let m = 1; m <= k; m++) c.push(c[m - 1] + Math.hypot(q[m][0] - q[m - 1][0], q[m][1] - q[m - 1][1]));
      let start = 0, S = A.get(nodes[0]).slice(), prevDir = -1;
      while (start < k) {
        // 最遠的 j：區間內所有中間站離弦線都在容許範圍內，且沿線順序不倒退
        let j = start + 1;
        for (let t = start + 2; t <= k; t++) {
          const ax = q[start][0], ay = q[start][1], bx = q[t][0], by = q[t][1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
          let ok = true, lastT = -1;
          for (let m = start + 1; m < t && ok; m++) { const r = segDist(q[m][0], q[m][1], ax, ay, bx, by); if (r.d > TOL || r.t <= lastT) ok = false; lastT = r.t; }
          if (!ok) break; j = t;
        }
        const final = j === k;
        let vx, vy;
        if (final) { const E2 = A.get(nodes[k]); vx = E2[0] - S[0]; vy = E2[1] - S[1]; }
        else { vx = q[j][0] - q[start][0]; vy = q[j][1] - q[start][1]; }
        const len = Math.hypot(vx, vy);
        const kd = dirIdx(vx, vy), dd = DIRS8[kd];
        const cosA = len ? (vx * dd[0] + vy * dd[1]) / len : 1;
        let poly;
        if (!final && Math.acos(Math.min(1, cosA)) <= SNAP) {
          const pr = vx * dd[0] + vy * dd[1];
          poly = [S.slice(), [S[0] + dd[0] * pr, S[1] + dd[1] * pr]]; prevDir = kd;
        } else if (len < 0.5) {
          poly = [S.slice(), S.slice()];
        } else {
          const [k1, a1, k2, b1] = decompose(vx, vy);
          if (b1 < 0.75) poly = [S.slice(), [S[0] + vx, S[1] + vy]];
          else {
            // 順序：優先與前一區間的方向接續；否則主方向在前
            let first = k1, fa = a1, second = k2, sb = b1;
            if (prevDir === k2) { first = k2; fa = b1; second = k1; sb = a1; }
            const m1 = [S[0] + DIRS8[first][0] * fa, S[1] + DIRS8[first][1] * fa];
            poly = [S.slice(), m1, [m1[0] + DIRS8[second][0] * sb, m1[1] + DIRS8[second][1] * sb]];
          }
          const lastSeg = poly.length - 1; prevDir = dirIdx(poly[lastSeg][0] - poly[lastSeg - 1][0], poly[lastSeg][1] - poly[lastSeg - 1][1]);
        }
        const cum = [0]; for (let m = 1; m < poly.length; m++) cum.push(cum[m - 1] + Math.hypot(poly[m][0] - poly[m - 1][0], poly[m][1] - poly[m - 1][1]));
        const tot = cum[cum.length - 1], span = c[j] - c[start] || 1;
        const arcOf = m => (c[m] - c[start]) / span * tot;
        for (let m = start + 1; m < j; m++) { const s0 = arcOf(m); place[nodes[m]] = subPath(poly, cum, s0, s0).slice(0, 1)[0]; }
        const endPt = poly[poly.length - 1];
        if (!final) place[nodes[j]] = endPt.slice();
        for (let m = start; m < j; m++) {
          const pts = subPath(poly, cum, arcOf(m), arcOf(m + 1));
          chainPolys.set(ek(nodes[m], nodes[m + 1]), { from: nodes[m], pts });
        }
        S = endPt.slice(); start = j;
      }
    }
    // 沒被任何幹線段涵蓋的站（孤立站）：用力導向的位置對齊格線
    for (let i = 0; i < n; i++) if (!place[i]) place[i] = [Math.round(p[i][0] / GRID) * GRID, Math.round(p[i][1] / GRID) * GRID];

    // 平移到邊界內
    let gminx = Infinity, gminy = Infinity;
    place.forEach(g => { gminx = Math.min(gminx, g[0]); gminy = Math.min(gminy, g[1]); });
    chainPolys.forEach(v => v.pts.forEach(g => { gminx = Math.min(gminx, g[0]); gminy = Math.min(gminy, g[1]); }));
    const ox = PAD - gminx, oy = PAD - gminy;
    const pos = new Map();
    st.forEach((s, i) => pos.set(s.id, { x: place[i][0] + ox, y: place[i][1] + oy, i }));

    const paths = H.edges.map(e => {
      const iA = idx.get(e.a), iB = idx.get(e.b), cp = chainPolys.get(ek(iA, iB));
      let pts;
      if (cp) { pts = cp.pts.map(g => [g[0] + ox, g[1] + oy]); if (cp.from !== iA) pts.reverse(); }
      else { const A2 = pos.get(e.a), B2 = pos.get(e.b); pts = [[A2.x, A2.y], [B2.x, B2.y]]; }
      // 去掉共線的多餘點
      const clean = [pts[0]];
      for (let m = 1; m < pts.length - 1; m++) { const a2 = clean[clean.length - 1], b2 = pts[m], c2 = pts[m + 1]; if (Math.abs((b2[0] - a2[0]) * (c2[1] - b2[1]) - (b2[1] - a2[1]) * (c2[0] - b2[0])) > 0.5) clean.push(b2); }
      clean.push(pts[pts.length - 1]);
      return { a: e.a, b: e.b, pts: clean, svcs: e.svcs, len: e.len };
    });

    // 診斷：交叉數、轉折數、站距過近、非八方向的線段
    let cross = 0;
    const segs = paths.flatMap((pp, k2) => pp.pts.slice(1).map((q2, m) => [k2, pp.pts[m], q2]));
    const ccw = (A2, B2, C2) => (C2[1] - A2[1]) * (B2[0] - A2[0]) - (B2[1] - A2[1]) * (C2[0] - A2[0]);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (segs[i][0] === segs[j][0]) continue;
      const [, a2, b2] = segs[i], [, c2, d2] = segs[j];
      const share = [a2, b2].some(u => [c2, d2].some(v => Math.abs(u[0] - v[0]) < 0.5 && Math.abs(u[1] - v[1]) < 0.5));
      if (share) continue;
      if (ccw(a2, c2, d2) * ccw(b2, c2, d2) < 0 && ccw(a2, b2, c2) * ccw(a2, b2, d2) < 0) cross++;
    }
    let maxX = 0, maxY = 0; pos.forEach(v => { maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); });
    // 轉折：沿每條幹線段走，方向改變一次算一次
    let bends = 0, offGrid = 0;
    for (const nodes of chains) {
      let pd = -1;
      for (let m = 0; m < nodes.length - 1; m++) {
        const e2 = paths.find(pp => (pp.a === st[nodes[m]].id && pp.b === st[nodes[m + 1]].id) || (pp.b === st[nodes[m]].id && pp.a === st[nodes[m + 1]].id)); if (!e2) continue;
        const pts = e2.a === st[nodes[m]].id ? e2.pts : e2.pts.slice().reverse();
        for (let t = 1; t < pts.length; t++) {
          const dx = pts[t][0] - pts[t - 1][0], dy = pts[t][1] - pts[t - 1][1]; if (Math.hypot(dx, dy) < 0.5) continue;
          const kd = dirIdx(dx, dy), d8 = DIRS8[kd]; if (Math.abs(dx * d8[1] - dy * d8[0]) > 0.6) offGrid++;
          if (pd >= 0 && kd !== pd) bends++; pd = kd;
        }
      }
    }
    let near = 0, touch = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a2 = pos.get(st[i].id), b2 = pos.get(st[j].id); const dd = Math.hypot(a2.x - b2.x, a2.y - b2.y); if (dd < 24) near += 3; else if (dd < 52) near++; }
    for (let i = 0; i < n; i++) { const q2 = pos.get(st[i].id); for (const pp of paths) { if (pp.a === st[i].id || pp.b === st[i].id) continue; for (let m = 1; m < pp.pts.length; m++) { if (segDist(q2.x, q2.y, pp.pts[m - 1][0], pp.pts[m - 1][1], pp.pts[m][0], pp.pts[m][1]).d < 20) { touch++; break; } } } }
    let disp = 0; st.forEach((s, i) => { const q2 = pos.get(s.id); disp += Math.hypot(q2.x - ox - p0[i][0] + PAD - PAD, q2.y - oy - p0[i][1]); });
    return { pos, paths, width: maxX + PAD, height: maxY + PAD, crossings: cross, bends, offGrid, near, touch, disp: disp / n, grid: GRID };
  }

  /** 多組參數與隨機種子各算一次（可重現），挑「交叉最少、折點最少、離實際位置最近」的版面。
   * opts.tries：嘗試次數（網頁即時算用少一點；離線預算用多一點）。 */
  function layout(H, opts) {
    opts = opts || {};
    if (opts.recipe) { const r = layoutOnce(H, opts, opts.recipe); r.recipe = opts.recipe; return r; }   // 預先算好的參數：只算一次
    const tries = opts.tries || 10;
    const KA = [0.006, 0.012, 0.022, 0.035], LM = [66, 78, 92], AW = [0.45, 0.6, 0.8];
    let best = null;
    for (let k = 0; k < tries; k++) {
      const prm = k === 0 ? { ka: 0.012, Lmin: 78, aw: 0.55, seed: 0, jit: 0, ks: 0, tol: 30 }
        : { ka: KA[k % 4], Lmin: LM[(k >> 2) % 3], aw: AW[(k * 7) % 3], seed: k, jit: 10 + (k % 5) * 8, ks: [0, 0.03, 0.06, 0.1][(k >> 1) % 4], tol: 26 + (k % 3) * 6 };
      const r = layoutOnce(H, opts, prm);
      r.score = r.crossings * 1000 + r.touch * 500 + r.near * 120 + r.bends * 80 + r.offGrid * 500 + r.disp * 0.5;
      r.recipe = prm;
      if (opts.debug) console.log(k, JSON.stringify(prm), 'cross', r.crossings, 'bends', r.bends, 'touch', r.touch, 'near', r.near, 'disp', Math.round(r.disp), 'score', Math.round(r.score));
      if (!best || r.score < best.score) best = r;
      if (opts.stopAtZero && best.crossings === 0 && best.touch === 0 && k >= 5) break;
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
