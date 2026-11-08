from __future__ import annotations

import logging

import time

from pathlib import Path

logger = logging.getLogger(__name__)

STYLE_BOARD_PROMPT_HINT = (
    "另附画风参考图：只借鉴其色调、笔触、光影与整体气质，"
    "禁止复制该图的人物、场景主体与构图。"
)

_STYLE_BOARD_EXTS = (".png", ".jpg", ".jpeg", ".webp")

_board_url_cache: dict[tuple[str, int, int], str] = {}

_board_fail_cache: dict[tuple[str, int, int], float] = {}

_BOARD_FAIL_TTL_SEC = 60.0

IMAGE_STYLE_IDS = (
    "retro-sci-fi-atompunk",
    "palace-intrigue-cold",
    "domestic-suspense-cold",
    "ancient-romance-soft",
    "ancient-chinese-mythology",
    "japanese-youth-film",
    "japanese-daily-natural",
    "korean-urban-soft",
    "chinese-urban-realistic",
    "wuxia-realistic-photo",
    "90s-realistic-film",
    "retro-narrative-film",
    "american-retro-hollywood",
    "neon-cyberpunk-film",
    "90s-rural-china-film",
    "cgi-3d-animation",
    "ghibli-handdrawn-anime",
    "tezuka-era-cartoon",
    "shanghai-animation",
    "pixel-art",
    "shadow-puppet-illustration",
)

IMAGE_STYLE_PROMPTS: dict[str, str] = {
    "retro-sci-fi-atompunk": (
        "复古科幻原子朋克风格，1950年代未来主义美学，流线型金属与原子能符号，"
        "霓虹高光，金属质感，高对比色彩，轻微胶片颗粒"
    ),
    "palace-intrigue-cold": (
        "中国宫廷权谋题材冷峻风格，低饱和暗调，克制光影，庄重构图，"
        "华贵但压抑的宫廷氛围，硬朗轮廓，戏剧化侧光"
    ),
    "domestic-suspense-cold": (
        "国产悬疑影视冷调风格，偏青灰色调，低调光，阴影浓重，写实摄影质感，紧张压抑氛围，细节丰富"
    ),
    "ancient-romance-soft": (
        "中国古代偶像剧唯美柔光风格，梦幻柔焦，暖色薄纱光晕，精致古装妆造，背景虚化，浪漫飘逸氛围"
    ),
    "ancient-chinese-mythology": (
        "中国古代神话史诗风格，上古洪荒气质，苍茫山河与云雾神光，青铜礼器与粗纻麻衣质感，"
        "水墨青绿与矿物颜料色调，庄严神圣，史诗大场面，电影级光影，忌现代偶像剧柔光与甜宠滤镜"
    ),
    "japanese-youth-film": (
        "日式青春题材胶片摄影风格，柯达胶片色调，自然阳光，浅景深，细腻颗粒，青涩真挚的日常氛围"
    ),
    "japanese-daily-natural": (
        "日式生活纪录片自然光影风格，柔和自然光，低对比，真实日常场景，安静治愈，轻微胶片质感"
    ),
    "korean-urban-soft": "韩剧都市题材柔光风格，暖色滤镜，通透肤质，都市背景虚化，浪漫温柔灯光氛围",
    "chinese-urban-realistic": (
        "国产都市现实题材写实摄影风格，自然光，真实生活场景，中性色调，细节锐利，无过度美化"
    ),
    "wuxia-realistic-photo": (
        "中国武侠江湖题材写实摄影风格，自然光影，真实地形与服饰质感，动态构图，江湖氛围，电影级景深"
    ),
    "90s-realistic-film": (
        "1990年代写实电影风格，胶片质感，自然肤色，时代感服装与环境，柔和对比，怀旧色调"
    ),
    "retro-narrative-film": (
        "复古叙事电影风格，经典电影构图，胶片色彩分级，富有故事感的场景调度，电影级布光"
    ),
    "american-retro-hollywood": (
        "美式复古好莱坞黄金年代风格，高对比布光，暖调彩色或经典黑白，明星质感，华丽景深"
    ),
    "neon-cyberpunk-film": (
        "霓虹赛博朋克电影风格，蓝紫霓虹灯光，雨夜反射，高对比，未来都市，烟雾与全息感光效"
    ),
    "90s-rural-china-film": (
        "1990年代中国农村题材电影风格，自然光，土黄与绿色调，粗糙真实质感，乡土生活氛围"
    ),
    "cgi-3d-animation": (
        "电影级三维 CGI 动画风格，皮克斯/梦工厂气质，圆润造型与清晰轮廓，"
        "柔和体积光与次表面散射，干净材质与饱和配色，浅景深，"
        "非写实摄影、非日系赛璐璐平面、非剪纸扁平"
    ),
    "ghibli-handdrawn-anime": (
        "手绘二维动画电影气质，水彩与水粉背景，柔和自然光与金色黄昏，"
        "写实人体比例与朴素五官（非大眼睛赛璐璐美少女），生活化服饰，"
        "茂盛草木、风吹草地与流动云层，温暖土黄与青绿，空气透视与电影构图，"
        "非写实摄影、非3D CGI、非像素风、非剪纸扁平"
    ),
    "tezuka-era-cartoon": "手冢治虫时代经典日式卡通画风，简洁线条，复古动画平涂着色，怀旧动画质感",
    "shanghai-animation": (
        "上海美术电影制片厂经典动画画风，中国民族绘画韵味，水彩与工笔结合，诗意唯美，传统色彩"
    ),
    "pixel-art": "像素艺术风格，清晰像素块，复古游戏美学，有限色板，8-bit 或 16-bit 质感",
    "shadow-puppet-illustration": (
        "中国皮影戏插画画风，剪影轮廓，镂空纹理，暖色背光，民间艺术装饰性，层叠投影效果"
    ),
}

