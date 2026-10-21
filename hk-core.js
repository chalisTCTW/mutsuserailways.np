/* hk-core.js — 光瀨都市鉄道 入口網站的資料層。
 * 輸入：ATOS 的路網快照（hikarise-snapshot.json：{ data: 路網傾印, schedule: 遊戲內班表 }），
 * 用 ATOS 自己的 model.js 轉成路網模型（和 ATOS 網頁同一份程式，所以班表一致），再整理成：
 *   車站、服務（路線班次）、全日班次、車站時刻、轉乘搜尋、票價、實體鄰接圖。
 * 這個檔案不碰 DOM，Node 也能跑（測試用）。 */
(function (root) {
  'use strict';
  const DAY = 86400;
  const CFG = Object.assign({
    tzOffsetSec: 8 * 3600,         // 網站顯示用的時區（遊戲存檔記的是 UTC 的一天中時刻）
    fareBase: 290,                 // 起步票價（円）
    fareStep: 200,                 // 每跨一個分區加算（円）
    seatFee: 500,                  // 指定席費用（円）
    seatsPerCar: 40,               // 2100 形每節座位數（2+2）
    reserved: [{ re: '特急', cars: 8 }, { re: '特別快速|特快', cars: 6 }],   // 全車指定席的種別與編組節數
    minTransferSec: 120,           // 轉乘最短時間（快照有值時以快照為準）
    zoneOverride: {},              // { "車站中文名": 分區編號 }：遊戲內沒設分區時，可在這裡補
  }, root.HK_CONFIG || {});

  const pad = n => String(n).padStart(2, '0');
  const hm = t => { const d = ((Math.floor(t) % DAY) + DAY) % DAY; return pad(Math.floor(d / 3600)) + ':' + pad(Math.floor(d % 3600 / 60)); };
  const shiftDay = x => (((x + CFG.tzOffsetSec) % DAY) + DAY) % DAY;
  const nowSec = () => shiftDay(Math.floor(Date.now() / 1000));

  /* ───────── 路線名稱：拆成「路線」與「種別」 ───────── */
  const TYPE_TOKENS = ['快速特急', '特別快速', '通勤特急', '通勤快速', '快速急行', '通勤急行', '区間急行', '区間快速', '特急', '特快', '急行', '準急', '快特', '快速', '各駅停車', '各停', '普通'];
  /** 'ltd'＝特急類、'exp'＝急行／快速類、'loc'＝各停 */
  function typeClass(type) {
    if (!type) return 'loc';
    if (/特急|特別快速|特快|快特/.test(type)) return 'ltd';
    if (/急行|快速|準急/.test(type)) return 'exp';
    return 'loc';
  }
  function parseRouteName(zh) {
    let name = String(zh || '').replace(/\s+/g, '');
    for (const tk of TYPE_TOKENS) {
      if (name.length > tk.length && name.endsWith(tk)) return { line: name.slice(0, -tk.length), type: tk, full: zh };
    }
    for (const tk of TYPE_TOKENS) {
      if (name.length > tk.length && name.startsWith(tk)) return { line: name.slice(tk.length), type: tk, full: zh };
    }
    return { line: name, type: '', full: zh };
  }

  /* ───────── 建立索引 ───────── */
  /** MTR 的路線顏色（整數 RGB）→ #rrggbb；沒有就用預設的灰綠。 */
  function hexColor(v) { const n = Number(v); if (!isFinite(n) || n < 0) return '#5d7d70'; return '#' + (n & 0xFFFFFF).toString(16).padStart(6, '0'); }
  /** 在這個底色上要用黑字還是白字（WCAG 相對亮度）。 */
  function inkOn(hex) { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255; const f = x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); const L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return L > 0.42 ? '#12231c' : '#ffffff'; }
  function build(snapshot) {
    const A = root.ATOS;
    if (!A || !A.buildNetwork) throw new Error('model.js 尚未載入');
    const dump = snapshot.data || snapshot.dump || snapshot;
    const net = A.buildNetwork(dump, {});
    if (snapshot.schedule && A.calibrate) A.calibrate(net, snapshot.schedule);
    return index(net, dump, snapshot.dispatch);
  }

  /* ───────── 調度（離峰・深夜・收車）─────────
   * ATOS 0.18.1 起，快照多一個 dispatch 區塊（ATOS 網頁不讀它）。這裡依「每一班的發車時刻」決定那一班是否運行：
   *  - 時段表啟用：該班發車時刻所在時段的方案（預設／離峰＝每 2 班 1 班／深夜＝每 3 班 1 班／收車＝不運行）。
   *  - 手動操作：自 since（最後一次操作）起，到下一個時段交界為止，套用當時的手動方案（沒有時段表就持續到再次操作）。
   *  - 名次：該車庫全部發車時刻依當地時間排序，名次 % N == 0 才運行（與模組相同）。快照裡沒有的時刻一律運行。 */
  function makeDispatch(disp, nowMs) {
    if (!disp || !disp.active) return null;
    const off = disp.tzOffsetSec | 0, N = { default: 1, offpeak: 2, night: 3 };
    const rules = (disp.schedule ? (disp.rules || []) : []).slice().sort((a, b) => a.m - b.m);
    const rankOf = {}; Object.keys(disp.depots || {}).forEach(id => { const m = new Map(); disp.depots[id].forEach((u, i) => m.set(u, i)); rankOf[id] = m; });
    const sinceS = disp.since ? Math.floor(disp.since / 1000) : 0;
    let until = Infinity;
    if (sinceS && rules.length) {
      const sl = (((sinceS + off) % DAY) + DAY) % DAY, day0 = sinceS - sl;
      until = Math.min(...rules.map(r => [day0 + r.m * 60, day0 + DAY + r.m * 60]).flat().filter(t => t > sinceS));
    }
    const ruleAt = utcSec => {
      if (!rules.length) return 'default';
      const m = Math.floor((((utcSec + off) % DAY) + DAY) % DAY / 60); let best = rules[rules.length - 1];
      for (const r of rules) if (r.m <= m) best = r; return best.act;
    };
    const stateAct = disp.recall ? 'recall' : (disp.mode || 'default');
    const nowS = Math.floor((nowMs != null ? nowMs : Date.now()) / 1000);
    const midnight = Math.floor((nowS + CFG.tzOffsetSec) / DAY) * DAY - CFG.tzOffsetSec;   // 這個網站時區今天 0:00 的 epoch 秒
    /** depotId：車庫；raw：UTC 一天秒數的發車時刻；rel：這一班相對於「今天 0:00」的秒數（含跨日）。 */
    const act = (raw, rel) => {
      const epoch = midnight + rel;
      if (sinceS && epoch >= sinceS && epoch < until) return stateAct;
      return disp.schedule ? ruleAt(raw) : 'default';
    };
    return {
      has: id => !!rankOf[id],
      runs(depotId, raw, rel) {
        const m = rankOf[depotId]; if (!m) return true;
        const a = act(raw, rel); if (a === 'recall') return false;
        const n = N[a] || 1; if (n === 1) return true;
        const i = m.get(raw); return i == null || i % n === 0;
      },
      /** 現在這一刻的方案（顯示用）。 */
      current() { return act(((nowS % DAY) + DAY) % DAY, nowS - midnight); },
    };
  }

  function index(net, dump, disp) {
    const H = { net, cfg: CFG };
    const DP = makeDispatch(disp);
    H.dispatchNow = DP ? DP.current() : 'default';
    const minTransfer = (net.meta && net.meta.minTransferSec) || CFG.minTransferSec;
    H.minTransfer = minTransfer;

    const zoneOf = new Map();
    (dump && dump.stations || []).forEach(s => { zoneOf.set(String(s.id), [s.zone1 | 0, s.zone2 | 0, s.zone3 | 0].filter(z => z !== 0)); });

    const routesByKey = {}; net.routes.forEach(r => routesByKey[r.key] = r);
    const depotsById = {}; net.depots.forEach(d => depotsById[d.id] = { ...d, departures: d.departures.map(shiftDay).sort((a, b) => a - b) });
    const stById = {}; net.stations.forEach(s => stById[s.id] = s);

    // 運行中的服務（整修中的路線不顯示在對外網站）
    const svcs = [];
    net.services.forEach((s, idx) => {
      const route = routesByKey[s.route], member = net.members[s.member];
      if (!route || !member || route.status === 'maintenance') return;
      const nm = parseRouteName(route.displayZh);
      const col = hexColor(member.color != null ? member.color : route.color);
      svcs.push({ idx, stops: s.stops, depot: depotsById[s.depot], member, route, line: nm.line, type: nm.type, tcls: typeClass(nm.type), routeName: route.displayZh, color: col, ink: inkOn(col) });
    });
    H.svcs = svcs;

    const served = new Set(); svcs.forEach(sv => sv.stops.forEach(s => { if (s.pax !== false) served.add(s.station); }));
    const stations = net.stations.filter(s => served.has(s.id)).map(s => ({ ...s, zones: zonesFor(s) }));
    function zonesFor(s) { const ov = CFG.zoneOverride[s.zh]; return ov != null ? [ov | 0].filter(Boolean) : (zoneOf.get(String(s.id)) || []); }
    stations.sort((a, b) => a.zh.localeCompare(b.zh, 'ja'));
    H.stations = stations;
    H.stById = {}; stations.forEach(s => H.stById[s.id] = s);
    const sIdx = new Map(stations.map((s, i) => [s.id, i]));
    H.sIdx = sIdx;
    H.stName = id => (H.stById[id] || stById[id] || { zh: '?' }).zh;

    H.destOf = (sv, i) => {
      const out = i != null && sv.stops[i] && sv.stops[i].out;
      if (out) return out;
      const first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
      return first === last ? (sv.member.dir || '環狀') : H.stName(last);
    };

    /* ── 全日班次（前後各一天，處理跨午夜）與連線 ── */
    const conns = [], trips = [], events = new Map();
    for (let day = -1; day <= 2; day++) {
      for (const sv of svcs) {
        for (const D of sv.depot.departures) {
          if (DP && !DP.runs(sv.depot.id, (((D - CFG.tzOffsetSec) % DAY) + DAY) % DAY, D + day * DAY)) continue;   // 調度：離峰・深夜・收車時停發的班次
          const base = D + day * DAY, ti = trips.length;
          trips.push({ sv, base });
          const st = sv.stops;
          for (let i = 0; i < st.length - 1; i++) {
            if (st[i].pax === false) continue;
            conns.push({ dep: base + st[i].dep, arr: base + st[i + 1].arr, from: sIdx.get(st[i].station), to: sIdx.get(st[i + 1].station), trip: ti, i });
          }
          if (day >= 0 && day <= 1) for (let i = 0; i < st.length - 1; i++) {
            if (st[i].pax === false) continue;
            const k = st[i].station; if (!events.has(k)) events.set(k, []);
            events.get(k).push({ t: base + st[i].dep, sv, i, base });
          }
        }
      }
    }
    conns.sort((a, b) => a.dep - b.dep);
    events.forEach(a => a.sort((x, y) => x.t - y.t));
    H.conns = conns; H.trips = trips; H.events = events;

    /** 車站時刻：該站一天（0:00–24:00）內的發車，依時間排序。 */
    H.departures = function (stationId) {
      return (events.get(stationId) || []).filter(e => e.t >= 0 && e.t < DAY);
    };

    /* ── 轉乘搜尋（Connection Scan） ── */
    function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].dep < t) lo = m + 1; else hi = m; } return lo; }
    function searchOnce(o, d, t0) {
      const n = stations.length, arrive = new Float64Array(n).fill(Infinity), inConn = new Int32Array(n).fill(-1);
      const boarded = new Map(); arrive[o] = t0;
      for (let k = lowerBound(conns, t0); k < conns.length; k++) {
        const c = conns[k];
        if (c.dep > arrive[d] || c.dep > t0 + 30 * 3600) break;
        let ok = boarded.has(c.trip);
        if (!ok && arrive[c.from] !== Infinity) {
          ok = c.from === o ? c.dep >= t0 : arrive[c.from] + minTransfer <= c.dep;
          if (ok) boarded.set(c.trip, k);
        }
        if (ok && c.arr < arrive[c.to]) { arrive[c.to] = c.arr; inConn[c.to] = k; }
      }
      if (arrive[d] === Infinity) return null;
      const legs = []; let st = d;
      while (st !== o) {
        const endC = conns[inConn[st]], bC = conns[boarded.get(endC.trip)], trip = trips[endC.trip];
        const stops = trip.sv.stops.slice(bC.i, endC.i + 2).map(s => ({ station: s.station, arr: trip.base + s.arr, dep: trip.base + s.dep, platform: s.platformName }));
        legs.unshift({ sv: trip.sv, stops, board: bC.i, trip: endC.trip });
        st = bC.from;
      }
      return { dep: legs[0].stops[0].dep, arr: arrive[d], legs };
    }
    /** fromId → toId，t0 之後最早的 count 個選項（同到達時間者取最晚出發）。 */
    H.search = function (fromId, toId, t0, count) {
      const o = sIdx.get(fromId), d = sIdx.get(toId), out = []; count = count || 4;
      if (o == null || d == null || o === d) return out;
      let t = t0;
      for (let i = 0; i < count; i++) {
        let j = searchOnce(o, d, t); if (!j) break;
        for (let g = 0; g < 12; g++) { const j2 = searchOnce(o, d, j.dep + 1); if (j2 && j2.arr <= j.arr) j = j2; else break; }
        if (!out.length || j.dep > out[out.length - 1].dep) out.push(j);
        t = j.dep + 1;
      }
      return out;
    };

    /* ── 實體鄰接圖（用在票價與路線圖） ──
     * 各停站的班次連出「相鄰站」；快速、特急跳站的連線如果被別的班次拆成經過中間站的路徑，就視為重複，丟掉。 */
    const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
    const edges = new Map();     // key → { a, b, svcs:Set(idx), n }
    const seqs = [];
    svcs.forEach(sv => {
      const seq = sv.stops.filter(s => s.pax !== false).map(s => s.station);
      seqs.push({ sv, seq });
      for (let i = 0; i < seq.length - 1; i++) {
        if (seq[i] === seq[i + 1]) continue;
        const k = pairKey(seq[i], seq[i + 1]);
        let e = edges.get(k); if (!e) edges.set(k, e = { a: seq[i], b: seq[i + 1], svcs: new Set() });
        e.svcs.add(sv.idx);
      }
    });
    // 找出被別的班次分段經過的「跳站連線」：某班次同時經過 a、b，且在該班次裡兩站不相鄰（環狀班次以環上距離計）
    const norm = seqs.map(({ sv, seq }) => {
      const circ = sv.stops.length > 2 && sv.stops[0].station === sv.stops[sv.stops.length - 1].station;   // 起訖同站＝環狀
      const s2 = circ && seq.length > 1 && seq[0] === seq[seq.length - 1] ? seq.slice(0, -1) : seq, pos = new Map();
      s2.forEach((id, i) => { if (!pos.has(id)) pos.set(id, []); pos.get(id).push(i); });
      return { L: s2.length, circ, pos };
    });
    const chords = new Set();
    for (const [k, e] of edges) {
      for (const { L, circ, pos } of norm) {
        const pa = pos.get(e.a), pb = pos.get(e.b);
        if (!pa || !pb) continue;
        let best = Infinity;
        for (const p of pa) for (const q of pb) { const d = Math.abs(p - q); best = Math.min(best, circ ? Math.min(d, L - d) : d); }
        if (best > 1) { chords.add(k); break; }
      }
    }
    const phys = new Map();
    for (const [k, e] of edges) if (!chords.has(k)) phys.set(k, e);
    // 跳站連線一併記錄所屬班次，讓路線圖畫「這條線有停這些站」
    H.edges = [...phys.values()].map(e => {
      const a = H.stById[e.a], b = H.stById[e.b];
      return { a: e.a, b: e.b, svcs: [...e.svcs], len: Math.hypot(a.x - b.x, a.z - b.z) };
    });
    H.adj = new Map(); stations.forEach(s => H.adj.set(s.id, []));
    H.edges.forEach(e => { H.adj.get(e.a).push({ to: e.b, len: e.len }); H.adj.get(e.b).push({ to: e.a, len: e.len }); });

    /** 最短（直線距離總和）路徑；回傳車站 id 陣列。 */
    H.shortestPath = function (fromId, toId) {
      if (fromId === toId) return [fromId];
      const dist = new Map([[fromId, 0]]), prev = new Map(), done = new Set();
      const q = [[0, fromId]];
      while (q.length) {
        q.sort((x, y) => x[0] - y[0]);
        const [d, u] = q.shift();
        if (done.has(u)) continue; done.add(u);
        if (u === toId) break;
        for (const { to, len } of H.adj.get(u) || []) {
          const nd = d + len;
          if (nd < (dist.has(to) ? dist.get(to) : Infinity)) { dist.set(to, nd); prev.set(to, u); q.push([nd, to]); }
        }
      }
      if (!prev.has(toId)) return null;
      const path = [toId]; while (path[0] !== fromId) path.unshift(prev.get(path[0]));
      return path;
    };

    /* ── 票價 ──
     * 票價＝基本運費 fareBase ＋ fareStep × 路徑跨越的收費區數（＋指定席費用，另計）。
     * 收費區在 MTR 裡只是編號，編號大小與相鄰與否無關，所以只看「沿路徑車站依序所屬的收費區」：
     * 前後兩站沒有共同的收費區＝跨過一個區界（一個車站可屬於最多三區，位於區界上）。
     * 路徑：在實體鄰接圖上取「跨區數最少、其次距離最短」的路徑。沒有設定收費區（0）的車站略過不影響。 */
    H.zoneSet = id => (H.stById[id] && H.stById[id].zones) || [];
    /** 兩個相鄰車站之間是否跨區（0／1）：沒有共同收費區才算跨區；任一站沒設定收費區就不算。 */
    const zoneStep = (a, b) => { const za = H.zoneSet(a), zb = H.zoneSet(b); if (!za.length || !zb.length) return 0; return za.some(z => zb.includes(z)) ? 0 : 1; };
    H.farePath = function (fromId, toId) {
      if (fromId === toId) return { path: [fromId], crossed: 0, km: 0, bounds: [] };
      // Dijkstra：成本＝(跨區數×1e7 ＋ 距離)；跨區用「目前所在收費區集合」追蹤，避免邊界站造成重複計算
      const key = (id, cur) => id + '#' + cur.join(',');
      const startCur = H.zoneSet(fromId).slice();
      const best = new Map([[key(fromId, startCur), { c: 0, cross: 0, prev: null, id: fromId, cur: startCur }]]);
      const q = [best.get(key(fromId, startCur))]; let goal = null;
      const done = new Set();
      while (q.length) {
        q.sort((x, y) => x.c - y.c);
        const u = q.shift(), ku = key(u.id, u.cur); if (done.has(ku)) continue; done.add(ku);
        if (u.id === toId) { goal = u; break; }
        for (const { to, len } of H.adj.get(u.id) || []) {
          const zt = H.zoneSet(to); let cur2, add = 0;
          if (!zt.length) cur2 = u.cur;
          else if (!u.cur.length) cur2 = zt.slice();
          else { const inter = u.cur.filter(z => zt.includes(z)); if (inter.length) cur2 = inter; else { cur2 = zt.slice(); add = 1; } }
          const nd = { c: u.c + add * 1e7 + len, cross: u.cross + add, prev: u, id: to, cur: cur2, step: add };
          const kn = key(to, cur2), old = best.get(kn);
          if (!old || nd.c < old.c) { best.set(kn, nd); q.push(nd); }
        }
      }
      if (!goal) return null;
      const path = [], bounds = []; let n = goal;
      while (n) { path.unshift(n.id); n = n.prev; }
      // 跨區的位置：沿路徑重算一次（給明細用）
      let cur = H.zoneSet(path[0]).slice(), km = 0;
      for (let i = 1; i < path.length; i++) {
        const A = H.stById[path[i - 1]], Bq = H.stById[path[i]]; km += Math.hypot(A.x - Bq.x, A.z - Bq.z);
        const zt = H.zoneSet(path[i]); if (!zt.length) continue;
        if (!cur.length) { cur = zt.slice(); continue; }
        const inter = cur.filter(z => zt.includes(z)); if (inter.length) cur = inter; else { bounds.push({ from: path[i - 1], to: path[i], fromZone: cur.slice(), toZone: zt.slice() }); cur = zt.slice(); }
      }
      return { path, crossed: goal.cross, km: km / 1000, bounds };
    };
    /** 票價明細：{ base, step, crossed, zoneFee, seat, total, path, bounds, km } */
    H.fare = function (fromId, toId, opt) {
      const r = H.farePath(fromId, toId); if (!r) return null;
      const seat = opt && opt.seat ? CFG.seatFee : 0, base = fromId === toId ? 0 : CFG.fareBase, zoneFee = fromId === toId ? 0 : CFG.fareStep * r.crossed;
      const total = base + zoneFee + seat;
      return { yen: base + zoneFee, base, step: CFG.fareStep, crossed: r.crossed, zones: r.crossed, zoneFee, seat, total, path: r.path, bounds: r.bounds, km: r.km };
    };
    /** 這個班次（服務）是否全車指定席；回傳 { cars, seats, fee } 或 null。 */
    H.reserveInfo = function (sv) {
      for (const r of CFG.reserved) if (new RegExp(r.re).test(sv.routeName)) return { cars: r.cars, seats: r.cars * CFG.seatsPerCar, fee: CFG.seatFee, perCar: CFG.seatsPerCar };
      return null;
    };
    /** 編組節數（顯示用）：指定席種別依規定；其他用車庫內有出庫路徑的側線的編組。 */
    H.carsOf = function (sv) {
      const ri = H.reserveInfo(sv); if (ri) return ri.cars;
      const sd = ((sv.depot && sv.depot.sidings) || []).filter(x => x.cars > 0 && x.path !== false).map(x => x.cars);
      if (sd.length) { const c = new Map(); sd.forEach(n => c.set(n, (c.get(n) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; }
      return 8;
    };
    H.zonesConfigured = stations.some(s => s.zones.length);

    /* ── 運行中的列車（依時刻表推算位置）：回傳每班的 {sv, from, to, frac, ...}。 ── */
    H.activeTrains = function (t) {
      const out = [];
      for (const tr of trips) {
        const st = tr.sv.stops, last = st[st.length - 1];
        const t0 = tr.base + st[0].dep, t1 = tr.base + last.arr;
        if (t < t0 || t > t1) continue;
        let i = 0; while (i < st.length - 1 && tr.base + st[i + 1].arr <= t) i++;
        const s = st[i], n = st[i + 1];
        const depT = tr.base + s.dep, arrT = tr.base + (n ? n.arr : s.dep);
        if (!n) continue;
        if (s.pax === false && n.pax === false) continue;
        const dwelling = t < depT;                  // 還在這站停靠
        out.push({ tr, sv: tr.sv, i, from: s.station, to: n.station, frac: dwelling ? 0 : Math.min(1, Math.max(0, (t - depT) / Math.max(1, arrT - depT))), dwelling, dep: depT, arr: arrT });
      }
      return out;
    };

    H.hm = hm; H.nowSec = nowSec; H.DAY = DAY;
    return H;
  }

  const api = { build, index, parseRouteName, typeClass, hm, shiftDay, nowSec, CFG, DAY };
  root.HK = Object.assign(root.HK || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
