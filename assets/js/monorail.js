/* 光瀨市交通局（Hikarise Monorail）獨立頁面。
 *
 * 資料層完全沿用本站的 hk-core：載入同一份 data/snapshot.json，再把路線篩成「輕軌（LIGHT_RAIL）」，
 * 所以前輩不用維護第二份資料，快照一更新兩邊一起更新。
 * 篩選條件就是 sv.isLRT——遊戲（MTR）裡把路線類型設成 LIGHT_RAIL 的班次。
 *
 * 一頁式：六個分頁籤（運行情報／時刻表／運賃／駅案內／ご利用案内／車両紹介），網址用 #hash 記住目前分頁。
 */
(function (root) {
  'use strict';
  const HK = root.HK || {};
  const h = HK.h;
  const DAY = 86400;

  const pad = n => String(n).padStart(2, '0');
  const hm = t => { const s = ((t % DAY) + DAY) % DAY; return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)); };
  const text = (tag, cls, ...kids) => h(tag, cls ? { class: cls } : null, ...kids);

  /** 把 H 篩成只有單軌的資料。order＝沿線站序（取停站最多的那個班次的順序）。 */
  function monoOf(H) {
    const svcs = (H.svcs || []).filter(sv => sv.isLRT);
    const ids = new Set();
    svcs.forEach(sv => sv.stops.forEach(x => ids.add(x.station)));
    const stations = H.stations.filter(st => ids.has(st.id));
    let order = [];
    const longest = svcs.slice().sort((a, b) => b.stops.length - a.stops.length)[0];
    if (longest) longest.stops.forEach(x => { if (order.indexOf(x.station) < 0) order.push(x.station); });
    stations.forEach(st => { if (order.indexOf(st.id) < 0) order.push(st.id); });
    order = order.filter(id => ids.has(id));
    const lineName = (svcs[0] && (svcs[0].line || svcs[0].routeName)) || '光瀨都市單軌線';
    // 兩個方向的終點（用站序的頭尾，比讀路線名稱可靠）
    const ends = order.length > 1 ? [order[order.length - 1], order[0]] : [];
    return { svcs, stations, ids, order, lineName, ends };
  }

  /** 這一站有哪些「非單軌」的路線停靠＝可以轉乘光瀨都市鉄道。 */
  function transfersAt(H, id) {
    const out = [];
    (H.svcs || []).forEach(sv => {
      if (sv.isLRT) return;
      if (!sv.stops.some(x => x.station === id)) return;
      const nm = sv.line || sv.routeName;
      if (nm && out.indexOf(nm) < 0) out.push(nm);
    });
    return out;
  }

  /** 2.6.1：照片（assets/img/monorail/）。-s 是手機用的小圖，由 srcset 自動選。 */
  const PHOTO = {
    hero: ['hero', '光瀨都市單軌穿過市區的高架軌道梁'],
    front: ['front', '停靠月台的單軌列車先頭部'],
    cityscape: ['cityscape', '市區上空的單軌列車'],
    viaduct: ['viaduct', '城跡旁的高架軌道梁'],
    town: ['town', '商店街上方的單軌列車'],
    // 2.9.0：前輩提供的照片（B 八幡通、F 船井大島城跡前、G 栗田、H 剪票口；其餘作裝飾）
    street: ['street', '十字路口上空的單軌軌道梁'],
    'st-hachiman': ['st-hachiman', '八幡通站的高架月台與兩列 CITYMOVER'],
    sunset: ['sunset', '夕陽下從正下方仰望的懸垂式單軌'],
    platform: ['platform', '月台上的單軌列車先頭部與發車案內'],
    river: ['river', '河岸上空的兩條軌道梁'],
    'st-funai': ['st-funai', '船井大島城跡前站的月台門'],
    'st-kurita': ['st-kurita', '栗田站與遠方的天守'],
    'ride-gate': ['ride-gate', '單軌車站的剪票口'],
    tower: ['tower', '夜空下的流星樹']
  };
  const img = (key, cls) => {
    const [f, alt] = PHOTO[key];
    return h('img', {
      src: 'assets/img/monorail/' + f + '.jpg',
      srcset: 'assets/img/monorail/' + f + '-s.jpg 640w, assets/img/monorail/' + f + '.jpg 1600w',
      sizes: '(max-width: 760px) 100vw, 1000px',
      alt: alt, loading: cls === 'eager' ? 'eager' : 'lazy'
    });
  };
  /** 一張寬幅照片＋角落的小說明，用在各分頁的開頭。 */
  const photoBand = (key, cap) => h('figure', { class: 'mb-photo' }, img(key), cap ? h('figcaption', null, cap) : null);

  /** 2.6.1：可以轉乘光瀨都市鉄道的車站，直接從快照算出來，不寫死：
   *  ・同一座車站（單軌站本身也有鉄道路線停靠，例：紫市）
   *  ・站外步行轉乘（site-config.js 的 walkLinks，例：スカイツリー公園〜みつせ）
   *  ・CFG.monoExtraTransfers：還沒進快照、但已經確定的轉乘（例：延伸後的多見瀨）；
   *    等快照裡單軌真的停靠該站之後，上面兩條會自動接手，這裡的設定會被忽略，不會重覆。 */
  function transferList(H, M) {
    const CFG = (root.HK && root.HK.CFG) || {};
    const nm = id => { const s = H.stById[id]; return s ? s.zh : id; };
    const out = [], seen = new Set();
    M.order.forEach(id => {
      const xf = transfersAt(H, id);
      if (!xf.length) return;
      seen.add(nm(id));
      out.push({ at: nm(id), kind: 'same', lines: xf });
    });
    (H.walkLinks || []).forEach(w => {
      const onMono = M.ids.has(w.a) ? w.a : M.ids.has(w.b) ? w.b : null;
      if (onMono == null) return;
      const other = onMono === w.a ? w.b : w.a;
      if (M.ids.has(other)) return;                       // 兩端都是單軌站：不是轉乘
      const key = nm(onMono) + '>' + nm(other);
      if (seen.has(key)) return;
      seen.add(key); seen.add(nm(onMono));
      out.push({ at: nm(onMono), kind: 'walk', to: nm(other), sec: w.sec, lines: transfersAt(H, other) });
    });
    (CFG.monoExtraTransfers || []).forEach(x => {
      if (!x || !x.station || seen.has(x.station) || [...seen].some(k => normSt(k) === normSt(x.station))) return;   // 2.9.0：多見瀬／多見瀨 視為同一站
      seen.add(x.station);
      out.push({ at: x.station, kind: 'future', lines: x.lines || [] });
    });
    return out;
  }
  /** 轉乘說明的一行字（「紫市（同一車站）」這種）。 */
  function transferText(t) {
    if (t.kind === 'walk') return t.at + '〜' + t.to + '（站外步行轉乘 約 ' + Math.round((t.sec || 300) / 60) + ' 分）';
    if (t.kind === 'future') return t.at + '（延伸後開始轉乘）';
    return t.at + '（同一車站）';
  }

  /** 首頁橫幅：大照片＋這條線的來歷。2018 年停運、2026 年由市交通局接手重新出發。 */
  function heroCard(H, M) {
    const box = text('div', 'mb-hero');
    const xf = transferList(H, M);
    box.append(
      h('div', { class: 'pic' }, img('hero', 'eager'),
        h('div', { class: 'ov' },
          text('div', 'sm', 'HIKARISE MONORAIL'),
          h('h1', null, M.lineName || '光瀨都市單軌南北線'))),
      h('div', { class: 'txt' },
        h('p', null, '2006 年 12 月通車的這條線，在 2018 年因為經營不善停止營運，月台空了八年。2026 年，光瀨市交通局接手，讓它重新出發——帶著這座城市一直沒有放棄的期待。'),
        h('div', { class: 'meta' },
          h('span', { class: 'chip' }, '全線 ' + M.order.length + ' 站'),
          h('span', { class: 'chip' }, '全線均一 ¥290'),
          h('span', { class: 'chip' }, '一日券 ¥800'),
          h('span', { class: 'chip' }, '光瀨都市鉄道 轉乘 ' + xf.length + ' 站'))));
    return box;
  }

  /** 沿革年表。 */
  function historyCard() {
    const rows = [
      ['2006.12', '光瀨都市單軌南北線　通車', 0],
      ['2018.03', '因經營不善全線停運', 0],
      ['2018—2026', '停運期間（設施僅維持保養）', 0],
      ['2026.11', '光瀨市交通局接手營運', 1],
      ['2026.12', '恢復營業運轉', 1]
    ];
    const ul = text('ul', 'mb-hist');
    rows.forEach(([d, t, on]) => ul.append(h('li', { class: on ? 'on' : '' }, h('time', null, d), h('span', null, t))));
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'History'), '沿革'), ul,
      text('div', 'mb-note', '八年的空白不是終點。光瀨市交通局接手之後，全線均一運賃、與光瀨都市鉄道共通的優惠票券，都是為了讓這條線重新成為市民的日常。'),
      photoBand('viaduct', '城跡旁的高架軌道梁。停運期間，這段軌道梁一直保留著。'));
    return card;
  }

  /** 早引きインデックス：把最常用的四個入口做成圖示磚（官製サイトの定番）。 */
  function quickIndex(go) {
    const items = [
      ['時刻表', 'Timetable', '時', 'timetable'],
      ['票價', 'Fares', '¥', 'fare'],
      ['路線圖・車站介紹', 'Stations', '駅', 'stations'],
      ['乘車指南', 'Guide', '案', 'guide'],
      ['HIKACARD', 'IC card', 'IC', 'ic']
    ];
    const box = text('div', 'mb-idx');
    items.forEach(([zh, en, ico, id]) => {
      const b = h('button', { type: 'button', onclick: () => go(id) },
        h('span', { class: 'ico' }, ico), h('span', null, zh), h('span', { class: 'en' }, en));
      box.append(b);
    });
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Quick index'), '快速索引'), box);
    return card;
  }

  /* ───────── 運行情報 ───────── */
  function tabStatus(H, M, el, go) {
    const now = H.nowSec();
    if (go) { el.append(heroCard(H, M)); el.append(quickIndex(go)); }
    const card = text('div', 'mb-card');
    const active = (H.activeTrains(now) || []).filter(a => a.sv.isLRT);
    const stDeps = M.order.map(id => {
      const ev = (H.departures(id) || []).filter(e => e.sv.isLRT && e.t >= now).sort((a, b) => a.t - b.t);
      return { id: id, next: ev.slice(0, 2) };
    });
    const running = active.length > 0;
    const anyToday = M.order.some(id => (H.departures(id) || []).some(e => e.sv.isLRT));
    card.append(
      text('div', 'mb-status' + (anyToday ? '' : ' warn'),
        text('span', 'dot'),
        h('div', null,
          h('b', null, !anyToday ? '本日無運行' : running ? '正常運行' : '目前沒有運行中的列車'),
          text('div', 'sub', anyToday ? '沒有誤點或停駛的資訊。' : '快照裡還沒有單軌的班次資料。'))),
      h('div', { class: 'mb-now', style: 'margin-top:10px' }, hm(now)));
    el.append(card);

    const c2 = text('div', 'mb-card');
    c2.append(h('h2', null, text('span', 'en', 'Trains in service'), '運行中的列車'));
    if (!active.length) c2.append(text('div', 'mb-empty', '目前沒有運行中的單軌列車。'));
    else {
      const rows = active.sort((a, b) => a.arr - b.arr).slice(0, 20).map(a => h('tr', null,
        h('td', null, '開往 ' + H.destOf(a.sv, a.i)),
        h('td', null, a.dwelling ? H.stName(a.from) + ' 停車中' : H.stName(a.from) + ' → ' + H.stName(a.to)),
        h('td', { class: 'num' }, hm(a.arr))));
      c2.append(text('div', 'mb-scroll', h('table', { class: 'mb-tb' },
        h('thead', null, h('tr', null, h('th', null, '終點站'), h('th', null, '現在位置'), h('th', null, '下站到達'))),
        h('tbody', null, ...rows))));
    }
    el.append(c2);

    const c3 = text('div', 'mb-card');
    c3.append(h('h2', null, text('span', 'en', 'Next departures'), '各站的下一班發車'));
    const rows = stDeps.map(x => h('tr', null,
      h('td', null, H.stName(x.id)),
      h('td', { class: 'num' }, x.next[0] ? hm(x.next[0].t) : '—'),
      h('td', null, x.next[0] ? '開往 ' + H.destOf(x.next[0].sv, x.next[0].i) : ''),
      h('td', { class: 'num' }, x.next[1] ? hm(x.next[1].t) : '')));
    c3.append(text('div', 'mb-scroll', h('table', { class: 'mb-tb' },
      h('thead', null, h('tr', null, h('th', null, '車站'), h('th', null, '下一班'), h('th', null, '終點站'), h('th', null, '再下一班'))),
      h('tbody', null, ...rows))));
    el.append(c3);
  }

  /* ───────── 時刻表 ───────── */
  function tabTimetable(H, M, el) {
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Timetable'), '時刻表'),
      text('p', 'lead', '選擇車站與方向，顯示該站一整天的發車時刻。紅色＝當日最終班車。'));
    const stSel = h('select', null, ...M.order.map(id => h('option', { value: id }, H.stName(id))));
    const dirWrap = text('div', 'mb-seg');
    let dir = 0;
    const body = text('div', null);
    const dirBtns = M.ends.map((endId, i) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: () => { dir = i; sync(); } }, H.stName(endId) + ' 方向');
      dirWrap.append(b);
      return b;
    });
    function sync() {
      dirBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === dir)));
      const id = stSel.value;
      const want = M.ends[dir];
      const idx = M.order.indexOf(id);
      const wantIdx = M.order.indexOf(want);
      const evs = (H.departures(id) || []).filter(e => {
        if (!e.sv.isLRT) return false;
        const stops = e.sv.stops;
        const nxt = stops[e.i + 1];
        if (!nxt) return false;
        const a = M.order.indexOf(stops[e.i].station), b = M.order.indexOf(nxt.station);
        if (a < 0 || b < 0) return false;
        return (b > a) === (wantIdx > idx || idx < 0);
      }).sort((a, b) => a.t - b.t);
      body.replaceChildren();
      if (!evs.length) { body.append(text('div', 'mb-empty', '這個方向沒有發車（可能是終點站，或快照裡還沒有單軌班次）。')); return; }
      const lastT = evs[evs.length - 1].t;
      const byHour = new Map();
      evs.forEach(e => { const hh = Math.floor((e.t % DAY) / 3600); if (!byHour.has(hh)) byHour.set(hh, []); byHour.get(hh).push(e); });
      [...byHour.keys()].sort((a, b) => a - b).forEach(hh => {
        const mins = byHour.get(hh).map(e => h('span', { class: 'mb-min' + (e.t === lastT ? ' last' : ''), title: '開往 ' + H.destOf(e.sv, e.i) }, pad(Math.floor(e.t % 3600 / 60))));
        body.append(h('div', { class: 'mb-hour' }, h('b', null, pad(hh)), h('div', null, ...mins)));
      });
      const fl = H.firstLast(evs.map(e => e.t % DAY));
      if (fl) body.append(text('div', 'mb-note', '首班 ' + hm(fl[0]) + '　／　末班 ' + hm(fl[1])));
    }
    stSel.addEventListener('change', sync);
    card.append(h('div', { class: 'mb-f' },
      h('div', null, h('label', null, '車站'), stSel),
      h('div', null, h('label', null, '方向'), dirWrap)), body);
    el.append(card);
    sync();
  }

  /* ───────── 運賃 ───────── */
  function tabFare(H, M, el) {
    const FLAT = (root.HK_CONFIG && root.HK_CONFIG.monoFlatFare) || 290;
    const DAY1 = (root.HK_CONFIG && root.HK_CONFIG.monoDayPass) || 800;
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Fares'), '票價'),
      text('p', 'lead', '光瀨都市單軌為全線均一票價。不論從哪一站搭到哪一站都是同一個金額，不需要在意區間。'));
    card.append(h('div', { class: 'mb-result' },
      h('div', null, '全線均一　成人'),
      h('div', { class: 'big' }, '¥' + FLAT.toLocaleString()),
      text('div', 'sub', '兒童半價（¥' + Math.round(FLAT / 2).toLocaleString() + '）／ IC 卡與現金同價')));
    card.append(h('div', { class: 'mb-scroll', style: 'margin-top:16px' }, h('table', { class: 'mb-tb' },
      h('thead', null, h('tr', null, h('th', null, '車票'), h('th', null, '成人'), h('th', null, '內容'))),
      h('tbody', null,
        h('tr', null, h('td', null, '普通車票'), h('td', { class: 'num' }, '¥' + FLAT.toLocaleString()), h('td', null, '全線不分區間均一')),
        h('tr', null, h('td', null, '一日券'), h('td', { class: 'num' }, '¥' + DAY1.toLocaleString()), h('td', null, '當日單軌全線無限搭乘')),
        h('tr', null, h('td', null, '光瀨都市鉄道的優惠票券'), h('td', { class: 'num' }, '—'),
          h('td', null, '一日券・三日券・五日券・七日券・地區周遊券全部都含單軌無限搭乘（不需加價）'))))));
    card.append(text('div', 'mb-note', '鉄道與單軌轉乘時，在鉄道的分區票價上加計單軌的 ¥' + FLAT.toLocaleString() + '。持有優惠票券的旅客不需加計。'));
    el.append(card);
  }

  /* ───────── 駅案內 ───────── */
  /* 2.9.0：站點 LOGO（每站一個極簡圖示，取材自站名或周邊地標；參考東部丘陵線的做法）。
   * 64×64 的 SVG 線條，顏色跟著 currentColor；沒有登錄的站顯示站名第一個字。 */
  const LOGO = {
    '紫市': '<circle cx="32" cy="19" r="7"/><circle cx="44.4" cy="28" r="7"/><circle cx="39.6" cy="42.5" r="7"/><circle cx="24.4" cy="42.5" r="7"/><circle cx="19.6" cy="28" r="7"/><circle cx="32" cy="32" r="3"/>',
    '紫市工業団地': '<path d="M10 50 V30 L20 36 V30 L30 36 V30 L40 36 V16 H48 V50 Z"/><path d="M16 44 H22 M28 44 H34"/>',
    '栗田': '<path d="M32 13 C22 23 14 30 14 40 C14 47 22 51 32 51 C42 51 50 47 50 40 C50 30 42 23 32 13 Z"/><path d="M15 41 C24 44 40 44 49 41"/>',
    '船井大島城跡前': '<path d="M18 52 V42 H46 V52"/><path d="M13 42 L21 34 H43 L51 42"/><path d="M24 34 V28 H40 V34"/><path d="M20 28 L28 20 H36 L44 28"/><path d="M32 20 V13"/>',
    '病院前': '<path d="M26 14 H38 V26 H50 V38 H38 V50 H26 V38 H14 V26 H26 Z"/>',
    'スカイツリー公園': '<path d="M32 16 L25 52 M32 16 L39 52 M27.5 42 H36.5 M29.5 30 H34.5"/><circle cx="32" cy="12" r="3"/><path d="M38 9 L52 3 M40 14 L50 11"/>',
    '多見瀨': '<path d="M8 24 q6 -7 12 0 t12 0 t12 0 t12 0"/><path d="M8 34 q6 -7 12 0 t12 0 t12 0 t12 0"/><path d="M8 44 q6 -7 12 0 t12 0 t12 0 t12 0"/>',
    '西見沼': '<path d="M8 40 H56"/><path d="M14 40 A10 10 0 0 1 34 40"/><path d="M44 40 V20 M50 40 V25"/><ellipse cx="44" cy="20" rx="2" ry="5"/><ellipse cx="50" cy="25" rx="2" ry="5"/><path d="M14 48 H30 M36 48 H48"/>',
    '八幡通': '<path d="M10 17 Q32 23 54 17"/><path d="M15 26 H49"/><path d="M21 19 V52 M43 19 V52"/><path d="M32 20 V26"/>',
    '箱野': '<path d="M32 12 L51 22 V44 L32 54 L13 44 V22 Z"/><path d="M13 22 L32 32 L51 22 M32 32 V54"/>',
    '箱野山口': '<path d="M6 50 L24 20 L34 35 L42 25 L58 50 Z"/><path d="M28 50 C30 44 34 42 32 36" stroke-dasharray="3 4"/>'
  };
  const normSt = z => String(z || '').replace(/瀬/g, '瀨').replace(/\s+/g, '');
  function logo(zh, cls) {
    const box = h('span', { class: 'mb-logo-st' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    const inner = LOGO[normSt(zh)];
    if (!inner) { box.textContent = String(zh || '').slice(0, 1); box.classList.add('txt'); return box; }
    box.innerHTML = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    return box;
  }

  function tabStations(H, M, el) {
    const CFG = (root.HK && root.HK.CFG) || root.HK_CONFIG || {};
    const info = CFG.monoStationInfo || {};
    const infoOf = zh => info[zh] || info[Object.keys(info).find(k => normSt(k) === normSt(zh))] || null;
    const future = (CFG.monoFuture || []).filter(zh => !M.order.some(id => normSt(H.stName(id)) === normSt(zh)));
    const total = M.order.length + future.length;
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Route map & stations'), '路線圖・車站介紹'),
      text('p', 'lead', M.lineName + '　' + (M.order.length ? H.stName(M.order[0]) + '　〜　' + H.stName(M.order[M.order.length - 1]) : '') + '　營業中 ' + M.order.length + ' 站' + (future.length ? '（延伸區間 ' + future.length + ' 站建設中，全線 ' + total + ' 站）' : '')),
      text('p', 'mb-note', '每一站都有自己的站點標誌，取材自站名或車站周邊的地標，在月台與站名標上都看得到。'));
    const xfAll = transferList(H, M);
    const ul = text('ul', 'mb-line mb-line2');
    M.order.forEach(id => {
      const st = H.stById[id];
      const zh = st ? st.zh : id;
      const xf = xfAll.filter(t => normSt(t.at) === normSt(zh));
      const codes = H.codes ? H.codes(id) : [];
      const inf = infoOf(zh);
      const li = h('li', { class: xf.length ? 'xfer' : '' },
        text('span', 'pin'),
        h('div', { class: 'mb-st' },
          logo(zh),
          h('div', { class: 'mb-st-body' },
            h('span', { class: 'nm' }, codes.length ? h('span', { class: 'mb-code' }, H.codeText(id)) : null, zh),
            st && st.en ? text('span', 'en', st.en) : null,
            xf.length ? text('div', 'sub', '轉乘：' + xf.map(transferText).join('、')) : null,
            inf && inf.text ? text('p', 'mb-st-txt', inf.text) : null,
            inf && inf.notice ? h('p', { class: 'mb-st-notice' }, h('b', null, '整修公告'), inf.notice) : null),
          inf && inf.photo && PHOTO[inf.photo] ? h('figure', { class: 'mb-st-pic' }, img(inf.photo)) : null));
      ul.append(li);
    });
    future.forEach(zh => ul.append(h('li', { class: 'future' },
      text('span', 'pin'),
      h('div', { class: 'mb-st' }, logo(zh, 'future'),
        h('div', { class: 'mb-st-body' }, h('span', { class: 'nm' }, zh), text('div', 'sub', '延伸區間・建設中'))))));
    if (!M.order.length) card.append(text('div', 'mb-empty', '快照裡還沒有單軌路線。在遊戲（MTR）裡把路線類型設成「輕軌（LIGHT_RAIL）」並重新匯出快照後，這裡就會出現。'));
    else card.append(ul);
    if (xfAll.length) {
      const note = text('div', 'mb-note');
      note.append(h('b', null, '與光瀨都市鉄道的轉乘'));
      const xul = text('ul', 'mb-xfer');
      xfAll.forEach(t => xul.append(h('li', null,
        h('span', { class: 'nm' }, transferText(t)),
        t.lines.length ? text('span', 'ln', t.lines.join('、')) : null)));
      note.append(xul);
      card.append(note);
    }
    card.append(photoBand('river', '河岸上空的軌道梁。冬天的傍晚，兩條軌道梁一起倒映在河面上。'));
    el.append(card);
  }

  /* ───────── ご利用案内（乘車指南＋乘車券案內） ───────── */
  function tabGuide(H, M, el) {
    el.append(historyCard());
    const g = text('div', 'mb-grid');
    g.append(
      h('div', { class: 'mb-card' },
        h('h2', null, text('span', 'en', 'First time riding'), '第一次搭乘的旅客'),
        h('ol', null,
          h('li', null, '在自動售票機購買車票，或在剪票口感應 HIKACARD 進站。'),
          h('li', null, '月台的發車案內會顯示終點站與「即將進站／○分後」。'),
          h('li', null, '單軌為懸垂式，車輛懸吊在軌道梁下方行駛，起步與停止較平穩。'),
          h('li', null, '到站後再次感應 IC 卡出站；票價於出站時結算。'))),
      h('div', { class: 'mb-card' },
        h('h2', null, text('span', 'en', 'Accessibility'), '無障礙設施'),
        h('ul', null,
          h('li', null, '各站均設有電梯連接地面層與月台層。'),
          h('li', null, '車內每節設有輪椅・嬰兒車空間。'),
          h('li', null, '需要協助時請在搭乘前告知站務人員。'))),
      h('div', { class: 'mb-card' },
        h('h2', null, text('span', 'en', 'Tickets'), '乘車券案內'),
        h('table', { class: 'mb-tb' },
          h('tbody', null,
            h('tr', null, h('th', null, '普通車票'), h('td', null, '全線均一 ¥290（小人半額）。')),
            h('tr', null, h('th', null, 'IC 卡'), h('td', null, 'HIKACARD（¥1,500，內含儲值 ¥500）。與光瀨都市鉄道共通，進出站感應即可。', h('a', { href: '#ic' }, '詳細介紹'))),
            h('tr', null, h('th', null, '一日券'), h('td', null, '¥800。當日單軌全線不限次數搭乘，於各站售票機發售。')),
            h('tr', null, h('th', null, '定期券'), h('td', null, '通勤・通學定期於各站窗口辦理。')))),
        text('div', 'mb-note', '光瀨都市鉄道的一日券・三日券・五日券・七日券與地區周遊券，全部都含單軌的無限搭乘，不需另外購票。線上訂票僅適用於鉄道的指定席列車；單軌全車自由席，不需劃位。')));
    el.append(g);
  }

  /* ───────── 車両紹介 ───────── */
  /** 2.9.0：懸垂式單軌的構造圖解（SVG，文字可翻譯）。 */
  function suspendedDiagram() {
    const fig = h('figure', { class: 'mb-diagram' });
    const svg = '<svg viewBox="0 0 640 360" role="img" aria-label="懸垂式單軌的構造：軌道梁在上，台車在梁內行駛，車體吊在下方">' +
      '<rect x="0" y="0" width="640" height="360" fill="#f5faff"/>' +
      // 支柱
      '<path d="M96 350 V70 H250" fill="none" stroke="#8a97a8" stroke-width="18" stroke-linejoin="round"/>' +
      // 軌道梁（下方開口的箱型）
      '<path d="M250 52 H430 V128 H352 V112 H404 V68 H276 V112 H328 V128 H250 Z" fill="#5f6f82"/>' +
      // 台車＋車輪
      '<rect x="292" y="80" width="96" height="22" rx="4" fill="#15559c"/>' +
      '<circle cx="306" cy="76" r="9" fill="#1d2733"/><circle cx="374" cy="76" r="9" fill="#1d2733"/>' +
      '<circle cx="284" cy="92" r="6" fill="#1d2733"/><circle cx="396" cy="92" r="6" fill="#1d2733"/>' +
      // 懸垂連結
      '<rect x="331" y="102" width="18" height="52" fill="#15559c"/>' +
      // 車體
      '<rect x="252" y="154" width="176" height="150" rx="34" fill="#ffffff" stroke="#15559c" stroke-width="6"/>' +
      '<rect x="270" y="186" width="58" height="44" rx="8" fill="#cfe2f6"/><rect x="352" y="186" width="58" height="44" rx="8" fill="#cfe2f6"/>' +
      '<rect x="252" y="252" width="176" height="10" fill="#15559c"/>' +
      // 月台
      '<rect x="440" y="282" width="190" height="22" fill="#c8d3df"/><rect x="440" y="226" width="10" height="56" fill="#9fb0c3"/>' +
      // 標註線
      '<g stroke="#0a2b59" stroke-width="2" fill="none"><path d="M430 60 H470"/><path d="M388 90 H470"/><path d="M349 128 H470"/><path d="M428 200 H470" transform="translate(0,0)"/><path d="M96 200 H150"/></g>' +
      '</svg>';
    fig.innerHTML = svg;
    const lab = (x, y, t, anchor) => h('span', { class: 'mb-dg-l', style: 'left:' + x + '%;top:' + y + '%' + (anchor === 'r' ? ';transform:translate(-100%,-50%)' : ';transform:translate(0,-50%)') }, t);
    fig.append(
      lab(74.5, 16.7, '軌道梁：下方開口的鋼製箱型梁'),
      lab(74.5, 25, '台車：走行輪與案內輪都藏在梁裡'),
      lab(74.5, 35.6, '懸垂連結：把車體吊在台車下方'),
      lab(74.5, 55.6, '車體'),
      lab(24.5, 55.6, '支柱'),
      h('figcaption', null, '懸垂式單軌的車輛吊在軌道梁「下方」行駛。車輪在梁內，不受雨雪影響，也不會碰到地面的車流；轉彎時車體會自然地微微擺動。'));
    return fig;
  }

  function tabFleet(H, M, el) {
    const CFG = (root.HK && root.HK.CFG) || root.HK_CONFIG || {};
    const F = CFG.monoFleet || {};
    const row = (k, v) => v ? h('tr', null, h('th', null, k), h('td', null, v)) : null;
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Rolling stock'), '車輛介紹'),
      text('p', 'lead', (F.model || '懸垂式單軌車輛') + '。前頭部標記為 HIKARISE CITY MOVER。'),
      h('figure', { class: 'mb-shot big' }, img('front'),
        h('figcaption', null, '停靠月台的先頭部。車頭下方標記 HIKARISE CITY MOVER。')),
      h('table', { class: 'mb-tb', style: 'margin-top:14px' },
        h('tbody', null,
          row('形式', F.model),
          row('營運速度', F.speed),
          row('編組', F.cars),
          row('最大乘載人數', F.capacity),
          row('登場年', F.debut),
          row('方式', '懸垂式單軌（Suspended monorail）'),
          row('塗裝', '白色車體＋藍色腰帶'),
          row('案內顯示', '車內 LCD・月台 LCD（ATOS 連動）'))),
      h('h3', { class: 'mb-h3' }, '懸垂式單軌是什麼？'),
      suspendedDiagram(),
      h('div', { class: 'mb-shots' },
        h('figure', { class: 'mb-shot' }, img('sunset'), h('figcaption', null, '從正下方看懸垂式單軌：車體吊在軌道梁下。')),
        h('figure', { class: 'mb-shot' }, img('platform'), h('figcaption', null, '月台上的先頭部與發車案內。')),
        h('figure', { class: 'mb-shot' }, img('street'), h('figcaption', null, '十字路口上空的軌道梁。'))));
    el.append(card);
  }

  /* ───────── HIKACARD ───────── */
  function tabIC(H, M, el) {
    const card = text('div', 'mb-card');
    if (root.HK.hikacardSection) card.append(root.HK.hikacardSection(H, { side: 'mono' }));
    else card.append(h('p', null, 'HIKACARD 的介紹暫時無法顯示。'));
    el.append(card);
  }

  /* ───────── お知らせ ───────── */
  async function newsInto(el) {
    let list = null;
    try {
      const r = await fetch('data/mono-news.json', { cache: 'no-store' });
      if (r.ok) list = await r.json();
    } catch (e) { /* 沒有這個檔案就用預設 */ }
    if (!Array.isArray(list) || !list.length) return;
    const card = text('div', 'mb-card');
    card.append(h('h2', null, text('span', 'en', 'Notices'), '公告'));
    const ul = text('ul', 'mb-news');
    list.slice(0, 8).forEach(n => ul.append(h('li', null,
      h('time', null, n.date || ''),
      n.tag ? h('span', { class: 'tag' }, n.tag) : null,
      h('span', null, n.title || ''))));
    card.append(ul);
    el.prepend(card);
  }

  /* ───────── 啟動 ───────── */
  const TABS = [
    { id: 'status', zh: '運行情報', en: 'Service', fn: tabStatus },
    { id: 'timetable', zh: '時刻表', en: 'Timetable', fn: tabTimetable },
    { id: 'fare', zh: '票價', en: 'Fares', fn: tabFare },
    { id: 'stations', zh: '車站介紹', en: 'Stations', fn: tabStations },
    { id: 'guide', zh: '乘車指南', en: 'Guide', fn: tabGuide },
    { id: 'fleet', zh: '車輛介紹', en: 'Fleet', fn: tabFleet },
    { id: 'ic', zh: 'HIKACARD', en: 'IC card', fn: tabIC },
    { id: 'bus', zh: '公車', en: 'City bus', fn: (H, M, el) => (HK.Bus ? HK.Bus.tab(H, M, el) : el.append(h('div', { class: 'mb-card' }, h('p', null, '公車資料暫時無法顯示。')))) }   // 2.10.0
  ];

  async function boot() {
    const tabsEl = document.getElementById('mbTabs'), host = document.getElementById('mbPanels');
    if (!tabsEl || !host) return;
    let H, M;
    try {
      H = await HK.load();
      M = monoOf(H);
    } catch (e) {
      host.replaceChildren(h('div', { class: 'mb-card' }, h('h2', null, '資料暫時無法顯示'), h('p', null, '載入快照時發生問題，請稍後再試。')));
      return;
    }
    const panels = new Map();
    const btns = TABS.map(t => {
      const b = h('button', { class: 'mb-tab', type: 'button', role: 'tab', 'aria-selected': 'false', id: 'tab-' + t.id },
        t.zh, h('span', { class: 'en' }, t.en));
      b.addEventListener('click', () => select(t.id, true));
      tabsEl.append(b);
      return b;
    });
    function select(id, push) {
      const i = Math.max(0, TABS.findIndex(t => t.id === id));
      const t = TABS[i];
      btns.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      panels.forEach((p, k) => { p.hidden = k !== t.id; });
      if (!panels.has(t.id)) {
        const p = h('div', { class: 'mb-panel', role: 'tabpanel', 'aria-labelledby': 'tab-' + t.id });
        panels.set(t.id, p);
        host.append(p);
        try { t.fn(H, M, p, id2 => select(id2, true)); } catch (e) { p.append(h('div', { class: 'mb-card' }, h('p', null, '這個分頁暫時無法顯示。'))); }
        if (t.id === 'status') newsInto(p);
        panels.forEach((q, k) => { q.hidden = k !== t.id; });
      }
      if (push && location.hash !== '#' + t.id) history.replaceState(null, '', '#' + t.id);
      document.title = t.zh + '｜光瀨市交通局 Hikarise Monorail';
    }
    root.addEventListener('hashchange', () => select((location.hash || '').slice(1) || 'status', false));
    select((location.hash || '').slice(1) || 'status', false);
    // 運行情報每 30 秒重畫（時刻會動）
    setInterval(() => {
      const p = panels.get('status');
      if (p && !p.hidden) { p.replaceChildren(); tabStatus(H, M, p, id2 => select(id2, true)); newsInto(p); }
    }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
