export default {
  "aria": "和 {name} 的对话",
  "infoPanel": "右侧面板（⌘⇧I）",
  "newConvCmd": "开始新的一段对话（/new）",
  "toBottom": "回到底部",
  "copyMessage": "复制这条消息",
  "commandsLabel": "命令",
  "commands": {
    "stop": "中止正在处理的消息",
    "tasks": "列出后台任务（/stop 编号 停止一个）",
    "model": "列出或切换模型",
    "new": "开始新的一段对话（旧对话归档并留交接便条）",
    "reset": "清空本会话上下文",
    "status": "查看当前模型、运行方式和处理进度",
    "help": "显示全部命令"
  },
  "perm": {
    "menu": "文件权限",
    "title": "文件权限：{note}",
    "workspace": "工作区可写",
    "workspaceNote": "只能改这个机器人的工作区，越界操作先问你",
    "readonly": "只读",
    "readonlyNote": "不能改文件，命令在只读沙箱里运行",
    "more": "更多权限设置…"
  },
  "approval": {
    "needed": "需要你的批准 · {code}",
    "neededTask": "「{title}」需要你的批准 · {code}",
    "fallbackReason": "机器人想执行一个超出工作区的操作",
    "allowOnce": "允许（仅本次）",
    "deny": "拒绝"
  },
  "question": {
    "taskAsks": "「{title}」想问你",
    "otherOptional": "其他回答（可选）",
    "yourAnswer": "输入你的回答",
    "orOther": "或者输入其他回答",
    "submit": "提交"
  },
  "file": {
    "open": "打开 {name}",
    "reveal": "在文件夹中显示",
    "gone": "找不到文件"
  },
  "work": {
    "stopping": "正在停止…",
    "stoppingAfter": "处理了 {d}，正在停止…",
    "process": "处理过程",
    "done": "用时 {d}",
    "replying": "正在回复 {d}",
    "thinkingFor": "思考中 {d}",
    "thinking": "思考中"
  },
  "error": {
    "stopFailed": "停止失败：{error}",
    "fixOfficialKey": "去更换 Key",
    "officialKeyInvalid": "{name} 拒绝了这个 API Key，它可能无效或已被撤销。",
    "fixKey": "去更新",
    "authInvalid": "Okinto New API 密钥失效或已被撤销。",
    "loadHistory": "读取历史消息失败：{error}"
  },
  "menu": {
    "more": "更多操作",
    "switchModel": "切换模型…",
    "newConv": "开始新的一段对话",
    "reset": "清空上下文",
    "status": "查看状态",
    "allCommands": "全部命令",
    "usables": "技能与应用"
  },
  "use": {
    "skills": "技能",
    "apps": "应用",
    "search": "搜索技能或应用",
    "noMatch": "没有匹配的项",
    "prefill": "用{name}帮我{cursor}……",
    "appExample": "用{app}帮我……",
    "readonlyDesc": "当前是只读，只能查询和读取",
    "readonlyNo": "当前是只读，不能写入",
    "noSkills": "这个机器人还没有可用的技能。",
    "noSkillsBody": "导入一个技能，或把技能库的安装指令发给它。",
    "importSkill": "去导入技能",
    "noApps": "这个机器人还没有可用的应用。",
    "noAppsBody": "连接一个应用后，这个机器人就能用。",
    "noAppsAssigned": "已连接的应用还没有分配给这个机器人。",
    "connectApp": "去连接应用",
    "unassigned": "未分配给这个机器人",
    "assign": "分配给这个机器人",
    "assigned": "已把「{app}」分配给「{bot}」，现在就能用。",
    "usingSkill": "正在使用技能 · {name}",
    "usingApp": "正在使用 {app}",
    "failedSkill": "没能使用技能 · {name}。{reason}",
    "failedApp": "没能使用 {app}。{reason}",
    "reason": {
      "loading": "技能还在加载。",
      "connection": "请检查「{app}」的连接。",
      "denied": "你没有允许这次调用。",
      "readonly": "当前是只读，不能写入。",
      "failed": "这次没有成功。"
    },
    "used": "已使用：{list}",
    "notUsed": "没能使用：{list}",
    "sep": "、",
    "state": {
      "active": "已生效",
      "waiting": "当前任务结束后生效",
      "loading": "加载中"
    },
    "try": "试试这样说：{example}",
    "fill": "填入输入框",
    "fillTitle": "填进这个机器人的输入框",
    "copy": "复制",
    "copyFailed": "没能复制"
  },
  "reset": {
    "title": "清空本会话上下文？",
    "body": "「{name}」会忘掉这段网页对话的内容；长期记忆保留。",
    "confirm": "清空"
  },
  "empty": {
    "guideTitle": "嗨，我是{name}",
    "guideBody": "花 5 分钟，跟着清单认识一下我能做什么。",
    "title": "和 {name} 开始对话",
    "body": "在这里直接测试机器人；微信、飞书、Telegram、Slack、Discord 在右侧面板里接入。",
    "sample": "你能帮我做什么？",
    "helpChip": "/help 查看命令"
  },
  "composer": {
    "steer": "补充给正在进行的回复",
    "steerTitle": "补充给正在进行的回复（{key}）",
    "stopping": "正在停止…",
    "placeholder": "给「{name}」发消息，/ 查看命令",
    "label": "消息",
    "currentModel": "当前模型：{model}",
    "pickModel": "选择模型",
    "stop": "停止生成（Esc）",
    "stopTitle": "停止（Esc）",
    "send": "发送",
    "sendTitle": "发送（{key}）"
  },
  "model": {
    "followBot": "跟随机器人默认",
    "setDefault": "设为此机器人的默认模型"
  }
};
