#!/usr/bin/env python3
"""產生各頁 HTML（共用的標題、選單、頁尾放在這裡）。用法：python3 tools/make_pages.py"""
import os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAV = [
    ('timetable', 'timetable.html', '時刻表・票價', 'Timetable / Fares', False),
    ('routes', 'routes.html', '路線資訊', 'Lines', False),
    ('booking', 'booking.html', '線上訂票', 'Booking', False),
    ('live', 'live.html', '即時列車動態', 'Train Locator', False),
    ('sights', 'sights.html', '沿線景點', 'Sights', False),
    ('guide', 'guide.html', '乘車指南・FAQ', 'Guide / FAQ', False),
    ('airport', 'airport.html', '機場聯外交通', 'Airport', False),
]
def shell(page, title, body, extra_head='', desc=''):
    nav = []
    for key, href, label, en, soon in NAV:
        cur = ' aria-current="page"' if key == page else ''
        tag = '<span class="soon">準備中</span>' if soon else ''
        nav.append(f'<li><a href="{href}"{cur}>{label}{tag}<span class="en">{en}</span></a></li>')
    acur = ' aria-current="page"' if page == 'atos' else ''
    nav.append(f'<li class="admin"><a id="adminlink" href="atos.html"{acur}>企業管理登入<span class="en">Staff Login (ATOS)</span></a></li>')
    return f'''<!doctype html>
<html lang="ja">
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
<div class="util"><div class="wrap"><span>光瀨都市鉄道　公式網站</span><span class="util-sub">Minecraft 架空鐵路</span></div></div>
<header>
  <div class="banner">
    <img class="photo" src="assets/photo/banner.webp" alt="">
    <div class="wrap"><a class="logo-panel" href="index.html" aria-label="光瀨都市鉄道 首頁"><img src="assets/img/logo-dark-960.png" alt="光瀨都市鉄道" width="300" height="78"></a></div>
  </div>
  <nav class="gnav" aria-label="主要選單"><ul>{''.join(nav)}</ul></nav>
</header>
<div id="svcbar" class="svcbar" role="status" hidden></div>
<main>
{body}
</main>
<footer>
  <div class="wrap">
    <img src="assets/img/mark-dark.png" alt="">
    <div class="nav"><a href="timetable.html">時刻表與班次/票價查詢</a><a href="routes.html">路線資訊</a><a href="live.html">即時列車動態</a><a href="booking.html">線上訂票</a><a href="sights.html">沿線景點</a><a href="guide.html">乘車指南與常見問題</a><a href="airport.html">機場聯外交通</a><a href="kobana.html">特急こばな</a></div>
    <div class="copy">© 光瀨都市鉄道　本網站為 Minecraft 架空鐵路「光瀨都市圈」的設定與資訊頁面，內容皆為虛構。</div>
  </div>
</footer>
<script src="assets/js/site-config.js"></script>
<script src="assets/js/i18n-dict.js"></script>
<script src="assets/js/i18n.js"></script>
<script src="assets/js/hk-status.js"></script>
{{scripts}}
</body>
</html>
'''
SCRIPTS = '''<script src="assets/js/atos-model.js"></script>
<script src="assets/js/hk-core.js"></script>
<script src="assets/js/hk-map.js"></script>
<script src="assets/js/layout-seed.js"></script>
<script src="assets/js/hk-ui.js"></script>
<script src="assets/js/booking.js"></script>
<script src="assets/js/pages2.js"></script>
<script src="assets/js/pages3.js"></script>
<script src="assets/js/site.js"></script>'''

def write(name, page, title, body, scripts=True, desc=''):
    out = shell(page, title, body, desc=desc).replace('{scripts}', SCRIPTS if scripts else '')
    with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as f: f.write(out)

