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

  /** 在 container 畫路線圖。回傳控制器 { svg, highlight(set), setTrains(list), onStation(fn) }。 */
  function renderMap(container, H, L, opts) {
    opts = opts || {};
    const W = L.width, HT = L.height, FS = opts.fontSize || 13;
    const CFGX = (root.HK && root.HK.CFG) || root.HK_CONFIG || {};
    const CR = opts.cornerRadius != null ? opts.cornerRadius : (CFGX.mapCornerRadius != null ? CFGX.mapCornerRadius : 10);   // 2.4.0 轉角圓角半徑
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, class: 'rmap', role: 'img', 'aria-label': '光瀨都市鉄道 路線圖', preserveAspectRatio: 'xMidYMid meet' });
    const gEdge = s('g', { class: 'edges' }), gHs = s('g', { class: 'hs-edges' }), gSt = s('g', { class: 'stations' }), gLab = s('g', { class: 'labels' }), gTr = s('g', { class: 'trains' });
    svg.append(gEdge, gHs, gSt, gLab, gTr);

    // 1.1.0：高速鐵路不計入拓樸（H.edges 已經排除），只在轉乘站之間疊一層虛線（含站外轉乘，例如幸村↔新光瀨）
    // 1.1.2：改用 L.hsPaths（只接受 45°／90° 轉彎的折線，車站位置完全沿用一般鐵路排好的結果）；
    //        顏色用 CFG.hsColor——跟票價查詢・車站時刻表・乘車轉乘查詢三頁共用的高速鉄道識別色一致，且跟一般鐵路（var(--g1)）明顯不同。
    gHs.style.setProperty('--hs-color', (HK.CFG && HK.CFG.hsColor) || '#136880');
    (L.hsPaths || H.hsEdges || []).forEach(e => {
      const cls = 'hs-line' + (e.walk ? ' hs-walk' : '');
      if (e.pts) { gHs.append(s('path', { d: roundPath(e.pts, CR), class: cls })); return; }
      const a = L.pos.get(e.a), b = L.pos.get(e.b); if (!a || !b) return;
      gHs.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }));
    });

    // 連結：每站經過的路線數（轉乘站畫大圓）
    const linesAt = new Map(); H.stations.forEach(st => linesAt.set(st.id, new Set()));
    H.svcs.forEach(sv => sv.stops.forEach(x => { if (x.pax !== false && linesAt.has(x.station)) linesAt.get(x.station).add(sv.line); }));

    /* 2.3.0：輕軌（LIGHT_RAIL）——跟高速鉄道不同，它在拓樸裡，站位與連線都照一般路線排；
     * 只有「只有輕軌在走」的路段改用藍色細線（跟一般路線共用的路段仍畫成一般路線）。 */
    gEdge.style.setProperty('--lrt-color', (HK.CFG && HK.CFG.lrtColor) || '#1f6fd0');
    gEdge.style.setProperty('--lrt-width', (((HK.CFG && HK.CFG.lrtWidth) || 3.6) + 'px'));   // 要帶 px：白色外框用 calc(... + 4.5px) 算，無單位數字沒辦法相加
    const edgeEls = [];
    L.paths.forEach(p => {
      const d = roundPath(p.pts, CR);
      const lrt = H.isLrtEdge ? H.isLrtEdge(p) : false;
      const casing = s('path', { d, class: 'e-casing' + (lrt ? ' lrt' : '') }), line = s('path', { d, class: 'e-line' + (lrt ? ' lrt' : '') });
      gEdge.append(casing, line); edgeEls.push({ p, line, casing });
    });

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
        w = (textW(st.zh, FS) + (cstr ? textW(cstr, FS - 3) * 1.18 + 6 : 0)) + 5, hgt = FS + 3, r = linesAt.get(st.id).size > 1 ? 11 : 8, gap = r + 3;
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
      if (multi) g.append(s('circle', { cx: q.x, cy: q.y, r: 11, class: 'st-ring' }));
      g.append(s('circle', { cx: q.x, cy: q.y, r: multi ? 6.5 : 8, class: 'st-dot' }));
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
        edgeEls.forEach(e => { const k = e.p.a < e.p.b ? e.p.a + '|' + e.p.b : e.p.b + '|' + e.p.a; e.line.classList.toggle('on', on && edgeKeys && edgeKeys.has(k)); e.casing.classList.toggle('on', on && edgeKeys && edgeKeys.has(k)); });
      },
      mark(id, cls) { stEls.forEach((g, k) => g.classList.toggle(cls, k === id)); },
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
   *  乘車・轉乘查詢（site.js）與訂票（booking.js）共用這個函式。 */
  function refreshHSExtOptions(H, sel, show) {
    let grp = sel.querySelector('optgroup[data-hsext]');
    if (show && H.hsExtStops && H.hsExtStops.length) {
      if (!grp) { grp = h('optgroup', { label: '万瀨高速鉄道線延伸段', 'data-hsext': '1' }); sel.append(grp); }
      grp.replaceChildren(...H.hsExtStops.map(st => h('option', { value: st.id }, st.zh + '　*高速鉄道')));
    } else if (grp) {
      const wasVirtual = String(sel.value).indexOf('hsext:') === 0;
      grp.remove();
      if (wasVirtual) sel.selectedIndex = 0;
    }
  }

  Object.assign(HK, { h, s, $, $$, getJSON, load, computeLayout, netKey, renderMap, typeTag, typeMark, fmtDate, refreshHSExtOptions });
})(window);
