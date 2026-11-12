#!/usr/bin/env python3
"""
把 anymodelbot_design/logo avator/ 里的毛绒机器人原图（6 个基础角色 + 专家/ 下的 12 个领域专家 + 目录/ 下的 4 个目录 Bot 专属形象）拆成可动的图层，输出 ui/design/bots/<key>.webp。

每个角色一张横向精灵图，8 格，每格 CELL×CELL，坐标系相同（叠在一起就是原图）：
  0 head      头（不含耳朵和头顶配件；面罩上的眼睛已抹掉，眼睛由 avatar.js 用 SVG 画，才能眨眼、换表情）
  1 earL      左耳（向头里多留一截，转动时不露缝；头那一层盖住多出来的部分）
  2 earR      右耳
  3 top       头顶配件（天线球 / 星星 / 嫩芽 / 角 / 宝石 / 天线），同样向头里多留一截
  4–7         上面四层各自的"发光部分"（哒哒的灯带、晶晶的霓虹线），没有就是空的

分档：<key>.webp 每格 448（CELL），另有 <key>@224 / @112 / @56.webp（TIERS，每档是上一档的一半），都从原图直接缩出来。
界面按"显示尺寸 × 设备像素比"挑最小的够用的一档（ui/components/avatar.js 的 SPRITE_TIERS、官网 BotFace.astro），
浏览器最多再缩一倍：一张 448 的图实时缩到 20–40px，绒毛边缘会出锯齿，动起来还会闪。
边缘：原画轮廓外圈半透明的毛尖带背光，比身体亮得多，贴到暗色界面上是一圈浅色毛刺；clean_edge 把它换成内侧绒毛的颜色。
内侧的轮廓光大图上保留（立体感），112 / 56 档缩到 1px 左右会变成一圈浅色描边，soften_rim 把这一圈压暗。

只用 numpy + Pillow：  python3 scripts/build-bot-avatars.py [角色 ...]（不写角色就全部重新生成）
官网的 AVIF 版要从无损的精灵图编码（site/scripts/make-bot-avif.ts）：  python3 scripts/build-bot-avatars.py --out <目录> --png
  --out 改输出目录（默认 ui/design/bots），--png 每档另存一份无损 PNG
几何（源图像素）和 ui/components/avatar.js 里的 BOT_CHARS 是同一套数，改一边要改另一边。
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "anymodelbot_design", "logo avator")
OUT = os.path.join(ROOT, "ui", "design", "bots")

# 源图 1536×1024。取以 (767, 511) 为中心、边长 1290 的正方形（刚好装下最宽的哒哒），缩到 CELL。
SIDE, CX, CY = 1290, 767, 511
CELL = 448
QUALITY = 86
TIERS = (224, 112, 56)  # 小档；改了要同步 avatar.js 的 SPRITE_TIERS 和官网 BotFace.astro
RIM_MAX = 112  # 这一档及更小的档压暗内侧轮廓光（soften_rim）

CHARS = {
    # eyes: 两眼中心；er: 眼睛半径；patch: 抹眼睛（连同光晕）的实心 / 渐隐半径（× er）
    # visor: 面罩 x0, y0, x1, y1, 圆角（抹眼睛只在面罩里进行，不碰外圈绒毛）
    # ear: cutL/cutR 是头的侧边（耳朵和头的分界），y0–y1 是耳朵的纵向范围
    # top: x0–x1 × (0, cut) 是配件；stem 是配件插进头里的那一段（多留的部分只在这段宽度里）
    # keep: 抹眼睛时要保住的椭圆（闪闪面罩上的腮红）
    # glow: 发光部分 = (通道, 从, 到, 出现在哪些层：h 头 / l 左耳 / r 右耳 / t 配件)
    "blue": dict(src="主-蓝色.png", eyes=[(622.7, 678.6), (906.6, 678.6)], er=44, patch=(1.5, 2.3), visor=(460, 532, 1075, 820, 140),
                 ear=dict(cutL=356, cutR=1179, y0=515, y1=822), top=dict(x0=630, x1=900, cut=276, stem=(718, 815))),
    "yellow": dict(src="黄色小萌.png", eyes=[(622.7, 679.3), (908.5, 679.3)], er=46, patch=(1.6, 2.4), visor=(458, 531, 1076, 821, 140),
                   keep=[(538, 746, 52, 31), (997, 746, 52, 31)],
                   ear=dict(cutL=353, cutR=1183, y0=510, y1=825), top=dict(x0=625, x1=910, cut=270, stem=(715, 820))),
    "green": dict(src="绿草.png", eyes=[(622.6, 679.6), (910.0, 679.7)], er=45, patch=(1.5, 2.3), visor=(458, 532, 1078, 820, 140),
                  ear=dict(cutL=353, cutR=1180, y0=512, y1=838), top=dict(x0=520, x1=1035, cut=270, stem=(722, 812))),
    "red": dict(src="红魔.png", eyes=[(606.1, 632.9), (924.9, 632.8)], er=50, patch=(1.6, 2.4), visor=(432, 478, 1104, 785, 150),
                ear=dict(cutL=374, cutR=1160, y0=380, y1=850), top=dict(x0=645, x1=890, cut=232, stem=(660, 875)),
                glow=("g", 70, 140, "lrt")),
    "purple": dict(src="紫钻.png", eyes=[(623.0, 679.5), (908.0, 679.5)], er=45, patch=(1.5, 2.3), visor=(470, 550, 1068, 812, 130),
                   ear=dict(cutL=356, cutR=1179, y0=520, y1=835), top=dict(x0=640, x1=890, cut=290, stem=(700, 830)),
                   glow=("g", 80, 170, "hlrt")),
    "orange": dict(src="橙色探险者.png", eyes=[(615.0, 663.0), (920.0, 663.0)], er=46, patch=(1.6, 2.4), visor=(447, 517, 1090, 805, 90),
                   ear=dict(cutL=324, cutR=1210, y0=488, y1=830), top=dict(x0=655, x1=880, cut=220, stem=(695, 842))),
    # —— 12 个领域专家（anymodelbot_design/logo avator/专家/）：几何是从图上量出来再核对过的，字段同上 ——
    "law": dict(src="专家/法律-衡衡.png", eyes=[(622.6, 678.2), (907.4, 678.2)], er=44, patch=(1.6, 2.4), visor=(463, 533, 1071, 816, 135),
                ear=dict(cutL=360, cutR=1172, y0=516, y1=821), top=dict(x0=541, x1=985, cut=278, stem=(708, 819))),
    "health": dict(src="专家/医疗健康-安安.png", eyes=[(623.8, 660.2), (909.1, 660.1)], er=44, patch=(1.6, 2.4), visor=(465, 517, 1070, 792, 132),
                ear=dict(cutL=349, cutR=1183, y0=499, y1=794), top=dict(x0=622, x1=913, cut=253, stem=(723, 811))),
    "finance": dict(src="专家/金融-元元.png", eyes=[(621.2, 677.4), (907.5, 677.3)], er=44, patch=(1.6, 2.4), visor=(461, 533, 1067, 816, 135),
                ear=dict(cutL=355, cutR=1171, y0=501, y1=821), top=dict(x0=631, x1=887, cut=263, stem=(705, 814))),
    "code": dict(src="专家/编程-码码.png", eyes=[(623.2, 677.7), (907.1, 677.8)], er=44, patch=(1.6, 2.4), visor=(475, 545, 1058, 801, 122),
                ear=dict(cutL=360, cutR=1170, y0=512, y1=820), top=dict(x0=592, x1=939, cut=270, stem=(711, 820)), glow=("g", 175, 240, "hlrt")),
    "design": dict(src="专家/设计-彩彩.png", eyes=[(622.7, 677.0), (908.3, 677.1)], er=45, patch=(1.6, 2.4), visor=(464, 534, 1069, 812, 133),
                ear=dict(cutL=357, cutR=1171, y0=509, y1=819), top=dict(x0=588, x1=966, cut=273, stem=(714, 818))),
    "writing": dict(src="专家/写作-墨墨.png", eyes=[(624.8, 678.2), (911.1, 678.1)], er=45, patch=(1.6, 2.4), visor=(474, 547, 1061, 803, 122),
                ear=dict(cutL=367, cutR=1168, y0=520, y1=822), top=dict(x0=636, x1=900, cut=292, stem=(714, 822))),
    "education": dict(src="专家/教育-学学.png", eyes=[(621.8, 643.3), (910.9, 643.2)], er=44, patch=(1.6, 2.4), visor=(463, 503, 1069, 783, 134),
                ear=dict(cutL=355, cutR=1173, y0=484, y1=790), top=dict(x0=490, x1=1039, cut=242, stem=(712, 826))),
    "science": dict(src="专家/科研-泡泡.png", eyes=[(621.2, 678.6), (905.9, 678.6)], er=44, patch=(1.6, 2.4), visor=(463, 533, 1067, 816, 135),
                ear=dict(cutL=360, cutR=1172, y0=519, y1=819), top=dict(x0=642, x1=890, cut=275, stem=(705, 824))),
    "data": dict(src="专家/数据分析-数数.png", eyes=[(620.7, 678.7), (904.9, 678.8)], er=44, patch=(1.6, 2.4), visor=(461, 532, 1068, 817, 136),
                ear=dict(cutL=358, cutR=1171, y0=521, y1=820), top=dict(x0=625, x1=902, cut=278, stem=(701, 807))),
    "marketing": dict(src="专家/营销-响响.png", eyes=[(622.5, 678.4), (906.7, 678.4)], er=46, patch=(1.6, 2.4), visor=(465, 535, 1068, 815, 134),
                ear=dict(cutL=360, cutR=1173, y0=519, y1=819), top=dict(x0=637, x1=970, cut=275, stem=(719, 807))),
    "cooking": dict(src="专家/烹饪-香香.png", eyes=[(620.9, 672.5), (913.5, 672.6)], er=46, patch=(1.6, 2.4), visor=(464, 531, 1073, 811, 134),
                ear=dict(cutL=359, cutR=1175, y0=505, y1=819), top=dict(x0=500, x1=1035, cut=293, stem=(598, 939))),
    "translate": dict(src="专家/翻译-通通.png", eyes=[(622.4, 685.8), (907.8, 685.8)], er=44, patch=(1.6, 2.4), visor=(465, 542, 1068, 822, 134),
                ear=dict(cutL=362, cutR=1171, y0=529, y1=827), top=dict(x0=632, x1=901, cut=283, stem=(726, 789))),
    # —— 4 个目录 Bot 的专属形象（anymodelbot_design/logo avator/目录/）：gpt-image-2.5 以「数数」为参考图编辑生成，
    #    绿幕抠图后按两眼对齐到专家的标准眼位，几何量过再核对过。咔咔的面罩外圈有一道白色缝线，面罩只量到缝线以内 ——
    "slides": dict(src="目录/PPT大师-演演.png", eyes=[(622.7, 677.9), (907.5, 678.0)], er=45, patch=(1.6, 2.4), visor=(465, 538, 1071, 812, 133),
                ear=dict(cutL=361, cutR=1173, y0=527, y1=813), top=dict(x0=529, x1=992, cut=284, stem=(699, 813))),
    "film": dict(src="目录/影视创作室-咔咔.png", eyes=[(622.7, 678.0), (907.5, 678.1)], er=45, patch=(1.6, 2.4), visor=(485, 559, 1055, 792, 110),
                ear=dict(cutL=361, cutR=1173, y0=523, y1=807), top=dict(x0=589, x1=951, cut=288, stem=(703, 818))),
    "dossier": dict(src="目录/尽调助手-察察.png", eyes=[(622.7, 677.9), (907.5, 678.2)], er=45, patch=(1.6, 2.4), visor=(465, 537, 1072, 812, 133),
                ear=dict(cutL=361, cutR=1175, y0=527, y1=811), top=dict(x0=584, x1=1027, cut=286, stem=(698, 818))),
    "ticker": dict(src="目录/美股研报-盘盘.png", eyes=[(622.7, 678.0), (907.5, 678.0)], er=44, patch=(1.6, 2.4), visor=(463, 538, 1070, 812, 133),
                ear=dict(cutL=364, cutR=1170, y0=528, y1=809), top=dict(x0=587, x1=956, cut=289, stem=(702, 812))),
}


def ramp(v, a, b):
    """a→b 之间从 0 平滑到 1（a > b 时反过来）"""
    t = np.clip((v - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def blur(x, r=6, passes=3):
    """近似高斯模糊（三次盒式模糊，σ ≈ 6.5px），边界按边缘值延伸"""
    for _ in range(passes):
        for ax in (0, 1):
            c = np.cumsum(np.pad(x, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode="edge"), axis=ax)
            n = c.shape[ax]
            x = (np.take(c, np.arange(2 * r + 1, n), axis=ax) - np.take(c, np.arange(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return x


def clean_edge(rgb, alpha):
    """去掉轮廓外圈的亮边：半透明的毛尖改用紧挨着的内侧绒毛颜色（越透明换得越多），形状不动。

    原画的绒毛带背光，最外面一圈毛尖比身体亮得多（深色角色尤其明显），贴到暗色界面上就是一圈断断续续的浅色描边，缩小后成了"毛刺"。
    内侧颜色取往里收 4px 的实心区域的模糊平均（避开亮边本身）；只处理离大块实心区域 10px 以内的像素，
    细链子、羽毛绒丝、离得远的光晕（闪闪的星星）这些本来就该半透明的部分保持原样。
    alpha 只去掉几乎看不见的残影；原图内部是 253 不是 255，顺便补满。
    """
    solid = np.asarray(Image.fromarray(((alpha > 0.97) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(9))).astype(np.float32) / 255.0
    near = blur(solid)
    inner = np.dstack([blur(rgb[..., i] * solid) for i in range(3)]) / np.maximum(near, 1e-6)[..., None]
    k = ((1 - ramp(alpha, 0.3, 0.99)) * ramp(near, 0.003, 0.03))[..., None]
    return rgb * (1 - k) + inner * k, np.clip((alpha - 0.02) / 0.96, 0.0, 1.0)


def soften_rim(rgb, alpha, d):
    """小档用：把轮廓内侧约 d 像素（缩小后的 1 像素）宽的轮廓光拉向更里面的绒毛颜色。

    原画的轮廓光从边缘往里渐暗约 30px，大图上是立体感；缩到 112 / 56 档只剩 1px 左右，和边缘混成一圈浅色描边（深色角色最明显）。
    只处理大块的身体：先往里收再放回去（开运算），比 3d 细的部件（天线杆、链子、硬币、羽毛）不在里面，颜色不动。
    形态学用"模糊后取阈值"近似：三次盒式模糊的 σ ≈ r，取 0.97 / 0.03 约等于往里收 / 往外放 1.9σ ≈ 1.5d。
    """
    r = max(int(round(d * 0.8)), 1)
    solid = (alpha > 0.5).astype(np.float32)
    deep = (blur(solid, r) > 0.97).astype(np.float32)
    body = blur((blur(deep, r) > 0.03).astype(np.float32), 2)
    near = blur(deep, r)
    inner = np.dstack([blur(rgb[..., i] * deep, r) for i in range(3)]) / np.maximum(near, 1e-6)[..., None]
    depth = blur(solid, max(r // 2, 1))  # 边缘处 0.5，往里约 0.66d 到 0.95
    k = ((1 - ramp(depth, 0.5, 0.95)) * body * ramp(near, 0.003, 0.03))[..., None]
    return rgb * (1 - k) + inner * k


def refine_eyes(rgb, eyes, er):
    """在给定位置附近找亮斑的质心，修正手量的眼睛中心"""
    v = rgb.max(axis=2).astype(np.float32)
    out = []
    for ex, ey in eyes:
        x0, y0 = int(ex - er * 1.6), int(ey - er * 1.6)
        win = v[y0 : y0 + int(er * 3.2), x0 : x0 + int(er * 3.2)]
        m = win > 225
        ys, xs = np.nonzero(m)
        if len(xs) < 50:
            out.append((ex, ey))
            continue
        out.append((x0 + xs.mean(), y0 + ys.mean()))
    return out


def rounded_rect(xx, yy, x0, y0, x1, y1, rr, inset):
    """圆角矩形内为 1（向内收 inset，边缘 6px 渐变）"""
    x0, y0, x1, y1, rr = x0 + inset, y0 + inset, x1 - inset, y1 - inset, max(rr - inset, 1)
    qx = np.maximum(np.maximum(x0 + rr - xx, xx - (x1 - rr)), 0)
    qy = np.maximum(np.maximum(y0 + rr - yy, yy - (y1 - rr)), 0)
    d = np.hypot(qx, qy) - rr
    inside_box = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    return np.where(inside_box, ramp(d, 0, -6), 0.0)


def paint_out_eyes(rgb, c):
    """用两眼正中间一条干净的面罩绒毛（镜像平铺）盖住眼睛和它在面罩上的光晕"""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    (ax, ay), (bx, by) = c["eyes"]
    mx, my = int(round((ax + bx) / 2)), int(round((ay + by) / 2))
    r = c["er"]
    hw = max(int((bx - ax) / 2 - r * 2.3), 16)
    tile = rgb[my - 90 : my + 90, mx - hw : mx + hw].astype(np.float32)
    tile = np.concatenate([tile, tile[:, ::-1]], axis=1)
    tile = np.concatenate([tile, tile[::-1]], axis=0)
    th, tw = tile.shape[:2]
    ty = ((np.arange(h) - (my - 90)) % th)[:, None]
    tx = ((np.arange(w) - (mx - hw)) % tw)[None, :]
    tex = tile[ty, tx]
    x0, y0, x1, y1, rr = c["visor"]
    m = np.zeros((h, w), np.float32)
    for ex, ey in c["eyes"]:
        m = np.maximum(m, 1 - ramp(np.hypot(xx - ex, yy - ey), r * c["patch"][0], r * c["patch"][1]))
    m *= rounded_rect(xx, yy, x0, y0, x1, y1, rr, 10)
    for kx, ky, krx, kry in c.get("keep", []):
        m *= ramp(((xx - kx) / krx) ** 2 + ((yy - ky) / kry) ** 2, 1.0, 1.6)
    return rgb.astype(np.float32) * (1 - m[..., None]) + tex * m[..., None]


def build(key, c):
    im = Image.open(os.path.join(SRC, c["src"])).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = clean_edge(a[..., :3], a[..., 3] / 255.0)
    c = dict(c, eyes=refine_eyes(rgb, c["eyes"], c["er"]))
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    f = 3.0  # 切口羽化（源图像素）
    ext = 42.0  # 向头里多留的长度

    e, t = c["ear"], c["top"]
    in_ear_y = ramp(yy, e["y0"] - 8, e["y0"] + 8) * (1 - ramp(yy, e["y1"] - 8, e["y1"] + 8))
    ear_l = ramp(xx, e["cutL"] + f, e["cutL"] - f)  # x < cutL → 1
    ear_r = ramp(xx, e["cutR"] - f, e["cutR"] + f)
    in_top_x = ramp(xx, t["x0"] - f, t["x0"] + f) * (1 - ramp(xx, t["x1"] - f, t["x1"] + f))
    top = in_top_x * ramp(yy, t["cut"] + f, t["cut"] - f)

    head_m = alpha * (1 - ear_l) * (1 - ear_r) * (1 - top)
    earL_m = alpha * ramp(xx, e["cutL"] + ext, e["cutL"] + ext - 10) * in_ear_y
    earR_m = alpha * ramp(xx, e["cutR"] - ext, e["cutR"] - ext + 10) * in_ear_y
    stem_x = ramp(xx, t["stem"][0] - 6, t["stem"][0] + 6) * (1 - ramp(xx, t["stem"][1] - 6, t["stem"][1] + 6))
    top_m = alpha * np.maximum(top, stem_x * ramp(yy, t["cut"] + ext, t["cut"] + ext - 10))

    # 发光部分：按通道取色，并避开绒毛外缘（外缘被背光照亮，颜色和灯带相近）
    g = np.zeros_like(alpha)
    parts = ""
    if "glow" in c:
        ch, lo, hi, parts = c["glow"]
        inner = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(25))) / 255.0
        g = ramp(rgb[..., "rgb".index(ch)], lo, hi) * inner
    zone_l, zone_r, zone_t = ear_l * in_ear_y, ear_r * in_ear_y, top
    zone_h = np.clip(1 - zone_l - zone_r - zone_t, 0, 1)
    eye_d = np.min([np.hypot(xx - ex, yy - ey) for ex, ey in c["eyes"]], axis=0)
    on = lambda p: 1.0 if p in parts else 0.0
    g_head = g * zone_h * ramp(eye_d, c["er"] * c["patch"][1], c["er"] * c["patch"][1] + 6) * on("h")

    masks = [head_m, earL_m, earR_m, top_m, g_head, g * zone_l * on("l"), g * zone_r * on("r"), g * zone_t * on("t")]
    x0, y0 = CX - SIDE // 2, CY - SIDE // 2

    def canvases_of(col):
        """按这套颜色拼出 8 层（原图尺寸）；头那一层抹掉眼睛"""
        out = []
        for i, m in enumerate(masks):
            layer = np.dstack([np.clip(paint_out_eyes(col, c) if i == 0 else col, 0, 255), np.clip(m * 255, 0, 255)]).astype(np.uint8)
            canvas = Image.new("RGBA", (SIDE, SIDE), (0, 0, 0, 0))
            canvas.paste(Image.fromarray(layer, "RGBA"), (-x0, -y0))
            out.append(canvas)
        return out

    full = canvases_of(rgb)
    os.makedirs(OUT, exist_ok=True)
    sizes = []
    for cell in (CELL, *TIERS):
        canvases = canvases_of(soften_rim(rgb, alpha, SIDE / cell)) if cell <= RIM_MAX else full
        sheet = Image.new("RGBA", (cell * len(canvases), cell), (0, 0, 0, 0))
        for i, canvas in enumerate(canvases):
            # Pillow 缩放 RGBA 时自己会先预乘 alpha（透明处原图的黑底不会渗进绒毛边缘），不要再手动预乘：
            # 预乘两次 = 颜色按 alpha² 加权，半透明边缘的颜色被量化成黑点
            sheet.paste(canvas.resize((cell, cell), Image.LANCZOS), (i * cell, 0))
        name = key if cell == CELL else f"{key}@{cell}"
        path = os.path.join(OUT, name + ".webp")
        if cell == CELL:
            sheet.save(path, "WEBP", quality=QUALITY, alpha_quality=90, method=6)
        elif cell >= 200:
            sheet.save(path, "WEBP", quality=90, alpha_quality=100, method=6)  # 无损要 2.5 倍体积；q90 的 PSNR 不低于 448 档
        else:
            sheet.save(path, "WEBP", lossless=True, method=6)  # 小档只有几 KB，无损：边缘不受色度抽样影响
        if PNG:
            sheet.save(os.path.join(OUT, name + ".png"))
        sizes.append(f"{os.path.getsize(path) // 1024}")

    k = CELL / SIDE
    to = lambda x, y: (round((x - x0) * k / CELL * 100, 2), round((y - y0) * k / CELL * 100, 2))
    eyes = [tuple(float(v) for v in to(*p)) for p in c["eyes"]]
    print(f"{key}: {'/'.join(sizes)}KB eyes={eyes} r={round(c['er'] * k / CELL * 100, 2)}% "
          f"earL={to(e['cutL'], (e['y0'] + e['y1']) / 2)} earR={to(e['cutR'], (e['y0'] + e['y1']) / 2)} "
          f"top={to((t['stem'][0] + t['stem'][1]) / 2, t['cut'])}")


PNG = False

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--out" in args:
        i = args.index("--out")
        OUT = os.path.abspath(args[i + 1])
        del args[i:i + 2]
    if "--png" in args:
        PNG = True
        args.remove("--png")
    for key in args or CHARS:
        build(key, CHARS[key])
