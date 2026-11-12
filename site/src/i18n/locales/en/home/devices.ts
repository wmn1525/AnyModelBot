export default {
  "h2": "You can find it wherever you are.",
  "h2dim": "Same bot, same memory.",
  "lead": "Desktop, Docker, and the browser — plus Slack, Telegram, or Discord on your phone.",
  "items": {
    "desktop": {
      "title": "Desktop",
      "sub": "Windows · macOS · Linux",
      "body": "Windows, macOS and Linux — download and go.",
      "more": "All downloads and checksums →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / server",
      "body": "Run it on a NAS or server, always on."
    },
    "browser": {
      "title": "Browser",
      "body": "The desktop app and Docker ship a local web console.",
      "format": "Local / self-hosted"
    }
  },
  "pick": "Choose where to use it",
  "groupChat": "Chat apps",
  "thread": {
    "user": "When do I usually send the daily report?",
    "bot": "5 pm every day — you told me last week.",
    "memo": "Daily report at 5 pm",
    "memoLabel": "Memory"
  },
  "chatBody": "After you connect, you can send tasks from your phone; the computer or server running the bot needs to stay on and online.",
  "howTo": "See the steps",
  "guideTitle": "Setup guide",
  "note": "No standalone iOS/Android app yet; on your phone, chat with it in Slack, Telegram or Discord. The web console is local or self-hosted — not a cloud web app.",
  "browserGuide": {
    "title": "Local web console",
    "steps": [
      "Desktop: tray menu → Open in browser. The console listens on 127.0.0.1 and generates a random access token on every launch.",
      "Docker: open http://<host>:3600/?token=<token>; read the token with docker exec amb cat /data/ui-token.",
      "Do not expose port 3600 directly to the internet."
    ]
  }
};
