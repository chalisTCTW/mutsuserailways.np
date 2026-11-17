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
    const ttBox = $('#hs-timetable');
    if (ttBox && window.HK.groupsOf && window.HK.lineBlockTop && window.HK.lineBlockBottom && window.HK.fullTable) {
      const groups = window.HK.groupsOf(H), g = groups.find(x => /高速鉄道/.test(x.name));
      if (g) {
        let di = 0;
        const top = document.createElement('div'), mid = document.createElement('div'), bottom = document.createElement('div');
        ttBox.replaceChildren(top, mid, bottom);
        const draw = () => {
          window.HK.lineBlockTop(H, groups, g, di, top, n => { di = n; draw(); });
          const sv = g.svs[Math.min(di, g.svs.length - 1)];
          const h3 = document.createElement('h3'), p = document.createElement('p');
          h3.className = 'h3'; h3.textContent = L('全日時刻表', '全日時刻表', 'Full-day timetable');
          p.className = 'note';
          p.textContent = L(`${window.HK.dirLabel(H, sv)}。各站的發車時刻（終點站為到達時刻），一欄是一班車；欄名為班次號（沒有編號的種別則顯示發車時刻）。`, `${window.HK.dirLabel(H, sv)}。各駅の発車時刻（終点は到着時刻）、1列＝1本。欄名は列車番号（番号がない種別は発車時刻を表示）。`, `${window.HK.dirLabel(H, sv)}. Departure time at each stop (arrival at the terminus); one column per run, headed by its train number where available.`);
          mid.replaceChildren(h3, p, window.HK.fullTable(H, sv));
          bottom.replaceChildren();
          window.HK.lineBlockBottom(H, groups, g, di, bottom);
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
