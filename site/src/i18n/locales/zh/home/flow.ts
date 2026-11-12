export default {
  "h2": "你的数据，",
  "h2dim": "到底去了哪？",
  "lead": "留在你电脑上的，和必须出去的，都画给你看。",
  "local": "你的设备（本机）",
  "localBadge": "本机",
  "out": "出网",
  "vendors": "模型厂商",
  "channels": "你主动连接的渠道",
  "onlyRequest": "仅当前请求",
  "nodes": {
    "chats": {
      "label": "对话记录（SQLite）",
      "body": "存在数据目录的 SQLite 数据库里；删除机器人即删除它的对话。"
    },
    "memory": {
      "label": "长期记忆（Markdown 文件）",
      "body": "数据目录里的 Markdown 文件，附变更日志 journal.jsonl；密码、密钥、证件号不会被记住。"
    },
    "workspace": {
      "label": "工作区文件",
      "body": "机器人自己的工作区；默认只写这里；要写到工作区以外，得先经过你点头。"
    },
    "key": {
      "label": "模型 Key（隔离，末 4 位显示）",
      "body": "只在网关进程与配置里；Agent 子进程环境里没有真实密钥；界面只显示末 4 位。"
    },
    "console": {
      "label": "控制台：127.0.0.1 + 令牌",
      "body": "默认只监听 127.0.0.1 并校验 Host；Docker 模式必须带访问令牌。"
    },
    "gateway": {
      "label": "okinto 网关",
      "sub": "转发请求至所选模型",
      "body": "模型请求经 okinto 转发；日志、缓存与数据保留规则以 okinto 公布的隐私政策和账户设置为准。"
    },
    "vendors": {
      "label": "OpenAI / Anthropic / Google …",
      "body": "收到的是你发给模型的内容，包括电脑操作时的屏幕内容。"
    },
    "channels": {
      "label": "微信 / 飞书",
      "sub": "消息经这些平台送达",
      "body": "消息会经过这些平台的服务器。"
    }
  },
  "retentionLink": "okinto 隐私政策",
  "retentionUrl": "https://api.okinto.com/privacy-policy",
  "compare": {
    "caption": "okbot 与典型云端托管型助手的对照",
    "head": [
      "",
      "okbot",
      "典型云端托管型助手"
    ],
    "rows": [
      [
        "运行位置",
        "你的电脑 / 你的服务器",
        "厂商的云端"
      ],
      [
        "对话与记忆存放",
        "你的硬盘",
        "厂商服务器"
      ],
      [
        "模型",
        "okinto 上任选，随时换",
        "通常绑定自家模型"
      ],
      [
        "计费",
        "App 免费；模型按量付费给 okinto",
        "通常按月订阅、分档"
      ],
      [
        "电脑操作",
        "操作你自己的电脑（受限 24 个动作）",
        "操作厂商提供的云端电脑"
      ],
      [
        "推理请求是否出网",
        "是，经 okinto 到模型厂商",
        "是"
      ],
      [
        "代码可审计",
        "MIT",
        "多数否"
      ]
    ],
    "note": "「典型云端托管型助手」指运行在厂商云端、按订阅费计费的这一类产品的通常做法，不指任何具体产品。"
  },
  "security": "查看完整安全说明 →"
};
