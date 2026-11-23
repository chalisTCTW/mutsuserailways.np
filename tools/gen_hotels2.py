import json, random, math
src = open('/home/claude/work/gen_hotels.py', encoding='utf-8').read()
ns = {}
exec(src[:src.index('out=[]')], ns)
H, B, VIEWS, AM = ns['H'], ns['B'], ns['VIEWS'], ns['AM']
PORTAL = '/home/claude/portal/hikarise-portal-2.0.0-wip/data/'

for h in H:
    h['desc'] = B[h['brand']]['desc']
    h['view'] = {'r1-katsumori': 'sea', 'toyoko-shirakura': 'mountain', 'granplaza-kurihashi': 'city'}.get(h['id'], 'city')
for b in B.values():
    b['desc'] = None

def br(kind, fac, ci, co, rooms, plans, desc):
    return dict(kind=kind, fac=fac, ci=ci, co=co, rooms=rooms, plans=plans, desc=desc)

B.update({
 'comfort': br('商務旅館', ['免費早餐', '免費 Wi-Fi', '迎賓咖啡', '投幣洗衣', '24 小時櫃台'], '15:00', '11:00',
   [('シングル', (13, 15), '加寬單人床 ×1', 1, (6400, 7600)), ('ダブル', (15, 17), '雙人床 ×1', 2, (8400, 9800)), ('ツイン', (18, 21), '單人床 ×2', 2, (10200, 12000))],
   [('朝食付き（無料）', 0)], '{area}的連鎖商務旅館，早上有免費的麵包與熱食早餐，大廳全天提供咖啡。'),
 'routeinn': br('商務旅館', ['大浴場「旅人の湯」', '免費自助早餐', '免費 Wi-Fi', '投幣洗衣', '停車場（免費）'], '15:00', '10:00',
   [('シングル', (13, 15), '加寬單人床 ×1', 1, (6600, 7800)), ('ダブル', (15, 17), '雙人床 ×1', 2, (8800, 10200)), ('ツイン', (19, 22), '單人床 ×2', 2, (11000, 12800)), ('トリプル', (24, 27), '單人床 ×3', 3, (14200, 16400))],
   [('素泊まり', 0), ('朝食付き（無料バイキング）', 0)], '附人工溫泉大浴場「旅人の湯」的連鎖旅館，停車場免費，開車或搭車都方便。'),
 'apa': br('商務旅館', ['大浴場', '免費 Wi-Fi', '餐廳', '投幣洗衣', '自助入住機'], '15:00', '11:00',
   [('シングル', (11, 12), '加寬單人床 ×1', 1, (6800, 8200)), ('ダブル', (11, 13), '雙人床 ×1', 2, (8200, 9600)), ('ツイン', (15, 17), '單人床 ×2', 2, (10800, 12600))],
   [('素泊まり', 0), ('朝食付き', 1500)], '客房精巧、設備齊全的連鎖飯店，自助入住機讓深夜抵達也很快速。'),
 'ho': br('城市飯店', ['免費 Wi-Fi', '頂樓酒吧', '健身房', '24 小時櫃台', '禁菸客房'], '15:00', '11:00',
   [('スタンダードダブル', (16, 18), '雙人床 ×1', 2, (9800, 11600)), ('スタンダードツイン', (20, 23), '單人床 ×2', 2, (12000, 14200)), ('スーペリアツイン（高層階）', (24, 27), '加大單人床 ×2', 3, (15200, 17800))],
   [('素泊まり', 0), ('朝食付き', 1800)], '花倉街道北口的高層城市飯店，頂樓酒吧可以眺望花倉與吹上一帶的夜景。'),
 'najima': br('城市飯店', ['港景餐廳', '酒吧', '宴會廳', '免費 Wi-Fi', '停車場（收費）', '禮賓服務'], '15:00', '11:00',
   [('スーペリアダブル（ハーバービュー）', (22, 25), '雙人床 ×1', 2, (15800, 18800)), ('デラックスツイン', (28, 32), '加大單人床 ×2', 3, (19800, 23800)), ('コーナースイート', (52, 58), '特大雙人床 ×1＋起居區', 3, (42000, 50000))],
   [('素泊まり', 0), ('朝食付き', 2600), ('2 食付き（港景晚餐）', 9800)], '名島港旁的港灣飯店，客房面向港口，步行即可到舊港務局海關所與港町的老街。'),
 'central': br('城市飯店', ['餐廳', '咖啡廳', '免費 Wi-Fi', '健身房', '24 小時櫃台'], '15:00', '11:00',
   [('スーペリアダブル', (19, 22), '雙人床 ×1', 2, (12800, 15200)), ('スーペリアツイン', (23, 26), '單人床 ×2', 2, (14600, 17400)), ('デラックスキング', (28, 31), '特大雙人床 ×1', 2, (18800, 22400))],
   [('素泊まり', 0), ('朝食付き', 2000)], '十万浦市站前的城市飯店，是曲江、十万浦一帶出差與觀光的據點。'),
 'art': br('設計旅店', ['藝廊大廳', '咖啡廳＆酒吧', '免費 Wi-Fi', '劇場套票', '禁菸客房'], '15:00', '11:00',
   [('アトリエダブル', (18, 21), '雙人床 ×1', 2, (11800, 13800)), ('アトリエツイン', (22, 25), '單人床 ×2', 2, (13800, 16200)), ('ギャラリースイート', (42, 48), '特大雙人床 ×1＋起居區', 3, (29000, 34000))],
   [('素泊まり', 0), ('朝食付き', 1900), ('懷永美術館 入館券付き', 1200)], '鄰近懷永美術館的設計旅店，大廳輪流展出在地藝術家的作品，也能買到劇場套票。'),
 'resort': br('度假飯店', ['海景大浴場', '露天風呂', '餐廳', '免費 Wi-Fi', '停車場（免費）', '伴手禮店'], '15:00', '11:00',
   [('オーシャンビューツイン', (26, 30), '單人床 ×2', 3, (16800, 20200)), ('オーシャンビュー和洋室', (38, 44), '單人床 ×2＋和室', 5, (24000, 28800)), ('露天風呂付き客室', (44, 50), '加大單人床 ×2', 3, (36000, 42000))],
   [('1 泊朝食付き', 0), ('1 泊 2 食付き（海鮮會席）', 8800)], '面向海灣的度假飯店，從大浴場與每間客房都能看到海。晚餐是當天捕撈的海鮮會席。'),
 'resortlux': br('度假飯店', ['私人海灘', '室外泳池', 'SPA', '海景露天風呂', '法式餐廳', '日本料理', '接駁車'], '15:00', '12:00',
   [('オーシャンフロントツイン', (40, 45), '加大單人床 ×2', 3, (38000, 45000)), ('オーシャンフロント和洋室', (55, 62), '加大單人床 ×2＋和室', 5, (52000, 60000)), ('露天風呂付きヴィラ', (80, 92), '特大雙人床 ×1＋露天風呂', 4, (88000, 104000)), ('ロイヤルスイート', (130, 150), '特大雙人床 ×1＋客廳＋和室', 6, (160000, 190000))],
   [('1 泊朝食付き', 0), ('1 泊 2 食付き（法式全餐）', 16000), ('1 泊 2 食付き（會席料理）', 15000)], '天鳥崎海岸的旗艦度假村，有私人海灘、室外泳池與海景露天風呂，車站有接駁車。'),
 'ryokan': br('日式旅館', ['大浴場', '露天風呂', '包場浴池', '和室', '免費 Wi-Fi'], '15:00', '10:00',
   [('和室 8 畳', (14, 16), '和式床墊 ×2', 3, (17600, 21000)), ('和室 10 畳', (18, 20), '和式床墊 ×3', 4, (21600, 25600)), ('和洋室', (26, 30), '單人床 ×2＋和室', 5, (26800, 31800))],
   [('1 泊 2 食付き', 0, '入住前 3 天免費取消'), ('朝食のみ', -5200, '入住前 3 天免費取消')], '家族經營的日式旅館，房間都是和室，晚餐在房間裡享用當地的料理。'),
 'ryokan4': br('日式旅館', ['海景露天風呂', '大浴場', '包場浴池', '和室', '免費 Wi-Fi', '伴手禮店'], '15:00', '10:00',
   [('海側和室 10 畳', (18, 21), '和式床墊 ×3', 4, (26800, 31800)), ('海側和洋室', (30, 34), '單人床 ×2＋和室', 5, (34000, 40000)), ('露天風呂付き和室', (36, 42), '和式床墊 ×3＋露天風呂', 4, (48000, 56000))],
   [('1 泊 2 食付き（海鮮會席）', 0, '入住前 3 天免費取消'), ('1 泊 2 食付き（伊勢海老付き）', 4400, '入住前 3 天免費取消')], '面向海的日式旅館，露天風呂就在海邊，晚上可以聽著海浪聲入睡。'),
 'ryokanlux': br('日式旅館', ['源泉放流露天風呂', '大浴場', '包場浴池', '料亭', 'SPA', '茶室', '接送服務'], '15:00', '11:00',
   [('本館 和室 12 畳', (24, 28), '和式床墊 ×3', 4, (46000, 54000)), ('露天風呂付き和室', (40, 46), '和式床墊 ×3＋露天風呂', 4, (68000, 80000)), ('露天風呂付き和洋室', (52, 58), '單人床 ×2＋和室＋露天風呂', 5, (82000, 96000)), ('離れ 特別室', (90, 110), '特大雙人床 ×1＋和室＋露天風呂', 6, (150000, 178000))],
   [('1 泊 2 食付き（料亭會席）', 0, '入住前 7 天免費取消'), ('1 泊 2 食付き（特選會席）', 12000, '入住前 7 天免費取消')], '清音大社參道旁的老字號旅館，所有浴池都是源泉放流。晚餐在料亭的包廂享用季節會席。'),
 'onsenhotel': br('溫泉飯店', ['大浴場', '露天風呂', '自助晚餐', '遊戲室', '免費 Wi-Fi', '停車場（免費）'], '15:00', '10:00',
   [('和室 10 畳', (18, 20), '和式床墊 ×3', 4, (19800, 23600)), ('和洋室', (28, 32), '單人床 ×2＋和室', 5, (25600, 30400)), ('洋室ツイン', (22, 25), '單人床 ×2', 2, (16800, 19800))],
   [('1 泊 2 食付き（自助餐）', 0, '入住前 3 天免費取消'), ('1 泊朝食付き', -4800, '入住前 3 天免費取消')], '溫泉街中心的大型溫泉飯店，晚餐是自助餐，有遊戲室，很適合全家一起來。'),
 'onsenbiz': br('商務旅館', ['溫泉大浴場', '免費早餐', '免費 Wi-Fi', '投幣洗衣'], '15:00', '10:00',
   [('シングル', (12, 14), '加寬單人床 ×1', 1, (7200, 8600)), ('ダブル', (14, 16), '雙人床 ×1', 2, (9600, 11200)), ('ツイン', (18, 20), '單人床 ×2', 2, (11800, 13800))],
   [('朝食付き（無料）', 0)], '站前的溫泉商務旅館，大浴場一樣引用清音溫泉的源泉，房價實惠。'),
})

