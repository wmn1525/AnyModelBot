export default {
  "aria": "Conversation with {name}",
  "infoPanel": "Right panel (⌘⇧I)",
  "newConvCmd": "New conversation (/new)",
  "toBottom": "Scroll to bottom",
  "copyMessage": "Copy message",
  "commandsLabel": "Commands",
  "commands": {
    "stop": "Stop the message in progress",
    "tasks": "List background tasks (/stop <number> stops one)",
    "model": "List or switch models",
    "new": "Start a new conversation (archives the old one with a handoff note)",
    "reset": "Clear this conversation's context",
    "status": "Show the current model, mode and progress",
    "help": "Show all commands"
  },
  "perm": {
    "menu": "File access",
    "title": "File access: {note}",
    "workspace": "Workspace write",
    "workspaceNote": "Can only edit this bot's workspace; asks you before going outside it",
    "readonly": "Read only",
    "readonlyNote": "Can't edit files; commands run in a read-only sandbox",
    "more": "More permission settings…"
  },
  "approval": {
    "neededTask": "\"{title}\" needs your approval · {code}",
    "needed": "Needs your approval · {code}",
    "fallbackReason": "The bot wants to do something outside its workspace",
    "allowOnce": "Allow once",
    "deny": "Deny"
  },
  "question": {
    "taskAsks": "\"{title}\" asks",
    "otherOptional": "Something else (optional)",
    "yourAnswer": "Type your answer",
    "orOther": "Or type a different answer",
    "submit": "Submit"
  },
  "file": {
    "open": "Open {name}",
    "reveal": "Show in folder",
    "gone": "File not found"
  },
  "work": {
    "stopping": "Stopping…",
    "stoppingAfter": "Stopping after {d}…",
    "process": "Activity",
    "done": "Worked for {d}",
    "replying": "Replying for {d}",
    "thinkingFor": "Thinking for {d}",
    "thinking": "Thinking"
  },
  "error": {
    "stopFailed": "Couldn't stop: {error}",
    "fixOfficialKey": "Replace key",
    "officialKeyInvalid": "{name} rejected this API key. It may be invalid or revoked.",
    "fixKey": "Update key",
    "authInvalid": "Your Okinto New API key is invalid or has been revoked.",
    "loadHistory": "Couldn't load message history: {error}"
  },
  "menu": {
    "more": "More actions",
    "switchModel": "Switch model…",
    "newConv": "New conversation",
    "reset": "Clear context",
    "status": "Show status",
    "allCommands": "All commands",
    "usables": "Skills & apps"
  },
  "use": {
    "skills": "Skills",
    "apps": "Apps",
    "search": "Search skills or apps",
    "noMatch": "No matches",
    "prefill": "Use {name} to help me{cursor}…",
    "appExample": "Use {app} to help me…",
    "readonlyDesc": "Read-only: can look things up and read",
    "readonlyNo": "This bot is read-only, so it can't write",
    "noSkills": "This bot doesn't have any skills yet.",
    "noSkillsBody": "Import a skill, or send this bot an install prompt from the skills library.",
    "importSkill": "Import a skill",
    "noApps": "This bot doesn't have any apps yet.",
    "noAppsBody": "Connect an app and this bot can use it right away.",
    "noAppsAssigned": "Your connected apps aren't assigned to this bot yet.",
    "connectApp": "Connect an app",
    "unassigned": "Not assigned to this bot",
    "assign": "Assign to this bot",
    "assigned": "{app} is assigned to {bot}. Ready to use now.",
    "usingSkill": "Using skill · {name}",
    "usingApp": "Using {app}",
    "failedSkill": "Couldn't use skill · {name}. {reason}",
    "failedApp": "Couldn't use {app}. {reason}",
    "reason": {
      "loading": "The skill is still loading.",
      "connection": "Check the connection for {app}.",
      "denied": "You didn't allow this call.",
      "readonly": "This bot is read-only, so it can't write.",
      "failed": "It didn't work this time."
    },
    "used": "Used: {list}",
    "notUsed": "Couldn't use: {list}",
    "sep": ", ",
    "state": {
      "active": "Active",
      "waiting": "Active after the current task",
      "loading": "Loading"
    },
    "try": "Try saying: {example}",
    "fill": "Insert into the input",
    "fillTitle": "Insert into this bot's input",
    "copy": "Copy",
    "copyFailed": "Couldn't copy"
  },
  "reset": {
    "title": "Clear this conversation's context?",
    "body": "{name} will forget what was said in this web conversation. Long-term memory is kept.",
    "confirm": "Clear"
  },
  "empty": {
    "guideTitle": "Hi, I'm {name}",
    "guideBody": "Take 5 minutes and walk through the checklist to see what I can do.",
    "title": "Start chatting with {name}",
    "body": "Test your bot right here. Connect WeChat, Feishu, Telegram, Slack or Discord in the right panel.",
    "sample": "What can you help me with?",
    "helpChip": "/help for commands"
  },
  "composer": {
    "steer": "Add to the reply in progress",
    "steerTitle": "Add to the reply in progress ({key})",
    "stopping": "Stopping…",
    "placeholder": "Message {name}, or type / for commands",
    "label": "Message",
    "currentModel": "Current model: {model}",
    "pickModel": "Choose model",
    "stop": "Stop generating (Esc)",
    "stopTitle": "Stop (Esc)",
    "send": "Send",
    "sendTitle": "Send ({key})"
  },
  "model": {
    "followBot": "Use bot default",
    "setDefault": "Set as this bot's default model"
  }
};
