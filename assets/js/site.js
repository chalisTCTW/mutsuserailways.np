/* site.js — 各頁面的行為（首頁、時刻表／乘車／票價、即時列車動態）。 */
(function () {
  'use strict';
  const { h, s, $, $$, load, computeLayout, renderMap, typeTag, typeMark, fmtDate } = window.HK;
  const HKc = window.HK;
  const page = document.body.dataset.page;
  const app = $('#app');
  const q = new URLSearchParams(location.search);
  const hm = t => HKc.hm(t);
  const DAY = 86400;
  const yen = n => '¥' + Number(n).toLocaleString('en-US');

  function stationSelect(H, id, label, onChange) {
    const sel = h('select', { 'aria-label': label }, H.stations.map(st => h('option', { value: st.id }, st.zh)));
    if (id) sel.value = id;
    if (onChange) sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  const field = (label, el) => h('label', { class: 'f' }, h('span', null, label), el);

  /* ───────── 首頁 ───────── */
  function carousel() {
    const root = $('#hero'); if (!root) return;
    const slides = $$('.slide', root), ctl = $('.hero-ctl', root);
    let cur = 0, timer = null, paused = false;
    const btns = slides.map((_, i) => h('button', { type: 'button', 'aria-label': `${i + 1} 件目`, onclick: () => { go(i); restart(); } }, String(i + 1)));
    const pause = h('button', { type: 'button', 'aria-label': '自動切換 暫停／繼續', title: '自動切換 暫停／繼續', onclick: () => { paused = !paused; pause.textContent = paused ? '▶' : 'Ⅱ'; if (paused) clearInterval(timer); else restart(); } }, 'Ⅱ');
    ctl.append(...btns, pause);
    function go(i) { cur = (i + slides.length) % slides.length; slides.forEach((el, k) => { el.classList.toggle('on', k === cur); el.setAttribute('aria-hidden', k === cur ? 'false' : 'true'); }); btns.forEach((b, k) => b.setAttribute('aria-current', k === cur ? 'true' : 'false')); }
    function restart() { clearInterval(timer); if (!paused && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(cur + 1), 6500); }
    root.addEventListener('mouseenter', () => clearInterval(timer)); root.addEventListener('mouseleave', restart);
    root.addEventListener('focusin', () => clearInterval(timer)); root.addEventListener('focusout', restart);
    go(0); restart();
  }

  async function home(H) {
    carousel();
    // 快速查詢
    const fin = $('#finder');
    const tabs = [['st', '車站時刻表'], ['rt', '乘車・轉乘・票價查詢']];
    let cur = 'st';
    const bodySt = h('form', { action: 'timetable.html', method: 'get' }, h('input', { type: 'hidden', name: 'tab', value: 'station' }),
      field('車站', Object.assign(stationSelect(H, null, '車站'), { name: 's' })), h('span'), h('button', { class: 'btn', type: 'submit' }, '查詢時刻表'));
    const now = H.nowSec(), nowStr = hm(now);
    const fromSel = Object.assign(stationSelect(H, null, '出發站'), { name: 'from' }), toSel = Object.assign(stationSelect(H, null, '抵達站'), { name: 'to' });
    if (H.stations.length > 1) toSel.selectedIndex = Math.min(H.stations.length - 1, 1);
    const bodyRt = h('form', { action: 'timetable.html', method: 'get', class: 'v2' }, h('input', { type: 'hidden', name: 'tab', value: 'route' }),
      field('出發站', fromSel), field('抵達站', toSel), field('出發時刻', h('input', { type: 'time', name: 't', value: nowStr })), h('button', { class: 'btn', type: 'submit' }, '查詢'));
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const bodies = { st: bodySt, rt: bodyRt };
    function draw() { tabBar.replaceChildren(...tabs.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === cur), onclick: () => { cur = k; draw(); } }, l))); fin.classList.toggle('v2', cur === 'rt'); fin.querySelector('form')?.remove(); fin.append(bodies[cur]); }
    fin.replaceChildren(tabBar); draw();

    // 運行情報：以路線（線名）為單位。整修中的路線標示為暫停運轉。
    const by = new Map();
    H.net.routes.forEach(r => { const ln = r.displayZh; const e = by.get(ln) || { n: 0, ok: false }; e.n++; if (r.status !== 'maintenance') e.ok = true; by.set(ln, e); });
    const tb = $('#status tbody');
    [...by.entries()].sort((a, b) => (b[1].ok - a[1].ok) || a[0].localeCompare(b[0], 'ja')).forEach(([ln, e]) => tb.append(h('tr', null, h('td', null, ln), h('td', { class: e.ok ? 'ok' : 'stop' }, e.ok ? '平常運轉' : '整修中（暫停運轉）'))));
    const up = fmtDate(H.exportedAt); if (up) $('#status-note').textContent = `運行情報為時刻表資料記錄的狀態（資料時點 ${up}）。`;

    // 最新消息
    const news = await HKc.getJSON('data/news.json', true);
    const dl = $('#news');
    (news || []).forEach(n => dl.append(h('div', { class: 'row', id: n.id || null }, h('dt', null, n.date), h('dd', null, h('span', { class: 'cat' }, n.tag)), h('dd', null, n.href ? h('a', { href: n.href }, n.title) : n.title))));

    // 簡易路線圖
    const L = computeLayout(H), box = $('#minimap');
    renderMap(box, H, L, { fontSize: 13 });
    box.addEventListener('click', () => { location.href = 'live.html'; }); box.style.cursor = 'pointer';
  }

  /* ───────── 時刻表／乘車／票價 ───────── */
  function timetable(H) {
    let tab = q.get('tab') || 'station';
    const root = h('div'), tabsEl = h('div', { class: 'tabs', role: 'tablist' }), body = h('div');
    const TABS = [['station', '車站時刻表'], ['route', '乘車・轉乘查詢'], ['fare', '票價查詢'], ['map', '路線圖']];
    function drawTabs() { tabsEl.replaceChildren(...TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; try { history.replaceState(null, '', '?tab=' + k); } catch (e) { } drawTabs(); drawBody(); } }, l))); }
    function drawBody() { body.replaceChildren(); ({ station: viewStation, route: viewRoute, fare: viewFare, map: viewMap })[tab](H, body); }
    root.append(tabsEl, body); app.replaceChildren(root); drawTabs(); drawBody();
  }

  /** 方向分組：同一個「往哪個方向」的班次放在一起。 */
  function dirOf(H, sid, e) {
    const sv = e.sv, first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
    if (first === last) return { key: 'loop|' + sv.line + '|' + (sv.member.dir || ''), label: `${sv.line}　${sv.member.dir || '環狀'}` };
    const dest = last, p = H.shortestPath(sid, dest);
    const nb = p && p.length > 1 ? p[1] : dest;
    return { key: 'nb|' + nb, label: null, nb, dest };
  }

  function viewStation(H, root) {
    let sid = q.get('s') || (H.stations.find(x => x.zh === 'みつせ') || H.stations[0]).id;
    if (!H.stById[sid]) sid = H.stations[0].id;
    let dirKey = 'all', whole = false;
    const sel = stationSelect(H, sid, '車站', v => { sid = v; dirKey = 'all'; draw(); });
    const out = h('div');
    root.append(h('div', { class: 'finder', style: 'margin-top:16px' }, h('form', { onsubmit: e => e.preventDefault(), style: 'grid-template-columns:minmax(0,320px)' }, field('車站', sel))), out);

    function draw() {
      const evs = H.departures(sid);
      out.replaceChildren();
      const st = H.stById[sid];
      out.append(h('h2', { class: 'h2', style: 'margin-top:22px' }, st.zh, st.en ? h('small', null, st.en) : null));
      if (!evs.length) { out.append(h('p', { class: 'lead' }, '這個車站沒有發車的班次（可能是各路線的終點站）。')); return; }
      // 分組
      const groups = new Map();
      evs.forEach(e => {
        const d = dirOf(H, sid, e), k = d.key; let g = groups.get(k);
        if (!g) groups.set(k, g = { key: k, label: d.label, nb: d.nb, evs: [], dests: new Map() });
        g.evs.push(e); const dn = H.destOf(e.sv, e.i); g.dests.set(dn, (g.dests.get(dn) || 0) + 1);
        if (d.dest) g.far = g.far || d.dest;
      });
      const list = [...groups.values()];
      list.forEach(g => {
        if (!g.label) {
          // 以最遠的終點命名：同方向最多班次的終點
          let best = null; g.dests.forEach((n, dn) => { if (!best || n > best[1]) best = [dn, n]; });
          g.label = `${best ? best[0] : H.stName(g.nb)}　方面`;
        }
      });
      list.sort((a, b) => b.evs.length - a.evs.length || a.label.localeCompare(b.label, 'ja'));
      const dirs = h('div', { class: 'dirs', role: 'group', 'aria-label': '方向' }, [['all', '全部方向'], ...list.map(g => [g.key, g.label])].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(dirKey === k), onclick: () => { dirKey = k; draw(); } }, l)));
      out.append(dirs);
      const show = dirKey === 'all' ? list : list.filter(g => g.key === dirKey);
      out.append(h('div', { style: 'margin:0 0 10px;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center' },
        h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { whole = !whole; draw(); } }, whole ? '只看現在前後的時段' : '顯示全日時刻表'),
        h('span', { class: 'note', style: 'margin:0' }, whole ? '顯示全日的發車時刻。' : '顯示現在前後的時段（黃底為目前的時段）。')));
      show.forEach(g => out.append(timetableTable(H, g, whole)));
      // 圖例
      const types = new Map(); show.forEach(g => g.evs.forEach(e => { const k = e.sv.type || '各停'; if (!types.has(k)) types.set(k, e.sv); }));
      const leg = h('div', { class: 'tlegend' }, [...types.values()].map(sv => h('span', null, typeTag(sv))));
      out.append(leg);
      out.append(h('p', { class: 'note' }, '時刻為各班次在本站的發車時刻。方格內的「特」「快」標示特急類、急行・快速類班次，無標示者為各站停車；右上角小字為行先。'));
    }
    draw();
  }

  function timetableTable(H, g, whole) {
    const nowH = Math.floor(H.nowSec() / 3600);
    const dests = [...g.dests.keys()];
    const mark = new Map(); const used = new Set();
    dests.forEach(dn => { let m = ''; for (const ch of dn) { if (!used.has(ch) && /\S/.test(ch)) { m = ch; break; } } if (!m) m = dn[0]; used.add(m); mark.set(dn, m); });
    const rows = new Map();
    g.evs.forEach(e => { const t = Math.floor(e.t); const hr = Math.floor(t / 3600); if (!rows.has(hr)) rows.set(hr, []); rows.get(hr).push(e); });
    const hrs = [...rows.keys()].sort((a, b) => a - b);
    let lo = hrs[0], hi = hrs[hrs.length - 1];
    if (!whole) { const a = Math.max(lo, nowH - 1), b = Math.min(hi, nowH + 3); if (a <= b) { lo = a; hi = b; } else { lo = Math.max(lo, hi - 4); } }
    const body = h('tbody');
    for (let hr = lo; hr <= hi; hr++) {
      const es = (rows.get(hr) || []).sort((a, b) => a.t - b.t);
      body.append(h('tr', { class: hr === nowH ? 'now' : null }, h('th', { class: 'h', scope: 'row' }, String(hr)),
        h('td', { class: 'm' }, es.map(e => { const mn = Math.floor((e.t % 3600) / 60); const m = typeMark(e.sv); return h('span', { class: 'dep', title: `${e.sv.routeName} ${H.destOf(e.sv, e.i)}行` }, m ? h('b', { class: 'mk ' + e.sv.tcls }, m) : null, String(mn).padStart(2, '0'), g.dests.size > 1 ? h('sup', null, mark.get(H.destOf(e.sv, e.i))) : null); }))));
    }
    const dl = g.dests.size > 1 ? h('div', { class: 'tlegend' }, dests.map(dn => h('span', null, `${mark.get(dn)}＝${dn}行`))) : null;
    return h('div', { style: 'margin-bottom:18px' }, h('table', { class: 'ttable' }, h('thead', null, h('tr', null, h('th', { colspan: 2 }, g.label))), body), dl);
  }

  function viewRoute(H, root) {
    const from = q.get('from') && H.stById[q.get('from')] ? q.get('from') : H.stations[0].id;
    const to = q.get('to') && H.stById[q.get('to')] ? q.get('to') : H.stations[Math.min(1, H.stations.length - 1)].id;
    const tv = q.get('t') || hm(H.nowSec());
    const fSel = stationSelect(H, from, '出發站'), tSel = stationSelect(H, to, '抵達站'), tIn = h('input', { type: 'time', value: tv });
    const out = h('div', { style: 'margin-top:18px' });
    const swap = h('button', { class: 'btn ghost', type: 'button', onclick: () => { const a = fSel.value; fSel.value = tSel.value; tSel.value = a; go(); } }, '出發・抵達互換');
    const form = h('form', { class: 'finder v2', onsubmit: e => { e.preventDefault(); go(); } }, h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 130px auto auto;gap:10px 12px;align-items:end;padding:14px 16px' }, field('出發站', fSel), field('抵達站', tSel), field('出發時刻', tIn), h('button', { class: 'btn', type: 'submit' }, '查詢'), swap));
    root.append(h('div', { style: 'margin-top:16px' }, form), out);
    function go() {
      out.replaceChildren();
      if (fSel.value === tSel.value) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number), t0 = hh * 3600 + mm * 60;
      const res = H.search(fSel.value, tSel.value, t0, 4);
      const fare = H.fare(fSel.value, tSel.value);
      out.append(h('h2', { class: 'h2' }, `${H.stName(fSel.value)} → ${H.stName(tSel.value)}`, h('small', null, `${hm(t0)} 之後的班次`)));
      if (!res.length) { out.append(h('p', { class: 'lead' }, '在這個時間之後沒有找到可乘坐的班次。可以改個時刻再查查看。')); return; }
      res.forEach((j, n) => out.append(journeyCard(H, j, fare, n === 0)));
      out.append(h('p', { class: 'note' }, '轉乘時間以最短 ' + Math.round(H.minTransfer / 60 * 10) / 10 + ' 分鐘計算。票價依經過的收費區計算，與搭乘的班次無關；特急・特快另加指定席費用。'));
      try { history.replaceState(null, '', `?tab=route&from=${fSel.value}&to=${tSel.value}&t=${tIn.value}`); } catch (e) { }
    }
    if (q.get('from')) go();
  }

  function journeyCard(H, j, fare, first) {
    const transfers = j.legs.length - 1, dur = Math.round((j.arr - j.dep) / 60);
    const lis = [];
    j.legs.forEach((leg, li) => {
      const s0 = leg.stops[0], sN = leg.stops[leg.stops.length - 1], sv = leg.sv;
      lis.push(h('li', { class: li === 0 ? 'first' : '' }, h('div', { class: 'tm' }, hm(s0.dep)), h('div', { class: 'rl' }, h('i')),
        h('div', { class: 'wh' }, h('strong', null, H.stName(s0.station)), s0.platform ? h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `${s0.platform} 號月台`) : null,
          h('div', { class: 'ride' }, typeTag(sv), h('span', null, sv.routeName), h('span', null, `${H.destOf(sv, leg.board)}行`), h('span', null, `${leg.stops.length - 1} 站・${Math.max(1, Math.round((sN.arr - s0.dep) / 60))} 分`)))));
      const nxt = j.legs[li + 1];
      if (nxt) {
        lis.push(h('li', { class: 'walk' }, h('div', { class: 'tm' }, hm(sN.arr), h('span', null, hm(nxt.stops[0].dep))), h('div', { class: 'rl' }, h('i')), h('div', { class: 'wh' }, h('strong', null, H.stName(sN.station)), h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `轉乘・等候 ${Math.round((nxt.stops[0].dep - sN.arr) / 60)} 分`))));
      } else {
        lis.push(h('li', { class: 'last' }, h('div', { class: 'tm' }, hm(sN.arr)), h('div', { class: 'rl' }, h('i')), h('div', { class: 'wh' }, h('strong', null, H.stName(sN.station)), sN.platform ? h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `${sN.platform} 號月台`) : null)));
      }
    });
    return h('article', { class: 'jr' },
      h('header', { class: 'jr-head' }, h('span', { class: 't' }, `${hm(j.dep)} → ${hm(j.arr)}${j.arr >= DAY ? '（翌日）' : ''}`), h('span', { class: 'm' }, `${dur} 分　${transfers ? `轉乘 ${transfers} 次` : '不需轉乘'}`), fare ? h('span', { class: 'y' }, yen(fare.yen), h('small', null, ' 單程')) : null),
      h('ol', { class: 'legs' }, lis));
  }

  function viewFare(H, root) {
    const fSel = stationSelect(H, q.get('from') && H.stById[q.get('from')] ? q.get('from') : H.stations[0].id, '出發站'), tSel = stationSelect(H, q.get('to') && H.stById[q.get('to')] ? q.get('to') : H.stations[Math.min(1, H.stations.length - 1)].id, '抵達站');
    const out = h('div', { style: 'margin-top:18px' });
    const form = h('form', { class: 'finder', onsubmit: e => { e.preventDefault(); go(); } }, h('div', { style: 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px 12px;align-items:end;padding:14px 16px' }, field('出發站', fSel), field('抵達站', tSel), h('button', { class: 'btn', type: 'submit' }, '計算票價')));
    const C = H.cfg;
    const rule = h('div', { class: 'sec' }, h('h2', null, '票價制度'), h('table', { class: 'tbl' }, h('tbody', null,
      h('tr', null, h('th', { style: 'width:30%' }, '基本運費'), h('td', null, `${yen(C.fareBase)}（含同一收費區內）`)),
      h('tr', null, h('th', null, '區間加算'), h('td', null, `每跨越一個收費區加 ${yen(C.fareStep)}（依實際經過的路徑計算跨越次數，而非區號差）`)),
      h('tr', null, h('th', null, '指定席費用'), h('td', null, `${yen(C.seatFee)}（特急、特快為全車指定席；其他種別不需要）`)),
      h('tr', null, h('th', null, '路徑的取法'), h('td', null, '有多條路徑時，取跨越收費區最少、其次距離最短的路徑。')))));
    root.append(h('div', { style: 'margin-top:16px' }, form), out, rule);
    function go() {
      out.replaceChildren();
      if (fSel.value === tSel.value) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      const f = H.fare(fSel.value, tSel.value);
      if (!f) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到路徑。')); return; }
      out.append(h('div', { class: 'fare-box' }, h('div', { style: 'padding:14px 16px;display:flex;flex-wrap:wrap;gap:6px 24px;align-items:baseline' }, h('span', { style: 'font-weight:700' }, `${H.stName(fSel.value)} → ${H.stName(tSel.value)}`), h('span', { class: 'big' }, yen(f.yen)), h('span', { style: 'color:var(--muted);font-size:13px' }, `跨越分區 ${f.zones}　經過 ${f.path.length - 1} 區間　約 ${f.km.toFixed(1)} km`)),
        h('table', { class: 'tbl', style: 'margin:0 16px 10px;width:calc(100% - 32px)' }, h('tbody', null,
          h('tr', null, h('th', null, '基本運費'), h('td', { style: 'text-align:right' }, yen(f.base))),
          h('tr', null, h('th', null, `跨越收費區 ${f.crossed} 個 × ${yen(f.step)}`), h('td', { style: 'text-align:right' }, yen(f.zoneFee))),
          h('tr', null, h('th', null, '乘車券合計'), h('td', { style: 'text-align:right;font-weight:700' }, yen(f.yen))),
          h('tr', null, h('th', null, '搭乘特急・特快時另加指定席費用'), h('td', { style: 'text-align:right' }, '+' + yen(f.seat || H.cfg.seatFee) + '（合計 ' + yen(f.yen + H.cfg.seatFee) + '）')))),
        h('div', { class: 'rule' }, '計算所用的路徑：' + f.path.map(id => H.stName(id)).join(' → ') + (H.zonesConfigured ? '' : '　※ 收費區資料尚未設定，目前以未跨越任何區間計算。'))));
    }
    go();
  }

  function viewMap(H, root) {
    const L = computeLayout(H);
    const box = h('div', { class: 'mapbox' }), info = h('div', { class: 'pop', hidden: true });
    root.append(h('p', { class: 'lead', style: 'margin-top:16px' }, '點選車站，可查看停靠該站的路線並前往時刻表。'), box, info);
    const m = renderMap(box, H, L, { interactive: true });
    m.onStation(st => {
      m.mark(st.id, 'sel'); info.hidden = false;
      const lines = new Map(); H.svcs.forEach(sv => { if (sv.stops.some(x => x.station === st.id && x.pax !== false)) { const k = sv.routeName; if (!lines.has(k)) lines.set(k, new Set()); } });
      info.replaceChildren(h('strong', null, st.zh), st.en ? h('span', { style: 'margin-left:10px;color:var(--muted);font-size:12px' }, st.en) : null,
        h('div', { style: 'margin:6px 0 8px;font-size:13px' }, '停靠路線：' + [...lines.keys()].join('、')),
        h('a', { class: 'btn sm', href: `timetable.html?tab=station&s=${st.id}` }, '看這個車站的時刻表'));
    });
    box.append(h('div', { class: 'legend' }, h('span', null, '○ 車站'), h('span', null, '◎ 轉乘站')));
  }

  /* ───────── 即時列車動態 ───────── */
  function live(H) {
    const L = computeLayout(H);
    const box = h('div', { class: 'mapbox' }), side = h('div', { class: 'side' }), pop = h('div', { class: 'pop', hidden: true });
    const clockEl = h('span', { class: 'now' }), slider = h('input', { type: 'range', min: 0, max: DAY - 60, step: 60, 'aria-label': '時刻' });
    let manual = false, picked = null;
    const reset = h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { manual = false; tick(); } }, '回到現在');
    const m = renderMap(box, H, L, { interactive: false });
    const seenR = new Set(), routeLeg = [];
    H.svcs.forEach(sv => { const k = sv.routeName; if (seenR.has(k)) return; seenR.add(k); routeLeg.push(h('span', null, h('i', { class: 'rc', style: `background:${sv.color}` }), k)); });
    const lg = h('div', { class: 'legend' }, ...routeLeg, h('span', null, '列車の色は各路線のイメージカラーです。位置依時刻表推算，並非實際車輛位置。'));
    box.append(lg);
    const list = h('ul');
    side.append(h('h3', null, '運行中的列車'), list);
    app.replaceChildren(
      h('div', { class: 'clock' }, h('span', null, '時刻'), clockEl, slider, reset),
      h('div', { class: 'livegrid' }, h('div', null, box, pop), side));
    slider.addEventListener('input', () => { manual = true; tick(Number(slider.value)); });

    function describe(tr) {
      const sv = tr.sv, st = sv.stops, i = tr.i, dest = H.destOf(sv, i), cars = H.carsOf(sv), ri = H.reserveInfo(sv), base = tr.tr.base;
      const carBar = h('span', { class: 'carbar', title: cars + '両編成' }, ...Array.from({ length: cars }, (_, k) => h('i', { style: `background:${sv.color}` }, String(k + 1))));
      const rows = [];
      st.forEach((s, k) => {
        if (s.pax === false) return;
        const past = k < i || (k === i && !tr.dwelling && false), here = k === i && tr.dwelling, nextS = k === i + 1;
        const first = k === 0, last = k === st.length - 1;
        rows.push(h('tr', { class: (k < i ? 'past ' : '') + (here ? 'here ' : '') + (nextS ? 'next' : '') },
          h('td', { class: 'mk' }, here ? '●' : nextS ? '▶' : ''), h('td', null, H.stName(s.station), s.platformName ? h('small', null, ` ${s.platformName}番線`) : null),
          h('td', { class: 'tm' }, first ? '' : hm(base + s.arr)), h('td', { class: 'tm' }, last ? '' : hm(base + s.dep))));
      });
      return h('div', { class: 'tinfo' },
        h('div', { class: 'ti-head' }, typeTag(sv), h('strong', null, sv.routeName), h('span', { class: 'ti-dest' }, `${dest}行`)),
        h('div', { class: 'ti-cars' }, carBar, h('span', null, `${cars} 両編成`), ri ? h('span', { class: 'resv' }, '全車指定席') : null),
        h('div', { class: 'ti-state' }, tr.dwelling ? `${H.stName(tr.from)} 停車中（${hm(tr.dep)} 發車）` : `${H.stName(tr.from)} → ${H.stName(tr.to)} 運行中`),
        h('table', { class: 'ti-stops' }, h('thead', null, h('tr', null, h('th'), h('th', null, '停靠站'), h('th', null, '到'), h('th', null, '發'))), h('tbody', null, rows)));
    }
    function tick(forced) {
      const t = forced != null ? forced : H.nowSec();
      if (!manual) slider.value = String(Math.min(DAY - 60, Math.floor(t / 60) * 60));
      clockEl.textContent = hm(t) + (manual ? '' : ':' + String(Math.floor(t % 60)).padStart(2, '0'));
      const act = H.activeTrains(t).filter(a => !(a.sv.stops[a.i].pax === false && a.sv.stops[a.i + 1].pax === false));
      m.setTrains(act, tr => { picked = tr.tr; show(tr); });
      act.sort((a, b) => a.sv.routeName.localeCompare(b.sv.routeName, 'ja') || a.arr - b.arr);
      list.replaceChildren(...act.slice(0, 80).map(tr => h('li', null, h('button', { type: 'button', 'aria-pressed': String(picked === tr.tr), onclick: () => { picked = tr.tr; show(tr); } },
        typeTag(tr.sv), h('span', null, `${H.destOf(tr.sv, tr.i)}行`), h('span', { class: 'nx' }, tr.dwelling ? `${H.stName(tr.from)} 停車中` : `${H.stName(tr.from)} → ${H.stName(tr.to)}`)))));
      if (!act.length) list.replaceChildren(h('li', { style: 'padding:12px;color:var(--muted);font-size:13px' }, '目前沒有運行中的班次。'));
      if (picked) { const cur = act.find(a => a.tr === picked); if (cur) show(cur, true); else { pop.hidden = true; picked = null; } }
    }
    function show(tr, quiet) { pop.hidden = false; pop.replaceChildren(describe(tr)); }
    tick(); setInterval(() => { if (!manual) tick(); }, 1000);
  }

  /* ───────── 啟動 ───────── */
  (async function () {
    try {
      const H = await load();
      if (page === 'home') await home(H);
      else if (page === 'timetable') timetable(H);
      else if (page === 'live') live(H);
      else if (page === 'booking') HK.booking(H, app);
    } catch (e) {
      console.error(e);
      const t = h('div', { class: 'wrap' }, h('div', { class: 'soonbox' }, h('h2', null, '資料暫時無法顯示'), h('p', null, '載入時刻表資料時發生問題，請稍後再試。')));
      (app || document.body).replaceChildren(t);
    }
  })();
})();