N2 = [
 dict(id='comfort-higashihekura', name='COMFORT HOTEL平倉中央', stars=3, area='東平倉', station='東平倉', dist=208, marks=[['平倉市革命公園', 1260, 'sight', 'heikura']], brand='comfort', view='city'),
 dict(id='routeinn-sakimi', name='ROUTE INN咲海', stars=3, area='咲海', station='滝井川', dist=149, marks=[['高速鉄道咲海站', 211, 'station', '咲海']], brand='routeinn', view='city'),
 dict(id='apa-hanakura', name='APA HOTEL光瀨花倉街道', stars=3, area='花倉街道', station='花倉街道', dist=536, marks=[['鷹取大野站', 751, 'station', '鷹取大野'], ['吹上競馬場', 906, 'sight', 'fukiage-keibajo']], brand='apa', view='city'),
 dict(id='ho-hanakura', name='HO HOTEL花倉北口', stars=3, area='花倉街道', station='花倉街道', dist=186, marks=[], brand='ho', view='city'),
 dict(id='najima-prince', name='NAJIMAプリンス', stars=4, area='名島港', station='名島港', dist=211, marks=[['舊港務局稅關所', 667, 'sight', 'customs']], brand='najima', view='sea'),
 dict(id='routeinn-gohara', name='ROUTE INN五原千歲', stars=3, area='五原千歲', station='五原千歲', dist=111, marks=[], brand='routeinn', view='city'),
 dict(id='kiya-mitsuse', name='樹屋HOTELみつせ', stars=3, area='みつせ', station='みつせ', dist=326, marks=[], brand='kiya', view='city', desc='樹屋HOTEL的みつせ分館，同樣以木質為主題，一樓的咖啡麵包坊很受歡迎，走路就能到流星樹與市區。'),
 dict(id='mystay-joseI', name='ホテルMYSTAY光瀨城西', stars=3, area='船井大島', station='船井大島', dist=173, marks=[['光瀨城跡', 495, 'sight', 'castle']], brand='mystay', view='city', desc='光瀨城西側的小型飯店，散步到光瀨城只要幾分鐘，早上可以先去看晨霧中的天守。'),
 dict(id='r1-oshima', name='ホテルR-1大島', stars=3, area='船井大島', station='船井大島', dist=561, marks=[['單軌船井大島/城跡前', 430, 'station', None]], brand='r1', view='city'),
]
N3 = [
 dict(id='r1-jumanura', name='ホテルR-1十万浦', stars=3, station='十万浦市', dist=230, brand='r1', view='city'),
 dict(id='toyoko-jumanura', name='東橫INN十万浦市站前', stars=3, station='十万浦市', dist=95, brand='toyoko', view='city'),
 dict(id='central-jumanura', name='十万浦セントラルホテル', stars=4, station='十万浦市', dist=160, brand='central', view='city'),
 dict(id='kaiei-magarie', name='ホテル懷永 曲江', stars=4, station='曲江', dist=140, brand='art', view='city', marks=[['懷永美術館', 120, 'sight', 'kaiei-museum']]),
 dict(id='routeinn-magarie', name='ROUTE INN曲江', stars=3, station='曲江', dist=310, brand='routeinn', view='mountain'),
 dict(id='seaside-isoshima', name='本磯島シーサイドホテル', stars=4, station='本磯島', dist=420, brand='resort', view='sea'),
 dict(id='isoya-isoshima', name='磯の宿 いそや', stars=3, station='本磯島', dist=260, brand='ryokan', view='sea', desc='本磯島漁港旁的家族經營旅館，晚餐是早上剛上岸的海鮮，房間都看得到海。'),
 dict(id='apa-shinkatsumori', name='APA HOTEL新勝守', stars=3, station='新勝守', dist=140, brand='apa', view='city'),
 dict(id='resort-tentorizaki', name='天鳥崎オーシャンリゾート', stars=5, station='天鳥崎中央', dist=650, brand='resortlux', view='sea', marks=[['天鳥崎神社', 380, 'sight', 'shrine']]),
 dict(id='r1-tentorizaki', name='ホテルR-1天鳥崎', stars=3, station='天鳥崎中央', dist=180, brand='r1', view='sea'),
 dict(id='shione-tentorizaki', name='海辺の宿 汐音', stars=4, station='天鳥崎中央', dist=520, brand='ryokan4', view='sea', marks=[['天鳥崎神社', 240, 'sight', 'shrine']]),
 dict(id='seiryukaku', name='清音溫泉 大社前 清流閣', stars=5, station='清音溫泉', dist=380, brand='ryokanlux', view='mountain', marks=[['清音大社', 150, 'sight', 'seion-taisha']]),
 dict(id='kagetsu-seion', name='清音溫泉ホテル 花月', stars=4, station='清音溫泉', dist=290, brand='onsenhotel', view='mountain', marks=[['清音大社', 420, 'sight', 'seion-taisha']]),
 dict(id='sakuraya-seion', name='湯宿 さくら屋', stars=3, station='清音溫泉', dist=210, brand='ryokan', view='garden', marks=[['清音大社', 260, 'sight', 'seion-taisha']], desc='清音大社參道商店街裡的小旅館，泡完湯穿著浴衣就能去逛參道，晚餐是溫泉鄉的家常會席。'),
 dict(id='sando-seion', name='清音溫泉 HOTEL 参道', stars=3, station='清音溫泉', dist=120, brand='onsenbiz', view='mountain', marks=[['清音大社', 520, 'sight', 'seion-taisha']]),
 dict(id='comfort-taniyama', name='COMFORT HOTEL谷山', stars=3, station='谷山', dist=160, brand='comfort', view='city'),
 dict(id='mystay-taniyama', name='ホテルMYSTAY谷山', stars=3, station='谷山', dist=340, brand='mystay', view='city', desc='谷山站附近的小型飯店，客房附微波爐，適合長住或出差。'),
]

