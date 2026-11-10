/* pages4.js — 設備與服務介紹（特急あおさぎ・特急こばな・花川本線特別快速・環狀快速白藏山線直通）。
 * 車型的文字與照片是固定內容（下面的 SERVICES）；停靠站、所要時間、首末班、全日時刻表都由時刻表資料即時計算。 */
(function () {
  'use strict';
  const HK = window.HK, { h, typeTag } = HK;
  const hm = t => HK.hm(t);
  const q = new URLSearchParams(location.search);
  const P = (src, alt, cap) => ({ src: 'assets/photo/' + src + '.webp', alt, cap });

  const SERVICES = [
    { id: 'aosagi', title: '特急あおさぎ', en: 'Limited Express AOSAGI', tag: '特急', match: /あおさぎ/,
      vehicles: [{ name: '新 8000 形 1000 番台', en: 'New 8000 Series, 1000s', rows: [['登場', '2017 年'], ['編組', '8 輛'], ['最高速度', '160 km/h'], ['傾斜方式', '主動擺錘振子式（傾斜式）'], ['傾斜角度', '5 度']],
        photos: [P('n8000k-1', '停在月台的新8000形1000番台特急あおさぎ', ''), P('n8000k-2', '行駛在山間的新8000形1000番台', '行駛在山間')] }] },
    { id: 'kobana', title: '特急こばな', en: 'Limited Express KOBANA', tag: '特急', match: /こばな/,
      vehicles: [{ name: '新 8000 形 0 番台', en: 'New 8000 Series, 0s', rows: [['登場', '2024 年'], ['編組', '8 輛'], ['最高速度', '160 km/h'], ['傾斜方式', '主動擺錘振子式（傾斜式）'], ['傾斜角度', '5 度'], ['座席', '全車指定席（另有立席特急券）'], ['座位設備', '備有 USB 充電口']],
        photos: [P('kobana1', '行駛在高架橋上的新8000形特急こばな', '高架橋上的特急こばな'), P('kobana3', '新8000形特急こばな的車頭', '車頭'), P('kobana2', '新8000形特急こばな', '')] }] },
    { id: 'tokkai', title: '花川本線特別快速', en: 'Hanakawa Main Line Special Rapid', tag: '特快', match: /花川本線特別快速/, note: '含松歲線直通的班次。',
      vehicles: [{ name: '新 2100 形', en: 'New 2100 Series', rows: [['登場', '2026 年'], ['編組', '6 輛・8 輛'], ['最高速度', '160 km/h']],
        photos: [P('n2100-1', '行駛中的新2100形', ''), P('n2100-2', '在みつせ站附近與特急擦身而過的新2100形', 'みつせ站附近'), P('n2100-3', '行駛在高架彎道的新2100形', ''), P('n2100-4', '行駛在市區高架上的新2100形', '')] }] },
    { id: 'kanjo', title: '環狀快速白藏山線直通', en: 'Loop Semi-Fast (Shirakura Line through service)', tag: '環快', match: /環[状狀]快速/,
      vehicles: [
        { name: '10000 形', en: '10000 Series', rows: [['登場', '1999 年'], ['編組', '6 輛']], photos: [P('h10000-1', '停在月台的10000形', ''), P('h10000-2', '行駛中的10000形（遠方為新1150形）', '')] },
        { name: '新 1150 形', en: 'New 1150 Series', rows: [['登場', '2021 年'], ['編組', '6 輛']], photos: [P('n1150-1', '行駛中的新1150形', ''), P('n1150-2', '行駛在高架上的新1150形', ''), P('n1150-int', '新1150形的車廂內部', '車廂內部')] }] }
  ];

  const sec = (title, sub, ...kids) => h('section', { class: 'gsec' }, h('h2', null, title, sub ? h('small', null, sub) : null), ...kids);

  function gallery(ph) {
    if (!ph || !ph.length) return null;
    const main = h('img', { src: ph[0].src, alt: ph[0].alt, loading: 'lazy' }), cap = h('figcaption', null, ph[0].cap || '');
    const thumbs = ph.length > 1 ? h('div', { class: 'sthumbs' }, ph.map((p, k) => h('button', { type: 'button', 'aria-label': p.alt, 'aria-pressed': String(k === 0), onclick: ev => {
      main.src = p.src; main.alt = p.alt; cap.textContent = p.cap || '';
      ev.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
    } }, h('img', { src: p.src, alt: '', loading: 'lazy' })))) : null;
    return h('figure', { class: 'sfig', style: 'margin:0' }, main, cap, thumbs);
  }

  /** 全日時刻表：各站的發車（終點站為到達）時刻，一欄是一班車。 */
  function fullTable(H, sv) {
    const st = sv.stops, tt = HK.depTimes(H, sv), t0 = st[0].dep;
    const rows = []; st.forEach((s, i) => { if (s.pax !== false) rows.push([s, i]); });
    if (!tt.length) return h('p', { class: 'note' }, '本日沒有班次。');
    const last = st.length - 1;
    const head = h('tr', null, h('th', { class: 'stk' }, '車站'), ...tt.map((t, k) => h('th', { class: 'c' + (k && Math.floor(t / 3600) !== Math.floor(tt[k - 1] / 3600) ? ' hs' : '') }, String(Math.floor(t / 3600)) + '時')));
    const body = rows.map(([s, i]) => h('tr', null, h('th', { class: 'stk', scope: 'row' }, H.codeBadges(s.station), H.stName(s.station)),
      ...tt.map((t, k) => { const v = t + (i === last ? s.arr - t0 : s.dep - t0); return h('td', { class: 'c' + (k && Math.floor(t / 3600) !== Math.floor(tt[k - 1] / 3600) ? ' hs' : '') }, hm(v)); })));
    return h('div', { class: 'tscroll fulltt-wrap' }, h('table', { class: 'fulltt' }, h('thead', null, head), h('tbody', null, body)));
  }

  function groupPanel(H, groups, g) {
    let di = 0;
    const wrap = h('div', { class: 'svgroup' }), top = h('div'), bottom = h('div');
    function draw() {
      HK.lineBlock(H, groups, g, di, top, k => { di = k; draw(); });
      const sv = g.svs[Math.min(di, g.svs.length - 1)];
      bottom.replaceChildren(h('h3', { class: 'h3' }, '全日時刻表'), h('p', { class: 'note' }, `${HK.dirLabel(H, sv)}。各站的發車時刻（終點站為到達時刻），一欄是一班車。`), fullTable(H, sv));
    }
    wrap.append(top, bottom); draw(); return wrap;
  }

  function viewServices(H, root) {
    let cur = SERVICES.find(s => s.id === q.get('s')) || SERVICES[0];
    const chips = h('div', { class: 'lchips', role: 'group', 'aria-label': '種別' }), out = h('div');
    root.append(h('p', { class: 'lead' }, '各種別使用的車型、運行時間與全日時刻表。'));
    if (HK.dispNote(H)) root.append(h('p', { class: 'note' }, HK.dispNote(H)));
    root.append(chips, out);
    const all = HK.groupsOf(H);
    function drawChips() { chips.replaceChildren(...SERVICES.map(s => h('button', { type: 'button', class: 'lchipbtn', 'aria-pressed': String(s === cur), onclick: () => { cur = s; try { history.replaceState(null, '', '?s=' + s.id); } catch (e) { /* 忽略 */ } drawChips(); draw(); } }, s.title))); }
    function draw() {
      out.replaceChildren();
      const groups = all.filter(g => cur.match.test(g.name));
      const first = cur.vehicles[0].photos[0];
      out.append(h('div', { class: 'kbhero' + (first ? '' : ' nophoto') }, first ? h('img', { src: first.src, alt: first.alt }) : null,
        h('div', { class: 'kb-t' }, h('span', { class: 'tag' }, cur.tag), h('h2', null, cur.title), h('p', { class: 'kb-s' }, cur.en))));
      cur.vehicles.forEach(v => {
        const ph = gallery(v.photos);
        out.append(sec(v.name, v.en, h('div', { class: 'kbcols' },
          h('div', null, h('table', { class: 'tbl' }, h('tbody', null, v.rows.map(([k, x]) => h('tr', null, h('th', null, k), h('td', null, x)))))), ph)));
      });
      if (!groups.length) { out.append(sec('運行與時刻', null, h('p', null, '時刻表資料中還沒有這個種別的班次，更新後會顯示在這裡。'))); return; }
      if (cur.note) out.append(h('p', { class: 'note' }, cur.note));
      groups.forEach(g => out.append(sec('運行與時刻', null, groupPanel(H, all, g))));
      out.append(h('p', null, h('a', { class: 'btn', href: 'booking.html' }, '線上訂票'), ' ', h('a', { class: 'btn ghost', href: 'timetable.html' }, '時刻表'), ' ', h('a', { class: 'btn ghost', href: 'guide.html' }, '乘車指南與常見問題')));
    }
    drawChips(); draw();
  }
  Object.assign(HK, { viewServices });
})();
