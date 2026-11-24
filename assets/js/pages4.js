/* pages4.js — 設備與服務介紹（特急スーパーしらたか・特急あおさぎ・特急こばな・花川本線特別快速・環狀快速白藏山線直通＋2.14.0 通勤列車區）。
 * 車型的文字與照片是固定內容（下面的 SERVICES）；停靠站、所要時間、首末班、全日時刻表都由時刻表資料即時計算。 */
(function () {
  'use strict';
  const HK = window.HK, { h, typeTag } = HK;
  const hm = t => HK.hm(t);
  const q = new URLSearchParams(location.search);
  const P = (src, alt, cap) => ({ src: 'assets/photo/' + src + '.webp', alt, cap });

  /* 2.14.0：車型表一律先列 登場年／編組／最高速度／服務設備／服務路線・種別（沒有資料的欄位省略），其餘特色接在後面。
   * SERVICES 分兩區：kind 'svc'＝特別介紹的列車／種別（附運行與時刻）；kind 'fleet'＝通勤列車（只介紹車型）。 */
  const SERVICES = [
    { id: 'shirataka', title: '特急スーパーしらたか', en: 'Limited Express Super SHIRATAKA', tag: '特急', color: '#104e37', match: /しらたか/, note: '滝井川・五原・御笠市方面。全車指定席（8 輛編組）。',
      vehicles: [{ name: '新 8000 形 2000 番台', en: 'New 8000 Series, 2000s', rows: [['登場年', '2026 年'], ['編組', '8 輛'], ['最高速度', '160 km/h'], ['服務設備', 'USB 充電口、閱讀燈、大型行李架'], ['服務路線／種別', '花川本線、松歲線／特急スーパーしらたか'], ['傾斜方式', '主動擺錘振子式（傾斜式）'], ['傾斜角度', '5 度'], ['座席', '全車指定席']],
        photos: [P('s8000-2000-3', '夕陽下行駛在田園間的新8000形2000番台特急スーパーしらたか', '夕陽下的田園'), P('s8000-2000-1', '停在五原千歲站月台的新8000形2000番台', '五原千歲站'), P('s8000-2000-2', '從低角度仰望的新8000形2000番台', ''), P('s8000-2000-4', '夜間停在滝井川站的新8000形2000番台', '夜晚的滝井川站'), P('s8000-2000-5', '通過滝井川站旁平交道的新8000形2000番台', '滝井川站旁的平交道')] }] },
    { id: 'aosagi', title: '特急あおさぎ', en: 'Limited Express AOSAGI', tag: '特急', color: '#2f6d8c', match: /あおさぎ/, note: '咲海研究學園都市・東平倉～松澤國際空港。',
      vehicles: [{ name: '新 8000 形 1000 番台', en: 'New 8000 Series, 1000s', rows: [['登場年', '2017 年'], ['編組', '8 輛'], ['最高速度', '160 km/h'], ['服務設備', 'USB 充電口、大型行李架'], ['服務路線／種別', '學園線、花川本線、松歲線／特急あおさぎ'], ['傾斜方式', '主動擺錘振子式（傾斜式）'], ['傾斜角度', '5 度']],
        photos: [P('n8000k-1', '停在月台的新8000形1000番台特急あおさぎ', ''), P('n8000k-2', '行駛在山間的新8000形1000番台', '行駛在山間')] }] },
    { id: 'kobana', title: '特急こばな', en: 'Limited Express KOBANA', tag: '特急', color: '#8c2f3a', match: /こばな/,
      vehicles: [{ name: '新 8000 形 0 番台', en: 'New 8000 Series, 0s', rows: [['登場年', '2024 年'], ['編組', '8 輛'], ['最高速度', '160 km/h'], ['服務設備', 'USB 充電口'], ['服務路線／種別', '花川本線、環狀線、白藏山線／特急こばな'], ['傾斜方式', '主動擺錘振子式（傾斜式）'], ['傾斜角度', '5 度'], ['座席', '全車指定席（另有立席特急券）']],
        photos: [P('kobana1', '行駛在高架橋上的新8000形特急こばな', '高架橋上的特急こばな'), P('kobana3', '新8000形特急こばな的車頭', '車頭'), P('kobana2', '新8000形特急こばな', '')] }] },
    { id: 'tokkai', title: '花川本線特別快速', en: 'Hanakawa Main Line Special Rapid', tag: '特快', color: '#b8862a', match: /花川本線特別快速/, note: '含松歲線直通的班次。',
      vehicles: [{ name: '新 2100 形', en: 'New 2100 Series', rows: [['登場年', '2026 年'], ['編組', '6 輛・8 輛'], ['最高速度', '160 km/h'], ['服務設備', '可調式座位、行李架、USB 充電口'], ['服務路線／種別', '花川本線、松歲線／特別快速']],
        photos: [P('n2100-1', '行駛中的新2100形', ''), P('n2100-2', '在みつせ站附近與特急擦身而過的新2100形', 'みつせ站附近'), P('n2100-3', '行駛在高架彎道的新2100形', ''), P('n2100-4', '行駛在市區高架上的新2100形', '')] }] },
    { id: 'kanjo', title: '環狀快速白藏山線直通', en: 'Loop Semi-Fast (Shirakura Line through service)', tag: '環快', color: '#4f6b3a', match: /環[状狀]快速/, note: '8 輛編組的班次 4・5 号車為指定席（可線上訂票），其他車廂為自由席；6 輛編組的班次全車自由席。',
      vehicles: [
        { name: '新 1750 形', en: 'New 1750 Series', rows: [['登場年', '2021 年'], ['編組', '8 輛（快速）・6 輛（各停）'], ['最高速度', '160 km/h'], ['服務設備', '4・5 号車指定席車廂備有 USB 充電口'], ['服務路線／種別', '環狀快速、花川本線快速、新中央線白藏山線各停'], ['動力方式', '混合動力（蓄電池）'], ['指定席', '快速運用時 4・5 号車為指定席車廂']],
          photos: [P('n1750-1', '停在月台的新1750形', ''), P('n1750-2', '新1750形的側面', ''), P('n1750-3', '並排停放的新1750形', ''), P('n1750-4', '夜間行駛在河畔的新1750形', '夜間的河畔')] },
        { name: '10000 形', en: '10000 Series', retire: true, rows: [['登場年', '1999 年'], ['編組', '6 輛'], ['最高速度', '160 km/h'], ['服務路線／種別', '花川本線、環狀線、白藏山線／環狀快速']], photos: [P('h10000-1', '停在月台的10000形', ''), P('h10000-2', '行駛中的10000形（遠方為新1150形）', '')] }] },
    { id: 'commuter', kind: 'fleet', title: '通勤列車', en: 'Commuter Trains', tag: '通勤', color: '#5b6b78',
      vehicles: [
        { name: '1000 形', en: '1000 Series', rows: [['登場年', '2011 年'], ['編組', '7 輛'], ['最高速度', '130 km/h'], ['服務路線／種別', '倉浦市區線'], ['製造商', '水音車輛']],
          photos: [P('c1000-1', '停在雪地月台的1000形各停', '雪中的月台'), P('c1000-2', '停在月台的1000形', '')] },
        { name: '1100 形', en: '1100 Series', rows: [['登場年', '2021 年'], ['編組', '8 輛（快速）・4 輛（各停）'], ['最高速度', '130 km/h'], ['服務設備', '4・5 号車指定席車廂（2026 年改造）'], ['服務路線／種別', '花川本線快速（8 輛）、各停（4 輛）'], ['製造商', '鶴島精工']],
          photos: [P('c1100-1', '行駛在高架彎道的1100形', '')] },
        { name: '新 1150 形', en: 'New 1150 Series', rows: [['登場年', '2021 年'], ['編組', '6 輛・8 輛'], ['最高速度', '130 km/h'], ['服務路線／種別', '新中央線白藏山線各停（6 輛）、環狀線（8 輛）'], ['製造商', '鶴島精工']],
          photos: [P('n1150-1', '行駛中的新1150形', ''), P('n1150-2', '行駛在高架上的新1150形', ''), P('n1150-int', '新1150形的車廂內部', '車廂內部')] }] }
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

  /** 1.9.4：全日時刻表：各站的發車（終點站為到達）時刻，一欄是一班車；欄名優先顯示班次號（H.gouOf，例如「あおさぎ39号」
   *  「とりさわ5号」），沒有班次號的種別（花川本線特別快速、環狀快速等不是特急的）維持顯示發車時刻，不會變成空白欄名。
   *  提升到 HK 共用（HK.fullTable），這樣高速鉄道專頁（hs.js）也能用同一份邏輯，不用重寫一次。 */
  /** 2.11.0：合併方向（HK.dirsOf 的 d：好幾個班型）一起排成一張：車站列含通過站，停車＝時刻、通過＝レ、不經過＝—；
   *  欄頭第二行是班型（例：スーパー、松歲線直通）和終點不同時的終點。 */
  function fullTableDir(H, g, d) {
    const runs = [];
    const prim = d.prim, pRel = new Map(); expandSv(prim).forEach(e => { if (e.pax) pRel.set(e.station, (e.i === prim.stops.length - 1 ? prim.stops[e.i].arr : prim.stops[e.i].dep) - prim.stops[0].dep); });
    const ends = new Set(d.svs.map(v => v.stops[v.stops.length - 1].station));
    d.svs.forEach(sv => {
      const t0 = sv.stops[0].dep, ex = expandSv(sv);
      // 排序基準：換算成「主要班型」在同一站的時刻
      const cm = ex.find(e => e.pax && pRel.has(e.station));
      const shift = cm ? (sv.stops[cm.i].dep - t0) - pRel.get(cm.station) : 0;
      HK.depTimes(H, sv).forEach(t => runs.push({ sv, t, ex, gou: H.gouOf ? H.gouOf(sv, t - t0) : '', key: t + shift }));
    });
    if (!runs.length) return h('p', { class: 'note' }, '本日沒有班次。');
    runs.sort((a, b) => a.key - b.key);
    const vr = r => { const v = HK.variantOf(g, r.sv); return [r.gou && v && r.gou.includes(v) ? '' : v, ends.size > 1 ? '→' + H.stName(r.sv.stops[r.sv.stops.length - 1].station) : ''].filter(Boolean).join(' '); };
    const hsep = k => k && Math.floor(runs[k].key / 3600) !== Math.floor(runs[k - 1].key / 3600) ? ' hs' : '';
    const head = h('tr', null, h('th', { class: 'stk' }, '車站'), ...runs.map((r, k) => h('th', { class: 'c' + hsep(k) }, r.gou || hm(r.t), vr(r) ? h('small', { class: 'vr' }, vr(r)) : null)));
    const body = d.rows.map(row => h('tr', { class: row.mark === 'レ' ? 'pass' : null }, h('th', { class: 'stk', scope: 'row' }, H.codeBadges(row.station), H.stName(row.station)),
      ...runs.map((r, k) => {
        const e = r.ex.find(x => x.station === row.station), sv = r.sv;
        const v = !e ? '—' : !e.pax ? 'レ' : hm(r.t + (e.i === sv.stops.length - 1 ? sv.stops[e.i].arr : sv.stops[e.i].dep) - sv.stops[0].dep);
        return h('td', { class: 'c' + hsep(k) + (!e || !e.pax ? ' ps' : '') }, v);
      })));
    return h('div', { class: 'tscroll fulltt-wrap' }, h('table', { class: 'fulltt' }, h('thead', null, head), h('tbody', null, body)));
  }
  const expandSv = sv => HK.expandSv(HK._H, sv);

  function fullTable(H, sv) {
    const st = sv.stops, tt = HK.depTimes(H, sv), t0 = st[0].dep;
    const rows = []; st.forEach((s, i) => { if (s.pax !== false) rows.push([s, i]); });
    if (!tt.length) return h('p', { class: 'note' }, '本日沒有班次。');
    const last = st.length - 1;
    const head = h('tr', null, h('th', { class: 'stk' }, '車站'), ...tt.map((t, k) => {
      const base = t - t0, gou = H.gouOf ? H.gouOf(sv, base) : '';
      return h('th', { class: 'c' + (k && Math.floor(t / 3600) !== Math.floor(tt[k - 1] / 3600) ? ' hs' : '') }, gou || hm(t));
    }));
    const body = rows.map(([s, i]) => h('tr', null, h('th', { class: 'stk', scope: 'row' }, H.codeBadges(s.station), H.stName(s.station)),
      ...tt.map((t, k) => { const v = t + (i === last ? s.arr - t0 : s.dep - t0); return h('td', { class: 'c' + (k && Math.floor(t / 3600) !== Math.floor(tt[k - 1] / 3600) ? ' hs' : '') }, hm(v)); })));
    return h('div', { class: 'tscroll fulltt-wrap' }, h('table', { class: 'fulltt' }, h('thead', null, head), h('tbody', null, body)));
  }

  /** 1.9.4：先 Top（車種資訊卡＋停靠站所要時間模板），接著全日逐班時刻表（含班次號——這是前輩要的重點：
   *  班次、時刻表優先顯示每一班車每一站的時間，不是只看班次密度），最後才是 Bottom（班距長條圖＋停車一覽，移到更後面）。 */
  function groupPanel(H, groups, g) {
    let di = 0;
    const wrap = h('div', { class: 'svgroup' }), top = h('div'), mid = h('div'), bottom = h('div');
    function draw() {
      HK._H = H;
      HK.lineBlockTop(H, groups, g, di, top, k => { di = k; draw(); });
      const dirs = HK.dirsOf(H, g), d = dirs[Math.min(di, dirs.length - 1)];
      mid.replaceChildren(h('h3', { class: 'h3' }, '全日時刻表'), h('p', { class: 'note' }, `${d.label}。各站的發車時刻（終點站為到達時刻），一欄是一班車；欄名為班次號（沒有編號的種別則顯示發車時刻）。レ＝通過，—＝不經過。`), fullTableDir(H, g, d));
      bottom.replaceChildren();
      HK.lineBlockBottom(H, groups, g, di, bottom);
    }
    wrap.append(top, mid, bottom); draw(); return wrap;
  }

  function viewServices(H, root) {
    let cur = SERVICES.find(s => s.id === q.get('s')) || SERVICES[0];
    const chips = h('div', { class: 'lchips', role: 'group', 'aria-label': '種別' }), out = h('div');
    root.append(h('p', { class: 'lead' }, '各種別使用的車型、運行時間與全日時刻表。'));
    if (HK.dispNote(H)) root.append(h('p', { class: 'note' }, HK.dispNote(H)));
    root.append(chips, out);
    const all = HK.groupsOf(H);
    // 2.14.0：分兩組——特別介紹的列車／種別、通勤列車（只介紹車型）。
    const chip = s => h('button', { type: 'button', class: 'lchipbtn', style: s.color ? `--bc:${s.color}` : null, 'aria-pressed': String(s === cur), onclick: () => { cur = s; try { history.replaceState(null, '', '?s=' + s.id); } catch (e) { /* 忽略 */ } drawChips(); draw(); } }, s.color ? h('i', { style: `background:${s.color}` }) : null, s.title);
    function drawChips() {
      chips.replaceChildren(
        h('div', { class: 'svgrp' }, h('span', { class: 'svgrp-l' }, '列車與種別'), ...SERVICES.filter(s => s.kind !== 'fleet').map(chip)),
        h('div', { class: 'svgrp' }, h('span', { class: 'svgrp-l' }, '車型介紹'), ...SERVICES.filter(s => s.kind === 'fleet').map(chip)));
    }
    function draw() {
      out.replaceChildren();
      const groups = cur.match ? all.filter(g => cur.match.test(g.name)) : [];
      const first = cur.vehicles[0].photos[0];
      out.append(h('div', { class: 'kbhero' + (first ? '' : ' nophoto') }, first ? h('img', { src: first.src, alt: first.alt }) : null,
        h('div', { class: 'kb-t' }, h('span', { class: 'tag', style: cur.color ? `--bc:${cur.color}` : null }, cur.tag), h('h2', null, cur.title), h('p', { class: 'kb-s' }, cur.en))));
      cur.vehicles.forEach(v => {
        const ph = gallery(v.photos);
        out.append(sec(v.retire ? [v.name, ' ', h('span', { class: 'retire' }, '即將退役')] : v.name, v.en, h('div', { class: 'kbcols' },
          h('div', null, h('table', { class: 'tbl' }, h('tbody', null, v.rows.map(([k, x]) => h('tr', null, h('th', null, k), h('td', null, x)))))), ph)));
      });
      if (cur.kind === 'fleet') { out.append(h('p', { class: 'note' }, '通勤列車只介紹車型；各路線的停靠站與時刻請見時刻表。'), h('p', null, h('a', { class: 'btn ghost', href: 'timetable.html' }, '時刻表'))); return; }
      if (!groups.length) { out.append(sec('運行與時刻', null, h('p', null, '時刻表資料中還沒有這個種別的班次，更新後會顯示在這裡。'))); return; }
      if (cur.note) out.append(h('p', { class: 'note' }, cur.note));
      groups.forEach(g => out.append(sec('運行與時刻', null, groupPanel(H, all, g))));
      out.append(h('p', null, h('a', { class: 'btn', href: 'booking.html' }, '線上訂票'), ' ', h('a', { class: 'btn ghost', href: 'timetable.html' }, '時刻表'), ' ', h('a', { class: 'btn ghost', href: 'guide.html' }, '乘車指南與常見問題')));
    }
    drawChips(); draw();
  }
  Object.assign(HK, { viewServices, fullTable });
})();
