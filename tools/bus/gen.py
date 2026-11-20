import json, math, sys, random
sys.path.insert(0,'/home/claude/work/bus')
from routes import ROUTES, STATION_OF, FIXED, EN
snap=json.load(open(sys.argv[1]))['data']; OUT=sys.argv[2]
ST={}; STEN={}
for x in snap['stations']:
  a,c=x['position1'],x['position2']; p=x['name'].split('|'); n=p[0]
  ST[n]=((a['x']+c['x'])/2,(a['z']+c['z'])/2); STEN[n]=(p[1] if len(p)>1 else '').strip()
def pretty(e):
  return '-'.join(w.capitalize() if w.isupper() else w for w in e.split('-')).replace('Shi','shi') if e else ''
# 各地區的假想町名（漢字, 羅馬字）
POOL={
 'みつせ':[('錦町','Nishiki-chō'),('本町','Hon-machi'),('旭町','Asahi-chō'),('寿町','Kotobuki-chō'),('若宮','Wakamiya'),('千歳町','Chitose-chō'),('弥生町','Yayoi-chō'),('末広町','Suehiro-chō'),('宮前','Miyamae'),('緑町','Midori-chō'),('松葉町','Matsuba-chō'),('桜通','Sakura-dōri'),('大手町','Ōte-machi'),('元町','Moto-machi'),('栄町','Sakae-chō'),('見沼','Minuma'),('浜町','Hama-chō'),('高砂','Takasago')],
 '戸宮':[('戸宮','Tomiya'),('櫻丘','Sakuragaoka'),('石原','Ishihara'),('富士見','Fujimi'),('山王','Sannō'),('野田','Noda'),('稲荷','Inari'),('杉並','Suginami'),('新田','Nitta'),('上原','Uehara'),('大沢','Ōsawa'),('柏木','Kashiwagi')],
 '花倉街道':[('花倉','Hanakura'),('米山','Yoneyama'),('竹ノ内','Takenouchi'),('白山','Hakusan'),('水道町','Suidō-chō'),('若松','Wakamatsu'),('城南','Jōnan'),('堀端','Horibata'),('大島','Ōjima'),('柳原','Yanagihara')],
 '東平倉':[('平倉','Hekura'),('岩田','Iwata'),('東町','Higashi-machi'),('中島','Nakajima'),('八坂','Yasaka'),('瑞穗','Mizuho'),('桂木','Katsuragi'),('上野','Ueno'),('北山','Kitayama'),('柏原','Kashiwabara'),('宮田','Miyata'),('西山','Nishiyama')],
 '谷山':[('谷山','Taniyama'),('浦川','Uragawa'),('天鳥','Tentori'),('佐山','Sayama'),('北倉','Kitakura'),('八幡','Hachiman'),('丸山','Maruyama'),('清水','Shimizu')],
 '白藏山':[('白藏','Shirakura'),('山口','Yamaguchi'),('九里','Kuri'),('見沼','Minuma'),('高見','Takami'),('奥沢','Okusawa'),('杉山','Sugiyama')],
 '紫市':[('紫','Murasaki'),('下坂','Shimosaka'),('大和田','Ōwada'),('若草','Wakakusa'),('工業','Kōgyō'),('桑原','Kuwabara'),('森下','Morishita'),('朝日','Asahi'),('紺屋町','Kon\'ya-machi'),('藤見','Fujimi')],
 '名島港':[('名島','Najima'),('港町','Minato-machi'),('さくら台','Sakuradai'),('尾羽','Obane'),('潮見','Shiomi'),('汐入','Shioiri'),('船町','Funa-machi'),('松沢','Matsuzawa'),('灯台','Tōdai'),('浜田','Hamada')],
 '勝守':[('勝守','Katsumori'),('水沢','Mizusawa'),('古道','Furumichi'),('みどり野','Midorino'),('川跡','Kawaato'),('高原','Kōgen'),('石塚','Ishizuka'),('鶴巻','Tsurumaki'),('原町','Hara-machi'),('仲町','Naka-machi')],
 '十万浦市':[('十万浦','Jūmanura'),('曲江','Magarie'),('新浦','Shin\'ura'),('浦津','Uratsu'),('荒木','Araki'),('天鳥','Tentori'),('磯町','Iso-machi'),('網元','Amimoto'),('漁港','Gyokō'),('千鳥','Chidori')],
 '上羽神別':[('神別','Kamibetsu'),('上羽','Kamihane'),('宮下','Miyashita'),('鹿島','Kashima'),('清音','Seion'),('柳沢','Yanagisawa'),('大畑','Ōhata'),('桜井','Sakurai'),('温泉','Onsen'),('湯ノ沢','Yunosawa')],
}
SUF=[('一丁目','1-chōme'),('二丁目','2-chōme'),('三丁目','3-chōme'),('橋','-bashi'),('公園前','Park'),('小學校前','Elementary School'),('郵便局前','Post Office'),('入口','Iriguchi'),('中央','Chūō'),('團地','Danchi'),('神社前','Shrine'),('商店街','Shopping Street'),('東','Higashi'),('西','Nishi'),('台','-dai'),('坂上','Sakaue'),('四丁目','4-chōme'),('交番前','Police Box'),('市民センター','Community Center'),('病院前','Hospital')]
used=set(n for R in ROUTES for n in R['seq'])
NAMEEN={}
def en_of(base_en, suf_en):
  if suf_en.startswith('-'): return base_en+suf_en
  if suf_en in ('Higashi','Nishi'): return suf_en+'-'+base_en
  return base_en+' '+suf_en
