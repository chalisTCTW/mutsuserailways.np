/* pages2.js — 路線資訊、發車顯示、沿線景點（v6 新增）。
 * 資料全部來自 data/snapshot.json（與時刻表同一份，已套用調度方案）與 data/sights.json（景點文字與照片）。 */
(function () {
  'use strict';
  const HK = window.HK, { h, typeTag, typeMark } = HK;
  const DAY = 86400;
  const q = new URLSearchParams(location.search);
  const pad = n => String(n).padStart(2, '0');
  const hm = t => HK.hm(t);
  const normZh = z => String(z || '').replace(/戶/g, '戸').replace(/\s+/g, '');
  const stByName = (H, name) => H.stations.find(s => normZh(s.zh) === normZh(name)) || H.stations.find(s => normZh(s.zh).startsWith(normZh(name)));
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
  const stLink = (H, id, cls) => { const st = H.stById[id]; return st ? h('a', { href: 'timetable.html?s=' + encodeURIComponent(id), class: cls || null }, st.zh) : h('span', null, H.stName(id)); };
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
        const body = rowSt.map(s => h('tr', null, h('th', { scope: 'row' }, s.station && H.stName(s.station)), ...cols.map(c => h('td', { class: c.o === g ? 'cur' : null }, c.cover.has(s.station) ? (c.cover.get(s.station) ? '●' : '｜') : ''))));
        out.append(h('h3', { class: 'h3' }, '停車一覽（各種別比較）'), h('div', { class: 'tscroll' }, h('table', { class: 'matrix' }, h('thead', null, hd), h('tbody', null, body))), h('p', { class: 'note' }, '●＝停車，｜＝通過，空白＝不經過。欄名可點選切換路線。'));
      }
    }
    drawChips(); draw();
  }

  /* ───────── 發車顯示 ───────── */
  function dirKeyOf(H, sid, e) {
    const sv = e.sv, first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
    if (first === last) return { key: 'loop|' + sv.line + '|' + (sv.member.dir || ''), label: `${sv.line} ${sv.member.dir || '環狀'}` };
    let nextSt = last; for (let k = (e.i || 0) + 1; k < sv.stops.length; k++) if (sv.stops[k].pax !== false) { nextSt = sv.stops[k].station; break; }
    const p = H.shortestPath(sid, nextSt), nb = p && p.length > 1 ? p[1] : nextSt;
    return { key: 'nb|' + nb, label: null, nb };
  }
  function viewBoard(H, root) {
    let sid = q.get('s') || safeGet('hk-board-st');
    if (!sid || !H.stById[sid]) sid = (stByName(H, 'みつせ') || H.stations[0]).id;
    let dir = 'all';
    const sel = h('select', { 'aria-label': '車站' }, H.stations.map(s => h('option', { value: s.id }, s.zh)));
    sel.value = sid;
    sel.addEventListener('change', () => { sid = sel.value; dir = 'all'; safeSet('hk-board-st', sid); try { history.replaceState(null, '', '?s=' + encodeURIComponent(sid)); } catch (e) { } draw(); });
    const clock = h('div', { class: 'pids-clock', 'aria-hidden': 'true' });
    const title = h('div', { class: 'pids-st' });
    const dirs = h('div', { class: 'dirs pidsdirs', role: 'group', 'aria-label': '方向' });
    const list = h('div', { class: 'pids-list', 'aria-live': 'off' });
    root.append(h('div', { class: 'finder', style: 'margin-top:16px' }, h('form', { onsubmit: e => e.preventDefault(), style: 'grid-template-columns:minmax(0,320px)' }, field('車站', sel))),
      h('div', { class: 'pids' }, h('div', { class: 'pids-head' }, title, clock), dirs, list),
      h('p', { class: 'note' }, '依時刻表顯示這個車站接下來的發車。時刻為預定時刻，實際運轉狀況請以現場公告為準。' + (dispNote(H) ? ' ' + dispNote(H) : '')),
      h('p', { class: 'note' }, h('a', { href: 'timetable.html?s=' + encodeURIComponent(sid), id: 'tt-link' }, '查看這個車站的全日時刻表')));
    let lastMin = -1;

    function upcoming(nowS) {
      const all = (H.events.get(sid) || []).filter(e => e.t >= nowS - 0).slice(0, 80);
      return all;
    }
    function draw() {
      const st = H.stById[sid];
      title.replaceChildren(h('span', { class: 'pids-lab' }, '発車案内'), h('strong', null, st.zh), st.en ? h('small', null, st.en) : null);
      const lk = document.getElementById('tt-link'); if (lk) lk.href = 'timetable.html?s=' + encodeURIComponent(sid);
      lastMin = -1; tick(true);
    }
    function tick(force) {
      const nowS = H.nowSec(), d = new Date(Date.now() + 0);
      clock.textContent = `${pad(Math.floor(nowS / 3600))}:${pad(Math.floor(nowS % 3600 / 60))}:${pad(Math.floor(nowS % 60))}`;
      const mn = Math.floor(nowS / 60); if (!force && mn === lastMin) return; lastMin = mn;
      const evs = upcoming(nowS);
      const groups = new Map();
      evs.forEach(e => { const k = dirKeyOf(H, sid, e); const gg = groups.get(k.key) || groups.set(k.key, { key: k.key, label: k.label, nb: k.nb, n: 0, dests: new Map() }).get(k.key); gg.n++; const dn = H.destOf(e.sv, e.i); gg.dests.set(dn, (gg.dests.get(dn) || 0) + 1); e._k = k.key; });
      const gl = [...groups.values()];
      gl.forEach(gg => { if (!gg.label) { let best = null; gg.dests.forEach((n, dn) => { if (!best || n > best[1]) best = [dn, n]; }); gg.label = `${best ? best[0] : H.stName(gg.nb)}　方面`; } });
      gl.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ja'));
      if (dir !== 'all' && !groups.has(dir)) dir = 'all';
      dirs.replaceChildren(...[['all', '全部方向'], ...gl.map(g => [g.key, g.label])].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(dir === k), onclick: () => { dir = k; lastMin = -1; tick(true); } }, l)));
      const shown = evs.filter(e => dir === 'all' || e._k === dir).slice(0, 10);
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
    draw(); setInterval(() => tick(false), 1000);
  }

  /* ───────── 沿線景點 ───────── */
  async function viewSights(H, root) {
    let data = [];
    try { data = await HK.getJSON('data/sights.json'); } catch (e) { /* 下面顯示說明 */ }
    if (!data || !data.length) { root.append(h('div', { class: 'soonbox' }, h('h2', null, '景點資料暫時無法顯示'), h('p', null, '請稍後再試。'))); return; }
    root.append(h('p', { class: 'lead' }, '搭電車就能到的光瀨都市圈景點。每個景點都標示最近的車站，可以直接查時刻表或規劃乘車。'),
      h('nav', { class: 'lchips sjump', 'aria-label': '景點' }, data.map(d => h('a', { class: 'lchipbtn', href: '#' + d.id }, d.name))));
    data.forEach(d => {
      const st = stByName(H, d.station), id = st && st.id;
      let ph = 0; const main = h('img', { src: d.photos[0].src, alt: d.photos[0].alt, loading: 'lazy' }), cap = h('figcaption', null, d.photos[0].cap || '');
      const thumbs = d.photos.length > 1 ? h('div', { class: 'sthumbs' }, d.photos.map((p, k) => h('button', { type: 'button', 'aria-label': p.alt, 'aria-pressed': String(k === 0), onclick: ev => { main.src = p.src; main.alt = p.alt; cap.textContent = p.cap || ''; ev.currentTarget.parentNode.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k))); } }, h('img', { src: p.src, alt: '', loading: 'lazy' })))) : null;
      const lines = id ? chipLines(H, id, null) : [];
      root.append(h('article', { class: 'sight', id: d.id },
        h('figure', { class: 'sfig' }, main, cap, thumbs),
        h('div', { class: 'sbody' },
          h('div', { class: 'stag' }, d.tag),
          h('h2', null, d.name, h('small', null, `${d.kana}　${d.en}`)),
          h('p', { class: 'slead' }, d.lead),
          ...d.body.map(p => h('p', null, p)),
          h('ul', { class: 'spoints' }, d.points.map(p => h('li', null, p))),
          h('div', { class: 'snear' }, h('strong', null, '最近車站'), h('span', { class: 'sn' }, d.station), lines.length ? h('span', { class: 'sl' }, lines) : null,
            id ? h('div', { class: 'sbtns' },
              h('a', { class: 'btn sm', href: 'timetable.html?s=' + encodeURIComponent(id) }, '車站時刻表'),
              h('a', { class: 'btn sm ghost', href: 'board.html?s=' + encodeURIComponent(id) }, '發車顯示'),
              h('a', { class: 'btn sm ghost', href: 'timetable.html?tab=route&to=' + encodeURIComponent(id) }, '前往這裡')) : h('p', { class: 'note', style: 'margin:6px 0 0' }, '這個車站尚未收錄在目前的時刻表資料中。')))));
    });
  }

  Object.assign(HK, { viewLines, viewBoard, viewSights });
})(window);
