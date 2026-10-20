#!/usr/bin/env python3
"""產生各頁 HTML（共用的標題、選單、頁尾放在這裡）。用法：python3 tools/make_pages.py"""
import os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAV = [
    ('timetable', 'timetable.html', '時刻表與班次/票價查詢', 'Timetable / Fares', False),
    ('booking', 'booking.html', '線上訂票', 'Online Booking', True),
    ('live', 'live.html', '即時列車動態', 'Train Locator', False),
    ('airport', 'airport.html', '機場聯外交通', 'Airport Access', True),
]
def shell(page, title, body, extra_head='', desc=''):
    nav = []
    for key, href, label, en, soon in NAV:
        cur = ' aria-current="page"' if key == page else ''
        tag = '<span class="soon">準備中</span>' if soon else ''
        nav.append(f'<li><a href="{href}"{cur}>{label}{tag}<span class="en">{en}</span></a></li>')
    nav.append('<li class="admin"><a id="adminlink" href="http://127.0.0.1:8888/hikarise/app/" target="_blank" rel="noopener">企業管理登入<span class="en">Staff Login (ATOS)</span></a></li>')
    return f'''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc or '光瀨都市鉄道 公式網站：時刻表、票價、即時列車動態。（Minecraft 架空鐵路）')}">
<link rel="icon" type="image/png" href="assets/img/mark-light.png">
<link rel="stylesheet" href="assets/css/site.css">
{extra_head}
</head>
<body data-page="{page}">
<div class="util"><div class="wrap"><span>光瀨都市鉄道　公式網站</span><span>Minecraft 架空鐵路</span></div></div>
<header>
  <div class="banner">
    <img class="photo" src="assets/photo/banner.webp" alt="">
    <div class="wrap"><a class="logo-panel" href="index.html" aria-label="光瀨都市鉄道 首頁"><img src="assets/img/logo-dark-960.png" alt="光瀨都市鉄道" width="300" height="78"></a></div>
  </div>
  <nav class="gnav" aria-label="主要選單"><ul>{''.join(nav)}</ul></nav>
</header>
<main>
{body}
</main>
<footer>
  <div class="wrap">
    <img src="assets/img/mark-dark.png" alt="">
    <div class="nav"><a href="timetable.html">時刻表與班次/票價查詢</a><a href="live.html">即時列車動態</a><a href="booking.html">線上訂票（準備中）</a><a href="airport.html">機場聯外交通（準備中）</a></div>
    <div class="copy">© 光瀨都市鉄道　本網站為 Minecraft 架空鐵路「光瀨都市圈」的設定與資訊頁面，內容皆為虛構。</div>
  </div>
</footer>
<script src="assets/js/site-config.js"></script>
<script>try{{var a=document.getElementById('adminlink');if(a&&window.HK_CONFIG&&HK_CONFIG.atosUrl)a.href=HK_CONFIG.atosUrl;}}catch(e){{}}</script>
{{scripts}}
</body>
</html>
'''
SCRIPTS = '''<script src="assets/js/atos-model.js"></script>
<script src="assets/js/hk-core.js"></script>
<script src="assets/js/hk-map.js"></script>
<script src="assets/js/hk-ui.js"></script>
<script src="assets/js/site.js"></script>'''

def write(name, page, title, body, scripts=True, desc=''):
    out = shell(page, title, body, desc=desc).replace('{scripts}', SCRIPTS if scripts else '')
    with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as f: f.write(out)

# ── 首頁 ──
slides = [
  dict(img='assets/photo/ad1.webp', tag='新型列車', h='新2100形　登場', p='2026年10月起投入營運，最高速度 160 公里／小時。連絡機場、通勤名島、勝守、平倉的新選擇！', href='index.html#n1', alt='新2100形'),
  dict(img='assets/photo/ad2.webp', tag='空港LINER', h='空港LINER　增班', p='松澤國際機場～光瀨市區，一車直達，最快只要 11 分鐘！', href='index.html#n2', alt='松澤國際機場'),
  dict(img='assets/photo/ad3.webp', tag='再會，與感謝', h='10000系　退役倒數', p='服務 26 年的 10000系，將於 2026 年底退役。', href='index.html#n3', alt='10000系'),
  dict(img=None, tag='時刻表・票價', h='時刻表與票價改訂', p='尖峰時段班次更密集，服務更方便！', href='timetable.html', alt=''),
]
sl = []
for i, d in enumerate(slides):
    media = f'<img src="{d["img"]}" alt="{d["alt"]}">' if d['img'] else '<div class="plain" aria-hidden="true"><img src="assets/img/mark-dark.png" alt=""></div>'
    more = f'<a class="more" href="{d["href"]}">詳細</a>'
    sl.append(f'<div class="slide{" on" if i == 0 else ""}" role="group" aria-roledescription="slide" aria-label="{i+1} / {len(slides)}">{media}<div class="cap"><span class="tag">{d["tag"]}</span><h2>{d["h"]}</h2><p>{d["p"]}</p>{more}</div></div>')
home = f'''<section class="hero" id="hero" aria-roledescription="carousel" aria-label="最新資訊">
{''.join(sl)}
<div class="hero-ctl"></div>
</section>
<div class="wrap">
  <section class="sec" aria-labelledby="h-find"><h2 id="h-find">時刻表・票價查詢</h2><div class="finder" id="finder"></div></section>
  <div class="cols">
    <section class="sec" aria-labelledby="h-st"><h2 id="h-st">運行情報<small>Service Status</small></h2>
      <table class="tbl" id="status"><thead><tr><th>路線</th><th>運行狀況</th></tr></thead><tbody></tbody></table>
      <p class="note" id="status-note"></p></section>
    <section class="sec" aria-labelledby="h-news"><h2 id="h-news">最新消息<small>News</small></h2><dl class="news" id="news"></dl></section>
  </div>
  <section class="sec" aria-labelledby="h-map"><h2 id="h-map">路線圖<small>Route Map</small></h2><div class="mapbox" id="minimap"></div><p class="note">點選路線圖可前往「即時列車動態」。</p></section>
</div>
<div id="app" hidden></div>'''
write('index.html', 'home', '光瀨都市鉄道', home)

# ── 時刻表 ──
write('timetable.html', 'timetable', '時刻表與班次/票價查詢｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 時刻表與班次/票價查詢</div>
  <div class="pagehead"><h1>時刻表與班次／票價查詢</h1><p>Timetable, Journey Planner and Fares</p></div>
  <div id="app"></div>
</div>''')

# ── 即時 ──
write('live.html', 'live', '即時列車動態｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 即時列車動態</div>
  <div class="pagehead"><h1>即時列車動態</h1><p>Train Locator　依時刻表推算各班次的目前位置（拓樸路線圖）</p></div>
  <div id="app"></div>
</div>''')

def soon(name, page, title, en, msg):
    write(name, page, title + '｜光瀨都市鉄道', f'''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ {title}</div>
  <div class="soonbox"><h2>{title}</h2><p style="margin:0 0 4px;color:var(--muted);font-size:12px;letter-spacing:.1em">{en}</p><p>{msg}</p><p><a class="btn" href="index.html">回到首頁</a></p></div>
</div>''', scripts=False)
soon('booking.html', 'booking', '線上訂票', 'ONLINE BOOKING', '線上訂票系統準備中，敬請期待。')
soon('airport.html', 'airport', '機場聯外交通', 'AIRPORT ACCESS', '機場聯外交通資訊準備中，敬請期待。')
print('ok')
