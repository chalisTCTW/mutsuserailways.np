/* i18n.js — 光瀨都市鉄道 入口網站的多語言（日本語＝預設／中文／English）。
 * 作法：頁面原文是中文；執行時依「中文原文 → 翻譯」的對照表（i18n-dict.js）替換文字節點與 title／alt／aria-label／placeholder，
 *       並持續監看之後由 JS 產生的內容。沒有翻譯的字串維持原文。語言存在 localStorage（hk-lang），切換時重新載入頁面。
 *       站名與路線名用路網資料裡的英文名（HK_I18N.names）。 */
(function () {
  'use strict';
  const LANGS = ['ja', 'zh', 'en'];
  let lang = 'ja';
  try {
    const q = new URLSearchParams(location.search).get('lang'), st = localStorage.getItem('hk-lang');
    lang = LANGS.includes(q) ? q : LANGS.includes(st) ? st : 'ja';
    if (LANGS.includes(q)) localStorage.setItem('hk-lang', q);
  } catch (e) { /* 沒有 localStorage 時用預設語言 */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;
  const IDX = lang === 'en' ? 1 : 0;
  const CJK = /[぀-ヿ㐀-鿿＀-￯]/;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const D = window.HK_I18N_DICT || {};
  const exact = new Map(), tmpl = [], weakTmpl = [];
  for (const k of Object.keys(D)) {
    const v = D[k][IDX]; if (v == null) continue;
    if (k.includes('${')) {
      let src = '', i = 0, lit = 0, cur = '';
      const lits = [];
      while (i < k.length) {
        if (k.startsWith('${', i)) { let d = 1; i += 2; while (i < k.length && d) { d += (k[i] === '{') - (k[i] === '}'); i++; } src += '([\\s\\S]{0,80}?)'; lits.push(cur); cur = ''; }
        else { src += k[i].replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'); lit++; cur += k[i]; i++; }
      }
      lits.push(cur);
      // 1.1.2：固定文字只有 1 個字的樣板（例如兩個欄位中間只隔一個全形／半形空格）太容易誤比對到不相干的字串
      // （例如「${cars} 両編成」被「${sv.line} ${sv.member.dir}」這種樣板搶先命中，變成「8　両編成・全車指定席」這種
      // 半吊子的結果）。這類弱樣板改放到 special() 之後才試，讓 special() 裡寫得比較精確的規則優先命中。
      if (lit >= 2) tmpl.push({ re: new RegExp('^' + src + '$'), to: v, lit, lits });
      else if (lit >= 1) weakTmpl.push({ re: new RegExp('^' + src + '$'), to: v, lit, lits });
    } else exact.set(k, v);
  }
  tmpl.sort((a, b) => b.lit - a.lit);
  const OUT = new Set();             // 自己產生的譯文：不再拿去查表（避免譯文又被當成原文比對）
  const names = new Map();           // 站名・路線名（中文原文 → 目前語言）

  const tryTmpl = (t, list) => {
    for (const m of list) {
      let pos = 0, ok = true;   // 先確認固定文字依序出現（避免昂貴的正規表示式比對）
      for (const L of m.lits) { if (!L) continue; const p = t.indexOf(L, pos); if (p < 0) { ok = false; break; } pos = p + L.length; }
      if (!ok) continue;
      const r = m.re.exec(t); if (!r) continue;
      return m.to.replace(/\{(\d+)\}/g, (_, n) => { const c = r[+n + 1]; if (c == null) return ''; const x = lookup(norm(c)); return x == null ? c : x; });
    }
    return undefined;
  };
  /** 單一字串（已去除前後空白）的翻譯；找不到回傳 null。 */
  function lookup(t) {
    if (exact.has(t)) return exact.get(t);
    if (names.has(t)) return names.get(t);
    let v = tryTmpl(t, tmpl); if (v !== undefined) return v;
    const sp = special(t); if (sp != null) return sp;
    v = tryTmpl(t, weakTmpl); if (v !== undefined) return v;
    return null;
  }
  /** 程式裡用巢狀條件拼出來的幾種句型。 */
  function special(t) {
    let r;
    // 注意：t 已經 norm() 過（全形空格也會被收成半形），下面幾條規則比對用的都是半形空格，不是原始碼裡寫的全形空格。
    if ((r = /^(.+?) ?(\d{1,2}:\d{2}) 以後(?: ?經由 (.+))?$/.exec(t))) {
      const via = r[3] ? tr(r[3]) : '';
      return lang === 'en' ? `${r[1]} ${r[2]} or later${via ? ' · via ' + via : ''}` : `${r[1]}　${r[2]} 以降${via ? '　経由 ' + via : ''}`;
    }
    if ((r = /^(\d{1,2}:\d{2}) 之後的班次(?: ?經由 (.+?))?( ?不搭乘指定席列車)?( ?可利用高速鐵路)?$/.exec(t))) {
      const via = r[2] ? tr(r[2]) : '', nr = r[3] ? (lang === 'en' ? 'avoiding reserved-seat trains' : '指定席列車を使わない') : '';
      // 1.1.0：可利用高速鐵路（r[4]）是前輩新增的查詢條件，照既有 via／nr 的拼接方式加進同一句。
      const hsOk = r[4] ? (lang === 'en' ? 'high-speed rail allowed' : '高速鉄道を利用可') : '';
      return lang === 'en' ? `Trains after ${r[1]}${via ? ' · via ' + via : ''}${nr ? ' · ' + nr : ''}${hsOk ? ' · ' + hsOk : ''}` : `${r[1]} 以降の列車${via ? '　経由 ' + via : ''}${nr ? '　' + nr : ''}${hsOk ? '　' + hsOk : ''}`;
    }
    if ((r = /^(\d+) 分 (.+)$/.exec(t)) && lookup(r[2]) != null) return lang === 'en' ? `${r[1]} min · ${tr(r[2])}` : `${r[1]} 分　${tr(r[2])}`;
    if ((r = /^(\d{1,2}:\d{2}) → (\d{1,2}:\d{2})（翌日）$/.exec(t))) return lang === 'en' ? `${r[1]} → ${r[2]} (next day)` : t;
    if ((r = /^(\d+) 両編成(?:・(.+))?$/.exec(t))) return lang === 'en' ? `${r[1]}-car train${r[2] ? ' · ' + tr(r[2]) : ''}` : null;
    // 1.1.2：路線資訊頁「一天的發車班次」表格的小時刻度（0時、17時……），單獨一個數字＋時，跟「N 時台」不同。
    if ((r = /^(\d{1,2})時$/.exec(t))) return lang === 'en' ? `${r[1]}:00` : null;
    if ((r = /^\+(¥[\d,]+)（合計 (¥[\d,]+)）$/.exec(t))) return lang === 'en' ? `+${r[1]} (total ${r[2]})` : null;
    // 1.1.0：高速鉄道獨立票價查詢的兒童・優待折扣那一格（¥NNN（指定席特急券不打折））。
    if ((r = /^(¥[\d,]+)（指定席特急券不打折）$/.exec(t))) return lang === 'en' ? `${r[1]} (reserved-seat express fee is not discounted)` : `${r[1]}（指定席特急券は割引なし）`;
    if ((r = /^空(\d+)(.*)$/.exec(t))) return lang === 'en' ? `Free ${r[1]}${r[2]}` : `空き ${r[1]}${r[2]}`;
    if ((r = /^(.+?)（約[\s　]*(\d+)[\s　]*分）$/.exec(t))) { const a = tr(r[1]); return lang === 'en' ? `${a} (about ${r[2]} min)` : `${a}（約${r[2]}分）`; }
    if (t.includes('、')) {   // 路線名・方向名・行先の「、」区切り一覧：要素ごとに訳す
      const parts = t.split('、'), tt = parts.map(x => { const v = lookup(norm(x)); return v == null ? x : v; });
      if (tt.some((x, i) => x !== parts[i])) return tt.join(lang === 'en' ? ', ' : '、');
    }
    if ((r = /^(.+?) → (.+)$/.exec(t))) { const a = lookup(r[1]), b = lookup(r[2]); if (a != null || b != null) return (a != null ? a : r[1]) + ' → ' + (b != null ? b : r[2]); }
    // 1.1.2：起訖站選單裡「站名　*高速鉄道」這個標記——站名部分跟其他地方一樣用站名對照表翻，標記本身固定後綴。
    // 注意：這裡的 t 是已經 norm() 過的字串，原本的全形空格已經被 norm() 收成半形空格，所以這裡要比對半形空格。
    if ((r = /^(.+?) \*高速鉄道$/.exec(t))) { const a = lookup(r[1]); const tag = lang === 'en' ? '*High-Speed Rail' : '*高速鉄道'; return (a != null ? a : r[1]) + '　' + tag; }
    return null;
  }
  const tr = s => { const v = lookup(norm(s)); return v == null ? s : v; };

  function fixText(n) {
    const raw = n.nodeValue; if (!raw || !CJK.test(raw)) return;
    if (n.parentElement && n.parentElement.closest('[data-i18n-off]')) return;   /* 1.2.5：車票等自帶日英雙語的區塊，不再被語言切換改寫 */
    const t = norm(raw); if (!t || OUT.has(t)) return;
    const v = lookup(t); if (v == null || v === t) return;
    OUT.add(norm(v));
    const lead = /^\s*/.exec(raw)[0], trail = /\s*$/.exec(raw)[0];
    const nv = lead + v + trail; if (nv !== raw) n.nodeValue = nv;
  }
  const ATTRS = ['title', 'alt', 'aria-label', 'placeholder', 'aria-roledescription', 'label'];
  function fixAttrs(el) {
    for (const a of ATTRS) {
      const raw = el.getAttribute && el.getAttribute(a); if (!raw || !CJK.test(raw)) continue;
      if (el.closest && el.closest('[data-i18n-off]')) continue;
      const t = norm(raw); if (OUT.has(t)) continue; const v = lookup(t); if (v != null && v !== raw) { OUT.add(norm(v)); el.setAttribute(a, v); }
    }
  }
  function scan(root) {
    if (lang === 'zh' || !root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const skip = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/;
    if (root.nodeType === 1) { if (skip.test(root.tagName)) return; fixAttrs(root); }
    const w = document.createTreeWalker(root, 1 | 4, { acceptNode: n => n.nodeType === 1 && skip.test(n.tagName) ? 2 : 1 });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); }
  }
  function fixHead() {
    const t = lookup(norm(document.title)); if (t != null) document.title = t;
    const m = document.querySelector('meta[name="description"]'); if (m) { const v = lookup(norm(m.content)); if (v != null) m.content = v; }
  }
  function startObserver() {
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(scan);
        else if (m.type === 'characterData') fixText(m.target);
        else if (m.type === 'attributes') fixAttrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  /** 英文站名多半是全大寫（HEKURAKOEN-NISHI）→ 首字大寫。 */
  const pretty = s => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : s;
  function addNames(pairs) {
    if (lang !== 'en') return;
    for (const [zh, en] of pairs) if (zh && en && !names.has(zh)) names.set(zh, pretty(String(en).trim()).replace(/內回/g, 'Inner loop').replace(/外回/g, 'Outer loop'));
    setTimeout(() => scan(document.body), 0);
  }
  /** 語言切換鈕（放在最上方細條）。 */
  function addSwitch() {
    const box = document.querySelector('.util .wrap'); if (!box || box.querySelector('.langsw')) return;
    const sw = document.createElement('span'); sw.className = 'langsw'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Language');
    [['ja', '日本語'], ['zh', '中文'], ['en', 'EN']].forEach(([k, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.lang = k === 'zh' ? 'zh-Hant' : k;
      if (k === lang) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => { try { localStorage.setItem('hk-lang', k); } catch (e) { /* 忽略 */ } const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString(); });
      sw.append(b);
    });
    box.append(sw);
  }
  window.HK_I18N = { lang, t: tr, names: addNames, scan, has: s => lookup(norm(s)) != null };
  function init() { addSwitch(); if (lang === 'zh') return; scan(document.body); fixHead(); startObserver(); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