IMAGE_STYLE_LABELS: dict[str, str] = {
    "retro-sci-fi-atompunk": "复古科幻原子朋克",
    "palace-intrigue-cold": "宫斗权谋冷峻",
    "domestic-suspense-cold": "国产悬疑冷调",
    "ancient-romance-soft": "古偶唯美柔光",
    "ancient-chinese-mythology": "中国古代神话史诗",
    "japanese-youth-film": "日式青春胶片",
    "japanese-daily-natural": "日式生活自然",
    "korean-urban-soft": "韩剧都市柔光",
    "chinese-urban-realistic": "国产都市写实",
    "wuxia-realistic-photo": "武侠江湖写实摄影",
    "90s-realistic-film": "90年代写实电影",
    "retro-narrative-film": "复古叙事电影",
    "american-retro-hollywood": "美式复古好莱坞",
    "neon-cyberpunk-film": "霓虹赛博电影",
    "90s-rural-china-film": "90年代中国农村电影",
    "cgi-3d-animation": "3D 动画",
    "ghibli-handdrawn-anime": "宫崎骏气质手绘",
    "tezuka-era-cartoon": "手冢治虫时代卡通画风",
    "shanghai-animation": "上美画风",
    "pixel-art": "像素风",
    "shadow-puppet-illustration": "皮影戏插画",
}

def get_image_style_label(style_id: str) -> str:
    return IMAGE_STYLE_LABELS.get(style_id, style_id)

def resolve_image_style_prompt(style_id: str | None = None) -> str:
    if not style_id:
        return ""
    return IMAGE_STYLE_PROMPTS.get(style_id, "")

# AnyModelBot: the four public short-video templates share the style selector.
import json
SHORT_TEMPLATES = json.loads((Path(__file__).resolve().parents[2] / "references/short-styles.json").read_text(encoding="utf-8"))
IMAGE_STYLE_LABELS.update({k: v["name"] for k, v in SHORT_TEMPLATES.items()})
IMAGE_STYLE_PROMPTS.update({k: v["style_prefix"] for k, v in SHORT_TEMPLATES.items()})