areas = json.load(open(PORTAL + 'areas.json', encoding='utf-8'))
sights = json.load(open(PORTAL + 'sights.json', encoding='utf-8'))
snap = json.load(open(PORTAL + 'snapshot.json', encoding='utf-8'))['data']
POS = {}
for s in snap['stations']:
    if s.get('transportMode', 'TRAIN') != 'TRAIN':
        continue
    n = s['name'].split('|')[0]
    a, b = s['position1'], s['position2']
    POS[n] = ((a['x'] + b['x']) / 2, (a['z'] + b['z']) / 2)
DIST_OF = areas['stations']
DIS = {d['id']: d for d in areas['districts']}

def room_img(name, view, kind):
    jp = kind in ('日式旅館',) or '和' in name
    if '露天' in name or 'ヴィラ' in name or '離れ' in name:
        k = 'rotenburo'
    elif '和洋' in name:
        k = 'wayou'
    elif '和室' in name:
        k = 'washitsu'
    elif 'スイート' in name or 'エグゼクティブ' in name:
        k = 'suite'
    elif 'ロフト' in name:
        k = 'loft'
    elif 'シングル' in name:
        k = 'single'
    elif 'ツイン' in name or 'トリプル' in name:
        k = 'twin'
    else:
        k = 'double'
    v = view
    if k in ('washitsu', 'wayou', 'rotenburo'):
        v = {'city': 'garden'}.get(v, v)
    else:
        v = {'garden': 'mountain'}.get(v, v)
    return 'img/rooms/r-%s-%s.webp' % (k, v)

