/* atos-status.js — 「企業管理登入」頁：確認 ATOS 是否上線，並提供手機／電腦／其他裝置的連結按鈕（含 QR code）。 */
(function () {
  'use strict';
  const HK = window.HK, { h, s } = HK, C = window.HK_CONFIG || {}, ST = Object.assign({ repo: '', branch: 'atos-status', path: 'status.json', onlineWithinSec: 180, pollSec: 60 }, C.atosStatus || {});
  const app = document.getElementById('app');

  function qrSvg(text, px) {
    const q = window.ATOS && window.ATOS.qr ? window.ATOS.qr(text) : null; if (!q) return h('span', null, '（QR code 無法產生）');
    const quiet = 2, n = q.n + quiet * 2, svg = s('svg', { viewBox: `0 0 ${n} ${n}`, width: px, height: px, role: 'img', 'aria-label': 'QR code', shapeRendering: 'crispEdges' });
    svg.append(s('rect', { width: n, height: n, fill: '#fff' }));
    let d = ''; for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) if (q.get(r, c)) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
    svg.append(s('path', { d, fill: '#12302a' })); return svg;
  }
  async function fetchStatus() {
    const api = `https://api.github.com/repos/${ST.repo}/contents/${ST.path}?ref=${encodeURIComponent(ST.branch)}`;
    try {
      const r = await fetch(api, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
      if (r.ok) { let now = Date.now(); try { const d = r.headers.get('date'); if (d) now = new Date(d).getTime() || now; } catch (e) { } return { j: await r.json(), now }; }
      if (r.status === 404) return { missing: true };
    } catch (e) { /* 改用 raw */ }
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${ST.repo}/${ST.branch}/${ST.path}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) return { j: await r.json(), now: Date.now() }; if (r.status === 404) return { missing: true };
    } catch (e) { /* 失敗 */ }
    return { error: true };
  }
  const ago = ms => { const m = Math.round(ms / 60000); return m < 1 ? '1 分鐘內' : m < 60 ? `${m} 分鐘前` : m < 2880 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`; };
  const fmt = ms => { const d = new Date(ms + (C.tzOffsetSec != null ? C.tzOffsetSec : 8 * 3600) * 1000), p = n => String(n).padStart(2, '0'); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };

  const box = h('div', { class: 'as-box' }), out = h('div');
  app.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'crumb' }, h('a', { href: 'index.html' }, '首頁'), ' ＞ 企業管理登入'),
    h('div', { class: 'pagehead' }, h('h1', null, '企業管理登入'), h('p', null, 'Staff Login　ATOS（自動列車運行管理系統）')), box, out));
  let timer = 0, last = null;

  function linkBtn(label, url, cls, sub) {
    return h('a', { class: 'btn as-go ' + (cls || ''), href: url, target: '_blank', rel: 'noopener' }, h('b', null, label), sub ? h('small', null, sub) : null);
  }
  function copyBtn(url) { const b = h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(url); b.textContent = '已複製'; setTimeout(() => b.textContent = '複製網址', 1500); } catch (e) { window.prompt('複製網址', url); } } }, '複製網址'); return b; }

  function render(res) {
    last = res; out.replaceChildren();
    let online = false, j = null, ageMs = null;
    if (res && res.j) { j = res.j; ageMs = Math.max(0, res.now - (j.updatedAt || 0)); online = !!j.online && ageMs < ST.onlineWithinSec * 1000; }
    const fixed = (C.atosFixedUrls || []);
    const head = h('div', { class: 'as-head ' + (online ? 'on' : 'off') },
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('div', null, h('strong', null, online ? 'ATOS系統運作中' : '未上線'),
        h('small', null, online ? `最後確認 ${fmt(j.updatedAt)}（${ago(ageMs)}）　ATOS ${j.version || ''}` :
          res && res.error ? '無法確認狀態（網路或 GitHub 連線問題）。稍後再試。' :
          j ? `遊戲／ATOS 目前沒有運作。最後確認 ${fmt(j.updatedAt)}（${ago(ageMs)}）` : res && res.missing ? '尚未收到過 ATOS 的狀態回報。' : '確認中…')),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => check() }, '重新確認'));
    box.replaceChildren(head);
    const urls = (j && j.urls) || {}, vpn = urls.vpn || [], lan = urls.lan || [], local = urls.local;
    const phones = [];
    vpn.forEach(u => phones.push({ label: '手機（Tailscale）', url: u, sub: '外出時也能使用' }));
    fixed.filter(f => f.kind === 'phone' && !vpn.includes(f.url)).forEach(f => phones.push({ label: '手機', url: f.url, sub: f.label }));
    lan.forEach(u => phones.push({ label: '手機（同一 Wi-Fi）', url: u, sub: '在遊戲電腦的同一個區網時' }));
    const dis = !online;
    const grid = h('div', { class: 'as-grid' });
    const card = (title, desc, body) => h('section', { class: 'as-card' + (dis ? ' dis' : '') }, h('h2', null, title), h('p', { class: 'desc' }, desc), body);
    // 手機
    const phoneBody = h('div');
    if (phones.length) {
      const first = phones[0];
      phoneBody.append(h('div', { class: 'as-qr' }, qrSvg(first.url, 148), h('div', null, linkBtn(first.label, first.url, dis ? 'disabled' : '', first.sub), h('div', { style: 'margin-top:8px' }, copyBtn(first.url)), h('p', { class: 'note' }, '用手機相機掃描，或直接點按鈕。'))));
      phones.slice(1).forEach(p => phoneBody.append(h('div', { class: 'as-row' }, linkBtn(p.label, p.url, dis ? 'disabled' : '', p.sub), copyBtn(p.url))));
    } else phoneBody.append(h('p', { class: 'note' }, online ? '這次沒有收到可用的手機連線位址。' : '遊戲開啟後會顯示手機用的連結。'));
    grid.append(card('手機', '在手機上開啟 ATOS。', phoneBody));
    // 電腦
    grid.append(card('電腦', '在執行遊戲的這台電腦上開啟 ATOS（127.0.0.1）。', h('div', null, linkBtn('電腦（本機）', local || (C.atosUrl || 'http://127.0.0.1:8888/hikarise/app/'), dis ? 'disabled' : '', '只有遊戲所在的電腦打得開'))));
    // 其他裝置
    const others = [...lan.map(u => ({ label: '區網', url: u })), ...vpn.map(u => ({ label: 'Tailscale', url: u }))];
    grid.append(card('其他裝置', '其他電腦、平板：與遊戲電腦在同一區網或同一個 Tailscale 網路時可用。', h('div', null,
      others.length ? others.map(o => h('div', { class: 'as-row' }, linkBtn(o.label, o.url, dis ? 'disabled' : '', o.url.replace(/^http:\/\//, '').replace(/\/hikarise.*/, '')), copyBtn(o.url))) : h('p', { class: 'note' }, j && j.ipsShared === false ? '位址回報已關閉（heartbeat.ips=off）。請使用上面既有的連結。' : '遊戲開啟後會顯示。'))));
    out.append(grid);
    out.append(h('div', { class: 'as-note' },
      h('p', null, '• 狀態每 ' + ST.pollSec + ' 秒自動更新；ATOS 每分鐘回報一次，超過 ' + Math.round(ST.onlineWithinSec / 60) + ' 分鐘沒有回報就視為未上線。'),
      h('p', null, '• 這個頁面只負責「找到入口」；連線是直接從你的裝置連到遊戲所在的電腦。' + (j && j.authRequired ? '其他裝置連線時需要輸入 ATOS 的存取密碼。' : '')),
      dis && fixed.length ? h('p', null, '• 遊戲未開啟時，下面連結即使點了也打不開：', fixed.map(f => h('a', { href: f.url, target: '_blank', rel: 'noopener', style: 'margin-left:6px' }, f.label))) : null));
  }
  async function check() { render(last && last.j ? Object.assign({}, last) : null); const r = await fetchStatus(); render(r); }
  render(null); check();
  timer = setInterval(() => { if (!document.hidden) check(); }, Math.max(20, ST.pollSec) * 1000);
})();
