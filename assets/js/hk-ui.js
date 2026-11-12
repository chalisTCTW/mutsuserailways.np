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

  /** 在 container 畫路線圖。回傳控制器 { svg, highlight(set), setTrains(list), onStation(fn) }。 */
  function renderMap(container, H, L, opts) {
    opts = opts || {};
    const W = L.width, HT = L.height, FS = opts.fontSize || 13;
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, class: 'rmap', role: 'img', 'aria-label': '光瀨都市鉄道 路線圖', preserveAspectRatio: 'xMidYMid meet' });
    const gEdge = s('g', { class: 'edges' }), gHs = s('g', { class: 'hs-edges' }), gSt = s('g', { class: 'stations' }), gLab = s('g', { class: 'labels' }), gTr = s('g', { class: 'trains' });
    svg.append(gEdge, gHs, gSt, gLab, gTr);

    // 1.1.0：高速鐵路不計入拓樸（H.edges 已經排除），只在轉乘站之間疊一層虛線（含站外轉乘，例如幸村↔新光瀨）
    (H.hsEdges || []).forEach(e => {
      const a = L.pos.get(e.a), b = L.pos.get(e.b); if (!a || !b) return;
      gHs.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'hs-line' + (e.walk ? ' hs-walk' : '') }));
    });

    // 連結：每站經過的路線數（轉乘站畫大圓）
    const linesAt = new Map(); H.stations.forEach(st => linesAt.set(st.id, new Set()));
    H.svcs.forEach(sv => sv.stops.forEach(x => { if (x.pax !== false && linesAt.has(x.station)) linesAt.get(x.station).add(sv.line); }));

    const edgeEls = [];
    L.paths.forEach(p => {
      const d = 'M' + p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L');
      const casing = s('path', { d, class: 'e-casing' }), line = s('path', { d, class: 'e-line' });
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
    const order = [...H.stations].sort((a, b) => (H.adj.get(b.id).length - H.adj.get(a.id).length));
    const labelPos = new Map();
    for (const st of order) {
      const q = L.pos.get(st.id), cstr = H.codeText ? H.codeText(st.id) : '', w = textW(st.zh, FS) + (cstr ? textW(cstr, FS - 3) + 5 : 0), hgt = FS + 2, r = linesAt.get(st.id).size > 1 ? 11 : 8, gap = r + 3;
      const cands = [
        { dx: gap, dy: hgt / 2 - 3, a: 'start', box: { x: q.x + gap, y: q.y - hgt / 2 - 1, w, h: hgt } },
        { dx: -gap, dy: hgt / 2 - 3, a: 'end', box: { x: q.x - gap - w, y: q.y - hgt / 2 - 1, w, h: hgt } },
        { dx: 0, dy: -gap - 3, a: 'middle', box: { x: q.x - w / 2, y: q.y - gap - hgt, w, h: hgt } },
        { dx: 0, dy: gap + hgt - 2, a: 'middle', box: { x: q.x - w / 2, y: q.y + gap, w, h: hgt } },
        { dx: gap - 2, dy: -gap + 2, a: 'start', box: { x: q.x + gap - 2, y: q.y - gap - hgt + 4, w, h: hgt } },
        { dx: -gap + 2, dy: -gap + 2, a: 'end', box: { x: q.x - gap + 2 - w, y: q.y - gap - hgt + 4, w, h: hgt } },
        { dx: gap - 2, dy: gap + hgt - 6, a: 'start', box: { x: q.x + gap - 2, y: q.y + gap - 4, w, h: hgt } },
        { dx: -gap + 2, dy: gap + hgt - 6, a: 'end', box: { x: q.x - gap + 2 - w, y: q.y + gap - 4, w, h: hgt } },
      ];
      let best = null;
      cands.forEach((c, k) => {
        let pen = k * 0.6;
        boxes.forEach(b => { if (overlap(c.box, b)) pen += 100; });
        pts.forEach(pt => { if (pt[0] > c.box.x - 7 && pt[0] < c.box.x + c.box.w + 7 && pt[1] > c.box.y - 7 && pt[1] < c.box.y + c.box.h + 7) pen += 60; });
        segs.forEach(sg => { if (rectHitSeg({ x: c.box.x - 2, y: c.box.y - 1, w: c.box.w + 4, h: c.box.h + 2 }, sg[0], sg[1])) pen += 25; });
        if (c.box.x < 2 || c.box.x + c.box.w > W - 2 || c.box.y < 2 || c.box.y + c.box.h > HT - 2) pen += 80;
        if (!best || pen < best.pen) best = { ...c, pen };
      });
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

  /** 1.1.1：起訖站選單裡的「假想延伸站」選項——只在勾選「可以利用高速鉄道」時才出現在選單最後的 optgroup，
   *  取消勾選時移除；如果移除時原本選到的剛好是假想站，就把選值退回第一個（真實）選項，避免選單留著一個不存在的值。
   *  乘車・轉乘查詢（site.js）與訂票（booking.js）共用這個函式。 */
  function refreshHSExtOptions(H, sel, show) {
    let grp = sel.querySelector('optgroup[data-hsext]');
    if (show && H.hsExtStops && H.hsExtStops.length) {
      if (!grp) { grp = h('optgroup', { label: '万瀨高速鉄道線　假想延伸（地圖外）', 'data-hsext': '1' }); sel.append(grp); }
      grp.replaceChildren(...H.hsExtStops.map(st => h('option', { value: st.id }, st.zh)));
    } else if (grp) {
      const wasVirtual = String(sel.value).indexOf('hsext:') === 0;
      grp.remove();
      if (wasVirtual) sel.selectedIndex = 0;
    }
  }

  Object.assign(HK, { h, s, $, $$, getJSON, load, computeLayout, netKey, renderMap, typeTag, typeMark, fmtDate, refreshHSExtOptions });
})(window);
