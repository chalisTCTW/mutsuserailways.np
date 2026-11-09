/* pages2.js — 路線資訊、發車顯示、沿線景點（v6 新增）。
 * 資料全部來自 data/snapshot.json（與時刻表同一份，已套用調度方案）與 data/sights.json（景點文字與照片）。 */
(function () {
  'use strict';
  const HK = window.HK, { h, typeTag, typeMark } = HK;
  const DAY = 86400;
  const q = new URLSearchParams(location.search);
  const pad = n => String(n).padStart(2, '0');
  const hm = t => HK.hm(t);
  const normZh = z => String(z || '').replace(/戶/g, '戸').replace(/澤/g, '沢').replace(/\s+/g, '');
  const stByName = (H, name) => H.stations.find(s => normZh(s.zh) === normZh(name)) || H.stations.find(s => normZh(s.zh).startsWith(normZh(name)));
  /* ───────── 車站介紹資料（data/stations.json） ───────── */
  let _sdP = null;
  function stationData() { if (!_sdP) _sdP = HK.getJSON('data/stations.json', true).then(d => { HK._sd = d || { stations: [] }; return HK._sd; }).catch(() => { HK._sd = { stations: [] }; return HK._sd; }); return _sdP; }
  const sdEntry = name => { const sd = HK._sd; if (!sd || !sd.stations || !name) return null; const n = normZh(name); return sd.stations.find(e => normZh(e.name) === n) || sd.stations.find(e => normZh(e.name).startsWith(n) || n.startsWith(normZh(e.name))) || null; };
  const stationHref = (H, name) => { const st = stByName(H, name); return 'station.html?' + (st ? 's=' + encodeURIComponent(st.id) : 'n=' + encodeURIComponent(name)); };
  stationData();
  const TORDER = { loc: 0, exp: 1, ltd: 2 };
  const dispNote = H => ({ offpeak: '目前採用離峰時段班次（部分列車停駛）。', night: '目前採用深夜時段班次（班次減少）。', recall: '目前為收車時段，不再發出新的班次。' }[H.dispatchNow] || '');
  const safeGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 無痕模式等，忽略 */ } };
  const field = (label, el) => h('label', { class: 'f' }, h('span', null, label), el);

  /** 起點之後第 i 站相對於起點發車的秒數。 */
  const relT = (sv, i) => sv.stops[i].arr - sv.stops[0].dep;

  /** 這個服務一天（0:00–24:00）內從起點發車的時刻（已套用調度）。 */
  function depTimes(H, sv) {
    const t0 = sv.stops[0].dep, out = [];
    for (const tr of H.trips) { if (tr.sv !== sv) continue; const t = tr.base + t0; if (t >= 0 && t < DAY) out.push(t); }
    return out.sort((a, b) => a - b);
  }
  function groupsOf(H) {
    const m = new Map();
    H.svcs.forEach(sv => {
      let g = m.get(sv.routeName);
      if (!g) m.set(sv.routeName, g = { name: sv.routeName, line: sv.line, type: sv.type, tcls: sv.tcls, color: sv.color, ink: sv.ink, svs: [], sv });
      g.svs.push(sv);
    });
    return [...m.values()].sort((a, b) => a.line.localeCompare(b.line, 'ja') || TORDER[a.tcls] - TORDER[b.tcls] || a.name.localeCompare(b.name, 'ja'));
  }
  function dirLabel(H, sv) {
    const first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
    if (first === last) return sv.member.dir || '環狀';
    return `${H.stName(first)} → ${H.stName(last)}`;
  }
  const stLink = (H, id, cls) => { const st = H.stById[id]; return st ? h('a', { href: 'timetable.html?s=' + encodeURIComponent(id), class: cls || null }, H.codeBadges(id), st.zh) : h('span', null, H.stName(id)); };
  const chipLines = (H, id, except) => {
    const seen = new Map();
    H.svcs.forEach(sv => { if (sv.routeName === except) return; if (sv.stops.some(s => s.station === id && s.pax !== false)) { if (!seen.has(sv.line)) seen.set(sv.line, sv.color); } });
    return [...seen.entries()].map(([line, col]) => h('span', { class: 'lchip', title: line }, h('i', { style: `background:${col}` }), line));
  };

  /* ───────── 路線資訊 ───────── */
  function viewLines(H, root) {
    const groups = groupsOf(H);
    let cur = groups.find(g => g.name === q.get('r')) || groups[0];
    let di = 0;
    const chips = h('div', { class: 'lchips', role: 'group', 'aria-label': '路線' });
    const out = h('div', { class: 'lineinfo' });
    root.append(h('p', { class: 'lead' }, '選擇路線，查看停靠站、各站所要時間、班距與首末班。時間依目前的時刻表（含調度方案）計算。'), chips, out);
    if (dispNote(H)) root.append(h('p', { class: 'note' }, dispNote(H)));

    function drawChips() {
      chips.replaceChildren(...groups.map(g => h('button', { type: 'button', class: 'lchipbtn', 'aria-pressed': String(g === cur), onclick: () => { cur = g; di = 0; draw(); drawChips(); try { history.replaceState(null, '', '?r=' + encodeURIComponent(g.name)); } catch (e) { } } },
        h('i', { style: `background:${g.color}` }), g.name)));
    }
    function draw() {
      out.replaceChildren();
      const g = cur, sv = g.svs[Math.min(di, g.svs.length - 1)];
      const st = sv.stops, tt = depTimes(H, sv);
      const pax = st.filter(s => s.pax !== false);
      const total = Math.round((st[st.length - 1].arr - st[0].dep) / 60);
      const ri = H.reserveLabel(sv), cars = H.carsOf(sv);
      out.append(h('div', { class: 'lhead', style: `border-left-color:${g.color}` },
        h('div', { class: 'lh-t' }, typeTag(sv), h('h2', null, g.name)),
        h('dl', { class: 'lh-s' },
          h('div', null, h('dt', null, '運行區間'), h('dd', null, dirLabel(H, sv))),
          h('div', null, h('dt', null, '停靠站'), h('dd', null, `${pax.length} 站`)),
          h('div', null, h('dt', null, '全程所要時間'), h('dd', null, `約 ${total} 分`)),
          h('div', null, h('dt', null, '首班／末班'), h('dd', null, tt.length ? `${hm(tt[0])}／${hm(tt[tt.length - 1])}（${H.stName(st[0].station)} 發車）` : '本日無班次')),
          h('div', null, h('dt', null, '本日班次'), h('dd', null, `${tt.length} 班`)),
          h('div', null, h('dt', null, '編組'), h('dd', null, `${cars} 両編成${ri ? '・' + ri : ''}`)))));
      if (g.svs.length > 1) out.append(h('div', { class: 'dirs', role: 'group', 'aria-label': '方向' }, g.svs.map((v, k) => h('button', { type: 'button', 'aria-pressed': String(k === di), onclick: () => { di = k; draw(); } }, dirLabel(H, v)))));

      // 停靠站
      const rows = [];
      st.forEach((s, i) => {
        const isPax = s.pax !== false;
        if (!isPax && !H.stById[s.station]) return;
        const first = i === 0, last = i === st.length - 1;
        const mins = first ? 0 : Math.round(relT(sv, i) / 60);
        rows.push(h('tr', { class: isPax ? null : 'pass' },
          h('td', { class: 'dot' }, h('i', { style: `background:${isPax ? g.color : '#fff'};border-color:${g.color}` })),
          h('td', { class: 'nm' }, stLink(H, s.station), isPax ? null : h('small', null, ' 通過'), !isPax ? null : (s.platformName ? h('small', null, ` ${s.platformName}番線`) : null)),
          h('td', { class: 'cn' }, isPax ? chipLines(H, s.station, g.name) : null),
          h('td', { class: 'tm' }, isPax ? (first ? '起點' : `${mins} 分`) : ''),
          h('td', { class: 'tm' }, isPax && !first ? hm(s.arr - st[0].dep + (tt[0] || 0)) : (isPax && first && tt.length ? hm(tt[0]) : ''))));
      });
      out.append(h('h3', { class: 'h3' }, '停靠站與所要時間'), h('div', { class: 'tscroll' }, h('table', { class: 'stoptbl' },
        h('thead', null, h('tr', null, h('th'), h('th', null, '車站'), h('th', null, '可轉乘'), h('th', null, '所要時間'), h('th', null, `首班列車的時刻`))), h('tbody', null, rows))));

      // 班距
      const bands = [['早晨', 5, 9], ['日間', 9, 16], ['傍晚', 16, 20], ['夜間', 20, 24], ['深夜', 0, 5]];
      const brow = bands.map(([nm, a, b]) => { const n = tt.filter(t => t >= a * 3600 && t < b * 3600).length; return h('tr', null, h('th', { scope: 'row' }, `${nm}　${a}–${b} 時`), h('td', null, `${n} 班`), h('td', null, n ? `約 ${Math.round((b - a) * 60 / n * 10) / 10} 分一班` : '—')); });
      const per = Array.from({ length: 24 }, (_, hh) => tt.filter(t => Math.floor(t / 3600) === hh).length), mx = Math.max(1, ...per);
      const bars = h('div', { class: 'hbars', role: 'img', 'aria-label': '每小時班次數' }, per.map((n, hh) => h('div', { class: 'hb', title: `${hh} 時：${n} 班` }, h('b', { style: `height:${Math.round(n / mx * 100)}%;background:${g.color}` }), h('span', null, hh % 3 === 0 ? String(hh) : ''))));
      out.append(h('h3', { class: 'h3' }, '班距'), h('div', { class: 'cols2' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '時段'), h('th', null, '班次'), h('th', null, '平均班距'))), h('tbody', null, brow)), h('div', null, h('p', { class: 'note', style: 'margin:0 0 6px' }, '每小時的班次數（本日，從起點發車）'), bars)));

      // 停車一覽（與同區間的其他種別比較）
      const rowSt = st.filter(s => H.stById[s.station]);
      const cols = groups.filter(o => o !== g || true).map(o => {
        const cover = new Map(); o.svs.forEach(v => v.stops.forEach(s => { const p = s.pax !== false; if (!cover.has(s.station) || p) cover.set(s.station, p); }));
        return { o, cover, n: rowSt.filter(s => cover.has(s.station)).length };
      }).filter(c => c.n >= Math.min(3, rowSt.length));
      if (cols.length > 1) {
        const hd = h('tr', null, h('th'), ...cols.map(c => h('th', { class: c.o === g ? 'cur' : null }, h('a', { href: '?r=' + encodeURIComponent(c.o.name), onclick: e => { e.preventDefault(); cur = c.o; di = 0; draw(); drawChips(); try { history.replaceState(null, '', '?r=' + encodeURIComponent(c.o.name)); } catch (er) { } window.scrollTo(0, 0); } }, c.o.type ? typeMark(c.o.sv) + ' ' : '', c.o.name))));
        const body = rowSt.map(s => h('tr', null, h('th', { scope: 'row' }, s.station && H.codeBadges(s.station), s.station && H.stName(s.station)), ...cols.map(c => h('td', { class: c.o === g ? 'cur' : null }, c.cover.has(s.station) ? (c.cover.get(s.station) ? '●' : '｜') : ''))));
        out.append(h('h3', { class: 'h3' }, '停車一覽（各種別比較）'), h('div', { class: 'tscroll' }, h('table', { class: 'matrix' }, h('thead', null, hd), h('tbody', null, body))), h('p', { class: 'note' }, '●＝停車，｜＝通過，空白＝不經過。欄名可點選切換路線。'));
      }
    }
    drawChips(); draw();
  }

  /* ───────── 車站發車看板（點選路線圖上的車站時顯示的小視窗；0.7 起不再有獨立的「發車顯示」頁） ───────── */
  function dirKeyOf(H, sid, e) {
    const sv = e.sv, first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
    if (first === last) return { key: 'loop|' + sv.line + '|' + (sv.member.dir || ''), label: `${sv.line} ${sv.member.dir || '環狀'}` };
    let nextSt = last; for (let k = (e.i || 0) + 1; k < sv.stops.length; k++) if (sv.stops[k].pax !== false) { nextSt = sv.stops[k].station; break; }
    const p = H.shortestPath(sid, nextSt), nb = p && p.length > 1 ? p[1] : nextSt;
    return { key: 'nb|' + nb, label: null, nb };
  }
  /** 回傳 { el, stop }：el 是看板（每秒更新倒數），不用時呼叫 stop() 停止計時。 */
  function pidsBoard(H, sid, max) {
    max = max || 6;
    let dir = 'all', lastMin = -1, timer = null;
    const dirs = h('div', { class: 'dirs pidsdirs', role: 'group', 'aria-label': '方向' });
    const list = h('div', { class: 'pids-list', 'aria-live': 'off' });
    const clock = h('div', { class: 'pids-clock', 'aria-hidden': 'true' });
    const st0 = H.stById[sid];
    const title = h('div', { class: 'pids-st' }, h('span', { class: 'pids-lab' }, '発車案内'), h('strong', null, st0 ? H.codeBadges(st0.id) : null, st0 ? st0.zh : ''), st0 && st0.en ? h('small', null, st0.en) : null);
    const el = h('div', { class: 'pids compact' }, h('div', { class: 'pids-head' }, title, clock), dirs, list);
    function tick(force) {
      const nowS = H.nowSec();
      clock.textContent = `${pad(Math.floor(nowS / 3600))}:${pad(Math.floor(nowS % 3600 / 60))}:${pad(Math.floor(nowS % 60))}`;
      const mn = Math.floor(nowS / 60); if (!force && mn === lastMin) return; lastMin = mn;
      const evs = (H.events.get(sid) || []).filter(e => e.t >= nowS).slice(0, 80);
      const groups = new Map();
      evs.forEach(e => { const k = dirKeyOf(H, sid, e); const gg = groups.get(k.key) || groups.set(k.key, { key: k.key, label: k.label, nb: k.nb, n: 0, dests: new Map() }).get(k.key); gg.n++; const dn = H.destOf(e.sv, e.i); gg.dests.set(dn, (gg.dests.get(dn) || 0) + 1); e._k = k.key; });
      const gl = [...groups.values()];
      gl.forEach(gg => { if (!gg.label) { let best = null; gg.dests.forEach((n, dn) => { if (!best || n > best[1]) best = [dn, n]; }); gg.label = `${best ? best[0] : H.stName(gg.nb)}　方面`; } });
      gl.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ja'));
      if (dir !== 'all' && !groups.has(dir)) dir = 'all';
      dirs.replaceChildren(...[['all', '全部方向'], ...gl.map(g => [g.key, g.label])].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(dir === k), onclick: () => { dir = k; lastMin = -1; tick(true); } }, l)));
      const shown = evs.filter(e => dir === 'all' || e._k === dir).slice(0, max);
      if (!shown.length) { list.replaceChildren(h('div', { class: 'pids-empty' }, '這個車站沒有接下來的發車（可能是各路線的終點站，或已收車）。')); return; }
      list.replaceChildren(h('div', { class: 'pids-row pids-hd' }, h('span', null, '時刻'), h('span', null, '種別'), h('span', null, '行先'), h('span', null, '路線・備註'), h('span', { class: 'r' }, '發車まで')),
        ...shown.map((e, n) => {
          const sv = e.sv, wait = Math.floor(e.t - nowS), m = Math.floor(wait / 60);
          const stop = sv.stops[e.i], pf = stop && stop.platformName ? `${stop.platformName}番線` : '';
          const ri = H.reserveLabel(sv);
          const nx = wait < 60 ? 'まもなく' : m >= 60 ? `${Math.floor(m / 60)} 時間 ${m % 60} 分` : `${m} 分`;
          return h('div', { class: 'pids-row' + (n === 0 ? ' first' : '') + (wait < 60 ? ' soon' : '') },
            h('span', { class: 'tm' }, hm(e.t)),
            h('span', { class: 'ty' }, typeMark(sv) ? h('b', { class: 'mk ' + sv.tcls }, typeMark(sv)) : null, typeTag(sv)),
            h('span', { class: 'ds' }, `${H.destOf(sv, e.i)}`, h('small', null, ' 行')),
            h('span', { class: 'rt' }, sv.routeName, pf ? h('small', null, `　${pf}`) : null, ri ? h('small', { class: 'rs' }, `　${ri}`) : null),
            h('span', { class: 'r wt' }, nx));
        }));
    }
    tick(true); timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } tick(false); }, 1000);
    return { el, stop: () => clearInterval(timer) };
  }
  /** 點選路線圖車站後顯示的小視窗：停靠路線、接下來的發車、時刻表與乘車連結。 */
  let _pop = null;
  function stationPop(H, st, box) {
    if (_pop) { _pop.stop(); _pop = null; }
    const board = pidsBoard(H, st.id, 5); _pop = board;
    const lines = chipLines(H, st.id, null);
    box.hidden = false;
    box.replaceChildren(...[
      h('div', { class: 'pop-head' }, h('strong', null, H.codeBadges(st.id), st.zh), st.en ? h('span', { class: 'pop-en' }, st.en) : null, h('button', { type: 'button', class: 'pop-x', 'aria-label': '關閉', onclick: () => { board.stop(); box.hidden = true; } }, '×')),
      lines.length ? h('div', { class: 'pop-lines' }, h('span', null, '停靠路線'), ...lines) : null,
      board.el,
      h('div', { class: 'pop-btns' },
        sdEntry(st.zh) ? h('a', { class: 'btn sm', href: stationHref(H, st.zh) }, '車站介紹') : null,
        h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=station&s=' + encodeURIComponent(st.id) }, '這個車站的全日時刻表'),
        h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=route&from=' + encodeURIComponent(st.id) }, '從這裡出發'),
        h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=route&to=' + encodeURIComponent(st.id) }, '前往這裡')),
      dispNote(H) ? h('p', { class: 'note', style: 'margin:6px 0 0;padding:0 14px' }, dispNote(H)) : null].filter(Boolean));
  }

  /* ───────── 沿線景點（景點＋餐廳兩個分頁） ───────── */
  async function viewSights(H, root) {
    let data = [], dining = null;
    const sd = await stationData();
    try { data = await HK.getJSON('data/sights.json'); } catch (e) { /* 下面顯示說明 */ }
    try { dining = await HK.getJSON('data/dining.json'); } catch (e) { dining = null; }
    if (!data || !data.length) { root.append(h('div', { class: 'soonbox' }, h('h2', null, '景點資料暫時無法顯示'), h('p', null, '請稍後再試。'))); return; }
    const hasDining = !!(dining && dining.items && dining.items.length);
    const hasSt = !!(sd && sd.stations && sd.stations.length);
    const sightsBox = h('div', { id: 'tab-sights' }), diningBox = h('div', { id: 'tab-dining', hidden: true }), stBox = h('div', { id: 'tab-stations', hidden: true });
    const tabBtns = {};
    const mkTab = (key, label) => (tabBtns[key] = h('button', { type: 'button', role: 'tab', class: 'stab', 'aria-selected': 'false', onclick: () => show(key, true) }, label));
    function show(key, push) {
      if (key === 'dining' && !hasDining) key = 'sights'; if (key === 'stations' && !hasSt) key = 'sights';
      sightsBox.hidden = key !== 'sights'; diningBox.hidden = key !== 'dining'; stBox.hidden = key !== 'stations';
      Object.keys(tabBtns).forEach(k => tabBtns[k].setAttribute('aria-selected', String(k === key)));
      if (push) { try { history.replaceState(null, '', key === 'sights' ? location.pathname + location.search : '#' + key); } catch (e) { /* 忽略 */ } }
    }
    if (hasDining || hasSt) root.append(h('div', { class: 'stabs', role: 'tablist', 'aria-label': '分類' }, mkTab('sights', '景點'), hasDining ? mkTab('dining', '餐廳') : null, hasSt ? mkTab('stations', '車站介紹') : null));
    root.append(sightsBox, diningBox, stBox);
    if (hasSt) stationsTab(H, stBox, data, dining);

    /* ── 景點 ── */
    sightsBox.append(h('p', { class: 'lead' }, '搭電車就能到的光瀨都市圈景點。每個景點都標示最近的車站，可以直接查時刻表或規劃乘車。'),
      h('nav', { class: 'lchips sjump', 'aria-label': '景點' }, data.map(d => h('a', { class: 'lchipbtn', href: '#' + d.id, onclick: () => show('sights', false) }, d.name))));
    data.forEach(d => {
      const main = h('img', { src: d.photos[0].src, alt: d.photos[0].alt, loading: 'lazy' }), cap = h('figcaption', null, d.photos[0].cap || '');
      const thumbs = d.photos.length > 1 ? h('div', { class: 'sthumbs' }, d.photos.map((p, k) => h('button', { type: 'button', 'aria-label': p.alt, 'aria-pressed': String(k === 0), onclick: ev => { main.src = p.src; main.alt = p.alt; cap.textContent = p.cap || ''; ev.currentTarget.parentNode.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k))); } }, h('img', { src: p.src, alt: '', loading: 'lazy' })))) : null;
      // 最近車站可以有一個以上（例：平倉市革命紀念公園＝平倉公園西、東平倉）
      const names = d.stations && d.stations.length ? d.stations : [d.station];
      const nears = names.map(nm => {
        const st = stByName(H, nm), id = st && st.id, lines = id ? chipLines(H, id, null) : [];
        return h('div', { class: 'snear' }, h('strong', null, '最近車站'), h('span', { class: 'sn' }, id ? H.codeBadges(id) : null, nm), lines.length ? h('span', { class: 'sl' }, lines) : null,
          id || sdEntry(nm) ? h('div', { class: 'sbtns' },
            sdEntry(nm) ? h('a', { class: 'btn sm', href: stationHref(H, nm) }, '車站介紹') : null,
            id ? h('a', { class: 'btn sm ghost', href: 'timetable.html?s=' + encodeURIComponent(id) }, '車站時刻表') : null,
            id ? h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=map&s=' + encodeURIComponent(id) }, '路線圖與接下來的發車') : null,
            id ? h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=route&to=' + encodeURIComponent(id) }, '前往這裡') : null) : h('p', { class: 'note', style: 'margin:6px 0 0' }, '這個車站尚未收錄在目前的時刻表資料中。'));
      });
      sightsBox.append(h('article', { class: 'sight', id: d.id },
        h('figure', { class: 'sfig' }, main, cap, thumbs),
        h('div', { class: 'sbody' },
          h('div', { class: 'stag' }, d.tag),
          h('h2', null, d.name, h('small', null, `${d.kana}　${d.en}`)),
          h('p', { class: 'slead' }, d.lead),
          ...d.body.map(p => h('p', null, p)),
          h('ul', { class: 'spoints' }, d.points.map(p => h('li', null, p))),
          ...nears)));
    });

    /* ── 餐廳 ── */
    if (hasDining) {
      const lang = (window.HK_I18N && window.HK_I18N.lang) || 'ja';
      const T = dining.tiers, qs = new URLSearchParams(location.search);
      let tier = qs.get('tier') || 'all', sta = qs.get('station') || 'all';
      if (!T[tier]) tier = 'all'; if (sta !== 'all' && !dining.stations.includes(sta)) sta = 'all';
      const list = h('div', { class: 'dgrid' }), count = h('p', { class: 'dcount', 'aria-live': 'polite' });
      const tierBtns = {}, sel = h('select', { id: 'dstation', onchange: ev => { sta = ev.target.value; draw(); } },
        h('option', { value: 'all' }, '全部車站'), ...dining.stations.map(n => h('option', { value: n }, n)));
      sel.value = sta;
      const tierRow = h('div', { class: 'lchips dtier', role: 'group', 'aria-label': '價位' },
        ...['all', '1', '2', '3'].map(k => (tierBtns[k] = h('button', { type: 'button', class: 'lchipbtn', 'aria-pressed': String(k === tier), onclick: () => { tier = k; draw(); } }, k === 'all' ? '全部價位' : `${T[k].label}　${T[k].price}`))));
      const catalog = dining.items;
      function card(r) {
        const st = stByName(H, r.station), id = st && st.id;
        const blurb = lang === 'zh' ? r.zh : r.ja, genre = lang === 'en' && r.genreEn ? r.genreEn : r.genre;
        return h('article', { class: 'dcard t' + r.tier },
          h('div', { class: 'dhead' }, h('span', { class: 'dtag t' + r.tier }, T[r.tier].label), h('span', { class: 'dgenre' }, genre)),
          h('h3', null, r.name, h('small', null, r.kana)),
          h('p', { class: 'ddish' }, h('strong', null, '推薦'), r.dish),
          h('p', { class: 'dblurb' }, blurb),
          h('dl', { class: 'dinfo' },
            h('dt', null, '價位'), h('dd', null, r.price),
            h('dt', null, '最近車站'), h('dd', null, id ? H.codeBadges(id) : null, r.station, '（', r.walk, '）'),
            h('dt', null, '住址'), h('dd', null, r.address),
            h('dt', null, '營業時間'), h('dd', null, r.hours),
            h('dt', null, '公休'), h('dd', null, r.closed)),
          id ? h('div', { class: 'sbtns' }, h('a', { class: 'btn sm', href: 'timetable.html?s=' + encodeURIComponent(id) }, '車站時刻表'), h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=route&to=' + encodeURIComponent(id) }, '前往這裡')) : null);
      }
      function draw() {
        Object.keys(tierBtns).forEach(k => tierBtns[k].setAttribute('aria-pressed', String(k === tier)));
        sel.value = sta;
        const rows = catalog.filter(r => (tier === 'all' || String(r.tier) === tier) && (sta === 'all' || r.station === sta));
        list.replaceChildren(...(rows.length ? rows.map(card) : [h('p', { class: 'note' }, '沒有符合條件的餐廳。')]));
        count.textContent = `${rows.length} 間`;
        try { const q = new URLSearchParams(location.search); tier === 'all' ? q.delete('tier') : q.set('tier', tier); sta === 'all' ? q.delete('station') : q.set('station', sta); const s2 = q.toString(); history.replaceState(null, '', (s2 ? '?' + s2 : location.pathname) + (location.hash || '')); } catch (e) { /* 忽略 */ }
      }
      diningBox.append(h('p', { class: 'lead' }, '沿線各站附近的推薦餐廳，分成三個價位，可以依價位與車站篩選。'),
        h('div', { class: 'dfilter' }, tierRow, h('label', { class: 'f dsel' }, h('span', null, '車站'), sel), count),
        list, h('p', { class: 'note' }, '※ 店名、住址、價格與營業時間皆為虛構，價位為每人預算的概估。'));
      draw();
    }
    const hh = location.hash.slice(1), tb = (new URLSearchParams(location.search)).get('tab');
    show(hh === 'dining' || tb === 'dining' ? 'dining' : hh === 'stations' || tb === 'stations' ? 'stations' : 'sights', false);
    if (location.hash && !['#dining', '#stations'].includes(location.hash)) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView(), 50); }
  }


  /* ───────── 車站介紹：一覽（沿線景點頁的第三個分頁） ───────── */
  function sightsOfStation(data, name) { const n = normZh(name); return (data || []).filter(d => (d.stations && d.stations.length ? d.stations : [d.station]).some(x => normZh(x) === n || normZh(x).startsWith(n) || n.startsWith(normZh(x)))); }
  function photosOfStation(e, data) {
    if (e && e.photos && e.photos.length) return e.photos;
    const out = []; sightsOfStation(data, e.name).forEach(d => (d.photos || []).forEach(p => out.push({ src: p.src, alt: p.alt, cap: `${d.name}${p.cap ? '：' + p.cap : ''}` })));
    return out;
  }
  function stationsTab(H, box, data) {
    const sd = HK._sd, list = sd.stations.map(e => ({ e, st: stByName(H, e.name), ph: photosOfStation(e, data) }));
    list.sort((a, b) => (a.st ? 0 : 1) - (b.st ? 0 : 1) || a.e.name.localeCompare(b.e.name, 'ja'));
    const lineSet = new Map(); list.forEach(x => { if (x.st) H.svcs.forEach(sv => { if (sv.stops.some(t => t.station === x.st.id && t.pax !== false) && !lineSet.has(sv.line)) lineSet.set(sv.line, sv.color); }); });
    let line = 'all'; const grid = h('div', { class: 'dgrid stgrid' }), chips = h('div', { class: 'lchips', role: 'group', 'aria-label': '路線' });
    const servesLine = (st, ln) => st && H.svcs.some(sv => sv.line === ln && sv.stops.some(t => t.station === st.id && t.pax !== false));
    function draw() {
      chips.replaceChildren(h('button', { type: 'button', class: 'lchipbtn', 'aria-pressed': String(line === 'all'), onclick: () => { line = 'all'; draw(); } }, '全部路線'),
        ...[...lineSet.entries()].map(([ln, col]) => h('button', { type: 'button', class: 'lchipbtn', 'aria-pressed': String(line === ln), onclick: () => { line = ln; draw(); } }, h('i', { style: `background:${col}` }), ln)));
      const rows = list.filter(x => line === 'all' || servesLine(x.st, line));
      grid.replaceChildren(...(rows.length ? rows.map(x => {
        const e = x.e, st = x.st, lines = st ? chipLines(H, st.id, null) : [], sg = sightsOfStation(data, e.name);
        return h('a', { class: 'dcard stcard', href: stationHref(H, e.name) },
          x.ph.length ? h('img', { src: x.ph[0].src, alt: x.ph[0].alt || '', loading: 'lazy' }) : null,
          h('h3', null, st ? H.codeBadges(st.id) : null, st ? st.zh : e.name, st && st.en ? h('small', null, st.en) : null),
          lines.length ? h('div', { class: 'sl' }, lines) : null,
          e.intro && e.intro[0] ? h('p', { class: 'dblurb' }, e.intro[0]) : null,
          sg.length ? h('p', { class: 'note', style: 'margin:0' }, '附近景點：' + sg.map(d => d.name).join('、')) : null);
      }) : [h('p', { class: 'note' }, '沒有符合條件的車站。')]));
    }
    box.append(h('p', { class: 'lead' }, '各站的專屬介面：時刻表、停靠種別、月台、轉乘、附近的景點與餐廳。'), chips, grid); draw();
  }

  /* ───────── 車站專屬頁面（station.html?s=車站ID 或 ?n=車站名稱） ───────── */
  async function viewStationPage(H, root) {
    const sd = await stationData(); let data = []; try { data = await HK.getJSON('data/sights.json'); } catch (e) { /* 沒有景點資料也能顯示 */ }
    let dining = null; try { dining = await HK.getJSON('data/dining.json'); } catch (e) { dining = null; }
    const q = new URLSearchParams(location.search); let st = q.get('s') && H.stById[q.get('s')] || (q.get('n') ? stByName(H, q.get('n')) : null);
    const name = st ? st.zh : (q.get('n') || '');
    const e = sdEntry(name) || { name, intro: [] };
    if (!st && !name) { root.append(h('div', { class: 'soonbox' }, h('h2', null, '找不到這個車站'), h('p', null, h('a', { href: 'sights.html#stations' }, '回到車站介紹')))); return; }
    const ttl = (st ? st.zh : name) + '｜光瀨都市鉄道'; document.title = ttl;
    const sid = st && st.id, sg = sightsOfStation(data, name), photos = photosOfStation(e, data);
    const tr = (st && H.events.get(sid)) || [];
    const day = tr.filter(x => x.t >= 0 && x.t < H.DAY), first = day.length ? day[0].t : null, last = day.length ? day[day.length - 1].t : null;
    const lines = sid ? chipLines(H, sid, null) : [];

    /* 標題與照片 */
    let hero = null;
    if (photos.length) {
      const main = h('img', { src: photos[0].src, alt: photos[0].alt || '', loading: 'lazy' }), cap = h('figcaption', null, photos[0].cap || '');
      const thumbs = photos.length > 1 ? h('div', { class: 'sthumbs' }, photos.map((p, k) => h('button', { type: 'button', 'aria-label': p.alt || '', 'aria-pressed': String(k === 0), onclick: ev => { main.src = p.src; main.alt = p.alt || ''; cap.textContent = p.cap || ''; ev.currentTarget.parentNode.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k))); } }, h('img', { src: p.src, alt: '', loading: 'lazy' })))) : null;
      hero = h('figure', { class: 'sfig', style: 'margin:0' }, main, cap, thumbs);
    }
    const facts = h('dl', { class: 'sp-facts' });
    const fact = (k, v) => { if (v == null || v === '') return; facts.append(h('dt', null, k), h('dd', null, v)); };
    if (st) {
      fact('停靠路線', lines.length ? h('span', { class: 'sl' }, lines) : null);
      if (H.zonesConfigured) fact('票價分區', st.zones && st.zones.length ? `第 ${st.zones.join('・')} 區` : null);
      fact('首班／末班', first != null ? `${H.hm(first)}／${H.hm(last)}` : null);
      const wl = H.walkLinks.filter(w => w.a === sid || w.b === sid);
      fact('步行轉乘', wl.length ? wl.map(w => `${H.stName(w.a === sid ? w.b : w.a)}（約 ${Math.round(w.sec / 60)} 分）`).join('、') : null);
    }
    const btns = h('p', { class: 'sp-btns' }, sid ? [
      h('a', { class: 'btn', href: 'timetable.html?s=' + encodeURIComponent(sid) }, '全日時刻表'),
      h('a', { class: 'btn ghost', href: 'timetable.html?tab=route&from=' + encodeURIComponent(sid) }, '從這裡出發'),
      h('a', { class: 'btn ghost', href: 'timetable.html?tab=route&to=' + encodeURIComponent(sid) }, '前往這裡'),
      h('a', { class: 'btn ghost', href: 'timetable.html?tab=map&s=' + encodeURIComponent(sid) }, '路線圖')] : null, e.link ? h('a', { class: 'btn ghost', href: e.link.href }, e.link.label) : null);
    root.append(h('div', { class: 'crumb' }, h('a', { href: 'index.html' }, '首頁'), ' ＞ ', h('a', { href: 'sights.html#stations' }, '沿線景點與車站介紹'), ' ＞ ', st ? st.zh : name));
    root.append(h('section', { class: 'sp-hero' + (hero ? '' : ' nophoto') },
      h('div', null,
        h('div', { class: 'sp-name' }, h('h1', null, st ? st.zh : name), sid ? H.codeBadges(sid) : null),
        st && st.en ? h('p', { class: 'sp-sub' }, st.en) : null,
        ...(e.intro || []).map(t => h('p', { class: 'sp-intro' }, t)), facts.children.length ? facts : null, btns),
      hero));
    if (!st) root.append(h('p', { class: 'note' }, '這個車站尚未收錄在目前的時刻表資料中，所以還沒有時刻表與路線資料；新的路網快照上傳後會自動出現。'));

    const sec = (title, ...kids) => { const el = h('section', { class: 'sp-sec' }, h('h2', null, title), ...kids); root.append(el); return el; };

    if (st) {
      /* 接下來的發車 */
      const board = pidsBoard(H, sid, 5); sec('接下來的發車', board.el);
      const mo = new MutationObserver(() => { if (!board.el.isConnected) { board.stop(); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true });

      /* 各種別的停靠狀況 */
      const byRoute = new Map();
      tr.forEach(x => { if (x.t < 0 || x.t >= H.DAY) return; let g = byRoute.get(x.sv.routeName); if (!g) byRoute.set(x.sv.routeName, g = { sv: x.sv, n: 0, day: 0, dests: new Map(), first: x.t, last: x.t }); g.n++; if (x.t >= 36000 && x.t < 57600) g.day++; g.last = x.t; const dn = H.destOf(x.sv, x.i); g.dests.set(dn, (g.dests.get(dn) || 0) + 1); });
      if (byRoute.size) {
        const rows = [...byRoute.values()].sort((a, b) => b.n - a.n);
        sec('停靠的列車', h('div', { class: 'tblwrap' }, h('table', { class: 'sp-tbl' },
          h('thead', null, h('tr', null, h('th', null, '路線・種別'), h('th', null, '行先'), h('th', null, '日間每小時'), h('th', null, '一天的班數'), h('th', null, '首班／末班'))),
          h('tbody', null, rows.map(g => h('tr', null,
            h('td', null, h('i', { class: 'dot', style: `background:${g.sv.color}` }), g.sv.routeName),
            h('td', null, [...g.dests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(d => d[0]).join('、')),
            h('td', null, `${(g.day / 6).toFixed(g.day % 6 ? 1 : 0)} 班`), h('td', null, `${g.n} 班`), h('td', null, `${H.hm(g.first)}／${H.hm(g.last)}`)))))),
          h('p', { class: 'note', style: 'margin:6px 0 0' }, '依目前的時刻表（含調度方案）計算；日間為 10:00–16:00。')); }

      /* 月台與停車時間 */
      const byPf = new Map();
      H.svcs.forEach(sv => sv.stops.forEach((t, i) => { if (t.station !== sid || t.pax === false || !t.platformName) return; const k = String(t.platformName); let g = byPf.get(k); if (!g) byPf.set(k, g = { pf: k, routes: new Set(), dests: new Map(), dw: new Map() }); g.routes.add(sv.routeName); const dn = H.destOf(sv, i); g.dests.set(dn, (g.dests.get(dn) || 0) + 1); const dw = Math.round(t.dep - t.arr); g.dw.set(dw, (g.dw.get(dw) || 0) + 1); }));
      if (byPf.size) {
        const rows = [...byPf.values()].sort((a, b) => a.pf.localeCompare(b.pf, 'ja', { numeric: true }));
        const modeDw = g => [...g.dw.entries()].sort((a, b) => b[1] - a[1])[0][0];
        sec('月台', h('div', { class: 'tblwrap' }, h('table', { class: 'sp-tbl' },
          h('thead', null, h('tr', null, h('th', null, '月台'), h('th', null, '行先'), h('th', null, '路線・種別'), h('th', null, '停車時間'))),
          h('tbody', null, rows.map(g => h('tr', null, h('td', null, `${g.pf} 番線`), h('td', null, [...g.dests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(d => d[0]).join('、')), h('td', null, [...g.routes].join('、')), h('td', null, `${modeDw(g)} 秒`)))))));
      }

      /* 到主要車站所要時間 */
      const hubs = (sd.hubs || []).map(n => stByName(H, n)).filter(x => x && x.id !== sid);
      if (hubs.length) {
        const cards = hubs.map(hb => { const j = H.search(sid, hb.id, 10 * 3600, 1)[0]; return j ? h('a', { class: 'sp-hub', href: 'timetable.html?tab=route&from=' + encodeURIComponent(sid) + '&to=' + encodeURIComponent(hb.id) }, h('strong', null, hb.zh), `最快約 ${Math.round((j.arr - j.dep) / 60)} 分`) : null; }).filter(Boolean);
        if (cards.length) sec('到主要車站所要時間', h('div', { class: 'sp-ng' }, cards), h('p', { class: 'note', style: 'margin:6px 0 0' }, '以 10:00 之後最早的班次計算，不含站內步行與等車時間。'));
      }
    }

    /* 站內與出口補充（stations.json 的 facilities / exits，有填才顯示） */
    if (e.exits && e.exits.length) sec('出口', h('div', { class: 'sp-ex' }, e.exits.map(x => h('div', null, h('strong', null, x.name), x.note || ''))));
    if (e.facilities && e.facilities.length) sec('站內設施', h('div', { class: 'sp-fac' }, e.facilities.map(f => h('span', null, f))));

    /* 車站周邊 */
    const names = new Set([normZh(name)]); const rest = dining && dining.items ? dining.items.filter(r => names.has(normZh(r.station)) || normZh(r.station).startsWith(normZh(name)) || normZh(name).startsWith(normZh(r.station))) : [];
    if (sg.length || rest.length) {
      const lang = (window.HK_I18N && window.HK_I18N.lang) || 'ja', T = (dining && dining.tiers) || {};
      const kids = [];
      if (sg.length) kids.push(h('div', { class: 'sp-near' }, sg.map(d => h('a', { class: 'sp-card', href: 'sights.html#' + d.id }, d.photos && d.photos[0] ? h('img', { src: d.photos[0].src, alt: d.photos[0].alt || '', loading: 'lazy' }) : null, h('div', null, h('span', { class: 't s' }, '景點'), h('strong', null, d.name), d.lead)))));
      if (rest.length) {
        kids.push(h('h3', { class: 'sp-h3' }, '附近的餐廳'));
        kids.push(h('div', { class: 'dgrid' }, rest.sort((a, b) => a.tier - b.tier).map(r => h('article', { class: 'dcard t' + r.tier },
          h('div', { class: 'dhead' }, h('span', { class: 'dtag t' + r.tier }, (T[r.tier] || {}).label || ''), h('span', { class: 'dgenre' }, lang === 'en' && r.genreEn ? r.genreEn : r.genre)),
          h('h3', null, r.name, h('small', null, r.kana)), h('p', { class: 'ddish' }, h('strong', null, '推薦'), r.dish),
          h('dl', { class: 'dinfo' }, h('dt', null, '價位'), h('dd', null, r.price), h('dt', null, '營業時間'), h('dd', null, r.hours), h('dt', null, '公休'), h('dd', null, r.closed), h('dt', null, '住址'), h('dd', null, r.address))))));
        kids.push(h('p', { style: 'margin:10px 0 0' }, h('a', { class: 'btn sm ghost', href: 'sights.html?station=' + encodeURIComponent(rest[0].station) + '#dining' }, '到餐廳頁依價位篩選')));
      }
      sec('車站周邊', ...kids);
    }
    root.append(h('p', { style: 'margin:30px 0 0' }, h('a', { class: 'btn ghost', href: 'sights.html#stations' }, '回到車站介紹一覽')));
  }

  Object.assign(HK, { viewLines, viewSights, viewStationPage, stationData, stationHref, sdEntry, stationPop, pidsBoard, depTimes, groupsOf });
})(window);