# ── 首頁 ──
slides = [
  dict(img='assets/photo/ad2.webp', tag='空港LINER', h='松澤國際機場　一車直達', p='特急・特快直達光瀨市區，最快 11 分鐘。三日券 3,900 円、五日券 4,800 円，可無限次搭乘所有非指定席列車。', href='airport.html', alt='松澤國際機場'),
  dict(img='assets/photo/ad_kobana.webp', tag='新列車　特急', h='特急こばな　登場', p='勝守、天鳥崎、本磯島　一車直達。新 8000 形，最高時速 160 公里，全車指定席，備有 USB 充電口。', href='kobana.html', alt='特急こばな 新8000形'),
  dict(img='assets/photo/ad1.webp', tag='新型列車', h='新2100形　營運開始', p='2026年10月起投入營運，最高時速 160 公里。連結機場，也行駛名島、勝守、平倉方向，通勤與出遊都更從容。', href='index.html#n1', alt='新2100形'),
  dict(img='assets/photo/ad3.webp', tag='感謝與道別', h='10000系　即將退役', p='陪伴大家 26 年的 10000系，預定於 2026 年底退役。歡迎把握最後的乘車機會。', href='index.html#n3', alt='10000系'),
  dict(img=None, tag='時刻表・票價', h='時刻表・票價改訂', p='尖峰時段增加班次，等車時間更短。', href='timetable.html', alt=''),
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
  <section class="sec" aria-labelledby="h-go"><h2 id="h-go">ご案内<small>Guide</small></h2>
    <div class="tiles"><a href="routes.html"><strong>路線資訊</strong><span>各路線的停靠站、所要時間、班距與首末班</span></a><a href="guide.html"><strong>乘車指南與常見問題</strong><span>種別的差別、指定席與自由席、延誤時怎麼辦</span></a><a href="sights.html"><strong>沿線景點</strong><span>光瀨城、勝守漁港、多見瀨河濱公園與更多</span></a><a href="kobana.html"><strong>特急こばな</strong><span>勝守、天鳥崎、本磯島　一車直達</span></a></div></section>
  <div class="cols">
    <section class="sec" aria-labelledby="h-st"><h2 id="h-st">運行情報<small>Service Status</small></h2>
      <table class="tbl" id="status"><thead><tr><th>路線</th><th>運行狀況</th></tr></thead><tbody></tbody></table>
      <p class="note" id="status-note"></p></section>
    <section class="sec" aria-labelledby="h-news"><h2 id="h-news">最新消息<small>News</small></h2><dl class="news" id="news"></dl></section>
  </div>
  <section class="sec" aria-labelledby="h-spot"><h2 id="h-spot">沿線景點<small>Sights</small></h2>
    <div class="spots"><a href="sights.html#castle"><img src="assets/photo/castle1.webp" alt="" loading="lazy"><span>光瀨城<small>船井大島</small></span></a><a href="sights.html#port"><img src="assets/photo/port1.webp" alt="" loading="lazy"><span>勝守漁港<small>勝守</small></span></a><a href="sights.html#shrine"><img src="assets/photo/shrine1.webp" alt="" loading="lazy"><span>天鳥崎神社<small>天鳥崎中央</small></span></a><a href="sights.html#museum"><img src="assets/photo/museum1.webp" alt="" loading="lazy"><span>光瀨市立博物館<small>ひがしいち</small></span></a><a href="sights.html#kuribashi"><img src="assets/photo/kuri1.webp" alt="" loading="lazy"><span>九里橋商圈<small>九里橋三丁目</small></span></a><a href="sights.html#tomise"><img src="assets/photo/tomise1.webp" alt="" loading="lazy"><span>多見瀨河濱公園<small>多見瀨</small></span></a><a href="sights.html#heikura"><img src="assets/photo/heikura1.webp" alt="" loading="lazy"><span>平倉市革命紀念公園<small>平倉公園西・東平倉</small></span></a></div></section>
  <section class="sec" aria-labelledby="h-map"><h2 id="h-map">路線圖<small>Route Map</small></h2><div class="mapbox" id="minimap"></div><p class="note">點選車站，可查看接下來的發車與時刻表；想看列車位置請到「即時列車動態」。</p></section>
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

write('routes.html', 'routes', '路線資訊｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 路線資訊</div>
  <div class="pagehead"><h1>路線資訊</h1><p>Lines　停靠站・所要時間・班距・首末班</p></div>
  <div id="app"></div>
</div>''')
# 發車顯示頁已併入「路線圖」的車站小視窗；保留這個轉址頁，舊連結不會失效
open(os.path.join(ROOT, 'board.html'), 'w', encoding='utf-8').write('''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>發車顯示｜光瀨都市鉄道</title>
<meta http-equiv="refresh" content="0; url=timetable.html?tab=map"><meta name="robots" content="noindex">
<script>var s=new URLSearchParams(location.search).get('s');location.replace('timetable.html?tab=map'+(s?'&s='+encodeURIComponent(s):''));</script></head>
<body><p>發車顯示已移到「<a href="timetable.html?tab=map">路線圖</a>」：點選車站即可查看接下來的發車。</p></body></html>''')
write('sights.html', 'sights', '沿線景點｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 沿線景點</div>
  <div class="pagehead"><h1>沿線景點</h1><p>Sights along the lines</p></div>
  <div id="app"></div>
</div>''')

write('atos.html', 'atos', '企業管理登入｜光瀨都市鉄道', '<div id="app"></div>', scripts=False)
_p = os.path.join(ROOT, 'atos.html'); _t = open(_p, encoding='utf-8').read()
_t = _t.replace('<script src="assets/js/site-config.js"></script>', '<script src="assets/js/site-config.js"></script>\n<script src="assets/js/layout-seed.js"></script>\n<script src="assets/js/hk-ui.js"></script>\n<script src="assets/js/qr.js"></script>\n<script src="assets/js/atos-status.js"></script>')
open(_p, 'w', encoding='utf-8').write(_t)

def soon(name, page, title, en, msg):
    write(name, page, title + '｜光瀨都市鉄道', f'''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ {title}</div>
  <div class="soonbox"><h2>{title}</h2><p style="margin:0 0 4px;color:var(--muted);font-size:12px;letter-spacing:.1em">{en}</p><p>{msg}</p><p><a class="btn" href="index.html">回到首頁</a></p></div>
</div>''', scripts=False)
write('booking.html', 'booking', '線上訂票｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 線上訂票</div>
  <div class="pagehead"><h1>線上訂票</h1><p>Online Booking　特急・特快為全車指定席</p></div>
  <div id="app"></div>
</div>''', scripts=True)
write('airport.html', 'airport', '機場聯外交通｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 機場聯外交通</div>
  <div class="pagehead"><h1>機場聯外交通</h1><p>Airport Access　松澤國際機場</p></div>
  <div id="app"></div>
</div>''')
write('guide.html', 'guide', '乘車指南與常見問題｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 乘車指南與常見問題</div>
  <div class="pagehead"><h1>乘車指南與常見問題</h1><p>Guide and FAQ</p></div>
  <div id="app"></div>
</div>''')
write('kobana.html', 'kobana', '特急こばな｜光瀨都市鉄道', '''<div class="wrap">
  <div class="crumb"><a href="index.html">首頁</a> ＞ 特急こばな</div>
  <div class="pagehead"><h1>特急こばな</h1><p>Limited Express KOBANA　新 8000 形</p></div>
  <div id="app"></div>
</div>''')
print('ok')
