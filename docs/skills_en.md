# Import and manage skills

[简体中文](./skills.md) | English | [日本語](./skills_ja.md) | [한국어](./skills_ko.md) | [Русский](./skills_ru.md)

Starting with AnyModelBot 0.1.24, you can add existing workflows to a bot as ZIP skill packages, for tasks such as weekly reports, document processing and research.

## Import

1. Open the target bot's settings, find Skills and click Import ZIP.
2. Select a local ZIP and review its name, description and file count. Expand the instructions to read them in full.
3. Click Add skill. The bot can load it when a relevant task needs it.

Each ZIP contains one skill. `SKILL.md` can be at the ZIP root or inside a wrapper folder. Supporting files such as `scripts/`, `references/` and `assets/` are preserved. Importing does not contact GitHub or automatically execute installation scripts.

`SKILL.md` needs YAML frontmatter and an instruction body, for example:

```markdown
---
name: weekly-report
description: Write weekly reports from the user's work notes.
---

Organize completed work, problems and next week's plans, then use the user's requested format.
```

Names use lowercase English letters, digits and single hyphens, up to 64 characters. ZIP files can be up to 20 MB, with up to 64 MB and 2,000 entries after extraction. `SKILL.md` can be up to 256 KB, and each bot can have up to 100 imported skills. If a ZIP contains several `SKILL.md` files, package each skill separately.

## Use, replace and delete

- A skill applies only to the bot you add it to. That bot uses the same skills in the app and through chat channels.
- View instructions, enable, disable or delete skills in the list. Changes wait until the bot is idle.
- Import a skill with the same name again, review it and click Replace skill. Replacement preserves its enabled or disabled state.
- Deleting a skill removes its files and keeps output already generated in the workspace.
- Built-in names such as `media`, `computer-use` and `amb-app`, and skills supplied by catalog bots, cannot be overwritten by imported packages.

Skills run with the bot's existing permissions. A skill that needs Python, other software or an account connection requires that environment. Skills relying on tools specific to another client may need changes. Format compatibility does not mean every supporting tool is installed.

## Storage

Extracted packages are stored under `skills/<bot ID>/` in the data directory. Enabled skills are copied to `dsh/<bot ID>/skills/` for the runtime. Import uploads only to the AnyModelBot instance you are using; for a server deployment, files are stored on that server. Enabled skill names and descriptions, and instructions or references loaded during use, become context sent to your selected model. See [Data and privacy](./privacy_en.md).
