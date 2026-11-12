export default {
  "title": "Security — okbot",
  "description": "Where okbot's data goes, the local safeguards, and the known limits: what stays on your device and what has to leave.",
  "h1": "Security",
  "lead": "The long version of the homepage data-flow diagram: what stays on your device, what has to leave, the safeguards you can verify in the code, and the promises we don't make.",
  "stays": "Stays on your device",
  "leaves": "Leaves your device",
  "leavesItems": [
    "What you send to the model (including screen content during computer use) travels through the okinto gateway to the provider you choose.",
    "Model requests pass through okinto. Log retention, caching and data handling follow the published okinto privacy policy and account settings.",
    "Messages in Slack, Telegram and Discord pass through those platforms' servers by nature.",
    "If you add a Notion account, what bots read and write goes to Notion, and what they read also goes into model requests.",
    "Windows installers and Linux AppImages download updates in the background by default; this can be disabled in Settings. Installation requires clicking Restart and update with no active tasks. Current macOS builds use manual downloads. Version 0.1.28 and earlier require a manual installation first. Update requests contain no account credentials or chat content."
  ],
  "guardsTitle": "Safeguards in the code",
  "limitsTitle": "Limits and promises we don't make",
  "limits": [
    "No offline or local models; inference requests always leave your device.",
    "Computer use runs automatically by default (switchable to ask before UI-changing actions); the direct macOS mode hasn't been verified on real machines.",
    "The app's network behaviour hasn't been audited by a third party, so we don't claim “zero telemetry”.",
    "Platforms other than Linux don't get the bubblewrap layer; sandbox strength varies by platform."
  ],
  "report": "Contact the project through GitHub Issues for feedback or collaboration."
};
