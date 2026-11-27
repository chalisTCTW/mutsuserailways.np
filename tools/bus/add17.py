"""2.20.0：十萬浦郡北部（御笠市・天照市・鷹田市）的公車 17xx／18xx／19xx。
python3 add17.py in.json snapshot.json out.json，之後跑 layout.py。"""
import json, math, sys

src, snap, out = sys.argv[1], sys.argv[2], sys.argv[3]
B = json.load(open(src, encoding='utf-8'))
S = json.load(open(snap, encoding='utf-8'))['data']['stations']
ST = {s['name'].split('|')[0]: ((s['position1']['x'] + s['position2']['x']) / 2, (s['position1']['z'] + s['position2']['z']) / 2) for s in S}
P, R = B['stops'], B['routes']
SPEED = 260
EN = {'御笠市': 'Mikasa-shi', '三浦': 'Miura', '三浦海岸': 'Miura-kaigan', '花宮天照': 'Hanamiya-Tensho', '荒村': 'Aramura',
      '照宮': 'Terunomiya', '綾野': 'Ayano', '雲中瀬': 'Kumonakase', '鷹田': 'Takada', '鷹田団地前': 'Takada-Danchi', '佐日原': 'Sahihara'}

def sp(name):
    if name not in P:
        x, z = ST[name]; P[name] = {'x': round(x) + 30, 'z': round(z) + 30, 'en': EN[name], 'st': name}
    return name

def leg(a, b, names, via=None):
    pts = [a] + (via or []) + [b]
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]; L = sum(seg)
    res = []
    for k, (nm, en) in enumerate(names, 1):
        d = L * k / (len(names) + 1); acc = 0
        for i, s in enumerate(seg):
            if d <= acc + s or i == len(seg) - 1:
                t = (d - acc) / s; p, q = pts[i], pts[i + 1]
                assert nm not in P, nm
                P[nm] = {'x': round(p[0] + (q[0] - p[0]) * t), 'z': round(p[1] + (q[1] - p[1]) * t), 'en': en}
                res.append(nm); break
            acc += s
    return res

def end(nm, en, xy):
    assert nm not in P, nm
    P[nm] = {'x': round(xy[0]), 'z': round(xy[1]), 'en': en}; return nm

def route(no, hub, stops, minor=False, loop=False, name=''):
    ring = stops + ([stops[0]] if loop else [])
    t = [max(1, round(math.dist((P[a]['x'], P[a]['z']), (P[b]['x'], P[b]['z'])) / SPEED)) for a, b in zip(ring, ring[1:])]
    r = {'no': no, 'hub': hub, 'loop': loop, 'express': False, 'name': name, 'stops': stops, 't': t}
    if minor: r.update(hw=60, minor=True)
    R[:] = [x for x in R if x['no'] != no] + [r]

