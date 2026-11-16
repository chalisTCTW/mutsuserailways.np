# v9.0：デザイン方向B（写真と1色）。共通ヘッダーを差し替え、トップの構成を変更する。
import re,glob,io
BRAND='<a class="sh-brand" href="index.html" aria-label="光瀨都市鉄道 首頁"><img src="assets/img/mark-dark.png" alt="" width="30" height="34"><span>光瀨都市鉄道</span></a>'
MENU=('<button class="sh-menu" type="button" aria-expanded="false" aria-controls="gnav" aria-label="選單"><span></span></button>')
SCRIPT=('<script>(function(){var h=document.querySelector("header.sh");if(!h)return;var b=h.querySelector(".sh-menu");if(!b)return;'
 'function set(o){h.classList.toggle("open",o);b.setAttribute("aria-expanded",o?"true":"false")}'
 'b.addEventListener("click",function(){set(!h.classList.contains("open"))});'
 'h.addEventListener("click",function(e){if(e.target.closest&&e.target.closest(".gnav a"))set(false)});'
 'document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});})();</script>')
n=0
for f in sorted(glob.glob('*.html')):
    s=open(f,encoding='utf-8').read()
    m=re.search(r'<div class="util">.*?</div></div>\s*<header>.*?</header>',s,re.S)
    if not m: print('skip',f); continue
    blk=m.group(0)
    nav=re.search(r'<nav class="gnav".*?</nav>',blk,re.S).group(0)
    nav=nav.replace('<nav class="gnav"','<nav class="gnav" id="gnav"',1)
    new=('<header class="sh"><div class="sh-in">'+BRAND+nav+'<div class="util"><div class="wrap"></div></div>'+MENU+'</div></header>\n'+SCRIPT)
    s=s.replace(blk,new)
    if f=='index.html':
        # 運行情報の帯をヒーローの直下へ
        sv=re.search(r'<div id="svcbar".*?</div>\n',s,re.S)
        if sv:
            s=s.replace(sv.group(0),'')
            s=s.replace('<div class="hero-ctl"></div>\n</section>','<div class="hero-ctl"></div>\n</section>\n'+sv.group(0),1)
    open(f,'w',encoding='utf-8').write(s); n+=1; print('ok',f)
print(n)
