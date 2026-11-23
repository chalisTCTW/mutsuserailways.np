import math, random, sys
from PIL import Image, ImageDraw, ImageFilter

S = 2
W, H = 960 * S, 640 * S
EYE = 1.35
F = 760 * S
CZ = 1.1
CX, CY = W / 2, H * 0.46
RW, RH, RD = 4.4, 2.7, 4.8


def P(x, y, z):
    k = F / (z + CZ)
    return (CX + x * k, CY - (y - EYE) * k)


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


class R:
    def __init__(s, seed):
        s.im = Image.new('RGB', (W, H))
        s.d = ImageDraw.Draw(s.im)
        s.r = random.Random(seed)

    def poly(s, pts, c, outline=None):
        s.d.polygon([P(*p) for p in pts], fill=c, outline=outline)

    def quad_grad(s, pts, c0, c1, steps=24):
        a, b, cc, d = pts
        for i in range(steps):
            t0, t1 = i / steps, (i + 1) / steps
            L = lambda p, q, t: tuple(p[k] + (q[k] - p[k]) * t for k in range(3))
            s.poly([L(a, d, t0), L(b, cc, t0), L(b, cc, t1), L(a, d, t1)], mix(c0, c1, (t0 + t1) / 2))

    def room(s, wall, floor, ceil, floor_kind='carpet'):
        x0, x1 = -RW / 2, RW / 2
        s.quad_grad([(x0, RH, 0), (x1, RH, 0), (x1, RH, RD), (x0, RH, RD)], shade(ceil, .9), ceil)
        s.quad_grad([(x0, 0, RD), (x1, 0, RD), (x1, RH, RD), (x0, RH, RD)], shade(wall, 1.02), shade(wall, .96))
        s.quad_grad([(x0, 0, 0), (x0, 0, RD), (x0, RH, RD), (x0, RH, 0)], shade(wall, .78), shade(wall, .92))
        s.quad_grad([(x1, 0, 0), (x1, 0, RD), (x1, RH, RD), (x1, RH, 0)], shade(wall, .74), shade(wall, .9))
        s.quad_grad([(x0, 0, 0), (x1, 0, 0), (x1, 0, RD), (x0, 0, RD)], shade(floor, 1.05), shade(floor, .82))
        if floor_kind == 'tatami':
            for i in range(1, 8):
                z = RD * i / 8
                s.d.line([P(x0, 0, z), P(x1, 0, z)], fill=shade(floor, .7), width=2 * S)
            for i in range(1, 4):
                x = x0 + RW * i / 4
                s.d.line([P(x, 0, 0), P(x, 0, RD)], fill=shade(floor, .7), width=2 * S)
        elif floor_kind == 'wood':
            for i in range(1, 14):
                x = x0 + RW * i / 14
                s.d.line([P(x, 0, 0), P(x, 0, RD)], fill=shade(floor, .86), width=S)
        for z in (RD,):
            s.d.line([P(x0, .08, z), P(x1, .08, z)], fill=shade(wall, .7), width=3 * S)

    def box(s, x0, x1, y0, y1, z0, z1, c, top=None):
        top = top or shade(c, 1.12)
        if y1 < EYE:
            s.poly([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], top)
        else:
            s.poly([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], shade(c, .7))
        if x0 > 0:
            s.poly([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], shade(c, .8))
        if x1 < 0:
            s.poly([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], shade(c, .8))
        s.poly([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], c)

    def view(s, x0, x1, y0, y1, kind, night=False):
        z = RD - .001
        sky0, sky1 = ((70, 120, 190), (190, 215, 240)) if not night else ((20, 30, 60), (60, 70, 110))
        s.quad_grad([(x0, y1, z), (x1, y1, z), (x1, y0, z), (x0, y0, z)], sky0, sky1)
        (ax, ay), (bx, by) = P(x0, y1, z), P(x1, y0, z)
        w, h = bx - ax, by - ay
        r = s.r
        if kind == 'sea':
            hz = ay + h * .62
            s.d.rectangle([ax, hz, bx, by], fill=(40, 105, 160))
            for i in range(10):
                yy = hz + (by - hz) * (i + 1) / 11
                xx = ax + r.random() * w * .7
                s.d.line([xx, yy, xx + w * .2, yy], fill=(150, 195, 225), width=S)
            s.d.polygon([(ax, hz), (ax + w * .28, hz - h * .1), (ax + w * .4, hz)], fill=(70, 110, 90))
        elif kind == 'mountain':
            pts = [(ax, by)]
            for i in range(9):
                pts.append((ax + w * i / 8, ay + h * (.38 + r.random() * .22)))
            pts.append((bx, by))
            s.d.polygon(pts, fill=(70, 115, 85))
            pts = [(ax, by)] + [(ax + w * i / 8, ay + h * (.62 + r.random() * .12)) for i in range(9)] + [(bx, by)]
            s.d.polygon(pts, fill=(45, 90, 60))
        elif kind == 'garden':
            s.d.rectangle([ax, ay + h * .55, bx, by], fill=(80, 130, 70))
            for i in range(6):
                cx_ = ax + w * (i + .5) / 6 + r.uniform(-8, 8) * S
                rr = h * r.uniform(.14, .24)
                s.d.ellipse([cx_ - rr, ay + h * .55 - rr * 1.4, cx_ + rr, ay + h * .55 + rr * .4], fill=(50 + r.randint(0, 30), 105 + r.randint(0, 30), 55))
        else:
            x = ax
            while x < bx:
                bw = w * r.uniform(.07, .15)
                bh = h * r.uniform(.25, .75)
                col = shade((150, 160, 175), r.uniform(.75, 1.1)) if not night else (40, 45, 70)
                s.d.rectangle([x, by - bh, x + bw, by], fill=col)
                for yy in range(int(by - bh + 6 * S), int(by), 9 * S):
                    for xx in range(int(x + 4 * S), int(x + bw - 4 * S), 9 * S):
                        if r.random() < (.5 if night else .25):
                            s.d.rectangle([xx, yy, xx + 3 * S, yy + 3 * S], fill=(255, 220, 140) if night else (205, 220, 235))
                x += bw + w * .01
        s.d.rectangle([ax, ay, bx, by], outline=(70, 70, 70), width=4 * S)
        s.d.line([(ax + bx) / 2, ay, (ax + bx) / 2, by], fill=(70, 70, 70), width=3 * S)

    def window(s, kind, x0=-1.5, x1=1.5, y0=.55, y1=2.3, curtain=(200, 185, 160)):
        s.view(x0, x1, y0, y1, kind)
        z = RD - .02
        s.poly([(x0 - .45, y0 - .05, z), (x0 + .05, y0 - .05, z), (x0 + .05, y1 + .12, z), (x0 - .45, y1 + .12, z)], curtain)
        s.poly([(x1 - .05, y0 - .05, z), (x1 + .45, y0 - .05, z), (x1 + .45, y1 + .12, z), (x1 - .05, y1 + .12, z)], shade(curtain, .92))
        for xx in (x0 - .35, x0 - .15, x1 + .15, x1 + .35):
            s.d.line([P(xx, y0, z), P(xx, y1 + .1, z)], fill=shade(curtain, .8), width=S)

    def shoji(s, kind):
        s.view(-1.6, 1.6, .2, 2.2, kind)
        z = RD - .02
        for x0, x1 in ((-2.2, -1.6), (1.6, 2.2)):
            s.poly([(x0, .1, z), (x1, .1, z), (x1, 2.3, z), (x0, 2.3, z)], (238, 232, 214))
            for i in range(1, 6):
                y = .1 + 2.2 * i / 6
                s.d.line([P(x0, y, z), P(x1, y, z)], fill=(150, 120, 85), width=S)
            s.d.line([P((x0 + x1) / 2, .1, z), P((x0 + x1) / 2, 2.3, z)], fill=(150, 120, 85), width=S)
        s.d.rectangle([*P(-2.2, 2.3, z), *P(2.2, .1, z)], outline=(120, 90, 60), width=4 * S)

    def bed(s, x0, x1, z1, length, cover=(245, 244, 240), runner=(120, 40, 50), frame=(110, 80, 55), head=True):
        z0 = z1 - length
        if head:
            s.box(x0 - .05, x1 + .05, 0, 1.15, z1, z1 + .08, frame)
        s.box(x0, x1, 0, .28, z0, z1, frame)
        s.box(x0 + .02, x1 - .02, .28, .55, z0 + .02, z1 - .02, cover, top=(252, 252, 250))
        s.box(x0 + .02, x1 - .02, .55, .565, z0 + .25, z0 + .62, runner)
        n = max(1, round((x1 - x0) / .7))
        pw = (x1 - x0 - .2) / n
        for i in range(n):
            a = x0 + .1 + i * pw
            s.box(a + .03, a + pw - .03, .55, .7, z1 - .5, z1 - .12, (255, 255, 255), top=(250, 250, 250))

    def stand(s, x, z, lamp=True):
        s.box(x - .22, x + .22, 0, .55, z - .4, z, (110, 80, 55))
        if lamp:
            s.box(x - .03, x + .03, .55, .8, z - .23, z - .17, (90, 90, 90))
            s.box(x - .13, x + .13, .8, 1.02, z - .32, z - .08, (250, 230, 190), top=(255, 245, 220))
            cx_, cy_ = P(x, .95, z - .2)
            g = Image.new('L', (W, H), 0)
            ImageDraw.Draw(g).ellipse([cx_ - 120 * S, cy_ - 90 * S, cx_ + 120 * S, cy_ + 90 * S], fill=70)
            g = g.filter(ImageFilter.GaussianBlur(50 * S))
            s.im.paste(Image.new('RGB', (W, H), (255, 220, 160)), mask=g)

    def desk(s, side, z0, z1):
        if side > 0:
            x0, x1 = RW / 2 - .6, RW / 2
        else:
            x0, x1 = -RW / 2, -RW / 2 + .6
        s.box(x0, x1, .72, .76, z0, z1, (120, 90, 60))
        s.box(x0 + .02, x1 - .02, 0, .72, z0 + .02, z0 + .06, (100, 75, 50))
        s.box(x0 + .02, x1 - .02, 0, .72, z1 - .06, z1 - .02, (100, 75, 50))
        mz = (z0 + z1) / 2
        xs = (x1 - .06, x1 - .03) if side > 0 else (x0 + .03, x0 + .06)
        s.box(xs[0], xs[1], 1.0, 1.75, mz - .45, mz + .45, (180, 190, 200))
        s.box(xs[0] - (.1 if side > 0 else -.1), xs[1] - (.1 if side > 0 else -.1), .9, 1.25, mz - .35, mz + .05, (30, 30, 35))

    def downlights(s, n=4):
        g = Image.new('L', (W, H), 0)
        dg = ImageDraw.Draw(g)
        for i in range(n):
            z = 1 + i * (RD - 1.5) / max(1, n - 1)
            x, y = P(0, RH, z)
            dg.ellipse([x - 40 * S, y - 10 * S, x + 40 * S, y + 10 * S], fill=180)
        g = g.filter(ImageFilter.GaussianBlur(14 * S))
        s.im.paste(Image.new('RGB', (W, H), (255, 245, 220)), mask=g)

    def vignette(s, warm=(255, 236, 205)):
        g = Image.new('L', (W, H), 0)
        ImageDraw.Draw(g).ellipse([W * .1, H * .05, W * .9, H * .95], fill=36)
        g = g.filter(ImageFilter.GaussianBlur(120 * S))
        s.im.paste(Image.new('RGB', (W, H), warm), mask=g)
        v = Image.new('L', (W, H), 0)
        ImageDraw.Draw(v).rectangle([0, 0, W, H], fill=90)
        ImageDraw.Draw(v).ellipse([-W * .1, -H * .1, W * 1.1, H * 1.1], fill=0)
        v = v.filter(ImageFilter.GaussianBlur(90 * S))
        s.im.paste(Image.new('RGB', (W, H), (20, 15, 10)), mask=v)

    def save(s, path):
        s.vignette()
        s.im.resize((W // S, H // S), Image.LANCZOS).save(path, 'WEBP', quality=80, method=6)


PAL = {
    'single': dict(wall=(236, 230, 220), floor=(120, 110, 100), ceil=(245, 243, 238), runner=(40, 80, 140)),
    'double': dict(wall=(232, 224, 210), floor=(140, 120, 100), ceil=(246, 244, 238), runner=(130, 40, 50)),
    'twin': dict(wall=(228, 228, 224), floor=(110, 115, 125), ceil=(246, 246, 244), runner=(30, 60, 100)),
    'suite': dict(wall=(222, 210, 190), floor=(95, 80, 70), ceil=(240, 236, 228), runner=(170, 130, 60)),
    'loft': dict(wall=(225, 205, 170), floor=(170, 130, 85), ceil=(200, 160, 110), runner=(60, 110, 70)),
}


def western(kind, viewk, seed, path):
    p = PAL[kind]
    r = R(seed)
    r.room(p['wall'], p['floor'], p['ceil'], 'wood' if kind == 'loft' else 'carpet')
    if kind == 'suite':
        r.window(viewk, -2.0, 2.0, .3, 2.4)
    else:
        r.window(viewk, -1.2 if kind != 'single' else -.9, 1.2 if kind != 'single' else .9)
    r.downlights(3)
    if kind == 'single':
        r.bed(-2.2, -1.2, RD - .3, 2.0, runner=p['runner'])
        r.stand(-.95, RD - .25)
        r.desk(1, RD - 2.6, RD - 1.0)
    elif kind == 'double':
        r.bed(-1.05, .75, RD - .1, 2.1, runner=p['runner'])
        r.stand(-1.45, RD - .1)
        r.stand(1.15, RD - .1)
        r.desk(1, 1.2, 2.6)
    elif kind == 'twin':
        r.bed(-1.95, -.85, RD - .1, 2.0, runner=p['runner'])
        r.bed(.85, 1.95, RD - .1, 2.0, runner=p['runner'])
        r.stand(0, RD - .1)
        r.desk(-1, 1.0, 2.2)
    elif kind == 'suite':
        r.bed(-1.7, .3, RD - .1, 2.2, runner=p['runner'], frame=(70, 55, 45))
        r.stand(-2.0, RD - .05)
        r.stand(.7, RD - .05)
        r.box(1.0, 2.2, 0, .42, 1.2, 3.4, (90, 100, 115))
        r.box(1.9, 2.2, .42, .85, 1.2, 3.4, (80, 90, 105))
        r.box(.1, .9, 0, .38, 1.6, 2.8, (60, 45, 35))
    elif kind == 'loft':
        r.box(-2.2, .2, 1.9, 2.05, 2.5, RD, (150, 105, 60))
        for i in range(6):
            x = -2.0 + i * .4
            r.box(x, x + .04, 2.05, 2.5, 2.5, 2.54, (120, 85, 50))
        r.box(.2, .26, 0, 2.05, 2.6, 2.66, (130, 90, 55))
        r.box(.6, .66, 0, 2.05, 2.6, 2.66, (130, 90, 55))
        for i in range(7):
            r.box(.2, .66, .25 + i * .28, .29 + i * .28, 2.6, 2.66, (130, 90, 55))
        r.bed(.9, 2.15, RD - .1, 2.0, runner=p['runner'], frame=(150, 110, 70))
        r.bed(-2.15, -.9, 2.3, 1.7, runner=p['runner'], frame=(150, 110, 70), head=False)
    r.save(path)


def japanese(kind, viewk, seed, path):
    r = R(seed)
    r.room((226, 214, 188), (196, 190, 130), (205, 180, 140), 'tatami')
    r.shoji(viewk)
    x0 = -RW / 2
    r.box(x0, x0 + .7, 0, .12, RD - 1.1, RD, (130, 95, 60))
    r.poly([(x0 + .01, .5, RD - .9), (x0 + .01, .5, RD - .4), (x0 + .01, 2.0, RD - .4), (x0 + .01, 2.0, RD - .9)], (240, 236, 222))
    r.d.line([P(x0 + .01, 1.6, RD - .65), P(x0 + .01, .9, RD - .65)], fill=(40, 40, 40), width=5 * S)
    r.box(x0 + .2, x0 + .45, .12, .42, RD - .8, RD - .55, (90, 110, 120))
    if kind in ('washitsu', 'rotenburo'):
        r.box(-.8, .8, .3, .36, 2.4, 3.6, (90, 55, 35))
        for (xa, xb) in ((-.75, -.25), (.25, .75)):
            r.box(xa, xb, .32, .36, 2.4, 3.6, (90, 55, 35))
        for x in (-.7, .7):
            r.box(x - .02, x + .02, 0, .3, 2.45, 2.5, (80, 50, 30))
            r.box(x - .02, x + .02, 0, .3, 3.5, 3.55, (80, 50, 30))
        for zz in (1.4, 3.6):
            r.box(-.35, .35, 0, .08, zz - .3, zz + .3, (150, 60, 60))
        r.box(-.25, -.05, .36, .46, 3.0, 3.15, (240, 240, 235))
        r.box(.05, .25, .36, .42, 2.9, 3.1, (70, 120, 80))
    if kind == 'wayou':
        r.bed(.6, 1.6, RD - .2, 2.0, runner=(60, 90, 60))
        r.bed(-.6, .4, RD - .2, 2.0, runner=(60, 90, 60))
        r.box(-1.9, -1.1, .3, .36, 1.2, 2.2, (90, 55, 35))
    if kind == 'rotenburo':
        x1 = RW / 2 - .01
        quad = [P(x1, 0, 1.6), P(x1, 0, 4.5), P(x1, 2.3, 4.5), P(x1, 2.3, 1.6)]
        out = Image.new('RGB', (W, H), (90, 140, 100))
        od = ImageDraw.Draw(out)
        hy = P(x1, .9, 3.0)[1]
        od.rectangle([0, 0, W, hy], fill=(120, 170, 215))
        for i in range(8):
            xx = W * .55 + i * W * .07
            od.polygon([(xx - 90 * S, hy), (xx, hy - r.r.randint(60, 150) * S), (xx + 90 * S, hy)], fill=(60, 105, 70))
        od.rectangle([0, hy, W, H], fill=(150, 115, 75))
        for k in range(0, H, 22 * S):
            od.line([0, hy + k, W, hy + k], fill=(130, 98, 62), width=2 * S)
        bx1, by0 = P(x1, .25, 4.2)
        by1 = min(H - 10 * S, P(x1, 0, 2.0)[1])
        od.ellipse([bx1 - 20 * S, by0, W + 300 * S, by1], fill=(110, 80, 55))
        od.ellipse([bx1, by0 + 18 * S, W + 280 * S, by1 - 18 * S], fill=(120, 175, 190))
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).polygon(quad, fill=255)
        r.im.paste(out, mask=m)
        g = Image.new('L', (W, H), 0)
        dg = ImageDraw.Draw(g)
        for i in range(14):
            x = bx1 + r.r.random() * (W - bx1)
            y = by0 - r.r.random() * 160 * S
            dg.ellipse([x - 40 * S, y - 30 * S, x + 40 * S, y + 30 * S], fill=110)
        g = g.filter(ImageFilter.GaussianBlur(26 * S))
        g = Image.composite(g, Image.new('L', (W, H), 0), m)
        r.im.paste(Image.new('RGB', (W, H), (255, 255, 255)), mask=g)
        r.d.line([P(x1, 0, 4.5), P(x1, 2.3, 4.5)], fill=(90, 65, 40), width=8 * S)
        r.d.line([P(x1, 2.3, 4.5), P(x1, 2.3, 1.6)], fill=(90, 65, 40), width=8 * S)
    r.downlights(2)
    r.save(path)


def main(out):
    import os
    os.makedirs(out, exist_ok=True)
    names = []
    for kind in ('single', 'double', 'twin', 'suite', 'loft'):
        for v in ('city', 'sea', 'mountain'):
            n = 'r-%s-%s.webp' % (kind, v)
            western(kind, v, n, os.path.join(out, n))
            names.append(n)
    for kind in ('washitsu', 'wayou', 'rotenburo'):
        for v in ('garden', 'sea', 'mountain'):
            n = 'r-%s-%s.webp' % (kind, v)
            japanese(kind, v, n, os.path.join(out, n))
            names.append(n)
    print(len(names))


if __name__ == '__main__':
    main(sys.argv[1])