rng=random.Random(20261121)
# 2.10.1：和車站同名／同地名（例：浦津、荒木）的站牌，必須在那個車站 2 km 以內（地名跟著聚落走）
_k=lambda c:'\u4e00'<=c<='\u9fff' or c=='々'
GENERIC={'中央','病院','病院前','大學','公園','高校','團地','前'}
STEMS={}
for n,pp in ST.items():
  for part in n.split('/'):
    for stem in ([part]+([part[:2]] if len(part)>=3 and all(_k(c) for c in part[:2]) else [])):
      if len(stem)>=2 and stem not in GENERIC: STEMS.setdefault(stem.replace('瀬','瀨'),[]).append(pp)
def far_name(nm,p):
  m=nm.replace('瀬','瀨')
  return any(stem in m and min(math.dist(p,q) for q in qs)>2000 for stem,qs in STEMS.items())
def filler(hub,p=None):
  pool=POOL.get(hub) or POOL['みつせ']
  for _ in range(4000):
    b=rng.choice(pool); s=rng.choice(SUF)
    nm=b[0]+s[0] if not (s[0] in ('東','西')) else b[0]+s[0]
    if nm in used or nm in ST: continue
    if p is not None and far_name(nm,p): continue
    used.add(nm); NAMEEN[nm]=en_of(b[1],s[1]); return nm
  raise Exception('pool exhausted '+hub)
HUBXY={h:ST[h] for h in ['みつせ','戸宮','花倉街道','東平倉','谷山','白藏山','紫市','名島港','勝守','十万浦市','上羽神別']}
def area(p):
  return min(HUBXY,key=lambda h:math.dist(HUBXY[h],p))
POS={}   # stop name -> (x,z)
for k,v in FIXED.items():
  if v: POS[k]=v
def anchor(n):
  s=STATION_OF.get(n,n)
  if n in POS: return POS[n]
  if s in ST:
    off={'みつせ車站東口':(70,0),'みつせ車站西口':(-70,0),'戸宮車站西口':(-60,0),'新光瀨站前':(0,40)}.get(n,(0,0))
    return (ST[s][0]+off[0],ST[s][1]+off[1])
  return None
