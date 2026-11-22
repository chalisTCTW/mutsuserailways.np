"""2.13.0：瑞別町（花川本線 海寺町・瑞別・五原千歲）為中心的公車 16xx。
在 fix.py 之後、layout.py 之前跑：python3 add16.py in.json snapshot.json out.json
路線（主要＝照營運時段的班距；次要＝每小時 1 班）：
  1601 瑞別 → 海寺町 → 滝井川（轉乘花川本線・高速鉄道咲海站）
  1602 瑞別 → 五原千歲 → 五原高原
  1603 瑞別町循環（瑞別 → 東 → 南 → 西 → 瑞別）
  1604（次要）瑞別 → 若潮ニュータウン
  1605（次要）瑞別 → 鷺沼團地
  1606（次要）瑞別 → 海寺町（和 1601 共用這一段）→ 明星台
站名都是虛構的；用到車站地名（瑞別・海寺・五原）的站牌都在那個車站 2 km 以內。
"""
import json, math, sys

src, snap, out = sys.argv[1], sys.argv[2], sys.argv[3]
B = json.load(open(src, encoding='utf-8'))
S = json.load(open(snap, encoding='utf-8'))['data']['stations']
ST = {s['name'].split('|')[0]: ((s['position1']['x'] + s['position2']['x']) / 2, (s['position1']['z'] + s['position2']['z']) / 2) for s in S}
P, R = B['stops'], B['routes']
SPEED = 260

def sp(name):   # 車站前的站牌（名稱＝站名，連結轉乘）
    if name not in P:
        x, z = ST[name]; P[name] = {'x': round(x) + 30, 'z': round(z) + 30, 'en': {'瑞別': 'Mizubetsu', '海寺町': 'Umitera-machi', '五原千歲': 'Goen-Chitose', '滝井川': 'Takiigawa'}.get(name, name), 'st': name}
    return name

def leg(a, b, names, via=None):
    """a→b（座標）之間平均放 names 這些站牌；via＝中間的折點，讓路線不是一直線。"""
    pts = [a] + (via or []) + [b]
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]; L = sum(seg)
    out = []
    for k, (nm, en) in enumerate(names, 1):
        d = L * k / (len(names) + 1); acc = 0
        for i, s in enumerate(seg):
            if d <= acc + s or i == len(seg) - 1:
                t = (d - acc) / s; p, q = pts[i], pts[i + 1]
                assert nm not in P, nm
                P[nm] = {'x': round(p[0] + (q[0] - p[0]) * t), 'z': round(p[1] + (q[1] - p[1]) * t), 'en': en}
                out.append(nm); break
            acc += s
    return out

def end(nm, en, xy):
    assert nm not in P, nm
    P[nm] = {'x': round(xy[0]), 'z': round(xy[1]), 'en': en}; return nm

def route(no, stops, minor=False, loop=False, name=''):
    ring = stops + ([stops[0]] if loop else [])
    t = [max(1, round(math.dist((P[a]['x'], P[a]['z']), (P[b]['x'], P[b]['z'])) / SPEED)) for a, b in zip(ring, ring[1:])]
    r = {'no': no, 'hub': '瑞別町', 'loop': loop, 'express': False, 'name': name, 'stops': stops, 't': t}
    if minor: r.update(hw=60, minor=True)
    R[:] = [x for x in R if x['no'] != no] + [r]

