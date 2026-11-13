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
    const sel = h('select', { 'aria-label': label }, H.stations.map(st => h('option', { value: st.id }, (H.codeText(st.id) ? H.codeText(st.id) + ' ' : '') + st.zh)));
    if (id) sel.value = id;
    if (onChange) sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  const field = (label, el) => h('label', { class: 'f' }, h('span', null, label), el);
  /** 調度（離峰・深夜・收車）時顯示給旅客的說明。 */
  function dispNote(H) {
    const t = { midday: '目前採用日中時段班次，部分列車停駛（約每 3 班行駛 2 班）。', offpeak: '目前採用離峰時段班次，部分列車停駛（約每 2 班行駛 1 班）。', night: '目前採用深夜時段班次，列車班次減少（約每 3 班行駛 1 班）。', recall: '目前為收車時段，不再發出新的班次。' }[H.dispatchNow];
    return t ? ' ' + t : '';
  }

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
    const up = fmtDate(H.exportedAt); if (up) { const note = $('#status-note'); note.replaceChildren(document.createTextNode(`運行情報為時刻表資料記錄的狀態（資料時點 ${up}）。`), ...(dispNote(H) ? [document.createTextNode(' ' + dispNote(H))] : [])); }

    // 最新消息
    const news = await HKc.getJSON('data/news.json', true);
    const dl = $('#news');
    (news || []).forEach(n => dl.append(h('div', { class: 'row', id: n.id || null }, h('dt', null, n.date), h('dd', null, h('span', { class: 'cat' }, n.tag)), h('dd', null, n.href ? h('a', { href: n.href }, n.title) : n.title))));

    // 簡易路線圖
    const L = computeLayout(H), box = $('#minimap');
    const mm = renderMap(box, H, L, { fontSize: 13, interactive: true });
    const pop = h('div', { class: 'pop mappop', hidden: true }); box.parentNode.insertBefore(pop, box.nextSibling);
    mm.onStation(st => { mm.mark(st.id, 'sel'); window.HK.stationPop(H, st, pop); });
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
    const dest = last;
    // 1.1.0：高速鉄道往東平倉方向的班次，車站時刻表固定標示「東平倉・新岩沢 方面」（地圖外的假想延伸；
    // 前輩指定，只套用這一個方向，反方向仍用一般的終點命名）。
    const hx = H.cfg.hsExt;
    if (sv.isHS && hx && hx.towardLabel && H.stName(dest) === hx.afterZh) return { key: 'hsext|' + hx.afterZh, label: hx.towardLabel + '　方面' };
    // 0.21.0：方向由「這班車實際的下一個停靠站」決定（過去用到終點的最短路徑，環快這類繞行的班次會被分到相反方向）
    let nextSt = dest; for (let k = (e.i || 0) + 1; k < sv.stops.length; k++) if (sv.stops[k].pax !== false) { nextSt = sv.stops[k].station; break; }
    const p = H.shortestPath(sid, nextSt);
    const nb = p && p.length > 1 ? p[1] : nextSt;
    return { key: 'nb|' + nb, label: null, nb, dest };
  }

  function viewStation(H, root) {
    let sid = q.get('s') || (H.stations.find(x => x.zh === 'みつせ') || H.stations[0]).id;
    if (!H.stById[sid]) sid = H.stations[0].id;
    let dirKey = 'all', whole = false;
    const sel = stationSelect(H, sid, '車站', v => { sid = v; dirKey = 'all'; draw(); });
    const out = h('div');
    root.append(h('div', { class: 'finder', style: 'margin-top:16px' }, h('form', { onsubmit: e => e.preventDefault(), style: 'grid-template-columns:minmax(0,320px)' }, field('車站', sel))));
    if (dispNote(H)) root.append(h('p', { class: 'lead', style: 'margin-top:10px' }, dispNote(H).trim()));
    root.append(out);

    function draw() {
      const evs = H.departures(sid);
      out.replaceChildren();
      const st = H.stById[sid];
      out.append(h('h2', { class: 'h2', style: 'margin-top:22px' }, H.codeBadges(sid), st.zh, st.en ? h('small', null, st.en) : null));
      if (HK.sdEntry && HK.sdEntry(st.zh)) out.append(h('p', { style: 'margin:0 0 10px' }, h('a', { class: 'btn sm', href: HK.stationHref(H, st.zh) }, '車站介紹（照片・月台・附近景點與餐廳）')));
      out.append(HK.ttPanel(H, sid));
    }
    draw();
  }

  /** 車站時刻表パネル（方向の切替・全日表示つき）。車站頁と時刻表頁で共用。 */
  function ttPanel(H, sid) {
    let dirKey = 'all', whole = false, hsOnly = false;
    const out = h('div');
    // 1.1.0：獨立的「高速鉄道」篩選欄位（票價查詢・乘車轉乘查詢也各自有一個，三頁用同一個識別色）。
    const hasHS = H.svcs.some(sv => sv.isHS && sv.stops.some(s => s.station === sid && s.pax !== false));
    const hsChk = h('input', { type: 'checkbox' });
    const hsField = hasHS ? h('div', { class: 'hs-field', style: 'padding:6px 14px' }, h('label', { class: 'f', style: 'flex-direction:row;display:flex;gap:6px;align-items:center;margin:0' },
      hsChk, h('span', null, h('span', { class: 'hs-tag' }, '高速鉄道'), '只顯示高速鉄道的班次'))) : null;
    hsChk.addEventListener('change', () => { hsOnly = hsChk.checked; draw(); });
    function draw() {
      const evs = H.departures(sid).filter(e => !hsOnly || e.sv.isHS);
      out.replaceChildren();
      if (hsField) out.append(hsField);
      if (!evs.length) { out.append(h('p', { class: 'lead' }, hsOnly ? '這個車站目前沒有高速鉄道的班次。' : '這個車站沒有發車的班次（可能是各路線的終點站）。')); return; }
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
      const order = sv => (sv.type ? 1 : 0) + (sv.tcls === 'exp' ? 1 : 0) + (sv.tcls === 'ltd' ? 2 : 0);
      const leg = h('div', { class: 'tlegend' }, [...types.values()].sort((a, b) => order(a) - order(b)).map(sv => h('span', null, typeMark(sv) ? h('b', { class: 'mk ' + sv.tcls }, typeMark(sv)) : null, typeTag(sv))));
      out.append(leg);
      out.append(h('p', { class: 'note' }, '時刻為各班次在本站的發車時刻。方格內有字的是各停以外的種別（字為種別略稱，例：特＝特急・特別快速、快＝快速、環＝環狀快速），沒有標示的是各站停車；右上角小字為行先。'));
    }
    draw();
    return out;
  }
  HK.ttPanel = ttPanel;
  HK.hsFareDetailBox = hsFareDetailBox; // 1.1.0：獨立票價查詢欄位（hsFareBox）用

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
        h('td', { class: 'm' }, es.map(e => { const mn = Math.floor((e.t % 3600) / 60); const m = typeMark(e.sv); return h('span', { class: 'dep', title: `${e.sv.routeName}${H.gouOf(e.sv, e.base) ? ' ' + H.gouOf(e.sv, e.base) : ''} ${H.destOf(e.sv, e.i)}行` }, m ? h('b', { class: 'mk ' + e.sv.tcls }, m) : null, String(mn).padStart(2, '0'), g.dests.size > 1 ? h('sup', null, mark.get(H.destOf(e.sv, e.i))) : null); }))));
    }
    const dl = g.dests.size > 1 ? h('div', { class: 'tlegend' }, dests.map(dn => h('span', null, `${mark.get(dn)}＝${dn}行`))) : null;
    return h('div', { style: 'margin-bottom:18px' }, h('table', { class: 'ttable' }, h('thead', null, h('tr', null, h('th', { colspan: 2 }, g.label))), body), dl);
  }

  function viewRoute(H, root) {
    // 1.1.1：允許起訖站是「假想延伸站」（勾了「可以利用高速鉄道」才看得到這個選項）之後，
    // 查詢字串裡的 from／to 也可能是假想站的 id（'hsext:花宮天照' 這種），H.stById 查不到，要另外檢查。
    const hsInit = q.get('hs') === '1';
    const validSt = id => !!H.stById[id] || (hsInit && H.hsQueryStations.some(s => s.id === id && !s.real));
    const from = q.get('from') && validSt(q.get('from')) ? q.get('from') : H.stations[0].id;
    const to = q.get('to') && validSt(q.get('to')) ? q.get('to') : H.stations[Math.min(1, H.stations.length - 1)].id;
    const tv = q.get('t') || hm(H.nowSec());
    const fSel = stationSelect(H, null, '出發站'), tSel = stationSelect(H, null, '抵達站'), tIn = h('input', { type: 'time', value: tv });
    const via = q.get('via') && H.stById[q.get('via')] ? q.get('via') : '';
    const vSel = h('select', { 'aria-label': '經由' }, [h('option', { value: '' }, '（不指定）'), ...H.stations.map(st => h('option', { value: st.id, selected: st.id === via }, st.zh))]);
    const noRes = h('input', { type: 'checkbox', checked: q.get('nores') === '1' });
    const useHS = h('input', { type: 'checkbox', checked: hsInit });
    // 先依 useHS 目前的狀態把假想延伸站加進選單，再設定選到的值——順序不能反過來，
    // 不然 from／to 剛好是假想站時，選單裡根本還沒有那個 <option>，設值會被忽略。
    HKc.refreshHSExtOptions(H, fSel, useHS.checked); HKc.refreshHSExtOptions(H, tSel, useHS.checked);
    fSel.value = from; tSel.value = to;
    useHS.addEventListener('change', () => { HKc.refreshHSExtOptions(H, fSel, useHS.checked); HKc.refreshHSExtOptions(H, tSel, useHS.checked); });
    const out = h('div', { style: 'margin-top:18px' });
    const swap = h('button', { class: 'btn ghost', type: 'button', onclick: () => { const a = fSel.value; fSel.value = tSel.value; tSel.value = a; go(); } }, '出發・抵達互換');
    const form = h('form', { class: 'finder v2', onsubmit: e => { e.preventDefault(); go(); } }, h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 12px;align-items:end;padding:14px 16px' }, field('出發站', fSel), field('經由（可不選）', vSel), field('抵達站', tSel), field('出發時刻', tIn),
      h('label', { class: 'f', style: 'flex-direction:row;display:flex;gap:6px;align-items:center' }, noRes, h('span', null, '不搭乘指定席列車（特急）')),
      h('label', { class: 'f hs-field', style: 'flex-direction:row;display:flex;gap:6px;align-items:center;padding:6px 10px;margin:0' }, useHS, h('span', null, h('span', { class: 'hs-tag' }, '高速鉄道'), '可以利用高速鐵路（含延伸路段）')), h('button', { class: 'btn', type: 'submit' }, '查詢'), swap));
    root.append(h('div', { style: 'margin-top:16px' }, form), out);
    const isV = v => String(v).indexOf('hsext:') === 0;
    const vInfo = v => H.hsQueryStations.find(s => s.id === v);
    const labelOf = v => isV(v) ? ((vInfo(v) || {}).zh || v) : H.stName(v);
    function go() {
      out.replaceChildren();
      if (fSel.value === tSel.value) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      const fVirtual = isV(fSel.value), tVirtual = isV(tSel.value);
      // 1.1.1：起訖站只要有一端是万瀨高速鉄道線的延伸站，連乘搜尋（H.searchEx）本來就不認識這種站——先換成實際的
      // 銜接站（東平倉）去查，延伸段再用 H.hsExtLeg 合成一段跟真正班次同樣形狀的 leg，接上去一起顯示。
      const anchor = (fVirtual || tVirtual) ? H.hsExtAnchorSt() : null;
      if ((fVirtual || tVirtual) && !anchor) { out.append(h('p', { class: 'lead' }, '万瀨高速鉄道線的延伸段尚未設定銜接的車站，無法查詢。')); return; }
      const realFrom = fVirtual ? anchor.id : fSel.value, realTo = tVirtual ? anchor.id : tSel.value;
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number), t0 = hh * 3600 + mm * 60;
      const fLabel = labelOf(fSel.value), tLabel = labelOf(tSel.value);
      // 1.1.2：兩端都是延伸站，或其中一端剛好就是銜接站本身：真實的那一段長度是 0，整段都是延伸段——
      // 延伸段已經通車，合成一筆只有這一段的行程卡片，跟真正班次一樣顯示站名、方向、票價。
      if ((fVirtual || tVirtual) && realFrom === realTo) {
        const extLeg = H.hsExtLeg(fLabel, tLabel, t0);
        if (!extLeg) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到高速鉄道的班次。')); return; }
        out.append(h('h2', { class: 'h2' }, `${fLabel} → ${tLabel}`, h('small', null, `${hm(t0)} 之後的班次`)));
        out.append(journeyCard(H, { dep: extLeg.stops[0].dep, arr: extLeg.stops[1].arr, legs: [extLeg] }, { yen: extLeg.fare.zoneFee }, true));
        return;
      }
      const res = H.searchEx(realFrom, realTo, t0, 4, { via: vSel.value || null, noReserved: noRes.checked, allowHighSpeed: useHS.checked || fVirtual || tVirtual });
      out.append(h('h2', { class: 'h2' }, `${fLabel} → ${tLabel}`, h('small', null, `${hm(t0)} 之後的班次${vSel.value ? `　經由 ${H.stName(vSel.value)}` : ''}${noRes.checked ? '　不搭乘指定席列車' : ''}${useHS.checked ? '　可利用高速鐵路' : ''}`)));
      if (!res.length) { out.append(h('p', { class: 'lead' }, '在這個時間之後沒有找到符合條件的班次（轉乘最多 2 次、單次等候 30 分以內）。可以改個時刻或條件再查查看。')); return; }
      const vZh = fVirtual ? fLabel : (tVirtual ? tLabel : null), anchorZh = anchor ? anchor.zh : null;
      // 1.1.0：每個行程各自算票價（可能含高速鐵路，不能共用同一個 from→to 的一般票價）
      res.forEach((j, n) => {
        const real = H.journeyFare(j.legs);
        let fare = real, legs = j.legs, dep = j.dep, arr = j.arr;
        if (vZh) {
          // 1.1.2：延伸段已經通車——合成一段跟真正班次同樣形狀的 leg，接在真實路段之後（或之前）一起顯示在
          // 行程卡片的時刻表裡，不是另外用一行文字說明；票價一樣是「真實路段＋延伸段的分區運費」合併計算。
          let extLeg;
          if (tVirtual) { const last = j.legs[j.legs.length - 1]; extLeg = H.hsExtLeg(anchorZh, vZh, j.arr, last.sv.isHS ? last.gou : ''); }
          else { const first = j.legs[0]; extLeg = H.hsExtLeg(vZh, anchorZh, j.dep - H.hsExtDuration(vZh, anchorZh), first.sv.isHS ? first.gou : ''); }
          if (extLeg) {
            fare = { yen: (real ? real.yen : 0) + extLeg.fare.zoneFee };
            legs = tVirtual ? [...j.legs, extLeg] : [extLeg, ...j.legs];
            dep = tVirtual ? j.dep : extLeg.stops[0].dep;
            arr = tVirtual ? extLeg.stops[1].arr : j.arr;
          }
        }
        out.append(journeyCard(H, { dep, arr, legs }, fare, n === 0));
      });
      // 1.1.0：這裡改回分開的 h() 參數（前輩用語之前就是這樣拆，中間的數字單獨一個節點），
      // 不要再用 + 把整段接成一個字串——接成一個字串會讓既有的日文／英文翻譯對不上，整段都不會被翻譯。
      out.append(h('p', { class: 'note' }, '轉乘時間以最短 ', String(Math.round(H.minTransfer / 60 * 10) / 10), ' 分鐘計算（中央戸宮／光大前與大學前可步行轉乘，約 6 分鐘；幸村／新光瀨亦可步行轉乘高速鐵路）。乘車券依出發站到抵達站的最短路徑計算，與搭乘的班次無關；特急為全車指定席（也有半價的立席特急券），特快的 1・2 号車為指定席、3 号車以後為自由席；高速鐵路為全車指定席、沒有立席特急券，票價另計。'));
      try { history.replaceState(null, '', `?tab=route&from=${fSel.value}&to=${tSel.value}&t=${tIn.value}${vSel.value ? '&via=' + vSel.value : ''}${noRes.checked ? '&nores=1' : ''}${useHS.checked ? '&hs=1' : ''}`); } catch (e) { }
    }
    if (q.get('from')) go();
  }

  function journeyCard(H, j, fare, first) {
    const transfers = H.legsTransfers(j.legs), dur = Math.round((j.arr - j.dep) / 60);
    const lis = [];
    j.legs.forEach((leg, li) => {
      const s0 = leg.stops[0], sN = leg.stops[leg.stops.length - 1], sv = leg.sv;
      lis.push(h('li', { class: li === 0 ? 'first' : '' }, h('div', { class: 'tm' }, hm(s0.dep)), h('div', { class: 'rl' }, h('i')),
        h('div', { class: 'wh' }, h('strong', null, H.codeBadges(s0.station), H.stName(s0.station)), s0.platform ? h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `${s0.platform} 號月台`) : null,
          h('div', { class: 'ride' }, typeTag(sv), h('span', null, sv.routeName, leg.gou ? h('span', { class: 'gou' }, ' ' + leg.gou) : null), h('span', null, `${H.destOf(sv, leg.board)}行`), h('span', null, `${leg.stops.length - 1} 站・${Math.max(1, Math.round((sN.arr - s0.dep) / 60))} 分`), H.reserveLabel(sv) ? h('span', { class: 'resv' }, H.reserveLabel(sv)) : null))));
      const nxt = j.legs[li + 1];
      if (nxt) {
        lis.push(h('li', { class: 'walk' }, h('div', { class: 'tm' }, hm(sN.arr), h('span', null, hm(nxt.stops[0].dep))), h('div', { class: 'rl' }, h('i')), h('div', { class: 'wh' }, h('strong', null, H.codeBadges(sN.station), H.stName(sN.station)), nxt.walk ? h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `徒歩 → ${H.stName(nxt.walk.to)}（約 ${Math.round(nxt.walk.sec / 60)} 分）・等候 ${Math.round((nxt.stops[0].dep - sN.arr) / 60)} 分`) : h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `轉乘・等候 ${Math.round((nxt.stops[0].dep - sN.arr) / 60)} 分`))));
      } else {
        lis.push(h('li', { class: 'last' }, h('div', { class: 'tm' }, hm(sN.arr)), h('div', { class: 'rl' }, h('i')), h('div', { class: 'wh' }, h('strong', null, H.codeBadges(sN.station), H.stName(sN.station)), sN.platform ? h('span', { style: 'margin-left:8px;font-size:12px;color:var(--muted)' }, `${sN.platform} 號月台`) : null)));
      }
    });
    return h('article', { class: 'jr' },
      h('header', { class: 'jr-head' }, h('span', { class: 't' }, `${hm(j.dep)} → ${hm(j.arr)}${j.arr >= DAY ? '（翌日）' : ''}`), h('span', { class: 'm' }, `${dur} 分　${transfers ? `轉乘 ${transfers} 次` : '不需轉乘'}`), fare ? h('span', { class: 'y' }, yen(fare.yen), h('small', null, ' 單程')) : null),
      h('ol', { class: 'legs' }, lis));
  }

  /** 1.1.1：萬瀨高速鉄道線假想延伸試算結果的卡片——獨立票價查詢欄位（hsFareBox）與乘車・轉乘查詢（viewRoute，
   *  起訖站其中一端是假想延伸站、而且沒有真實連乘路段可查時）共用同一份排版，不要各寫一份。 */
  function hsFareDetailBox(H, f, fromLabel, toLabel, list) {
    list = list || H.hsQueryStations;
    return h('div', { class: 'fare-box', style: 'margin-top:10px' },
      h('div', { style: 'padding:14px 16px;display:flex;flex-wrap:wrap;gap:6px 24px;align-items:baseline' },
        h('span', { style: 'font-weight:700' }, `${fromLabel} → ${toLabel}`), h('span', { class: 'big' }, yen(f.total)), h('span', { style: 'color:var(--muted);font-size:13px' }, `跨越分區 ${f.zones}　約 ${f.km.toFixed(1)} km`)),
      h('table', { class: 'tbl', style: 'margin:0 16px 10px;width:calc(100% - 32px)' }, h('tbody', null,
        h('tr', null, h('th', { style: 'width:46%' }, `跨越收費區 ${f.crossed} 個 × ${yen(f.step)}`), h('td', { style: 'text-align:right' }, yen(f.zoneFee))),
        h('tr', null, h('th', null, '乘車券合計'), h('td', { style: 'text-align:right;font-weight:700' }, yen(f.yen))),
        h('tr', null, h('th', null, '兒童（12 歲以下）・優待（60 歲以上）'), h('td', { style: 'text-align:right' }, yen(Math.round(f.yen * H.cfg.childRatio)) + '（指定席特急券不打折）')),
        h('tr', null, h('th', null, '指定席特急券（全車指定席，沒有立席特急券）'), h('td', { style: 'text-align:right' }, '+' + yen(f.seat) + '（合計 ' + yen(f.yen + f.seat) + '）')))),
      h('div', { class: 'rule' }, '計算所用的路徑：' + f.path.join(' → ')));
  }

  /** 1.1.0：獨立的「高速鉄道」票價查詢欄位——萬瀨高速鉄道線専用，不跟一般票價混在一起算，
   *  也不經過一般票價用的拓樸搜尋（高速鉄道不在 H.adj 裡）。站名清單含地圖外的假想延伸（花宮天照・豐守・新岩沢，
   *  見 CFG.hsExt），讓玩家可以先試算之後會通到的票價；這些延伸站只會出現在這個欄位，不會出現在其他查詢或地圖上。 */
  function hsFareBox(H) {
    const list = H.hsQueryStations;
    if (!list || list.length < 2) return null;
    // 1.1.2：地圖內真的有一般班次停靠的站（real）不用特別標；延伸段的站只能搭高速鉄道抵達，一律加「*高速鉄道」。
    const opt = (s) => h('option', { value: s.zh }, s.zh + (s.real ? '' : '　*高速鉄道'));
    const fSel = h('select', { 'aria-label': '出發站（高速鉄道）' }, list.map(opt));
    const tSel = h('select', { 'aria-label': '抵達站（高速鉄道）' }, list.map(opt));
    tSel.selectedIndex = Math.min(list.length - 1, 1);
    const out = h('div', { style: 'margin-top:10px' });
    const form = h('form', { onsubmit: e => { e.preventDefault(); go(); } },
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px 12px;align-items:end' },
        field('出發站', fSel), field('抵達站', tSel), h('button', { class: 'btn', type: 'submit' }, '計算高速鉄道票價')));
    function go() {
      out.replaceChildren();
      if (fSel.value === tSel.value) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      const f = H.hsFareExt(fSel.value, tSel.value);
      if (!f) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到高速鉄道的票價。')); return; }
      out.append(hsFareDetailBox(H, f, fSel.value, tSel.value, list));
    }
    form.addEventListener('submit', go);
    return h('div', { class: 'sec hs-field' },
      h('h2', null, h('span', { class: 'hs-tag' }, '高速鉄道'), '万瀨高速鉄道線　獨立票價查詢'),
      h('p', { class: 'lead', style: 'margin-top:0' }, '万瀨高速鉄道線的票價不套用一般鐵路的分區運費制度：每跨越一個收費區加 ' + yen(H.cfg.hsFareStep) + '，指定席特急券固定 ' + yen(H.cfg.hsSeatFee) + '（不打折、沒有立席特急券）。站名含地圖外的延伸路段（標示「*高速鉄道」），一樣可以在這裡查票價。'),
      form, out);
  }

  function viewFare(H, root) {
    const fSel = stationSelect(H, q.get('from') && H.stById[q.get('from')] ? q.get('from') : H.stations[0].id, '出發站'), tSel = stationSelect(H, q.get('to') && H.stById[q.get('to')] ? q.get('to') : H.stations[Math.min(1, H.stations.length - 1)].id, '抵達站');
    const out = h('div', { style: 'margin-top:18px' });
    const form = h('form', { class: 'finder', onsubmit: e => { e.preventDefault(); go(); } }, h('div', { style: 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px 12px;align-items:end;padding:14px 16px' }, field('出發站', fSel), field('抵達站', tSel), h('button', { class: 'btn', type: 'submit' }, '計算票價')));
    const C = H.cfg;
    const rule = h('div', { class: 'sec' }, h('h2', null, '票價制度'), h('table', { class: 'tbl' }, h('tbody', null,
      h('tr', null, h('th', { style: 'width:30%' }, '基本運費'), h('td', null, `${yen(C.fareBase)}（含同一收費區內）`)),
      h('tr', null, h('th', null, '區間加算'), h('td', null, `每跨越一個收費區加 ${yen(C.fareStep)}（依實際經過的路徑計算跨越次數，而非區號差）`)),
      h('tr', null, h('th', null, '指定席費用'), h('td', null, `${yen(C.seatFee)}（特急為全車指定席；特快為 1・2 号車指定席，3 号車以後為自由席不收費）。特急的立席特急券為指定席的一半（${yen(Math.round(C.seatFee * C.standRatio))}），不保證有位置、不能選座位。`)),
      h('tr', null, h('th', null, '兒童・優待'), h('td', null, '12 歲以下、60 歲以上的乘車券為大人的一半（四捨五入到整數）；指定席費用不打折。')),
      h('tr', null, h('th', null, '路徑的取法'), h('td', null, '有多條路徑時，取跨越收費區最少、其次距離最短的路徑。')))));
    root.append(h('div', { style: 'margin-top:16px' }, form), out, rule);
    root.append(hsFareBox(H));
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
          h('tr', null, h('th', null, '兒童（12 歲以下）・優待（60 歲以上）'), h('td', { style: 'text-align:right' }, yen(Math.round(f.yen * H.cfg.childRatio)))),
          h('tr', null, h('th', null, '搭乘特急（指定席）／特快 1・2 号車（指定席）另加'), h('td', { style: 'text-align:right' }, '+' + yen(H.cfg.seatFee) + '（合計 ' + yen(f.yen + H.cfg.seatFee) + '）')),
          h('tr', null, h('th', null, '立席特急券（特急）'), h('td', { style: 'text-align:right' }, '+' + yen(Math.round(H.cfg.seatFee * H.cfg.standRatio)) + '（合計 ' + yen(f.yen + Math.round(H.cfg.seatFee * H.cfg.standRatio)) + '）')))),
        h('div', { class: 'rule' }, '計算所用的路徑：' + f.path.map(id => H.stName(id)).join(' → ') + (H.zonesConfigured ? '' : '　※ 收費區資料尚未設定，目前以未跨越任何區間計算。'))));
    }
    go();
  }

  function viewMap(H, root) {
    const L = computeLayout(H);
    const box = h('div', { class: 'mapbox' }), info = h('div', { class: 'pop mappop', hidden: true });
    root.append(h('p', { class: 'lead', style: 'margin-top:16px' }, '點選車站，查看停靠路線、接下來的發車，並前往時刻表或乘車查詢。'), box, info);
    const m = renderMap(box, H, L, { interactive: true });
    const open = st => { m.mark(st.id, 'sel'); window.HK.stationPop(H, st, info); };
    m.onStation(open);
    const s0 = q.get('s'); if (s0 && H.stById[s0]) { open(H.stById[s0]); setTimeout(() => { try { info.scrollIntoView({ block: 'nearest' }); } catch (e) { } }, 50); }
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
          h('td', { class: 'mk' }, here ? '●' : nextS ? '▶' : ''), h('td', null, H.codeBadges(s.station), H.stName(s.station), s.platformName ? h('small', null, ` ${s.platformName}番線`) : null),
          h('td', { class: 'tm' }, first ? '' : hm(base + s.arr)), h('td', { class: 'tm' }, last ? '' : hm(base + s.dep))));
      });
      return h('div', { class: 'tinfo' },
        h('div', { class: 'ti-head' }, typeTag(sv), h('strong', null, sv.routeName), H.gouOf(sv, base) ? h('span', { class: 'gou' }, ' ' + H.gouOf(sv, base)) : null, h('span', { class: 'ti-dest' }, `${dest}行`)),
        h('div', { class: 'ti-cars' }, carBar, h('span', null, `${cars} 両編成`), ri ? h('span', { class: 'resv' }, H.reserveLabel(sv)) : null),
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
        typeTag(tr.sv), H.gouOf(tr.sv, tr.tr.base) ? h('span', { class: 'gou' }, H.gouOf(tr.sv, tr.tr.base)) : null, h('span', null, `${H.destOf(tr.sv, tr.i)}行`), h('span', { class: 'nx' }, tr.dwelling ? `${H.stName(tr.from)} 停車中` : `${H.stName(tr.from)} → ${H.stName(tr.to)}`)))));
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
      else if (page === 'routes') HK.viewServices(H, app);
      else if (page === 'sights') await HK.viewSights(H, app);
      else if (page === 'station') await HK.viewStationPage(H, app);
      else if (page === 'guide') HK.viewGuide(H, app);
      else if (page === 'airport') HK.viewAirport(H, app);
      else if (page === 'kobana') HK.viewServices(H, app);
    } catch (e) {
      console.error(e);
      const t = h('div', { class: 'wrap' }, h('div', { class: 'soonbox' }, h('h2', null, '資料暫時無法顯示'), h('p', null, '載入時刻表資料時發生問題，請稍後再試。')));
      (app || document.body).replaceChildren(t);
    }
  })();
})();
