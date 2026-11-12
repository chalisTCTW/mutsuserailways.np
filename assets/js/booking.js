/* booking.js — 線上訂票（0.21.0）：查詢（可轉乘、可指定經由）→ 每一段選「指定席／立席・自由席」→ 選座位 → 車票。
 * 規則：
 *   乘車券＝出發站～抵達站全程的最短路徑算一次（大人；12 歲以下、60 歲以上半價，四捨五入到整數）。
 *   特急＝全車指定席：指定席費用 ¥500，或立席特急券（指定席的一半，不保證有位置、不能選座位）。
 *   特快＝1・2 号車指定席（¥500），3 号車以後自由席（不收指定席費，不保證有位置、不能選座位）。指定席費用不打折。
 *   行程中任何一段可預約就列出完整行程；沒有指定席的種別（環快、快速、各停）只算乘車券。
 * 座位占用為依班次與日期決定的模擬資料，網站不儲存任何訂位。 */
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

  function booking(H, root) {
    const q = new URLSearchParams(location.search);
    const opts = H.stations.map(st => h('option', { value: st.id }, st.zh));
    const fSel = h('select', { 'aria-label': '出發站' }, opts.map(o => o.cloneNode(true))), tSel = h('select', { 'aria-label': '抵達站' }, opts.map(o => o.cloneNode(true)));
    const vSel = h('select', { 'aria-label': '經由' }, [h('option', { value: '' }, '（不指定）'), ...opts.map(o => o.cloneNode(true))]);
    tSel.selectedIndex = Math.min(1, H.stations.length - 1);
    if (q.get('via') && H.stById[q.get('via')]) vSel.value = q.get('via');
    const today = new Date(), pad = n => String(n).padStart(2, '0');
    const dIn = h('input', { type: 'date', value: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` });
    const tIn = h('input', { type: 'time', value: q.get('t') || '07:00' });
    const num = (label, def) => h('select', { 'aria-label': label }, [0, 1, 2, 3, 4, 5, 6].map(n => h('option', { value: n, selected: n === def }, n + ' 位')));
    const nA = num('大人', 1), nC = num('兒童（12 歲以下）', 0), nS = num('優待（60 歲以上）', 0);
    const useHS = h('input', { type: 'checkbox', checked: q.get('hs') === '1' });
    // 1.1.1：起訖站選單依 useHS 目前狀態加上假想延伸站——要先加好選項，再把 query string 的 from／to 設回去，
    // 不然 from／to 剛好是假想站時，選單裡還沒有那個 <option>，設值會被默默忽略（跟乘車・轉乘查詢同一個道理）。
    HK.refreshHSExtOptions(H, fSel, useHS.checked); HK.refreshHSExtOptions(H, tSel, useHS.checked);
    const hsInit = useHS.checked;
    const validSt = id => !!H.stById[id] || (hsInit && H.hsQueryStations.some(s => s.id === id && !s.real));
    if (q.get('from') && validSt(q.get('from'))) fSel.value = q.get('from');
    if (q.get('to') && validSt(q.get('to'))) tSel.value = q.get('to');
    useHS.addEventListener('change', () => { HK.refreshHSExtOptions(H, fSel, useHS.checked); HK.refreshHSExtOptions(H, tSel, useHS.checked); });
    const field = (l, el) => h('label', { class: 'f' }, h('span', null, l), el);
    const isV = v => String(v).indexOf('hsext:') === 0;
    const vInfo = v => H.hsQueryStations.find(s => s.id === v);
    const labelOf = v => isV(v) ? ((vInfo(v) || {}).zh || v) : H.stName(v);
    const form = h('form', { class: 'finder', onsubmit: e => { e.preventDefault(); search(); } },
      h('div', { class: 'bk-form' }, field('出發站', fSel), field('經由（可不選）', vSel), field('抵達站', tSel), field('乘車日', dIn), field('出發時刻', tIn),
        field('大人', nA), field('兒童（12 歲以下）', nC), field('優待（60 歲以上）', nS),
        h('label', { class: 'f hs-field', style: 'flex-direction:row;display:flex;gap:6px;align-items:center;padding:6px 10px' }, useHS, h('span', null, h('span', { class: 'hs-tag' }, '高速鉄道'), '可以利用高速鐵路（含假想延伸站）')),
        h('button', { class: 'btn', type: 'submit' }, '查詢班次')));
    const out = h('div', { class: 'bk-out' });
    root.append(h('p', { class: 'lead' }, '特急為全車指定席（也有半價的立席特急券）；特快為 1・2 号車指定席、3 号車以後自由席；高速鐵路為全車指定席（沒有立席特急券，票價另計）。行程中只要有一段可以預約，就會列出完整行程（含轉乘）。'), h('div', { style: 'margin-top:12px' }, form), out);

    const pax = () => ({ a: Number(nA.value), c: Number(nC.value), s: Number(nS.value), n: Number(nA.value) + Number(nC.value) + Number(nS.value) });

    /** 一段搭乘（leg）的訂位資訊 */
    function legInfo(leg, date) {
      const trip = H.trips[leg.trip], st = trip.sv.stops.filter(s => s.pax !== false), base = trip.base;
      const s0 = leg.stops[0], sN = leg.stops[leg.stops.length - 1];
      let a = st.findIndex(s => s.station === s0.station && base + s.dep === s0.dep); if (a < 0) a = st.findIndex(s => s.station === s0.station);
      let b = st.findIndex((s, i) => i > a && s.station === sN.station && base + s.arr === sN.arr); if (b < 0) b = st.findIndex((s, i) => i > a && s.station === sN.station);
      const ri = H.reserveInfo(leg.sv);
      const info = { leg, ri, a, b, key: `${date}|${leg.sv.idx}|${((base % DAY) + DAY) % DAY}`, nStops: st.length };
      if (ri && a >= 0 && b > a) {
        info.occ = occupancy(info.key, ri.cars, st.length, s0.dep);
        info.free = 0; for (let ci = 0; ci < ri.reservedCars; ci++) info.occ[ci].forEach(segs => { if (isFree(segs, a, b)) info.free++; });
      } else info.ri = ri && a >= 0 && b > a ? ri : null;
      return info;
    }

    const state = {};
    function search() {
      state.sel = null; out.replaceChildren();
      const from = fSel.value, to = tSel.value, P = pax();
      if (from === to) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      if (P.n < 1 || P.n > 6) { out.append(h('p', { class: 'lead' }, '旅客人數請設定為 1～6 位。')); return; }
      const fVirtual = isV(from), tVirtual = isV(to);
      // 1.1.1：起訖站有一端是假想延伸站——先換成實際的銜接站（東平倉）去查真正的班次，假想那一段的票價另外合併進來。
      const anchor = (fVirtual || tVirtual) ? H.hsExtAnchorSt() : null;
      if ((fVirtual || tVirtual) && !anchor) { out.append(h('p', { class: 'lead' }, '万瀨高速鉄道線的假想延伸尚未設定銜接的車站，無法訂票。')); return; }
      const realFrom = fVirtual ? anchor.id : from, realTo = tVirtual ? anchor.id : to;
      const fLabel = labelOf(from), tLabel = labelOf(to);
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number), t0 = hh * 3600 + mm * 60;
      out.append(h('h2', { class: 'h2' }, `${fLabel} → ${tLabel}`, h('small', null, `${dIn.value}　${tIn.value} 以後${vSel.value ? `　經由 ${H.stName(vSel.value)}` : ''}${useHS.checked ? '　可利用高速鐵路' : ''}`)));
      // 兩端都是假想站，或其中一端剛好就是銜接站本身：真實的那一段長度是 0，沒有實際班次可以訂——
      // 假想延伸還沒蓋好、不是真的車，這種情況只能顯示票價試算，沒辦法走後面選位、發票那一套流程。
      if ((fVirtual || tVirtual) && realFrom === realTo) {
        const f = H.hsFareExt(fLabel, tLabel);
        if (!f) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到高速鉄道的票價。')); return; }
        out.append(h('p', { class: 'lead' }, '這段是地圖外尚未建成的假想延伸路段，沒有實際班次可以訂票，以下僅供票價試算參考。'), HK.hsFareDetailBox(H, f, fLabel, tLabel));
        return;
      }
      // 1.1.0：票價改成每個候選行程各自算（可能含高速鐵路，票價公式不同，不能共用一個 from→to 的一般票價）
      let list = H.searchEx(realFrom, realTo, t0, 10, { via: vSel.value || null, allowHighSpeed: useHS.checked || fVirtual || tVirtual }).map(j => ({ j, legs: j.legs.map(l => legInfo(l, dIn.value)), tf: H.ticketFaresFor(j.legs) }));
      if (!list.length) { out.append(h('p', { class: 'lead' }, '查不到兩站之間的路徑。')); return; }
      list = list.filter(x => x.tf && x.j.dep < DAY + t0 && x.legs.some(l => l.ri));
      if (!list.length) { out.append(h('p', { class: 'lead' }, '這個時間之後沒有含特急／特快／高速鐵路（可預約）的行程。可改用「時刻表與班次」查詢一般班次。'), h('p', null, h('a', { class: 'btn ghost', href: `timetable.html?tab=route&from=${realFrom}&to=${realTo}&t=${tIn.value}` }, '查詢所有班次（含轉乘）'))); return; }
      // 1.1.1：合併計算——假想延伸段的分區運費併入每個候選行程的乘車券總價（大人／兒童／優待都照比例加），
      // 並把算好的假想段資訊（ext：銜接站→假想站的分區運費與指定席特急券）留在每個候選行程上，選位、算總價、開票都要用到。
      const vZh = fVirtual ? fLabel : (tVirtual ? tLabel : null), anchorZh = anchor ? anchor.zh : null;
      if (vZh) list.forEach(c => {
        const ext = H.hsFareExt(anchorZh, vZh); c.ext = ext; c.anchorZh = anchorZh; c.vZh = vZh;
        if (ext) c.tf = { adult: c.tf.adult + ext.zoneFee, child: c.tf.child + Math.round(ext.zoneFee * H.cfg.childRatio), senior: c.tf.senior + Math.round(ext.zoneFee * H.cfg.seniorRatio), detail: c.tf.detail };
      });
      const ul = h('ul', { class: 'bk-list' });
      list.forEach(c => ul.append(h('li', null, h('button', { type: 'button', class: 'bk-trip', style: 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px', onclick: () => pick(c, c.tf) },
        h('span', { class: 'tm' }, `${HK.hm(c.j.dep)} → ${HK.hm(c.j.arr)}`),
        h('span', { style: 'display:inline-flex;gap:4px;flex-wrap:wrap' }, ...c.legs.map(l => HK.typeTag(l.leg.sv))),
        h('span', { class: 'nm', style: 'flex:1 1 220px' }, c.legs.map(l => l.leg.sv.routeName + (l.leg.gou ? ' ' + l.leg.gou : '')).join(' ＋ ') + (c.ext ? `　＋ 假想延伸 ${c.anchorZh}→${c.vZh}` : '')),
        h('span', { class: 'cars' }, c.legs.length > 1 ? `轉乘 ${c.legs.length - 1} 次` : '直達'),
        h('span', { class: 'yen' }, yen(c.tf.adult) + '〜')))));
      out.append(ul, h('p', { class: 'note' }, '價格為大人 1 位的乘車券；指定席／立席費用在下一步依各段選擇加算。', vZh ? h('span', null, `　已併入地圖外假想延伸路段（${anchorZh} → ${vZh}）的分區運費；該段的指定席特急券另計 ${yen(H.cfg.hsSeatFee)}／位（沒有實際車次，無法選位，僅供試算）。`) : null));
      out.append(h('div', { id: 'bk-seat' }));
    }

    function pick(c, tf) {
      const P = pax();
      // 1.1.0：高速鐵路沒有立席特急券可以當空位不足時的備案，沒位置也只能停在「指定席」（之後畫面會顯示空席不足）。
      const S = state.sel = { c, tf, P, ext: c.ext || null, anchorZh: c.anchorZh, vZh: c.vZh, legs: c.legs.map(l => ({ mode: !l.ri ? 'none' : (l.free >= P.n ? 'seat' : (l.ri.noStanding ? 'seat' : l.ri.mode === 'all' ? 'stand' : 'free')), seats: [], car: 0 })) };
      draw();
      document.getElementById('bk-seat').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function legFee(l, st) {
      if (!l.ri || st.mode === 'none') return 0;
      if (st.mode === 'seat') return l.ri.fee * state.sel.P.n;
      if (st.mode === 'stand') return l.ri.standFee * state.sel.P.n;
      return 0;
    }
    const modeLabel = (l, m) => m === 'seat' ? '指定席' : m === 'stand' ? '立席特急券' : m === 'free' ? '自由席' : '（乘車券のみ）';

    function totals() {
      const S = state.sel, tf = S.tf;
      const base = tf.adult * S.P.a + tf.child * S.P.c + tf.senior * S.P.s;
      let seats = 0; S.c.legs.forEach((l, i) => { seats += legFee(l, S.legs[i]); });
      // 1.1.1：假想延伸段（地圖外、沒有實際車次）的指定席特急券——全車指定席、不打折、沒有立席特急券，照人數各算一次。
      const extSeat = S.ext ? S.ext.seat * S.P.n : 0;
      return { base, seats: seats + extSeat, extSeat, total: base + seats + extSeat };
    }

    function draw() {
      const S = state.sel, box = document.getElementById('bk-seat'); box.replaceChildren();
      const tf = S.tf, P = S.P, T = totals();
      box.append(h('h2', { class: 'h2' }, '行程與座位', h('small', null, `${HK.hm(S.c.j.dep)} 發　旅客 ${P.n} 位`)));
      S.c.legs.forEach((l, i) => {
        const st = S.legs[i], sv = l.leg.sv, s0 = l.leg.stops[0], sN = l.leg.stops[l.leg.stops.length - 1];
        if (l.leg.walk) box.append(h('div', { class: 'note', style: 'margin:6px 0' }, `徒歩連絡：${H.stName(l.leg.walk.from)} → ${H.stName(l.leg.walk.to)}（約 ${Math.round(l.leg.walk.sec / 60)} 分）`));
        const head = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin-top:10px' }, HK.typeTag(sv), h('strong', null, sv.routeName), l.leg.gou ? h('span', { class: 'gou' }, l.leg.gou) : null, h('span', null, `${HK.hm(s0.dep)} ${H.stName(s0.station)} → ${HK.hm(sN.arr)} ${H.stName(sN.station)}`), h('span', { class: 'note', style: 'margin:0' }, H.reserveLabel(sv) || '指定席なし'));
        const blk = h('section', { style: 'border:1px solid var(--line,#d6e0db);border-radius:10px;padding:10px 12px;margin-bottom:8px' }, head);
        if (!l.ri) {
          blk.append(h('p', { class: 'note' }, 'この種別は指定席がありません。乘車券のみで乘車できます。'));
          box.append(blk); return;
        }
        const choose = (m) => () => { st.mode = m; st.seats = []; draw(); };
        const opts = [];
        const seatDisabled = l.free < P.n;
        opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'seat' ? '' : 'ghost'), disabled: seatDisabled, onclick: choose('seat') }, `指定席 ${yen(l.ri.fee)}／位${seatDisabled ? '（空席不足）' : ''}`));
        // 1.1.0：高速鐵路沒有立席特急券（noStanding）——只有指定席這一個選項，不能像特急那樣買站票逃過空位不足。
        if (l.ri.mode === 'all' && !l.ri.noStanding) opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'stand' ? '' : 'ghost'), onclick: choose('stand') }, `立席特急券 ${yen(l.ri.standFee)}／位（座位なし）`));
        else if (l.ri.mode === 'part') opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'free' ? '' : 'ghost'), onclick: choose('free') }, `自由席 ${yen(0)}（${l.ri.reservedCars + 1}号車以後・座位なし）`));
        blk.append(h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0' }, ...opts));
        if (st.mode === 'stand') blk.append(h('p', { class: 'note' }, '立席特急券は座位が保証されません。座位の指定はできません。'));
        if (st.mode === 'free') blk.append(h('p', { class: 'note' }, `自由席は座位が保証されません。座位の指定はできません。（${l.ri.reservedCars + 1}～${l.ri.cars}号車）`));
        if (st.mode === 'seat') blk.append(seatPicker(l, st, P));
        box.append(blk);
      });
      // 1.1.1：假想延伸段沒有真的車次、沒辦法選位，用一段固定的說明文字顯示在真實的乘車段下面。
      if (S.ext) box.append(h('section', { class: 'hs-field', style: 'border:1px solid var(--line,#d6e0db);border-radius:10px;padding:10px 12px;margin-bottom:8px' },
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center' }, h('span', { class: 'hs-tag' }, '高速鉄道'), h('strong', null, '万瀨高速鉄道線（假想延伸）'), h('span', null, `${S.anchorZh} → ${S.vZh}`)),
        h('p', { class: 'note' }, `地圖外尚未建成的假想延伸路段，沒有實際車次、無法選位；指定席特急券固定 ${yen(S.ext.seat)}／位（${yen(S.ext.seat)} × ${P.n} 位，不打折、沒有立席特急券）。`)));
      const go = h('button', { class: 'btn', type: 'button', disabled: !S.c.legs.every((l, i) => !l.ri || S.legs[i].mode !== 'seat' || S.legs[i].seats.length === P.n), onclick: () => ticket() }, '確認並發行車票');
      const rows = [[`乘車券（${labelOf(fSel.value)}→${labelOf(tSel.value)}）`, `大人 ${P.a} × ${yen(tf.adult)}` + (P.c ? `／兒童 ${P.c} × ${yen(tf.child)}` : '') + (P.s ? `／優待 ${P.s} × ${yen(tf.senior)}` : ''), yen(T.base)]];
      S.c.legs.forEach((l, i) => { if (l.ri) rows.push([`${l.leg.sv.routeName}${l.leg.gou ? ' ' + l.leg.gou : ''}　${modeLabel(l, S.legs[i].mode)}`, S.legs[i].mode === 'seat' ? `${yen(l.ri.fee)} × ${P.n}` : S.legs[i].mode === 'stand' ? `${yen(l.ri.standFee)} × ${P.n}` : '', yen(legFee(l, S.legs[i]))]); });
      if (S.ext) rows.push([`万瀨高速鉄道線（假想延伸 ${S.anchorZh}→${S.vZh}）　指定席特急券`, `${yen(S.ext.seat)} × ${P.n}`, yen(S.ext.seat * P.n)]);
      box.append(h('div', { class: 'fare-box', style: 'margin-top:12px' }, h('table', { class: 'tbl' }, h('tbody', null,
        rows.map(r => h('tr', null, h('th', null, r[0], r[1] ? h('small', { style: 'display:block;font-weight:400;color:var(--muted)' }, r[1]) : null), h('td', { style: 'text-align:right' }, r[2]))),
        h('tr', { class: 'tot' }, h('th', null, '合計'), h('td', { style: 'text-align:right;font-weight:700' }, yen(T.total))))),
        h('div', { class: 'rule' }, '乘車券以出發站～抵達站全程的最短路徑計算一次：' + tf.detail.path.map(id => H.stName(id)).join(' → ') + (S.ext ? ` → ${S.vZh}（假想延伸）` : '') + (S.c.legs.some(l => l.leg.walk) || S.c.j.endWalk ? '（步行連絡區間不另收費）' : '')),
        H.zonesConfigured ? null : h('div', { class: 'rule' }, '※ 收費區資料尚未設定，目前以未跨越任何區間計算。')),
        h('div', { style: 'margin-top:12px' }, go));
    }

    function seatPicker(l, st, P) {
      const ri = l.ri, wrap = h('div'), carTabs = h('div', { class: 'bk-cars' }), grid = h('div', { class: 'bk-grid' }), info = h('div', { class: 'bk-info' });
      wrap.append(carTabs, grid, info, h('div', { class: 'bk-legend' }, h('span', null, h('i', { class: 'st free' }), '空位'), h('span', null, h('i', { class: 'st sel' }), '已選'), h('span', null, h('i', { class: 'st taken' }), '已被預約')),
        h('p', { class: 'note' }, '1 号車＝進行方向最前端。' + (ri.mode === 'part' ? `指定席為 1～${ri.reservedCars} 号車。` : '')));
      const cars = l.occ.slice(0, ri.reservedCars);
      function d2() {
        carTabs.replaceChildren(...cars.map((car, ci) => {
          const free = car.filter(sg => isFree(sg, l.a, l.b)).length, mine = st.seats.filter(x => x.car === ci).length;
          return h('button', { type: 'button', class: 'bk-ct', 'aria-pressed': String(ci === st.car), onclick: () => { st.car = ci; d2(); } }, `${ci + 1}号車`, h('small', null, `空${free}${mine ? ` ✓${mine}` : ''}`));
        }));
        grid.replaceChildren(h('div', { class: 'bk-head' }, ...COLS.slice(0, 2).map(x => h('b', null, x)), h('span'), ...COLS.slice(2).map(x => h('b', null, x))));
        const car = cars[st.car];
        for (let r = 0; r < ROWS; r++) {
          const row = h('div', { class: 'bk-row' });
          for (let col = 0; col < 4; col++) {
            const k = r * 4 + col, free = isFree(car[k], l.a, l.b), on = st.seats.some(x => x.car === st.car && x.k === k);
            if (col === 2) row.append(h('span', { class: 'aisle' }, String(r + 1)));
            row.append(h('button', { type: 'button', class: 'seat ' + (on ? 'sel' : free ? 'free' : 'taken'), disabled: !free, 'aria-label': `${seatName(st.car, k)} ${free ? '空位' : '已被預約'}`, 'aria-pressed': String(on),
              onclick: () => { if (on) st.seats = st.seats.filter(x => !(x.car === st.car && x.k === k)); else { if (st.seats.length >= P.n) st.seats.shift(); st.seats.push({ car: st.car, k }); } draw(); } }, COLS[col]));
          }
          grid.append(row);
        }
        info.textContent = st.seats.length ? `已選（${st.seats.length}／${P.n}）：` + st.seats.map(x => seatName(x.car, x.k)).join('、') : `尚未選擇座位（需要 ${P.n} 個）`;
      }
      d2();
      return wrap;
    }

    function ticket() {
      const S = state.sel, T = totals(), P = S.P, tf = S.tf, from = fSel.value, to = tSel.value;
      const no = String(hash(S.c.legs.map(l => l.key).join('|') + S.legs.map(x => x.seats.map(y => y.car + ':' + y.k).join(',')).join(';')) % 1e10).padStart(10, '0');
      const bar = h('div', { class: 'tk-bar', 'aria-hidden': 'true' });
      for (let i = 0; i < 46; i++) bar.append(h('i', { style: `width:${1 + (hash(no + i) % 3)}px` }));
      const legDl = S.c.legs.map((l, i) => {
        const st = S.legs[i], sv = l.leg.sv, s0 = l.leg.stops[0], sN = l.leg.stops[l.leg.stops.length - 1];
        const seat = !l.ri ? '指定席なし' : st.mode === 'seat' ? st.seats.map(x => seatName(x.car, x.k)).join('、') : st.mode === 'stand' ? '立席（座位なし）' : `自由席（${l.ri.reservedCars + 1}号車以後）`;
        return h('div', { style: 'border-top:1px dashed var(--line,#ccd);padding:8px 0' },
          h('div', { style: 'font-weight:700' }, HK.typeTag(sv), ' ', sv.routeName, l.leg.gou ? ' ' + l.leg.gou : '', '　', H.destOf(sv, l.leg.board) + '行'),
          h('div', null, `${HK.hm(s0.dep)} ${H.stName(s0.station)} → ${HK.hm(sN.arr)} ${H.stName(sN.station)}`),
          h('div', null, `${modeLabel(l, st.mode)}：${seat}`));
      });
      const fareRows = [h('tr', null, h('th', null, `乘車券 大人 ${P.a} × ${yen(tf.adult)}`), h('td', null, yen(tf.adult * P.a)))];
      if (P.c) fareRows.push(h('tr', null, h('th', null, `乘車券 兒童 ${P.c} × ${yen(tf.child)}`), h('td', null, yen(tf.child * P.c))));
      if (P.s) fareRows.push(h('tr', null, h('th', null, `乘車券 優待 ${P.s} × ${yen(tf.senior)}`), h('td', null, yen(tf.senior * P.s))));
      S.c.legs.forEach((l, i) => { if (l.ri) fareRows.push(h('tr', null, h('th', null, `${l.leg.sv.routeName}${l.leg.gou ? ' ' + l.leg.gou : ''} ${modeLabel(l, S.legs[i].mode)}`), h('td', null, yen(legFee(l, S.legs[i]))))); });
      if (S.ext) fareRows.push(h('tr', null, h('th', null, `万瀨高速鉄道線（假想延伸）指定席特急券 × ${P.n}`), h('td', null, yen(S.ext.seat * P.n))));
      // 1.1.1：假想延伸段沒有實際車次，車票上明確標示這一段只是試算參考，不要讓人誤會真的能搭。
      const extDl = S.ext ? h('div', { style: 'border-top:1px dashed var(--line,#ccd);padding:8px 0' },
        h('div', { style: 'font-weight:700' }, h('span', { class: 'hs-tag' }, '高速鉄道'), ' 万瀨高速鉄道線（假想延伸，地圖外尚未建成）'),
        h('div', null, `${S.anchorZh} → ${S.vZh}`),
        h('div', null, `指定席特急券：${yen(S.ext.seat)} × ${P.n}（沒有實際車次，無法選位，僅供票價試算參考）`)) : null;
      const tk = h('article', { class: 'tk' },
        h('header', null, h('img', { src: 'assets/img/mark-dark.png', alt: '', width: 28, height: 28 }), h('b', null, '光瀨都市鉄道'), h('span', null, '乗車券・特急券 / TICKET')),
        h('div', { class: 'tk-main' }, h('div', { class: 'tk-st' }, h('small', null, 'FROM'), h('strong', null, labelOf(from)), h('em', null, HK.hm(S.c.j.dep) + ' 発')), h('div', { class: 'tk-arrow' }, '→'), h('div', { class: 'tk-st' }, h('small', null, 'TO'), h('strong', null, labelOf(to)), h('em', null, HK.hm(S.c.j.arr) + ' 着'))),
        h('dl', { class: 'tk-dl' },
          h('div', null, h('dt', null, '乗車日'), h('dd', null, dIn.value.replaceAll('-', '/'))),
          h('div', null, h('dt', null, '旅客'), h('dd', null, `大人 ${P.a}` + (P.c ? `／兒童 ${P.c}` : '') + (P.s ? `／優待 ${P.s}` : '')))),
        h('div', { style: 'padding:0 16px' }, ...legDl, extDl),
        h('table', { class: 'tbl tk-fare' }, h('tbody', null, ...fareRows, h('tr', { class: 'tot' }, h('th', null, '合計'), h('td', null, yen(T.total))))),
        h('footer', null, bar, h('span', null, '券番 ' + no.replace(/(\d{4})(\d{4})(\d{2})/, '$1-$2-$3')), h('span', null, '本券為模擬發行，不會儲存。', S.ext ? h('span', null, '　含假想延伸段部分僅供試算，不代表真的可以搭乘。') : null)));
      const box = document.getElementById('bk-seat');
      box.replaceChildren(h('h2', { class: 'h2' }, '車票'), tk, h('div', { class: 'noprint', style: 'margin-top:12px;display:flex;gap:10px' },
        h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, '列印'), h('button', { class: 'btn ghost', type: 'button', onclick: () => search() }, '重新查詢')));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (q.get('from') && q.get('to')) search();
  }
  HK.booking = booking;
})();
