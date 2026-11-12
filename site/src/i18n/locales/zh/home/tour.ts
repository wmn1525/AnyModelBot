export default {
  "title": "okbot 演示",
  "note": "演示动画，界面为示意。",
  "prev": "上一步",
  "next": "下一步",
  "steps": "演示步骤",
  "scenes": [
    {
      "title": "下载安装",
      "caption": "按系统下载安装包（Windows / macOS / Linux），或者用一条 docker 命令放到服务器上。"
    },
    {
      "title": "登录 okinto",
      "caption": "首次启动在浏览器里登录一次 okinto，回来就自动连好；Docker / 远程部署登录后把链接贴回来即可。"
    },
    {
      "title": "选默认模型",
      "caption": "连上后列出账户里能用的模型，挑一个当默认；之后随时可以在对话里换。"
    },
    {
      "title": "新建机器人",
      "caption": "起个名字、写几句人设，它做什么、怎么说话都由你定。头像挑个顺眼的；模板只是起点，每个字都能改。"
    },
    {
      "title": "开聊，随时换模型",
      "caption": "回复边写边出来，可以随时停下；点一下输入框里的模型就能换。"
    },
    {
      "title": "让它动手",
      "caption": "读写文件、跑命令；越出工作区的操作会停下来，等你在对话里点头。"
    },
    {
      "title": "在微信 / 飞书里找它",
      "caption": "扫码接入后，在手机上直接和同一个机器人聊，记忆也是同一份。"
    }
  ],
  "ui": {
    "installing": "正在安装 okbot…",
    "slogan": "任意模型，一个助手",
    "login": "登录 / 注册 okinto",
    "loginWait": "在浏览器里完成登录后，会自动回到这里",
    "loginReopen": "重新打开登录页 ↗",
    "loginCopy": "复制链接",
    "loginCancel": "取消",
    "authTitle": "授权 okbot 使用你的账户",
    "authSub": "授权后会在这台电脑上生成一把只给它用的 Key。",
    "authBtn": "授权并返回",
    "connected": "已连接 · 找到 {n} 个模型",
    "pickHint": "选一个默认模型，之后随时可在对话里切换。",
    "filter": "筛选模型",
    "start": "开始对话",
    "newBot": "新机器人",
    "creating": "正在创建…",
    "noChat": "还没有对话",
    "newFirst": "创建你的第一个机器人",
    "botName": "名称",
    "botNamePh": "例如：群聊日报",
    "botNameValue": "代码助手",
    "botPersona": "人设",
    "botPersonaPh": "例如：你是一个乐于助人的中文助手，回答简洁准确。",
    "botPersonaValue": "你是代码助手。阅读和修改工作区里的代码，编写脚本解决问题。",
    "create": "创建",
    "templates": "从模板开始",
    "tpls": [
      {
        "name": "群聊日报",
        "desc": "把群里的讨论整理成日报"
      },
      {
        "name": "客服助手",
        "desc": "按已知资料回答，拿不准就转人工"
      },
      {
        "name": "代码助手",
        "desc": "读代码、写脚本，在工作区里改文件"
      }
    ],
    "search": "搜索",
    "today": "今天 21:08",
    "thinking": "思考中…",
    "working": "正在工作…",
    "took": "用时 {s}",
    "input": "给「{name}」发消息，/ 查看命令",
    "perm": "工作区可写",
    "pickerSearch": "筛选，或输入任意模型 ID",
    "switched": "已切换到 {model}",
    "chatUser": "帮我看看这个函数为什么会越界。",
    "chatReply": "循环条件用了 <=，最后一次访问了 arr[len]。改成 < 就好，我把改好的版本放在下面。",
    "task": "把下载里的发票整理进「报销」。",
    "approvalMeta": "需要你的批准",
    "allowOnce": "允许（仅本次）",
    "deny": "拒绝",
    "allowed": "已允许",
    "fileSub": "已保存到工作区",
    "channelOk": "{im} · 已连接",
    "channelSub": "扫码接入，消息直接到这个机器人",
    "imFrom": "微信",
    "imUser": "今天的日报好了吗？",
    "imReply": "好了：3 个决定、2 个待办，已存入记忆。"
  }
};
