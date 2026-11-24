/* hk-ui.js — 入口網站共用的畫面小工具：資料載入、DOM 輔助、路線圖繪製（SVG）。 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const HK = root.HK = root.HK || {};

  /* ───────── DOM ───────── */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  }
  const $ = (sel, r) => (r || document).querySelector(sel);
  const $$ = (sel, r) => [...(r || document).querySelectorAll(sel)];

  /* ───────── 資料載入 ───────── */
  async function getJSON(url, optional) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
      return await r.json();
    } catch (e) { if (optional) return null; throw e; }
  }
  /** 載入快照並建立索引；結果在同一頁內共用。 */
  let _p = null;
  function load() {
    if (_p) return _p;
    _p = (async () => {
      const snap = await getJSON('data/snapshot.json');
      const H = root.HK.build(snap);
      H.exportedAt = snap.exportedAt || (snap.data && snap.data.currentTime) || null;
      const layout = await getJSON('data/layout.json', true);
      H.layoutCache = layout;
      return H;
    })();
    return _p;
  }
  /** 路網指紋：車站名單＋連線（改了就代表版面要重算）。 */
  function netKey(H) {
    const nm = H.stations.map(st => st.zh + '@' + Math.round(st.x / 8) + ',' + Math.round(st.z / 8)).sort().join('|');
    const ed = H.edges.map(e => (H.stName(e.a) < H.stName(e.b) ? H.stName(e.a) + '~' + H.stName(e.b) : H.stName(e.b) + '~' + H.stName(e.a))).sort().join('|');
    let h = 5381; const str = nm + '#' + ed; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'v3:' + H.stations.length + ':' + H.edges.length + ':' + (h >>> 0).toString(36);
  }
  /** 版面：每次載入都依目前路網重算。順序：(1) 版面檔 data/layout.json 的 recipe 與目前路網指紋相同 → 直接重現（毫秒）；
   *  (2) 瀏覽器快取（localStorage）有同一指紋的 recipe → 重現；(3) 即時搜尋（約 1～2 秒）並存入快取。路網一更新，指紋就變，一定重算。 */
  function computeLayout(H) {
    const key = netKey(H), c = H.layoutCache, ov = (c && c.override) || {};
    const LS = 'hk-layout4-' + key;       // 第四版快取：舊版（即時搜尋、受裝置速度影響）存的粗糙結果不再沿用
    const tryRecipe = r => { try { const L = root.HK.map.layout(H, { override: ov, recipe: r }); return L; } catch (e) { return null; } };
    if (c && c.version === 3 && c.key === key && c.recipe) { const L = tryRecipe(c.recipe); if (L) return L; }
    try { const raw = localStorage.getItem(LS); if (raw) { const L = tryRecipe(JSON.parse(raw)); if (L) return L; } } catch (e) { /* 沒有快取就算了 */ }
    // 路網變了：以舊版面（layout.json 的 seed，或內建 HK.LAYOUT_SEED）為底，只調整新增／改變的線；次數固定，每台裝置結果一致
    const seed = (c && c.recipe && c.recipe.seed) || root.HK.LAYOUT_SEED;
    let L = null;
    if (seed) { try { L = root.HK.map.layout(H, { override: ov, seed }); } catch (e) { L = null; } }
    if (!L) L = root.HK.map.layout(H, { override: ov, refineMs: 2500 });
    try { localStorage.setItem(LS, JSON.stringify(L.recipe)); } catch (e) { /* 無痕模式等，忽略 */ }
    return L;
  }

  /* ───────── 路線圖 ───────── */
  function textW(str, px) { let w = 0; for (const ch of String(str)) w += ch.charCodeAt(0) > 255 ? px : px * 0.56; return w; }

  /** 2.4.0：折線轉成 SVG 路徑，每個轉折點做成半徑 r 的圓角（JR 路線圖的轉彎都是圓的）。
   *  不是用 stroke-linejoin: round——那個只把線寬的外緣磨圓（半徑＝線寬一半），看起來還是尖的；
   *  這裡是真的在幾何上退回 r 再用二次貝茲接起來，轉角兩側各退 r，r 會自動被兩段長度的一半夾住。 */
  function roundPath(pts, r) {
    const f = v => v.toFixed(1);
    if (!pts || pts.length < 2) return '';
    if (pts.length < 3 || !(r > 0)) return 'M' + pts.map(q => f(q[0]) + ' ' + f(q[1])).join('L');
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const p1 = [b[0] + (a[0] - b[0]) / l1 * rr, b[1] + (a[1] - b[1]) / l1 * rr];
      const p2 = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
      d += 'L' + f(p1[0]) + ' ' + f(p1[1]) + 'Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    const e = pts[pts.length - 1];
    return d + 'L' + f(e[0]) + ' ' + f(e[1]);
  }

  /* 2.16.0：路線（車站編號字首）與種別（班次）的模型。A＝路線別、B＝種別停車都用這份。 */
  const keyOf = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  function lum(hex) { const c = String(hex || '#000').replace('#', ''); if (c.length < 6) return 0; const f = i => parseInt(c.slice(i, i + 2), 16) / 255; return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4); }
  function lineModel(H, L) {
    if (L._lm) return L._lm;
    const CF = (HK.CFG) || root.HK_CONFIG || {};
    const LINES = CF.mapLines || [], byId = {}, pre = {};
    LINES.forEach(l => { byId[l.id] = l; (l.prefixes || []).forEach(p => pre[p] = l.id); });
    const wild = new Set(CF.mapWildCodes || []);
    const codeLines = id => { const st = new Set(); let w = false; H.codes(id).forEach(c => { const p = String(c).replace(/\d+[A-Z]?$/, ''); if (wild.has(c) || wild.has(p)) { w = true; return; } const l = pre[c] || pre[p]; if (l) st.add(l); }); return { s: st, w }; };
    const nameLines = n => LINES.map(l => [String(n).indexOf(l.key), l.id]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const eIdx = new Map(); L.paths.forEach((p, i) => eIdx.set(keyOf(p.a, p.b), i));
    const gKey = sv => String(sv.routeName).replace(/スーパー|通勤/g, '').replace(/松歲線直通|學園線直通/g, '').replace(/（.*?）/g, '').replace(/\s+/g, '');
    const groups = new Map(), onEdge = L.paths.map(() => new Set());
    H.svcs.forEach(sv => {
      if (sv.isHS) return;
      const k = gKey(sv);
      let g = groups.get(k);
      if (!g) { g = { key: k, name: k, cls: sv.tcls, color: sv.color || '#429769', stops: new Set(), pass: new Set(), edges: new Set(), seq: null, lrt: !!sv.isLRT }; groups.set(k, g); }
      const ss = sv.stops.filter(x => x.pax !== false).map(x => x.station);
      if (String(sv.routeName).replace(/\s+/g, '') === k && sv.color) g.color = sv.color;
      ss.forEach(x => g.stops.add(x));
      const full = [ss[0]];
      for (let i = 0; i + 1 < ss.length; i++) {
        const p = H.shortestPath(ss[i], ss[i + 1]); if (!p) continue;
        for (let j = 0; j + 1 < p.length; j++) { const ei = eIdx.get(keyOf(p[j], p[j + 1])); if (ei != null) { g.edges.add(ei); onEdge[ei].add(g); } }
        p.slice(1, -1).forEach(x => g.pass.add(x)); full.push(...p.slice(1));
      }
      if (!g.seq || full.length > g.seq.length) g.seq = full;
    });
    const edgeLines = L.paths.map((p, i) => {
      const A = codeLines(p.a), B = codeLines(p.b); let I = null;
      if (A.s.size && B.s.size) I = [...A.s].filter(x => B.s.has(x)); else if (A.s.size && B.w) I = [...A.s]; else if (B.s.size && A.w) I = [...B.s];
      const sl = [...new Set([...onEdge[i]].flatMap(g => nameLines(g.name)))];
      let r = I && I.length ? I.filter(x => sl.includes(x)) : [];
      if (!r.length && I && I.length === 1) r = I;
      if (!r.length) r = sl.slice(0, 1);
      if (!r.length && H.isLrtEdge && H.isLrtEdge(p) && byId.MONO) r = ['MONO'];
      return r.filter(x => byId[x]);
    });
    const order = LINES.map(l => l.id), cord = ['loc', 'exp', 'ltd'];
    const G = [...groups.values()];
    G.forEach(g => { g.home = nameLines(g.name)[0] || null; g.light = lum(g.color) > 0.6; });
    G.sort((a, b) => (order.indexOf(a.home) - order.indexOf(b.home)) || (cord.indexOf(a.cls) - cord.indexOf(b.cls)));
    const orient = L.paths.map(() => 0);
    [...G].sort((a, b) => b.edges.size - a.edges.size).forEach(g => {
      const q = g.seq || [];
      for (let k = 0; k + 1 < q.length; k++) { const ei = eIdx.get(keyOf(q[k], q[k + 1])); if (ei == null || orient[ei]) continue; orient[ei] = L.paths[ei].a === q[k] ? 1 : -1; }
    });
    const edgeGroups = L.paths.map((p, i) => G.filter(g => g.edges.has(i)));
    return (L._lm = { LINES, byId, edgeLines, edgeGroups, orient, groups: G, eIdx });
  }
  function offPts(pts, d) {
    if (!d) return pts;
    const n = pts.length, out = [];
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    for (let i = 0; i < n; i++) {
      let nx, ny;
      if (i === 0) [nx, ny] = nrm(pts[0], pts[1]); else if (i === n - 1) [nx, ny] = nrm(pts[n - 2], pts[n - 1]);
      else { const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]); let mx = a[0] + b[0], my = a[1] + b[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml; const c = mx * a[0] + my * a[1] || 1; nx = mx / c; ny = my / c; }
      out.push([pts[i][0] + nx * d, pts[i][1] + ny * d]);
    }
    return out;
  }

  /** 在 container 畫路線圖。回傳控制器 { svg, highlight(set), setTrains(list), onStation(fn) }。
   *  2.16.0：opts.mode＝'A'（路線別，預設）或 'B'（種別停車）；opts.lineLabels＝false 可不寫路線名稱。 */
  function renderMap(container, H, L, opts) {
    opts = opts || {};
    const W = L.width, HT = L.height, FS = opts.fontSize || 13;
    const CFGX = (root.HK && root.HK.CFG) || root.HK_CONFIG || {};
    const CR = opts.cornerRadius != null ? opts.cornerRadius : (CFGX.mapCornerRadius != null ? CFGX.mapCornerRadius : 10);   // 2.4.0 轉角圓角半徑
    const MODE = opts.mode === 'B' ? 'B' : 'A', LMD = lineModel(H, L);
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, class: 'rmap mode-' + MODE, role: 'img', 'aria-label': '光瀨都市鉄道 路線圖', preserveAspectRatio: 'xMidYMid meet' });
    const gEdge = s('g', { class: 'edges' }), gHs = s('g', { class: 'hs-edges' }), gLn = s('g', { class: 'line-names' }), gSt = s('g', { class: 'stations' }), gLab = s('g', { class: 'labels' }), gTr = s('g', { class: 'trains' });
    svg.append(gEdge, gHs, gLn, gSt, gLab, gTr);

    // 1.1.0：高速鐵路不計入拓樸（H.edges 已經排除），只在轉乘站之間疊一層虛線（含站外轉乘，例如幸村↔新光瀨）
    // 1.1.2：改用 L.hsPaths（只接受 45°／90° 轉彎的折線，車站位置完全沿用一般鐵路排好的結果）；
    //        顏色用 CFG.hsColor——跟票價查詢・車站時刻表・乘車轉乘查詢三頁共用的高速鉄道識別色一致，且跟一般鐵路（var(--g1)）明顯不同。
    gHs.style.setProperty('--hs-color', (HK.CFG && HK.CFG.hsColor) || '#136880');
    const hsEls = [];
    (L.hsPaths || H.hsEdges || []).forEach(e => {
      const cls = 'hs-line' + (e.walk ? ' hs-walk' : '');
      let el;
      if (e.pts) el = s('path', { d: roundPath(e.pts, CR), class: cls });
      else { const a = L.pos.get(e.a), b = L.pos.get(e.b); if (!a || !b) return; el = s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }); }
      gHs.append(el); hsEls.push({ e, el });
    });

    // 連結：每站經過的路線數（轉乘站畫大圓）
    const linesAt = new Map(); H.stations.forEach(st => linesAt.set(st.id, new Set()));
    H.svcs.forEach(sv => sv.stops.forEach(x => { if (x.pax !== false && linesAt.has(x.station)) linesAt.get(x.station).add(sv.line); }));

    /* 2.3.0：輕軌（LIGHT_RAIL）——跟高速鉄道不同，它在拓樸裡，站位與連線都照一般路線排；
     * 只有「只有輕軌在走」的路段改用藍色細線（跟一般路線共用的路段仍畫成一般路線）。 */
    gEdge.style.setProperty('--lrt-color', (HK.CFG && HK.CFG.lrtColor) || '#1f6fd0');
    gEdge.style.setProperty('--lrt-width', (((HK.CFG && HK.CFG.lrtWidth) || 3.6) + 'px'));   // 要帶 px：白色外框用 calc(... + 4.5px) 算，無單位數字沒辦法相加
    const edgeEls = [], GAP = 4.4, SW = 3.2, LWA = 7, bundle = [];
    L.paths.forEach((p, i) => {
      const pts = LMD.orient[i] < 0 ? p.pts.slice().reverse() : p.pts;
      const lrt = H.isLrtEdge ? H.isLrtEdge(p) : false, lines = [];
      let casing;
      if (MODE === 'B' && LMD.edgeGroups[i].length) {
        const gs = LMD.edgeGroups[i], n = gs.length;
        bundle[i] = n * GAP / 2 + 1;
        casing = s('path', { d: roundPath(pts, CR), class: 'e-casing', style: `stroke-width:${(n * GAP + 6).toFixed(1)}px` }); gEdge.append(casing);
        gs.forEach((g, k) => {
          const d = roundPath(offPts(pts, (k - (n - 1) / 2) * GAP), CR), w = g.lrt ? 2.4 : SW;
          if (g.light) gEdge.append(s('path', { d, class: 'strip-case', style: `stroke-width:${w + 1.8}px` }));
          const el = s('path', { d, class: 'e-line strip', style: `--lc:${g.color};--lw:${w}px` }); gEdge.append(el); lines.push(el);
        });
      } else {
        const ls = LMD.edgeLines[i].length ? LMD.edgeLines[i] : [null], n = ls.length, w = n > 1 ? 5 : LWA;
        bundle[i] = lrt ? 2.5 : n * w / 2 + (n > 1 ? 1 : 0);
        casing = s('path', { d: roundPath(pts, CR), class: 'e-casing' + (lrt ? ' lrt' : ''), style: n > 1 ? `stroke-width:${n * 5.6 + 5}px` : null }); gEdge.append(casing);
        ls.forEach((lid, k) => {
          const ln = lid ? LMD.byId[lid] : null, d = roundPath(offPts(pts, (k - (n - 1) / 2) * 5.6), CR);
          const el = s('path', { d, class: 'e-line' + (lrt ? ' lrt' : ''), style: ln && !lrt ? `--lc:${ln.color};--lw:${w}px` : null }); gEdge.append(el); lines.push(el);
        });
      }
      edgeEls.push({ p, line: lines, casing, i, pts });
    });
    /* B：停車站畫成橫跨停車種別的膠囊；中間夾著通過的種別就拆成兩顆 */
    const caps = new Map();
    if (MODE === 'B') {
      const pick = new Map();
      edgeEls.forEach(e => {
        const gs = LMD.edgeGroups[e.i]; if (!gs.length) return;
        const P = e.pts;
        const a = LMD.orient[e.i] < 0 ? e.p.b : e.p.a, b = LMD.orient[e.i] < 0 ? e.p.a : e.p.b;
        [[a, P[0], P[1], 1], [b, P[P.length - 1], P[P.length - 2], -1]].forEach(([sid, pt, nx, sg]) => {
          const c = pick.get(sid); if (c && c.gs.length >= gs.length) return;
          pick.set(sid, { gs, pt, dx: (nx[0] - pt[0]) * sg, dy: (nx[1] - pt[1]) * sg });
        });
      });
      pick.forEach((c, sid) => {
        const n = c.gs.length, l = Math.hypot(c.dx, c.dy) || 1, ux = c.dx / l, uy = c.dy / l, nx = -uy, ny = ux;
        const stop = c.gs.map(g => g.stops.has(sid)), runs = []; let a = -1;
        stop.concat([false]).forEach((v, k) => { if (v && a < 0) a = k; if (!v && a >= 0) { runs.push([a, k - 1]); a = -1; } });
        caps.set(sid, { runs: runs.map(([i0, i1]) => { const o0 = (i0 - (n - 1) / 2) * GAP - 3.6, o1 = (i1 - (n - 1) / 2) * GAP + 3.6; return { cx: c.pt[0] + nx * (o0 + o1) / 2, cy: c.pt[1] + ny * (o0 + o1) / 2, len: o1 - o0, ang: Math.atan2(ny, nx) * 180 / Math.PI }; }), half: n * GAP / 2 + 4 });
      });
    }

    // 站名位置：每站從 8 個候選位置挑「與其他標籤、車站、線重疊最少」者
    const boxes = [], pts = []; // 已放的標籤框
    L.pos.forEach(v => pts.push([v.x, v.y]));
    const segs = L.paths.flatMap(p => p.pts.slice(1).map((q, i) => [p.pts[i], q]));
    const rectHitSeg = (r, a, b) => {
      const inside = pt => pt[0] >= r.x && pt[0] <= r.x + r.w && pt[1] >= r.y && pt[1] <= r.y + r.h;
      if (inside(a) || inside(b)) return true;
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
      for (let k = 1; k < steps; k++) { const t = k / steps, pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (inside(pt)) return true; }
      return false;
    };
    const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    /* 2.4.0：站名之間的碰撞判定多留 LM 的空隙。實測貼齊時真正畫出來的字還是會疊到 1～2px
     * （估計的方框和瀏覽器實際排出來的字框不會完全一樣），留白之後就不會擦邊。 */
    const LM = 3;
    const overlapPad = (a, b) => !(a.x + a.w + LM <= b.x || b.x + b.w + LM <= a.x || a.y + a.h + LM <= b.y || b.y + b.h + LM <= a.y);
    const order = [...H.stations].sort((a, b) => (H.adj.get(b.id).length - H.adj.get(a.id).length));
    const labelPos = new Map();
    for (const st of order) {
      const q = L.pos.get(st.id), cstr = H.codeText ? H.codeText(st.id) : '',
        /* 2.4.0：站名寬度要抓寬一點。車站編號那一段是等寬字體（比 textW 的 0.56em 估計值寬），
         * 估太窄會讓避讓誤以為放得下，實測就是「M01/L08/KU10戸宮」這種長編號的站名疊到別人。 */
        w = (textW(st.zh, FS) + (cstr ? textW(cstr, FS - 3) * 1.18 + 6 : 0)) + 5, hgt = FS + 3, r = caps.has(st.id) ? Math.max(8, caps.get(st.id).half) : linesAt.get(st.id).size > 1 ? 11 : 8, gap = r + 3;
      /* 2.4.0：候選位置從 8 個擴成「兩圈 × 8 方向」＝16 個（外圈再退 11px）。
       * 站名互相疊是前輩明確要求要解決的，所以重疊的罰分拉到絕對壓倒性（1200），
       * 寧可把站名放到比較遠、比較醜的位置，也不要兩個站名疊在一起。 */
      const ring = g2 => [
        { dx: g2, dy: hgt / 2 - 3, a: 'start', box: { x: q.x + g2, y: q.y - hgt / 2 - 1, w, h: hgt } },
        { dx: -g2, dy: hgt / 2 - 3, a: 'end', box: { x: q.x - g2 - w, y: q.y - hgt / 2 - 1, w, h: hgt } },
        { dx: 0, dy: -g2 - 3, a: 'middle', box: { x: q.x - w / 2, y: q.y - g2 - hgt, w, h: hgt } },
        { dx: 0, dy: g2 + hgt - 2, a: 'middle', box: { x: q.x - w / 2, y: q.y + g2, w, h: hgt } },
        { dx: g2 - 2, dy: -g2 + 2, a: 'start', box: { x: q.x + g2 - 2, y: q.y - g2 - hgt + 4, w, h: hgt } },
        { dx: -g2 + 2, dy: -g2 + 2, a: 'end', box: { x: q.x - g2 + 2 - w, y: q.y - g2 - hgt + 4, w, h: hgt } },
        { dx: g2 - 2, dy: g2 + hgt - 6, a: 'start', box: { x: q.x + g2 - 2, y: q.y + g2 - 4, w, h: hgt } },
        { dx: -g2 + 2, dy: g2 + hgt - 6, a: 'end', box: { x: q.x - g2 + 2 - w, y: q.y + g2 - 4, w, h: hgt } },
      ];
      const cands = ring(gap).concat(ring(gap + 11));
      let best = null;
      cands.forEach((c, k) => {
        let pen = k * 0.6;
        boxes.forEach(b => { if (overlapPad(c.box, b)) pen += 1200; });   // 2.4.0：站名重疊是最不能接受的，罰分壓倒其他項
        pts.forEach(pt => { if (pt[0] > c.box.x - 7 && pt[0] < c.box.x + c.box.w + 7 && pt[1] > c.box.y - 7 && pt[1] < c.box.y + c.box.h + 7) pen += 60; });
        segs.forEach(sg => { if (rectHitSeg({ x: c.box.x - 2, y: c.box.y - 1, w: c.box.w + 4, h: c.box.h + 2 }, sg[0], sg[1])) pen += 25; });
        if (c.box.x < 2 || c.box.x + c.box.w > W - 2 || c.box.y < 2 || c.box.y + c.box.h > HT - 2) pen += 80;
        if (!best || pen < best.pen) best = { ...c, pen };
      });
      /* 16 個位置全都卡住時（市區最密的地方會發生）：沿著「離開最近的那個站名」的方向，
       * 以 4px 為一步往外推，最多推 9 步（36px），直到不再重疊為止。推完仍重疊才放棄。 */
      if (boxes.some(b => overlapPad(best.box, b))) {
        const dirs8 = [[1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0], [-0.7, 0.7], [0, 1], [0.7, 0.7]];
        let fixedCand = null;
        for (let step = 1; step <= 14 && !fixedCand; step++) {
          for (const u of dirs8) {
            const ox = u[0] * step * 4, oy = u[1] * step * 4;
            const nb2 = { x: best.box.x + ox, y: best.box.y + oy, w: best.box.w, h: best.box.h };
            if (nb2.x < 2 || nb2.x + nb2.w > W - 2 || nb2.y < 2 || nb2.y + nb2.h > HT - 2) continue;
            if (boxes.some(b => overlapPad(nb2, b))) continue;
            fixedCand = { dx: best.dx + ox, dy: best.dy + oy, a: best.a, box: nb2 };
            break;
          }
        }
        if (fixedCand) best = fixedCand;
      }
      boxes.push(best.box); labelPos.set(st.id, best);
    }
    /* 2.16.0：路線名稱寫在線旁（路線色）。每條路線挑最長的直線段，避開站名與車站。 */
    if (opts.lineLabels !== false) {
      const segsBy = new Map();
      edgeEls.forEach(e => {
        const ls = LMD.edgeLines[e.i]; if (ls.length !== 1) return;
        const P = e.pts;
        for (let k = 0; k + 1 < P.length; k++) { const len = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]); (segsBy.get(ls[0]) || segsBy.set(ls[0], []).get(ls[0])).push({ a: P[k], b: P[k + 1], len, bw: bundle[e.i] || 4 }); }
      });
      const nb = [];
      LMD.LINES.forEach(ln => {
        const sg = (segsBy.get(ln.id) || []).sort((x, y) => y.len - x.len); if (!sg.length) return;
        const total = sg.reduce((t, x) => t + x.len, 0), want = total > 1600 ? 2 : 1, fs = 12, tw = textW(ln.zh, fs) + 8, th = fs + 4, got = [];
        for (const g of sg.slice(0, 12)) {
          if (got.length >= want) break;
          if (g.len < tw + 26) continue;
          const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l = g.len, ux = dx / l, uy = dy / l;
          let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
          const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, ca = Math.abs(Math.cos(ang * Math.PI / 180)), sa = Math.abs(Math.sin(ang * Math.PI / 180));
          const hw = (ca * tw + sa * th) / 2, hh = (sa * tw + ca * th) / 2;
          let best = null;
          [1, -1].forEach(sd => {
            const o = g.bw + th / 2 + 3, cx = mx - uy * o * sd, cy = my + ux * o * sd, bx = { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
            let pen = 0;
            boxes.forEach(b => { if (overlap(bx, b)) pen += 100; });
            nb.forEach(b => { if (overlap(bx, b)) pen += 100; });
            pts.forEach(pt => { if (pt[0] > bx.x - 6 && pt[0] < bx.x + bx.w + 6 && pt[1] > bx.y - 6 && pt[1] < bx.y + bx.h + 6) pen += 40; });
            if (got.some(q => Math.hypot(q[0] - cx, q[1] - cy) < 500)) pen += 1000;
            if (!best || pen < best.pen) best = { pen, cx, cy, bx };
          });
          if (!best || best.pen >= 100) continue;
          got.push([best.cx, best.cy]); nb.push(best.bx);
          gLn.append(s('text', { transform: `translate(${best.cx.toFixed(1)} ${best.cy.toFixed(1)}) rotate(${ang.toFixed(1)})`, 'text-anchor': 'middle', dy: '0.36em', class: 'ln-name', style: `fill:${ln.color}` }, ln.zh));
        }
      });
      boxes.push(...nb);
    }

    { // 依內容裁切 viewBox（含站名），避免四周留白過大
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      L.pos.forEach(v => { x0 = Math.min(x0, v.x - 14); y0 = Math.min(y0, v.y - 14); x1 = Math.max(x1, v.x + 14); y1 = Math.max(y1, v.y + 14); });
      boxes.forEach(b => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
      const m = 18; svg.setAttribute('viewBox', `${(x0 - m).toFixed(0)} ${(y0 - m).toFixed(0)} ${(x1 - x0 + 2 * m).toFixed(0)} ${(y1 - y0 + 2 * m).toFixed(0)}`);
    }
    const stEls = new Map(), cbs = { station: [] };
    H.stations.forEach(st => {
      const q = L.pos.get(st.id), multi = linesAt.get(st.id).size > 1, lp = labelPos.get(st.id);
      const g = s('g', { class: 'st' + (multi ? ' xfer' : ''), 'data-id': st.id, tabindex: opts.interactive ? '0' : null, role: opts.interactive ? 'button' : null, 'aria-label': opts.interactive ? st.zh : null });
      const cp = caps.get(st.id);
      if (cp && cp.runs.length) cp.runs.forEach(r => g.append(s('rect', { x: (-r.len / 2).toFixed(1), y: -3.9, width: r.len.toFixed(1), height: 7.8, rx: 3.9, class: 'st-cap', transform: `translate(${r.cx.toFixed(1)} ${r.cy.toFixed(1)}) rotate(${r.ang.toFixed(1)})` })));
      else {
        if (multi) g.append(s('circle', { cx: q.x, cy: q.y, r: 11, class: 'st-ring' }));
        g.append(s('circle', { cx: q.x, cy: q.y, r: multi ? 6.5 : 8, class: 'st-dot' }));
      }
      const label = s('text', { x: q.x + lp.dx, y: q.y + lp.dy, 'text-anchor': lp.a, class: 'st-name' }, (H.codes(st.id).length ? [s('tspan', { class: 'st-code' }, H.codeText(st.id)), s('tspan', { dx: 4 }, st.zh)] : st.zh));
      g.append(label);
      if (opts.interactive) {
        g.append(s('circle', { cx: q.x, cy: q.y, r: 16, class: 'st-hit' }));
        const fire = () => cbs.station.forEach(f => f(st));
        g.addEventListener('click', fire); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
      }
      gSt.append(g); stEls.set(st.id, g);
    });

    container.replaceChildren(svg);
    const ctl = {
      svg, stEls,
      onStation(fn) { cbs.station.push(fn); },
      /** 強調一組車站與相鄰邊（其餘變淡）；傳 null 取消。 */
      highlight(stationIds, edgeKeys) {
        const on = !!stationIds;
        svg.classList.toggle('dim', on);
        stEls.forEach((g, id) => g.classList.toggle('on', on && stationIds.has(id)));
        edgeEls.forEach(e => { const k = keyOf(e.p.a, e.p.b), v = !!(on && edgeKeys && edgeKeys.has(k)); e.line.forEach(x => x.classList.toggle('on', v)); e.casing.classList.toggle('on', v); });
        hsEls.forEach(x => x.el.classList.toggle('on', false));
      },
      /** 2.16.0：把一趟行程（legs）在圖上標出來，其餘變淡，並把視野縮到行程範圍。 */
      route(legs) {
        const ids = new Set(), ek = new Set(), hsIds = new Set();
        (legs || []).forEach(leg => {
          const ss = (leg.stops || []).map(x => x.station).filter(id => H.stById[id] && L.pos.get(id));
          if (leg.sv && leg.sv.isHS) { ss.forEach(x => { ids.add(x); hsIds.add(x); }); return; }
          for (let k = 0; k + 1 < ss.length; k++) { const p = H.shortestPath(ss[k], ss[k + 1]) || [ss[k], ss[k + 1]]; p.forEach(x => ids.add(x)); for (let j = 0; j + 1 < p.length; j++) ek.add(keyOf(p[j], p[j + 1])); }
          ss.forEach(x => ids.add(x));
          if (leg.walk && leg.walk.to && L.pos.get(leg.walk.to)) ids.add(leg.walk.to);
        });
        ctl.highlight(ids, ek);
        hsEls.forEach(x => x.el.classList.toggle('on', hsIds.has(x.e.a) && hsIds.has(x.e.b)));
        const first = legs && legs[0] && legs[0].stops[0], lastL = legs && legs[legs.length - 1], last = lastL && lastL.stops[lastL.stops.length - 1];
        stEls.forEach((g, id) => g.classList.toggle('sel', !!((first && id === first.station) || (last && id === last.station))));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        ids.forEach(id => { const v = L.pos.get(id); if (!v) return; x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); });
        if (x0 < Infinity) { const m = 70, w = Math.max(360, x1 - x0 + 2 * m), hh = Math.max(240, y1 - y0 + 2 * m); svg.setAttribute('viewBox', `${((x0 + x1) / 2 - w / 2).toFixed(0)} ${((y0 + y1) / 2 - hh / 2).toFixed(0)} ${w.toFixed(0)} ${hh.toFixed(0)}`); }
      },
      mark(id, cls) { stEls.forEach((g, k) => g.classList.toggle(cls, k === id)); },
      /** 2.9.0：替一組邊（a|b）加上 class（HIKACARD 不能使用的區間畫成灰色虛線用）。 */
      markEdges(edgeKeys, cls) {
        edgeEls.forEach(e => { const on = !!edgeKeys && edgeKeys.has(keyOf(e.p.a, e.p.b)); e.line.forEach(x => x.classList.toggle(cls, on)); e.casing.classList.toggle(cls, on); });
      },
      /** 以時刻表推算的列車位置。list 來自 H.activeTrains。 */
      setTrains(list, onClick) {
        gTr.replaceChildren();
        const pathOf = (a, b) => {
          const p = H.shortestPath(a, b); if (!p) return null;
          const pts = [];
          for (let i = 0; i < p.length - 1; i++) {
            const k = p[i] < p[i + 1] ? p[i] + '|' + p[i + 1] : p[i + 1] + '|' + p[i];
            const e = L.paths.find(x => (x.a < x.b ? x.a + '|' + x.b : x.b + '|' + x.a) === k); if (!e) continue;
            const seg = e.a === p[i] ? e.pts : e.pts.slice().reverse();
            seg.forEach((q, j) => { if (pts.length && j === 0) return; pts.push(q); });
          }
          return pts.length > 1 ? pts : null;
        };
        const cache = ctl._pc || (ctl._pc = new Map());
        list.forEach(tr => {
          const key = tr.from + '>' + tr.to; let pts = cache.get(key);
          if (pts === undefined) { pts = pathOf(tr.from, tr.to); cache.set(key, pts); }
          if (!pts) return;
          const [x, y] = root.HK.map.pointAt(pts, tr.frac);
          const g = s('g', { class: 'tr ' + tr.sv.tcls, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, tabindex: '0', role: 'button', 'aria-label': `${tr.sv.routeName} ${H.destOf(tr.sv, tr.i)}行き` });
          g.append(s('rect', { x: -9, y: -6, width: 18, height: 12, rx: 2, class: 'tr-body', style: tr.sv.color ? `fill:${tr.sv.color}` : null }), s('rect', { x: -14, y: -14, width: 28, height: 28, class: 'tr-hit', fill: 'transparent' }));
          if (onClick) { g.addEventListener('click', () => onClick(tr)); g.addEventListener('keydown', e => { if (e.key === 'Enter') onClick(tr); }); }
          gTr.append(g);
        });
      },
    };
    return ctl;
  }

  /** 2.16.0：可切換「路線別（A）／種別停車（B）」的路線圖。which＝'map'／'home'／'live'，預設值看 CFG.mapDefaultMode，
   *  使用者選過就記在 localStorage。回傳的控制器跟 renderMap 一樣，切換時會重畫並重新套用車站點選、列車位置。 */
  function renderMapSwitch(container, H, L, opts, which) {
    const CF = (HK.CFG) || root.HK_CONFIG || {}, LSK = 'hk-mapmode-' + which;
    let mode = ((CF.mapDefaultMode || {})[which]) || 'A';
    try { const v = localStorage.getItem(LSK); if (v === 'A' || v === 'B') mode = v; } catch (e) { /* 沒有 localStorage */ }
    const bar = h('div', { class: 'mapmode', role: 'group', 'aria-label': '路線圖顯示方式' }), inner = h('div', { class: 'mapinner' }), leg = h('div', { class: 'legend maplegend' });
    container.replaceChildren(bar, inner, leg);
    const st = { cbs: [], trains: null, mark: null };
    let ctl = null;
    function legend() {
      const LM = lineModel(H, L);
      if (mode === 'A') leg.replaceChildren(...LM.LINES.filter((l, i) => LM.edgeLines.some(x => x.includes(l.id))).map(l => h('span', null, h('i', { class: 'rc', style: `background:${l.color}` }), l.zh)), h('span', null, '○ 車站'), h('span', null, '◎ 轉乘站'));
      else leg.replaceChildren(...LM.groups.map(g => h('span', null, h('i', { class: 'rc' + (g.light ? ' light' : ''), style: `background:${g.color}` }), g.name)), h('span', null, '膠囊橫跨的線＝在這站停車，沒有被蓋到的線＝通過'));
    }
    function draw() {
      ctl = renderMap(inner, H, L, Object.assign({}, opts, { mode }));
      st.cbs.forEach(f => ctl.onStation(f));
      if (st.trains) ctl.setTrains(...st.trains);
      if (st.mark) ctl.mark(...st.mark);
      bar.replaceChildren(...[['B', '種別停車'], ['A', '路線別']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(mode === k), onclick: () => { if (mode === k) return; mode = k; try { localStorage.setItem(LSK, k); } catch (e) { } draw(); } }, t)));
      legend();
    }
    draw();
    return {
      get svg() { return ctl.svg; }, get stEls() { return ctl.stEls; },
      onStation(f) { st.cbs.push(f); ctl.onStation(f); },
      setTrains(...a) { st.trains = a; ctl.setTrains(...a); },
      mark(...a) { st.mark = a; ctl.mark(...a); },
      highlight(...a) { ctl.highlight(...a); }, markEdges(...a) { ctl.markEdges(...a); }, route(...a) { ctl.route(...a); },
    };
  }

  /** 種別標籤（白綠配色：特急類＝綠底白字、急行／快速類＝綠框、各停＝灰框）。
   *  1.1.0：高速鉄道（isHS）固定用票價查詢・車站時刻表・乘車轉乘查詢三頁共用的識別色（CFG.hsColor），
   *  不套用一般種別的配色與路線色，讓高速鉄道的班次在時刻表、路線資訊等各處都一眼就認得出來。 */
  function typeTag(sv) {
    if (sv.isHS) { const c = (HK.CFG && HK.CFG.hsColor) || '#136880'; return h('span', { class: 'ttag t-hs', style: `background:${c};border-color:${c};color:#fff` }, '高速'); }
    const st = sv.color ? `background:${sv.color};border-color:${sv.color};color:${sv.ink}` : null; return sv.type ? h('span', { class: 'ttag t-' + sv.tcls, style: st }, sv.type) : h('span', { class: 'ttag t-loc', style: st }, '各停');
  }
  /** 以最簡短的字呈現種別（時刻表格子用）。高速鉄道固定用「高」。 */
  function typeMark(sv) { if (sv.isHS) return '高'; return root.HK.typeMarkOf(sv.type); }

  const fmtDate = ms => { if (!ms) return ''; const d = new Date(Number(ms)); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  /** 1.1.2：起訖站選單裡的万瀨高速鉄道線延伸段車站——只在勾選「可以利用高速鉄道」時才出現在選單最後的 optgroup，
   *  取消勾選時移除；如果移除時原本選到的剛好是延伸段車站，就把選值退回第一個（一般）選項，避免選單留著一個不存在的值。
   *  已經視為通車，不再用「假想／地圖外」這類字眼，每個選項後面統一標「*高速鉄道」，讓玩家知道只能搭高速鉄道抵達。
   *  乘車・轉乘查詢（site.js）與訂票（booking.js）共用這個函式。
   *  2.7.0：車站選單換成 stationPicker() 之後，這裡改呼叫它的 setExtraGroup／clearExtraGroup，不再直接動 <select> DOM。 */
  function refreshHSExtOptions(H, sel, show) {
    if (typeof sel.setExtraGroup !== 'function') {   // 舊版原生 <select>（瀏覽器還留著舊的 site.js／booking.js 快取時）
      let grp = sel.querySelector('optgroup[data-hsext]');
      if (show && H.hsExtStops && H.hsExtStops.length) {
        if (!grp) { grp = h('optgroup', { label: '万瀨高速鉄道線延伸段', 'data-hsext': '1' }); sel.append(grp); }
        grp.replaceChildren(...H.hsExtStops.map(st => h('option', { value: st.id }, st.zh + '　*高速鉄道')));
      } else if (grp) { const wasVirtual = String(sel.value).indexOf('hsext:') === 0; grp.remove(); if (wasVirtual) sel.selectedIndex = 0; }
      return;
    }
    if (show && H.hsExtStops && H.hsExtStops.length) {
      sel.setExtraGroup('万瀨高速鉄道線延伸段', H.hsExtStops.map(st => ({ id: st.id, label: st.zh + '　*高速鉄道' })));
    } else {
      sel.clearExtraGroup();
    }
  }

  /* ───────── 車站選單（2.7.0） ─────────
   * 前輩的需求：
   *   (1) 可以直接打字搜尋（站名／車站編號都比對）
   *   (2) 不打字時，依路線字母編號分組排在一起
   *   (3) 同字母的話，依北到南排列（Minecraft 座標：z 越小越北）
   *   (4) みつせ預設排最前面
   *   (5) 單軌（光瀨市交通局）車站獨立一區
   * 對外行為盡量維持跟原生 <select> 相容：.value／.name 可讀可寫，選到站會呼叫 onChange(id)，
   * 讓 site.js／booking.js 既有的程式（含 refreshHSExtOptions）幾乎不用改寫使用方式。 */
  function stPrimaryLetter(H, st) {
    const cs = H.codes(st.id);
    if (!cs.length) return null;
    const m = String(cs[0]).match(/^[A-Za-z]+/);
    return m ? m[0] : null;
  }
  /** 依前輩的規則排好的車站清單：{ pinned:[みつせ], groups:[{key,label,stations}], mono:[...] } */
  function stationGroups(H) {
    const all = H.stations;
    const mono = all.filter(st => H.monoOnlyIds.has(st.id)).slice().sort((a, b) => (a.z - b.z) || a.zh.localeCompare(b.zh, 'ja'));
    const monoSet = new Set(mono.map(st => st.id));
    const pinned = all.filter(st => st.zh === 'みつせ');
    const pinnedSet = new Set(pinned.map(st => st.id));
    const rest = all.filter(st => !monoSet.has(st.id) && !pinnedSet.has(st.id));
    const byLetter = new Map();
    rest.forEach(st => { const k = stPrimaryLetter(H, st) || 'other'; if (!byLetter.has(k)) byLetter.set(k, []); byLetter.get(k).push(st); });
    const letters = [...byLetter.keys()].sort((a, b) => a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b));
    const groups = letters.map(k => ({ key: k, label: k === 'other' ? '其他' : k, stations: byLetter.get(k).sort((a, b) => (a.z - b.z) || a.zh.localeCompare(b.zh, 'ja')) }));
    return { pinned, groups, mono };
  }
  /** 字串正規化：去空白、轉小寫，方便比對英數字（站名本身是中文就直接比對原字）。 */
  const stNorm = x => String(x || '').trim().toLowerCase();
  function stationSearch(H, query) {
    const q = stNorm(query);
    if (!q) return null;
    const score = st => {
      const zh = st.zh, codes = H.codes(st.id).join('/');
      const zhL = stNorm(zh), codeL = stNorm(codes), enL = stNorm(st.en);
      const tl = (root.HK_I18N && root.HK_I18N.t) ? stNorm(root.HK_I18N.t(zh)) : zhL;   // 目前語言的站名（日文漢字寫法等）
      if (zhL === q || codeL === q || enL === q || tl === q) return 0;
      if (zhL.startsWith(q) || codeL.startsWith(q) || (enL && enL.startsWith(q)) || tl.startsWith(q)) return 1;
      if (zh.indexOf(query) >= 0 || codeL.indexOf(q) >= 0 || (enL && enL.indexOf(q) >= 0) || tl.indexOf(q) >= 0) return 2;
      return -1;
    };
    return H.stations.map(st => ({ st, sc: score(st) })).filter(x => x.sc >= 0).sort((a, b) => a.sc - b.sc || (a.st.z - b.st.z)).map(x => x.st);
  }
  /** opts: { id, label, onChange, allowEmpty（空選項文字，不給就不顯示）, placeholder } */
  function stationPicker(H, opts) {
    opts = opts || {};
    let value = opts.id || (opts.allowEmpty ? '' : ((stationGroups(H).pinned[0] || H.stations[0] || {}).id || ''));
    let extraLabel = null, extraStops = [];     // 万瀨高速鉄道線延伸段（refreshHSExtOptions 用）
    const hidden = h('input', { type: 'hidden', value });
    const box = h('input', { type: 'text', autocomplete: 'off', 'aria-label': opts.label || '', placeholder: opts.placeholder || '輸入站名搜尋…', class: 'stpick-box' });
    const list = h('ul', { class: 'stpick-list', role: 'listbox', hidden: true });
    const wrap = h('div', { class: 'stpick' }, box, list);
    let open = false, activeEl = null;

    function labelOf(id) {
      if (!id) return '';
      if (String(id).indexOf('hsext:') === 0) { const e = extraStops.find(s => s.id === id); return e ? e.label.replace(/　\*高速鉄道$/, '') : id; }
      const cs = H.codes(id);
      return (cs.length ? cs.join('/') + ' ' : '') + H.stName(id);
    }
    const T = x => (root.HK_I18N && root.HK_I18N.t) ? root.HK_I18N.t(x) : x;   // 輸入框的值不是文字節點，i18n 不會自動翻，這裡自己翻
    function syncBoxText() { box.value = T(labelOf(value)); }
    syncBoxText();

    function closeList() { open = false; list.hidden = true; activeEl = null; list.replaceChildren(); }
    function setActive(el) { if (activeEl) activeEl.classList.remove('active'); activeEl = el; if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); } }
    function choose(id) {
      value = id; hidden.value = id; syncBoxText(); closeList(); box.blur();
      if (opts.onChange) opts.onChange(id);
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function row(idVal, text, extraCls) {
      const li = h('li', { role: 'option', class: 'stpick-opt' + (extraCls ? ' ' + extraCls : '') }, text);
      li.addEventListener('mousedown', e => { e.preventDefault(); choose(idVal); });
      li.addEventListener('mouseenter', () => setActive(li));
      return li;
    }
    function renderGrouped() {
      list.replaceChildren();
      if (opts.allowEmpty) list.append(row('', opts.allowEmpty, 'stpick-empty'));
      const { pinned, groups, mono } = stationGroups(H);
      pinned.forEach(st => list.append(row(st.id, labelOf(st.id), 'stpick-pin')));
      groups.forEach(g => {
        list.append(h('li', { class: 'stpick-group', role: 'presentation' }, g.label));
        g.stations.forEach(st => list.append(row(st.id, labelOf(st.id))));
      });
      if (mono.length) {
        list.append(h('li', { class: 'stpick-group stpick-mono-h', role: 'presentation' }, '單軌（光瀨市交通局）'));
        mono.forEach(st => list.append(row(st.id, labelOf(st.id), 'stpick-mono')));
      }
      if (extraStops.length) {
        list.append(h('li', { class: 'stpick-group', role: 'presentation' }, extraLabel));
        extraStops.forEach(e => list.append(row(e.id, e.label)));
      }
    }
    function renderSearch(q) {
      list.replaceChildren();
      const found = stationSearch(H, q) || [];
      const extraHit = extraStops.filter(e => stNorm(e.label).indexOf(stNorm(q)) >= 0);
      if (!found.length && !extraHit.length) { list.append(h('li', { class: 'stpick-empty', role: 'presentation' }, '找不到符合的車站')); return; }
      found.forEach(st => list.append(row(st.id, labelOf(st.id), H.monoOnlyIds.has(st.id) ? 'stpick-mono' : null)));
      extraHit.forEach(e => list.append(row(e.id, e.label)));
    }
    /* 2.7.0：首頁的 .band 區塊有 overflow:hidden（做背景模糊效果用），用一般的 position:absolute 下拉選單
     * 會被它裁掉。改用 position:fixed、每次開啟時依輸入框目前的畫面座標算好位置，就不會被任何祖先的
     * overflow:hidden 裁切；捲動時直接收起選單（一般下拉選單常見的作法），避免還要追著重新定位。 */
    function placeList() {
      const r = box.getBoundingClientRect();
      Object.assign(list.style, { position: 'fixed', top: (r.bottom + 2) + 'px', left: r.left + 'px', width: r.width + 'px', right: 'auto' });
    }
    function onScrollClose() { if (open) { syncBoxText(); closeList(); } }
    function openList() { open = true; list.hidden = false; placeList(); const q = box.value; (stNorm(q) && q !== T(labelOf(value))) ? renderSearch(q) : renderGrouped(); }
    box.addEventListener('focus', () => { box.select(); openList(); window.addEventListener('scroll', onScrollClose, { passive: true, capture: true }); window.addEventListener('resize', placeList); });
    box.addEventListener('input', () => { open = true; list.hidden = false; placeList(); renderSearch(box.value); });
    box.addEventListener('blur', () => { setTimeout(() => { if (open) { syncBoxText(); closeList(); } window.removeEventListener('scroll', onScrollClose, { capture: true }); window.removeEventListener('resize', placeList); }, 120); });
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') { syncBoxText(); closeList(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (activeEl) activeEl.dispatchEvent(new Event('mousedown')); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!open) { openList(); return; }
        const items = [...list.querySelectorAll('.stpick-opt')]; if (!items.length) return;
        let i = activeEl ? items.indexOf(activeEl) : -1;
        i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
        setActive(items[i]);
      }
    });

    Object.defineProperty(wrap, 'value', { get: () => value, set: v => { value = v || ''; hidden.value = value; syncBoxText(); } });
    Object.defineProperty(wrap, 'name', { get: () => hidden.name, set: v => { hidden.name = v; } });
    wrap.append(hidden);
    wrap.setExtraGroup = (label, stops) => { extraLabel = label; extraStops = stops || []; };
    wrap.clearExtraGroup = () => {
      const wasVirtual = String(value).indexOf('hsext:') === 0;
      extraLabel = null; extraStops = [];
      if (wasVirtual) { const { pinned } = stationGroups(H); wrap.value = (opts.allowEmpty ? '' : (pinned[0] && pinned[0].id) || ''); if (opts.onChange) opts.onChange(wrap.value); }
    };
    return wrap;
  }

  Object.assign(HK, { h, s, $, $$, getJSON, load, computeLayout, netKey, renderMap, renderMapSwitch, lineModel, typeTag, typeMark, fmtDate, refreshHSExtOptions, stationPicker, stationGroups });
})(window);
