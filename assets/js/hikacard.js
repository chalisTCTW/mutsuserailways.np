/* 2.9.0：交通局 IC 卡「HIKACARD」的介紹區塊。
 *
 * 光瀨都市鉄道（guide.html 乘車指南）跟光瀨市交通局（monorail.html）共用同一份內容：
 * 兩邊都呼叫 HK.hikacardSection(H, { side: 'rail' | 'mono' })，內容與數字都從 site-config.js 的 CFG.hikacard 讀。
 * side='rail' 時另外畫一張「不能使用的區間」路線圖（需要 hk-map／hk-ui 的 computeLayout・renderMap，guide.html 本來就有載入）；
 * side='mono' 時只列區間文字，並連到鉄道那邊的路線圖。
 */
(function (root) {
  'use strict';
  const HK = root.HK || (root.HK = {});

  const yen = n => '¥' + Number(n).toLocaleString('en-US');
  const norm = z => String(z || '').replace(/戶/g, '戸').replace(/[瀬]/g, '瀨').replace(/[沢]/g, '澤').replace(/[国]/g, '國').replace(/\s+/g, '');
  const stOf = (H, zh) => H.stations.find(s => norm(s.zh) === norm(zh)) || H.stations.find(s => norm(s.zh).indexOf(norm(zh)) >= 0);

  function el(tag, attrs, ...kids) {
    if (HK.h) return HK.h(tag, attrs, ...kids);
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => { if (attrs[k] != null) e.setAttribute(k === 'class' ? 'class' : k, attrs[k]); });
    kids.flat().forEach(k => { if (k == null || k === false) return; e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return e;
  }

  /** 不能使用的區間 → 路線圖上的邊（a|b）。照前輩指定的路線走，只取那條路線的停站序列裡兩端之間的部分。 */
  function ngEdgeKeys(H, C) {
    const keys = new Set();
    (C.ngSections || []).forEach(ng => {
      if (ng.all) return;
      const A = stOf(H, ng.a), B = stOf(H, ng.b);
      if (!A || !B) return;
      // 先找有停這兩站、而且路線名稱符合的班次；找不到再退回最短路徑
      const sv = H.svcs.find(s => !s.isHS && (!ng.line || String(s.routeName || s.line || '').indexOf(ng.line) >= 0) &&
        s.stops.some(x => x.station === A.id) && s.stops.some(x => x.station === B.id));
      let ids = null;
      if (sv) {
        const seq = sv.stops.map(x => x.station);
        const i = seq.indexOf(A.id), j = seq.indexOf(B.id);
        ids = seq.slice(Math.min(i, j), Math.max(i, j) + 1);
      } else if (H.shortestPath) ids = H.shortestPath(A.id, B.id);
      if (!ids) return;
      for (let k = 0; k + 1 < ids.length; k++) {
        // 跳站班次：兩站之間沒有直接的邊時，用最短路徑補上中間的邊
        const seg = H.shortestPath ? H.shortestPath(ids[k], ids[k + 1]) || [ids[k], ids[k + 1]] : [ids[k], ids[k + 1]];
        for (let q = 0; q + 1 < seg.length; q++) keys.add(seg[q] < seg[q + 1] ? seg[q] + '|' + seg[q + 1] : seg[q + 1] + '|' + seg[q]);
      }
    });
    return keys;
  }

  function cardFigure(c) {
    return el('figure', { class: 'hc-card' },
      el('img', { src: 'assets/img/hikacard/card-' + c.id + '.webp', srcset: 'assets/img/hikacard/card-' + c.id + '-s.webp 428w, assets/img/hikacard/card-' + c.id + '.webp 856w', sizes: '(max-width: 760px) 80vw, 300px', alt: 'HIKACARD ' + c.name, width: 856, height: 540, loading: 'lazy' }),
      el('figcaption', null, el('b', null, c.name), c.note ? el('span', null, c.note) : null));
  }

  function hikacardSection(H, opts) {
    opts = opts || {};
    const CFG = (HK.CFG) || root.HK_CONFIG || {};
    const C = CFG.hikacard || {};
    const side = opts.side || 'rail';
    const box = el('section', { class: 'hc', id: 'hikacard' });

    box.append(el('div', { class: 'hc-head' },
      el('p', { class: 'hc-en' }, 'IC CARD'),
      el('h2', null, 'HIKACARD'),
      el('p', { class: 'hc-lead' }, '光瀨市交通局發行的 IC 乘車卡。光瀨都市單軌與光瀨都市鉄道都能使用，進出站感應一下就好，不用每次買票。')));

    // 卡面
    const cards = el('div', { class: 'hc-cards' });
    (C.designs || []).forEach(c => cards.append(cardFigure(c)));
    box.append(cards);

    // 價格
    box.append(el('div', { class: 'hc-price' },
      el('div', null, el('span', { class: 'k' }, '發售價格'), el('span', { class: 'v' }, yen(C.price || 1500))),
      el('div', null, el('span', { class: 'k' }, '內含儲值'), el('span', { class: 'v' }, yen(C.initialCharge || 500))),
      el('div', null, el('span', { class: 'k' }, '之後儲值'), el('span', { class: 'v' }, '不限金額・不限次數'))));

    // 使用方法（照片 H：剪票口）
    const pct = Math.round((C.railDiscount != null ? C.railDiscount : 0.25) * 100);
    box.append(el('div', { class: 'hc-how' },
      el('figure', { class: 'hc-photo' },
        el('img', { src: 'assets/img/monorail/ride-gate.jpg', srcset: 'assets/img/monorail/ride-gate-s.jpg 640w, assets/img/monorail/ride-gate.jpg 1600w', sizes: '(max-width: 760px) 100vw, 480px', alt: '單軌車站的剪票口與「紫市方面」標示', loading: 'lazy' }),
        el('figcaption', null, '剪票口的讀卡處在閘門上方，進站與出站各感應一次。')),
      el('ol', { class: 'hc-steps' },
        el('li', null, el('b', null, '搭乘光瀨都市單軌'), el('span', null, '進站、出站時，在剪票口感應卡片。車資在出站時自動扣除。')),
        el('li', null, el('b', null, '搭乘光瀨都市鉄道'), el('span', null, '進站、出站時，在剪票口感應卡片。以 HIKACARD 搭乘，車資折抵 ' + pct + '%。')),
        el('li', null, el('b', null, 'ONE-MAN 列車'), el('span', null, '只有司機、沒有車掌的列車（一人控制）。搭乘時請在車上的感應器感應卡片。')),
        el('li', null, el('b', null, '指定席列車'), el('span', null, '車資折抵只適用於非指定席（自由席）列車。搭乘指定席時，請另外購買指定席券。')))));

    // 不能使用的區間
    const ng = el('div', { class: 'hc-ng' }, el('h3', null, '不能使用 HIKACARD 的區間'));
    const ul = el('ul', { class: 'hc-nglist' });
    (C.ngSections || []).forEach(x => ul.append(el('li', null, el('b', null, x.line), x.all ? '全線' : (x.a + '〜' + x.b))));
    ng.append(ul, el('p', { class: 'hc-note' }, '這些區間請購買一般乘車券。'));
    if (side === 'rail' && HK.computeLayout && HK.renderMap) {
      try {
        const L = HK.computeLayout(H);
        const mbox = el('div', { class: 'mapbox hc-map' });
        ng.append(mbox);
        const m = HK.renderMap(mbox, H, L, { interactive: false });
        const keys = ngEdgeKeys(H, C);
        if (m.markEdges) m.markEdges(keys, 'ic-ng');
        if ((C.ngSections || []).some(x => x.all)) m.svg.classList.add('ic-hs-ng');
        mbox.append(el('div', { class: 'legend' },
          el('span', null, el('i', { class: 'hc-lg ok' }), '可以使用'),
          el('span', null, el('i', { class: 'hc-lg ng' }), '不能使用（灰色虛線）')));
      } catch (e) { /* 地圖畫不出來時只留文字清單 */ }
    } else if (side === 'mono') {
      ng.append(el('p', null, el('a', { href: 'guide.html#hikacard' }, '在路線圖上查看不能使用的區間 →')));
    }
    box.append(ng);

    // 購買地點
    const counters = (C.counters || []).map(zh => { const s = stOf(H, zh); return s ? s.zh : zh; });
    box.append(el('div', { class: 'hc-buy' },
      el('h3', null, '在哪裡買'),
      el('div', { class: 'hc-buygrid' },
        el('div', null, el('b', null, '自動售票機'), el('p', null, '光瀨都市鉄道與光瀨都市單軌的所有車站。儲值也可以在自動售票機辦理。')),
        el('div', null, el('b', null, '人工櫃台'), el('ul', { class: 'hc-counters' }, counters.map(n => el('li', null, n)))))));
    return box;
  }

  Object.assign(HK, { hikacardSection, hikacardNgEdges: ngEdgeKeys });
})(typeof window !== 'undefined' ? window : globalThis);
