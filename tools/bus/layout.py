"""2.10.0 公車路線圖的方格版面（比鉄道路線圖更嚴格）：
  * 只有水平・垂直線段（90 度）。
  * 轉角一律在兩站之間的線段中間，車站本身不當轉角。
  * 重點站（routes.py 的 seq）吸附到方格；X、Y 各自依原本的前後順序排，保留相對位置。
  * 補滿用的站牌沿著兩個重點站之間的折線平均排列，所以也落在水平・垂直的線上。
  * 同一段（兩個重點站之間）有好幾條路線時，路徑完全相同，畫面上再並排偏移成平行線（bus.js）。
用法：python3 layout.py in.json out.json
輸出：stops[name].g = [gx, gy]（方格單位）、corr = { "A|B": {"a":A, "b":B, "pts":[[x,y]…]} }（A < B 的固定方向）。
"""
import json, sys, math
from routes import ROUTES

src, out = sys.argv[1], sys.argv[2]
D = json.load(open(src, encoding='utf-8'))
S = D['stops']
ANCH = set(s for r in ROUTES for s in r['seq'])
for r in D['routes']:                       # 端點一定是重點站
    ANCH.add(r['stops'][0]); ANCH.add(r['stops'][-1])
ANCH = [a for a in ANCH if a in S]
ANCHS = set(ANCH)


def compress(vals, cell, cap):
    """依大小排序；每個間隔換算成方格數（至少 1、最多 cap；差距很小視為同一行）。
    市中心站多、郊外站少：上限讓郊外不會拉得太長，市中心相對放大。回傳 值→欄號。"""
    order = sorted(set(vals))
    col, cur, prev = {}, 0, None
    for v in order:
        if prev is not None and v - prev >= cell * 0.35:
            cur += 1
        col[v] = cur; prev = v
    gaps = []   # gaps[i]＝第 i 欄到第 i+1 欄的方格數
    prevv = None; lastcol = 0
    for v in order:
        if prevv is not None and col[v] != lastcol:
            gaps.append(min(cap, max(1, round((v - prevv) / cell))))
        prevv = v; lastcol = col[v]
    return col, gaps

CELLC, CAP = 100, 3
colx, gx = compress([S[a]['x'] for a in ANCH], CELLC, CAP)
coly, gy = compress([S[a]['z'] for a in ANCH], CELLC, CAP)
CX = {a: colx[S[a]['x']] for a in ANCH}; CY = {a: coly[S[a]['z']] for a in ANCH}


def place_grid():
    px = [0]; [px.append(px[-1] + g) for g in gx]
    py = [0]; [py.append(py[-1] + g) for g in gy]
    G = {a: [px[CX[a]], py[CY[a]]] for a in ANCH}
    taken = {}
    for a in sorted(ANCH, key=lambda a: (S[a]['x'], S[a]['z'])):
        x, y = G[a]; k = 0
        while (x, y) in taken:
            k += 1
            free = [c for c in [(x + k, y), (x, y + k), (x - k, y), (x, y - k)] if c not in taken]
            if free: x, y = free[0]; break
        taken[(x, y)] = a; G[a] = [x, y]
    return G

# 走廊：路線上相鄰兩個重點站之間（中間的站牌＝補滿站）
corr = {}
for r in D['routes']:
    ring = r['stops'] + ([r['stops'][0]] if r['loop'] else [])
    idx = [i for i, s in enumerate(ring) if s in ANCHS]
    for u, v in zip(idx, idx[1:]):
        a, b = ring[u], ring[v]
        mids = ring[u + 1:v]
        key = '|'.join(sorted([a, b]))
        if a > b: mids = mids[::-1]
        c = corr.setdefault(key, {'a': min(a, b), 'b': max(a, b), 'mids': mids})
        if len(mids) > len(c['mids']): c['mids'] = mids

# 走廊太短（補滿站擠在一起）時，把兩站之間最寬的那個欄距／列距加大，重排幾輪
NEED = 0.9   # 每個站間至少 0.9 格
for it in range(12):
    G = place_grid(); grew = False
    for c in corr.values():
        a, b = c['a'], c['b']
        (ax, ay), (bx, by) = G[a], G[b]
        L = abs(bx - ax) + abs(by - ay); need = NEED * (len(c['mids']) + 1)
        if L + 1e-9 >= need: continue
        add = math.ceil(need - L)
        if abs(CX[a] - CX[b]) >= abs(CY[a] - CY[b]) and CX[a] != CX[b]:
            lo, hi = sorted([CX[a], CX[b]]); i = max(range(lo, hi), key=lambda i: gx[i]); gx[i] += add
        elif CY[a] != CY[b]:
            lo, hi = sorted([CY[a], CY[b]]); i = max(range(lo, hi), key=lambda i: gy[i]); gy[i] += add
        else: continue
        grew = True
    if not grew: break
