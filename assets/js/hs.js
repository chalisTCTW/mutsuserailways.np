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
    const a = stN('新勝守'), b = stN('東平倉');
    const hsDeps = st => st ? H.departures(st.id).filter(e => e.sv.isHS && e.t >= 4 * 3600 && e.t < 86400) : [];   // 深夜 0 時台的班次不算「首班」：從清晨 4 時起算到當天最後一班
    const A = hsDeps(a), B = hsDeps(b);
    const ext = H.hsExtDuration ? H.hsExtDuration('東平倉', '新岩沢') : 0;
    // 新勝守→東平倉（同一班車上的時間）
    let core = 0; if (A.length) { const sv = A[0].sv, st = sv.stops; core = st[st.length - 1].arr - st[0].dep; }
    const dur = core + ext;
    const t = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    if (A.length && dur) {
      const first = A[0].t, last = A[A.length - 1].t;
      t('#hs-first', hmOf(first));
      t('#hs-dur', L(`約 ${Math.round(dur / 60)} 分`, `約${Math.round(dur / 60)}分`, `about ${Math.round(dur / 60)} min`));
      if (B.length) {
        const retLast = B[B.length - 1].t - ext, svB = B[0].sv, coreB = svB.stops[svB.stops.length - 1].arr - svB.stops[0].dep;
        t('#hs-ret', hmOf(retLast));
        t('#hs-ret2', L(`約 ${hmOf(retLast + ext + coreB)} 抵達新勝守（新勝守末班發車 ${hmOf(last)}）`, `${hmOf(retLast + ext + coreB)} ごろ新勝守着（新勝守発の最終は ${hmOf(last)}）`, `arrives at Shin-Katsumori about ${hmOf(retLast + ext + coreB)} (last departure from Shin-Katsumori: ${hmOf(last)})`));
        const stay = retLast - (first + dur);
        if (stay > 0) t('#hs-stay', L(`最長約 ${Math.floor(stay / 3600)} 小時`, `最長 約${Math.floor(stay / 3600)}時間`, `up to ~${Math.floor(stay / 3600)} h`));
      }
    }
    // 票價（1.9.0：指定席特急券分「商務車廂」「一般車廂」兩個價，不再是單一數字）
    const rows = $('#hs-fares'), bizFee = (CFG.hsBusinessFee != null) ? CFG.hsBusinessFee : 1600;
    if (rows && H.hsFareExt) {
      ['新勝守', '新光瀨', '東平倉'].forEach(nm => {
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
        hsSvs.forEach(sv => {
          const hp = sv.stops.findIndex(s => H.stName(s.station) === '東平倉');
          buckets[hp === sv.stops.length - 1 ? 0 : 1].push(sv);
        });
        const templateOf = list => list.reduce((a, b) => (b.stops.filter(s => s.pax !== false).length > a.stops.filter(s => s.pax !== false).length ? b : a));
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
          const { tmpl, runs } = mergedRuns(list), rows = tmpl.stops.filter(s => s.pax !== false);
          if (!runs.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = L('本日沒有班次。', '本日の運行はありません。', 'No service today.'); return p; }
          const hsAt = k => k && Math.floor(runs[k].t / 3600) !== Math.floor(runs[k - 1].t / 3600) ? ' hs' : '';
          const head = document.createElement('tr'); head.appendChild(document.createElement('th')).textContent = L('車站', '駅', 'Station');
          runs.forEach((r, k) => { const th = document.createElement('th'); th.className = 'c' + hsAt(k); th.textContent = r.gou || hmOf(r.t); head.appendChild(th); });
          const tbody = document.createElement('tbody');
          rows.forEach(s => {
            const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row';
            const bd = H.codeBadges(s.station); if (bd) th.appendChild(bd); th.append(document.createTextNode(H.stName(s.station)));
            tr.appendChild(th);
            runs.forEach((r, k) => {
              const td = document.createElement('td'); td.className = 'c' + hsAt(k);
              const j = r.sv.stops.findIndex(x => x.station === s.station);
              td.textContent = j >= 0 ? hmOf(r.t + ownOffset(r.sv, j)) : '－';
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
          p.textContent = L(`${dl}。已合併直通上羽本線的班次並按時間排列；各站的發車時刻（終點站為到達時刻），一欄是一班車；欄名為班次號，短程班次對不到的站顯示「－」。`, `${dl}。上羽線直通の列車も合わせて時刻順に表示。各駅の発車時刻（終点は到着時刻）、1列＝1本。欄名は列車番号、短距離の列車が通らない駅は「－」。`, `${dl}. Through-service trains to the Ueha Main Line are merged in and sorted by time. Departure time at each stop (arrival at the terminus); one column per run; "－" marks a stop a shorter run doesn't reach.`);
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
