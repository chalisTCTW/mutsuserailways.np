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
      const mk = (stops, t, dir) => {
        const off = [0];
        for (let i = 0; i < t.length; i++) off.push(off[i] + t[i]);
        PAT.push({ r, dir, stops, off, deps, dest: stops[stops.length - 1] });
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
  function searchOnce(from, to, t0) {
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
        badge(r.no), h('span', null, ...rname(r)))));
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

  function viewMap(el) {
    let hub = 'みつせ', focus = null;
    const box = h('div', { class: 'bus-map' });
    const chips = h('div', { class: 'bus-hubs', role: 'group', 'aria-label': '地區' });
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
    const U = 26, W = 0.2;   // 一格 26px；並排的線距 0.2 格
    function draw() {
      chips.replaceChildren(...['全部'].concat(HUBS).map(g => h('button', { type: 'button', 'aria-pressed': String(g === hub), onclick: () => { hub = g; focus = null; draw(); } }, g)));
      const all = hub === '全部';
      const rs = D.routes.filter(r => all || r.hub === hub).sort((a, b) => +a.no - +b.no);
      // 每段走廊有哪些路線（依路線號排）→ 各自的偏移
      const use = new Map();
      rs.forEach(r => corridorsOf(r).forEach(c => { if (!use.has(c.key)) use.set(c.key, []); if (!use.get(c.key).includes(r)) use.get(c.key).push(r); }));
      const offOf = (key, r) => { const l = use.get(key); return (l.indexOf(r) - (l.length - 1) / 2) * W; };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rs.forEach(r => r.stops.forEach(s => { const g = D.stops[s].g; x0 = Math.min(x0, g[0]); x1 = Math.max(x1, g[0]); y0 = Math.min(y0, g[1]); y1 = Math.max(y1, g[1]); }));
      const m = all ? 2 : 3.2;
      x0 -= m; y0 -= m * 0.6; x1 += m * 1.6; y1 += m;
      const svg = sv('svg', { viewBox: `${x0 * U} ${y0 * U} ${(x1 - x0) * U} ${(y1 - y0) * U}`, class: 'bus-svg' + (all ? ' all' : ''), role: 'img', 'aria-label': '公車路線示意圖' });
      svg.style.minWidth = (all ? 900 : Math.min(1400, (x1 - x0) * U * 0.9)) + 'px';
      const gGrid = sv('g', { class: 'grid' }), gR = sv('g'), gS = sv('g'), gL = sv('g');
      for (let x = Math.ceil(x0); x <= x1; x++) gGrid.append(sv('line', { x1: x * U, y1: y0 * U, x2: x * U, y2: y1 * U }));
      for (let y = Math.ceil(y0); y <= y1; y++) gGrid.append(sv('line', { x1: x0 * U, y1: y * U, x2: x1 * U, y2: y * U }));
      svg.append(gGrid, gR, gS, gL);
      rs.forEach(r => {
        const pts = [];
        corridorsOf(r).forEach(c => {
          let q = offsetPts(D.corr[c.key].pts, offOf(c.key, r));
          if (c.rev) q = q.reverse();
          q.forEach(p => pts.push(p));
        });
        if (!pts.length) return;
        const dim = focus && focus !== r;
        gR.append(sv('polyline', { points: pts.map(p => (p[0] * U).toFixed(1) + ',' + (p[1] * U).toFixed(1)).join(' '), fill: 'none', stroke: colorOf(r.no),
          'stroke-width': (all ? 4 : 4.4), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: dim ? '.15' : '1' }));
      });
      // 站牌：共線幾條就畫多長的膠囊（橫跨並排的線）
      const info = new Map();   // 站名 → { n, dir }
      use.forEach((l, key) => {
        const c = D.corr[key];
        [c.a, c.b].concat(c.mids).forEach(s => {
          if (!rs.some(r => r.stops.includes(s))) return;
          const d = dirAt(c.pts, D.stops[s].g);
          const cur = info.get(s);
          if (!cur || l.length > cur.n) info.set(s, { n: l.length, dir: d });
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
        let bb;
        if (v.dir === 'h') {   // 水平線上的站：斜 40 度放在線的上方
          const x = rx + 2, y = mk[1] - 4, c = Math.cos(0.698), sn = Math.sin(0.698);
          t.setAttribute('transform', `translate(${x},${y}) rotate(-40)`);
          bb = [x, y - tw * sn - fs * 0.6, x + tw * c + fs * 0.5, y + 2];
        } else {
          const x = mk[0] + mk[2] + 5, y = ry + 4;
          t.setAttribute('x', x); t.setAttribute('y', y);
          bb = [x, y - fs * 0.85, x + tw, y + fs * 0.2];
        }
        if (!xf && hit(bb)) return;
        boxes.push(bb);
        t.textContent = s;
        gL.append(t);
      });
      const legend = h('div', { class: 'bus-maplg' }, rs.map(r => h('button', { type: 'button', class: 'bus-lgb', 'aria-pressed': String(focus === r), onclick: () => { focus = focus === r ? null : r; draw(); } }, badge(r.no))),
        h('span', { class: 'note' }, '◎＝可轉乘光瀨都市鉄道・單軌的站牌。點路線號可以只看那一條。圖為方格示意，並非實際道路與方位。'));
      const wrap = h('div', { class: 'bus-svgwrap' }, svg);
      box.replaceChildren(wrap, legend);
      // 手機上圖比畫面大：一開始捲到這個地區的起點站（例：みつせ車站西口）附近
      const c0 = rs[0] && D.stops[rs[0].stops[0]].g;
      if (c0) requestAnimationFrame(() => {
        const k = svg.getBoundingClientRect().width / ((x1 - x0) * U);
        wrap.scrollLeft = Math.max(0, (c0[0] - x0) * U * k - wrap.clientWidth / 2);
        wrap.scrollTop = Math.max(0, (c0[1] - y0) * U * k - wrap.clientHeight / 2);
      });
    }
    draw();
    el.append(h('h3', { class: 'mb-h3' }, '公車路線圖'), chips, box);
  }

  /* ───────── 交通局頁「公車」分頁 ───────── */
  function tab(H, M, el) {
    const card = h('div', { class: 'mb-card' });
    card.append(h('h2', null, h('span', { class: 'en' }, 'City bus'), '公車'),
      h('p', { class: 'lead' }, '光瀨市交通局的市營公車，以みつせ、戸宮、花倉街道、東平倉、紫市、名島港、勝守、十万浦市、上羽神別為中心運行。'),
      h('p', { class: 'mb-note' }, '營運時間 04:00～24:30。06:00～09:00 與 15:00～19:00 每 15 分一班，09:00～15:00 每 30 分一班，其餘時段每 45 分一班。可以使用 HIKACARD。'));
    const body = h('div', null, h('p', null, '公車資料載入中…'));
    card.append(body);
    el.append(card);
    load().then(() => {
      body.replaceChildren();
      const q = new URLSearchParams(location.search);
      const secs = [['search', '班次查詢'], ['stops', '站牌時刻表'], ['routes', '路線一覽'], ['map', '路線圖']];
      let cur = q.get('stop') ? 'stops' : 'search';
      const nav = h('div', { class: 'mb-seg bus-seg', role: 'group' });
      const host = h('div');
      const draw = () => {
        nav.replaceChildren(...secs.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === cur), onclick: () => { cur = k; draw(); } }, l)));
        host.replaceChildren();
        ({ search: viewSearch, stops: e => viewStops(e, q.get('stop')), routes: viewRoutes, map: viewMap })[cur](host);
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
