/* model.js — 把 MTR 資料傾印（模組 /hikarise/api/network 的輸出）轉成網頁用的路網模型。
 * 這是 tools/parse_save.py 的 JavaScript 版，兩邊的輸出用 tools/golden_test.js 對照，必須一致。
 * 輸入是與存檔欄位相同的 JSON；超過 2^53 的整數 id 以字串表示。 */
(function (root) {
  'use strict';

  const KMH = 1 / 3.6;
  const DIRS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
  // MTR 4 的軌道角度其實有 16 種（每 22.5°）；中間角度（SEE、SSE…）以 E=0°、S=90° 的三角函數補上
  { const names = ['E', 'SEE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'SWW', 'W', 'NWW', 'NW', 'NNW', 'N', 'NNE', 'NE', 'NEE'];
    names.forEach((nm, i) => { if (!DIRS[nm]) { const a = i * Math.PI / 8; DIRS[nm] = [Math.cos(a), Math.sin(a)]; } }); }

  /* ───────── 小工具（盡量對齊 Python 的行為） ───────── */
  const S = v => String(v);
  const pyRound = (x, nd) => { // Python 的 round()：依雙精度的精確十進位值四捨五入，剛好在中點時取偶數
    if (!isFinite(x)) return x;
    const ex = Math.abs(x).toFixed(Math.min(100, nd + 60)), dot = ex.indexOf('.');
    const tail = ex.slice(dot + 1 + nd);
    if (tail[0] === '5' && /^0*$/.test(tail.slice(1))) {
      const keep = ex.slice(0, dot + 1 + nd).replace(/\.$/, '');
      const digits = keep.replace('.', ''), lastDigit = +digits[digits.length - 1];
      let r = Number(keep); if (lastDigit % 2 === 1) r += Math.pow(10, -nd); // 奇數進位，偶數捨去
      return (x < 0 ? -1 : 1) * Number(r.toFixed(nd));
    }
    return Number(x.toFixed(nd));
  };
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const hyp = Math.hypot;
  const trunc = Math.trunc;
  function mostCommon(values) { // Counter.most_common(1)：同數量取最先出現者
    const m = new Map(); for (const v of values) m.set(v, (m.get(v) || 0) + 1);
    let best = null, bc = -1; for (const [k, c] of m) if (c > bc) { best = k; bc = c; } return best;
  }
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const entityKey = e => ('id' in e) ? '0|' + S(e.id) : '1|' + JSON.stringify(['position1', 'position2'].flatMap(k => { const p = e[k] || {}; return [p.x, p.y, p.z]; }));
  const sorted = list => [...list].sort((a, b) => cmpStr(entityKey(a), entityKey(b)));

  /* ───────── 命名規則 ───────── */
  const COPY_RE = /\bcopy\b/i, COPY_RE_G = /\bcopy\b/ig;
  function splitZhEn(s) { const i = s.indexOf('|'); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }
  function parseRouteName(raw) {
    const notes = []; if (COPY_RE.test(raw)) notes.push('Copy');
    const clean = raw.replace(COPY_RE_G, '').replace(/\s+/g, ' ').trim();
    const i = clean.indexOf('||');
    const namePart = i < 0 ? clean : clean.slice(0, i), dirPart = i < 0 ? '' : clean.slice(i + 2);
    const [zh, en] = splitZhEn(namePart);
    return [zh.trim(), en.trim(), dirPart.trim(), notes];
  }

  /* ───────── 幾何 ───────── */
  const unit = name => { const [x, z] = DIRS[name], n = hyp(x, z); return [x / n, z / n]; };
  function curveParams(e) {
    const sx = e.startPosition.x, sz = e.startPosition.z, ex = e.endPosition.x, ez = e.endPosition.z;
    const chord = hyp(ex - sx, ez - sz);
    const d1 = unit(e.startAngle), u2 = unit(e.endAngle), d2 = [-u2[0], -u2[1]];
    const cosT = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])), th = Math.acos(cosT);
    return { sx, sz, ex, ez, chord, d1, d2, th };
  }
  function geomLength(e) {
    const { sx, sz, ex, ez, chord, d1, d2, th } = curveParams(e);
    const dy = e.endPosition.y - e.startPosition.y;
    if (chord === 0) return Math.abs(dy);
    let h;
    if (th < 1e-6) h = chord / 3;
    else {
      const R = Math.sin(th / 2) > 1e-6 ? chord / (2 * Math.sin(th / 2)) : chord;
      h = Math.min((4 / 3) * Math.tan(th / 4) * R, chord);
    }
    const p0 = [sx, sz], p3 = [ex, ez], p1 = [sx + d1[0] * h, sz + d1[1] * h], p2 = [ex - d2[0] * h, ez - d2[1] * h];
    let L = 0, prev = p0;
    for (let k = 1; k <= 40; k++) {
      const t = k / 40, u = 1 - t;
      const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
      const z = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
      L += hyp(x - prev[0], z - prev[1]); prev = [x, z];
    }
    return hyp(L, dy);
  }
  function bezierPoints(e, step = 10.0) {
    const { sx, sz, ex, ez, chord, d1, d2, th } = curveParams(e);
    if (chord === 0) return [[sx, sz], [ex, ez]];
    const cross = Math.abs((ex - sx) * d1[1] - (ez - sz) * d1[0]) / chord;
    if (th < 1e-6 && cross < 1e-6) return [[sx, sz], [ex, ez]];
    let h;
    if (th < 1e-6) h = chord / 3;
    else { const R = Math.sin(th / 2) > 1e-6 ? chord / (2 * Math.sin(th / 2)) : chord; h = Math.min((4 / 3) * Math.tan(th / 4) * R, chord); }
    const p0 = [sx, sz], p3 = [ex, ez], p1 = [sx + d1[0] * h, sz + d1[1] * h], p2 = [ex - d2[0] * h, ez - d2[1] * h];
    const n = Math.max(3, Math.min(48, trunc(chord / step) + 2)), pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]);
    }
    return pts;
  }
  /** MTR 的 Position（整數方塊座標，含高度 y）。遊戲內「同一條軌道」就是兩端 Position 相同的軌道。 */
  const posKey = p => p.x + ',' + p.y + ',' + p.z;
  const segKey = e => { const s = e.startPosition, t = e.endPosition; return [s.x, s.y, s.z, t.x, t.y, t.z, e.startAngle, e.endAngle].join(','); };
  const revKey = e => { const s = e.startPosition, t = e.endPosition; return [t.x, t.y, t.z, s.x, s.y, s.z, e.endAngle, e.startAngle].join(','); };

  /* ───────── 速度曲線 ───────── */
  function segTV(l, vs, ve, vmax, a, d) {
    vs = Math.min(vs, vmax); ve = Math.min(ve, vmax);
    if (l <= 0) return [0.0, Math.max(vs, ve)];
    const vpk2 = (2 * l * a * d + d * vs * vs + a * ve * ve) / (a + d);
    let vp = Math.min(vmax, Math.sqrt(Math.max(vpk2, 0)));
    vp = Math.max(vp, vs, ve, 1e-6);
    const da = (vp * vp - vs * vs) / (2 * a), dd = (vp * vp - ve * ve) / (2 * d);
    const cruise = Math.max(0.0, l - da - dd);
    return [(vp - vs) / a + (vp - ve) / d + cruise / vp, vp];
  }
  function simulatePath(entries, lengths, a, d) {
    const n = entries.length;
    const vmax = entries.map(e => e.speedLimit * KMH), stop = entries.map(e => e.dwellTime > 0);
    const b = new Array(n + 1).fill(0.0);
    for (let i = 1; i < n; i++) b[i] = stop[i - 1] ? 0.0 : Math.min(vmax[i - 1], vmax[i]);
    b[n] = 0.0;
    for (let i = 0; i < n; i++) b[i + 1] = Math.min(b[i + 1], Math.sqrt(b[i] ** 2 + 2 * a * lengths[i]));
    for (let i = n - 1; i >= 0; i--) b[i] = Math.min(b[i], Math.sqrt(b[i + 1] ** 2 + 2 * d * lengths[i]));
    const res = []; for (let i = 0; i < n; i++) res.push(segTV(lengths[i], b[i], b[i + 1], vmax[i], a, d));
    return { times: res.map(r => r[0]), profiles: res.map((r, i) => [b[i], r[1], b[i + 1]]) };
  }
  function segHitsBox(p1, p2, b1, b2, margin = 3) {
    const x0 = Math.min(b1.x, b2.x), x1 = Math.max(b1.x, b2.x), z0 = Math.min(b1.z, b2.z), z1 = Math.max(b1.z, b2.z);
    for (let k = 0; k <= 200; k++) {
      const t = k / 200, x = p1.x + (p2.x - p1.x) * t, z = p1.z + (p2.z - p1.z) * t;
      if (x0 - margin <= x && x <= x1 + margin && z0 - margin <= z && z <= z1 + margin) return true;
    }
    return false;
  }

  /* ───────── 主流程 ───────── */
  function buildNetwork(dump, cfgIn) {
    const cfg = Object.assign({ routeNameOverrides: {}, depotOffsetSec: {}, minTransferSec: 60 }, cfgIn || {});
    const stationsRaw = sorted(dump.stations), platsRaw = sorted(dump.platforms), routesRaw = sorted(dump.routes);
    const depotsRaw = sorted(dump.depots), sidingsRaw = sorted(dump.sidings), railsRaw = sorted(dump.rails);
    const report = { warnings: [], info: [] };
    const warn = m => report.warnings.push(m), info = m => report.info.push(m);

    /* 車站 / 月台 */
    const center = p => [(p.position1.x + p.position2.x) / 2, (p.position1.z + p.position2.z) / 2];
    const inBox = (x, z, s) => { const a = s.position1, b = s.position2; return Math.min(a.x, b.x) <= x && x <= Math.max(a.x, b.x) && Math.min(a.z, b.z) <= z && z <= Math.max(a.z, b.z); };
    const plat = new Map();
    for (const p of platsRaw) {
      const [x, z] = center(p), owner = stationsRaw.filter(s => inBox(x, z, s));
      if (owner.length !== 1) { warn(`月台 ${p.name}（座標 ${trunc(x)}, ${trunc(z)}）對應到 ${owner.length} 個車站，未納入`); continue; }
      plat.set(S(p.id), { id: S(p.id), name: p.name, station: S(owner[0].id), dwell: p.dwellTime / 1000, x, z });
    }
    const stations = new Map();
    for (const s of stationsRaw) {
      const [zh, en] = splitZhEn(s.name);
      stations.set(S(s.id), { id: S(s.id), zh, en, color: s.color, x: (s.position1.x + s.position2.x) / 2, z: (s.position1.z + s.position2.z) / 2, platforms: [] });
    }
    for (const p of plat.values()) stations.get(p.station).platforms.push({ id: p.id, name: p.name });

    /* 路線 */
    const depotOfRoute = new Map();
    for (const d of depotsRaw) for (const rid of d.routeIds) { const k = S(rid); if (!depotOfRoute.has(k)) depotOfRoute.set(k, []); depotOfRoute.get(k).push(d); }
    const depotHasService = d => d.useRealTime ? d.realTimeDepartures.length > 0 : false;

    const members = [];
    for (const r of routesRaw) {
      const [zh, en, dirn, notes] = parseRouteName(r.name);
      const stops = [];
      for (const rp of r.routePlatformData) {
        const p = plat.get(S(rp.platformId));
        if (!p) { warn(`路線 ${r.name} 引用了不存在的月台`); continue; }
        stops.push({ station: p.station, platform: p.id, platformName: p.name, dest: rp.customDestination });
      }
      const dps = (depotOfRoute.get(S(r.id)) || []).filter(depotHasService);
      members.push({ id: S(r.id), rawName: r.name, zh, en, dir: dirn, notes, number: r.routeNumber, color: r.color, circular: r.circularState,
        stops, depots: dps.map(d => S(d.id)), operating: dps.length > 0 });
    }

    const setKey = a => JSON.stringify([...new Set(a)].sort());
    function mergeKey(m) {
      const ss = m.stops.map(s => s.station);
      if (!ss.length) return JSON.stringify(['empty', m.zh, m.en]);
      if (ss[0] === ss[ss.length - 1]) return JSON.stringify(['loop', setKey(ss)]);
      return JSON.stringify(['line', setKey(ss), setKey([ss[0], ss[ss.length - 1]])]);
    }
    const groups = new Map();
    for (const m of members) { const k = mergeKey(m); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    for (const k of [...groups.keys()].filter(k => JSON.parse(k)[0] === 'empty')) {
      const kk = JSON.parse(k); let host = null;
      for (const [k2, ms2] of groups) { if (JSON.parse(k2)[0] !== 'empty' && ms2.some(m => m.zh === kk[1] && m.en === kk[2])) { host = k2; break; } }
      if (host) { groups.get(host).push(...groups.get(k)); groups.delete(k); warn(`路線「${kk[1]}」有方向尚未設定停靠站，已併入同名路線`); }
    }

    const routes = []; let gi = 0;
    for (const ms of groups.values()) {
      const zhNames = new Set(ms.map(m => m.zh));
      if (zhNames.size > 1) warn(`合併了不同名稱的路線: ${JSON.stringify([...zhNames].sort())}`);
      const zh = mostCommon(ms.map(m => m.zh));
      const enOpts = ms.filter(m => m.en).map(m => m.en);
      const en = cfg.routeNameOverrides[zh] || (enOpts.length ? mostCommon(enOpts) : '');
      if (new Set(enOpts).size > 1 && !(zh in cfg.routeNameOverrides)) warn(`路線「${zh}」成員英文名不一致 ${JSON.stringify([...new Set(enOpts)].sort())}，請在 config.json 的 routeNameOverrides 指定`);
      const dirs = new Map();
      for (const m of ms) { const k = m.dir || '單向'; if (!dirs.has(k)) dirs.set(k, []); dirs.get(k).push(m); }
      const directionList = [];
      for (const [label, dm] of dirs) {
        dm.sort((a, b) => ((!a.operating) - (!b.operating)) || ((a.notes.includes('Copy')) - (b.notes.includes('Copy'))));
        directionList.push({ label, operating: dm.some(m => m.operating), members: dm.map(m => m.id) });
      }
      const operating = ms.some(m => m.operating);
      routes.push({ key: 'r' + gi, zh, en, color: ms[0].color, status: operating ? 'operating' : 'maintenance', statusLabel: operating ? '' : '路線工務中',
        notes: [...new Set(ms.flatMap(m => m.notes))].sort(), mergedFrom: ms.map(m => m.rawName), directions: directionList });
      gi++;
    }
    const zhCount = new Map();
    for (const r of routes) zhCount.set(r.zh, (zhCount.get(r.zh) || 0) + 1);
    for (const r of routes) {
      const same = routes.filter(x => x.zh === r.zh), primary = same.filter(x => x.status === 'operating');
      const keepPlain = same.length === 1 || (primary.length === 1 && primary[0] === r);
      r.displayZh = keepPlain ? r.zh : `${r.zh}（${r.directions.map(dd => dd.label).join('／')}）`;
    }
    for (const [z, c] of zhCount) if (c > 1) warn(`有 ${c} 條路線同名「${z}」但停靠站不同，未合併；營運中的保留原名，其餘名稱後加方向區分`);
    const routeOfMember = new Map();
    for (const r of routes) for (const dd of r.directions) for (const mid of dd.members) routeOfMember.set(mid, r.key);

    /* 側線長度查表 */
    const lengthTbl = new Map();
    for (const s of sidingsRaw) for (const key of ['pathSidingToMainRoute', 'pathMainRouteToSiding']) for (const e of (s[key] || [])) {
      const L = e.endDistance - e.startDistance;
      if (L > 0) { lengthTbl.set(segKey(e), L); lengthTbl.set(revKey(e), L); }
    }
    const depotSidings = d => sidingsRaw.filter(s => s.vehicleCars.length && s.pathSidingToMainRoute.length && segHitsBox(s.position1, s.position2, d.position1, d.position2));
    const stats = { lookup: 0, geom: 0, geomErr: [] };
    function entryLen(e) {
      if (e.endDistance - e.startDistance > 0) return e.endDistance - e.startDistance;
      const k = segKey(e);
      if (lengthTbl.has(k)) { stats.lookup++; return lengthTbl.get(k); }
      stats.geom++; return geomLength(e);
    }
    let cnt = 0;
    for (const [k, L] of lengthTbl) {
      if (cnt++ >= 400) break;
      const p = k.split(',');
      const fake = { startPosition: { x: +p[0], y: +p[1], z: +p[2] }, endPosition: { x: +p[3], y: +p[4], z: +p[5] }, startAngle: p[6], endAngle: p[7] };
      if (L > 20) stats.geomErr.push(Math.abs(geomLength(fake) - L) / L);
    }

    /* 地圖幾何 */
    const segTable = [], segIdx = new Map(), trainsOut = [];
    function segId(e) {
      const k = segKey(e);
      if (!segIdx.has(k)) {
        const pts = bezierPoints(e);
        segIdx.set(k, segTable.length);
        segTable.push({ pts: pts.flatMap(pt => pt.map(c => pyRound(c, 1))), len: pyRound(entryLen(e), 2), ends: [posKey(e.startPosition), posKey(e.endPosition)] });
      }
      return segIdx.get(k);
    }

    /* 班次 */
    const services = [], depotsOut = [];
    const platStation = new Map([...plat.values()].map(p => [p.id, p.station]));
    const routeById = new Map(routesRaw.map(r => [S(r.id), r]));
    const near = (a, b) => hyp(a.x - b.x, a.z - b.z) <= 1;
    for (const d of depotsRaw) {
      const depMs = d.realTimeDepartures;
      const [zhd] = splitZhEn(d.name);
      const rec = { id: S(d.id), name: d.name, hasService: !!(depMs.length && d.useRealTime && d.path.length),
        departures: depMs.length ? depMs.map(x => trunc(x / 1000)).sort((a, b) => a - b) : [],
        routes: d.routeIds.map(S).filter(x => routeById.has(x)) };
      rec.booking = {
        useRT: !!d.useRealTime, nDep: depMs.length, routes: rec.routes.length, genOk: d.lastGeneratedStatus === 'SUCCESSFUL' && d.path.length > 0,
        sidings: sidingsRaw.filter(s => segHitsBox(s.position1, s.position2, d.position1, d.position2)).map(s => ({ id: S(s.id), name: s.name, manual: s.maxVehicles < 0, speed: s.maxManualSpeed || 0, cars: (s.vehicleCars || []).length, path: (s.pathSidingToMainRoute || []).length > 0 })) };
      depotsOut.push(rec);
      if (!rec.hasService || !rec.routes.length) continue;
      const ss = depotSidings(d);
      if (!ss.length) { warn(`車庫 ${d.name} 找不到可用側線，無法估算出庫時間`); continue; }
      const acc = median(ss.map(s => s.acceleration)) * 1e6, dec = median(ss.map(s => s.deceleration)) * 1e6;
      const leadCands = [];
      for (const s_ of ss) {
        const lens = s_.pathSidingToMainRoute.map(entryLen);
        const tms_ = simulatePath(s_.pathSidingToMainRoute, lens, acc, dec).times;
        leadCands.push([sum(tms_), s_.pathSidingToMainRoute[s_.pathSidingToMainRoute.length - 1].dwellTime / 1000, sum(lens), s_]);
      }
      leadCands.sort((a, b) => a[0] - b[0]);
      const [leadT, firstDwell, leadLen, leadSiding] = leadCands[leadCands.length >> 1];
      rec.leadInSec = pyRound(leadT, 1); rec.leadInMeters = pyRound(leadLen, 0);
      rec.accel = pyRound(acc, 3); rec.decel = pyRound(dec, 3);
      let path = d.path;
      const leadLast = leadSiding.pathSidingToMainRoute[leadSiding.pathSidingToMainRoute.length - 1].endPosition;
      if (!near(path[0].startPosition, leadLast) && near(path[0].endPosition, leadLast)) { path = path.slice(1); rec.skippedFirstPlatform = true; }
      const lens = path.map(entryLen);
      const mainSim = simulatePath(path, lens, acc, dec), tms = mainSim.times;
      const stopEvents = []; for (let i = 0; i < path.length; i++) if (path[i].dwellTime > 0) stopEvents.push([i, path[i].dwellTime / 1000]);
      const chain = []; let g = 0;
      const rts = d.routeIds.filter(rid => routeById.has(S(rid))).map(rid => routeById.get(S(rid)));
      rts.forEach((r, ri) => {
        const n = r.routePlatformData.length; chain.push([r, g, n]);
        g += (ri < rts.length - 1 && platStation.get(S(r.routePlatformData[r.routePlatformData.length - 1].platformId)) === platStation.get(S(rts[ri + 1].routePlatformData[0].platformId))) ? n - 1 : n;
      });
      const last = chain[chain.length - 1], totalStops = last[1] + last[2];
      if (totalStops !== stopEvents.length + 1) { warn(`車庫 ${d.name}：路線站數 (${totalStops}) 與路徑停靠點數 (${stopEvents.length + 1}) 不一致，略過`); continue; }
      const arr = new Array(totalStops).fill(null), dep = new Array(totalStops).fill(null);
      arr[0] = 0.0; dep[0] = 0.0;
      let t = 0.0, prevEnd = 0;
      stopEvents.forEach(([idx, dw], k) => {
        const si = k + 1; t += sum(tms.slice(prevEnd, idx + 1)); prevEnd = idx + 1;
        arr[si] = t; dep[si] = t + dw; t += dw;
      });
      const leadE = leadSiding.pathSidingToMainRoute;
      const leadL = leadE.map(entryLen), leadSim = simulatePath(leadE, leadL, acc, dec);
      const retE = leadSiding.pathMainRouteToSiding || [];
      let retSim = { times: [], profiles: [] };
      if (retE.length) retSim = simulatePath(retE, retE.map(entryLen), acc, dec);
      const off = (String(d.id) in cfg.depotOffsetSec) ? cfg.depotOffsetSec[String(d.id)] : (zhd in cfg.depotOffsetSec ? cfg.depotOffsetSec[zhd] : 0);
      const tseq = []; let tt = off;
      for (const [phase, ents, tml, pfl] of [[0, leadE, leadSim.times, leadSim.profiles], [1, path, tms, mainSim.profiles], [2, retE, retSim.times, retSim.profiles]]) {
        for (let i = 0; i < Math.min(ents.length, tml.length, pfl.length); i++) {
          const e_ = ents[i], tm_ = tml[i], pf_ = pfl[i], dw_ = e_.dwellTime / 1000;
          tseq.push([segId(e_), pyRound(tt, 2), pyRound(tm_, 2), dw_, pyRound(pf_[0], 3), pyRound(pf_[1], 3), pyRound(pf_[2], 3), phase]);
          tt += tm_ + dw_;
        }
      }
      const seqEntries = [...leadE.map(e => [0, e]), ...path.map(e => [1, e]), ...retE.map(e => [2, e])];
      for (let i = 0; i + 1 < seqEntries.length; i++) {
        const [ph1, e1] = seqEntries[i], [ph2, e2] = seqEntries[i + 1];
        if (ph1 !== ph2 && !near(e1.endPosition, e2.startPosition)) warn(`車庫 ${d.name}：${ph1 === 0 ? '出庫' : '主路徑'} 與下一段路徑在地圖上不相連（差 ${trunc(hyp(e1.endPosition.x - e2.startPosition.x, e1.endPosition.z - e2.startPosition.z))} 格）`);
      }
      trainsOut.push({ depot: S(d.id), accel: pyRound(acc, 3), decel: pyRound(dec, 3), dur: pyRound(tt, 1), len: pyRound(sum((leadSiding.vehicleCars || []).map(c => (c.length || 0) + (c.couplingPadding1 || 0) + (c.couplingPadding2 || 0))), 1) || undefined, segs: tseq });
      /* 同一車庫的其他側線：遊戲內每班車是「隨機」挑一條側線出庫，出庫／回庫路徑不同的側線，各自留一份時間軸（planner／地圖用） */
      {
        const sigOf = s_ => (s_.pathSidingToMainRoute || []).map(segKey).join(';') + '||' + (s_.pathMainRouteToSiding || []).map(segKey).join(';');
        const groups = new Map(); for (const s_ of ss) { const k = sigOf(s_); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s_); }
        const repK = sigOf(leadSiding), tOut = trainsOut[trainsOut.length - 1];
        const brief = x => ({ id: S(x.id), name: x.name });
        tOut.sidings = (groups.get(repK) || [leadSiding]).map(brief);
        rec.sidingCount = ss.length; rec.sidingVariants = groups.size;
        if (groups.size > 1) {
          tOut.variants = [];
          for (const [k, list] of groups) {
            if (k === repK) continue;
            const s0 = list[0], vLead = s0.pathSidingToMainRoute, vRet = s0.pathMainRouteToSiding || [];
            const vLeadSim = simulatePath(vLead, vLead.map(entryLen), acc, dec);
            let vPath = d.path; const vLast = vLead[vLead.length - 1].endPosition;
            if (!near(vPath[0].startPosition, vLast) && near(vPath[0].endPosition, vLast)) vPath = vPath.slice(1);
            const vMain = simulatePath(vPath, vPath.map(entryLen), acc, dec);
            const vRetSim = vRet.length ? simulatePath(vRet, vRet.map(entryLen), acc, dec) : { times: [], profiles: [] };
            const vseq = []; let t2 = off;
            for (const [phase, ents, tml, pfl] of [[0, vLead, vLeadSim.times, vLeadSim.profiles], [1, vPath, vMain.times, vMain.profiles], [2, vRet, vRetSim.times, vRetSim.profiles]]) {
              for (let i = 0; i < Math.min(ents.length, tml.length, pfl.length); i++) {
                const e_ = ents[i], dw_ = e_.dwellTime / 1000;
                vseq.push([segId(e_), pyRound(t2, 2), pyRound(tml[i], 2), dw_, pyRound(pfl[i][0], 3), pyRound(pfl[i][1], 3), pyRound(pfl[i][2], 3), phase]);
                t2 += tml[i] + dw_;
              }
            }
            tOut.variants.push({ sidings: list.map(brief), dur: pyRound(t2, 1), segs: vseq, leadSec: pyRound(sum(vLeadSim.times), 1), leadM: pyRound(sum(vLead.map(entryLen)), 0) });
          }
          tOut.leadSec = pyRound(sum(leadSim.times), 1); tOut.leadM = pyRound(sum(leadL), 0);
        }
      }
      rec.depotOffsetSec = off;
      for (const [r, g0] of chain) {
        const mid = S(r.id); if (!routeOfMember.has(mid)) continue;
        const stList = [];
        r.routePlatformData.forEach((rp, j) => {
          const gi_ = g0 + j, p = plat.get(S(rp.platformId)), base = leadT + firstDwell + off;
          const aAbs = gi_ === 0 ? leadT + off : base + arr[gi_];
          stList.push({ station: p.station, platform: p.id, platformName: p.name, arr: pyRound(aAbs, 1), dep: pyRound(base + dep[gi_], 1), dest: rp.customDestination });
        });
        let cur = '';
        for (const st of stList) { if (st.dest) cur = st.dest; st.out = cur; st.pax = !cur.includes('回送'); }
        services.push({ member: mid, route: routeOfMember.get(mid), depot: S(d.id), stops: stList });
      }
      rec.tripSec = pyRound(arr[arr.length - 1], 1);
    }

    for (const d of depotsRaw) if (!d.routeIds.length) info(`車庫「${d.name}」沒有掛任何路線`);
    for (const r of routes) if (r.status === 'maintenance') info(`路線「${r.zh}」無車庫與排班 → 路線工務中`);

    /* 軌道 */
    const railsSeen = new Set(), railsOut = [];
    for (const r of railsRaw) {
      const a = r.position1, b = r.position2;
      const ka = [a.x, a.y, a.z], kb = [b.x, b.y, b.z];
      const cmp = (p, q) => { for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1; return 0; };
      const key = (cmp(ka, kb) <= 0 ? [ka, kb] : [kb, ka]).join('|');
      if (railsSeen.has(key)) continue; railsSeen.add(key);
      const pts = bezierPoints({ startPosition: a, endPosition: b, startAngle: r.angle1, endAngle: r.angle2 });
      railsOut.push({ pts: pts.flatMap(pt => pt.map(c => pyRound(c, 1))), v: Math.min(r.speedLimit1, r.speedLimit2), kind: r.isPlatform ? 'platform' : r.isSiding ? 'siding' : 'rail', e: [posKey(a), posKey(b)], ...(r.signalColors && r.signalColors.length ? { sig: [...new Set(r.signalColors)] } : {}) });
    }
    const stArr = [...stations.values()];
    const xs = [], zs = [];
    for (const r_ of railsOut) for (let i = 0; i < r_.pts.length; i += 2) { xs.push(r_.pts[i]); zs.push(r_.pts[i + 1]); }
    for (const st of stArr) { xs.push(st.x); zs.push(st.z); }
    const mm = (a, f) => a.reduce((x, y) => f(x, y));
    const mapOut = { bounds: [mm(xs, Math.min), mm(zs, Math.min), mm(xs, Math.max), mm(zs, Math.max)], segs: segTable, rails: railsOut, trains: trainsOut };
    info(`地圖幾何：軌道 ${railsOut.length} 條、列車路徑片段 ${segTable.length} 種、實體列車時間軸 ${trainsOut.length} 組`);
    const ge = stats.geomErr;
    info(`路段長度：側線實測查表 ${stats.lookup} 段，幾何近似 ${stats.geom} 段；幾何公式對實測平均誤差 ${(100 * (ge.length ? sum(ge) / ge.length : 0)).toFixed(1)}%（最大 ${(100 * (ge.length ? Math.max(...ge) : 0)).toFixed(1)}%）`);

    const memberOut = {};
    for (const m of members) memberOut[m.id] = { id: m.id, rawName: m.rawName, dir: m.dir, notes: m.notes, number: m.number, color: m.color, circular: m.circular, operating: m.operating, depots: m.depots, stops: m.stops };
    return {
      meta: { brand: cfg.brandName || '光瀬都市高速鉄道｜ATOS', generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), report,
        world: dump.world || '(live)', dimension: dump.dimension || 'overworld', source: dump.source || 'MTR 4.0 / MC 1.20.4 live data', minTransferSec: cfg.minTransferSec,
        assumptions: [
          '時刻 = 車庫 realTimeDepartures（出庫時刻）+ 估算的出庫行駛時間；各站時間為速度曲線估算值，需與遊戲實測校正。',
          '行駛時間依軌道限速、側線設定的加減速度計算，不含車輛本身最高速度限制。',
          '班次時刻以當日 0–24 時循環，對應真實時鐘；出庫時刻指離開側線（已與遊戲設定確認）。存檔以 UTC 記錄出庫時刻，網頁依瀏覽器所在時區換成當地時間。',
          '地圖上的列車位置是由班表與速度曲線推算的，遊戲開著時尚未接上實際位置。'] },
      stations: stArr, routes, members: memberOut, depots: depotsOut, services, map: mapOut,
    };
  }


  /* ───────── 用遊戲內 MTR 的實際班表（Siding.trips）校準各站時間 ─────────
   * schedule = 模組 /schedule 的 data：每個側線、每個班次、每站 [站序, 月台, 到站ms, 發車ms]（相對出庫時刻）。
   * 校準：把服務各站的 arr/dep 換成 MTR 的值；每個車庫另存「模型時間→實際時間」折線 warp，讓地圖位置也跟著對齊。 */
  function calibrate(net, schedule) {
    const rep = { services: net.services.length, matched: 0, maxShiftSec: 0 };
    if (!schedule || !schedule.sidings) return rep;
    const byDepot = {}; net.services.forEach((sv, i) => { (byDepot[sv.depot] = byDepot[sv.depot] || []).push(i); });
    const per = {};
    for (const sd of schedule.sidings) {
      const list = byDepot[sd.depot]; if (!list) continue;
      for (const trip of sd.trips) {
        let si = list[trip.routeIndex];
        if (si == null || net.services[si].member !== trip.route) si = list.find(i => net.services[i].member === trip.route);
        if (si == null) continue;
        const sv = net.services[si];
        // 以「站序」對應（第一條路線的起點月台可能不在 MTR 的班次裡）；月台對不上就放棄這個班次
        if (trip.stops.some(x => !sv.stops[x[0]] || String(x[1]) !== String(sv.stops[x[0]].platform))) continue;
        const rec = per[si] = per[si] || sv.stops.map(() => ({ s: [], e: [] }));
        trip.stops.forEach(x => { rec[x[0]].s.push(x[2] / 1000); rec[x[0]].e.push(x[3] / 1000); });
      }
    }
    const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
    const anchors = {};
    for (const key of Object.keys(per)) {
      const sv = net.services[key], rec = per[key], a = anchors[sv.depot] = anchors[sv.depot] || [];
      // 沒有 MTR 資料的站（通常是起點），沿用下一個有資料的站的時間差
      let shift = null;
      for (let j = sv.stops.length - 1; j >= 0; j--) { if (rec[j].s.length) shift = [med(rec[j].s) - sv.stops[j].arr, med(rec[j].e) - sv.stops[j].dep]; else if (shift) { rec[j].s.push(sv.stops[j].arr + shift[0]); rec[j].e.push(sv.stops[j].dep + shift[1]); } }
      sv.stops.forEach((st, j) => {
        if (!rec[j].s.length) return;
        const c1 = med(rec[j].s), c2 = med(rec[j].e);
        a.push([st.arr, c1], [st.dep, c2]);
        rep.maxShiftSec = Math.max(rep.maxShiftSec, Math.abs(c1 - st.arr), Math.abs(c2 - st.dep));
        st.arr = pyRound(c1, 1); st.dep = pyRound(c2, 1);
      });
      rep.matched++;
    }
    for (const tr of net.map.trains) {
      const raw = anchors[tr.depot]; if (!raw || !raw.length) continue;
      raw.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const w = [];
      for (const p of raw) { const q = w[w.length - 1]; if (!q || (p[0] > q[0] && p[1] >= q[1])) w.push(p); }
      if (!w.length) continue;
      tr.durM = tr.dur; tr.warp = w;
      tr.dur = pyRound(warpF(w, tr.dur), 1);
    }
    rep.maxShiftSec = pyRound(rep.maxShiftSec, 1);
    net.meta.calibrated = rep;
    net.meta.assumptions = net.meta.assumptions.map(a => a.startsWith('時刻 = ') ? '各站到發時間來自遊戲內 MTR 實際展開的班表（Siding.trips），與遊戲內一致；地圖位置依這些時間對齊速度曲線。' : a);
    return rep;
  }
  /** 折線 [[模型秒,實際秒],…]：模型→實際（f），超出範圍時平移。 */
  function warpF(w, x) {
    if (x <= w[0][0]) return x + (w[0][1] - w[0][0]);
    const L = w[w.length - 1]; if (x >= L[0]) return x + (L[1] - L[0]);
    let lo = 0, hi = w.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w[m][0] <= x) lo = m; else hi = m; }
    return w[lo][1] + (x - w[lo][0]) * ((w[hi][1] - w[lo][1]) / (w[hi][0] - w[lo][0]));
  }
  /** 實際→模型（f 的反函數）。 */
  function warpInv(w, y) {
    if (y <= w[0][1]) return y - (w[0][1] - w[0][0]);
    const L = w[w.length - 1]; if (y >= L[1]) return y - (L[1] - L[0]);
    let lo = 0, hi = w.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w[m][1] <= y) lo = m; else hi = m; }
    const dy = w[hi][1] - w[lo][1]; return dy <= 0 ? w[lo][0] : w[lo][0] + (y - w[lo][1]) * ((w[hi][0] - w[lo][0]) / dy);
  }

  root.ATOS = root.ATOS || {};
  root.ATOS.buildNetwork = buildNetwork; root.ATOS.calibrate = calibrate; root.ATOS.warpInv = warpInv; root.ATOS.warpF = warpF;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildNetwork, calibrate, warpF, warpInv };
})(typeof window !== 'undefined' ? window : globalThis);
