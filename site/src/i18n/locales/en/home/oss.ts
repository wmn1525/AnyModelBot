export default {
  "facts": [
    {
      "text": "The console listens on 127.0.0.1 by default and checks the Host header; even local access requires an access token.",
      "path": "src/web/server.ts"
    },
    {
      "text": "Model keys never enter the agent process; the UI shows only the last 4 characters.",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "Files and commands run in a sandboxed workspace, with approval for anything beyond; on Linux, commands run only inside bubblewrap, which also hides the data directory, and are refused when it is unavailable.",
      "path": "src/agent/host.ts"
    },
    {
      "text": "Memory refuses passwords, keys and ID numbers.",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "Telemetry environment variables of the computer-use driver (Cua) are set to 0; magpie's auto-update is disabled.",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
