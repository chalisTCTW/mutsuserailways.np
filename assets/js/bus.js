/* 2.10.0：光瀨市交通局 公車（設定上的路線）。
 *
 * 資料：data/bus.json（tools 由人家用腳本產生：前輩指定的重點站、轉乘站與站數，其餘站牌用假想的路名・町名補滿）。
 *   stops：站牌名 → { x, z（遊戲座標，地圖用）, en（英文名）, st（可轉乘的鉄道／單軌車站，沒有＝不轉乘） }
 *   routes：{ no, hub, loop, express, name, stops[], t[]（各站間分鐘） }
 *   hours：營運 first～last（分，從 0:00 起算；24:30＝1470），bands＝[開始, 結束, 班距分]
 *   fare：起跳 base 円，每 per 站加 step 円
 * 班次不用一班一班寫：每條路線兩個方向（環線＝外回り／内回り）都從起點照 bands 的班距發車。
 * 用在兩個地方：monorail.html 的「公車」分頁（HK.Bus.tab）、timetable.html 車站時刻表下方（HK.Bus.stationPanel）。
 */
(function (root) {
  'use strict';
  const HK = root.HK || (root.HK = {});
  const h = (...a) => HK.h(...a);
  const pad = n => String(n).padStart(2, '0');
  const hm = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); };
  const yen = n => '¥' + Number(n).toLocaleString('en-US');
  const T = x => (root.HK_I18N && root.HK_I18N.t) ? root.HK_I18N.t(x) : x;
  const norm = z => String(z || '').replace(/戶/g, '戸').replace(/瀬/g, '瀨').replace(/[廳厅]/g, '厅').replace(/\s+/g, '');
  const COLOR = { 0: '#0a2b59', 1: '#1f6fd0', 2: '#2e8b57', 3: '#c26a06', 4: '#b03060', 5: '#7b4bb7', 6: '#0e7c86', 7: '#8a6d1d', 8: '#c2410c', 11: '#475569' };
  const HUBS = ['みつせ', '戸宮', '花倉街道', '東平倉', '紫市', '名島港', '勝守', '十万浦市', '上羽神別'];

  let D = null, PAT = null, loading = null;

  function load() {
    if (D) return Promise.resolve(D);
    if (loading) return loading;
    loading = fetch('data/bus.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
      D = d; build();
      try { if (root.HK_I18N && root.HK_I18N.names) root.HK_I18N.names(Object.keys(D.stops).filter(k => D.stops[k].en).map(k => [k, D.stops[k].en])); } catch (e) { /* 翻譯失敗不影響 */ }
      return D;
    });
    return loading;
  }

  const groupOf = no => { const n = +no; return n >= 1000 ? Math.floor(n / 100) : Math.floor(n / 100); };
  /** 同一個地區的路線同色系，但用深淺分開（並排時才分得出是哪一條）：x01 深、x02 原色、x03 淺。 */
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
  const colorOf = no => { const base = COLOR[groupOf(no)] || '#1f6fd0'; const k = (+no) % 100; return k === 1 ? shade(base, -0.32) : k === 3 ? shade(base, 0.3) : base; };
  const routeLabel = r => r.no + '路';

  /** 每條路線的兩個方向＝pattern：stops、各站的累計分鐘 off、起點發車時刻 deps。 */
  function build() {
    const bands = D.hours.bands, first = D.hours.first, last = D.hours.last;
    // 每個時段從時段開頭照班距排（06:00、09:00、15:00、19:00 都會有一班），最後一班不超過 24:30
    const deps = [];
    bands.forEach(([a, b, hw]) => { for (let t = Math.max(a, first); t < b && t <= last; t += hw) deps.push(t); });
    deps.sort((x, y) => x - y);
    PAT = [];
    D.routes.forEach(r => {
      // 2.10.1：次要路線（r.hw）整天固定班距（約 1 小時 1 班）
      const dp = r.hw ? (() => { const a = []; for (let t = first; t <= last; t += r.hw) a.push(t); return a; })() : deps;
      const mk = (stops, t, dir) => {
        const off = [0];
        for (let i = 0; i < t.length; i++) off.push(off[i] + t[i]);
        PAT.push({ r, dir, stops, off, deps: dp, dest: stops[stops.length - 1] });
      };
      if (r.loop) {
        const ring = r.stops.concat([r.stops[0]]);
        mk(ring, r.t, '外回り');
        const rev = r.stops.slice().reverse(); rev.unshift(r.stops[0]); rev.pop(); const ring2 = rev.concat([r.stops[0]]);
        mk(ring2, r.t.slice().reverse(), '内回り');
      } else {
        mk(r.stops, r.t, 'f');
        mk(r.stops.slice().reverse(), r.t.slice().reverse(), 'b');
      }
    });
  }
  const dirLabel = p => p.r.loop ? p.dir : (p.dest + ' 方面');
  const nm = s => h('span', { class: 'bus-nm' }, s);   // 站牌名獨立成一個文字節點，讓英文版換成英文名
  const rname = r => r.name ? [nm(r.name)] : (r.loop ? [nm(r.stops[0]), h('span', null, '循環')] : [nm(r.stops[0]), ' － ', nm(r.stops[r.stops.length - 1])]);

  function fareOf(n) {
    const f = D.fare; if (n <= 0) return 0;
    return f.base + f.step * Math.floor((n - 1) / f.per);
  }

  /** 某站牌一天的發車：[{ t, p, i }]，依時刻排序。終點（不再前進）不算。 */
  function departuresAt(stop) {
    const out = [];
    PAT.forEach(p => p.stops.forEach((s, i) => {
      if (s !== stop || i === p.stops.length - 1) return;
      p.deps.forEach(d => out.push({ t: d + p.off[i], p, i }));
    }));
    return out.sort((a, b) => a.t - b.t);
  }

  /** 查詢（RAPTOR 的簡化版）：一輪＝多搭一班車，最多轉乘 3 次。回傳 t0 之後最早抵達的走法；同時抵達取轉乘少的。 */
  const XFER = 2;   // 轉乘至少 2 分
  const WALK = 3;   // 同一個車站的不同站牌（例：戸宮車站西口 ↔ 戸宮）步行 3 分
  let SIB = null;
  function walkFrom(m, best) {
    if (!SIB) { SIB = new Map(); Object.keys(D.stops).forEach(s => { const st = D.stops[s].st; if (!st) return; const k = norm(st); if (!SIB.has(k)) SIB.set(k, []); SIB.get(k).push(s); }); }
    [...m.entries()].forEach(([s, e]) => {
      if (e.walk) return;
      const st = D.stops[s] && D.stops[s].st; if (!st) return;
      SIB.get(norm(st)).forEach(o => {
        if (o === s) return;
        const t = e.t + WALK;
        if (t < (best.has(o) ? best.get(o) : Infinity)) { best.set(o, t); m.set(o, { t, walk: s }); }
      });
    });
  }
  /** 從 from 在 t0 出發，到所有站牌的最早抵達（每一輪＝多搭一班）。 */
  function profile(from, t0) {
    const K = 5, best = new Map(), rounds = [new Map([[from, { t: t0 }]])];
    best.set(from, t0);
    walkFrom(rounds[0], best);
    for (let k = 1; k <= K; k++) {
      const prev = rounds[k - 1], cur = new Map();
      PAT.forEach(p => {
        let d = null, bi = -1;
        for (let i = 0; i < p.stops.length; i++) {
          const st = p.stops[i];
          if (d != null && i > bi) {
            const ta = d + p.off[i];
            if (ta < (best.has(st) ? best.get(st) : Infinity)) { best.set(st, ta); cur.set(st, { t: ta, p, bi, i, d }); }
          }
          const pv = prev.get(st);
          if (pv && i < p.stops.length - 1) {
            const need = pv.t + (k > 1 ? XFER : 0);
            const dd = p.deps.find(x => x + p.off[i] >= need);
            if (dd != null && (d == null || dd + p.off[i] < d + p.off[i])) { d = dd; bi = i; }
          }
        }
      });
      walkFrom(cur, best);
      rounds.push(cur);
      if (!cur.size) break;
    }
    return { rounds, best, from };
  }
  function trace(P, to) {
    const rounds = P.rounds, from = P.from;
    let kb = -1;
    for (let k = 1; k < rounds.length; k++) { const e = rounds[k].get(to); if (e && (kb < 0 || e.t < rounds[kb].get(to).t)) kb = k; }
    if (kb < 0) return null;
    const legs = []; let st = to;
    for (let k = kb; k >= 0; k--) {
      let e = rounds[k].get(st); if (!e) return null;
      if (e.walk) { legs.unshift({ walk: true, from: e.walk, to: st, dep: e.t - WALK, arr: e.t, fare: 0 }); st = e.walk; e = rounds[k].get(st); }
      if (k === 0) break;
      if (!e || !e.p) return null;
      const dep = e.d + e.p.off[e.bi];
      legs.unshift({ p: e.p, i: e.bi, j: e.i, dep, arr: e.t, n: e.i - e.bi, fare: fareOf(e.i - e.bi) });
      st = e.p.stops[e.bi];
    }
    if (st !== from) return null;
    const rides = legs.filter(l => !l.walk);
    if (legs[0].walk) { legs[0].arr = rides[0].dep; legs[0].dep = rides[0].dep - WALK; }
    return { legs, rides: rides.length, dep: legs[0].dep, arr: legs[legs.length - 1].arr, fare: legs.reduce((x, l) => x + l.fare, 0) };
  }
  const searchOnce = (from, to, t0) => trace(profile(from, t0), to);
  function search(from, to, t0, n) {
    const out = [];
    let t = t0;
    for (let k = 0; k < (n || 5); k++) {
      const r = searchOnce(from, to, t); if (!r) break;
      if (!out.some(o => o.arr === r.arr && o.dep === r.dep)) out.push(r);
      t = r.dep + 1;
    }
    return out;
  }

  /* ───────── 共用的小元件 ───────── */
  const badge = no => h('span', { class: 'bus-no', style: 'background:' + colorOf(no) }, routeLabel({ no }));
  const xferChip = s => { const st = D.stops[s] && D.stops[s].st; return st ? h('span', { class: 'bus-xf' }, h('span', null, '轉乘'), ' ', h('span', null, st)) : null; };
  function stopSelect(value, onChange, id) {
    const sel = h('select', { id, class: 'bus-sel' });
    const groups = new Map();
    D.routes.forEach(r => { const g = r.hub; if (!groups.has(g)) groups.set(g, new Set()); r.stops.forEach(s => groups.get(g).add(s)); });
    const placed = new Set();
    // 轉乘站（有鉄道・單軌）放最前面
    const xf = Object.keys(D.stops).filter(s => D.stops[s].st).sort((a, b) => a.localeCompare(b, 'ja'));
    const og0 = h('optgroup', { label: '轉乘站' }); xf.forEach(s => { og0.append(h('option', { value: s }, s)); placed.add(s); }); sel.append(og0);
    HUBS.forEach(g => {
      if (!groups.has(g)) return;
      const og = h('optgroup', { label: g });
      [...groups.get(g)].filter(s => !placed.has(s)).sort((a, b) => a.localeCompare(b, 'ja')).forEach(s => { og.append(h('option', { value: s }, s)); placed.add(s); });
      if (og.children.length) sel.append(og);
    });
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  const nowMin = () => { const d = new Date(); let m = d.getHours() * 60 + d.getMinutes(); if (m < D.hours.first - 60) m += 1440; return m; };

  /* ───────── 路線一覽 ───────── */
  function routeStrip(r) {
    const box = h('div', { class: 'bus-strip' });
    const ul = h('ol', { class: 'bus-stops' + (r.loop ? ' loop' : '') });
    const stops = r.stops;
    stops.forEach((s, i) => ul.append(h('li', { class: D.stops[s] && D.stops[s].st ? 'xf' : '' },
      h('span', { class: 'dot', style: 'border-color:' + colorOf(r.no) }),
      h('span', { class: 'nm' }, s), xferChip(s),
      i < r.t.length ? h('span', { class: 'mins' }, r.t[i] + '′') : null)));
    if (r.loop) ul.append(h('li', { class: 'xf back' }, h('span', { class: 'dot', style: 'border-color:' + colorOf(r.no) }), h('span', { class: 'nm' }, stops[0]), h('span', { class: 'bus-xf' }, '回到起點')));
    const total = r.t.reduce((a, b) => a + b, 0);
    box.append(h('div', { class: 'bus-strip-head' }, badge(r.no),
      h('b', null, ...rname(r)),
      r.express ? h('span', { class: 'bus-xf' }, '快速') : null,
      r.minor ? h('span', { class: 'bus-xf' }, '每小時 1 班') : null,
      h('span', { class: 'meta' }, '全 ' + stops.length + ' 站・約 ' + total + ' 分・' + yen(fareOf(stops.length - 1)) + '（全程）')),
      h('div', { class: 'bus-strip-body', style: '--c:' + colorOf(r.no) }, ul));
    return box;
  }

  function viewRoutes(el) {
    let hub = 'みつせ', cur = null;
    const chips = h('div', { class: 'bus-hubs', role: 'group', 'aria-label': '地區' });
    const list = h('div', { class: 'bus-rlist' }), detail = h('div');
    function draw() {
      chips.replaceChildren(...HUBS.filter(g => D.routes.some(r => r.hub === g)).map(g => h('button', { type: 'button', 'aria-pressed': String(g === hub), onclick: () => { hub = g; cur = null; draw(); } }, g)));
      const rs = D.routes.filter(r => r.hub === hub);
      if (!cur || cur.hub !== hub) cur = rs[0];
      list.replaceChildren(...rs.map(r => h('button', { type: 'button', class: 'bus-rbtn', 'aria-pressed': String(r === cur), onclick: () => { cur = r; draw(); } },
        badge(r.no), h('span', null, ...rname(r)), r.minor ? h('span', { class: 'bus-xf' }, '每小時 1 班') : null)));
      detail.replaceChildren(routeStrip(cur));
    }
    draw();
    el.append(h('h3', { class: 'mb-h3' }, '路線一覽'), chips, list, detail);
  }

  /* ───────── 站牌時刻表 ───────── */
  function stopTimetable(stop, opts) {
    opts = opts || {};
    const out = h('div', { class: 'bus-tt' });
    const evs = departuresAt(stop);
    if (!evs.length) { out.append(h('p', null, '這個站牌沒有發車的班次（終點站）。')); return out; }
    const groups = new Map();
    evs.forEach(e => { const k = e.p.r.no + '|' + e.p.dir; if (!groups.has(k)) groups.set(k, { p: e.p, evs: [] }); groups.get(k).evs.push(e); });
    const now = nowMin();
    [...groups.values()].sort((a, b) => +a.p.r.no - +b.p.r.no).forEach(g => {
      const card = h('div', { class: 'bus-ttcard' });
      const next = g.evs.filter(e => e.t >= now).slice(0, 3);
      card.append(h('div', { class: 'bus-tthead' }, badge(g.p.r.no), h('b', null, g.p.r.loop ? g.p.dir : [nm(g.p.dest), ' ', h('span', null, '方面')]),
        h('span', { class: 'next' }, next.length ? [h('span', null, '下一班'), ' ' + next.map(e => hm(e.t)).join(' · ')] : '今天的班次已結束')));
      if (!opts.compact) {
        const byH = new Map();
        g.evs.forEach(e => { const hh = Math.floor(e.t / 60); if (!byH.has(hh)) byH.set(hh, []); byH.get(hh).push(e); });
        const tb = h('div', { class: 'bus-hours' });
        [...byH.entries()].forEach(([hh, l]) => tb.append(h('div', { class: 'bus-hour' + (hh === Math.floor(now / 60) ? ' cur' : '') }, h('b', null, pad(hh % 24)), h('div', null, l.map(e => h('span', { class: 'bus-min' }, pad(Math.round(e.t) % 60)))))));
        card.append(tb);
      }
      out.append(card);
    });
    return out;
  }

  function viewStops(el, initial) {
    let stop = initial && D.stops[initial] ? initial : 'みつせ車站西口';
    const body = h('div');
    const sel = stopSelect(stop, v => { stop = v; draw(); }, 'busStop');
    function draw() {
      body.replaceChildren(h('h4', { class: 'bus-h4' }, nm(stop), xferChip(stop)), stopTimetable(stop));
    }
    draw();
    el.append(h('h3', { class: 'mb-h3' }, '站牌時刻表'), h('div', { class: 'mb-f' }, h('div', null, h('label', { for: 'busStop' }, '站牌'), sel)), body);
  }

  /* ───────── 班次查詢 ───────── */
  function viewSearch(el) {
    let from = 'みつせ車站西口', to = '白藏山';
    const tIn = h('input', { type: 'time', value: hm(nowMin()), id: 'busTime' });
    const a = stopSelect(from, v => { from = v; }, 'busFrom'), b = stopSelect(to, v => { to = v; }, 'busTo');
    const out = h('div', { class: 'bus-res' });
    const go = () => {
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number);
      let t0 = hh * 60 + mm; if (t0 < D.hours.first - 60) t0 += 1440;
      out.replaceChildren();
      if (from === to) { out.append(h('p', null, '出發與抵達是同一個站牌。')); return; }
      const rs = search(from, to, t0, 5);
      if (!rs.length) { out.append(h('p', null, '找不到轉乘 4 次以內可以到達的公車。請改用光瀨都市鉄道或單軌，或換一個站牌查詢。')); return; }
      rs.forEach(r => out.append(h('div', { class: 'bus-opt' },
        h('div', { class: 'bus-opt-head' }, h('b', null, hm(r.dep) + ' → ' + hm(r.arr)), h('span', null, '約 ' + Math.round(r.arr - r.dep) + ' 分'),
          h('span', null, r.rides > 1 ? '轉乘 ' + (r.rides - 1) + ' 次' : '直達'), h('span', { class: 'fare' }, yen(r.fare))),
        h('ol', { class: 'bus-legs' }, r.legs.map(l => l.walk ? h('li', { class: 'walk' }, h('span', { class: 'bus-walk' }, '步行'), nm(l.from), h('span', null, ' → '), nm(l.to), h('span', null, '約 ' + WALK + ' 分')) : h('li', null, badge(l.p.r.no),
          h('span', null, hm(l.dep) + ' '), nm(l.p.stops[l.i]), h('span', null, ' → ' + hm(l.arr) + ' '), nm(l.p.stops[l.j]),
          h('span', { class: 'dir' }, l.p.r.loop ? h('span', null, l.p.dir) : [nm(l.p.dest), ' ', h('span', null, '方面')], '・', h('span', null, l.n + ' 站・' + yen(l.fare)))))))));
    };
    el.append(h('h3', { class: 'mb-h3' }, '班次查詢'),
      h('form', { class: 'mb-f', onsubmit: e => { e.preventDefault(); go(); } },
        h('div', null, h('label', { for: 'busFrom' }, '出發站牌'), a),
        h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
        h('div', null, h('label', { for: 'busTo' }, '抵達站牌'), b),
        h('div', null, h('label', { for: 'busTime' }, '出發時間'), tIn),
        h('button', { type: 'submit', class: 'bus-go' }, '查詢')),
      h('p', { class: 'mb-note' }, '票價：起跳 ' + yen(D.fare.base) + '，每 ' + D.fare.per + ' 站加 ' + yen(D.fare.step) + '（轉乘時各段分別計算）。'),
      out);
    go();
  }

  /* ───────── 路線圖（方格示意：只用水平・垂直線，轉角在站與站之間，共線的路線並排） ───────── */
  let ANC = null;
  function corridorsOf(r) {
    if (!ANC) { ANC = new Set(); Object.values(D.corr).forEach(c => { ANC.add(c.a); ANC.add(c.b); }); }
    const ring = r.stops.concat(r.loop ? [r.stops[0]] : []);
    const idx = []; ring.forEach((x, i) => { if (ANC.has(x)) idx.push(i); });
    const out = [];
    for (let k = 1; k < idx.length; k++) {
      const a = ring[idx[k - 1]], b = ring[idx[k]];
      const key = [a, b].sort().join('|');
      if (D.corr[key]) out.push({ key, rev: D.corr[key].a !== a });
    }
    return out;
  }
  const norm2 = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  function offsetPts(pts, o) {
    if (!o) return pts.map(p => p.slice());
    const n = []; for (let i = 0; i < pts.length - 1; i++) n.push(norm2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
    return pts.map((p, i) => {
      const a = n[Math.max(0, i - 1)], b = n[Math.min(n.length - 1, i)];
      const v = i === 0 ? b : i === pts.length - 1 ? a : [a[0] + b[0], a[1] + b[1]];
      return [p[0] + v[0] * o, p[1] + v[1] * o];
    });
  }
  /** 點 g 在折線 pts 上那一段的方向（'h'／'v'）。 */
  function dirAt(pts, g) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (y0 === y1 && Math.abs(g[1] - y0) < 1e-6 && g[0] >= Math.min(x0, x1) - 1e-6 && g[0] <= Math.max(x0, x1) + 1e-6) return 'h';
      if (x0 === x1 && Math.abs(g[0] - x0) < 1e-6 && g[1] >= Math.min(y0, y1) - 1e-6 && g[1] <= Math.max(y0, y1) + 1e-6) return 'v';
    }
    return pts[0][1] === pts[1][1] ? 'h' : 'v';
  }

  /** 拖曳＋縮放：滑鼠拖曳／滾輪、手指拖曳／兩指縮放、按鈕。改的是 SVG 的 viewBox，線條和字都保持清晰。
   *  full：整張圖的範圍（SVG 單位）；focus：一開始對準的點（手機上整張圖太小時才用）；keep：之前的畫面。 */
  function panZoom(wrap, svg, full, focus, keep, save) {
    let s = 1, cx = 0, cy = 0;            // s：每個 SVG 單位幾個像素；(cx, cy)：畫面中心
    const size = () => [wrap.clientWidth || 360, wrap.clientHeight || 400];
    const fit = () => { const [w, hh] = size(); return Math.min(w / full.w, hh / full.h); };
    const clampS = v => Math.max(fit() * 0.8, Math.min(5, v));
    const apply = () => {
      const [w, hh] = size();
      cx = Math.max(full.x, Math.min(full.x + full.w, cx)); cy = Math.max(full.y, Math.min(full.y + full.h, cy));
      svg.setAttribute('viewBox', `${(cx - w / 2 / s).toFixed(1)} ${(cy - hh / 2 / s).toFixed(1)} ${(w / s).toFixed(1)} ${(hh / s).toFixed(1)}`);
      save({ s, cx, cy });
    };
    const reset = () => {
      const f = fit();
      if (focus && f < 0.7) { s = 0.8; cx = focus[0]; cy = focus[1]; } else { s = f; cx = full.x + full.w / 2; cy = full.y + full.h / 2; }
      apply();
    };
    const toSvg = (px, py) => { const r = wrap.getBoundingClientRect(), [w, hh] = size(); return [cx + (px - r.left - w / 2) / s, cy + (py - r.top - hh / 2) / s]; };
    const zoomAt = (k, px, py) => {
      const before = px == null ? [cx, cy] : toSvg(px, py);
      s = clampS(s * k);
      if (px != null) { const after = toSvg(px, py); cx += before[0] - after[0]; cy += before[1] - after[1]; }
      apply();
    };
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const P = new Map(); let last = null;
    wrap.addEventListener('pointerdown', e => { if (e.target.closest('.bus-zoom')) return; wrap.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]); last = null; wrap.classList.add('drag'); });
    wrap.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId)) return;
      const prev = P.get(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]);
      if (P.size === 1) { cx -= (e.clientX - prev[0]) / s; cy -= (e.clientY - prev[1]) / s; apply(); }
      else if (P.size === 2) {
        const [a, b] = [...P.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (last) { zoomAt(d / last.d, m[0], m[1]); cx -= (m[0] - last.m[0]) / s; cy -= (m[1] - last.m[1]) / s; apply(); }
        last = { d, m };
      }
    });
    const up = e => { P.delete(e.pointerId); last = null; if (!P.size) wrap.classList.remove('drag'); };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    wrap.addEventListener('dblclick', e => { if (!e.target.closest('.bus-zoom')) zoomAt(1.6, e.clientX, e.clientY); });
    if (keep) { s = keep.s; cx = keep.cx; cy = keep.cy; requestAnimationFrame(apply); } else requestAnimationFrame(reset);
    return { zoom: k => zoomAt(k), reset };
  }

  function viewMap(el) {
    let hub = 'みつせ', focus = null, view = null;   // view：目前的縮放／位置（換地區才重設，點路線號時保留）
    const box = h('div', { class: 'bus-map' });
    const chips = h('div', { class: 'bus-hubs', role: 'group', 'aria-label': '地區' });
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
    const U = 26, W = 0.2;   // 一格 26px；並排的線距 0.2 格
    function draw() {
      chips.replaceChildren(...['全部'].concat(HUBS).map(g => h('button', { type: 'button', 'aria-pressed': String(g === hub), onclick: () => { hub = g; focus = null; view = null; draw(); } }, g)));
      const all = hub === '全部';
      const rs = D.routes.filter(r => all || r.hub === hub).sort((a, b) => +a.no - +b.no);
      // 每段走廊有哪些路線（依路線號排）→ 各自的偏移
      // 2.10.1：共線的判斷改成「半格一小段」為單位——不同走廊重疊在同一條路上也會並排（例：從核心站放射出去的路線共用出站的那一段）
      const rawOf = r => { const pts = []; corridorsOf(r).forEach(c => { let q = D.corr[c.key].pts.map(p => p.slice()); if (c.rev) q.reverse(); q.forEach(p => { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-6 || Math.abs(l[1] - p[1]) > 1e-6) pts.push(p); }); }); return pts; };
      const stepsOf = pts => {
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], hz = Math.abs(a[1] - b[1]) < 1e-6, len = hz ? b[0] - a[0] : b[1] - a[1];
          const n = Math.max(1, Math.round(Math.abs(len) / 0.5)), sg = Math.sign(len) || 1, st = Math.abs(len) / n * sg;
          for (let k = 0; k < n; k++) {
            const p = hz ? [a[0] + st * k, a[1]] : [a[0], a[1] + st * k], q = hz ? [p[0] + st, p[1]] : [p[0], p[1] + st];
            const lo = hz ? Math.min(p[0], q[0]) : Math.min(p[1], q[1]);
            out.push({ key: (hz ? 'h' : 'v') + (hz ? lo.toFixed(2) + ',' + p[1].toFixed(2) : p[0].toFixed(2) + ',' + lo.toFixed(2)), hz, p, q, sg });
          }
        }
        return out;
      };
      const RS = new Map(), bund = new Map();
      rs.forEach(r => { const S = stepsOf(rawOf(r)); RS.set(r, S); S.forEach(t => { if (!bund.has(t.key)) bund.set(t.key, []); const l = bund.get(t.key); if (!l.includes(r)) l.push(r); }); });
      const offV = (t, r) => { const l = bund.get(t.key), o = (l.indexOf(r) - (l.length - 1) / 2) * W; return t.hz ? [0, o] : [-o, 0]; };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rs.forEach(r => r.stops.forEach(s => { const g = D.stops[s].g; x0 = Math.min(x0, g[0]); x1 = Math.max(x1, g[0]); y0 = Math.min(y0, g[1]); y1 = Math.max(y1, g[1]); }));
      const m = all ? 2 : 3.2;
      x0 -= m; y0 -= m * 0.6; x1 += m * 1.6; y1 += m;
      const svg = sv('svg', { viewBox: `${x0 * U} ${y0 * U} ${(x1 - x0) * U} ${(y1 - y0) * U}`, class: 'bus-svg' + (all ? ' all' : ''), role: 'img', 'aria-label': '公車路線示意圖' });
      const gGrid = sv('g', { class: 'grid' }), gR = sv('g'), gS = sv('g'), gL = sv('g');
      for (let x = Math.ceil(x0); x <= x1; x++) gGrid.append(sv('line', { x1: x * U, y1: y0 * U, x2: x * U, y2: y1 * U }));
      for (let y = Math.ceil(y0); y <= y1; y++) gGrid.append(sv('line', { x1: x0 * U, y1: y * U, x2: x1 * U, y2: y * U }));
      svg.append(gGrid, gR, gS, gL);
      const add = (p, v, d, k) => [p[0] + v[0] + (d ? d[0] * k : 0), p[1] + v[1] + (d ? d[1] * k : 0)];
      rs.forEach(r => {
        const S = RS.get(r); if (!S.length) return;
        const V = S.map(t => offV(t, r)), dir = t => t.hz ? [t.sg, 0] : [0, t.sg];
        const pts = [add(S[0].p, V[0])];
        for (let i = 1; i < S.length; i++) {
          const a = S[i - 1], b = S[i], q = b.p;
          if (a.hz === b.hz) {
            if (a.sg !== b.sg) { pts.push(add(q, V[i - 1]), add(q, V[i])); continue; }        // 折返
            if (V[i - 1][0] !== V[i][0] || V[i - 1][1] !== V[i][1]) { const d = dir(a); pts.push(add(q, V[i - 1], d, -0.18), add(q, V[i], d, 0.18)); }   // 並排的條數變了：斜斜換位
          } else pts.push([q[0] + V[i - 1][0] + V[i][0], q[1] + V[i - 1][1] + V[i][1]]);
        }
        const L = S[S.length - 1]; pts.push(add(L.q, V[V.length - 1]));
        const dim = focus && focus !== r;
        gR.append(sv('polyline', { points: pts.map(p => (p[0] * U).toFixed(1) + ',' + (p[1] * U).toFixed(1)).join(' '), fill: 'none', stroke: colorOf(r.no),
          'stroke-width': (all ? 4 : 4.4), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: dim ? '.15' : '1' }));
      });
      // 站牌：那個位置並排幾條就畫多長的膠囊（橫跨並排的線）
      const info = new Map();   // 站名 → { n, dir }
      rs.forEach(r => {
        const S = RS.get(r);
        r.stops.forEach(s => {
          const g = D.stops[s].g;
          S.forEach(t => {
            const on = t.hz ? Math.abs(g[1] - t.p[1]) < 1e-6 && g[0] >= Math.min(t.p[0], t.q[0]) - 1e-6 && g[0] <= Math.max(t.p[0], t.q[0]) + 1e-6
                            : Math.abs(g[0] - t.p[0]) < 1e-6 && g[1] >= Math.min(t.p[1], t.q[1]) - 1e-6 && g[1] <= Math.max(t.p[1], t.q[1]) + 1e-6;
            if (!on) return;
            const n = bund.get(t.key).length, cur = info.get(s);
            if (!cur || n > cur.n) info.set(s, { n, dir: t.hz ? 'h' : 'v' });
          });
          if (!info.has(s)) info.set(s, { n: 1, dir: 'h' });
        });
      });
      // 站名：轉乘站 → 重點站 → 其他站牌的順序放，和已經放好的字重疊就不放（避免糊成一團）
      const boxes = [];
      const hit = bb => boxes.some(o => bb[0] < o[2] && bb[2] > o[0] && bb[1] < o[3] && bb[3] > o[1]);
      const order = [...info.keys()].sort((x, y) => (!!D.stops[y].st - !!D.stops[x].st) || (ANC.has(y) - ANC.has(x)));
      order.forEach(s => {
        const v = info.get(s), p = D.stops[s], g = p.g, xf = !!p.st, len = (v.n - 1) * W * U;
        const r0 = xf ? 6.5 : 3.8;
        const rx = g[0] * U, ry = g[1] * U;
        const vert = v.dir === 'h';   // 線水平 → 膠囊直立
        const mk = [rx - r0 - (vert ? 0 : len / 2), ry - r0 - (vert ? len / 2 : 0), r0 * 2 + (vert ? 0 : len), r0 * 2 + (vert ? len : 0)];
        gS.append(sv('rect', { x: mk[0], y: mk[1], width: mk[2], height: mk[3], rx: r0, fill: '#fff', stroke: xf ? '#0a2b59' : '#5f7085', 'stroke-width': xf ? 2.6 : 1.5 }));
        const key = ANC.has(s);
        if (all && !xf) return;
        const fs = all ? 13 : (key ? 12.5 : 10.5), tw = [...s].length * fs * 0.98;
        const t = sv('text', { 'font-size': fs, class: (xf ? 'xf' : '') + (key ? ' key' : '') });
        // 擺放候選：先照線的方向放，撞到其他站名就換位置（右→左→上→下／右上斜→右下斜…）
        const c = Math.cos(0.698), sn = Math.sin(0.698), R = mk[0] + mk[2], B = mk[1] + mk[3];
        const cand = v.dir === 'h' ? [
          { tf: [rx + 2, mk[1] - 4, -40], bb: [rx + 2, mk[1] - 4 - tw * sn - fs * 0.6, rx + 2 + tw * c + fs * 0.5, mk[1] - 2] },
          { tf: [rx + 2, B + fs * 0.8, 40], bb: [rx + 2, B, rx + 2 + tw * c + fs * 0.5, B + fs * 0.8 + tw * sn + fs * 0.4] },
          { x: R + 5, y: ry + 4, a: 'start', bb: [R + 5, ry + 4 - fs * 0.85, R + 5 + tw, ry + 4 + fs * 0.2] },
          { x: mk[0] - 5, y: ry + 4, a: 'end', bb: [mk[0] - 5 - tw, ry + 4 - fs * 0.85, mk[0] - 5, ry + 4 + fs * 0.2] }
        ] : [
          { x: R + 5, y: ry + 4, a: 'start', bb: [R + 5, ry + 4 - fs * 0.85, R + 5 + tw, ry + 4 + fs * 0.2] },
          { x: mk[0] - 5, y: ry + 4, a: 'end', bb: [mk[0] - 5 - tw, ry + 4 - fs * 0.85, mk[0] - 5, ry + 4 + fs * 0.2] },
          { x: rx, y: mk[1] - 5, a: 'middle', bb: [rx - tw / 2, mk[1] - 5 - fs * 0.85, rx + tw / 2, mk[1] - 3] },
          { x: rx, y: B + fs, a: 'middle', bb: [rx - tw / 2, B + 2, rx + tw / 2, B + fs * 1.2] }
        ];
        const pick = cand.find(o => !hit(o.bb)) || (xf ? cand[0] : null);
        if (!pick) return;
        if (pick.tf) t.setAttribute('transform', `translate(${pick.tf[0]},${pick.tf[1]}) rotate(${pick.tf[2]})`);
        else { t.setAttribute('x', pick.x); t.setAttribute('y', pick.y); t.setAttribute('text-anchor', pick.a); }
        const bb = pick.bb;
        boxes.push(bb);
        t.textContent = s;
        gL.append(t);
      });
      const legend = h('div', { class: 'bus-maplg' }, rs.map(r => h('button', { type: 'button', class: 'bus-lgb', 'aria-pressed': String(focus === r), onclick: () => { focus = focus === r ? null : r; draw(); } }, badge(r.no))),
        h('span', { class: 'note' }, '◎＝可轉乘光瀨都市鉄道・單軌的站牌。點路線號可以只看那一條。圖為方格示意，並非實際道路與方位。'));
      const wrap = h('div', { class: 'bus-svgwrap' }, svg);
      const zb = (t, lb, f) => h('button', { type: 'button', class: 'bus-zb', title: lb, 'aria-label': lb, onclick: f }, t);
      const ctr = h('div', { class: 'bus-zoom' }, zb('＋', '放大', () => pz.zoom(1.4)), zb('－', '縮小', () => pz.zoom(1 / 1.4)), zb('⟲', '重設', () => pz.reset()));
      wrap.append(ctr);
      box.replaceChildren(wrap, legend);
      const c0 = rs[0] && D.stops[rs[0].stops[0]].g;
      const pz = panZoom(wrap, svg, { x: x0 * U, y: y0 * U, w: (x1 - x0) * U, h: (y1 - y0) * U }, all || !c0 ? null : [c0[0] * U, c0[1] * U], view, v => { view = v; });
    }
    draw();
    el.append(h('h3', { class: 'mb-h3' }, '公車路線圖'), chips, box);
  }

  /* ───────── 鉄道・單軌 × 公車 轉乘查詢（2.10.1） ─────────
   * 起訖可以是車站或公車站牌。組合：公車直達／鉄道直達／公車→鉄道／鉄道→公車／公車→鉄道→公車。
   * 鉄道段用入口網站本來的連乘搜尋（H.searchEx，秒）；公車段用上面的 profile／trace（分）。車站與站牌之間步行 3 分。 */
  function viewMulti(el, H) {
    const XW = WALK;                                  // 車站 ↔ 站牌 步行（分）
    const stopsOfSt = id => { const zh = norm(H.stName(id)); return Object.keys(D.stops).filter(s => D.stops[s].st && norm(D.stops[s].st) === zh); };
    const stOfStop = s => { const st = D.stops[s] && D.stops[s].st; if (!st) return null; const x = H.stations.find(o => norm(o.zh) === norm(st)); return x ? x.id : null; };
    const railSt = H.stations.filter(x => stopsOfSt(x.id).length);   // 有公車站牌的車站（轉乘點）
    const pos = v => v.k === 'r' ? (H.stById[v.id] ? [H.stById[v.id].x, H.stById[v.id].z] : null) : [D.stops[v.id].x, D.stops[v.id].z];
    const parse = v => ({ k: v.slice(0, 1), id: v.slice(2) });
    function placeSelect(value, id) {
      const sel = h('select', { id, class: 'bus-sel' });
      const og1 = h('optgroup', { label: '鉄道・單軌車站' });
      H.stations.slice().sort((a, b) => a.zh.localeCompare(b.zh, 'ja')).forEach(x => og1.append(h('option', { value: 'r:' + x.id }, x.zh)));
      const og2 = h('optgroup', { label: '公車站牌' });
      Object.keys(D.stops).sort((a, b) => a.localeCompare(b, 'ja')).forEach(x => og2.append(h('option', { value: 'b:' + x }, x)));
      sel.append(og1, og2); sel.value = value; return sel;
    }
    const railLeg = (j) => ({ rail: true, j, dep: j.dep / 60, arr: j.arr / 60, fare: (H.journeyFare(j.legs) || { yen: 0 }).yen });
    const railOnce = (a, b, tMin) => { if (a === b) return null; try { const r = H.searchEx(a, b, Math.round(tMin * 60), 1, {}); return r && r[0] ? railLeg(r[0]) : null; } catch (e) { return null; } };
    const busOnce = (P, to) => { const r = trace(P, to); return r ? { bus: true, r, dep: r.dep, arr: r.arr, fare: r.fare } : null; };
    const walkSeg = (a, b, t) => ({ walk: true, a, b, dep: t, arr: t + XW, fare: 0 });

    function plans(A, B, t0) {
      const out = [];
      const push = segs => { segs = segs.filter(Boolean); if (!segs.length) return; out.push({ segs, dep: segs[0].dep, arr: segs[segs.length - 1].arr, fare: segs.reduce((x, g) => x + g.fare, 0), n: segs.filter(g => !g.walk).length }); };
      const destStops = B.k === 'b' ? [B.id] : stopsOfSt(B.id);
      const bp = pos(B);
      // 抵達端：要搭鉄道到哪些車站（目的地是車站＝那一站；目的地是站牌＝離它最近、有公車接駁的 3 個車站）
      const egress = B.k === 'r' ? [B.id] : railSt.slice().sort((x, y) => Math.hypot(x.x - bp[0], x.z - bp[1]) - Math.hypot(y.x - bp[0], y.z - bp[1])).slice(0, 3).map(x => x.id);
      // 出發端：起點的公車 profile（起點是車站就從它的站牌出發，加步行）
      const startStops = A.k === 'b' ? [{ s: A.id, t: t0, pre: [] }] : stopsOfSt(A.id).map(s => ({ s, t: t0 + XW, pre: [walkSeg(A.id, s, t0)] }));
      const profs = startStops.map(o => ({ o, P: profile(o.s, o.t) }));
      // (1) 公車直達（含公車間轉乘）
      profs.forEach(({ o, P }) => destStops.forEach(d => {
        if (d === o.s) return;
        const b = busOnce(P, d); if (!b) return;
        push(o.pre.concat([b], B.k === 'r' ? [walkSeg(d, B.id, b.arr)] : []));
      }));
      // 出發端可以上鉄道的車站與時刻
      const access = [];
      if (A.k === 'r') access.push({ st: A.id, t: t0, pre: [] });
      if (A.k === 'b' && stOfStop(A.id)) access.push({ st: stOfStop(A.id), t: t0 + XW, pre: [walkSeg(A.id, stOfStop(A.id), t0)] });   // 起點站牌就在車站旁
      profs.forEach(({ o, P }) => {
        const cand = [];
        railSt.forEach(x => stopsOfSt(x.id).forEach(s => { const b = s === o.s ? null : busOnce(P, s); if (b) cand.push({ st: x.id, t: b.arr + XW, pre: o.pre.concat([b, walkSeg(s, x.id, b.arr)]) }); }));
        cand.sort((a, b) => a.t - b.t);
        const seen = new Set(); cand.forEach(c => { if (seen.has(c.st) || seen.size >= 3) return; seen.add(c.st); access.push(c); });
      });
      // (2) 鉄道（＋前後的公車）
      access.forEach(ac => egress.forEach(E => {
        const r = ac.st === E ? null : railOnce(ac.st, E, ac.t);
        if (!r && ac.st !== E) return;
        const tE = r ? r.arr : ac.t;
        if (B.k === 'r') { if (r) push(ac.pre.concat([r])); return; }
        stopsOfSt(E).forEach(s => {
          const t1 = tE + XW;
          if (s === B.id) { push(ac.pre.concat([r, walkSeg(E, s, tE)])); return; }
          const b = busOnce(profile(s, t1), B.id); if (b) push(ac.pre.concat([r, walkSeg(E, s, tE), b]));
        });
      }));
      out.sort((a, b) => a.arr - b.arr || a.n - b.n || b.dep - a.dep || a.fare - b.fare);
      const seen = new Set();
      return out.filter(p => { const k = p.segs.map(g => g.walk ? 'w' : g.rail ? 'r' + g.dep : 'b' + g.r.legs.map(l => l.walk ? 'w' : l.p.r.no).join('/')).join('|'); if (seen.has(k)) return false; seen.add(k); return true; })
        .filter((p, i, a) => !a.slice(0, i).some(q => q.arr <= p.arr && q.dep >= p.dep))   // 比較晚出發又比較早到的方案就把這個蓋掉
        .slice(0, 4);
    }

    const nmP = v => v.k === 'r' ? H.stName(v.id) : v.id;
    function segView(g) {
      if (g.walk) return h('li', { class: 'walk' }, h('span', { class: 'bus-walk' }, '步行'), h('span', null, H.stById[g.b] ? '公車站牌 → 車站' : '車站 → 公車站牌'), h('span', null, '約 ' + XW + ' 分'));
      if (g.bus) return g.r.legs.map(l => l.walk ? h('li', { class: 'walk' }, h('span', { class: 'bus-walk' }, '步行'), nm(l.from), h('span', null, ' → '), nm(l.to), h('span', null, '約 ' + XW + ' 分'))
        : h('li', null, badge(l.p.r.no), h('span', null, hm(l.dep) + ' '), nm(l.p.stops[l.i]), h('span', null, ' → ' + hm(l.arr) + ' '), nm(l.p.stops[l.j]),
          h('span', { class: 'dir' }, h('span', null, '公車'), '・', h('span', null, l.n + ' 站・' + yen(l.fare)))));
      return g.j.legs.map(lg => {
        const s0 = lg.stops[0], sN = lg.stops[lg.stops.length - 1];
        if (lg.walk) return h('li', { class: 'walk' }, h('span', { class: 'bus-walk' }, '步行'), nm(H.stName(lg.walk.from || s0.station)), h('span', null, ' → '), nm(H.stName(lg.walk.to || sN.station)));
        return h('li', null, h('span', { class: 'bus-rail' }, HK.typeTag ? HK.typeTag(lg.sv) : null),
          h('span', null, hm(s0.dep / 60) + ' '), nm(H.stName(s0.station)), h('span', null, ' → ' + hm(sN.arr / 60) + ' '), nm(H.stName(sN.station)),
          h('span', { class: 'dir' }, h('span', null, lg.sv.routeName), '・', h('span', null, H.destOf(lg.sv, lg.board) + '行'), '・', h('span', null, (lg.stops.length - 1) + ' 站')));
      });
    }

    let from = 'b:' + (D.stops['谷山團地'] ? '谷山團地' : Object.keys(D.stops)[0]);
    const kat = H.stations.find(x => x.zh === '勝守');
    let to = kat ? 'r:' + kat.id : 'b:' + Object.keys(D.stops)[1];
    const a = placeSelect(from, 'mxFrom'), b = placeSelect(to, 'mxTo');
    const tIn = h('input', { type: 'time', value: hm(nowMin()), id: 'mxTime' });
    const out = h('div', { class: 'bus-res' });
    const go = () => {
      const A = parse(a.value), B = parse(b.value);
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number);
      let t0 = hh * 60 + mm;
      out.replaceChildren();
      if (a.value === b.value) { out.append(h('p', null, '出發與抵達是同一個地點。')); return; }
      // 最多查 3 次：每次從上一個方案的出發時間後一分鐘再查，排出接下來的幾個方案
      const ps = [], T0 = performance.now();
      let tq = t0;
      for (let k = 0; k < 3; k++) {
        const r = plans(A, B, tq);
        r.forEach(p => { if (!ps.some(q => q.dep === p.dep && q.arr === p.arr)) ps.push(p); });
        if (!r.length || performance.now() - T0 > 1200) break;
        tq = Math.min(...r.map(p => p.dep)) + 1;
      }
      ps.sort((x, y) => x.dep - y.dep || x.arr - y.arr);
      const keep = ps.filter((p, i) => !ps.some((q, j) => j !== i && q.dep >= p.dep && q.arr <= p.arr && (q.dep > p.dep || q.arr < p.arr))).slice(0, 4);
      if (!keep.length) { out.append(h('p', null, '找不到可以到達的方案。請換一個時間或地點再查查看。')); return; }
      keep.forEach(p => out.append(h('div', { class: 'bus-opt' },
        h('div', { class: 'bus-opt-head' }, h('b', null, hm(p.dep) + ' → ' + hm(p.arr)), h('span', null, '約 ' + Math.round(p.arr - p.dep) + ' 分'),
          h('span', null, p.segs.some(g => g.rail) ? (p.segs.some(g => g.bus) ? '鉄道＋公車' : '鉄道') : '公車'), h('span', { class: 'fare' }, yen(p.fare))),
        h('ol', { class: 'bus-legs' }, p.segs.map(segView)))));
      out.append(h('p', { class: 'mb-note' }, '鉄道與公車的票價分開計算後合計（鉄道依搭乘區間的普通運費；公車依各段站數）。車站與公車站牌之間以步行 3 分計算。'));
    };
    el.append(h('h3', { class: 'mb-h3' }, '鉄道・公車 轉乘查詢'),
      h('form', { class: 'mb-f', onsubmit: e => { e.preventDefault(); go(); } },
        h('div', null, h('label', { for: 'mxFrom' }, '出發'), a),
        h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
        h('div', null, h('label', { for: 'mxTo' }, '抵達'), b),
        h('div', null, h('label', { for: 'mxTime' }, '出發時間'), tIn),
        h('button', { type: 'submit', class: 'bus-go' }, '查詢')),
      out);
    go();
  }

  /* ───────── 交通局頁「公車」分頁 ───────── */
  function tab(H, M, el) {
    const card = h('div', { class: 'mb-card' });
    card.append(h('h2', null, h('span', { class: 'en' }, 'City bus'), '公車'),
      h('p', { class: 'lead' }, '光瀨市交通局的市營公車，以みつせ、戸宮、花倉街道、東平倉、紫市、名島港、勝守、十万浦市、上羽神別為中心運行。'),
      h('p', { class: 'mb-note' }, '營運時間 04:00～24:30。06:00～09:00 與 15:00～19:00 每 15 分一班，09:00～15:00 每 30 分一班，其餘時段每 45 分一班。可以使用 HIKACARD。'),
      h('p', { class: 'mb-note' }, '標示「每小時 1 班」的是次要路線，整天大約每 60 分一班。'));
    const body = h('div', null, h('p', null, '公車資料載入中…'));
    card.append(body);
    el.append(card);
    load().then(() => {
      body.replaceChildren();
      const q = new URLSearchParams(location.search);
      const secs = [['search', '班次查詢'], ['multi', '鉄道轉乘'], ['stops', '站牌時刻表'], ['routes', '路線一覽'], ['map', '路線圖']];
      let cur = q.get('stop') ? 'stops' : 'search';
      const nav = h('div', { class: 'mb-seg bus-seg', role: 'group' });
      const host = h('div');
      const draw = () => {
        nav.replaceChildren(...secs.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === cur), onclick: () => { cur = k; draw(); } }, l)));
        host.replaceChildren();
        ({ search: viewSearch, multi: e => viewMulti(e, H), stops: e => viewStops(e, q.get('stop')), routes: viewRoutes, map: viewMap })[cur](host);
      };
      draw();
      body.append(nav, host);
    }).catch(() => body.replaceChildren(h('p', null, '公車資料暫時無法顯示。')));
  }

  /* ───────── 光瀨都市鉄道 車站時刻表下方：這一站的公車 ───────── */
  function stationPanel(stationZh) {
    const box = h('section', { class: 'bus-station' });
    load().then(() => {
      const stops = Object.keys(D.stops).filter(s => D.stops[s].st && norm(D.stops[s].st) === norm(stationZh));
      if (!stops.length) return;
      box.append(h('h3', { class: 'h3' }, '公車（光瀨市交通局）'),
        h('p', { class: 'note' }, '這個車站附近的公車站牌，與接下來的發車。'));
      stops.forEach(s => {
        box.append(h('h4', { class: 'bus-h4' }, nm(s)), stopTimetable(s, { compact: true }),
          h('p', { style: 'margin:4px 0 14px' }, h('a', { class: 'btn sm ghost', href: 'monorail.html?stop=' + encodeURIComponent(s) + '#bus' }, '全日時刻表與班次查詢')));
      });
    }).catch(() => { /* 沒有公車資料時不顯示 */ });
    return box;
  }

  HK.Bus = { load, tab, stationPanel, search: (...a) => search(...a), departuresAt: s => departuresAt(s), fareOf: n => fareOf(n), get data() { return D; } };
})(typeof window !== 'undefined' ? window : globalThis);
