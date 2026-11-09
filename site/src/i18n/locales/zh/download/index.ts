export default {
  "warn": "不要把 3600 端口直接暴露到公网。",
  "win": "下载 Windows 版",
  "mac": "下载 macOS 版",
  "linux": "下载 Linux 版",
  "mobile": "手机上通过微信 / 飞书使用",
  "generic": "下载",
  "more": "其它平台",
  "items": {
    "win-x64": "Windows 安装包（NSIS）",
    "mac-arm64": "macOS Apple 芯片",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    "docker": "Docker 命令",
    "changelog": "更新日志"
  },
  "platform": {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux"
  },
  "arch": {
    "win-x64": "x64",
    "mac-arm64": "Apple 芯片",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage"
  },
  "meta": "版本 {version} · 发布于 {publishedAt}",
  "sha": "SHA-256",
  "started": "已开始下载，可在浏览器下载列表查看。",
  "downloading": "正在下载…",
  "macNote": "macOS 上的电脑操作目前为 Beta：直连模式还要在更多真机上验证。「辅助功能」和「屏幕录制」权限在机器人第一次用到时才请求。其余功能和 Windows、Linux 版一样。",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "系统提示风险时，点「更多信息 → 仍要运行」。",
  "macHint": "已完成 Developer ID 签名和苹果公证。将应用拖入「应用程序」后打开，首次出现下载确认时点「打开」。",
  "firstRun": "首次运行",
  "yourSystem": "你的系统",
  "verifyTitle": "校验下载",
  "verifyLead": "用对应的命令算出安装包的 SHA-256，和这里列出的值一致，就说明文件完好。",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<文件> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <文件>",
  "pageTitle": "下载 AnyModelBot",
  "pageLead": "免费开源。App 本身无需注册，首次启动登录 Modelflare 就能用。",
  "pageDescription": "下载 AnyModelBot：Windows、macOS、Linux 与 Docker。免费开源，按量付费。",
  "altTitle": "其它安装方式",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "启动容器",
    "token": "读取访问令牌",
    "open": "在浏览器里打开"
  },
  "dockerUrl": "http://<主机>:3600/?token=<令牌>",
  "cliTitle": "命令行（CLI）",
  "cliBody": "从源码运行，需要 Node.js 22.13+ 与 Go 1.26.8+（用于编译内置网关）。",
  "cliSteps": {
    "clone": "克隆仓库",
    "setup": "安装依赖，编译内置网关",
    "start": "启动，然后打开 http://127.0.0.1:3600/"
  },
  "releases": "GitHub 发布页",
  "changelog": "更新日志"
};
