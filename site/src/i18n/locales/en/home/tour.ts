export default {
  "title": "okbot demo",
  "note": "Animated walkthrough; the UI is illustrative.",
  "prev": "Previous step",
  "next": "Next step",
  "steps": "Demo steps",
  "scenes": [
    {
      "title": "Download and install",
      "caption": "Grab the installer for your system (Windows, macOS, Linux), or run it on a server with one docker command."
    },
    {
      "title": "Sign in to okinto",
      "caption": "On first launch, sign in to okinto once in your browser and it connects by itself. On Docker or remote setups, paste the link you land on after signing in."
    },
    {
      "title": "Pick a default model",
      "caption": "The models on your account are listed; pick a default and switch any time in the chat."
    },
    {
      "title": "Create a bot",
      "caption": "Give it a name and a few lines of persona, and you decide what it does and how it talks. Pick any avatar you like; templates are only a starting point."
    },
    {
      "title": "Chat, and swap models any time",
      "caption": "Replies stream in and can be stopped; click the model in the input box to switch."
    },
    {
      "title": "Let it do the work",
      "caption": "It reads and writes files and runs commands; anything outside its workspace waits for your OK in the chat."
    },
    {
      "title": "Find it in your chat apps",
      "caption": "Connect it once, then chat with the same bot — and the same memory — from Slack, Telegram or Discord."
    }
  ],
  "ui": {
    "installing": "Installing okbot…",
    "slogan": "Any model, one assistant",
    "login": "Sign in / Sign up with okinto",
    "loginWait": "Finish signing in in your browser — you'll come right back here",
    "loginReopen": "Reopen sign-in page ↗",
    "loginCopy": "Copy link",
    "loginCancel": "Cancel",
    "authTitle": "Authorize okbot to use your account",
    "authSub": "This creates a key on this computer that only okbot uses.",
    "authBtn": "Authorize and return",
    "connected": "Connected · {n} models found",
    "pickHint": "Pick a default model; you can switch any time in the chat.",
    "filter": "Filter models",
    "start": "Start chatting",
    "newBot": "New bot",
    "creating": "Creating…",
    "noChat": "No chats yet",
    "newFirst": "Create your first bot",
    "botName": "Name",
    "botNamePh": "e.g. Group digest",
    "botNameValue": "Code helper",
    "botPersona": "Persona",
    "botPersonaPh": "e.g. You are a helpful assistant. Keep answers concise and accurate.",
    "botPersonaValue": "You are a coding assistant. Read and edit the code in your workspace, and write scripts to solve problems.",
    "create": "Create",
    "templates": "Start from a template",
    "tpls": [
      {
        "name": "Group digest",
        "desc": "Turns group chats into a daily digest"
      },
      {
        "name": "Support agent",
        "desc": "Answers from your docs, hands off when unsure"
      },
      {
        "name": "Code helper",
        "desc": "Reads code, writes scripts, edits its workspace"
      }
    ],
    "search": "Search",
    "today": "Today 21:08",
    "thinking": "Thinking…",
    "working": "Working…",
    "took": "Worked for {s}",
    "input": "Message {name}, / for commands",
    "perm": "Workspace: write",
    "pickerSearch": "Filter, or type any model ID",
    "switched": "Switched to {model}",
    "chatUser": "Why does this function go out of bounds?",
    "chatReply": "The loop uses <=, so the last pass reads arr[len]. Switch it to < — the fixed version is below.",
    "task": "Sort the invoices in Downloads into Expenses.",
    "approvalMeta": "Needs your approval",
    "allowOnce": "Allow once",
    "deny": "Deny",
    "allowed": "Allowed",
    "fileSub": "Saved to the workspace",
    "channelOk": "{im} · connected",
    "channelSub": "Connect once — messages go straight to this bot",
    "imFrom": "Slack",
    "imUser": "Is today's digest ready?",
    "imReply": "Yes: 3 decisions, 2 to-dos — saved to memory."
  }
};
