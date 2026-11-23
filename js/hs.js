/* hs.js — 万瀨高速鉄道專頁：倒數／開業日數、首末班・所要時間・停留時間、票價，全部由時刻表資料與 site-config 算出來。 */
(function () {
  'use strict';
  const CFG = window.HK_CONFIG || {}, tz = CFG.tzOffsetSec == null ? 8 * 3600 : CFG.tzOffsetSec;
  const lang = (window.HK_I18N && window.HK_I18N.lang) || 'ja';
  const L = (zh, ja, en) => lang === 'zh' ? zh : lang === 'en' ? en : ja;
  const $ = s => document.querySelector(s);
  const OPEN = '2026-11-16';
  const yen = n => '¥' + Number(n).toLocaleString('en-US');
  const hmOf = s => { s = ((Math.round(s) % 86400) + 86400) % 86400; return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
  const mark = el => { if (el) el.setAttribute('data-i18n-off', ''); return el; };

  // 倒數（依網站時區的「今天」）
  (function () {
    const now = new Date(Date.now() + tz * 1000), today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const [y, m, d] = OPEN.split('-').map(Number), open = Date.UTC(y, m - 1, d);
    const days = Math.round((open - today) / 86400000);
    const l = mark($('#hs-count-l')), n = $('#hs-count-n'), u = mark($('#hs-count-u'));
    if (!l || !n || !u) return;
    if (days > 0) { l.textContent = L('距離開通還有', '開業まであと', 'Opens in'); n.textContent = String(days); u.textContent = L('天', '日', days === 1 ? 'day' : 'days'); }
    else if (days === 0) { l.textContent = L('今天', '本日', 'Today'); n.textContent = '★'; u.textContent = L('開通！', '開業！', 'Opening day!'); }
    else { l.textContent = L('開業第', '開業', 'Day'); n.textContent = String(1 - days); u.textContent = L('日', '日目', ''); }
  })();

  async function init() {
    if (!window.HK || !window.HK.load) return;
    const H = await window.HK.load();
    const stN = nm => H.stations.find(s => s.zh === nm);
    // 2.8.0：地圖內的終點從東平倉延伸到花宮天照；一日往返＝新勝守⇄花宮天照（真正班次）＋花宮天照⇄新岩沢（地圖外設定）
    const a = stN('新勝守'), b = stN((CFG.hsExt && CFG.hsExt.afterZh) || '東平倉');
    const ext = b && H.hsExtDuration ? H.hsExtDuration(b.zh, '新岩沢') : 0;
    // 同一班車上「從 x 到 y」的班次（停靠站裡 x 在 y 前面）
    const through = (x, y) => H.svcs.filter(sv => { if (!sv.isHS) return false; const i = sv.stops.findIndex(s => s.station === x.id && s.pax !== false), j = sv.stops.findIndex(s => s.station === y.id && s.pax !== false); return i >= 0 && j > i; });
    const depsVia = (x, y) => { if (!x || !y) return []; const ok = new Set(through(x, y)); return H.departures(x.id).filter(e => ok.has(e.sv) && e.t >= 4 * 3600 && e.t < 86400); };   // 深夜 0 時台的班次不算「首班」
    const legSec = (sv, x, y) => { const i = sv.stops.findIndex(s => s.station === x.id), j = sv.stops.findIndex(s => s.station === y.id); return (sv.stops[j].arr != null ? sv.stops[j].arr : sv.stops[j].dep) - sv.stops[i].dep; };
    const A = depsVia(a, b), B = depsVia(b, a);
    const core = A.length ? legSec(A[0].sv, a, b) : 0;
    const dur = core + ext;
    const t = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    if (A.length && dur) {
      const first = A[0].t, last = A[A.length - 1].t;
      t('#hs-first', hmOf(first));
      const dm = Math.round(dur / 60), dh = Math.floor(dm / 60), dmm = dm % 60;   // 2.8.1：超過 1 小時顯示「1 小時 37 分」
      t('#hs-dur', dh ? L(`約 ${dh} 小時 ${dmm} 分`, `約${dh}時間${dmm}分`, `about ${dh} h ${dmm} min`) : L(`約 ${dm} 分`, `約${dm}分`, `about ${dm} min`));
      if (B.length) {
        const retLast = B[B.length - 1].t - ext, coreB = legSec(B[B.length - 1].sv, b, a);
        t('#hs-ret', hmOf(retLast));
        t('#hs-ret2', L(`約 ${hmOf(retLast + ext + coreB)} 抵達新勝守（新勝守末班發車 ${hmOf(last)}）`, `${hmOf(retLast + ext + coreB)} ごろ新勝守着（新勝守発の最終は ${hmOf(last)}）`, `arrives at Shin-Katsumori about ${hmOf(retLast + ext + coreB)} (last departure from Shin-Katsumori: ${hmOf(last)})`));
        const stay = retLast - (first + dur);
        if (stay > 0) t('#hs-stay', L(`最長約 ${Math.floor(stay / 3600)} 小時`, `最長 約${Math.floor(stay / 3600)}時間`, `up to ~${Math.floor(stay / 3600)} h`));
      }
    }
    // 2.8.1：路線圖合併成一張「停車駅案内」——車站橫向排列，每個種別一條平行線，圓點＝停車、沒有圓點＝通過。
    // 車站順序、各種別的停車站都從快照的班次算（下行方向），地圖外延伸段（豐守・新岩沢）照 site-config 的 hsExt.stops／skip。
    (function () {
      const box = $('#hs-pat'); if (!box) return;
      const tr = x => (window.HK_I18N && window.HK_I18N.t) ? window.HK_I18N.t(x) : x;
      const iS = sv => sv.stops.findIndex(s => H.stName(s.station) === '新光瀨'), iT = sv => sv.stops.findIndex(s => H.stName(s.station) === '東平倉');
      const hsAll = H.svcs.filter(sv => sv.isHS), downs = hsAll.filter(sv => iS(sv) >= 0 && iT(sv) > iS(sv));
      if (!downs.length) return;
      // 車站順序：所有下行班次停靠站的聯集（插在「下一個已知站」之前）
      const order = [];
      downs.slice().sort((a, b) => b.stops.length - a.stops.length).forEach(sv => {
        const seq = sv.stops.filter(s => s.pax !== false).map(s => s.station);
        seq.forEach((id, k) => {
          if (order.includes(id)) return;
          const nx = seq.slice(k + 1).find(x => order.includes(x));
          if (nx != null) order.splice(order.indexOf(nx), 0, id);
          else { const pv = seq.slice(0, k).reverse().find(x => order.includes(x)); order.splice(pv != null ? order.indexOf(pv) + 1 : order.length, 0, id); }
        });
      });
      const ext = H.hsExtStops || [];
      const cols = order.map(id => ({ id, zh: H.stName(id), real: true })).concat(ext.map(e => ({ id: e.id, zh: e.zh, real: false, e })));
      // 種別：依班次別名（member.number 去掉「特急」）分組；顏色用路線色
      const nick = sv => String(sv.member.number || '').replace(/特急/g, '').trim() || sv.routeName;
      const types = [];
      downs.concat(hsAll.filter(sv => !downs.includes(sv))).forEach(sv => {
        const k = nick(sv); let t = types.find(x => x.k === k);
        if (!t) types.push(t = { k, name: String(sv.member.number || sv.routeName), color: sv.color, stops: new Set() });
        sv.stops.forEach(s => { if (s.pax !== false) t.stops.add(s.station); });
      });
      const anc = cols.find(c => c.zh === ((CFG.hsExt && CFG.hsExt.afterZh) || '花宮天照'));
      // 到得了花宮天照的種別，延伸段照開（skip 指定的種別通過豐守）
      types.forEach(t => { if (anc && t.stops.has(anc.id)) ext.forEach(e => { if (!(e.skip || []).some(x => t.k.indexOf(x) >= 0)) t.stops.add(e.id); }); });
      const N = cols.length, X = i => (N > 1 ? i / (N - 1) * 100 : 50) + '%';
      const el = (tag, cls, css) => { const d = document.createElement(tag); if (cls) d.className = cls; if (css) d.style.cssText = css; return d; };
      const inner = el('div', 'hs-pat-in');
      // 管轄帶（最上面一條細線）
      const ci = zh => cols.findIndex(c => c.zh === zh);
      [['ext2', 0, ci('新勝守')], ['a', ci('新勝守'), ci('東平倉')], ['b', ci('東平倉'), N - 1]].forEach(([c, a, b]) => {
        if (a < 0 || b < 0 || b <= a) return;
        inner.append(el('div', 'hs-pat-band ' + c, `left:${X(a)};width:calc(${X(b)} - ${X(a)})`));
      });
      // 各種別一條線
      types.forEach((t, r) => {
        const idx = cols.map((c, i) => t.stops.has(c.id) ? i : -1).filter(i => i >= 0); if (!idx.length) return;
        const y = 34 + r * 46;
        const lab = el('div', 'hs-pat-lab', `top:${y - 11}px;background:${t.color}`); lab.textContent = tr(t.name); mark(lab); inner.append(lab);
        inner.append(el('div', 'hs-pat-line', `top:${y}px;left:${X(idx[0])};width:calc(${X(idx[idx.length - 1])} - ${X(idx[0])});background:${t.color}`));
        cols.forEach((c, i) => {
          if (i < idx[0] || i > idx[idx.length - 1]) return;
          inner.append(el('i', t.stops.has(c.id) ? 'hs-pat-dot' : 'hs-pat-pass', `top:${y}px;left:${X(i)};--c:${t.color}`));
        });
      });
      // 車站名＋轉乘標示
      const chips = { '新勝守': [['g', '可轉乘新幹線'], ['y', '高速鉄道・一般鐵路轉乘']], '新光瀨': [['y', '步行轉乘']], '東平倉': [['g', '可直接轉乘']], '新岩沢': [['k', '下行列車終點'], ['o', '轉乘秋葉鉄道']] };
      const yName = 34 + types.length * 46 + 4;
      cols.forEach((c, i) => {
        inner.append(el('div', 'hs-pat-guide', `left:${X(i)};height:${yName - 18}px`));
        const a = el('a', 'hs-pat-st', `left:${X(i)};top:${yName}px`);
        a.href = c.real ? 'station.html?n=' + encodeURIComponent(c.zh) : '#hs-tr';
        const b = document.createElement('b'); b.textContent = tr(c.zh); a.append(b);
        (chips[c.zh] || []).forEach(([k, txt]) => { const sp = el('span', 'hs-chip ' + k); sp.textContent = tr(txt); a.append(sp); });
        mark(a); inner.append(a);
      });
      inner.style.height = (yName + 110) + 'px';
      box.replaceChildren(inner);
      // みさこ的所要時間（起點→新岩沢）
      const ms = types.find(t => /みさこ/.test(t.k)), durEl = $('#hs-ms-dur');
      const msDown = downs.find(sv => /みさこ/.test(nick(sv)));
      if (ms && msDown && durEl) {
        const st = msDown.stops, a0 = st[0], z = st[st.length - 1];
        const m = Math.round(((z.arr != null ? z.arr : z.dep) - a0.dep + (H.hsExtDuration ? H.hsExtDuration(H.stName(z.station), '新岩沢') : 0)) / 60), hh = Math.floor(m / 60), mm = m % 60;
        const f = L(hh ? `${hh} 小時 ${mm} 分` : `${m} 分`, hh ? `${hh}時間${mm}分` : `${m}分`, hh ? `${hh} h ${mm} min` : `${m} min`);
        durEl.textContent = L(`${tr(H.stName(a0.station))}→新岩沢 約 ${f}`, `${tr(H.stName(a0.station))}→新岩沢 約${f}`, `${tr(H.stName(a0.station))} → Shin-Iwasawa about ${f}`);
        mark(durEl);
      }
    })();
    // 票價（1.9.0：指定席特急券分「商務車廂」「一般車廂」兩個價，不再是單一數字）
    const rows = $('#hs-fares'), bizFee = (CFG.hsBusinessFee != null) ? CFG.hsBusinessFee : 1600;
    if (rows && H.hsFareExt) {
      ((CFG.hsExt && CFG.hsExt.real) || ['新勝守', '新光瀨', '東平倉']).forEach(nm => {   // 2.8.0：含咲海・花宮天照
        const f = H.hsFareExt(nm, '新岩沢'); if (!f) return;
        const tr = document.createElement('tr'), c = (txt, extra) => { const td = document.createElement('td'); td.textContent = txt; if (extra) td.append(extra); return td; };
        const name = document.createElement('td'); name.textContent = nm + ' ⇄ 新岩沢';
        const seatTd = document.createElement('td'); seatTd.innerHTML = yen(f.seat) + '<small style="display:block;color:var(--hs-c,#136880)">' + L('商務車廂', 'ビジネスシート', 'Business class') + ' ' + yen(bizFee) + '</small>';
        const tot = document.createElement('td'), bb = document.createElement('b'); bb.textContent = yen(f.total); tot.append(bb);
        if (nm === '新勝守') { const sm = document.createElement('small'); mark(sm); sm.textContent = L('往返', '往復', 'round trip') + ' ' + yen(f.total * 2); tot.append(sm); }
        tr.append(name, c(yen(f.yen)), seatTd, tot); rows.append(tr);
      });
    }
    // 1.9.0：新勝守這一端的「上羽本線」延伸（上羽神別・汐崎）。1.9.2：上羽神別已經通車變成真站了，
    // 這一站改用真正的乘車路徑／票價（H.fare，跟訂票頁一致），不再用下面那個「地圖外延伸」的粗略估算；
    // 汐崎還沒出現在快照裡，繼續用 H.ext2FareExt 的估算值，並標示「預覽」避免跟正式票價混在一起。
    const ext2box = $('#hs-ext2-fares');
    if (ext2box && H.ext2FareExt && H.ext2QueryStations && H.ext2QueryStations.length) {
      const note = $('#hs-ext2-note'), table = $('#hs-ext2-table');
      if (note) note.hidden = false; if (table) table.hidden = false;
      const fromSt = (H.stations || []).find(s => s.zh === '新勝守');
      H.ext2QueryStations.filter(s => s.zh !== '新勝守').forEach(s => {
        let yenVal, previewTag = '';
        if (s.real && fromSt && H.fare) {
          const toSt = (H.stations || []).find(s2 => s2.zh === s.zh);
          const real = toSt ? H.fare(fromSt.id, toSt.id) : null;
          if (!real) return;
          yenVal = real.yen;
        } else {
          const f = H.ext2FareExt('新勝守', s.zh); if (!f) return;
          yenVal = f.yen; previewTag = L('（預覽）', '（仮）', ' (preview)');
        }
        const tr = document.createElement('tr');
        const name = document.createElement('td'); name.textContent = '新勝守 ⇄ ' + s.zh + previewTag;
        const td = (txt) => { const d = document.createElement('td'); d.textContent = txt; return d; };
        tr.append(name, td(yen(yenVal)), td('－'), td(yen(yenVal)));
        ext2box.append(tr);
      });
    }
    // 1.9.0：上下行完整時刻表——跟首頁列車卡片同一套視覺語言，直接沿用 HK.lineBlock（路線資訊頁同一份渲染邏輯，
    // 已經有「上行／下行」切換、停靠站時刻、班距，不用再另外寫一份）。
    // 1.9.4：前輩要求「班次、時刻表優先顯示每一班車每一站的時間（含班次號，例如「とりさわ5号」），長條圖呈現班次
    // 密度移到更後面」——這項更新先在「設施介紹」頁（pages4.js）做好，高速鉄道這裡也要比照辦理：中間插入
    // HK.fullTable（全日逐班時刻表，欄名優先顯示 H.gouOf 算出來的班次號），長條圖、停車一覽維持在最後面。
    // 1.9.5：前輩回報「完全看不到直通進去上羽線高速鉄道車次的」──因為 groupsOf 是照「路線全名」分組，
    // 「万瀨高速鉄道線」（只到東平倉）跟「万瀨高速鉄道線上羽線直通」（直通到上羽神別・汐崎）是兩個不同的名字，
    // 變成兩個分開的 group，而原本這裡只用 groups.find(...) 挑第一個符合的，另一個就完全沒畫出來。
    // 這裡改成把兩個 group 的所有 sv 都抓出來，依「東平倉是不是終點」分成「下行（往東平倉／直通上羽神別・汐崎）」
    // 「上行（往新勝守）」兩個方向桶；同一個桶裡，用停靠站最多的那個班型（直通車）當版型，把兩種班型的每一班
    // 都換算到同一個時間基準上依時間排列，合併成一張時刻表──對不到站的短程班次格子顯示「－」。
    const ttBox = $('#hs-timetable');
    if (ttBox && window.HK.groupsOf) {
      const allGroups = window.HK.groupsOf(H);
      const hsSvs = allGroups.filter(x => /高速鉄道/.test(x.name)).flatMap(x => x.svs);
      if (hsSvs.length) {
        const buckets = [[], []]; // 0 = 下行（往東平倉，含直通上羽神別・汐崎）／1 = 上行（往新勝守）
        // 2.8.0：方向改用「東平倉在新光瀨之後」判斷（下行的終點現在可能是東平倉或花宮天照）
        hsSvs.forEach(sv => {
          const iT = sv.stops.findIndex(s => H.stName(s.station) === '東平倉'), iS = sv.stops.findIndex(s => H.stName(s.station) === '新光瀨');
          buckets[iT >= 0 && iS >= 0 && iT > iS ? 0 : 1].push(sv);
        });
        const templateOf = list => list.reduce((a, b) => (b.stops.filter(s => s.pax !== false).length > a.stops.filter(s => s.pax !== false).length ? b : a));
        /* 2.8.0：時刻表的車站列＝所有班型停靠站的聯集（みさこ停清音溫泉、とりさわ停咲海・花宮天照，任何一個班型都不是全部）。
         * 插入規則：插在「這個班型的下一個、已經在表裡的站」前面；沒有的話插在上一站後面。 */
        const stationRows = list => {
          const order = templateOf(list).stops.filter(s => s.pax !== false).map(s => s.station);
          list.forEach(sv => {
            const seq = sv.stops.filter(s => s.pax !== false).map(s => s.station);
            seq.forEach((id, k) => {
              if (order.includes(id)) return;
              const nx = seq.slice(k + 1).find(x => order.includes(x));
              if (nx != null) order.splice(order.indexOf(nx), 0, id);
              else { const pv = seq.slice(0, k).reverse().find(x => order.includes(x)); order.splice(pv != null ? order.indexOf(pv) + 1 : order.length, 0, id); }
            });
          });
          return order;
        };
        const ownOffset = (sv, j) => { const t0 = sv.stops[0].dep; return (j === sv.stops.length - 1 ? sv.stops[j].arr : sv.stops[j].dep) - t0; };
        function mergedRuns(list) {
          const tmpl = templateOf(list), runs = [];
          list.forEach(sv => {
            const t0 = sv.stops[0].dep, k = tmpl.stops.findIndex(s => s.station === sv.stops[0].station);
            const shift = k >= 0 ? (tmpl.stops[k].dep - tmpl.stops[0].dep) : 0; // 把這個班型自己的起點時刻，換算成「版型班次起點」的對應時刻，方便跟版型的班次一起排序
            window.HK.depTimes(H, sv).forEach(t => { const gou = H.gouOf ? H.gouOf(sv, t - t0) : ''; runs.push({ sv, t, gou, vkey: t - shift }); });
          });
          runs.sort((a, b) => a.vkey - b.vkey);
          return { tmpl, runs };
        }
        function mergedTable(list) {
          const { runs } = mergedRuns(list), rows = stationRows(list).map(id => ({ station: id }));
          // 2.8.1：地圖外延伸段（花宮天照—豐守—新岩沢）也列進時刻表：下行接在花宮天照之後、上行排在花宮天照之前。
          // 時刻＝該班在花宮天照的時刻 ± 延伸段的站間時間（site-config 的 hsExt.stops）；みさこ通過豐守顯示「レ」。
          const anchorZh = (CFG.hsExt && CFG.hsExt.afterZh) || '花宮天照', anchorSt = stN(anchorZh);
          const down = list === buckets[0];
          if (anchorSt && H.hsExtStops && H.hsExtStops.length && rows.some(x => x.station === anchorSt.id)) {
            const vrows = H.hsExtStops.map(e => ({ station: e.id, virt: e }));
            if (down) rows.push(...vrows); else rows.unshift(...vrows.slice().reverse());
          }
          if (!runs.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = L('本日沒有班次。', '本日の運行はありません。', 'No service today.'); return p; }
          const hsAt = k => k && Math.floor(runs[k].t / 3600) !== Math.floor(runs[k - 1].t / 3600) ? ' hs' : '';
          const head = document.createElement('tr'); head.appendChild(document.createElement('th')).textContent = L('車站', '駅', 'Station');
          runs.forEach((r, k) => { const th = document.createElement('th'); th.className = 'c' + hsAt(k); th.textContent = r.gou || hmOf(r.t); head.appendChild(th); });
          const tbody = document.createElement('tbody');
          rows.forEach(s => {
            const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row';
            const bd = s.virt ? null : H.codeBadges(s.station); if (bd) th.appendChild(bd); th.append(document.createTextNode(s.virt ? s.virt.zh : H.stName(s.station)));
            tr.appendChild(th);
            runs.forEach((r, k) => {
              const td = document.createElement('td'); td.className = 'c' + hsAt(k);
              if (s.virt) {   // 延伸段：用這班在花宮天照的時刻推算
                const jA = r.sv.stops.findIndex(x => x.station === anchorSt.id && x.pax !== false);
                if (jA < 0) { td.textContent = '－'; tr.appendChild(td); return; }
                const tA = r.t + ownOffset(r.sv, jA), sec = H.hsExtDuration(anchorZh, s.virt.zh);
                const skip = (s.virt.skip || []).some(x => String(r.gou || '').indexOf(x) >= 0 || String(r.sv.member.number || '').indexOf(x) >= 0);
                const isEnd = s.virt === H.hsExtStops[H.hsExtStops.length - 1];
                td.textContent = skip && !isEnd ? 'レ' : hmOf(down ? tA + sec : tA - sec);
                tr.appendChild(td); return;
              }
              const j = r.sv.stops.findIndex(x => x.station === s.station && x.pax !== false);
              // 2.8.0：班次經過這一帶但不停（例如みさこ通過新勝守）顯示「レ」，根本不經過顯示「－」
              const served = rows.map(x => !x.virt && r.sv.stops.some(y => y.station === x.station && y.pax !== false));
              const i0 = served.indexOf(true), i1 = served.lastIndexOf(true), iMe = rows.indexOf(s);
              td.textContent = j >= 0 ? hmOf(r.t + ownOffset(r.sv, j)) : (iMe > i0 && iMe < i1 ? 'レ' : '－');
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          const table = document.createElement('table'); table.className = 'fulltt';
          const thead = document.createElement('thead'); thead.appendChild(head);
          table.append(thead, tbody);
          const wrap = document.createElement('div'); wrap.className = 'tscroll fulltt-wrap'; wrap.appendChild(table);
          return wrap;
        }
        let di = 0;
        const top = document.createElement('div'), mid = document.createElement('div'), bottom = document.createElement('div');
        ttBox.replaceChildren(top, mid, bottom);
        const draw = () => {
          const list = buckets[di].length ? buckets[di] : buckets[1 - di];
          top.replaceChildren();
          if (buckets[0].length && buckets[1].length) {
            const dirs = document.createElement('div'); dirs.className = 'dirs'; dirs.setAttribute('role', 'group'); dirs.setAttribute('aria-label', L('方向', '方向', 'Direction'));
            [0, 1].forEach(k => {
              const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(k === di));
              b.textContent = window.HK.dirLabel(H, templateOf(buckets[k]));
              b.onclick = () => { di = k; draw(); };
              dirs.appendChild(b);
            });
            top.appendChild(dirs);
          }
          const h3 = document.createElement('h3'), p = document.createElement('p');
          h3.className = 'h3'; h3.textContent = L('全日時刻表', '全日時刻表', 'Full-day timetable');
          p.className = 'note';
          const dl = window.HK.dirLabel(H, templateOf(list));
          // 起訖站名先逐一查表再放進句子（句子本身的英文是寫死的，不會再被整句翻譯）
          const dlT = (window.HK_I18N && window.HK_I18N.t) ? dl.split(' → ').map(x => window.HK_I18N.t(x.trim())).join(' → ') : dl;
          p.textContent = L(`${dlT}。已合併直通上羽本線的班次並按時間排列；各站的發車時刻（終點站為到達時刻），一欄是一班車；欄名為班次號；「レ」＝通過（不停車），「－」＝該班次不經過。`, `${dlT}。上羽線直通の列車も合わせて時刻順に表示。各駅の発車時刻（終点は到着時刻）、1列＝1本。欄名は列車番号。「レ」＝通過、「－」＝その列車は経由しません。`, `${dlT}. Through-service trains to the Ueha Main Line are merged in and sorted by time. Departure time at each stop (arrival at the terminus); one column per run; "レ" = passes without stopping, "－" = the run doesn't serve that section.`);
          mid.replaceChildren(h3, p, mergedTable(list));
          bottom.replaceChildren();
          const allT = []; list.forEach(sv => window.HK.depTimes(H, sv).forEach(t => allT.push(t))); allT.sort((a, b) => a - b);
          const bands = [[L('早晨', '早朝', 'Morning'), 5, 9], [L('日間', '日中', 'Midday'), 9, 16], [L('傍晚', '夕方', 'Evening'), 16, 20], [L('夜間', '夜間', 'Night'), 20, 24], [L('深夜', '深夜', 'Late night'), 0, 5]];
          const btbl = document.createElement('table'); btbl.className = 'tbl';
          const bthead = document.createElement('thead'), btr = document.createElement('tr');
          [L('時段', '時間帯', 'Band'), L('班次', '本数', 'Trains'), L('平均班距', '平均間隔', 'Avg. interval')].forEach(t => { const th = document.createElement('th'); th.textContent = t; btr.appendChild(th); });
          bthead.appendChild(btr);
          const bbody = document.createElement('tbody');
          bands.forEach(([nm, a, b]) => {
            const n = allT.filter(t => t >= a * 3600 && t < b * 3600).length;
            const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = `${nm}　${a}–${b} ${L('時', '時', 'h')}`;
            const td1 = document.createElement('td'); td1.textContent = L(`${n} 班`, `${n}本`, String(n));
            const td2 = document.createElement('td'); td2.textContent = n ? L(`約 ${Math.round((b - a) * 60 / n * 10) / 10} 分一班`, `約${Math.round((b - a) * 60 / n * 10) / 10}分間隔`, `~${Math.round((b - a) * 60 / n * 10) / 10} min`) : '—';
            tr.append(th, td1, td2); bbody.appendChild(tr);
          });
          btbl.append(bthead, bbody);
          const h3b = document.createElement('h3'); h3b.className = 'h3'; h3b.textContent = L('班距', '運行間隔', 'Frequency');
          bottom.append(h3b, btbl);
        };
        draw();
      }
    }
    // 轉乘三站：車站介紹與照片（與「景點與車站」的車站頁共用 data/stations.json，只維護一份）
    try {
      const sd = await window.HK.getJSON('data/stations.json', true);
      document.querySelectorAll('.hs-card[data-st]').forEach(card => {
        const e = ((sd && sd.stations) || []).find(x => x.name === card.dataset.st); if (!e) return;
        const old = card.querySelector('p'), box = document.createElement('div');
        (e.intro || []).forEach(t => { const p = document.createElement('p'); p.textContent = t; box.append(p); });
        if (old && box.children.length) old.replaceWith(...box.children);
        if (e.photos && e.photos[0]) {
          const f = document.createElement('figure'); f.className = 'hs-pic hs-stpic';
          const im = document.createElement('img'); im.src = e.photos[0].src; im.alt = e.photos[0].alt || ''; const c = document.createElement('figcaption'); c.textContent = e.photos[0].cap || '';
          f.append(im, c); card.querySelector('header').after(f);
        }
        const a = document.createElement('a'); a.className = 'hs-more'; a.href = 'station.html?n=' + encodeURIComponent(e.name); a.textContent = '車站介紹'; card.append(a);
      });
      if (window.HK_I18N && window.HK_I18N.scan) window.HK_I18N.scan(document.querySelector('.hs-trg'));
    } catch (_) { /* 沒有車站資料也能顯示原本的轉乘文字 */ }
    // 消息
    const news = await window.HK.getJSON('data/news.json', true), dl = $('#hs-newslist');
    (news || []).filter(n => n.tag === '高速鉄道').forEach(n => {
      const row = document.createElement('div'); row.className = 'row';
      const dt = document.createElement('dt'); dt.textContent = n.date;
      const d1 = document.createElement('dd'), cat = document.createElement('span'); cat.className = 'cat'; cat.textContent = n.tag; d1.append(cat);
      const d2 = document.createElement('dd'); d2.textContent = n.title; row.append(dt, d1, d2); dl.append(row);
    });
  }
  init().catch(e => { try { console.error(e); } catch (_) {} });
})();
