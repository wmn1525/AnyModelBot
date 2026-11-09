export default {
  "warn": "Do not expose port 3600 directly to the internet.",
  "win": "Download for Windows",
  "mac": "Download for macOS",
  "linux": "Download for Linux",
  "mobile": "Use it from your chat apps",
  "generic": "Download",
  "more": "Other platforms",
  "items": {
    "win-x64": "Windows installer (NSIS)",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    "docker": "Docker command",
    "changelog": "Changelog"
  },
  "platform": {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux"
  },
  "arch": {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage"
  },
  "meta": "Version {version} · Published {publishedAt}",
  "sha": "SHA-256",
  "started": "Download started — check your browser's downloads.",
  "downloading": "Downloading…",
  "macNote": "Computer use on macOS is in beta: its direct mode still needs testing on more real machines. Accessibility and Screen Recording permissions are requested only when a bot first needs them. The rest of the app is the same as on Windows and Linux.",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "If Windows warns you, choose More info, then Run anyway.",
  "macHint": "Developer ID signed and notarized by Apple. Drag the app to Applications, launch it, and choose Open if asked to confirm the download.",
  "firstRun": "First launch",
  "yourSystem": "Your system",
  "verifyTitle": "Verify your download",
  "verifyLead": "Run the command for your system and compare the SHA-256 with the value listed here. If they match, the file is intact.",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<file> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <file>",
  "pageTitle": "Download AnyModelBot",
  "pageLead": "Free and open source. The app itself needs no signup; sign in to Modelflare at first launch and you're ready.",
  "pageDescription": "Download AnyModelBot for Windows, macOS, Linux and Docker. Free and open source, pay per use.",
  "altTitle": "Other ways to run it",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "Start the container",
    "token": "Read the access token",
    "open": "Open it in your browser"
  },
  "dockerUrl": "http://<host>:3600/?token=<token>",
  "cliTitle": "Command line (CLI)",
  "cliBody": "Run from source. Requires Node.js 22.13+ and Go 1.26.8+ (to build the bundled gateway).",
  "cliSteps": {
    "clone": "Clone the repository",
    "setup": "Install dependencies and build the gateway",
    "start": "Start it, then open http://127.0.0.1:3600/"
  },
  "releases": "GitHub releases",
  "changelog": "Changelog"
};
