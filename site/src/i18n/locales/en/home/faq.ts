export default {
  "h2": "Questions.",
  "h2dim": "Straight answers.",
  "ask": "Got a question? Open it up.",
  "more": "Didn’t find it? Dig into the docs",
  "items": [
    {
      "q": "How do I import my own skills?",
      "a": "Go to Bot settings → Skills → Import ZIP, preview it, then add it. Each ZIP contains one SKILL.md and can be up to 20 MB; scripts and references are preserved. Importing does not contact GitHub. Software and network requirements depend on the skill. Import the same name again to confirm replacement."
    },
    {
      "q": "How do I find an older conversation?",
      "a": "Search chat history from the sidebar, or press Ctrl/Cmd+Shift+F for global search and Ctrl/Cmd+F for the current chat. Filter by bot, conversation, channel or date, then select a result to jump to the message. Search only covers records stored on this device and makes no model calls."
    },
    {
      "q": "How is it different from Grok Bot, OpenAI dots or Claude Duet?",
      "a": "They are the same kind of always-on personal AI agent: it works for you in the background and checks in when a decision is yours. The difference: AnyModelBot is open source (MIT) and runs on your own computer or server. It works with GPT, Claude, Gemini, Grok and more; the app is free and models are billed per use, with no single vendor's subscription. The README on GitHub has a full comparison table. Grok Bot, dots and Claude Duet are products of xAI, OpenAI and Anthropic respectively; AnyModelBot is not affiliated with them."
    },
    {
      "q": "What's the difference between the six characters?",
      "a": "Only their names and looks. None of them has a fixed job. The avatar just helps you tell your bots apart at a glance. You choose the name, persona, model and workspace, and every bot can chat, do work on your computer and remember things. The app's templates are only a starting point: every word can be changed, or you can start from scratch."
    },
    {
      "q": "Is my data uploaded to your servers?",
      "a": "Chats, memory, files and keys are stored on your device. Model requests go to the provider you choose: directly with your own official API key, otherwise through Modelflare, where log retention follows its “Data retention” doc. Screen content seen during computer use is sent to the chosen model."
    },
    {
      "q": "Does it work offline?",
      "a": "No. Models come from Modelflare or the providers' official APIs; local models aren't supported."
    },
    {
      "q": "Can I use it on my phone?",
      "a": "There's no standalone app yet; chat with it in Slack, Telegram or Discord."
    },
    {
      "q": "Can one chat account talk to several bots?",
      "a": "Yes. Add the account once in Settings › Connections and every bot shares it. Each service can have several accounts, each with an alias. A default bot answers new chats; send /bot and a name once to switch, and that chat stays with the new bot. Send /bot to see your bots."
    },
    {
      "q": "Can bots work with my Notion?",
      "a": "Yes, once you authorize it. Add accounts in Settings › Connections, as many as you like, then ask any bot about them by number or alias. Bots can read and edit pages but can't delete them, and read-only bots can only read."
    },
    {
      "q": "I don't have a Modelflare account.",
      "a": "At first launch, click Sign in / Sign up for Modelflare and sign up in your browser. The app connects itself when you come back, with no key to copy. On Docker or a remote server, paste the link you land on after signing in. All three API domains are available; compare response times and choose one in Settings. You can also skip the account: click Use your own API key and enter an official key from OpenAI, Anthropic, Google Gemini, DeepSeek or another provider, and model requests go straight to them."
    },
    {
      "q": "Is computer use safe?",
      "a": "Limited to 24 whitelisted actions; runs automatically by default, switchable to ask before UI-changing actions; screen content goes to the model; try it on a dedicated machine or account first."
    },
    {
      "q": "How do I verify a download?",
      "a": "Each download lists a SHA-256; use Get-FileHash on Windows, shasum -a 256 on macOS/Linux. GitHub releases also include a SHA256SUMS file you can check in one go with sha256sum -c."
    },
    {
      "q": "Is the bot still there after I close the window?",
      "a": "Closing the window keeps it in the tray (optional launch at login); it's offline when the computer is off or asleep; use Docker for always-on."
    },
    {
      "q": "Do you collect telemetry?",
      "a": "What we can confirm: telemetry in the computer-use driver (Cua) is turned off and magpie's auto-update is disabled. See the data-flow diagram for how model requests travel. The code is MIT-licensed — read it yourself."
    }
  ]
};