def build(h, i, rnd, photo):
    b = B[h['brand']]
    rooms = []
    for j, (nm, (s0, s1), bed, cap, (p0, p1)) in enumerate(b['rooms']):
        st = h['stars']
        am = list(AM[st]); rnd.shuffle(am); am = sorted(am[:rnd.randint(len(am) - 2, len(am))], key=AM[st].index)
        plans = []
        for p in b['plans']:
            ref = p[2] if len(p) > 2 else ('不可退款' if p[1] < 0 else '入住前 2 天免費取消')
            plans.append(dict(name=p[0], add=p[1], refund=ref))
        rooms.append(dict(id='%s-%d' % (h['id'], j + 1), name=nm, size=rnd.randint(s0, s1), beds=bed, cap=cap, view=rnd.choice(VIEWS[st]), smoke=False,
            base=int(round(rnd.uniform(p0, p1) / 100) * 100), stock=rnd.randint(3, 12), amen=am, plans=plans, img=room_img(nm, h.get('view', 'city'), b['kind'])))
    marks = []
    for m in h.get('marks', []):
        if len(m) == 2:
            ref = {'勝守漁港': ('sight', 'port'), '流星樹': ('sight', 'ryusei-tree'), '九里橋神社': ('sight', 'kuribashi-jinja'), '真跡主教教堂': ('sight', 'church')}.get(m[0], (None, None))
            m = [m[0], m[1], ref[0], ref[1]]
        marks.append(dict(name=m[0], dist=m[1], type=m[2], ref=m[3]))
    score = round(rnd.uniform(7.6, 8.8) if h['stars'] == 3 else rnd.uniform(8.4, 9.1) if h['stars'] == 4 else rnd.uniform(8.9, 9.5), 1)
    if photo:
        ph, th = 'img/h%02d.webp' % i, 'img/h%02d_s.webp' % i
    else:
        ph = th = rooms[-1]['img'] if b['kind'] in ('日式旅館', '度假飯店') else rooms[min(1, len(rooms) - 1)]['img']
    area = h.get('area') or h['station']
    desc = h.get('desc') or (b['desc'] or '').replace('{area}', area)
    did = DIST_OF.get(h['station'])
    return dict(id=h['id'], name=h['name'], stars=h['stars'], area=area, station=h['station'], dist=h['dist'], marks=marks,
        note=h.get('note', ''), kind=b['kind'], brand=h['brand'], photo=ph, thumb=th, ext=bool(photo), desc=desc, fac=b['fac'], ci=b['ci'], co=b['co'],
        score=score, rooms=rooms, district=did)