G = place_grid()

# 走廊兩端各自的出入方向（H：水平進出站；V：垂直進出站）。
# 路線穿過一站時，前後兩段走廊在這站的方向一致、而且分在兩側，線就直直穿過站，不在站上轉彎或折返。
# 分歧站（不同路線往不同方向分開）沒辦法每條都直通，這時以使用該段的路線多數決。
vote = {}
def V(key, st, w): vote[(key, st)] = vote.get((key, st), 0) + w
for r in D['routes']:
    ring = r['stops'] + ([r['stops'][0]] if r['loop'] else [])
    an = [x for x in ring if x in ANCHS]
    if r['loop'] and len(an) > 2: an = an[-2:-1] + an
    for i in range(1, len(an) - 1):
        p, c, n = G[an[i - 1]], G[an[i]], G[an[i + 1]]
        k1 = '|'.join(sorted([an[i - 1], an[i]])); k2 = '|'.join(sorted([an[i], an[i + 1]]))
        dx1, dx2 = p[0] - c[0], n[0] - c[0]; dy1, dy2 = p[1] - c[1], n[1] - c[1]
        h = dx1 * dx2 < 0; v = dy1 * dy2 < 0
        if h and v: h, v = (True, False) if min(abs(dx1), abs(dx2)) >= min(abs(dy1), abs(dy2)) else (False, True)
        if h: V(k1, an[i], 10); V(k2, an[i], 10)
        elif v: V(k1, an[i], -10); V(k2, an[i], -10)
for key, c in corr.items():
    (ax, ay), (bx, by) = G[c['a']], G[c['b']]
    w = (abs(bx - ax) - abs(by - ay)) * 0.1
    V(key, c['a'], w); V(key, c['b'], w)
END = {k: ('H' if w >= 0 else 'V') for k, w in vote.items()}


def path(key):
    a, b = corr[key]['a'], corr[key]['b']
    (ax, ay), (bx, by) = G[a], G[b]
    if ax == bx or ay == by: return [[ax, ay], [bx, by]]
    A, B = END[(key, a)], END[(key, b)]
    if A == 'H' and B == 'H':
        m = (ax + bx) / 2; return [[ax, ay], [m, ay], [m, by], [bx, by]]
    if A == 'V' and B == 'V':
        m = (ay + by) / 2; return [[ax, ay], [ax, m], [bx, m], [bx, by]]
    if A == 'H':                       # 水平出去、垂直進來：轉角 (bx, ay)
        return [[ax, ay], [bx, ay], [bx, by]]
    return [[ax, ay], [ax, by], [bx, by]]


def place(pts, n):
    """沿折線平均放 n 個站牌，避開轉角（離轉角至少 0.35 格）。"""
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    L = sum(seg); corners = []
    acc = 0
    for s in seg[:-1]: acc += s; corners.append(acc)
    res = []
    for k in range(n):
        d = L * (k + 1) / (n + 1)
        for c in corners:
            if abs(d - c) < 0.35: d = c + (0.35 if d >= c else -0.35)
        acc = 0
        for i, s in enumerate(seg):
            if d <= acc + s or i == len(seg) - 1:
                t = (d - acc) / s if s else 0
                p = pts[i]; q = pts[i + 1]
                res.append([round(p[0] + (q[0] - p[0]) * t, 3), round(p[1] + (q[1] - p[1]) * t, 3)])
                break
            acc += s
    return res

pos = dict((a, list(G[a])) for a in G)
corr_out = {}
for key, c in corr.items():
    pts = path(key)
    for nm, p in zip(c['mids'], place(pts, len(c['mids']))):
        if nm not in pos: pos[nm] = p
    corr_out[key] = {'a': c['a'], 'b': c['b'], 'pts': pts, 'mids': c['mids']}

miss = [s for s in S if s not in pos]
assert not miss, miss
for s in S: S[s]['g'] = pos[s]
D['corr'] = corr_out
json.dump(D, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
print('anchors', len(G), 'corridors', len(corr_out), 'grid', max(xs) - min(xs), 'x', max(ys) - min(ys))
