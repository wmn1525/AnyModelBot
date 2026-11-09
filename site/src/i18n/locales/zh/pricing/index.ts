export default {
  "eyebrow": "价格 · 按量付费",
  "h2mark": "没有月费",
  "h2rest": "。用多少，付多少。",
  "lead": "AnyModelBot 免费开源，没有订阅、没有档位。模型用量由 Modelflare 按 token 计费，价格表完全公开。",
  "source": "价格取自 modelflare.dev/pricing，数据抓取于 {fetchedAt}（UTC+8），版本 {pricingVersion}。",
  "stale": "价格快照日期：{snapshotDate}（暂未能更新，请以 modelflare.dev/pricing 为准）。",
  "cards": {
    "app": {
      "tag": "AnyModelBot",
      "price": "$0",
      "unit": "/ 永久",
      "note": "免费开源（MIT）",
      "points": [
        "桌面（Windows / macOS / Linux）、Docker、CLI 都免费",
        "没有订阅，没有套餐档位",
        "机器人想建几个建几个，每个都由你定义",
        "新用户注册 Modelflare 即送 $1 Bot 额度，只能在 AnyModelBot 里使用"
      ]
    },
    "usage": {
      "tag": "模型用量 · 由 Modelflare 计费",
      "unit": "/ 100 万输入 tokens",
      "note": "示例：{model} · 默认线路 · 输出 {output} / 100 万 tokens；官方价 {officialIn} / {officialOut}",
      "points": [
        "按 token 计价，输入输出分开",
        "价格表公开可查",
        "换模型随时换，价格跟着模型走",
        "订阅 Modelflare 套餐，另送套餐额度 10% 的 Bot 额度"
      ],
      "cta": "查看完整价格表 ↗"
    },
    "month": {
      "tag": "每月大概多少",
      "unit": "/ 月",
      "note": "示例用量：每天 50 条消息，每条 3,000 输入 + 600 输出 tokens，{model}。",
      "points": [
        "用下面的计算器换成你的用量",
        "估算不含缓存折扣与特殊请求倍率",
        "实际以 Modelflare 账单为准"
      ],
      "cta": "打开计算器"
    }
  },
  "contrast": {
    "caption": "按量付费与订阅制档位的通用对照",
    "head": [
      "",
      "按量付费（AnyModelBot + Modelflare）",
      "订阅制档位（同类产品的通常做法）"
    ],
    "rows": [
      [
        "怎么收费",
        "用多少付多少，没有月费",
        "先付月费，档位决定可用量"
      ],
      [
        "用不完的部分",
        "不产生固定支出",
        "当月额度通常不累计"
      ],
      [
        "换模型",
        "随时换，价格跟着模型走",
        "可选模型通常受档位限制"
      ],
      [
        "价格怎么看",
        "每 100 万 tokens 的单价，公开可查",
        "常以“相对额度”的倍数表述"
      ]
    ],
    "note": "「订阅制档位」指以月费分档的这一类产品的通常做法，不指任何具体产品，也不代表其实际价格。"
  },
  "table": {
    "more": "查看全部 {textCount} 个文本模型的价格 →",
    "caption": "Modelflare 文本模型价格（默认线路，USD / 100 万 tokens）",
    "col": {
      "model": "模型",
      "route": "默认线路",
      "input": "输入 / 1M",
      "output": "输出 / 1M",
      "official": "官方价（输入 / 输出）",
      "vs": "相当于官方价"
    },
    "default": "默认",
    "context": "上下文 {n}",
    "showAll": "查看全部 {textCount} 个文本模型",
    "showFeatured": "只看精选",
    "search": "搜索模型",
    "allVendors": "全部厂商",
    "media": "图像与视频模型（{mediaCount} 个）请见 modelflare.dev/pricing ↗",
    "expand": "展开 {model} 的全部线路",
    "detail": {
      "route": "线路",
      "positioning": "定位",
      "vs": "相当于官方价",
      "price": "输入 / 输出"
    },
    "positioning": {
      "stable": "高稳定线路",
      "award": "高性价比线路",
      "campaign": "限时活动线路",
      "enterprise": "高稳定线路（仅限授权的企业生产场景）",
      "other": "其他线路"
    },
    "unlock": "单次充值达 US${amount} 解锁（限时活动，规则以 Modelflare 为准）",
    "tiers": "超过 {n} tokens 的单条请求按长上下文档计价：输入 {input} · 输出 {output}",
    "none": "没有找到匹配的模型。",
    "note": "价格单位为美元 / 100 万 tokens，显示的是“默认线路”的价格；你的账户可能有不同的权限或折扣（Modelflare 页面同样说明）。数据取自 modelflare.dev/pricing，抓取于 {fetchedAt}（UTC+8），版本 {pricingVersion}。"
  },
  "calc": {
    "title": "算算你每月大概花多少",
    "model": "模型",
    "search": "输入以搜索模型",
    "none": "没有找到匹配的模型。",
    "route": "线路",
    "routeDefault": "默认线路",
    "routeAward": "价格优先线路（award）",
    "routeAwardNote": "适合可重试的开发与测试场景",
    "msgs": "每天消息数",
    "inTok": "每条输入 tokens",
    "inTokNote": "含历史上下文与工具结果",
    "outTok": "每条输出 tokens",
    "days": "按 30 天估算",
    "presets": {
      "light": "轻度",
      "everyday": "日常",
      "heavy": "重度（Agent）"
    },
    "hint": "一条消息 = 你发一条消息、机器人完成一次回复所产生的模型调用合计；Agent 执行任务时一次回复可能包含多次模型调用。",
    "result": "≈ {amount} / 月",
    "split": "输入 {input} · 输出 {output}",
    "perMsg": "每条消息约 {amount}",
    "official": "按官方价约 {amount}",
    "disclaimer": "估算值，不含缓存折扣与请求级倍率（如 priority 服务层）；超过该模型分档阈值的请求按更高档计价（已计入）；实际以 Modelflare 账单为准。",
    "copy": "复制估算",
    "copyText": "AnyModelBot 用量估算：{model}（{route}），每天 {msgs} 条，每条 {inTok} 输入 + {outTok} 输出 tokens，约 {amount} / 月（按 30 天，价格抓取于 {fetchedAt}）",
    "full": "查看这个模型的完整价格 ↗",
    "expandBar": "展开"
  },
  "banner": {
    "text": "已有 Modelflare 账号？在 App 里登录一次就能用，用量按价格表计费。",
    "cta": "打开 Modelflare ↗"
  },
  "pageTitle": "AnyModelBot 价格｜按量付费，价格表公开",
  "pageDescription": "AnyModelBot 免费开源、没有订阅。模型用量由 Modelflare 按 token 计费：公开价格表与每月费用计算器。"
};
