/* pages3.js — 乘車指南與常見問題、機場聯外交通、特急こばな（v7 新增）。
 * 文字說明是固定內容；班次、所要時間、票價等數字盡量從時刻表資料（data/snapshot.json）即時計算，資料更新後會自動跟著變。 */
(function () {
  'use strict';
  const HK = window.HK, { h, typeTag } = HK;
  const DAY = 86400, hm = t => HK.hm(t);
  const yen = n => '¥' + Number(n).toLocaleString('en-US');
  const normZh = z => String(z || '').replace(/戶/g, '戸').replace(/\s+/g, '');
  const stByName = (H, name) => H.stations.find(s => normZh(s.zh) === normZh(name)) || H.stations.find(s => normZh(s.zh).startsWith(normZh(name)));
  const dispNote = H => ({ midday: '目前採用日中時段班次（部分列車停駛）。', offpeak: '目前採用離峰時段班次（部分列車停駛）。', night: '目前採用深夜時段班次（班次減少）。', recall: '目前為收車時段，不再發出新的班次。' }[H.dispatchNow] || '');
  const sec = (title, sub, ...kids) => h('section', { class: 'gsec' }, h('h2', null, title, sub ? h('small', null, sub) : null), ...kids);
  const cfg = H => H.cfg || {};
  const seatFee = H => cfg(H).seatFee || 500, standFee = H => Math.round(seatFee(H) * (cfg(H).standRatio != null ? cfg(H).standRatio : 0.5));

  /** 某班服務一天內從起點發車的時刻。 */
  function depTimes(H, sv) { const t0 = sv.stops[0].dep, out = []; for (const tr of H.trips) { if (tr.sv !== sv) continue; const t = tr.base + t0; if (t >= 0 && t < DAY) out.push(t); } return out.sort((a, b) => a - b); }
  const paxStops = sv => sv.stops.filter(s => s.pax !== false);
  const tclsName = { loc: '各停', exp: '快速類', ltd: '特急・特快類' };

  /* ═════════ 乘車指南與常見問題 ═════════ */
  function viewGuide(H, root) {
    const sf = seatFee(H), st = standFee(H);
    root.append(h('p', { class: 'lead' }, '第一次搭乘光瀨都市鉄道？這裡整理了各種別的差別、座席與票券、避免搭錯車的方法，以及常見問題。'),
      h('nav', { class: 'lchips sjump', 'aria-label': '本頁內容' }, h('a', { class: 'lchipbtn', href: '#guide' }, '乘車指南'), h('a', { class: 'lchipbtn', href: '#faq' }, '常見問題')));

    /* ── 乘車指南 ── */
    const g = h('div', { id: 'guide' });
    // 1. 種別
    const T = (cls, txt) => h('span', { class: 'ttag t-' + cls }, txt);
    const trow = (tag, stop, seat, fee, who) => h('tr', null, h('th', { scope: 'row' }, tag), h('td', null, stop), h('td', null, seat), h('td', null, fee), h('td', null, who));
    g.append(sec('各種別的差別', 'Train Types',
      h('p', null, '同一條路線上會有不同「種別」的列車，差別在於停靠的車站與座席。月台的發車顯示與時刻表上都會標示種別，上車前請確認。'),
      h('div', { class: 'tscroll' }, h('table', { class: 'tbl gtypes' },
        h('thead', null, h('tr', null, h('th', null, '種別'), h('th', null, '停靠站'), h('th', null, '座席'), h('th', null, '另需費用'), h('th', null, '適合'))),
        h('tbody', null,
          trow(T('loc', '各停'), '每一站都停', '全車自由席', '不需要', '短程移動、前往小站'),
          trow(T('exp', '快速'), '停靠主要車站，部分小站通過', '全車自由席', '不需要', '中距離、想比各停快又不想多花錢'),
          trow(T('exp', '環狀快速'), '行駛環狀區間，停站比一般快速更精簡（時刻表與發車顯示以「環」標示）', '全車自由席', '不需要', '環狀線與直通區間的移動；與一般「快速」是不同的種別'),
          trow(T('ltd', '特快'), '停靠站更少的優等列車（特別快速）', '1・2 号車為指定席、3 号車以後為自由席', `搭乘指定席車廂需指定席券（${yen(sf)}）；自由席車廂不用`, '想快一點，但不一定要訂位'),
          trow(T('ltd', '特急'), '停靠站最少，如特急あおさぎ、特急こばな、空港LINER', '全車指定席（另有立席特急券）', `指定席券 ${yen(sf)}；立席特急券 ${yen(st)}（為指定席的一半）`, '長距離與機場往返，最快最舒適')))),
      h('p', { class: 'note' }, '乘車券（依距離計算）是每個人都需要的；指定席券與立席特急券是搭乘指定席列車時額外加收的費用。詳細票價請見「', h('a', { href: 'timetable.html?tab=fare' }, '票價查詢'), '」。')));

    // 2. 座席與票券
    g.append(sec('座席與票券：指定席、自由席、立席特急券', 'Seats and Tickets',
      h('div', { class: 'gcards' },
        h('div', { class: 'gcard' }, h('h3', null, '指定席'), h('p', { class: 'price' }, yen(sf)), h('p', null, '保證有座位，可以選擇座位。特急的所有車廂、特快的 1・2 号車都是指定席。'), h('p', null, h('a', { class: 'btn sm', href: 'booking.html' }, '線上訂票'))),
        h('div', { class: 'gcard' }, h('h3', null, '自由席'), h('p', { class: 'price' }, '不需另付'), h('p', null, '不必訂位，先到先坐。各停、快速、環狀快速全車自由席；特快 3 号車以後也是自由席。尖峰時段可能沒有座位。')),
        h('div', { class: 'gcard' }, h('h3', null, '立席特急券'), h('p', { class: 'price' }, yen(st)), h('p', null, '只有特急才有。價格是指定席的一半，不保證有座位、也不能選座位。座位坐滿時，請站在車廂連接處或門邊，並抓好扶手。')))));

    // 3. 怎麼選車（圖）
    g.append(sec('怎麼選車', 'Which train should I take?',
      h('div', { class: 'flow' },
        h('div', { class: 'fstep' }, h('b', null, '1'), h('div', null, h('strong', null, '先看目的地'), h('p', null, '用「乘車・轉乘查詢」輸入出發站與目的地，系統會列出所有可搭乘的列車與所要時間。'))),
        h('div', { class: 'farrow', 'aria-hidden': 'true' }, '▶'),
        h('div', { class: 'fstep' }, h('b', null, '2'), h('div', null, h('strong', null, '決定要快還是省'), h('p', null, '想最快抵達：特急或特快（需要指定席券，特急可買立席特急券）。想省錢：快速、環狀快速或各停（自由席）。'))),
        h('div', { class: 'farrow', 'aria-hidden': 'true' }, '▶'),
        h('div', { class: 'fstep' }, h('b', null, '3'), h('div', null, h('strong', null, '確認有沒有停'), h('p', null, '到「設備與服務介紹」的「停車一覽」確認你要去的車站是否停車；再看月台的發車顯示核對種別與行先。'))))));

    // 4. 發車班次圖（即時計算）
    // 1.1.1：這張圖只分「各停／快速類／特急・特快類」三類（沒有高速鉄道專屬的第四類）；
    // 高速鉄道的列車（sv.tcls === 'hs'）前輩確認都算特急，所以併進 ltd 那一類，不會再因為沒有對應的 per.hs 而噴錯。
    const per = { loc: new Array(24).fill(0), exp: new Array(24).fill(0), ltd: new Array(24).fill(0) };
    const perKey = k => k === 'hs' ? 'ltd' : (k || 'loc');
    for (const tr of H.trips) { const sv = tr.sv, t = tr.base + sv.stops[0].dep; if (t < 0 || t >= DAY) continue; per[perKey(sv.tcls)][Math.floor(t / 3600)]++; }
    const tot = Array.from({ length: 24 }, (_, i) => per.loc[i] + per.exp[i] + per.ltd[i]), mx = Math.max(1, ...tot);
    const col = { loc: '#9db8ad', exp: '#1f6b54', ltd: '#b3392f' };
    const bars = h('div', { class: 'sbars', role: 'img', 'aria-label': '每小時各種別的發車班次數' }, tot.map((n, i) => h('div', { class: 'sb', title: `${i} 時：各停 ${per.loc[i]}／快速類 ${per.exp[i]}／特急・特快類 ${per.ltd[i]}（共 ${n} 班）` },
      h('div', { class: 'stack', style: `height:${Math.round(n / mx * 100)}%` }, ['ltd', 'exp', 'loc'].map(k => per[k][i] ? h('i', { style: `flex:${per[k][i]};background:${col[k]}` }) : null)), h('span', null, i % 3 === 0 ? String(i) : ''))));
    const peakH = tot.indexOf(Math.max(...tot)), quiet = tot.map((n, i) => [n, i]).filter(([n, i]) => i >= 5 && n > 0).sort((a, b) => a[0] - b[0])[0];
    g.append(sec('一天的發車班次', 'Departures by hour',
      h('p', null, '下面是全線各種別一天內每小時從起點發車的班次數（依目前的調度方案；尖峰時段班次多、離峰與深夜班次較少）。班次多的時段等車時間短；班次少的時段，請先查好時刻表再出發。'),
      bars,
      h('div', { class: 'sleg' }, ['loc', 'exp', 'ltd'].map(k => h('span', null, h('i', { style: `background:${col[k]}` }), tclsName[k]))),
      h('p', { class: 'note' }, (!tot.some(n => n) ? '目前沒有班次資料。' : (Math.max(...tot) > Math.min(...tot.filter(n => n > 0)) * 1.25 ? `班次最多的是 ${peakH} 時台（${tot[peakH]} 班），最少的是 ${quiet[1]} 時台（${quiet[0]} 班）。` : '目前各時段的班次數相近。')), dispNote(H) ? ' ' : null, dispNote(H) || null)));

    // 5. 避免搭錯車
    const types = new Map();
    H.svcs.forEach(sv => { const k = sv.type || '各停'; if (!types.has(k)) types.set(k, { sv, routes: new Set() }); types.get(k).routes.add(sv.routeName); });
    // 1.1.1：排序表沒有 'hs' 這個鍵，高速鉄道併到跟特急（ltd）同一順位，避免排序比較時拿到 undefined。
    const TTORD = { loc: 0, exp: 1, ltd: 2, hs: 2 };
    const typeTags = [...types.entries()].sort((a, b) => TTORD[a[1].sv.tcls] - TTORD[b[1].sv.tcls]).map(([k, v]) =>
      h('div', { class: 'ttrow' }, typeTag(v.sv), HK.typeMark(v.sv) ? h('b', { class: 'mk ' + v.sv.tcls }, HK.typeMark(v.sv)) : h('b', { class: 'mk loc' }, '—'), h('span', null, [...v.routes].slice(0, 3).join('、') + (v.routes.size > 3 ? ' 等' : ''))));
    g.append(sec('怎麼避免搭錯車', 'Avoid the wrong train',
      h('ol', { class: 'steps' },
        h('li', null, h('strong', null, '先看種別，再看行先。'), '同一個月台常有不同種別的列車進站，行先相同但停的站不同。'),
        h('li', null, h('strong', null, '核對路線名稱。'), '「環狀快速」和「快速」名稱相近，但是是不同的種別，停靠站不一樣；上車前請看清楚完整的名稱。'),
        h('li', null, h('strong', null, '用「停車一覽」確認目的地有停。'), '特急、特快會通過許多小站；如果你的目的地是小站，搭到不停的車會被載過站。'),
        h('li', null, h('strong', null, '特急、特快 1・2 号車要有指定席券。'), '沒有指定席券請坐自由席車廂；特急沒有自由席，沒有指定席券時請改買立席特急券或改搭其他種別。'),
        h('li', null, h('strong', null, '時刻表的格子會用一個字標示種別。'), '各停不標示；其他種別以略稱的第一個字標示（例如「特」「快」「環」）。'),
        h('li', null, h('strong', null, '搭錯車了？'), '不要慌張，在下一個停靠站下車，改搭反方向或正確的列車即可。如果超過購買的區間，請在出站前向站務人員補票。')),
      h('p', { class: 'note', style: 'margin-top:12px' }, '目前運行中的種別與時刻表上的標示：'),
      h('div', { class: 'ttbox' }, typeTags.length ? typeTags : h('p', { class: 'note' }, '目前沒有資料。'))));
    root.append(g);

    /* ── 常見問題 ── */
    const Q = (q, ...a) => h('details', { class: 'faqi' }, h('summary', null, q), h('div', { class: 'faqa' }, ...a));
    const link = (href, t) => h('a', { href }, t);
    const base = cfg(H).fareBase != null ? cfg(H).fareBase : 290, step = cfg(H).fareStep != null ? cfg(H).fareStep : 200;
    const faq = h('div', { id: 'faq' }, sec('常見問題', 'FAQ',
      h('h3', { class: 'h3' }, '延誤・退票'),
      Q('列車延誤時怎麼辦？', h('p', null, '請先看站內的廣播與發車顯示，也可以到', link('live.html', '即時列車動態'), '查看列車位置（位置依時刻表推算，並非實際車輛位置）。延誤時間較長時，可以用', link('timetable.html?tab=route', '乘車・轉乘查詢'), '改搭其他路線繞行。'),
        h('p', null, '若因天氣、天災造成延誤，可以到本網站下載「延誤證明」，並可申請退票。需要的時候會在「最新消息」公告下載連結與申請方式。')),
      Q('因為天候或天災停駛，已經買的票可以退嗎？', h('p', null, '因天氣、天災造成停駛或嚴重延誤時，可以申請退票。請保留乘車券與指定席券，並依本網站公告的方式申請；詳細的手續與期限，以公告為準。')),
      Q('我搭的車延誤了，會趕不上轉乘怎麼辦？', h('p', null, '請在下一個車站向站務人員說明，並出示延誤證明（如有）。也可以用「乘車・轉乘查詢」重新查詢，系統會從目前的時間找出最快的搭乘方式。')),
      h('h3', { class: 'h3' }, '票券・料金'),
      Q('乘車券的價格怎麼算？', h('p', null, `乘車券由起步票價 ${yen(base)} 加上跨越的收費區數，每跨越一個收費區加 ${yen(step)}。有多條路徑時，採跨越收費區最少、其次距離最短的路徑。`), h('p', null, link('timetable.html?tab=fare', '票價查詢'), '輸入出發站與抵達站就能看到金額。')),
      Q('兒童與長者有折扣嗎？', h('p', null, '12 歲以下與 60 歲以上的乘車券為大人的一半（四捨五入到整數）。指定席券與立席特急券不打折。')),
      Q('指定席券與立席特急券是多少錢？', h('p', null, `指定席券 ${yen(sf)}；特急的立席特急券為指定席的一半（${yen(st)}），不保證有座位，也不能選座位。特快只有 1・2 号車是指定席，3 号車以後為自由席，不用另外付費。`)),
      Q('哪些列車需要指定席？', h('p', null, '特急為全車指定席；特快的 1・2 号車為指定席。各停、快速、環狀快速都是全車自由席。')),
      Q('有周遊券或優惠套票嗎？', h('p', null, '有。往返機場的旅客可以使用「三日券」（3,900 円）與「五日券」（4,800 円），期間內可無限次搭乘光瀨都市鉄道所有非指定席列車；搭乘指定席列車時只需另付指定席費用。詳細請見', link('airport.html', '機場聯外交通'), '。')),
      Q('在哪裡買指定席券？', h('p', null, '可以到', link('booking.html', '線上訂票'), '選擇列車與座位。')),
      h('h3', { class: 'h3' }, '乘車'),
      Q('時刻表上「特」「快」「環」是什麼意思？', h('p', null, '那是種別的略稱：不是各停、快速的列車，會以種別名稱的第一個字標示（例如特急＝「特」、特快＝「特」、環狀快速＝「環」）。各停不標示。完整的種別請看列車名稱。')),
      Q('發車顯示怎麼看？', h('p', null, '在', link('timetable.html?tab=map', '路線圖'), '點選車站，就會看到這個車站接下來的發車、種別、行先與倒數時間。')),
      Q('坐過站了怎麼辦？', h('p', null, '在下一個停靠站下車，改搭反方向的列車回去。若超過原本購買的區間，請在出站前向站務人員補票。')),
      Q('末班車與深夜的班次怎麼查？', h('p', null, '各路線的首末班在', link('routes.html', '設備與服務介紹'), '。深夜與離峰時段班次會減少，時刻表會依目前的時段自動顯示正在運行的班次。')),
      Q('即時列車動態的位置準嗎？', h('p', null, '列車位置是依時刻表推算，不是實際車輛位置，實際運轉狀況可能因延誤而不同，請以站內公告為準。')),
      Q('怎麼去松澤國際機場？', h('p', null, '搭乘特急或特快，一車直達，最快 11 分鐘。詳細的乘車方式與班次請見', link('airport.html', '機場聯外交通'), '。')),
      h('h3', { class: 'h3' }, '其他'),
      Q('輪椅或嬰兒車需要協助時怎麼辦？', h('p', null, '請向各站的站務人員說明，站務人員會協助您上下車。')),
      Q('遺失物怎麼辦？', h('p', null, '請告知下車的車站與搭乘的列車，向站務人員查詢。')),
      Q('這個網站上的時刻表會和實際一樣嗎？', h('p', null, '網站的時刻表來自營運系統定期匯出的資料，會跟著調度方案（離峰、深夜、收車）變化。臨時的調整與延誤請以站內公告為準。'))));
    root.append(faq);
    // 網址帶有 #faq 時，等內容建好再捲動
    if (location.hash) setTimeout(() => { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }, 50);
  }

  /* ═════════ 機場聯外交通 ═════════ */
  function viewAirport(H, root) {
    const sf = seatFee(H), st = standFee(H);
    const ap = stByName(H, '松沢国際空港') || stByName(H, '松澤') || stByName(H, '松沢');
    const center = stByName(H, 'みつせ');
    root.append(h('div', { class: 'aphero' },
      h('img', { src: 'assets/photo/ad2.webp', alt: '空港LINER與松澤國際機場', loading: 'eager' }),
      h('div', { class: 'aph-t' }, h('span', { class: 'tag' }, '空港LINER'), h('h2', null, '松澤國際機場　⇄　光瀨市區'), h('p', null, '一車直達，最快 11 分鐘。'))));
    root.append(h('p', { class: 'lead' }, '松澤國際機場（松沢国際空港站）有特急與特快直達光瀨市區，不需要轉乘。下面是搭乘方式、所要時間、班次，以及專為旅客準備的三日券與五日券。'));

    // 搭乘方式
    root.append(sec('搭乘方式', 'How to ride',
      h('ol', { class: 'steps' },
        h('li', null, h('strong', null, '前往松沢国際空港站。'), '機場站設有月台直達光瀨市區的列車。'),
        h('li', null, h('strong', null, '選擇特急或特快。'), '特急為全車指定席；特快為 1・2 号車指定席、3 号車以後自由席。兩者都是直達列車，中途停靠站少，所要時間最短。'),
        h('li', null, h('strong', null, '準備票券。'), `需要「乘車券」；搭乘特急需指定席券（${yen(sf)}）或立席特急券（${yen(st)}）；搭乘特快 1・2 号車需指定席券（${yen(sf)}），坐 3 号車以後的自由席不用另付。`),
        h('li', null, h('strong', null, '依發車顯示上車。'), '請確認種別與行先；各停與快速也行駛於這個區間，但停站較多，所需時間較長。')),
      h('p', null, h('a', { class: 'btn', href: 'booking.html' }, '線上訂票'), ' ', h('a', { class: 'btn ghost', href: 'timetable.html?tab=route' + (ap ? '&from=' + encodeURIComponent(ap.id) : '') }, '乘車・轉乘查詢'))));

    // 時間與班次（從時刻表資料計算）
    const dyn = h('div');
    root.append(sec('所要時間與班次', 'Travel time and frequency', h('p', null, '最快的特急一車直達，只需 11 分鐘左右。下表依目前的時刻表計算（含調度方案），各種別的所要時間與日間班次如下。'), dyn));
    (function () {
      if (!ap) { dyn.append(h('p', { class: 'note' }, '時刻表資料更新後會在這裡顯示各種別的所要時間與班次。')); return; }
      const groups = new Map();
      H.svcs.forEach(sv => {
        const idx = sv.stops.findIndex(s => s.station === ap.id && s.pax !== false); if (idx < 0) return;
        let g = groups.get(sv.routeName); if (!g) groups.set(sv.routeName, g = { name: sv.routeName, sv, svs: [], ev: 0, day: 0, mins: null, dests: new Set() });
        g.svs.push({ sv, idx });
        if (center) {
          const j = sv.stops.findIndex(s => s.station === center.id && s.pax !== false);
          if (j >= 0) { const m = j > idx ? sv.stops[j].arr - sv.stops[idx].dep : sv.stops[idx].arr - sv.stops[j].dep; if (m > 0 && (g.mins == null || m < g.mins)) g.mins = m; }
        }
      });
      (H.events.get(ap.id) || []).forEach(e => { const g = groups.get(e.sv.routeName); if (!g) return; g.ev++; if (e.t >= 9 * 3600 && e.t < 16 * 3600) g.day++; g.dests.add(H.destOf(e.sv, e.i)); });
      // 1.1.1：同上，高速鉄道（hs）併到跟特急（ltd）同一順位，避免排序比較時拿到 undefined。
      const APORD = { ltd: 0, hs: 0, exp: 1, loc: 2 };
      const rows = [...groups.values()].filter(g => g.ev > 0).sort((a, b) => (APORD[a.sv.tcls] - APORD[b.sv.tcls]) || (a.mins || 1e9) - (b.mins || 1e9));
      if (!rows.length) { dyn.append(h('p', { class: 'note' }, '目前的時刻表資料中沒有從機場站發車的班次。')); return; }
      dyn.append(h('div', { class: 'tscroll' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '列車'), h('th', null, '行先'), h('th', null, center ? `到${center.zh}` : '所要時間'), h('th', null, '日間（9–16 時）'), h('th', null, '本日班次'), h('th', null, '座席'))),
        h('tbody', null, rows.map(g => h('tr', null,
          h('td', null, typeTag(g.sv), ' ', g.name),
          h('td', null, [...g.dests].slice(0, 2).join('、')),
          h('td', null, g.mins ? `約 ${Math.round(g.mins / 60)} 分` : '—'),
          h('td', null, g.day ? `${g.day} 班（約 ${Math.round(7 * 60 / g.day)} 分一班）` : '—'),
          h('td', null, `${g.ev} 班`),
          h('td', null, H.reserveLabel(g.sv) || '自由席')))))),
        h('p', { class: 'note' }, '班次為從松沢国際空港站發車的本日班次。', dispNote(H) ? ' ' : null, dispNote(H) || null));
    })();

    // 套票
    let fareLine = null;
    if (ap && center) { const f = H.fare(ap.id, center.id); if (f) { const one = f.yen, rt = one * 2; fareLine = { one, rt }; } }
    const pass = (title, price, who, lines) => h('div', { class: 'gcard pass' }, h('h3', null, title), h('p', { class: 'price' }, price), h('p', { class: 'who' }, who), h('ul', null, lines.map(x => h('li', null, x))));
    root.append(sec('優惠套票　三日券・五日券', 'Visitor Passes',
      h('p', null, '專為旅客準備的套票。購買後，在使用期間內可以「無限次搭乘光瀨都市鉄道所有非指定席列車」，搭乘指定席列車時，只需要另外付指定席費用（不需再付乘車券）。'),
      h('div', { class: 'gcards two' },
        pass('三日券', '3,900 円', '適合：3 天 2 夜的短期旅行', ['連續 3 天內無限次搭乘', '各停、快速、環狀快速、特快自由席都能搭', `搭乘特急、特快指定席只需另付指定席券 ${yen(sf)}`]),
        pass('五日券', '4,800 円', '適合：長假與慢遊', ['連續 5 天內無限次搭乘', '各停、快速、環狀快速、特快自由席都能搭', `搭乘特急、特快指定席只需另付指定席券 ${yen(sf)}`])),
      fareLine ? h('p', { class: 'note' }, `參考：${ap.zh}～${center.zh} 單程乘車券 ${yen(fareLine.one)}、來回 ${yen(fareLine.rt)}。三日券（3,900 円）大約搭 ${Math.ceil(3900 / fareLine.one)} 次這樣的單程就回本；五日券（4,800 円）約 ${Math.ceil(4800 / fareLine.one)} 次。以每天往返市區與景點計算，通常很划算。`) : null,
      h('p', { class: 'note' }, '套票購買方式與販售地點，將於本網站公告。')));
    root.append(sec('注意事項', null, h('ul', { class: 'spoints' },
      h('li', null, '特急為全車指定席；沒有指定席券時，可購買立席特急券，但不保證有座位。'),
      h('li', null, '行李較多時，請盡量使用指定席車廂的行李放置處，避免阻擋走道與車門。'),
      h('li', null, '時刻為預定時刻，實際運轉狀況請以站內公告為準。'))));
  }

  /* ═════════ 特急こばな ═════════ */
  function viewKobana(H, root) {
    const sf = seatFee(H), st = standFee(H);
    root.append(h('div', { class: 'kbhero' },
      h('img', { src: 'assets/photo/kobana1.webp', alt: '行駛在高架橋上的新8000形特急こばな' }),
      h('div', { class: 'kb-t' }, h('span', { class: 'tag' }, '新列車　特急'), h('h2', null, '特急こばな'), h('p', { class: 'kb-s' }, '勝守、天鳥崎、本磯島　一車直達'))));
    root.append(h('p', { class: 'lead' }, '特急こばな直達勝守、天鳥崎、本磯島，沿線是漁港、神社與海岸風景。使用最新的 8000 形，最高時速 160 公里，全車指定席，備有 USB 充電口。'));

    root.append(sec('新 8000 形', 'New 8000 Series',
      h('div', { class: 'kbcols' },
        h('div', null,
          h('p', null, '特急こばな使用全新的 8000 形。白色車身配上紅色的線條，流線型的車頭在高架橋與鐵橋上特別顯眼。全車為指定席，並備有 USB 充電口，長途乘車也能放心使用手機。'),
          h('table', { class: 'tbl' }, h('tbody', null,
            h('tr', null, h('th', null, '最高速度'), h('td', null, '160 km/h')),
            h('tr', null, h('th', null, '座席'), h('td', null, '全車指定席（另有立席特急券）')),
            h('tr', null, h('th', null, '座位設備'), h('td', null, '備有 USB 充電口')),
            h('tr', null, h('th', null, '車廂'), h('td', null, '流線型車頭，白色車身搭配紅色線條')),
            h('tr', null, h('th', null, '費用'), h('td', null, `乘車券＋指定席券 ${yen(sf)}（立席特急券 ${yen(st)}）`))))),
        h('figure', { class: 'kbfig' }, h('img', { src: 'assets/photo/kobana3.webp', alt: '8000形特急こばな的車頭', loading: 'lazy' }), h('figcaption', null, '流線型的車頭')))));

    root.append(sec('沿線景點', 'Along the line',
      h('p', null, '搭特急こばな，可以直達這些景點：'),
      h('div', { class: 'kbspots' },
        h('a', { href: 'sights.html#port', class: 'kbspot' }, h('img', { src: 'assets/photo/port1.webp', alt: '勝守漁港', loading: 'lazy' }), h('div', null, h('strong', null, '勝守漁港'), h('span', null, '日出與朝市、現撈海鮮。搭早班列車，到港邊吃早餐。'), h('small', null, '最近車站：勝守'))),
        h('a', { href: 'sights.html#shrine', class: 'kbspot' }, h('img', { src: 'assets/photo/shrine1.webp', alt: '天鳥崎神社', loading: 'lazy' }), h('div', null, h('strong', null, '天鳥崎神社'), h('span', null, '海岸、夕陽、神社與參拜街道。傍晚前往最美。'), h('small', null, '最近車站：天鳥崎中央'))))));

    // 停靠站與班次
    const dyn = h('div');
    root.append(sec('停靠站與時刻', 'Stops and times', dyn));
    (function () {
      const sv = H.svcs.find(s => /こばな/.test(s.routeName));
      if (!sv) { dyn.append(h('p', null, '主要停靠站：勝守、天鳥崎、本磯島。詳細的停靠站與時刻會在時刻表資料更新後顯示在這裡。'), h('p', null, h('a', { class: 'btn ghost', href: 'timetable.html' }, '前往時刻表'))); return; }
      const all = H.svcs.filter(s => s.routeName === sv.routeName), tt = depTimes(H, sv), pax = paxStops(sv);
      dyn.append(h('dl', { class: 'lh-s kbdl' },
        h('div', null, h('dt', null, '運行區間'), h('dd', null, `${H.stName(sv.stops[0].station)} → ${H.stName(sv.stops[sv.stops.length - 1].station)}`)),
        h('div', null, h('dt', null, '停靠站'), h('dd', null, `${pax.length} 站`)),
        h('div', null, h('dt', null, '全程所要時間'), h('dd', null, `約 ${Math.round((sv.stops[sv.stops.length - 1].arr - sv.stops[0].dep) / 60)} 分`)),
        h('div', null, h('dt', null, '首班／末班'), h('dd', null, tt.length ? (fl => `${hm(fl[0])}／${hm(fl[1])}`)(H.firstLast(tt)) : '本日無班次')),
        h('div', null, h('dt', null, '本日班次'), h('dd', null, `${tt.length} 班`))));
      const rows = []; sv.stops.forEach((s, i) => { if (s.pax === false) return; rows.push(h('tr', null, h('td', null, h('a', { href: 'timetable.html?s=' + encodeURIComponent(s.station) }, H.codeBadges(s.station), H.stName(s.station))), h('td', { class: 'tm' }, i === 0 ? '起點' : `${Math.round((s.arr - sv.stops[0].arr) / 60)} 分`))); });
      dyn.append(h('div', { class: 'tscroll' }, h('table', { class: 'tbl', style: 'max-width:420px' }, h('thead', null, h('tr', null, h('th', null, '停靠站'), h('th', null, '自起點'))), h('tbody', null, rows))),
        h('p', { class: 'note' }, all.length > 1 ? '另有反方向的班次。' : null, (all.length > 1 && dispNote(H)) ? ' ' : null, dispNote(H) || null),
        h('p', null, h('a', { class: 'btn ghost', href: 'routes.html' }, '設備與服務介紹'), ' ', h('a', { class: 'btn ghost', href: 'timetable.html' }, '時刻表')));
    })();

    root.append(sec('乘車資訊', null,
      h('ul', { class: 'spoints' },
        h('li', null, '全車指定席。請先購買乘車券與指定席券；也有立席特急券，但不保證有座位。'),
        h('li', null, '特急通過許多小站，請先確認目的地是否停車；停靠站請見上表或「設備與服務介紹」。'),
        h('li', null, '往機場請搭乘空港LINER；往勝守、天鳥崎、本磯島請搭乘特急こばな。')),
      h('p', null, h('a', { class: 'btn', href: 'booking.html' }, '線上訂票'), ' ', h('a', { class: 'btn ghost', href: 'guide.html' }, '乘車指南與常見問題'))));
  }

  Object.assign(HK, { viewGuide, viewAirport, viewKobana });
})(window);