if not any(r['no'] == '1601' for r in R):
    MZ, UM, GC, TK = ST['瑞別'], ST['海寺町'], ST['五原千歲'], ST['滝井川']
    mz, um, gc, tk = sp('瑞別'), sp('海寺町'), sp('五原千歲'), sp('滝井川')
    # 1601：瑞別 → 海寺町 → 滝井川
    route('1601', [mz] + leg(MZ, UM, [('瑞別本町', 'Mizubetsu-honmachi'), ('瑞別郵便局前', 'Mizubetsu Post Office'), ('汐見坂', 'Shiomizaka'), ('海寺町役場前', 'Umitera Town Office')], [(8300, -10500)])
          + [um] + leg(UM, TK, [('海寺小學校前', 'Umitera Elementary School'), ('松葉台', 'Matsubadai'), ('若葉橋', 'Wakaba-bashi'), ('咲海四丁目', 'Seiumi 4-chōme'), ('咲海一丁目', 'Seiumi 1-chōme')], [(6900, -10100)]) + [tk])
    # 1602：瑞別 → 五原千歲 → 五原高原
    route('1602', [mz] + leg(MZ, GC, [('瑞別北口', 'Mizubetsu-kitaguchi'), ('五原橋', 'Goen-bashi'), ('五原千歳二丁目', 'Goen-Chitose 2-chōme'), ('五原中學校前', 'Goen Junior High School')], [(9500, -11500)])
          + [gc] + leg(GC, (10350, -14050), [('五原神社前', 'Goen Shrine'), ('五原牧場', 'Goen Farm'), ('五原高原入口', 'Goen Highlands Entrance')], [(10100, -13300)]) + [end('五原高原', 'Goen Highlands', (10350, -14050))])
    # 1603：瑞別町循環
    route('1603', [mz] + leg(MZ, (10200, -11000), [('瑞別中央', 'Mizubetsu-chūō'), ('瑞別町役場前', 'Mizubetsu Town Office')])
          + [end('瑞別東', 'Mizubetsu-higashi', (10200, -11000))]
          + leg((10200, -11000), (9200, -9900), [('潮見台', 'Shiomidai'), ('瑞別病院前', 'Mizubetsu Hospital'), ('瑞別南', 'Mizubetsu-minami')], [(10100, -10100)])
          + leg((9200, -9900), MZ, [('鷺沼入口', 'Saginuma-iriguchi'), ('瑞別西', 'Mizubetsu-nishi')], [(8600, -10200)]), loop=True, name='瑞別町循環')
    # 1604：瑞別 → 若潮ニュータウン
    route('1604', [mz] + leg(MZ, (12000, -11300), [('瑞別高校前', 'Mizubetsu High School'), ('東瑞別', 'Higashi-Mizubetsu'), ('浜田', 'Hamada'), ('浜田團地', 'Hamada Danchi'), ('浜田公園前', 'Hamada Park'), ('新町', 'Shinmachi'), ('新町二丁目', 'Shinmachi 2-chōme')], [(10900, -11100)])
          + [end('若潮ニュータウン', 'Wakashio New Town', (12000, -11300))], minor=True)
    # 1605：瑞別 → 鷺沼團地
    route('1605', [mz] + leg(MZ, (8900, -8300), [('瑞別西口', 'Mizubetsu-nishiguchi'), ('鷺沼', 'Saginuma'), ('鷺沼小學校前', 'Saginuma Elementary School'), ('鷺沼北', 'Saginuma-kita'), ('鷺沼中央', 'Saginuma-chūō'), ('鷺沼三丁目', 'Saginuma 3-chōme'), ('鷺沼公園前', 'Saginuma Park')], [(8700, -9400)])
          + [end('鷺沼團地', 'Saginuma Danchi', (8900, -8300))], minor=True)
    # 1606：瑞別 → 海寺町 → 明星台
    # 瑞別～海寺町 和 1601 走同一條路（共用站牌），過了海寺町才往北
    trunk = R[[r['no'] for r in R].index('1601')]['stops']
    route('1606', trunk[:trunk.index(um) + 1] + leg(UM, (6900, -12600), [('海寺山入口', 'Umiterayama-iriguchi'), ('海寺山霊園前', 'Umiterayama Cemetery'), ('星見坂', 'Hoshimizaka'), ('明星台入口', 'Myōjōdai-iriguchi')], [(7200, -11700)])
          + [end('明星台', 'Myōjōdai', (6900, -12600))], minor=True)

# 檢查：用到車站地名的站牌必須在那站 2 km 以內
_k = lambda c: '一' <= c <= '鿿'
bad = []
for nm, v in P.items():
    if v.get('st'): continue
    for z, q in ST.items():
        for part in z.split('/'):
            for stem in [part] + ([part[:2]] if len(part) >= 3 and all(_k(c) for c in part[:2]) else []):
                if len(stem) >= 2 and stem not in ('中央', '病院', '病院前', '大學', '公園', '高校', '團地') and stem in nm:
                    near = min(math.dist((v['x'], v['z']), qq) for zz, qq in ST.items() if stem in zz)
                    if near > 2000: bad.append((nm, stem, round(near)))
bad = sorted(set(bad))
print('stem violations:', bad)
B['anchors'] = sorted(set(B.get('anchors', [])) | {'海寺町', '五原千歲', '瑞別東', '瑞別病院前', '瑞別西'})   # 路線圖的重點站（環線才不會縮成一條線）
B['v'] = '2.13.0'
json.dump(B, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('routes', len(R), 'stops', len(P), [(r['no'], len(r['stops']), sum(r['t'])) for r in R if r['no'].startswith('16')])
