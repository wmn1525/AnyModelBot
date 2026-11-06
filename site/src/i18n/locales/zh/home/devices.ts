export default {
  "h2": "在哪都找得到它。",
  "h2dim": "同一个机器人，同一份记忆。",
  "lead": "桌面、Docker、浏览器、微信、飞书——从书桌一路跟到你的口袋。",
  "items": {
    "desktop": {
      "title": "桌面",
      "sub": "Windows · macOS · Linux",
      "body": "Windows、macOS、Linux，下载即用。",
      "more": "全部下载与校验 →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / 服务器",
      "body": "放在 NAS 或服务器上，24 小时在线。"
    },
    "browser": {
      "title": "浏览器",
      "body": "桌面端或 Docker 自带本地网页控制台。",
      "format": "本机 / 自托管"
    }
  },
  "pick": "选择入口",
  "groupChat": "聊天软件",
  "thread": {
    "user": "日报一般几点发？",
    "bot": "每天 17:00，你上周跟我说过。",
    "memo": "日报每天 17:00 发",
    "memoLabel": "记忆"
  },
  "chatBody": "接入后，手机也能发任务。运行助手的电脑或服务器要开着、联网。",
  "howTo": "查看步骤",
  "guideTitle": "接入指南",
  "note": "暂无独立的 iOS / Android App；手机上请通过微信或飞书使用。网页控制台是本机/自托管的，不是云端网页版。",
  "browserGuide": {
    "title": "本地网页控制台",
    "steps": [
      "桌面版：托盘菜单 → 在浏览器中打开；界面只监听 127.0.0.1，每次启动生成随机访问令牌。",
      "Docker：打开 http://<主机>:3600/?token=<令牌>，令牌用 docker exec amb cat /data/ui-token 查看。",
      "不要把 3600 端口直接暴露到公网。"
    ]
  }
};
