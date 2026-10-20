/* booking.js — 線上訂票：查詢特急／特快 → 選座位 → 車票。座位占用為依班次與日期決定的模擬資料，不儲存任何資訊。 */
(function () {
  'use strict';
  const HK = window.HK, { h } = HK;
  const DAY = 86400, yen = n => '¥' + Number(n).toLocaleString('en-US');
  const COLS = ['A', 'B', 'C', 'D'], ROWS = 10;

  /* 決定性亂數 */
  function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** 這班車的座位占用：回傳 booked[car][seatIdx] = [[from,to),...]（以停靠站序號計） */
  function occupancy(key, cars, nStops, depSec) {
    const r = rng(hash(key)), hr = depSec / 3600 % 24;
    const peak = (hr >= 6.5 && hr < 9.5) || (hr >= 16.5 && hr < 19.5);
    const load = Math.min(0.92, Math.max(0.12, (peak ? 0.72 : hr >= 22 || hr < 6 ? 0.18 : 0.42) + (r() - 0.5) * 0.3));
    const out = [];
    for (let c = 0; c < cars; c++) {
      const carLoad = Math.min(0.95, Math.max(0.05, load + (r() - 0.5) * 0.2)), seats = [];
      for (let k = 0; k < ROWS * 4; k++) {
        const segs = []; let i = 0;
        while (i < nStops - 1) {
          if (r() < carLoad * 0.8) { const len = 1 + Math.floor(r() * Math.max(1, nStops - 1) * 0.8); segs.push([i, Math.min(nStops - 1, i + len)]); i += len; } else i += 1 + Math.floor(r() * 2);
        }
        seats.push(segs);
      }
      out.push(seats);
    }
    return out;
  }
  const isFree = (segs, a, b) => !segs.some(([s, e]) => s < b && a < e);
  const seatName = (car, k) => `${car + 1}号車 ${Math.floor(k / 4) + 1}${COLS[k % 4]}`;

  function direct(H, from, to, date, t0) {
    const out = [];
    for (let ti = 0; ti < H.trips.length; ti++) {
      const tr = H.trips[ti], ri = H.reserveInfo(tr.sv); if (!ri) continue;
      const st = tr.sv.stops.filter(s => s.pax !== false);
      const a = st.findIndex(s => s.station === from); if (a < 0) continue;
      let b = -1; for (let j = a + 1; j < st.length; j++) if (st[j].station === to) { b = j; break; }
      if (b < 0) continue;
      const dep = tr.base + st[a].dep, arr = tr.base + st[b].arr;
      if (dep < t0 || dep >= DAY) continue;
      out.push({ tr, sv: tr.sv, ri, st, a, b, dep, arr, key: `${date}|${tr.sv.idx}|${((tr.base % DAY) + DAY) % DAY}` });
    }
    return out.sort((x, y) => x.dep - y.dep);
  }

  function booking(H, root) {
    const q = new URLSearchParams(location.search);
    const opts = H.stations.map(st => h('option', { value: st.id }, st.zh));
    const fSel = h('select', { 'aria-label': '出發站' }, opts.map(o => o.cloneNode(true))), tSel = h('select', { 'aria-label': '抵達站' }, opts.map(o => o.cloneNode(true)));
    if (q.get('from') && H.stById[q.get('from')]) fSel.value = q.get('from');
    tSel.selectedIndex = Math.min(1, H.stations.length - 1); if (q.get('to') && H.stById[q.get('to')]) tSel.value = q.get('to');
    const today = new Date(), pad = n => String(n).padStart(2, '0');
    const dIn = h('input', { type: 'date', value: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` });
    const tIn = h('input', { type: 'time', value: '07:00' });
    const nSel = h('select', { 'aria-label': '人數' }, [1, 2, 3, 4, 5, 6].map(n => h('option', { value: n }, n + ' 位')));
    const field = (l, el) => h('label', { class: 'f' }, h('span', null, l), el);
    const form = h('form', { class: 'finder', onsubmit: e => { e.preventDefault(); search(); } },
      h('div', { class: 'bk-form' }, field('出發站', fSel), field('抵達站', tSel), field('乘車日', dIn), field('出發時刻', tIn), field('人數', nSel), h('button', { class: 'btn', type: 'submit' }, '查詢班次')));
    const out = h('div', { class: 'bk-out' });
    root.append(h('p', { class: 'lead' }, '特急、特快（特別快速）為全車指定席。可預約的班次、座位狀況與票價在此確認。'), h('div', { style: 'margin-top:12px' }, form), out);

    const state = {};
    function search() {
      state.sel = null; out.replaceChildren();
      const from = fSel.value, to = tSel.value;
      if (from === to) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number);
      const list = direct(H, from, to, dIn.value, hh * 3600 + mm * 60);
      const fare = H.fare(from, to, { seat: true });
      out.append(h('h2', { class: 'h2' }, `${H.stName(from)} → ${H.stName(to)}`, h('small', null, `${dIn.value}　${tIn.value} 以後的指定席班次`)));
      if (!list.length) { out.append(h('p', { class: 'lead' }, '這段區間在這個時間之後沒有可預約的直達特急／特快。可改用「時刻表與班次」查詢含轉乘的普通班次。'), h('p', null, h('a', { class: 'btn ghost', href: `timetable.html?tab=route&from=${from}&to=${to}&t=${tIn.value}` }, '查詢含轉乘的班次'))); return; }
      if (!fare) { out.append(h('p', { class: 'lead' }, '查不到兩站之間的路徑。')); return; }
      const ul = h('ul', { class: 'bk-list' }), more = h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:8px', onclick: () => { shown += 10; renderList(); } }, 'さらに表示（更多班次）');
      let shown = 10;
      const renderList = () => { ul.replaceChildren(); list.slice(0, shown).forEach(addRow); more.hidden = shown >= list.length; };
      const addRow = c => {
        const occ = occupancy(c.key, c.ri.cars, c.st.length, c.dep), free = countFree(occ, c);
        c.occ = occ; c.free = free;
        ul.append(h('li', null, h('button', { type: 'button', class: 'bk-trip', disabled: free < Number(nSel.value), onclick: () => pick(c, fare) },
          h('span', { class: 'tm' }, `${HK.hm(c.dep)} → ${HK.hm(c.arr)}`), HK.typeTag(c.sv), h('span', { class: 'nm' }, `${c.sv.routeName}　${H.destOf(c.sv, c.a)}行`),
          h('span', { class: 'cars' }, `${c.ri.cars}両編成`), h('span', { class: 'fr ' + (free < 20 ? 'few' : '') }, free === 0 ? '満席' : `残席 ${free}`),
          h('span', { class: 'yen' }, yen(fare.total)))));
      };
      renderList();
      out.append(ul, more, fareBox(H, fare, from, to), h('div', { id: 'bk-seat' }));
    }
    function countFree(occ, c) { let n = 0; occ.forEach(car => car.forEach(segs => { if (isFree(segs, c.a, c.b)) n++; })); return n; }

    function fareBox(H, f, from, to) {
      const rows = [['基本運費', yen(f.base)], [`跨越收費區間 ${f.crossed} 個 × ${yen(f.step)}`, yen(f.zoneFee)], ['指定席費用', yen(f.seat)]];
      return h('div', { class: 'fare-box', style: 'margin-top:16px' }, h('table', { class: 'tbl' }, h('tbody', null, rows.map(r => h('tr', null, h('th', null, r[0]), h('td', { style: 'text-align:right' }, r[1]))), h('tr', null, h('th', null, '每位合計'), h('td', { style: 'text-align:right;font-weight:700' }, yen(f.total))))),
        h('div', { class: 'rule' }, '計算所用的路徑：' + f.path.map(id => H.stName(id)).join(' → ')),
        H.zonesConfigured ? null : h('div', { class: 'rule' }, '※ 收費區資料尚未設定，目前以未跨越任何區間計算。'));
    }

    function pick(c, fare) {
      const n = Number(nSel.value); state.sel = { c, fare, n, seats: [], car: 0 };
      const box = document.getElementById('bk-seat'); box.replaceChildren();
      const carTabs = h('div', { class: 'bk-cars' }), grid = h('div', { class: 'bk-grid' }), info = h('div', { class: 'bk-info' }), go = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => ticket(state.sel) }, '確認並發行車票');
      box.append(h('h2', { class: 'h2' }, '選擇座位', h('small', null, `${HK.hm(c.dep)} 發　${c.sv.routeName}　請選 ${n} 個座位`)), carTabs, grid, info, h('div', { style: 'margin-top:12px' }, go),
        h('div', { class: 'bk-legend' }, h('span', null, h('i', { class: 'st free' }), '空位'), h('span', null, h('i', { class: 'st sel' }), '已選'), h('span', null, h('i', { class: 'st taken' }), '已被預約')));
      function draw() {
        const S = state.sel;
        carTabs.replaceChildren(...c.occ.map((car, ci) => {
          const free = car.filter(sg => isFree(sg, c.a, c.b)).length, mine = S.seats.filter(x => x.car === ci).length;
          return h('button', { type: 'button', class: 'bk-ct', 'aria-pressed': String(ci === S.car), onclick: () => { S.car = ci; draw(); } }, `${ci + 1}号車`, h('small', null, `空${free}${mine ? ` ✓${mine}` : ''}`));
        }));
        grid.replaceChildren(h('div', { class: 'bk-head' }, ...COLS.slice(0, 2).map(l => h('b', null, l)), h('span'), ...COLS.slice(2).map(l => h('b', null, l))));
        const car = c.occ[S.car];
        for (let r = 0; r < ROWS; r++) {
          const row = h('div', { class: 'bk-row' });
          for (let col = 0; col < 4; col++) {
            const k = r * 4 + col, free = isFree(car[k], c.a, c.b), on = S.seats.some(x => x.car === S.car && x.k === k);
            if (col === 2) row.append(h('span', { class: 'aisle' }, String(r + 1)));
            row.append(h('button', { type: 'button', class: 'seat ' + (on ? 'sel' : free ? 'free' : 'taken'), disabled: !free, 'aria-label': `${seatName(S.car, k)} ${free ? '空位' : '已被預約'}`, 'aria-pressed': String(on),
              onclick: () => { if (on) S.seats = S.seats.filter(x => !(x.car === S.car && x.k === k)); else { if (S.seats.length >= S.n) S.seats.shift(); S.seats.push({ car: S.car, k }); } draw(); } }, COLS[col]));
          }
          grid.append(row);
        }
        info.textContent = S.seats.length ? '已選：' + S.seats.map(x => seatName(x.car, x.k)).join('、') : '尚未選擇座位';
        go.disabled = S.seats.length !== S.n;
      }
      draw(); box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function ticket(S) {
      const { c, fare } = S, from = fSel.value, to = tSel.value, total = fare.total * S.n;
      const no = String(hash(c.key + S.seats.map(x => x.car + ':' + x.k).join(',')) % 1e10).padStart(10, '0');
      const bar = h('div', { class: 'tk-bar', 'aria-hidden': 'true' });
      for (let i = 0; i < 46; i++) bar.append(h('i', { style: `width:${1 + (hash(no + i) % 3)}px` }));
      const tk = h('article', { class: 'tk' },
        h('header', null, h('img', { src: 'assets/img/mark-dark.png', alt: '', width: 28, height: 28 }), h('b', null, '光瀨都市鉄道'), h('span', null, '指定席特急券・乗車券 / RESERVED SEAT TICKET')),
        h('div', { class: 'tk-main' }, h('div', { class: 'tk-st' }, h('small', null, 'FROM'), h('strong', null, H.stName(from)), h('em', null, HK.hm(c.dep) + ' 発')), h('div', { class: 'tk-arrow' }, '→'), h('div', { class: 'tk-st' }, h('small', null, 'TO'), h('strong', null, H.stName(to)), h('em', null, HK.hm(c.arr) + ' 着'))),
        h('dl', { class: 'tk-dl' },
          h('div', null, h('dt', null, '乗車日'), h('dd', null, dIn.value.replaceAll('-', '/'))),
          h('div', null, h('dt', null, '列車'), h('dd', null, HK.typeTag(c.sv), ' ', c.sv.routeName)),
          h('div', null, h('dt', null, '行先'), h('dd', null, H.destOf(c.sv, c.a) + '行')),
          h('div', null, h('dt', null, '編成'), h('dd', null, c.ri.cars + '両')),
          h('div', null, h('dt', null, '座席'), h('dd', null, S.seats.map(x => seatName(x.car, x.k)).join('、'))),
          h('div', null, h('dt', null, '人数'), h('dd', null, S.n + ' 名'))),
        h('table', { class: 'tbl tk-fare' }, h('tbody', null,
          h('tr', null, h('th', null, '基本運費'), h('td', null, yen(fare.base))),
          h('tr', null, h('th', null, `區間加算 ${fare.crossed} × ${yen(fare.step)}`), h('td', null, yen(fare.zoneFee))),
          h('tr', null, h('th', null, '指定席費用'), h('td', null, yen(fare.seat))),
          h('tr', null, h('th', null, `小計（1 名）× ${S.n}`), h('td', null, yen(fare.total) + ' × ' + S.n)),
          h('tr', { class: 'tot' }, h('th', null, '合計'), h('td', null, yen(total))))),
        h('footer', null, bar, h('span', null, '券番 ' + no.replace(/(\d{4})(\d{4})(\d{2})/, '$1-$2-$3')), h('span', null, '本券為模擬發行，不會儲存。')));
      const box = document.getElementById('bk-seat');
      box.replaceChildren(h('h2', { class: 'h2' }, '車票'), tk, h('div', { class: 'noprint', style: 'margin-top:12px;display:flex;gap:10px' },
        h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, '列印'), h('button', { class: 'btn ghost', type: 'button', onclick: () => search() }, '重新查詢')));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (q.get('from') && q.get('to')) search();
  }
  HK.booking = booking;
})();
