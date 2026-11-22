"""2.12.0：配合快照 9（花川本線 村下－滝井川、倉浦市區線 谷山－清水若宮）整理公車。
在 gen.py 之後、layout.py 之前跑：python3 fix.py in.json snapshot.json out.json

1. 和新車站同名／同地名卻離那站 2 km 以上的站牌改名（八坂〇〇、清水〇〇…），或剛好就在車站旁的直接改成車站名並連結轉乘。
2. 離車站不到 130 m、而且同一條路線的鄰站就是那個車站的站牌＝擠在一起：不刪（維持前輩指定的站數），挪到車站和另一側鄰站的中點。
3. 離車站不到 130 m、但路線沒停那個車站的站牌：保留名稱，加上轉乘連結（st）。
4. 舊的「咲海」站牌（高速鉄道咲海站前）改成滝井川站前，連結花川本線滝井川站；桂木站旁的柏原商店街連結桂木站。
5. 新增 407 路（次要、每小時 1 班）：東平倉 → 清水若宮 → 南滝井川，把兩段新通車的終點和東平倉接起來。
"""
import json, math, sys

src, snap, out = sys.argv[1], sys.argv[2], sys.argv[3]
B = json.load(open(src, encoding='utf-8'))
S = json.load(open(snap, encoding='utf-8'))['data']['stations']
ST = {s['name'].split('|')[0]: ((s['position1']['x'] + s['position2']['x']) / 2, (s['position1']['z'] + s['position2']['z']) / 2) for s in S}
P, R = B['stops'], B['routes']
dist = lambda a, b: math.dist(a, b)
pos = lambda n: (P[n]['x'], P[n]['z'])


def rename(old, new, en, st=None):
    if old not in P: return
    assert new not in P or new == old, new
    v = P.pop(old); v['en'] = en
    if st: v['st'] = st
    P[new] = v
    for r in R: r['stops'] = [new if x == old else x for x in r['stops']]
    if B.get('corr'): B.pop('corr')   # layout.py 會重算


# 1. 改名
rename('八坂台', '清水若宮', 'Shimizu-Wakamiya', '清水若宮')
rename('八坂三丁目', '若宮東', 'Wakamiya-higashi')
rename('八坂交番前', '柏原交番前', 'Kashiwabara Police Box')
rename('清水入口', '常盤入口', 'Tokiwa-iriguchi')
rename('清水西', '常盤西', 'Tokiwa-nishi')
rename('清水台', '常盤台', 'Tokiwadai')
rename('若宮橋', '千歳橋', 'Chitose-bashi')
rename('桂木中央', '咲海三丁目', 'Seiumi 3-chōme')
# 4. 高速鉄道咲海站前 → 滝井川站前；柏原商店街 → 連結桂木站
rename('咲海', '滝井川', 'Takiigawa', '滝井川')
if '柏原商店街' in P: P['柏原商店街']['st'] = '桂木'

# 2・3. 車站旁的站牌
near = {}
for n in list(P):
    if P[n].get('st'): continue
    z, q = min(ST.items(), key=lambda kv: dist(pos(n), kv[1]))
    if dist(pos(n), q) < 130: near[n] = z
moved = []
for n, z in near.items():
    dup = False
    for r in R:
        if n not in r['stops']: continue
        i = r['stops'].index(n); sts = r['stops']
        nb = [sts[j] for j in (i - 1, i + 1) if 0 <= j < len(sts)]
        stn = [x for x in nb if P[x].get('st') == z]
        if stn and len(nb) == 2:
            # 前輩指定了每條路線的站數，所以不刪站：把它挪到「車站」和另一側鄰站的中點，不再和車站擠在一起
            other = nb[0] if nb[1] in stn else nb[1]
            P[n]['x'] = round((P[stn[0]]['x'] + P[other]['x']) / 2); P[n]['z'] = round((P[stn[0]]['z'] + P[other]['z']) / 2)
            dup = True; break
    if dup: moved.append(n)
    else: P[n]['st'] = z
print('moved off station:', moved)
print('linked:', [n for n in near if n not in moved])

# 5. 新路線 407
SPEED = 260
def line(a, b, names, ens):
    pa, pb = (ST[a] if a in ST else pos(a)), (ST[b] if b in ST else pos(b))
    k = len(names) + 1
    for i, (nm, en) in enumerate(zip(names, ens), 1):
        assert nm not in P, nm
        P[nm] = {'x': round(pa[0] + (pb[0] - pa[0]) * i / k), 'z': round(pa[1] + (pb[1] - pa[1]) * i / k), 'en': en}
    return names
if not any(r['no'] == '407' for r in R):
    if '南滝井川' not in P: P['南滝井川'] = {'x': round(ST['南滝井川'][0]) + 40, 'z': round(ST['南滝井川'][1]) + 30, 'en': 'Minami-Takiigawa', 'st': '南滝井川'}
    seq = ['東平倉'] + line('東平倉', '清水若宮', ['宮田東', '平倉東町'], ['Miyata-higashi', 'Heikura-higashimachi']) + ['清水若宮'] \
        + line('清水若宮', '南滝井川', ['若宮北', '若宮小學校前', '河原町', '河原町公園前', '瀧見台', '滝井橋', '河岸通'],
               ['Wakamiya-kita', 'Wakamiya Elementary School', 'Kawara-machi', 'Kawara-machi Park', 'Takimidai', 'Takii-bashi', 'Kashi-dōri']) + ['南滝井川']
    t = [max(1, round(dist(pos(a), pos(b)) / SPEED)) for a, b in zip(seq, seq[1:])]
    R.append({'no': '407', 'hub': '東平倉', 'loop': False, 'express': False, 'name': '', 'stops': seq, 't': t, 'hw': 60, 'minor': True})
    print('407:', len(seq), 'stops', sum(t), 'min')

B['v'] = '2.12.0'
for r in R: assert len(set(r['stops'])) == len(r['stops']) or r['loop'], r['no']
json.dump(B, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('routes', len(R), 'stops', len(P))