SEG={}  # (a,b) -> fillers list (shared between routes that share the same key pair)
# 2.10.1：放射狀的次要路線（1 小時 1 班）。從各核心站往「現有路線還沒有去的方向」延伸，
# 讓核心站的路線數達到目標（みつせ・戸宮 10 條，其他 6 條）。終點用假想的團地・ニュータウン等地名。
from routes import SECONDARY
TSUF=[('團地','Danchi'),('ニュータウン','New Town'),('車庫前','Depot'),('高校前','High School'),('台','-dai'),('工業団地','Industrial Park'),('霊園前','Cemetery'),('営業所前','Bus Office'),('ヶ丘','-gaoka'),('運動公園','Sports Park'),('温泉','Onsen'),('ゴルフ場前','Golf Course')]
srng=random.Random(4096)
ROUTES=list(ROUTES)
def known_pos(n):
  if n in FIXED and FIXED[n]: return FIXED[n]
  return anchor(n)
for hub,(hstops,target,prefix) in SECONDARY.items():
  hp=ST[hub]
  serving=[R for R in ROUTES if any(x in R['seq'] for x in hstops)]
  ang=[]
  for R in serving:
    sq=R['seq']
    for i,x in enumerate(sq):
      if x not in hstops: continue
      for j in (i-1,i+1):
        if 0<=j<len(sq):
          q=known_pos(sq[j])
          if q and math.dist(q,hp)>50: ang.append(math.atan2(q[1]-hp[1],q[0]-hp[0]))
  nos=[int(R['no']) for R in ROUTES if R['no'].isdigit() and int(R['no'])//100==prefix]
  nxt=max(nos)+1 if nos else prefix*100+1
  k=0
  while len(serving)+k<target:
    cands=[math.radians(d) for d in range(0,360,15)]
    angd=lambda a,b:abs((a-b+math.pi)%(2*math.pi)-math.pi)
    best=max(cands,key=lambda c:(min([angd(c,e) for e in ang] or [9]), srng.random()))
    ang.append(best)
    D=srng.uniform(2300,3900)
    tp=(hp[0]+math.cos(best)*D, hp[1]+math.sin(best)*D)
    hs=hstops[k%len(hstops)]
    for _ in range(500):
      b=srng.choice(POOL.get(hub) or POOL['みつせ']); t=srng.choice(TSUF)
      nm=b[0]+t[0]
      if nm in used or nm in ST or far_name(nm,tp): continue
      break
    used.add(nm); NAMEEN[nm]=en_of(b[1],t[1]); FIXED[nm]=tp; POS[nm]=tp
    n=max(6,min(14,round(D/330)+1))
    ROUTES.append(dict(no=str(nxt),hub=hub,n=n,seq=[hs,nm],hw=60,minor=True))
    nxt+=1; k+=1
routes_out=[]
ORDER=sorted(ROUTES,key=lambda R:(R['n']-len(R['seq']))/max(1,len(R['seq'])))
for R in ORDER:
  seq=R['seq'][:]
  loop=R.get('loop',False)
  # 1) key stop positions (interpolate unknown)
  pts=[anchor(n) for n in seq]
  known=[i for i,p in enumerate(pts) if p]
  for i,p in enumerate(pts):
    if p: continue
    prv=max([k for k in known if k<i],default=None); nxt=min([k for k in known if k>i],default=None)
    if prv is not None and nxt is not None:
      t=(i-prv)/(nxt-prv); pts[i]=(pts[prv][0]+(pts[nxt][0]-pts[prv][0])*t, pts[prv][1]+(pts[nxt][1]-pts[prv][1])*t)
    elif prv is not None:
      q=pts[prv]; r=pts[known[known.index(prv)-1]] if known.index(prv)>0 else (q[0]-1,q[1])
      d=math.dist(q,r) or 1; pts[i]=(q[0]+(q[0]-r[0])/d*400*(i-prv), q[1]+(q[1]-r[1])/d*400*(i-prv))
    else:
      q=pts[nxt]; r=pts[known[1]] if len(known)>1 else (q[0]+1,q[1])
      d=math.dist(q,r) or 1; pts[i]=(q[0]+(q[0]-r[0])/d*400*(nxt-i), q[1]+(q[1]-r[1])/d*400*(nxt-i))
    POS.setdefault(seq[i],pts[i]); pts[i]=POS[seq[i]]
  for n,p in zip(seq,pts): POS.setdefault(n,p)
  pts=[POS[n] for n in seq]
  # 2) fillers per segment
  segs=list(range(len(seq)-1+(1 if loop else 0)))
  need=R['n']-len(seq)
  pairs=[(seq[i],seq[(i+1)%len(seq)]) for i in segs]
  dist=[math.dist(pts[i],pts[(i+1)%len(seq)]) for i in segs]
  cnt=[None]*len(segs)
  for j,(a,b) in enumerate(pairs):
    key=tuple(sorted((a,b)))
    if key in SEG: cnt[j]=len(SEG[key][1])
  free=[j for j in range(len(segs)) if cnt[j] is None]
  rem=need-sum(c for c in cnt if c is not None)
  if rem<0: raise Exception(f"{R['no']}: shared fillers exceed")
  if R.get('express'): rem=0
  # distribute rem over free segs by distance (largest remainder)
  tot=sum(dist[j] for j in free) or 1
  raw={j:rem*dist[j]/tot for j in free}
  base={j:int(raw[j]) for j in free}
  left=rem-sum(base.values())
  for j in sorted(free,key=lambda j:raw[j]-base[j],reverse=True)[:left]: base[j]+=1
  for j in free: cnt[j]=base[j]
  stops=[]
  for j in segs:
    a,b=pairs[j]; key=tuple(sorted((a,b)))
    if key not in SEG:
      pa,pb=POS[a],POS[b]; k=cnt[j]
      lst=[]
      for m in range(k):
        t=(m+1)/(k+1); p=(pa[0]+(pb[0]-pa[0])*t, pa[1]+(pb[1]-pa[1])*t)
        nm=filler(area(p),p); POS[nm]=p; lst.append(nm)
      SEG[key]=(a,lst)
    first,lst=SEG[key]
    mids=lst if first==a else lst[::-1]
    stops.append(a); stops.extend(mids)
  if not loop: stops.append(seq[-1])
  assert len(stops)==R['n'], (R['no'],len(stops),R['n'])
  # 3) minutes per segment
  speed=420 if R.get('express') else 260   # m/min（含停站）
  ring=stops+([stops[0]] if loop else [])
  t=[max(1,round(math.dist(POS[ring[i]],POS[ring[i+1]])/speed)) for i in range(len(ring)-1)]
  routes_out.append(dict(no=R['no'],hub=R['hub'],loop=loop,express=R.get('express',False),name=R.get('name',''),stops=stops,t=t,**({'hw':R['hw'],'minor':True} if R.get('hw') else {})))
# stops
stops_out={}
for n,p in POS.items():
  s=STATION_OF.get(n,n)
  link=s if s in ST and any(True for _ in [0]) else None
  en=EN.get(n) or NAMEEN.get(n) or pretty(STEN.get(n,''))
  stops_out[n]=dict(x=round(p[0]),z=round(p[1]),en=en,**({'st':link} if link else {}))
used_names=set(x for r in routes_out for x in r['stops'])
stops_out={k:v for k,v in stops_out.items() if k in used_names}
data=dict(v='2.10.1',fare=dict(base=100,step=20,per=5),
  hours=dict(first=240,last=1470,bands=[[0,360,45],[360,540,15],[540,900,30],[900,1140,15],[1140,1500,45]]),
  stops=stops_out,routes=routes_out)
json.dump(data,open(OUT,'w'),ensure_ascii=False,separators=(',',':'))
routes_out.sort(key=lambda r:int(r['no']))
for r in routes_out: print(r['no'],len(r['stops']),sum(r['t']),'分',' - '.join(r['stops']))
print('stops',len(stops_out))