if not any(r['no'] == '1701' for r in R):
    MC, MU, MK, HT, AR = ST['御笠市'], ST['三浦'], ST['三浦海岸'], ST['花宮天照'], ST['荒村']
    TR, AY, KM = ST['照宮'], ST['綾野'], ST['雲中瀬']
    TK, TD, SH = ST['鷹田'], ST['鷹田団地前'], ST['佐日原']
    mc = sp('御笠市')
    route('1701', '御笠市', [mc] + leg(MC, MU, [('御笠本町', 'Mikasa-honmachi'), ('御笠栄町', 'Mikasa-sakaemachi'), ('御笠病院前', 'Mikasa Hospital'), ('三浦北口', 'Miura-kitaguchi')], [(9250, -19000)])
          + [sp('三浦')] + leg(MU, MK, [('三浦小學校前', 'Miura Elementary School'), ('潮騒台', 'Shiosaidai')], [(9500, -17300)]) + [sp('三浦海岸')])
    route('1702', '御笠市', [mc] + leg(MC, HT, [('御笠市役所前', 'Mikasa City Hall'), ('坑口公園前', 'Kōguchi Park'), ('炭鉱記念館前', 'Coal Mine Museum'), ('ボタ山入口', 'Botayama-iriguchi'), ('花宮入口', 'Hanamiya-iriguchi')], [(7600, -19700)])
          + [sp('花宮天照')])
    route('1703', '御笠市', [mc] + leg(MC, (10600, -20600), [('御笠港町', 'Mikasa-minatomachi'), ('御笠漁市場前', 'Mikasa Fish Market'), ('港町漁協前', 'Minato-machi Fishery Co-op')], [(9900, -20100)])
          + [end('御笠灯台下', 'Mikasa Lighthouse', (10600, -20600))], minor=True)
    route('1704', '御笠市', [mc] + leg(MC, AR, [('栄町三丁目', 'Sakae-machi 3-chōme'), ('炭住跡', 'Tanjū-ato'), ('雲雀ヶ丘', 'Hibarigaoka'), ('北原', 'Kitahara'), ('荒村入口', 'Aramura-iriguchi')], [(7000, -21600)])
          + [sp('荒村')], minor=True)

    tr = sp('照宮')
    route('1801', '照宮', [tr] + leg(TR, (6200, -30500), [('天照市役所前', 'Tensho City Hall'), ('照宮参道入口', 'Terunomiya Sandō'), ('照宮神社前', 'Terunomiya Shrine'), ('神楽坂', 'Kagurazaka'), ('天照高原入口', 'Tensho Highlands Entrance')], [(4600, -29900)])
          + [end('天照高原', 'Tensho Highlands', (6200, -30500))])
    route('1802', '照宮', [tr] + leg(TR, AY, [('天照中央', 'Tensho-chūō'), ('照宮西口', 'Terunomiya-nishiguchi')], [(3100, -29500)])
          + [sp('綾野')] + leg(AY, (1500, -30800), [('綾野小學校前', 'Ayano Elementary School'), ('綾野二丁目', 'Ayano 2-chōme')], [(1900, -30100)]) + [end('綾野台', 'Ayanodai', (1500, -30800))])
    route('1803', '照宮', [tr] + leg(TR, KM, [('天照北町', 'Tensho-kitamachi'), ('照宮高校前', 'Terunomiya High School'), ('雲中瀬南口', 'Kumonakase-minamiguchi')], [(4300, -28700)])
          + [sp('雲中瀬')] + leg(KM, (5600, -26900), [('雲中瀬温泉入口', 'Kumonakase Onsen Entrance')]) + [end('雲中瀬温泉', 'Kumonakase Onsen', (5600, -26900))])
    route('1804', '照宮', [tr] + leg(TR, (4900, -31600), [('天照二丁目', 'Tensho 2-chōme'), ('杉並台', 'Suginamidai'), ('天照團地', 'Tensho Danchi'), ('天照公園前', 'Tensho Park')], [(3900, -30700)])
          + [end('天照ニュータウン', 'Tensho New Town', (4900, -31600))], minor=True)

    tk = sp('鷹田')
    route('1901', '鷹田', [tk] + leg(TK, TD, [('鷹田市役所前', 'Takada City Hall'), ('鷹田中央', 'Takada-chūō'), ('鷹田團地北', 'Takada Danchi North'), ('鷹田團地中央', 'Takada Danchi Center'), ('鷹田團地南', 'Takada Danchi South')], [(3800, -35000)])
          + [sp('鷹田団地前')])
    route('1902', '鷹田', [tk] + leg(TK, (3400, -38800), [('鷹田神社前', 'Takada Shrine'), ('北鷹田', 'Kita-Takada'), ('鷹田牧場入口', 'Takada Farm Entrance')])
          + [end('鷹ノ巣高原', 'Takanosu Highlands', (3400, -38800))])
    route('1903', '鷹田', [tk] + leg(TK, SH, [('鷹田西口', 'Takada-nishiguchi'), ('稲荷橋', 'Inari-bashi'), ('西鷹田', 'Nishi-Takada'), ('川端', 'Kawabata'), ('佐日原北口', 'Sahihara-kitaguchi')], [(1800, -35000), (1800, -32500)])
          + [sp('佐日原')])
    route('1904', '鷹田', [tk] + leg(TK, (5200, -36700), [('鷹田東口', 'Takada-higashiguchi'), ('東鷹田', 'Higashi-Takada'), ('鷹見台', 'Takamidai'), ('ひばり野', 'Hibarino')])
          + [end('ひばり野ニュータウン', 'Hibarino New Town', (5200, -36700))], minor=True)

_k = lambda c: '一' <= c <= '鿿'
bad = []
for nm, v in P.items():
    if v.get('st'): continue
    for z in ST:
        for part in z.split('/'):
            for stem in [part] + ([part[:2]] if len(part) >= 3 and all(_k(c) for c in part[:2]) else []):
                if len(stem) >= 2 and stem not in ('中央', '病院', '病院前', '大學', '公園', '高校', '團地') and stem in nm:
                    near = min(math.dist((v['x'], v['z']), qq) for zz, qq in ST.items() if stem in zz)
                    if near > 2000: bad.append((nm, stem, round(near)))
print('stem violations:', sorted(set(bad)))
B['anchors'] = sorted(set(B.get('anchors', [])) | {'三浦', '綾野', '雲中瀬'})
B['v'] = '2.20.0'
json.dump(B, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print([(r['no'], len(r['stops']), sum(r['t'])) for r in R if r['no'][:2] in ('17', '18', '19')])
