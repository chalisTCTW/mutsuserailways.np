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
    // 票價
    const rows = $('#hs-fares');
    if (rows && H.hsFareExt) {
      ['新勝守', '新光瀨', '東平倉'].forEach(nm => {
        const f = H.hsFareExt(nm, '新岩沢'); if (!f) return;
        const tr = document.createElement('tr'), c = (txt, extra) => { const td = document.createElement('td'); td.textContent = txt; if (extra) td.append(extra); return td; };
        const name = document.createElement('td'); name.textContent = nm + ' ⇄ 新岩沢';
        const tot = document.createElement('td'), bb = document.createElement('b'); bb.textContent = yen(f.total); tot.append(bb);
        if (nm === '新勝守') { const sm = document.createElement('small'); mark(sm); sm.textContent = L('往返', '往復', 'round trip') + ' ' + yen(f.total * 2); tot.append(sm); }
        tr.append(name, c(yen(f.yen)), c(yen(f.seat)), tot); rows.append(tr);
      });
    }
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
