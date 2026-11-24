export default {
  "facts": [
    {
      "text": "控制台默认只监听 127.0.0.1，并校验 Host；本机访问也要带访问令牌。",
      "path": "src/web/server.ts"
    },
    {
      "text": "模型 Key 不进入 Agent 子进程；界面只显示末 4 位。",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "文件与命令在沙箱工作区内运行，越界走审批；Linux 上命令只在 bubblewrap 里运行并遮住数据目录，用不了时拒绝执行。",
      "path": "src/agent/host.ts"
    },
    {
      "text": "记忆自动拒存密码、密钥、证件号。",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "电脑操作驱动（Cua）的遥测环境变量被置 0；magpie 的自动更新被关闭。",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