out = []
for i, h in enumerate(H, 1):
    out.append(build(h, i, random.Random(h['id']), True))
for i, h in enumerate(N2, 12):
    out.append(build(h, i, random.Random(h['id']), True))
for h in N3:
    out.append(build(h, 0, random.Random(h['id']), False))

def solve(center, r, cons, seed):
    best, bv = None, 1e18
    a0 = random.Random(seed).random() * math.tau
    for k in range(360):
        a = a0 + k * math.tau / 360
        p = (center[0] + r * math.cos(a), center[1] + r * math.sin(a))
        v = sum((math.dist(p, q) - d) ** 2 for q, d in cons)
        if v < bv - 1e-6:
            best, bv = p, v
    return best

for h in out:
    c = POS.get(h['station'])
    if not c:
        h['pos'] = None
        continue
    cons = [(POS[m['ref']], m['dist']) for m in h['marks'] if m['type'] == 'station' and m['ref'] in POS]
    p = solve(c, h['dist'], cons, h['id'])
    h['pos'] = [round(p[0]), round(p[1])]

SX = [dict(id=s['id'], name=s['name'], station=s['station'], tag=s.get('tag', '')) for s in sights]
SX.append(dict(id='kuribashi-jinja', name='九里橋神社', station='九里橋三丁目', tag='神社'))
for s in SX:
    s['district'] = DIST_OF.get(s['station'])
    c = POS.get(s['station'])
    if not c:
        s['pos'] = None
        continue
    cons = [(tuple(h['pos']), m['dist']) for h in out if h['pos'] for m in h['marks'] if m['type'] == 'sight' and m['ref'] == s['id']]
    if cons:
        q, d = cons[0]
        rr = random.Random(s['id'])
        best, bv = None, 1e18
        for k in range(720):
            a = k * math.tau / 720
            p = (q[0] + d * math.cos(a), q[1] + d * math.sin(a))
            v = sum((math.dist(p, qq) - dd) ** 2 for qq, dd in cons) + 0.2 * (math.dist(p, c) - 350) ** 2
            if v < bv:
                best, bv = p, v
        p = best
    else:
        rr = random.Random(s['id'])
        a = rr.random() * math.tau; d = rr.uniform(180, 520)
        p = (c[0] + d * math.cos(a), c[1] + d * math.sin(a))
    s['pos'] = [round(p[0]), round(p[1])]

stations = [dict(name=n, district=d, pos=[round(POS[n][0]), round(POS[n][1])] if n in POS else None) for n, d in DIST_OF.items()]
places = dict(regions=[dict(id=r['id'], zh=r['zh'], ja=r['ja']) for r in areas['regions']],
              districts=[dict(id=d['id'], region=d['region'], zh=d['zh'], ja=d['ja']) for d in areas['districts']],
              stations=stations, sights=SX)
json.dump(dict(v=2, places=places, hotels=out), open('/home/claude/stay/data/hotels.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for h in out:
    print(h['name'], h['stars'], h['district'], h['pos'], h['photo'][-24:])
for s in SX:
    print(' *', s['name'], s['district'], s['pos'])
