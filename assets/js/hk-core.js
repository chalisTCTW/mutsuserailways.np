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
    // 指定席政策（0.21.0）：特急＝全車指定席（另有立席特急券）；特快＝1・2 号車指定席、3 号車以後自由席。1 号車＝進行方向最前端。
    reserved: [{ re: '特急', cars: 8, mode: 'all' }, { re: '特別快速|特快', cars: 6, mode: 'part', reservedCars: 2 }],
    standRatio: 0.5,               // 立席特急券＝指定席費用的比例
    // 1.1.0：高速鐵路（routeType＝HIGH_SPEED）獨立票價制度，不套用一般的分區運費與 CFG.reserved：
    // 票價＝hsFareStep × 跨越的收費區數（沿用一般鐵路同一套分區；至少算跨 1 區）；全車指定席、沒有立席特急券，
    // 指定席特急券固定 hsSeatFee（不打折）；8 輛編組，1・8 号車（車頭／車尾）各只有 hsEdgeCarSeats 席，其餘每節 seatsPerCar 席。
    hsFareStep: 800, hsSeatFee: 800, hsCars: 8, hsEdgeCarSeats: 8,
    hsColor: '#136880',            // 1.1.0：高速鉄道在票價查詢・車站時刻表・乘車轉乘查詢三個頁面的識別色
    hsExt: null,                   // 1.1.0：地圖外的假想延伸設定（見 site-config.js 的 hsExt；這裡預設沒有）
    childRatio: 0.5, seniorRatio: 0.5,   // 乘車券折扣：12 歲以下、60 歲以上（指定席費用不打折）
    maxTransfers: 2, maxWaitSec: 1800,   // 轉乘搜尋：最多轉乘次數、單次轉乘等待上限
    // 可步行轉乘的車站（粗估 250–350 m）。a／b 為車站中文名稱的開頭；sec＝步行加緩衝所需時間
    // 1.1.0：幸村／新光瀨＝万瀨高速鐵路線的站外轉乘（前輩指定的案例）。sec 先沿用既有案例的 360 秒，
    // 實際步行距離若不同，請改這個數字（這組連線同時用在查詢規劃路線，也用在路線圖判斷「轉乘站」畫法）。
    walkLinks: [{ a: '中央戸宮', b: '大學前', sec: 360 }, { a: '幸村', b: '新光瀨', sec: 360 }],
    minTransferSec: 120,           // 轉乘最短時間（快照有值時以快照為準）
    zoneOverride: {},              // { "車站中文名": 分區編號 }：遊戲內沒設分區時，可在這裡補
    typeMarks: {},                 // 時刻表格子裡的種別略稱；沒寫的種別用種別名稱的第一個字。例：{ '環状快速': '環' }
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
    // 0.26：環狀快速（環快）是獨立的種別，不是一般的「快速」。路線名稱仍保留「環状」，避免與其他路線混在一起。
    const loopExp = name.match(/環[状狀]快速/);
    if (loopExp) return { line: name.replace(loopExp[0], '環状'), type: '環状快速', full: zh };
    for (const tk of TYPE_TOKENS) {
      if (name.length > tk.length && name.endsWith(tk)) return { line: name.slice(0, -tk.length), type: tk, full: zh };
    }
    for (const tk of TYPE_TOKENS) {
      if (name.length > tk.length && name.startsWith(tk)) return { line: name.slice(tk.length), type: tk, full: zh };
    }
    // 0.21.0：種別在名稱中間（例：環狀快速白藏山線直通）也要認得，否則會被當成各停
    for (const tk of TYPE_TOKENS) {
      const k = name.indexOf(tk);
      if (k > 0 && name.length > tk.length) return { line: name.slice(0, k) + name.slice(k + tk.length), type: tk, full: zh };
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
   * ATOS 0.18.3：與 ATOS 網頁共用同一套判斷（atos-web/dispatchplan.js）。每一班依「它發車那一刻」的方案決定是否運行：
   *  - 時段表啟用：該班發車時刻所在時段的方案（預設／離峰＝每 2 班 1 班／深夜＝每 3 班 1 班／收車＝不運行）。
   *  - 目前方案（手動操作或時段套用）自 since 起到 until（下一個時段交界）為止有效；沒有時段表就持續到再次操作。
   *  - 名次：該車庫全部發車時刻依當地時間排序，名次 % N == 0 才運行（與模組相同）；快照裡沒有的時刻一律運行。 */
  const N = { default: 1, midday: 1, offpeak: 2, night: 3 };
  function makeDispatchCore(disp) {
    if (!disp || !disp.active) return null;
    const off = disp.tzOffsetSec | 0;
    /* 1.0.4：規則可帶星期（days＝"135" 週一三五）或指定日期（days＝"d20261111"）；沒有 days＝每天 */
    const rules = (disp.schedule ? (disp.rules || []) : []).slice().sort((a, b) => a.m - b.m);
    const rankOf = {};
    Object.keys(disp.depots || {}).forEach(id => { const m = new Map(); disp.depots[id].forEach((u, i) => m.set(u, i)); rankOf[id] = m; });
    const sinceS = disp.since ? Math.floor(disp.since / 1000) : 0;
    const dayIdxOf = epochS => Math.floor((epochS + off) / DAY);   // 當地日序（1970-01-01＝0，是週四）
    const appliesOn = (r, di) => {
      const t = r.days || '';
      if (!t) return true;
      if (t[0] === 'd') { const d = new Date(di * DAY * 1000); return t === 'd' + String(d.getUTCFullYear()).padStart(4, '0') + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0'); }
      return t.indexOf(String(((di + 3) % 7 + 7) % 7 + 1)) >= 0;   // 週一＝1 … 週日＝7
    };
    const startOf = (r, di) => di * DAY - off + r.m * 60;
    /** epochS 這一刻生效的規則（往回找 8 天內適用且開始時刻最晚、不晚於 epochS 的那一條）→ [規則, 開始時刻]；沒有回 null。 */
    const ruleHit = epochS => {
      if (!rules.length) return null;
      const d0 = dayIdxOf(epochS);
      let best = null, bestAt = -Infinity;
      for (let k = 0; k <= 8 && !best; k++) for (const r of rules) {
        if (!appliesOn(r, d0 - k)) continue;
        const t = startOf(r, d0 - k);
        if (t <= epochS && t > bestAt) { best = r; bestAt = t; }
      }
      return best ? [best, bestAt] : null;
    };
    const ruleStarts = (a, b) => {
      const out = [];
      for (let di = dayIdxOf(a) - 1; di <= dayIdxOf(b) + 1; di++) for (const r of rules) if (appliesOn(r, di)) { const t = startOf(r, di); if (t >= a && t <= b) out.push(t); }
      return out;
    };
    let untilS = Infinity;
    if (disp.until) untilS = Math.floor(disp.until / 1000);
    else if (sinceS && rules.length) { const c = ruleStarts(sinceS + 1, sinceS + 9 * DAY).filter(t => t > sinceS); if (c.length) untilS = Math.min(...c); }
    const stateAct = disp.recall ? 'recall' : (disp.mode || 'default');
    const ruleAt = epochS => { const h = ruleHit(epochS); return h ? h[0].act : 'default'; };
    /** epochS 這一刻適用的方案（default／midday／offpeak／night／recall）。 */
    const actAt = epochS => {
      if (sinceS && epochS >= sinceS && epochS < untilS) return stateAct;
      return rules.length ? ruleAt(epochS) : 'default';
    };
    /* 收車區間；首末班只看「時間最長的那一次收車」（較短的不算分界） */
    const recallIv = (from, to) => {
      const pts = [from, to];
      if (sinceS > from && sinceS < to) pts.push(sinceS);
      if (untilS > from && untilS < to) pts.push(untilS);
      ruleStarts(from, to).forEach(t => pts.push(t));
      pts.sort((x, y) => x - y);
      const out = []; let cur = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1]; if (b <= a) continue;
        if (actAt(a + 1) === 'recall') { if (cur && cur[1] === a) cur[1] = b; else { cur = [a, b]; out.push(cur); } }
      }
      return out;
    };
    const mainCache = {};
    /** 以 nowS 為中心前後 3 天內「時間最長的那一次收車」→ [[開始, 結束]…]（epoch 秒）。 */
    const mainRecalls = nowS => {
      const key = Math.floor(nowS / 60); if (mainCache[key]) return mainCache[key];
      const from = nowS - 3 * DAY, to = nowS + 3 * DAY;
      const core = recallIv(from, to).filter(iv => iv[0] > from && iv[1] < to);
      const max = core.reduce((m, iv) => Math.max(m, iv[1] - iv[0]), 0);
      return (mainCache[key] = core.filter(iv => iv[1] - iv[0] >= max - 60));
    };
    return {
      has: id => !!rankOf[id],
      actAt,
      mainRecalls,
      /** depotId：車庫；raw：UTC 一天秒數的發車時刻；epochS：這一班發車的實際時間（epoch 秒）。 */
      runs(depotId, raw, epochS) {
        const m = rankOf[depotId]; if (!m) return true;
        const a = actAt(epochS); if (a === 'recall') return false;
        const n = N[a] || 1; if (n === 1 && a !== 'midday') return true;
        const i = m.get(raw); if (i == null) return true;
        return a === 'midday' ? i % 3 !== 0 : i % n === 0;
      },
      current(nowS) { return actAt(nowS != null ? nowS : Math.floor(Date.now() / 1000)); },
    };
  }

  function makeDispatch(disp, nowMs) {
    const core = makeDispatchCore(disp); if (!core) return null;
    const nowS = Math.floor((nowMs != null ? nowMs : Date.now()) / 1000);
    const midnight = Math.floor((nowS + CFG.tzOffsetSec) / DAY) * DAY - CFG.tzOffsetSec;   // 這個網站時區今天 0:00 的 epoch 秒
    return {
      has: core.has,
      /** raw：UTC 一天秒數的發車時刻；rel：這一班相對於「今天 0:00」的秒數（含跨日）。 */
      runs: (depotId, raw, rel) => core.runs(depotId, raw, midnight + rel),
      current: () => core.current(nowS),
      /** 1.0.4：主要收車（最長那次）相對於「今天 0:00」的秒數區間，給首末班判斷用。 */
      recallsRel: () => core.mainRecalls(nowS).map(iv => [iv[0] - midnight, iv[1] - midnight]),
    };
  }

  function index(net, dump, disp) {
    const H = { net, cfg: CFG };
    const DP = makeDispatch(disp);
    H.dispatchNow = DP ? DP.current() : 'default';
    /** 1.0.4 首末班：不是「當天最後一班」，而是主要收車（最長那次）之前的最後一班、與收車結束後的第一班。沒有收車時維持原本的第一班／最後一班。times＝當天發車時刻（秒，已排序）。 */
    H.firstLast = times => {
      if (!times || !times.length) return null;
      const iv = (DP ? DP.recallsRel() : []).sort((a, b) => a[0] - b[0]);
      const R0 = iv.find(x => x[1] > 0);
      if (!R0) return [times[0], times[times.length - 1]];
      const R1 = iv.find(x => x[0] > R0[0]) || [R0[0] + DAY, R0[1] + DAY];
      const T = [...new Set(times.concat(times.map(t => t + DAY)))].sort((a, b) => a - b);
      let f = T.find(t => t >= R0[1]); if (f == null) f = times[0];
      let l = null; for (const t of T) if (t >= f && t < R1[0]) l = t;
      if (l == null) l = times[times.length - 1];
      return [f, l];
    };
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
      // 1.1.0：高速鐵路＝routeType 是 HIGH_SPEED「而且」名稱裡有「高速鉄道」兩個條件都要成立，才算萬瀨高速鉄道線。
      // 這是前輩明確要求的雙重判斷：現有特急あおさぎ／特急LINER以前誤設過 routeType=HIGH_SPEED（前輩已改回 NORMAL），
      // 名稱比對是多一層安全網，萬一哪天又被誤設成 HIGH_SPEED，只要名稱裡沒有「高速鉄道」就不會被誤判。
      const isHS = route.rtype === 'HIGH_SPEED' && /高速鉄道/.test(route.zh || route.displayZh || '');
      // 1.1.0：高速鉄道的 tcls 固定給 'hs'（不是一般的 ltd／exp／loc），這樣共用的 .ttag／.mk 樣式才會套到專屬的識別色，
      // 不會被誤判成各停（loc）而顯示成灰框。
      svcs.push({ idx, stops: s.stops.filter(x => !x.op),   /* 1.0.4 運転停車的站不是旅客停靠站：從入口網站的停車站、時刻表、查詢全部拿掉 */ depot: depotsById[s.depot], member, route, line: nm.line, type: nm.type, tcls: isHS ? 'hs' : typeClass(nm.type), routeName: route.displayZh, color: col, ink: inkOn(col), isHS });
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
    /* 車站編碼（0.26.0）：id → ['H05','KU01']；徽章用路線色。沒有編碼的車站回傳空陣列／null，畫面維持原樣。 */
    H.codes = id => ((H.stById[id] || stById[id] || {}).codes) || [];
    H.codeColor = c => { const m = String(c).match(/^[A-Z]+/); const cc = (CFG.codeColors || {}); return (m && (cc[c] || cc[m[0]])) || '#6b7280'; };
    H.codeBadges = id => { const cs = H.codes(id); if (!cs.length) return null; const w = document.createElement('span'); w.className = 'scodes'; cs.forEach(c => { const b = document.createElement('b'); b.className = 'scode'; b.textContent = c; b.style.background = H.codeColor(c); b.style.color = '#fff'; w.append(b); }); return w; };
    if (window.HK_I18N) window.HK_I18N.names(net.stations.filter(s => s.codes && s.codes.length && s.en).map(s => [s.codes.join('/') + ' ' + s.zh, s.codes.join('/') + ' ' + s.en]));
    H.codeText = id => { const cs = H.codes(id); return cs.length ? cs.join('/') : ''; };
    if (window.HK_I18N) window.HK_I18N.names(net.stations.map(s => [s.zh, s.en]).concat((net.routes || []).map(r => [r.zh, r.en]), (net.routes || []).map(r => [r.displayZh, r.en])));

    H.destOf = (sv, i) => {
      const out = i != null && sv.stops[i] && sv.stops[i].out;
      if (out) return out;
      const first = sv.stops[0].station, last = sv.stops[sv.stops.length - 1].station;
      return first === last ? (sv.member.dir || '環狀') : H.stName(last);
    };

    /* ── 特急的「號」（1.0.3）：路線名稱含「特急」者，同一個完整路線名稱、同方向，依起點發車時刻排序；下行奇數、上行偶數；不同特急名稱各自從 1 號起算
     * 1.1.1：前輩確認「高速鉄道的列車都是特急」──萬瀨高速鉄道線的路線全名裡沒有「特急」字樣（只有 routeNumber／簡稱欄位是「特急とりさわ」），
     * 所以除了原本看路線全名、member.rawName，現在也看 member.number（路線編號／簡稱欄位）有沒有含「特急」；
     * 就算哪天連這個欄位都沒寫「特急」，isHS 為真也直接當特急看待，一律會編号。
     * 取名規則：優先用 member.number 裡的簡稱（去掉「特急」，例如「とりさわ」），這樣才不會跟畫面上已經顯示的「万瀨高速鉄道線」路線全名重複；
     * 沒有可用的簡稱才照舊退回用路線全名去掉「特急」。 ── */
    const gouTable = new Map();   // 'svc.idx|一天內起點發車秒' → 例如「あおさぎ39号」／「とりさわ5号」
    (function () {
      const upOf = sv => {
        const f = sv.stops[0].station, l = sv.stops[sv.stops.length - 1].station;
        if (f === l) return !/逆|反/.test(String(sv.member.dir || ''));
        const a = stById[f], b = stById[l]; if (!a || !b) return true;
        return a.z !== b.z ? b.z > a.z : b.x < a.x;
      };
      const groups = new Map();
      svcs.forEach(sv => {
        const full = String(sv.route.displayZh || '');
        const numStr = String(sv.member.number || '');
        const isLtdGou = full.indexOf('特急') >= 0 || String(sv.member.rawName || '').indexOf('特急') >= 0 || numStr.indexOf('特急') >= 0 || sv.isHS;
        if (!isLtdGou) return;
        // member.number 常常只單純寫「特急」兩個字（沒有車次別名，例如一般特急あおさぎ也是這樣）；
        // 只有在去掉「特急」之後還留下東西（例如高速鉄道的「特急とりさわ」→「とりさわ」）才當成可用的簡稱，否則維持用路線全名。
        const numNick = numStr.replace(/特急/g, '').replace(/[\s　]+/g, '');
        const up = upOf(sv), k = full + '|' + (up ? 1 : 0);
        let g = groups.get(k); if (!g) groups.set(k, g = { full, up, list: [], nick: numNick ? numStr : '' });
        sv.depot.departures.forEach(D => g.list.push({ tod: ((Math.round(D + sv.stops[0].dep) % DAY) + DAY) % DAY, idx: sv.idx }));
      });
      groups.forEach(g => {
        g.list.sort((a, b) => a.tod - b.tod || a.idx - b.idx);
        const base = g.nick || g.full;
        const nm = base.replace(/特急/g, '').replace(/[\s\u3000]+/g, '') || base.replace(/[\s\u3000]+/g, '');
        g.list.forEach((e, i) => { const key = e.idx + '|' + e.tod; if (!gouTable.has(key)) gouTable.set(key, nm + (g.up ? 2 * (i + 1) : 2 * (i + 1) - 1) + '号'); });
      });
    })();
    /** 某班（sv、base＝該日起點車庫發車時刻）的號；不是特急回傳空字串。 */
    H.gouOf = (sv, base) => gouTable.get(sv.idx + '|' + (((Math.round(base + sv.stops[0].dep) % DAY) + DAY) % DAY)) || '';

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

    /* ── 轉乘搜尋（Connection Scan） ──
     * 0.21.0：可指定經由車站（via）、可排除必須指定席的列車（noReserved，即特急）、可步行轉乘（walkLinks），
     * 並限制轉乘次數與單次等待。 */
    const normZh = z => String(z || '').replace(/戶/g, '戸');
    const walkMap = new Map();
    (CFG.walkLinks || []).forEach(w => {
      const A = stations.find(s => normZh(s.zh).startsWith(normZh(w.a))), B = stations.find(s => normZh(s.zh).startsWith(normZh(w.b)));
      if (!A || !B) return;
      const ia = sIdx.get(A.id), ib = sIdx.get(B.id);
      (walkMap.get(ia) || walkMap.set(ia, []).get(ia)).push({ to: ib, sec: w.sec });
      (walkMap.get(ib) || walkMap.set(ib, []).get(ib)).push({ to: ia, sec: w.sec });
    });
    H.walkLinks = [...walkMap.entries()].flatMap(([a, l]) => l.map(x => ({ a: stations[a].id, b: stations[x.to].id, sec: x.sec })));
    const svMustReserve = sv => { const ri = H.reserveInfo(sv); return !!(ri && ri.mode === 'all'); };
    function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].dep < t) lo = m + 1; else hi = m; } return lo; }
    function searchOnce(o, d, t0, opt) {
      const n = stations.length, arrive = new Float64Array(n).fill(Infinity), inConn = new Int32Array(n).fill(-1);
      const ready = new Float64Array(n).fill(Infinity), readySrc = new Int32Array(n).fill(-1);
      const boarded = new Map(); arrive[o] = t0; ready[o] = t0; readySrc[o] = o;
      const skipTrip = new Map(); let endWalkFrom = -1, endWalkSec = 0;
      for (let k = lowerBound(conns, t0); k < conns.length; k++) {
        const c = conns[k];
        if (c.dep > arrive[d] || c.dep > t0 + 30 * 3600) break;
        if (opt && opt.noReserved) {
          let sk = skipTrip.get(c.trip); if (sk === undefined) skipTrip.set(c.trip, sk = svMustReserve(trips[c.trip].sv));
          if (sk) continue;
        }
        // 1.1.0：高速鐵路預設不納入查詢結果，要玩家勾選「使用高速鐵路」（opt.allowHighSpeed）才會出現在轉乘搜尋裡。
        if (!(opt && opt.allowHighSpeed) && trips[c.trip].sv.isHS) continue;
        let b = boarded.get(c.trip);
        if (!b && ready[c.from] <= c.dep && (ready[c.from] === t0 && readySrc[c.from] === o || c.dep - ready[c.from] <= CFG.maxWaitSec + minTransfer || c.from === o)) {
          b = { k, src: readySrc[c.from] }; boarded.set(c.trip, b);
        }
        if (b && c.arr < arrive[c.to]) {
          arrive[c.to] = c.arr; inConn[c.to] = k; if (c.to === d) endWalkFrom = -1;
          const r = c.arr + minTransfer; if (r < ready[c.to]) { ready[c.to] = r; readySrc[c.to] = c.to; }
          const ws = walkMap.get(c.to);
          if (ws) for (const w of ws) { const rw = c.arr + w.sec; if (rw < ready[w.to]) { ready[w.to] = rw; readySrc[w.to] = c.to; } }
        }
        if (b) { const wd = walkMap.get(c.to); if (wd) for (const w of wd) if (w.to === d && c.arr + w.sec < arrive[d]) { arrive[d] = c.arr + w.sec; inConn[d] = k; endWalkFrom = c.to; endWalkSec = w.sec; } }
      }
      if (arrive[d] === Infinity) return null;
      const legs = []; let st = endWalkFrom >= 0 ? endWalkFrom : d, guard = 0;
      while (guard++ < 12) {
        const endC = conns[inConn[st === endWalkFrom && guard === 1 ? d : st]], b = boarded.get(endC.trip), bC = conns[b.k], trip = trips[endC.trip];
        const stops = trip.sv.stops.slice(bC.i, endC.i + 2).map(s => ({ station: s.station, arr: trip.base + s.arr, dep: trip.base + s.dep, platform: s.platformName, pax: s.pax }));
        const walk = b.src !== bC.from && b.src >= 0 ? { from: stations[b.src].id, to: stations[bC.from].id, sec: ((walkMap.get(b.src) || []).find(w => w.to === bC.from) || {}).sec || 0 } : null;
        legs.unshift({ sv: trip.sv, stops, board: bC.i, trip: endC.trip, walk, gou: H.gouOf(trip.sv, trip.base) });
        st = b.src;
        if (st === o || st < 0) break;
      }
      return { dep: legs[0].stops[0].dep, arr: arrive[d], legs, endWalk: endWalkFrom >= 0 ? { from: stations[endWalkFrom].id, to: stations[d].id, sec: endWalkSec } : null };
    }
    /** 同到達時間者取最晚出發。 */
    function bestFrom(o, d, t, opt) {
      let j = searchOnce(o, d, t, opt); if (!j) return null;
      for (let g = 0; g < 12; g++) { const j2 = searchOnce(o, d, j.dep + 1, opt); if (j2 && j2.arr <= j.arr) j = j2; else break; }
      return j;
    }
    function viaJourney(o, v, d, t, opt) {
      const j1 = bestFrom(o, v, t, opt); if (!j1) return null;
      const last = j1.legs[j1.legs.length - 1];
      let j2 = bestFrom(v, d, j1.arr, opt); if (!j2) return null;
      if (j2.legs[0].trip !== last.trip && j2.dep < j1.arr + (j2.legs[0].walk ? 0 : minTransfer)) { j2 = bestFrom(v, d, j1.arr + minTransfer, opt); if (!j2) return null; }
      const legs = j1.legs.slice();
      j2.legs.forEach((lg, i) => {
        if (i === 0 && lg.trip === last.trip) last.stops = last.stops.concat(lg.stops.slice(1));
        else legs.push(lg);
      });
      return { dep: j1.dep, arr: j2.arr, legs, endWalk: j2.endWalk };
    }
    const okJourney = j => {
      if (j.legs.length - 1 > CFG.maxTransfers) return false;
      for (let i = 1; i < j.legs.length; i++) { const prev = j.legs[i - 1].stops, wait = j.legs[i].stops[0].dep - prev[prev.length - 1].arr; if (wait > CFG.maxWaitSec) return false; }
      return true;
    };
    /** fromId → toId，t0 之後最早的 count 個選項。opt：{ via: 車站id, noReserved: true } */
    H.searchEx = function (fromId, toId, t0, count, opt) {
      opt = opt || {};
      const o = sIdx.get(fromId), d = sIdx.get(toId), v = opt.via && opt.via !== fromId && opt.via !== toId ? sIdx.get(opt.via) : null, out = []; count = count || 4;
      if (o == null || d == null || o === d) return out;
      let t = t0;
      for (let i = 0, tries = 0; out.length < count && tries < count * 4; tries++) {
        const j = v != null ? viaJourney(o, v, d, t, opt) : bestFrom(o, d, t, opt);
        if (!j) break;
        t = j.dep + 1;
        if (!okJourney(j)) continue;
        if (!out.length || j.dep > out[out.length - 1].dep) out.push(j);
      }
      return out;
    };
    H.search = function (fromId, toId, t0, count) { return H.searchEx(fromId, toId, t0, count, {}); };

    /* ── 實體鄰接圖（用在票價與路線圖） ──
     * 各停站的班次連出「相鄰站」；快速、特急跳站的連線如果被別的班次拆成經過中間站的路徑，就視為重複，丟掉。
     * 1.1.0：高速鐵路（isHS）不納入這張圖——這張圖同時餵給路線圖拓樸（hk-map.js）跟一般票價的分區路徑搜尋，
     * 高速鐵路不該影響拓樸比例、也不該被一般分區票價的路徑搜尋誤用，它有自己獨立的票價公式（見 H.hsFare）。 */
    const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
    const edges = new Map();     // key → { a, b, svcs:Set(idx), n }
    const seqs = [];
    svcs.filter(sv => !sv.isHS).forEach(sv => {
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

    /* 1.1.0：高速鐵路——不進 H.edges／H.adj（不影響拓樸比例與一般票價路徑搜尋），
     * 但路線圖要另外用虛線畫出來，並且標出「轉乘站」：高速鐵路有停、而且一般路網也有服務的車站
     * （同一站本身有一般路線停靠，或透過 walkLinks 站外轉乘到一個有一般路線停靠的車站）。 */
    const hsPairs = new Map(); // key → {a,b}
    svcs.filter(sv => sv.isHS).forEach(sv => {
      const seq = sv.stops.filter(s => s.pax !== false).map(s => s.station);
      for (let i = 0; i < seq.length - 1; i++) { if (seq[i] === seq[i + 1]) continue; const k = pairKey(seq[i], seq[i + 1]); if (!hsPairs.has(k)) hsPairs.set(k, { a: seq[i], b: seq[i + 1] }); }
    });
    H.hsEdges = [...hsPairs.values()].map(e => { const a = H.stById[e.a], b = H.stById[e.b]; return a && b ? { a: e.a, b: e.b, len: Math.hypot(a.x - b.x, a.z - b.z) } : null; }).filter(Boolean);
    const hsStationIds = new Set(); svcs.filter(sv => sv.isHS).forEach(sv => sv.stops.forEach(s => { if (s.pax !== false) hsStationIds.add(s.station); }));
    const normalStationIds = new Set(); svcs.filter(sv => !sv.isHS).forEach(sv => sv.stops.forEach(s => { if (s.pax !== false) normalStationIds.add(s.station); }));
    H.hsTransferIds = new Set();
    hsStationIds.forEach(id => {
      if (normalStationIds.has(id)) { H.hsTransferIds.add(id); return; }
      for (const w of H.walkLinks) { if (w.a === id && normalStationIds.has(w.b)) { H.hsTransferIds.add(id); H.hsTransferIds.add(w.b); } if (w.b === id && normalStationIds.has(w.a)) { H.hsTransferIds.add(id); H.hsTransferIds.add(w.a); } }
    });
    /* 站外轉乘（幸村↔新光瀨這類）額外加一條虛線，讓路線圖看得出兩站是連在一起的 */
    H.walkLinks.forEach(w => { if (H.hsTransferIds.has(w.a) && H.hsTransferIds.has(w.b) && hsStationIds.has(w.a) !== hsStationIds.has(w.b)) { const a = H.stById[w.a], b = H.stById[w.b]; if (a && b) H.hsEdges.push({ a: w.a, b: w.b, len: Math.hypot(a.x - b.x, a.z - b.z), walk: true }); } });

    /* 1.1.0：万瀨高速鉄道線「地圖外」的假想延伸（CFG.hsExt，見 site-config.js）——東平倉之後還沒建進地圖的
     * 花宮天照／豐守／新岩沢，純粹是「設定」：不是遊戲內真正存在的站，不會進地圖、不會進拓樸、也完全不影響
     * 真正車次的判斷與運作；只用在高速鉄道自己的票價／路線查詢欄位，讓玩家可以先查到之後會通到的站、方面與票價。 */
    H.hsExtStops = []; H.hsQueryStations = [];
    (function () {
      const ext = CFG.hsExt; if (!ext || !ext.stops || !ext.stops.length) return;
      (ext.real || []).forEach(zh => { const st = stations.find(s => s.zh === zh); if (st) H.hsQueryStations.push({ id: st.id, zh, real: true }); });
      let prevZh = ext.afterZh;
      ext.stops.forEach(e => {
        const entry = { id: 'hsext:' + e.zh, zh: e.zh, real: false, km: e.km || 0, min: e.min || 0, zoneBoundary: !!e.zoneBoundary, prevZh };
        H.hsExtStops.push(entry); H.hsQueryStations.push(entry); prevZh = e.zh;
      });
    })();
    /** 1.1.1：假想延伸段的「銜接站」——地圖內真正存在的那個車站（目前是東平倉），所有假想延伸站都是從這一站往地圖外接出去的。
     *  訂票・乘車轉乘查詢要讓玩家選假想站當起訖站時，拿這一站當作實際連乘搜尋（H.searchEx）用的替身車站；
     *  假想延伸沒設定好、或銜接站不在目前路網裡時回傳 null，UI 端要自己檢查。 */
    H.hsExtAnchorSt = function () {
      const ext = CFG.hsExt; if (!ext || !ext.afterZh) return null;
      return stations.find(s => s.zh === ext.afterZh) || null;
    };
    /** 高速鉄道獨立查詢欄位用：兩個站名（地圖內的真實站、或地圖外的假想延伸站皆可）之間的票價。
     *  不經過一般票價的拓樸搜尋（高速鉄道不在 H.adj 裡），而是沿著 H.hsQueryStations 這個固定順序直接算：
     *  真實站之間沿用「有沒有共同收費區」的分區定義；碰到假想延伸站的那一段，收費區跨越與否照 CFG.hsExt
     *  裡每一站自己的 zoneBoundary 設定（前輩指定：東平倉—豐守一區、豐守—新岩沢另一區，花宮天照與東平倉同區）。 */
    H.hsFareExt = function (aZh, bZh) {
      const list = H.hsQueryStations; if (!list.length) return null;
      const ia = list.findIndex(s => s.zh === aZh), ib = list.findIndex(s => s.zh === bZh);
      if (ia < 0 || ib < 0 || ia === ib) return null;
      const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
      let crossed = 0, km = 0, cur = list[lo].real ? H.zoneSet(list[lo].id).slice() : [];
      for (let i = lo + 1; i <= hi; i++) {
        const prev = list[i - 1], node = list[i];
        if (prev.real && node.real) {
          const A = H.stById[prev.id], B = H.stById[node.id];
          if (A && B) km += Math.hypot(A.x - B.x, A.z - B.z) / 1000;
          const zt = H.zoneSet(node.id);
          if (zt.length) { if (!cur.length) cur = zt.slice(); else { const inter = cur.filter(z => zt.includes(z)); if (inter.length) cur = inter; else { crossed++; cur = zt.slice(); } } }
        } else {
          km += node.km || 0;
          if (node.zoneBoundary) crossed++;
          cur = [];
        }
      }
      crossed = Math.max(1, crossed);
      const base = CFG.hsFareStep * crossed;
      return { yen: base, base: 0, step: CFG.hsFareStep, crossed, zones: crossed, zoneFee: base, seat: CFG.hsSeatFee, total: base + CFG.hsSeatFee, path: list.slice(lo, hi + 1).map(s => s.zh), km, isHS: true, noStanding: true, ext: true };
    };

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
    /** 1.1.0：高速鐵路的乘車券票價——不走一般鐵路的分區路徑搜尋（高速鐵路已經不在 H.adj 裡），
     *  而是沿著這一段「實際搭乘」的停靠站序列（stops，來自已經決定好的班次／行程），用同一套「有沒有共同收費區」
     *  的分區定義去算跨越次數，乘上 hsFareStep。至少算跨 1 個區間（沒有免費搭一小段高速鐵路的情況）。
     *  沒有立席特急券：指定席特急券固定收 hsSeatFee，不因距離而變、不打折。 */
    H.hsFare = function (stops) {
      if (!stops || stops.length < 2) return null;
      let crossed = 0, cur = H.zoneSet(stops[0].station).slice(), km = 0;
      const bounds = [];
      for (let i = 1; i < stops.length; i++) {
        const A = H.stById[stops[i - 1].station], Bq = H.stById[stops[i].station];
        if (A && Bq) km += Math.hypot(A.x - Bq.x, A.z - Bq.z);
        const zt = H.zoneSet(stops[i].station); if (!zt.length) continue;
        if (!cur.length) { cur = zt.slice(); continue; }
        const inter = cur.filter(z => zt.includes(z));
        if (inter.length) cur = inter; else { bounds.push({ from: stops[i - 1].station, to: stops[i].station, fromZone: cur.slice(), toZone: zt.slice() }); cur = zt.slice(); crossed++; }
      }
      crossed = Math.max(1, crossed);
      const base = CFG.hsFareStep * crossed;
      return { yen: base, base: 0, step: CFG.hsFareStep, crossed, zones: crossed, zoneFee: base, seat: CFG.hsSeatFee, total: base + CFG.hsSeatFee, path: stops.map(s => s.station), bounds, km: km / 1000, isHS: true, noStanding: true };
    };
    /** 1.1.0：一段行程（searchEx 回傳的 legs）的乘車券票價——按「一般鐵路／高速鐵路」分段，
     *  每一段各自用自己的票價公式算一次「整段的直達票價」再加總；純一般鐵路的行程（沒有任何 isHS 的 leg）
     *  結果與原來的 H.fare(from,to) 完全一樣（因為只會有一段，起訖點相同），不影響既有的查詢／訂票流程。
     *  回傳形狀盡量貼近 H.fare：{yen,crossed,path,bounds,km,runs}。 */
    H.journeyFare = function (legs) {
      if (!legs || !legs.length) return null;
      const runs = []; let cur = null;
      legs.forEach(leg => {
        const isHS = !!leg.sv.isHS;
        if (!cur || cur.isHS !== isHS) { cur = { isHS, stops: [] }; runs.push(cur); }
        const add = leg.stops.slice(cur.stops.length ? 1 : 0);   // 避免轉乘站重複計入
        cur.stops.push(...add);
      });
      let yenSum = 0, crossedSum = 0, kmSum = 0; const path = [], bounds = [];
      for (const r of runs) {
        const f = r.isHS ? H.hsFare(r.stops) : H.fare(r.stops[0].station, r.stops[r.stops.length - 1].station);
        if (!f) return null;
        yenSum += f.yen; crossedSum += f.crossed; kmSum += f.km;
        (f.path || []).forEach(id => { if (path[path.length - 1] !== id) path.push(id); });
        bounds.push(...(f.bounds || []));
        r.fare = f;
      }
      return { yen: yenSum, crossed: crossedSum, zones: crossedSum, path, bounds, km: kmSum, runs, isMixed: runs.length > 1 };
    };
    /** 指定席資訊；沒有指定席的種別回傳 null。
     *  mode 'all'＝全車指定席（可買立席特急券，費用為指定席的一半）；mode 'part'＝前 reservedCars 節指定席、其餘自由席（不收指定席費）。
     *  1.1.0：高速鐵路（isHS）是獨立的全車指定席制度——沒有立席特急券（noStanding），指定席特急券固定 hsSeatFee（不打折），
     *  8 輛編組中 1・8 号車（車頭／車尾）各只有 hsEdgeCarSeats 席、其餘每節 seatsPerCar 席，不套用 CFG.reserved 的名稱比對。 */
    H.reserveInfo = function (sv) {
      if (sv._ri !== undefined) return sv._ri;
      let out = null;
      if (sv.isHS) {
        const cars = CFG.hsCars, edge = CFG.hsEdgeCarSeats;
        out = { mode: 'all', cars, reservedCars: cars, seats: CFG.seatsPerCar * (cars - 2) + edge * 2, fee: CFG.hsSeatFee, standFee: 0, noStanding: true, perCar: CFG.seatsPerCar, edgeCarSeats: edge };
      } else {
        for (const r of CFG.reserved) if (new RegExp(r.re).test(sv.routeName)) {
          const rc = r.mode === 'part' ? r.reservedCars : r.cars;
          out = { mode: r.mode || 'all', cars: r.cars, reservedCars: rc, seats: rc * CFG.seatsPerCar, fee: CFG.seatFee, standFee: r.mode === 'part' ? 0 : Math.round(CFG.seatFee * CFG.standRatio), perCar: CFG.seatsPerCar };
          break;
        }
      }
      return (sv._ri = out);
    };
    /** 顯示文字：全車指定席／1・2号車指定席。 */
    H.reserveLabel = function (sv) { const ri = H.reserveInfo(sv); if (!ri) return ''; return ri.mode === 'all' ? '全車指定席' : (ri.reservedCars === 1 ? '1号車' : '1・' + ri.reservedCars + '号車') + '指定席／' + (ri.reservedCars + 1) + '号車以後自由席'; };
    /** 編組節數（顯示用）：指定席種別依規定；其他用車庫內有出庫路徑的側線的編組。 */
    H.carsOf = function (sv) {
      const ri = H.reserveInfo(sv); if (ri) return ri.cars;
      const sd = ((sv.depot && sv.depot.sidings) || []).filter(x => x.cars > 0 && x.path !== false).map(x => x.cars);
      if (sd.length) { const c = new Map(); sd.forEach(n => c.set(n, (c.get(n) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]; }
      return 8;
    };
    H.ticketFares = function (fromId, toId) {
      const r = H.fare(fromId, toId); if (!r) return null;
      return { adult: r.yen, child: Math.round(r.yen * CFG.childRatio), senior: Math.round(r.yen * CFG.seniorRatio), detail: r };
    };
    /** 1.1.0：依「實際搭乘的行程」（legs）算乘車券票價——可能含高速鐵路，所以不能只看起訖站。
     *  兒童／優待折扣照樣套用在合計金額上（高速鐵路的分區費用也打折；指定席特急券不管一般或高速鐵路都不打折，另外算）。 */
    H.ticketFaresFor = function (legs) {
      const r = H.journeyFare(legs); if (!r) return null;
      return { adult: r.yen, child: Math.round(r.yen * CFG.childRatio), senior: Math.round(r.yen * CFG.seniorRatio), detail: r };
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

  /** 種別略稱（時刻表格子用）：各停不標示；其他種別取種別名稱的第一個字（可用 typeMarks 覆寫）。 */
  function typeMarkOf(type) { return type && typeClass(type) !== 'loc' ? (CFG.typeMarks[type] || Array.from(type)[0]) : ''; }
  const api = { build, index, parseRouteName, typeClass, typeMarkOf, hm, shiftDay, nowSec, CFG, DAY };
  root.HK = Object.assign(root.HK || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
