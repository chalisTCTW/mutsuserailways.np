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
  // 1.9.0：商務車廂（1+2 配置）用 3 欄，沿用日本「グリーン車」慣例座位代號（A／C／D，中間 B 空出當走道字母）。
  const COLS_BIZ = ['A', 'C', 'D'];
  const colsOf = (car, ri) => (ri && ri.bizCars && ri.bizCars.includes(car + 1)) ? COLS_BIZ : COLS;

  /* 決定性亂數 */
  function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** 這班車的座位占用：回傳 booked[car][seatIdx] = [[from,to),...]（以停靠站序號計） */
  function occupancy(key, cars, nStops, depSec, carSeats) {   // carSeats＝每節車廂座位數的陣列（依車廂序，1.9.0 起取代單一的 edge 數字）；省略＝每節都是 ROWS*4 席
    const r = rng(hash(key)), hr = depSec / 3600 % 24;
    const peak = (hr >= 6.5 && hr < 9.5) || (hr >= 16.5 && hr < 19.5);
    const load = Math.min(0.92, Math.max(0.12, (peak ? 0.72 : hr >= 22 || hr < 6 ? 0.18 : 0.42) + (r() - 0.5) * 0.3));
    const out = [];
    for (let c = 0; c < cars; c++) {
      const carLoad = Math.min(0.95, Math.max(0.05, load + (r() - 0.5) * 0.2)), seats = [];
      for (let k = 0, nSeat = (carSeats && carSeats[c] != null) ? carSeats[c] : ROWS * 4; k < nSeat; k++) {
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
  const seatName = (car, k, ri) => { const ca = colsOf(car, ri); return `${car + 1}号車 ${Math.floor(k / ca.length) + 1}${ca[k % ca.length]}`; };

  function booking(H, root) {
    const realRoot = root; root = h('div', { class: 'bk-route' });
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
        h('label', { class: 'f hs-field', style: 'flex-direction:row;display:flex;gap:6px;align-items:center;padding:6px 10px' }, useHS, h('span', null, h('span', { class: 'hs-tag' }, '高速鉄道'), '可以利用高速鐵路（含延伸路段）')),
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
        info.occ = occupancy(info.key, ri.cars, st.length, s0.dep, ri.carSeats);
        info.free = 0; for (let ci = 0; ci < ri.reservedCars; ci++) info.occ[ci].forEach(segs => { if (isFree(segs, a, b)) info.free++; });
      } else info.ri = ri && a >= 0 && b > a ? ri : null;
      return info;
    }

    /** 1.1.2：延伸段（H.hsExtLeg 合成的 leg）的訂位資訊——延伸段已經視為通車，跟真正班次一樣可以選位、開票，
     *  只是沒有 H.trips 可查（它本來就不是遊戲裡真正存在的班次），座位占用改直接用這段自己的起訖站／出發時刻當種子，
     *  只有一段（a=0,b=1），結構跟 legInfo() 回傳的形狀一致，後面選位／車票畫面都不用另外特判。 */
    function extLegInfo(extLeg, date) {
      // 1.1.3：延伸段現在可能有中間站（H.hsExtLeg 已補齊 lo→hi 全部站），不能再假設只有頭尾兩筆，
      // 占位／選位一律用完整的 stops.length 當站數、從第一站（a=0）坐到最後一站（b=nStops-1）。
      const ri = H.reserveInfo(extLeg.sv), s0 = extLeg.stops[0], s1 = extLeg.stops[extLeg.stops.length - 1], nStops = extLeg.stops.length;
      const key = `ext|${s0.station}|${s1.station}|${date}|${((s0.dep % DAY) + DAY) % DAY}`;
      const info = { leg: extLeg, ri, a: 0, b: nStops - 1, key, nStops };
      info.occ = occupancy(key, ri.cars, nStops, s0.dep, ri.carSeats);
      info.free = 0; for (let ci = 0; ci < ri.reservedCars; ci++) info.occ[ci].forEach(segs => { if (isFree(segs, info.a, info.b)) info.free++; });
      return info;
    }

    /** 1.2.4：延伸段併進相鄰高速鉄道班次後的訂位資訊——同一班車、座位連續：
     *  停靠站序列＝（真實班次的停靠站）＋（延伸段多出來的站），占位資料依延伸後的總站數重新產生，
     *  乘車區間 a～b 往延伸方向對應延伸後的站序，所以一次選位就涵蓋真實段＋延伸段。 */
    function mergeLegInfo(base, merged, extLeg, atEnd) {
      const info = { ...base, leg: merged };
      if (!base.ri || base.a < 0 || base.b <= base.a) return info;
      const extN = extLeg.stops.length - 1;
      let a, b;
      if (atEnd) { a = base.a; b = base.b + extN; } else { a = 0; b = extN + (base.b - base.a); }
      info.a = a; info.b = b; info.nStops = b + 1;
      info.key = base.key + '|x' + extLeg.stops[atEnd ? extLeg.stops.length - 1 : 0].station;
      info.occ = occupancy(info.key, base.ri.cars, info.nStops, merged.stops[0].dep, base.ri.carSeats);
      info.free = 0; for (let ci = 0; ci < base.ri.reservedCars; ci++) info.occ[ci].forEach(segs => { if (isFree(segs, a, b)) info.free++; });
      return info;
    }

    const state = {};
    function search() {
      state.sel = null; out.replaceChildren();
      const from = fSel.value, to = tSel.value, P = pax();
      if (from === to) { out.append(h('p', { class: 'lead' }, '請選擇不同的出發站與抵達站。')); return; }
      if (P.n < 1 || P.n > 6) { out.append(h('p', { class: 'lead' }, '旅客人數請設定為 1～6 位。')); return; }
      const fVirtual = isV(from), tVirtual = isV(to);
      // 1.1.1：起訖站有一端是万瀨高速鉄道線的延伸站——先換成實際的銜接站去查真正的班次，延伸段的票價另外合併進來。
      // 2.0.0：改用 H.bestHSAnchorSt 動態選距離目的地最近的轉乘點，而非固定東平倉。
      // bestHSAnchorSt 需要傳「一般鐵路側的真實站 id」才能計算距離；假想站不是真實站，要用另一端（非假想的那端）。
      // 若兩端都是假想站則走下方 realFrom===realTo 的 branch，不到這裡。
      const anchor = (fVirtual || tVirtual)
        ? H.bestHSAnchorSt(fVirtual ? to : from)
        : null;
      if ((fVirtual || tVirtual) && !anchor) { out.append(h('p', { class: 'lead' }, '万瀨高速鉄道線的延伸段尚未設定銜接的車站，無法訂票。')); return; }
      const realFrom = fVirtual ? anchor.id : from, realTo = tVirtual ? anchor.id : to;
      const fLabel = labelOf(from), tLabel = labelOf(to);
      const [hh, mm] = (tIn.value || '00:00').split(':').map(Number), t0 = hh * 3600 + mm * 60;
      out.append(h('h2', { class: 'h2' }, `${fLabel} → ${tLabel}`, h('small', null, `${dIn.value}　${tIn.value} `, '以後', ...(vSel.value ? ['　', '經由', ` ${H.stName(vSel.value)}`] : []), ...(useHS.checked ? ['　', '可利用高速鐵路'] : []))));
      let list;
      // 1.1.2：兩端都是延伸站，或其中一端剛好就是銜接站本身：真實的那一段長度是 0，整段都是延伸段——
      // 延伸段已經通車，合成一筆只有這一段的候選行程，跟真正班次一樣可以選位、開票。
      if ((fVirtual || tVirtual) && realFrom === realTo) {
        const extLeg = H.hsExtLeg(fLabel, tLabel, t0);
        if (!extLeg) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到高速鉄道的班次。')); return; }
        const li = extLegInfo(extLeg, dIn.value);
        const j = { dep: extLeg.stops[0].dep, arr: extLeg.stops[extLeg.stops.length - 1].arr, legs: [extLeg] };
        // detail.path 原本是 H.hsFareExt 回傳的站名陣列（給獨立票價查詢欄位用），這裡換成跟真正班次一致的「站 id 陣列」，
        // 車票畫面的「計算所用的路徑」才能跟真正行程一樣统一用 H.stName(id) 顯示，不用再另外特判。
        const tf = { adult: extLeg.fare.zoneFee, child: Math.round(extLeg.fare.zoneFee * H.cfg.childRatio), senior: Math.round(extLeg.fare.zoneFee * H.cfg.seniorRatio), detail: { ...extLeg.fare, path: extLeg.stops.map(x => x.station) } };
        list = [{ j, legs: [li], tf }];
      } else {
        // 1.1.0：票價改成每個候選行程各自算（可能含高速鐵路，票價公式不同，不能共用一個 from→to 的一般票價）
        list = H.searchEx(realFrom, realTo, t0, 10, { via: vSel.value || null, allowHighSpeed: useHS.checked || fVirtual || tVirtual }).map(j => ({ j, legs: j.legs.map(l => legInfo(l, dIn.value)), tf: H.ticketFaresFor(j.legs) }));
        if (!list.length) { out.append(h('p', { class: 'lead' }, '查不到兩站之間的路徑。')); return; }
        // 2.0.0：移除舊的「沒有可預約段就整個不顯示」限制——所有行程都列出；
        // 有可預約段的行程可選座位、發行指定席券；沒有的行程只發乗車券，說明文字另外提示。
        list = list.filter(x => x.tf && x.j.dep < DAY + t0);
        // 1.1.2：延伸段接在真實路段之後（或之前）——已經通車，直接合成一段真正可以選位的 leg 併進候選行程，
        // 不是只顯示票價試算；延伸段延續的「○号」優先沿用銜接站旁那一段真正高速鉄道班次的号碼（同一班車開過去）。
        const vZh = fVirtual ? fLabel : (tVirtual ? tLabel : null), anchorZh = anchor ? anchor.zh : null;
        if (vZh) list = list.filter(c => {
          // 1.2.4：延伸段與相鄰的高速鉄道班次併成「同一班車」（H.attachExtLeg）：不再多一段、不會在銜接站轉乘，
          // 座位是同一班車的連續座位，指定席特急券也只收一次；相鄰那段不是高速鉄道時才保留成獨立一段（真的要換車）。
          const addFare = (extStations) => {
            c.tf = { adult: c.tf.adult + extLeg.fare.zoneFee, child: c.tf.child + Math.round(extLeg.fare.zoneFee * H.cfg.childRatio), senior: c.tf.senior + Math.round(extLeg.fare.zoneFee * H.cfg.seniorRatio), detail: { ...c.tf.detail, path: tVirtual ? [...c.tf.detail.path, ...extStations] : [...extStations, ...c.tf.detail.path] } };
          };
          let extLeg;
          if (tVirtual) {
            const lastReal = c.legs[c.legs.length - 1];
            extLeg = H.hsExtLeg(anchorZh, vZh, c.j.arr + (lastReal.leg.sv.isHS && !lastReal.leg.walk ? 0 : H.minTransfer), lastReal.leg.sv.isHS ? lastReal.leg.gou : '');
            if (!extLeg) return false;
            const at = H.attachExtLeg(c.legs.map(l => l.leg), extLeg, true);
            if (at.merged) c.legs[at.idx] = mergeLegInfo(c.legs[at.idx], at.legs[at.idx], extLeg, true); else c.legs.push(extLegInfo(extLeg, dIn.value));
            c.j = { ...c.j, arr: extLeg.stops[extLeg.stops.length - 1].arr };
            addFare(extLeg.stops.slice(1).map(x => x.station));
          } else {
            const firstReal = c.legs[0];
            extLeg = H.hsExtLeg(vZh, anchorZh, c.j.dep - H.hsExtDuration(vZh, anchorZh) - (firstReal.leg.sv.isHS && !firstReal.leg.walk ? 0 : H.minTransfer), firstReal.leg.sv.isHS ? firstReal.leg.gou : '');
            if (!extLeg) return false;
            const at = H.attachExtLeg(c.legs.map(l => l.leg), extLeg, false);
            if (at.merged) c.legs[at.idx] = mergeLegInfo(c.legs[at.idx], at.legs[at.idx], extLeg, false); else c.legs.unshift(extLegInfo(extLeg, dIn.value));
            c.j = { ...c.j, dep: extLeg.stops[0].dep };
            addFare(extLeg.stops.slice(0, -1).map(x => x.station));
          }
          return true;
        });
        if (!list.length) { out.append(h('p', { class: 'lead' }, '這兩站之間查不到可以合併計算的高速鉄道延伸段票價。')); return; }
      }
      const ul = h('ul', { class: 'bk-list' });
      list.forEach(c => { const tr = H.legsTransfers(c.legs.map(l => l.leg)); ul.append(h('li', null, h('button', { type: 'button', class: 'bk-trip', style: 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px', onclick: () => pick(c, c.tf) },
        h('span', { class: 'tm' }, `${HK.hm(c.j.dep)} → ${HK.hm(c.j.arr)}`),
        h('span', { style: 'display:inline-flex;gap:4px;flex-wrap:wrap' }, ...c.legs.map(l => HK.typeTag(l.leg.sv))),
        h('span', { class: 'nm', style: 'flex:1 1 220px' }, c.legs.map(l => l.leg.sv.routeName + (l.leg.gou ? ' ' + l.leg.gou : '')).join(' ＋ ')),
        h('span', { class: 'cars' }, tr ? `轉乘 ${tr} 次` : '直達'),
        h('span', { class: 'yen' }, yen(c.tf.adult) + '〜')))); });
      out.append(ul, h('p', { class: 'note' }, '價格為大人 1 位的乘車券；指定席／立席費用在下一步依各段選擇加算。'));
      out.append(h('div', { id: 'bk-seat' }));
    }

    // 1.9.0：有商務車廂（ri.bizCars）的班次（目前只有高速鉄道），預設選一般車廂、車廂 tab 停在第一節非商務車廂。
    function firstCarIdx(ri, cls) {
      if (!ri || !ri.bizCars || !ri.bizCars.length) return 0;
      const bizSet = new Set(ri.bizCars.map(n => n - 1));
      for (let c = 0; c < ri.cars; c++) { if (bizSet.has(c) === (cls === 'biz')) return c; }
      return 0;
    }
    function pick(c, tf) {
      const P = pax();
      // 1.1.0：高速鐵路沒有立席特急券可以當空位不足時的備案，沒位置也只能停在「指定席」（之後畫面會顯示空席不足）。
      const S = state.sel = { c, tf, P, legs: c.legs.map(l => ({ mode: !l.ri ? 'none' : (l.free >= P.n ? 'seat' : (l.ri.noStanding ? 'seat' : l.ri.mode === 'all' ? 'stand' : 'free')), seats: [], cls: 'std', car: firstCarIdx(l.ri, 'std') })) };
      draw();
      document.getElementById('bk-seat').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function legFee(l, st) {
      if (!l.ri || st.mode === 'none') return 0;
      // 1.9.0：商務車廂（st.cls==='biz'）用 ri.bizFee，其餘車廂照舊用 ri.fee。非商務車種（ri.bizFee 未設定）不受影響。
      if (st.mode === 'seat') return (st.cls === 'biz' && l.ri.bizFee ? l.ri.bizFee : l.ri.fee) * state.sel.P.n;
      if (st.mode === 'stand') return l.ri.standFee * state.sel.P.n;
      return 0;
    }
    const modeLabel = (l, m) => m === 'seat' ? '指定席' : m === 'stand' ? '立席特急券' : m === 'free' ? '自由席' : '（乘車券のみ）';

    function totals() {
      const S = state.sel, tf = S.tf;
      const base = tf.adult * S.P.a + tf.child * S.P.c + tf.senior * S.P.s;
      // 1.1.2：延伸段已經通車，跟真正班次一樣是 S.c.legs 裡的一段，指定席費用一起算在這個迴圈裡，不用再另外加。
      let seats = 0; S.c.legs.forEach((l, i) => { seats += legFee(l, S.legs[i]); });
      return { base, seats, total: base + seats };
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
        const chooseCls = (cls) => () => { st.mode = 'seat'; st.cls = cls; st.car = firstCarIdx(l.ri, cls); st.seats = []; draw(); };
        const opts = [];
        const seatDisabled = l.free < P.n;
        // 1.9.0：有商務車廂（ri.bizCars）的種別（目前只有高速鉄道）分兩顆按鈕：商務車廂（1・2 号車／貴）、一般車廂（3 号車以後／原價）。
        if (l.ri.bizCars && l.ri.bizCars.length) {
          opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'seat' && st.cls === 'biz' ? '' : 'ghost'), disabled: seatDisabled, onclick: chooseCls('biz') }, `指定席（商務車廂・${l.ri.bizCars.join('・')}号車）${yen(l.ri.bizFee)}／位${seatDisabled ? '（空席不足）' : ''}`));
          opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'seat' && st.cls !== 'biz' ? '' : 'ghost'), disabled: seatDisabled, onclick: chooseCls('std') }, `指定席（一般車廂）${yen(l.ri.fee)}／位${seatDisabled ? '（空席不足）' : ''}`));
        } else {
          opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'seat' ? '' : 'ghost'), disabled: seatDisabled, onclick: choose('seat') }, `指定席 ${yen(l.ri.fee)}／位${seatDisabled ? '（空席不足）' : ''}`));
        }
        // 1.1.0：高速鐵路沒有立席特急券（noStanding）——只有指定席這一個選項，不能像特急那樣買站票逃過空位不足。
        if (l.ri.mode === 'all' && !l.ri.noStanding) opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'stand' ? '' : 'ghost'), onclick: choose('stand') }, `立席特急券 ${yen(l.ri.standFee)}／位（座位なし）`));
        else if (l.ri.mode === 'part') opts.push(h('button', { type: 'button', class: 'btn sm ' + (st.mode === 'free' ? '' : 'ghost'), onclick: choose('free') }, `自由席 ${yen(0)}（${l.ri.reservedCars + 1}号車以後・座位なし）`));
        blk.append(h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0' }, ...opts));
        if (st.mode === 'stand') blk.append(h('p', { class: 'note' }, '立席特急券は座位が保証されません。座位の指定はできません。'));
        if (st.mode === 'free') blk.append(h('p', { class: 'note' }, `自由席は座位が保証されません。座位の指定はできません。（${l.ri.reservedCars + 1}～${l.ri.cars}号車）`));
        if (st.mode === 'seat') blk.append(seatPicker(l, st, P));
        box.append(blk);
      });
      const go = h('button', { class: 'btn', type: 'button', disabled: !S.c.legs.every((l, i) => !l.ri || S.legs[i].mode !== 'seat' || S.legs[i].seats.length === P.n), onclick: () => ticket() }, '確認並發行車票');
      const rows = [[`乘車券（${labelOf(fSel.value)}→${labelOf(tSel.value)}）`, `大人 ${P.a} × ${yen(tf.adult)}` + (P.c ? `／兒童 ${P.c} × ${yen(tf.child)}` : '') + (P.s ? `／優待 ${P.s} × ${yen(tf.senior)}` : ''), yen(T.base)]];
      // 1.1.2：延伸段已經通車，跟真正班次一樣是 S.c.legs 裡的一段，這裡的迴圈本來就會把它的指定席費用一起列出來。
      S.c.legs.forEach((l, i) => { if (l.ri) rows.push([`${l.leg.sv.routeName}${l.leg.gou ? ' ' + l.leg.gou : ''}　${modeLabel(l, S.legs[i].mode)}${S.legs[i].mode === 'seat' && S.legs[i].cls === 'biz' ? '（商務車廂）' : ''}`, S.legs[i].mode === 'seat' ? `${yen(S.legs[i].cls === 'biz' && l.ri.bizFee ? l.ri.bizFee : l.ri.fee)} × ${P.n}` : S.legs[i].mode === 'stand' ? `${yen(l.ri.standFee)} × ${P.n}` : '', yen(legFee(l, S.legs[i]))]); });
      box.append(h('div', { class: 'fare-box', style: 'margin-top:12px' }, h('table', { class: 'tbl' }, h('tbody', null,
        rows.map(r => h('tr', null, h('th', null, r[0], r[1] ? h('small', { style: 'display:block;font-weight:400;color:var(--muted)' }, r[1]) : null), h('td', { style: 'text-align:right' }, r[2]))),
        h('tr', { class: 'tot' }, h('th', null, '合計'), h('td', { style: 'text-align:right;font-weight:700' }, yen(T.total))))),
        h('div', { class: 'rule' }, '乘車券以出發站～抵達站全程的最短路徑計算一次：' + tf.detail.path.map(id => H.stName(id)).join(' → ') + (S.c.legs.some(l => l.leg.walk) || S.c.j.endWalk ? '（步行連絡區間不另收費）' : '')),
        H.zonesConfigured ? null : h('div', { class: 'rule' }, '※ 收費區資料尚未設定，目前以未跨越任何區間計算。')),
        h('div', { style: 'margin-top:12px' }, go));
    }

    function seatPicker(l, st, P) {
      const ri = l.ri, wrap = h('div'), carTabs = h('div', { class: 'bk-cars' }), grid = h('div', { class: 'bk-grid' }), info = h('div', { class: 'bk-info' });
      wrap.append(carTabs, grid, info, h('div', { class: 'bk-legend' }, h('span', null, h('i', { class: 'st free' }), '空位'), h('span', null, h('i', { class: 'st sel' }), '已選'), h('span', null, h('i', { class: 'st taken' }), '已被預約')),
        h('p', { class: 'note' }, '1 号車＝進行方向最前端。' + (ri.mode === 'part' ? `指定席為 1～${ri.reservedCars} 号車。` : '')));
      const cars = l.occ.slice(0, ri.reservedCars);
      // 1.9.0：有商務車廂時，車廂 tab 只顯示目前選擇的那一種（商務＝ri.bizCars、一般＝其餘），不能混選；
      // 商務車廂（1+2）用 3 欄、走道在第 1 欄之後，一般車廂（2+2）維持原本 4 欄、走道在第 2 欄之後。
      const bizSet = new Set((ri.bizCars || []).map(n => n - 1));
      function d2() {
        const tabIdx = bizSet.size ? cars.map((_, i) => i).filter(i => (st.cls === 'biz') === bizSet.has(i)) : cars.map((_, i) => i);
        if (!tabIdx.includes(st.car)) st.car = tabIdx[0];
        carTabs.replaceChildren(...tabIdx.map(ci => {
          const car = cars[ci], free = car.filter(sg => isFree(sg, l.a, l.b)).length, mine = st.seats.filter(x => x.car === ci).length;
          return h('button', { type: 'button', class: 'bk-ct', 'aria-pressed': String(ci === st.car), onclick: () => { st.car = ci; d2(); } }, `${ci + 1}号車`, h('small', null, `空${free}${mine ? ` ✓${mine}` : ''}`));
        }));
        const isBiz = bizSet.has(st.car), ca = isBiz ? COLS_BIZ : COLS, aisleAt = isBiz ? 1 : 2;
        grid.className = 'bk-grid' + (isBiz ? ' biz' : '');
        grid.replaceChildren(h('div', { class: 'bk-head' }, ...ca.slice(0, aisleAt).map(x => h('b', null, x)), h('span'), ...ca.slice(aisleAt).map(x => h('b', null, x))));
        const car = cars[st.car];
        for (let r = 0, rows = Math.ceil(car.length / ca.length); r < rows; r++) {
          const row = h('div', { class: 'bk-row' });
          for (let col = 0; col < ca.length; col++) {
            const k = r * ca.length + col, free = isFree(car[k], l.a, l.b), on = st.seats.some(x => x.car === st.car && x.k === k);
            if (col === aisleAt) row.append(h('span', { class: 'aisle' }, String(r + 1)));
            row.append(h('button', { type: 'button', class: 'seat ' + (on ? 'sel' : free ? 'free' : 'taken'), disabled: !free, 'aria-label': `${seatName(st.car, k, ri)} ${free ? '空位' : '已被預約'}`, 'aria-pressed': String(on),
              onclick: () => { if (on) st.seats = st.seats.filter(x => !(x.car === st.car && x.k === k)); else { if (st.seats.length >= P.n) st.seats.shift(); st.seats.push({ car: st.car, k }); } draw(); } }, ca[col]));
          }
          grid.append(row);
        }
        info.textContent = st.seats.length ? `已選（${st.seats.length}／${P.n}）：` + st.seats.map(x => seatName(x.car, x.k, ri)).join('、') : `尚未選擇座位（需要 ${P.n} 個）`;
      }
      d2();
      return wrap;
    }

    /* 1.2.4：車票＝一張全區間「乘車券」（起訖站的基礎乘車費用，不含任何指定席費用）＋每個指定席車次各一張獨立的「特急券」。
     * 延伸段已與相鄰高速鉄道班次併成同一班車，所以同一個車次只會有一張特急券。
     * 票面樣式有三種，由 site-config.js 的 ticketStyle 決定：'A' 硬券・指定券風、'B' 識別色・Web 票卡、'C' 券売機・感熱紙風。 */
    function ticket() {
      const S = state.sel, T = totals(), P = S.P, tf = S.tf, from = fSel.value, to = tSel.value;
      const style = 'A';   /* 1.2.5：票面定案為 A；B／C 保留在程式裡但不再使用 */
      const baseNo = hash(S.c.legs.map(l => l.key).join('|') + S.legs.map(x => x.seats.map(y => y.car + ':' + y.k).join(',')).join(';'));
      const noFor = suffix => String((baseNo + hash(suffix)) % 1e10).padStart(10, '0');
      const noText = no => no.replace(/(\d{4})(\d{4})(\d{2})/, '$1-$2-$3');
      const barOf = no => { const bar = h('div', { class: 'tk-bar', 'aria-hidden': 'true' }); for (let i = 0; i < 46; i++) bar.append(h('i', { style: `width:${1 + (hash(no + i) % 3)}px` })); return bar; };
      const date = dIn.value.replaceAll('-', '/');
      const paxText = `大人 ${P.a}` + (P.c ? `／兒童 ${P.c}` : '') + (P.s ? `／優待 ${P.s}` : '');
      const HSC = H.cfg.hsColor || '#136880';
      const pretty = x => { x = String(x || ''); return x === x.toUpperCase() ? x.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : x; };
      const enOf = id => { const e = isV(id) ? vInfo(id) : (H.stById[id] || {}); return pretty((e && e.en) || '') || (isV(id) ? (vInfo(id) || {}).zh : H.stName(id)); };
      const paxEn = `Adult ${P.a}` + (P.c ? ` / Child ${P.c}` : '') + (P.s ? ` / Senior ${P.s}` : '');
      const seatEn = (car, k, ri) => { const ca = colsOf(car, ri); return `Car ${car + 1} Seat ${Math.floor(k / ca.length) + 1}${ca[k % ca.length]}`; };
      const modeEnOf = m => m === 'seat' ? 'Reserved' : m === 'stand' ? 'Standing' : m === 'free' ? 'Non-reserved' : 'Fare only';

      // 一、全區間乘車券
      const baseRows = [[`乘車券 大人 ${P.a} × ${yen(tf.adult)}`, yen(tf.adult * P.a)]];
      if (P.c) baseRows.push([`乘車券 兒童 ${P.c} × ${yen(tf.child)}`, yen(tf.child * P.c)]);
      if (P.s) baseRows.push([`乘車券 優待 ${P.s} × ${yen(tf.senior)}`, yen(tf.senior * P.s)]);
      const base = { no: baseNo ? noFor('base') : '', col: 'var(--g1)', kind: '乗車券', en: 'TICKET', sub: '光瀨都市鉄道', from: labelOf(from), to: labelOf(to), fromEn: enOf(from), toEn: enOf(to), paxEn, viaEn: tf.detail.path.map(enOf).join(' → '), dep: HK.hm(S.c.j.dep), arr: HK.hm(S.c.j.arr), date, pax: paxText, via: tf.detail.path.map(id => H.stName(id)).join(' → '), rows: baseRows, total: yen(T.base) };

      // 二、每個有指定席（l.ri）的車次各一張特急券
      const ex = [];
      S.c.legs.forEach((l, i) => {
        if (!l.ri) return;
        const st = S.legs[i], sv = l.leg.sv, s0 = l.leg.stops[0], sN = l.leg.stops[l.leg.stops.length - 1];
        const seat = st.mode === 'seat' ? st.seats.map(x => seatName(x.car, x.k, l.ri)).join('、') + (st.cls === 'biz' ? '（商務車廂）' : '') : st.mode === 'stand' ? '立席（座位なし）' : `自由席（${l.ri.reservedCars + 1}号車以後）`;
        ex.push({ no: noFor('ex' + i), col: sv.isHS ? HSC : 'var(--g1)', kind: '特急券', en: 'EXPRESS TICKET', hs: !!sv.isHS, sub: sv.routeName, from: H.stName(s0.station), to: H.stName(sN.station), fromEn: enOf(s0.station), toEn: enOf(sN.station), subEn: pretty((l.leg.sv.route && l.leg.sv.route.en) || ''), modeEn: modeEnOf(st.mode), seatBi: st.mode === 'seat' ? h('span', { class: 'bi' }, h('span', { class: 'ja', lang: 'ja' }, st.seats.map(x => seatName(x.car, x.k, l.ri)).join('、')), h('span', { class: 'en', lang: 'en' }, st.seats.map(x => seatEn(x.car, x.k, l.ri)).join(', '))) : h('span', { class: 'bi' }, h('span', { class: 'ja', lang: 'ja' }, seat), h('span', { class: 'en', lang: 'en' }, st.mode === 'stand' ? 'Standing (no seat)' : 'Non-reserved seating')), dep: HK.hm(s0.dep), arr: HK.hm(sN.arr), date, sv, gou: l.leg.gou || '', mode: modeLabel(l, st.mode), seat, fee: yen(legFee(l, st)), n: P.n, stops: l.leg.stops.length - 1 });
      });

      const logo = () => h('img', { src: 'assets/img/mark-dark.png', alt: '', width: 24, height: 24 });
      const tail = (t) => [barOf(t.no), h('span', null, '券番 ' + noText(t.no)), h('span', null, '本券為模擬發行，不會儲存。')];

      // ── 方案 B：識別色・Web 票卡 ──
      const cardB = (t, isEx) => h('article', { class: 'tk tkB', style: `border-color:${t.col}` },
        h('header', { style: `background:${t.col}` }, logo(), h('b', null, '光瀨都市鉄道'), h('span', null, `${t.kind} / ${t.en}`)),
        h('div', { class: 'tk-main' }, h('div', { class: 'tk-st' }, h('small', null, 'FROM'), h('strong', null, t.from), h('em', { style: `color:${t.col}` }, t.dep + ' 発')), h('div', { class: 'tk-arrow', style: `color:${t.col}` }, '→'), h('div', { class: 'tk-st' }, h('small', null, 'TO'), h('strong', null, t.to), h('em', { style: `color:${t.col}` }, t.arr + ' 着'))),
        h('dl', { class: 'tk-dl' },
          h('div', null, h('dt', null, '乗車日'), h('dd', null, t.date)),
          isEx ? h('div', null, h('dt', null, '列車'), h('dd', null, HK.typeTag(t.sv), ' ', t.sv.routeName, t.gou ? ' ' + t.gou : '')) : h('div', null, h('dt', null, '旅客'), h('dd', null, t.pax))),
        isEx ? h('div', { class: 'tk-seat', style: `color:${t.col}` }, `${t.mode}：${t.seat}`) : h('div', { class: 'rule', style: 'margin:0 16px 8px' }, '經由：' + t.via),
        h('table', { class: 'tbl tk-fare' }, h('tbody', null, ...(isEx ? [] : t.rows.map(r => h('tr', null, h('th', null, r[0]), h('td', null, r[1])))), h('tr', { class: 'tot' }, h('th', null, isEx ? `${t.mode} ${t.n} 位` : '合計'), h('td', null, isEx ? t.fee : t.total)))),
        h('footer', { style: `border-top-color:${t.col}` }, ...tail(t)));

      // 1.4.0：高速鉄道指定席特急券的「開業記念」章（site-config.js 的 hsMemorial＝開業日；設成空字串就不印）
      const HK_CFG_MEM = () => (window.HK_CONFIG && window.HK_CONFIG.hsMemorial) || '';
      // ── 方案 A：硬券・指定券風（1.2.5：定案。日文＋英文同時印在票面上，與網站語言無關；票面固定 10.5 : 5.7） ──
      const T2 = (ja, en, cls) => h('span', { class: 'bi' + (cls ? ' ' + cls : '') }, h('span', { class: 'ja', lang: 'ja' }, ja), h('span', { class: 'en', lang: 'en' }, en));
      const cardA = (t, isEx) => h('article', { class: 'tk tkA' + (isEx && t.hs ? ' tkHS' : ''), 'data-i18n-off': '', style: `--tk:${t.col}` },
        h('div', { class: 'tkA-side' }, h('b', { lang: 'ja' }, t.kind), h('em', { lang: 'en' }, isEx ? 'EXPRESS TICKET' : 'FARE TICKET'), isEx ? h('small', null, '指定席', h('br'), 'Reserved') : null),
        h('div', { class: 'tkA-body' },
          h('div', { class: 'tkA-top' }, h('span', null, isEx ? (t.sub + (t.gou ? ' ' + t.gou : '')) : '光瀨都市鉄道', h('br'), h('i', { lang: 'en' }, isEx ? (t.subEn || 'Hikarise Urban Railway') : 'Hikarise Urban Railway')), h('span', { class: 'r' }, t.date + ' 発行', h('br'), h('i', { lang: 'en' }, 'Issued ' + t.date))),
          isEx && t.hs && HK_CFG_MEM() ? h('div', { class: 'tkHS-mem' }, h('b', { lang: 'ja' }, '開業記念'), h('small', { lang: 'en' }, HK_CFG_MEM().replace(/-/g, '.'), h('br'), 'OPENING')) : null,
          h('div', { class: 'tkA-route' },
            h('div', { class: 'st' }, h('b', { lang: 'ja' }, t.from), h('i', { lang: 'en' }, t.fromEn), h('em', null, t.dep + ' 発 dep.')),
            h('div', { class: 'ar' }, '→'),
            h('div', { class: 'st' }, h('b', { lang: 'ja' }, t.to), h('i', { lang: 'en' }, t.toEn), h('em', null, t.arr + ' 着 arr.'))),
          isEx ? h('div', { class: 'tkA-seat' }, t.seatBi) : h('div', { class: 'tkA-via' }, h('span', { lang: 'ja' }, '経由：' + t.via), h('span', { lang: 'en' }, 'Via: ' + t.viaEn)),
          h('div', { class: 'tkA-foot' }, h('span', null, isEx ? T2(`${t.mode}　${t.n} 位`, `${t.modeEn}　${t.n} pax`) : T2(t.pax, t.paxEn)), h('b', null, isEx ? t.fee : t.total)),
          h('div', { class: 'tkA-no' }, barOf(t.no), h('span', { class: 'n' }, '券番 No.', h('br'), noText(t.no)), h('span', { class: 'n' }, '本券は模擬発行・保存されません', h('br'), 'Simulated ticket, not saved.'))));

      // ── 方案 C：券売機・感熱紙風 ──
      const cardC = (t, isEx) => h('article', { class: 'tk tkC' },
        h('header', { style: `background:${t.col};letter-spacing:.3em` }, t.kind),
        h('div', { class: 'tkC-in' },
          h('div', { class: 'tkC-sub' }, isEx ? t.sub : '光瀨都市鉄道'),
          h('div', { class: 'tkC-st' }, t.from), h('div', { class: 'tkC-ar', style: `color:${t.col}` }, '↓'), h('div', { class: 'tkC-st' }, t.to),
          h('hr'),
          isEx ? h('div', { class: 'tkC-row' }, h('span', null, t.date.slice(5)), h('span', null, t.dep + ' 発')) : h('div', { class: 'tkC-row' }, h('span', null, '旅客'), h('span', null, t.pax)),
          isEx ? h('div', { class: 'tkC-row' }, h('span', null, t.gou || ''), h('span', null, t.arr + ' 着')) : h('div', { class: 'tkC-row' }, h('span', null, t.date.slice(5)), h('span', null, '当日限り')),
          isEx ? h('div', { class: 'tkC-seat', style: `color:${t.col};border-color:${t.col}` }, t.seat) : null,
          h('div', { class: 'tkC-yen' }, h('span', null, '¥'), h('span', null, (isEx ? t.fee : t.total).replace('¥', ''))),
          barOf(t.no), h('div', { class: 'tkC-no' }, noText(t.no))));

      const make = style === 'A' ? cardA : style === 'C' ? cardC : cardB;
      const cards = [make(base, false), ...ex.map(t => make(t, true))];

      const box = document.getElementById('bk-seat');
      box.replaceChildren(h('h2', { class: 'h2' }, '車票', h('small', null, `合計 ${yen(T.total)}`)),
        h('div', { class: 'tk-set tk-set-' + style.toLowerCase() }, ...cards),
        h('div', { class: 'noprint', style: 'margin-top:12px;display:flex;gap:10px' },
          h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, '列印'), h('button', { class: 'btn ghost', type: 'button', onclick: () => search() }, '重新查詢')));
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const pp = passPanel(H); pp.hidden = true;
    const tabBtn = (id, label) => h('button', { type: 'button', role: 'tab', class: 'bk-tab', id: 'bkt-' + id, 'aria-selected': 'false', onclick: () => show(id) }, label);
    const tRoute = tabBtn('route', '乗車券・特急券'), tPass = tabBtn('pass', '優惠套票（含地區周遊券）');
    function show(id) { const isP = id === 'pass'; pp.hidden = !isP; root.hidden = isP; tRoute.setAttribute('aria-selected', String(!isP)); tPass.setAttribute('aria-selected', String(isP)); try { history.replaceState(null, '', isP ? '#pass' : location.pathname + location.search); } catch (e) {} }
    realRoot.append(h('div', { class: 'bk-tabs', role: 'tablist' }, tRoute, tPass), root, pp);
    show(location.hash === '#pass' || q.get('tab') === 'pass' ? 'pass' : 'route');
    if (q.get('from') && q.get('to')) search();
  }

  /* ═════════ 1.6.0 優惠套票（1・3・5・7日券）：票面沿用一般車票 10.5 : 5.7 的版型 ═════════ */
  const PASSES = [
    { n: 1, price: 1500, col: '#14533f', img: 'assets/photo/heikura1.webp', pos: '50% 45%', alt: '平倉市革命紀念公園', who: '市區半日～一日遊' },
    { n: 3, price: 4500, col: '#1b6b53', img: 'assets/photo/pass-3.webp', pos: '50% 55%', alt: '東平倉站的藍白列車', who: '3 天 2 夜的短期旅行' },
    { n: 5, price: 7000, col: '#a87a1f', img: 'assets/photo/pass-5.webp', pos: '50% 50%', alt: '霧中高架橋上的列車', who: '長假與慢遊' },
    { n: 7, price: 9600, col: '#136880', img: 'assets/photo/hs-viaduct.webp', pos: '50% 50%', alt: '通過高架橋的高速鉄道', who: '一週完整旅行・含指定席與高速鉄道', seatFree: true, hs: 2 }
  ];
  /* ───── 2.2.0 地區周遊券：依景點所在的「地方」推出，含無限搭乘區間、往復乘車、參觀費折抵與住宿 ───── */
  const Lg = () => (window.HK_I18N && window.HK_I18N.lang) || 'ja';
  const tri = o => (o && (o[Lg()] || o.zh)) || '';
  const T3 = (zh, ja, en) => ({ zh, ja, en });
  PASSES.push(
    { id: 'kt3', reg: true, n: 3, price: 25900, col: '#8f3a2e', img: 'assets/photo/sight-seionshrine1.webp', pos: '50% 50%', alt: '清音大社',
      regions: ['kamiha', 'tentori'], credit: ['seion-taisha'],
      name: T3('上羽・天鳥三日券', '上羽・天鳥3日券', 'Kamiha–Tentori 3-Day Pass'),
      who: T3('清音溫泉的住宿，加上港町與神社的三天兩夜旅行', '清音温泉の宿泊と、港町・神社をめぐる2泊3日の旅', 'A three-day trip with an onsen stay, harbour towns and shrines'),
      side: ['上羽・天鳥', '周遊券'], sideEn: 'KAMIHA · TENTORI',
      tk: [['汐崎・本磯島〜勝守　乗り放題', 'Unlimited: Shiozaki / Hon-Izoshima–Katsumori'], ['新勝守〜汐崎　高速直通　乗り放題', 'Unlimited HSR through trains'], ['温泉宿2泊・大社内苑割引つき', '2 nights + shrine discount', 1], ['光瀬都市単軌　乗り放題', 'Monorail unlimited', 1]],
      perks: [
        { k: '∞', ...T3('無限次搭乘 汐崎－勝守、本磯島－勝守 全區間的各停列車與優等列車', '汐崎〜勝守・本磯島〜勝守の全区間で、各駅停車と優等列車に乗り放題', 'Unlimited rides on local and express trains across the full Shiozaki–Katsumori and Hon-Izoshima–Katsumori sections') },
        { k: '∞', ...T3('無限次搭乘 新勝守－汐崎 的高速鉄道直通班次', '新勝守〜汐崎間の高速鉄道直通列車に乗り放題', 'Unlimited rides on through high-speed services between Shin-Katsumori and Shiozaki') },
        { k: '⇄', ...T3('汐崎－新勝守 出發、前往任一車站的高速鉄道直通班次，可搭乘 1 往復', '汐崎〜新勝守から任意の駅へ向かう高速鉄道直通列車に、1往復乗車できます', 'One round trip on a through high-speed service from the Shiozaki–Shin-Katsumori section to any station') },
        { k: '⇄', ...T3('本磯島－新勝守 出發、前往任一車站的特急列車班次，可搭乘 1 往復', '本磯島〜新勝守から任意の駅へ向かう特急列車に、1往復乗車できます', 'One round trip on a limited express from the Hon-Izoshima–Shin-Katsumori section to any station') },
        { k: '★', ...T3('清音大社內苑參觀費用折抵；清音溫泉風宿飯店住宿 2 晚', '清音大社内苑の拝観料割引、清音温泉風宿ホテル 2泊付き', 'Discount on Seion Taisha inner-precinct admission, plus 2 nights at the Seion Onsen Kazeyado Hotel') }
      ] },
    { id: 'ob2', reg: true, n: 2, price: 15000, col: '#3d5a99', img: 'assets/photo/kaiei1.webp', pos: '50% 50%', alt: '懷永美術館',
      regions: ['obagawa'], credit: ['kaiei-museum', 'customs'],
      name: T3('尾羽川二日券', '尾羽川2日券', 'Ohanegawa 2-Day Pass'),
      who: T3('美術館與舊港口，一晚兩天的尾羽川小旅行', '美術館と旧港をめぐる、1泊2日の尾羽川の小旅行', 'A short two-day trip to the museum and the old harbour of Ohanegawa'),
      side: ['尾羽川', '周遊券'], sideEn: 'OHANEGAWA',
      tk: [['十万浦市〜花倉街道　乗り放題', 'Unlimited: Jumanmura–Hanakura-kaido'], ['花倉街道〜みつせ　各停乗り放題', 'Unlimited local trains to Mitsuse'], ['NAJIMAプリンス1泊・入館割引つき', '1 night + admission discounts', 1], ['光瀬都市単軌　乗り放題', 'Monorail unlimited', 1]],
      perks: [
        { k: '∞', ...T3('無限次搭乘 十万浦市－花倉街道 全區間的各停列車與優等列車', '十万浦市〜花倉街道の全区間で、各駅停車と優等列車に乗り放題', 'Unlimited rides on local and express trains across the full Jumanmura–Hanakura-kaido section') },
        { k: '∞', ...T3('無限次搭乘 花倉街道－みつせ 的各停列車班次', '花倉街道〜みつせ間の各駅停車に乗り放題', 'Unlimited rides on local trains between Hanakura-kaido and Mitsuse') },
        { k: '⇄', ...T3('新光瀨 出發、前往任一車站的高速鉄道直通班次，可搭乘 1 往復', '新光瀬から任意の駅へ向かう高速鉄道直通列車に、1往復乗車できます', 'One round trip on a through high-speed service from Shin-Hikarise to any station') },
        { k: '⇄', ...T3('前往松沢国際空港的特急列車班次，可搭乘 1 往復', '松沢国際空港行きの特急列車に、1往復乗車できます', 'One round trip on a limited express to Matsuzawa International Airport') },
        { k: '★', ...T3('懷永美術館、舊港務局海關所參觀費用折抵；NAJIMA王子住宿 1 晚', '懐永美術館・旧港務局税関所の入館料割引、NAJIMAプリンス 1泊付き', 'Discounts on admission to the Kaiei Museum and the Former Port Authority Customs House, plus 1 night at the NAJIMA Prince') }
      ] }
  );
  const passPerDay = p => Math.round(p.price / p.n);
  const passName = p => p.reg ? tri(p.name) : `${p.n} 日券`;
  function passCard(p, o) {
    o = o || {}; const sf = o.seatFee || 500, no = o.no || (p.reg ? p.id.toUpperCase().slice(0, 2) + String(p.n).padStart(2, '0') : String(p.n).padStart(4, '0')), HSC = '#136880';
    /* 2.6.0：優惠票券全部含「光瀨都市單軌（市交通局）無限搭乘」。單軌本身是均一 290 円，
     * 票券持有者不另外收費——這一行放在票面上，所以紙本票券也看得出來含單軌。 */
    const MONO = ['光瀬都市単軌　乗り放題', 'Monorail unlimited', 1];
    const lines = p.reg ? p.tk : p.seatFree
      ? [['自由席列車　乗り放題', 'Unlimited non-reserved rides'], ['指定席　座席料金込み', 'Reserved seats included', 1], MONO, ['高速鉄道　2往復無料', '2 round trips on HSR free', 1]]
      : [['自由席列車　乗り放題', 'Unlimited non-reserved rides'], ['各停・快速・環状快速・特快', 'Local / Rapid / Loop / Limited Exp.'], MONO, [`指定席は別途 ¥${sf.toLocaleString('en-US')}`, 'Seat fee extra']];
    const validJa = o.range ? o.range : (p.n === 1 ? '当日限り' : `連続${p.n}日間`), validEn = o.rangeEn || (p.n === 1 ? 'Valid on the day' : `Valid ${p.n} days`);
    return h('article', { class: 'tk tkP' + (p.seatFree ? ' tkP-hs' : '') + (p.reg ? ' tkP-r' : ''), 'data-i18n-off': '', style: `--tk:${p.col}` },
      h('div', { class: 'tkA-side' }, h('b', { lang: 'ja' }, p.n + '日券'), h('em', { lang: 'en' }, p.reg ? p.sideEn : p.n + ' DAY PASS'), h('small', { lang: 'ja' }, ...(p.reg ? [p.side[0], h('br'), p.side[1]] : ['光瀬都市鉄道', h('br'), 'フリーパス']))),
      h('div', { class: 'tkA-body' },
        h('div', { class: 'tkP-ph', style: `background-image:url(${p.img});background-position:${p.pos}`, role: 'img', 'aria-label': p.alt }),
        h('div', { class: 'tkA-top' }, h('span', { lang: 'ja' }, ...(p.reg ? [p.name.ja.replace(/\d日券$/, '周遊券'), h('br'), h('i', { lang: 'en' }, p.name.en)] : ['光瀬都市鉄道　フリーパス', h('br'), h('i', { lang: 'en' }, 'Hikarise Visitor Pass')])), h('span', { class: 'r', lang: 'ja' }, '有効　' + validJa, h('br'), h('i', { lang: 'en' }, validEn))),
        p.seatFree ? h('div', { class: 'tkP-mem' }, h('b', { lang: 'ja' }, '指定席込み'), h('small', { lang: 'en' }, 'SEAT FEE INCLUDED')) : null,
        h('div', { class: 'tkP-mid' }, h('div', { class: 'tkP-pr' }, h('small', null, '¥'), p.price.toLocaleString('en-US')),
          h('ul', null, lines.map(l => h('li', { class: l[2] ? 'em' : '' }, h('span', { lang: 'ja' }, l[0]), h('i', { lang: 'en' }, l[1]))))),
        h('div', { class: 'tkP-ft' }, h('span', { lang: 'ja' }, `1日あたり 約¥${passPerDay(p).toLocaleString('en-US')}`), h('span', { class: 'no' }, 'No.' + no))));
  }
  HK.passes = { list: PASSES, card: passCard, perDay: passPerDay, name: passName };

  /* ───── 2.2.0 統一的訂購格式：1.開始日期 → 2.領取車站 → 3.提前預約車票 → 4.訂購結果（所有套票共用） ───── */
  const PICKUP = ['咲海研究學園都市', '東平倉', 'みつせ', '花倉街道', '戸宮', '松澤國際空港', '新光瀨', '勝守', '新勝守', '上羽神別', '汐崎'];
  const pkNorm = z => String(z || '').replace(/戶/g, '戸').replace(/澤/g, '沢').replace(/學/g, '学').replace(/國/g, '国').replace(/\s+/g, '');
  const pickupStations = H => PICKUP.map(n => H.stations.find(s => pkNorm(s.zh) === pkNorm(n))).filter(Boolean);

  /** 預約頁的「優惠套票」分頁：選券種 → 依序填寫 1.開始日期 2.領取車站 3.提前預約車票 → 確認訂購，顯示訂購結果（不儲存） */
  function passPanel(H) {
    const sf = H.cfg && H.cfg.seatFee || 500, today = new Date(), pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const ymd = s => s.replaceAll('-', '/');
    const addDays = (isoStr, k) => { const d = new Date(isoStr + 'T00:00:00'); d.setDate(d.getDate() + k); return iso(d); };
    const pks = pickupStations(H);
    const st = { p: PASSES[1], pk: pks[0] ? pks[0].id : '', rsv: false, pick: null, sights: null };
    const dIn = h('input', { type: 'date', value: iso(today), min: iso(today), required: true, 'aria-label': '開始日期' });
    const nSel = h('select', { 'aria-label': '枚數' }, [1, 2, 3, 4, 5, 6].map(n => h('option', { value: n }, n + ' 枚')));
    const pkSel = h('select', { 'aria-label': '領取車站' }, pks.map(s => h('option', { value: s.id }, s.zh)));
    const rChk = h('input', { type: 'checkbox', id: 'po-rsv' });
    const rDay = h('select', { 'aria-label': '預約日期' }), rTo = h('select', { 'aria-label': '抵達站' }, H.stations.map(s => h('option', { value: s.id }, s.zh)));
    const rTime = h('input', { type: 'time', value: '07:00', 'aria-label': '出發時刻' }), rList = h('div', { class: 'po-trains', 'aria-live': 'polite' });
    const rBox = h('div', { class: 'po-rbox', hidden: true });
    const stGrid = h('div', { class: 'pass-grid' }), regGrid = h('div', { class: 'pass-grid' });
    const detail = h('div', { class: 'pass-detail' }), prev = h('div', { class: 'pass-out' }), result = h('div', { class: 'pass-result', hidden: true });
    const stn = id => H.stName(id);
    /* 預約車票的顯示：站名與路線名各自獨立成節點，語言切換時才翻得到 */
    const rsvNodes = (x, full) => [ymd(x.day) + ' ' + H.hm(x.dep) + ' ', h('span', null, stn(x.from)), ' → ' + H.hm(x.arr) + ' ', h('span', null, stn(x.to)),
      ...(full ? [' ', h('span', null, x.svc), ' ', h('span', null, x.tf ? `轉乘 ${x.tf} 次` : '直達')] : [])];
    const period = () => { const n = st.p.n, a = dIn.value; if (!a) return { a: '', b: '', txt: '' }; const b = addDays(a, n - 1); return { a, b, txt: n === 1 ? ymd(a) : `${ymd(a)}～${ymd(b)}` }; };
    const orderNo = () => 'HK' + String(Math.abs(hash([st.p.id || st.p.n, dIn.value, nSel.value, st.pk, st.pick ? st.pick.key : ''].join('|'))) % 1e8).padStart(8, '0');

    /* 2.2.0：地區周遊券依「地方」顯示該地方的景點介紹（資料來自 sights.json＋areas.json） */
    function loadSights() {
      if (st.sights || !HK.area) return;
      st.sights = 'loading';
      Promise.all([HK.area.load(), HK.getJSON('data/sights.json', true)]).then(([A, S]) => { st.sights = (S || []).map(d => ({ d, ds: HK.area.distOf((d.stations && d.stations.length ? d.stations : [d.station])[0]) })); drawDetail(); }).catch(() => { st.sights = []; });
    }
    function drawDetail() {
      const p = st.p, kids = [];
      if (p.reg) {
        kids.push(h('h3', { class: 'h3' }, tri(p.name), h('small', { class: 'pass-yen' }, yen(p.price), '　', h('span', null, `${p.n} 日券　大人`))), h('p', { class: 'lead' }, tri(p.who)));
        kids.push(h('h4', { class: 'h4' }, '套票內容'), h('ol', { class: 'pass-perks' }, p.perks.map(k => h('li', null, h('b', { class: 'pk pk-' + (k.k === '∞' ? 'u' : k.k === '⇄' ? 'r' : 'i') }, k.k), h('span', null, tri(k))))));
        kids.push(h('p', { class: 'note' }, `不含指定席座席費：搭乘特急等指定席列車時，另付指定席費用（${yen(sf)}）。`), h('p', { class: 'note' }, '住宿與參觀費用折抵為模擬內容，實際兌換方式將於本網站公告。'));
        loadSights();
        const arr = Array.isArray(st.sights) ? st.sights.filter(x => x.ds && p.regions.includes(x.ds.region)) : [];
        if (arr.length) {
          kids.push(h('h4', { class: 'h4' }, '套票範圍的景點介紹'), h('div', { class: 'pass-sights' }, arr.map(({ d, ds }) => h('article', { class: 'pass-sight' },
            d.photos && d.photos[0] ? h('img', { src: d.photos[0].src, alt: d.photos[0].alt || '', loading: 'lazy' }) : null,
            h('div', null,
              h('h5', null, h('a', { href: 'sights.html#' + d.id }, d.name), p.credit.includes(d.id) ? h('span', { class: 'pass-credit' }, '參觀費用折抵') : null),
              h('p', { class: 'sarea' }, h('span', { class: 'atag' }, h('b', null, tri(HK.area.regOf(ds))), tri(ds.full))),
              h('p', null, d.lead),
              d.address ? h('p', { class: 'saddr' }, h('strong', null, '住址'), Lg() === 'en' && d.addressEn ? d.addressEn : d.address) : null)))));
        }
      } else {
        kids.push(h('h3', { class: 'h3' }, `${p.n} 日券`, h('small', { class: 'pass-yen' }, yen(p.price), '　', h('span', null, '大人'))), h('p', { class: 'lead' }, p.who),
          p.seatFree ? h('p', { class: 'note' }, '七日券已含指定席座席費，以及高速鉄道 2 往復（乘車費）。') : h('p', { class: 'note' }, '搭乘指定席列車時，須另付指定席座席費。'));
      }
      detail.replaceChildren(...kids);
    }
    function drawCards() {
      const mk = p => h('button', { type: 'button', class: 'pass-pick', 'aria-pressed': String(st.p === p), onclick: () => { st.p = p; st.pick = null; drawAll(); } }, passCard(p, { seatFee: sf }), h('span', { class: 'pass-sel' }, st.p === p ? '選取中' : '選擇這張'));
      stGrid.replaceChildren(...PASSES.filter(p => !p.reg).map(mk)); regGrid.replaceChildren(...PASSES.filter(p => p.reg).map(mk));
    }
    /* 預約日期＝使用期間內的每一天；出發站固定為領取車站（在該站領取後直接搭乘） */
    function drawRsv() {
      const pr = period(); rBox.hidden = !st.rsv;
      const days = []; for (let k = 0; pr.a && k < st.p.n; k++) days.push(addDays(pr.a, k));
      const keep = rDay.value; rDay.replaceChildren(...days.map(d => h('option', { value: d }, ymd(d)))); if (days.includes(keep)) rDay.value = keep;
      rList.replaceChildren(); if (!st.rsv) { st.pick = null; return; }
      const to = rTo.value, from = st.pk, tt = (rTime.value || '07:00').split(':'), t0 = (+tt[0]) * 3600 + (+tt[1]) * 60;
      if (!from || !to || from === to) { rList.append(h('p', { class: 'note' }, '請選擇與領取車站不同的抵達站。')); st.pick = null; return; }
      let js = []; try { js = H.search(from, to, t0, 5) || []; } catch (e) { js = []; }
      if (!js.length) { rList.append(h('p', { class: 'note' }, '這個時段沒有可預約的班次，請調整抵達站或出發時刻。')); st.pick = null; return; }
      const items = js.map(j => ({ key: `${rDay.value}|${from}|${to}|${j.dep}`, from, to, dep: j.dep, arr: j.arr, sv: j.legs.map(l => l.sv), svc: j.legs.map(l => l.sv.routeName + (l.gou ? ' ' + l.gou : '')).join(' ＋ '), tf: j.legs.length - 1 }));
      if (!st.pick || !items.some(x => x.key === st.pick.key)) st.pick = { ...items[0], day: rDay.value };
      st.pick.day = rDay.value;
      rList.append(h('p', { class: 'note', style: 'margin:0 0 6px' }, '請選擇想預約的第一趟車票：'), ...items.map(x => h('label', { class: 'po-train' },
        h('input', { type: 'radio', name: 'po-train', checked: st.pick.key === x.key, onchange: () => { st.pick = { ...x, day: rDay.value }; drawPrev(); } }),
        h('span', { class: 'po-t' }, rsvNodes({ ...x, day: rDay.value }, false)), h('span', { class: 'po-s' }, h('span', { style: 'display:inline-flex;gap:4px;margin-right:6px' }, ...x.sv.map(v => HK.typeTag(v))), h('span', null, x.svc), '　', h('span', null, x.tf ? `轉乘 ${x.tf} 次` : '直達')))));
    }
    function drawPrev() {
      const p = st.p, n = Number(nSel.value), pr = period();
      prev.replaceChildren(h('h3', { class: 'h3' }, '開票內容'),
        h('div', { class: 'pass-ticket' }, passCard(p, { seatFee: sf, range: pr.txt, rangeEn: 'Valid ' + pr.txt, no: String(Math.abs(hash(p.n + dIn.value + n + (p.id || ''))) % 1e4).padStart(4, '0') })),
        h('table', { class: 'tbl', style: 'max-width:520px;margin-top:12px' }, h('tbody', null,
          h('tr', null, h('th', null, '券種'), h('td', null, p.reg ? tri(p.name) : `${p.n} 日券　大人`)),
          h('tr', null, h('th', null, '開始日期'), h('td', null, pr.a ? ymd(pr.a) : '—')),
          h('tr', null, h('th', null, '使用期間'), h('td', null, pr.txt || '—')),
          h('tr', null, h('th', null, '領取車站'), h('td', null, st.pk ? h('span', null, stn(st.pk)) : '—')),
          h('tr', null, h('th', null, '提前預約車票'), h('td', null, st.rsv && st.pick ? rsvNodes(st.pick, false) : '不預約')),
          h('tr', null, h('th', null, '單價'), h('td', null, yen(p.price))),
          h('tr', { class: 'tot' }, h('th', null, `合計　${n} 枚`), h('td', null, yen(p.price * n))))));
    }
    function drawAll() { drawCards(); drawDetail(); drawRsv(); drawPrev(); }
    function order() {
      if (!dIn.value) { dIn.focus(); return; }
      if (!st.pk) return;
      const p = st.p, n = Number(nSel.value), pr = period(), no = orderNo();
      const rows = [['訂單編號', no], ['券種', p.reg ? tri(p.name) : `${p.n} 日券　大人`], ['枚數', `${n} 枚`], ['開始日期', ymd(pr.a)], ['使用期間', pr.txt], ['領取車站', h('span', null, stn(st.pk))],
        ['提前預約車票', st.rsv && st.pick ? rsvNodes(st.pick, true) : '不預約'], ['合計', yen(p.price * n)]];
      result.replaceChildren(
        h('div', { class: 'po-done' }, h('b', { class: 'po-ok', 'aria-hidden': 'true' }, '✓'), h('div', null, h('h3', { class: 'h3', style: 'margin:0' }, '訂購完成'), h('p', { class: 'note', style: 'margin:2px 0 0' }, '這是模擬訂購的結果，不會被儲存。'))),
        h('table', { class: 'tbl po-res', style: 'max-width:560px;margin-top:12px' }, h('tbody', null, rows.map((r, k) => h('tr', { class: k === rows.length - 1 ? 'tot' : '' }, h('th', null, r[0]), h('td', null, r[1]))))),
        h('div', { class: 'pass-ticket' }, passCard(p, { seatFee: sf, range: pr.txt, rangeEn: 'Valid ' + pr.txt, no: no.slice(-4) })),
        h('p', { class: 'note' }, '請在使用期間第一天之前，於領取車站（', h('span', null, stn(st.pk)), st.rsv && st.pick ? '）出示訂單編號領取套票與預約的車票。' : '）出示訂單編號領取套票。'),
        h('div', { class: 'noprint', style: 'margin-top:10px;display:flex;gap:10px;flex-wrap:wrap' },
          h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, '列印'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => back() }, '修改訂單'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.rsv = false; rChk.checked = false; st.pick = null; back(); } }, '重新訂購')));
      form.hidden = true; prev.hidden = true; result.hidden = false; result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function back() { form.hidden = false; prev.hidden = false; result.hidden = true; drawAll(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const step = (no, title, ...kids) => h('fieldset', { class: 'po-step' }, h('legend', null, h('b', null, String(no)), title), ...kids);
    const field = (l, el) => h('label', { class: 'f' }, h('span', null, l), el);
    const form = h('form', { class: 'pass-order', onsubmit: ev => { ev.preventDefault(); order(); } },
      h('h3', { class: 'h3' }, '訂購'),
      step(1, '開始日期', h('div', { class: 'bk-form' }, field('開始日期', dIn), field('枚數（大人）', nSel)), h('p', { class: 'note' }, '從開始日期起算，連續使用到券種規定的天數。')),
      step(2, '領取車站', h('div', { class: 'bk-form' }, field('領取車站', pkSel)), h('p', { class: 'note' }, `可領取車站共 ${pks.length} 站：`, ...pks.flatMap((s, i) => [i ? '、' : '', h('span', null, s.zh)]), '。')),
      step(3, '提前預約車票', h('label', { class: 'po-chk', for: 'po-rsv' }, rChk, h('span', null, '預約所選日期內想搭的第一趟車票，並在上述領取車站領取')),
        rBox),
      step(4, '訂購結果', h('p', { class: 'note', style: 'margin-top:0' }, '按下「確認訂購」後，會顯示訂單編號、領取方式與訂購內容。'), h('button', { class: 'btn', type: 'submit' }, '確認訂購')));
    rBox.append(h('div', { class: 'bk-form' }, field('預約日期', rDay), field('出發站（＝領取車站）', h('output', { class: 'po-from' })), field('抵達站', rTo), field('出發時刻', rTime)), rList);
    const upd = () => { rBox.querySelector('.po-from').replaceChildren(...(st.pk ? [h('span', null, stn(st.pk))] : [])); drawRsv(); drawPrev(); };
    dIn.addEventListener('change', () => { drawRsv(); drawPrev(); }); nSel.addEventListener('change', drawPrev);
    pkSel.addEventListener('change', () => { st.pk = pkSel.value; st.pick = null; upd(); });
    rChk.addEventListener('change', () => { st.rsv = rChk.checked; upd(); }); rDay.addEventListener('change', () => { st.pick = null; drawRsv(); drawPrev(); });
    rTo.addEventListener('change', () => { st.pick = null; drawRsv(); drawPrev(); }); rTime.addEventListener('change', () => { st.pick = null; drawRsv(); drawPrev(); });
    const panel = h('div', { class: 'pass-panel' },
      h('p', { class: 'lead' }, '期間內可無限次搭乘光瀨都市鉄道的列車。選一張券，依序填寫開始日期、領取車站與提前預約車票，就能完成模擬訂購。'),
      h('h3', { class: 'h3' }, '一般套票（1・3・5・7日券）'), stGrid,
      h('h3', { class: 'h3' }, '地區周遊券（依地方推出）'), regGrid,
      detail, form, prev, result);
    drawAll(); upd(); return panel;
  }
  HK.passPanel = passPanel;
  HK.booking = booking;
})();
