export default {
  "h2": "Your data.",
  "h2dim": "Where does it actually go?",
  "lead": "What stays on your machine and what has to leave — both drawn out.",
  "local": "Your device",
  "localBadge": "Local",
  "out": "Leaves your device",
  "vendors": "Model providers",
  "channels": "Channels you connect",
  "onlyRequest": "This request only",
  "nodes": {
    "chats": {
      "label": "Chat history (SQLite)",
      "body": "Stored in a SQLite database in your data directory; deleting a bot deletes its chats."
    },
    "memory": {
      "label": "Long-term memory (Markdown)",
      "body": "Markdown files in your data directory with a journal.jsonl change log; passwords, keys, and ID numbers aren't saved."
    },
    "workspace": {
      "label": "Workspace files",
      "body": "The bot's own workspace; writes stay here by default; going outside needs your OK."
    },
    "key": {
      "label": "Model key (isolated, last 4 shown)",
      "body": "Kept in the gateway process and config; the agent process never sees the real key; the UI shows only the last 4 characters."
    },
    "console": {
      "label": "Console: 127.0.0.1 + token",
      "body": "Listens on 127.0.0.1 and checks the Host header by default; Docker mode requires an access token."
    },
    "gateway": {
      "label": "okinto gateway",
      "sub": "Forwards requests to the selected model",
      "body": "Model requests pass through okinto. Log retention, caching and data handling follow the published okinto privacy policy and account settings."
    },
    "vendors": {
      "label": "OpenAI / Anthropic / Google …",
      "body": "Receives what you send to the model, including screen content during computer use."
    },
    "channels": {
      "label": "Chat apps",
      "sub": "Slack · Telegram · Discord",
      "body": "Messages in these apps pass through their servers by nature."
    }
  },
  "retentionLink": "okinto privacy policy",
  "retentionUrl": "https://api.okinto.com/privacy-policy",
  "compare": {
    "caption": "okbot compared with typical cloud-hosted assistants",
    "head": [
      "",
      "okbot",
      "Typical cloud-hosted assistants"
    ],
    "rows": [
      [
        "Where it runs",
        "Your computer / your server",
        "The vendor's cloud"
      ],
      [
        "Where chats and memory live",
        "Your disk",
        "Vendor servers"
      ],
      [
        "Models",
        "Any model on okinto, swap any time",
        "Usually tied to the vendor's own models"
      ],
      [
        "Billing",
        "Free app; models billed per use by okinto",
        "Usually a monthly subscription with tiers"
      ],
      [
        "Computer use",
        "Operates your own computer (24 bounded actions)",
        "Operates a cloud computer the vendor provides"
      ],
      [
        "Do inference requests leave your device?",
        "Yes, via okinto to the model provider",
        "Yes"
      ],
      [
        "Auditable code",
        "MIT",
        "Mostly no"
      ]
    ],
    "note": "“Typical cloud-hosted assistants” describes the common approach of vendor-hosted, subscription-fee products, not any specific product."
  },
  "security": "Read the full security notes →"
};
