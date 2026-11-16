# 用法: python3 make_logo.py base_fixed.png outdir   (base 為 1920x501 RGBA，文字黑、鶴白+黃、六色塊)
import sys, numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')).astype(int)
H, W = a.shape[:2]
rgb, al = a[:,:,:3], a[:,:,3]
X = np.arange(W)[None,:].repeat(H,0)
white = (rgb.min(2) > 200) & (al > 0)
black = (rgb.max(2) < 60) & (al > 0)
crane_white = white & (X < 500)
chip_white = white & (X >= 500) & (X < 800)
G = (31,107,84); T = (24,32,29)

def save(arr, name, crop=None, size=None):
    im = Image.fromarray(arr.astype('uint8'), 'RGBA')
    bb = im.getbbox(); im = im.crop(bb) if crop is None else im.crop(crop)
    im.save(f'{out}/{name}.png')
    if size:
        h = int(im.height*size/im.width); im.resize((size,h), Image.LANCZOS).save(f'{out}/{name}-{size}.png')
    return bb

# 深色版（置於深色/照片底）：文字白
d = a.copy(); d[black,:3] = 255
bb = save(d, 'logo-dark', size=960)
# 淺色版（置於白底）：鶴白→綠、文字→墨、白色塊加灰框
l = a.copy(); l[crane_white,:3] = G; l[black,:3] = T
# 白色色塊外框：以該塊 alpha 外擴 3px 的環填灰
m = Image.fromarray((chip_white*255).astype('uint8'))
ring = np.array(m.filter(ImageFilter.MaxFilter(7))) > 0
ring &= ~chip_white
sel = ring & (al == 0)
l[sel] = [150,160,156,255]
save(l, 'logo-light', size=960)
# 標誌（鶴）
for nm, arr in (('mark-dark', d), ('mark-light', l)):
    t = arr.copy(); t[:, 500:, 3] = 0
    save(t, nm)
print('bbox', bb)
