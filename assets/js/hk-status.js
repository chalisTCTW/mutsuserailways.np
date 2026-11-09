/* hk-status.js — 全頁共用的「營運狀況列」。資料來自 ATOS 的心跳回報（atos-status 分支的 status.json 裡的 service）。
 * 顯示：全線平常運轉／部分路線延誤／有列車停車中／沒有即時資料。ATOS 沒回報時不假裝平常運轉。 */
(function () {
  'use strict';
  const C = window.HK_CONFIG || {}, ST = Object.assign({ repo: '', branch: 'atos-status', path: 'status.json', onlineWithinSec: 180, pollSec: 60 }, C.atosStatus || {});
  const bar = document.getElementById('svcbar'); if (!bar || !ST.repo) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const KEY = 'hk-atos-status-v1';

  async function fetchStatus() {
    try {   // 同一個瀏覽器分頁裡換頁時，45 秒內直接用上次的結果（避免超過 GitHub 的匿名 API 次數限制）
      const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.at < 45000) return c.res;
    } catch (e) { /* 忽略 */ }
    let res = { error: true };
    try {
      const r = await fetch(`https://api.github.com/repos/${ST.repo}/contents/${ST.path}?ref=${encodeURIComponent(ST.branch)}`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
      if (r.ok) { let now = Date.now(); try { const d = r.headers.get('date'); if (d) now = new Date(d).getTime() || now; } catch (e) { /* 忽略 */ } res = { j: await r.json(), now }; }
      else if (r.status === 404) res = { missing: true };
      else throw new Error('api ' + r.status);
    } catch (e) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${ST.repo}/${ST.branch}/${ST.path}?t=${Date.now()}`, { cache: 'no-store' });
        if (r.ok) res = { j: await r.json(), now: Date.now() }; else if (r.status === 404) res = { missing: true };
      } catch (e2) { /* 維持 error */ }
    }
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), res })); } catch (e) { /* 忽略 */ }
    return res;
  }
  const hhmm = ms => { const d = new Date(ms + (C.tzOffsetSec != null ? C.tzOffsetSec : 8 * 3600) * 1000), p = n => String(n).padStart(2, '0'); return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); };

  function render(res) {
    let level = 'unknown', main = '目前沒有即時資料（ATOS 未連線）', parts = [], at = null;
    const j = res && res.j;
    if (j) {
      const age = Math.max(0, res.now - (j.updatedAt || 0));
      if (j.online && age < ST.onlineWithinSec * 1000) {
        at = j.updatedAt;
        const s = j.service;
        if (!s) { level = 'idle'; main = 'ATOS 系統運作中'; }   // 舊版 ATOS 沒有 service：只知道系統在運作，不宣稱平常運轉
        else if (!s.trains) { level = 'idle'; main = '目前沒有運行中的列車'; }
        else if (s.stalled > 0) level = 'stop', main = '有列車停車中';
        else if (s.delayed > 0) level = 'delay', main = '部分路線發生延誤';
        else level = 'ok', main = '全線平常運轉';
        if (s && (s.delayed > 0 || s.stalled > 0)) {
          const bad = (s.routes || []).filter(r => r.delayed > 0 || r.stalled > 0).sort((a, b) => (b.stalled - a.stalled) || (b.maxDelaySec - a.maxDelaySec));
          parts = bad.slice(0, 3).map(r => ({ name: r.name, delayed: r.delayed, stalled: r.stalled, min: Math.max(1, Math.round(r.maxDelaySec / 60)) }));
          if (bad.length > 3) parts.push({ more: bad.length - 3 });
        }
      }
    }
    bar.className = 'svcbar ' + level; bar.hidden = false;
    bar.replaceChildren();
    const wrap = el('div', 'wrap');
    wrap.append(el('span', 'svc-badge', 'ATOS 運行情報'), el('strong', 'svc-main', main));
    const list = el('span', 'svc-list');
    for (const p of parts) {
      if (p.more) { list.append(el('span', 'svc-more', '…+' + p.more)); continue; }
      const it = el('span', 'svc-item'); it.append(el('b', null, p.name));
      if (p.stalled > 0) it.append(el('span', null, `停車 ${p.stalled} 班`));
      if (p.delayed > 0) it.append(el('span', null, `誤點 ${p.delayed} 班`), el('span', null, `最長 ${p.min} 分`));
      list.append(it);
    }
    if (parts.length) wrap.append(list);
    if (at) wrap.append(el('span', 'svc-at', `更新 ${hhmm(at)}`));
    const a = el('a', 'svc-more-link', '詳細'); a.href = 'live.html'; wrap.append(a);
    bar.append(wrap);
    if (window.HK_I18N) window.HK_I18N.scan(bar);
  }
  async function tick() { render(await fetchStatus()); }
  tick(); setInterval(tick, Math.max(60, ST.pollSec) * 1000);
})();
