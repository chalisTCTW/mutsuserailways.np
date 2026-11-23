import json, random
H=[
 dict(id='r1-shiozaki',name='ホテルR-1汐崎',stars=3,area='汐崎',station='汐崎',dist=154,marks=[],brand='r1'),
 dict(id='r1-katsumori',name='ホテルR-1勝守',stars=3,area='勝守',station='勝守',dist=591,marks=[['勝守漁港',211]],brand='r1'),
 dict(id='toyoko-katsumori',name='東橫INN勝守站前',stars=3,area='勝守',station='勝守',dist=251,marks=[],brand='toyoko'),
 dict(id='mitsustay-murasaki',name='MITSUSTAY紫市',stars=4,area='紫市',station='紫市',dist=67,marks=[],brand='mitsustay',note='紫市站共構大樓'),
 dict(id='prince-mitsuse',name='王子飯店見津瀬通口',stars=3,area='みつせ',station='みつせ',dist=177,marks=[],brand='prince'),
 dict(id='mitsustay-pro',name='MITSUSTAY PRO',stars=5,area='みつせ',station='みつせ',dist=43,marks=[],brand='pro',note='みつせ站東口直結'),
 dict(id='mystay-mitsuse',name='ホテルMYSTAYみつせ西口',stars=3,area='みつせ',station='みつせ',dist=417,marks=[['流星樹',295]],brand='mystay'),
 dict(id='prince-tomiya',name='王子飯店戸宮',stars=3,area='戸宮',station='戸宮',dist=109,marks=[],brand='prince'),
 dict(id='granplaza-kurihashi',name='GRANPLAZA九里橋',stars=5,area='九里橋',station='九里橋三丁目',dist=88,marks=[['九里橋神社',355]],brand='gran'),
 dict(id='toyoko-shirakura',name='東橫INN白藏站前',stars=3,area='白藏山',station='白藏山',dist=345,marks=[],brand='toyoko'),
 dict(id='kiya-kitakurama',name='樹屋HOTEL',stars=3,area='北倉間',station='北倉間',dist=123,marks=[['真跡主教教堂',276]],brand='kiya'),
]
B={
 'r1':dict(kind='商務旅館',fac=['大浴場','免費自助早餐','免費 Wi-Fi','投幣洗衣','停車場（收費）'],ci='15:00',co='10:00',
   rooms=[('シングル',(12,14),'單人床 ×1',1,(6200,7400)),('セミダブル',(13,15),'加寬單人床 ×1',2,(7200,8600)),('ダブル',(15,17),'雙人床 ×1',2,(8600,10200)),('ツイン',(19,22),'單人床 ×2',2,(10800,12800))],
   plans=[('素泊まり',0),('朝食付き（無料バイキング）',0)],desc='附大浴場的連鎖商務旅館，早上的自助早餐免費。出差與鐵道旅行都方便。'),
 'toyoko':dict(kind='商務旅館',fac=['免費早餐','免費 Wi-Fi','投幣洗衣','行李寄放'],ci='15:00',co='10:00',
   rooms=[('シングル',(11,12),'單人床 ×1',1,(5600,6800)),('エコノミーダブル',(11,13),'加寬單人床 ×1',2,(6400,7600)),('ダブル',(13,15),'雙人床 ×1',2,(7600,8800)),('ツイン',(16,18),'單人床 ×2',2,(9600,11200))],
   plans=[('朝食付き（無料）',0)],desc='車站前的連鎖商務旅館，房價實惠、附免費早餐，所有房型格局一致，住起來安心。'),
 'mitsustay':dict(kind='城市飯店',fac=['車站直結','餐廳＆酒吧','健身房','免費 Wi-Fi','禁菸客房','24 小時櫃台'],ci='15:00',co='11:00',
   rooms=[('スーペリアダブル',(19,22),'雙人床 ×1',2,(13800,16500)),('スーペリアツイン',(23,26),'單人床 ×2',2,(15800,18800)),('デラックスツイン',(28,32),'加大單人床 ×2',3,(20500,24800)),('コーナーデラックス',(33,36),'加大雙人床 ×1',2,(26000,31000))],
   plans=[('素泊まり',0),('朝食付き',2200),('早割28（28 日前・不可退款）',-1800)],desc='與紫市站共構大樓一體的城市飯店，下雨天也不用撐傘就能進站。高樓層客房可眺望紫市街景。'),
 'pro':dict(kind='高級飯店',fac=['みつせ站直結','行政酒廊','頂樓餐廳','室內泳池','SPA','禮賓服務','代客泊車'],ci='15:00',co='12:00',
   rooms=[('デラックスキング',(36,40),'特大雙人床 ×1',2,(32000,38000)),('プレミアツイン',(40,44),'加大單人床 ×2',3,(36000,43000)),('エグゼクティブ（ラウンジ利用付）',(44,48),'特大雙人床 ×1',2,(48000,56000)),('MITSUSTAY PRO スイート',(86,96),'特大雙人床 ×1＋客廳',4,(98000,126000))],
   plans=[('素泊まり',0),('朝食付き',3800),('2 食付き（頂樓餐廳晚餐）',14000)],desc='みつせ站東口直結的旗艦飯店。所有客房都在 20 樓以上，可俯瞰光瀨市區與鐵道路線。'),
 'prince':dict(kind='城市飯店',fac=['餐廳','宴會廳','免費 Wi-Fi','24 小時櫃台','停車場（收費）'],ci='14:00',co='11:00',
   rooms=[('スタンダードダブル',(16,18),'雙人床 ×1',2,(9800,11800)),('スタンダードツイン',(21,24),'單人床 ×2',2,(12200,14500)),('モデレートツイン',(25,28),'加大單人床 ×2',3,(14800,17600))],
   plans=[('素泊まり',0),('朝食付き',1900)],desc='保留古典外觀的老牌飯店，一樓有咖啡廳與餐廳，散步到車站只要幾分鐘。'),
 'mystay':dict(kind='商務旅館',fac=['免費 Wi-Fi','微波爐','投幣洗衣','行李寄放'],ci='15:00',co='11:00',
   rooms=[('スタンダードダブル',(13,15),'雙人床 ×1',2,(7400,8900)),('コンパクトツイン',(17,19),'單人床 ×2',2,(9200,10900)),('デラックスダブル',(19,21),'加大雙人床 ×1',2,(10600,12400))],
   plans=[('素泊まり',0),('朝食付き（提携カフェ）',1200)],desc='みつせ西口的小型飯店，走路就能到流星樹，適合想把行李放下、輕鬆逛街的旅客。'),
 'gran':dict(kind='高級飯店',fac=['日式庭園','SPA＆大浴場','室內泳池','法式餐廳','日本料理','行政酒廊','代客泊車'],ci='15:00',co='12:00',
   rooms=[('デラックスツイン',(38,42),'加大單人床 ×2',3,(34000,40000)),('プレミアキング（神社ビュー）',(43,47),'特大雙人床 ×1',2,(40000,47000)),('ジュニアスイート',(60,68),'特大雙人床 ×1＋起居區',3,(62000,72000)),('グランスイート',(110,130),'特大雙人床 ×1＋客廳＋和室',5,(140000,168000))],
   plans=[('素泊まり',0),('朝食付き',4200),('2 食付き（日本料理）',16000),('九里橋神社 早朝参拝付き',5200)],desc='九里橋三丁目的地標玻璃塔，高樓層可遠眺九里橋神社。館內有日式庭園與 SPA，是光瀨最具代表性的度假型都市飯店。'),
 'kiya':dict(kind='設計旅店',fac=['咖啡廳＆麵包坊','共用廚房','免費 Wi-Fi','自行車租借','禁菸客房'],ci='15:00',co='10:00',
   rooms=[('樹屋スタンダード',(15,17),'雙人床 ×1',2,(8600,10200)),('樹屋ツイン',(20,23),'單人床 ×2',2,(10800,12900)),('ロフトルーム',(27,30),'雙人床 ×1＋閣樓單人床 ×2',4,(15800,18800))],
   plans=[('素泊まり',0),('朝食付き（自家製パン）',1500)],desc='以木質為主題的小型設計旅店，一樓的咖啡麵包坊很受歡迎，步行即可到真跡主教教堂。'),
}
VIEWS={3:['街景','中庭','（無景觀）','街景'],4:['市街景觀','車站景觀','高樓層市街景觀'],5:['市街全景','鐵道景觀','高樓層全景']}
AM={3:['空調','液晶電視','冰箱','電熱水壺','吹風機','淋浴間'],4:['空調','大型液晶電視','冰箱','咖啡機','吹風機','浴缸','睡衣'],5:['空調','大型液晶電視','迷你吧','膠囊咖啡機','保險箱','浴缸＋獨立淋浴','浴袍','高級沐浴備品']}
out=[]
for i,h in enumerate(H,1):
    rnd=random.Random(h['id']); b=B[h['brand']]
    rooms=[]
    for j,(nm,(s0,s1),bed,cap,(p0,p1)) in enumerate(b['rooms']):
        st=h['stars']; am=list(AM[st]); rnd.shuffle(am); am=sorted(am[:rnd.randint(len(am)-2,len(am))],key=AM[st].index)
        rooms.append(dict(id='%s-%d'%(h['id'],j+1),name=nm,size=rnd.randint(s0,s1),beds=bed,cap=cap,view=rnd.choice(VIEWS[st]),smoke=False,
            base=int(round(rnd.uniform(p0,p1)/100)*100),stock=rnd.randint(3,12),amen=am,
            plans=[dict(name=p,add=a,refund=('不可退款' if a<0 else '入住前 2 天免費取消')) for p,a in b['plans']]))
    out.append(dict(id=h['id'],name=h['name'],stars=h['stars'],area=h['area'],station=h['station'],dist=h['dist'],marks=[dict(name=m,dist=d) for m,d in h['marks']],
        note=h.get('note',''),kind=b['kind'],brand=h['brand'],photo='img/h%02d.webp'%i,thumb='img/h%02d_s.webp'%i,desc=b['desc'],fac=b['fac'],ci=b['ci'],co=b['co'],
        score=round(rnd.uniform(7.6,8.8) if h['stars']==3 else rnd.uniform(8.4,9.1) if h['stars']==4 else rnd.uniform(8.9,9.5),1),rooms=rooms))
json.dump(dict(v=1,hotels=out),open('/home/claude/stay/data/hotels.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
for h in out: print(h['name'],h['stars'],h['score'],[ (r['name'],r['size'],r['base']) for r in h['rooms']][:2])
