# Changelog

[简体中文](./CHANGELOG.md) | English | [日本語](./CHANGELOG_ja.md) | [한국어](./CHANGELOG_ko.md) | [Русский](./CHANGELOG_ru.md)

This covers changes you'll notice in the app. For older versions, see the [GitHub releases](https://github.com/modelflare-ai/AnyModelBot/releases).

## 0.1.26 - 2026-11-06

### Improved

- Synced the upstream Chinese website copy with clearer setup steps after download, where to find ready-made assistants, and the requirement to keep the computer and app online for tasks sent from a phone.
- Updated the READMEs to explain OKINTO sign-in, model selection and image generation using the current interface.
- Updated the PPT assistant skill checksum after the branding copy change so package integrity checks pass.

## 0.1.25 - 2026-11-05

### Fixed

- Fixed interrupted OKINTO image transfers caused by revoking temporary tokens before the complete image response arrived.
- Improved parsing for JSON, SSE streams and multiple image response formats. Interrupted or invalid responses produce clear errors without automatically generating again.
- Model names in activity, history and diagnostics now show readable Chinese group names and hide internal routing prefixes.
- Removed old branding from interface labels and messages in favor of OKINTO / okbot.

## 0.1.24 - 2026-11-05

### Fixed

- Restored the OKINTO New API integration omitted from the previous release. The default endpoint is api.okinto.com, with desktop OKINTO sign-in and site API key support.
- Restored wallet balance, grouped model selection, pricing and image generation while retaining official provider API keys and catalog bots.
- Installers, windows and interface labels now use okbot / OKINTO. Update checks use this repository.

## 0.1.23 - 2026-11-05

### Improvements

- **A clearer product demo:** The homepage now includes a real 30-second product video, with localized versions for all five supported languages and the development docs.

## 0.1.22 - 2026-11-04

### New

- **Use your own official API keys:** You no longer need an account. On first launch, click Use your own API key, or go to Settings → Models and enter a key from OpenAI, Anthropic, Google Gemini, xAI, DeepSeek, Kimi, GLM, Qwen, MiniMax or Mistral. Model requests go straight to the provider, the provider bills you, and the key stays on this device. Image and video generation is still only available through Modelflare.
- **Keenable for web search:** Choose it in Settings → Network & access and enter a key.

### Improvements and fixes

- The Modelflare tab in Settings is now called Models, and you can sign in to Modelflare there if you aren't signed in.
- Company Research, US Stock Research and PPT Master now support Japanese, Korean and Russian.

### Privacy

- With only official API keys and no sign-in, the app doesn't read Modelflare's account data or price catalog. The built-in gateway reads the public model catalog from models.dev, and that request carries no keys or conversation content.

## 0.1.21 - 2026-11-03

### New

- **Easier channel setup:** Connections in Settings have been rebuilt. Each app shows how to connect, so you just follow the steps to scan a code or enter a token. If it's still waiting for a first message to finish linking, it tells you. You can also add more accounts for the same app.

### Improvements and fixes

- **Clearer bot deletion:** The confirmation now says which bot will answer that bot's chat channels afterward. If it's your last bot, it warns you that those messages won't get a reply.
- **Removing Discover bots:** A checkbox in the same confirmation lets you keep the bot's data.
- **Cleaner look:** The window background no longer has a glow, actions use neutral colors, and font sizes no longer use half pixels, so text is sharper on Windows.
- **Balance alert:** When your balance runs low, the sidebar just says so. Select your avatar to see the amount.
- **Frosted glass follows your system:** The setting is gone, and the app now follows your system's reduce transparency setting.
- While you create a bot, the sidebar shows its avatar and name as you type, and it no longer flashes to another bot when it's done.
- Dropdown menus now follow the page as it scrolls, and the Discover layout has been refined.

## 0.1.20 - 2026-11-03

### New

- **Discover:** The sidebar now has Discover, with ready-made bots that each have their own view. Opening one shows a sample, and it's only installed when you send your first message. Remove it whenever you like.
- **Company Research:** Give it a company name and it researches financials, news, industry and business, then writes a report with source links for key facts. It can export a PDF if Python is installed.
- **US Stock Research:** Writes research reports from SEC filings, with every number traceable.
- **PPT Master:** Turns documents or topics into editable PPTX decks, and can also make templates or edit decks you have. It needs Python.
- **12 expert avatars:** The avatar picker now has characters for 12 fields, including law, health, finance, coding and design.

### Privacy

- At startup and every 6 hours, the app reads the bot catalog from anymodel.bot, and it downloads a bot's package when you open or use it. These requests only download; your data isn't uploaded. To turn the catalog off, set the environment variable `AMB_CATALOG=off`.

## 0.1.19 - 2026-11-03

### Important changes

- **Sign-in is now required:** Pasting an API key is no longer supported; everyone signs in with a Modelflare account. After you update, any key you entered earlier is removed from this device and the app asks you to sign in. Your bots and conversations keep working once you do.
- **Sign-in now works in Docker and remote deployments:** Sign in from a browser on any device, then paste the link from the address bar back into the app. During command-line setup, enter `remote`.

### New

- **Reasoning effort:** Choose Auto, Low, Medium or High. Higher settings think harder and reply more slowly. With Auto the model decides, and models that can't adjust aren't affected.
- **More detail when testing a model:** Troubleshooting now shows results for the built-in gateway and the direct endpoint separately, with status code, time taken and the original error.

### Improvements and fixes

- If the model list endpoint doesn't respond, the app stops waiting after 30 seconds, so "Test model" no longer spins forever.
- Updated the website's partner page, home page and download page.

## 0.1.18 - 2026-11-03

### New

- This release includes full five-language support, manual API-domain selection and latency checks, update reminders, local proxy diagnostics, and the website, download and partner-page updates. See the 0.1.17 section below for feature details.

### Fixed

- Fixed a documentation check that misidentified roadmap content in Windows checkouts using CRLF line endings. Regression tests now cover LF, CRLF and CR. Application behavior is unchanged by this fix.

## 0.1.17 - 2026-11-03

### New

- **Five languages:** Japanese, Korean and Russian join Simplified Chinese and English across the app, tray, system messages, authorization prompts, website and documentation. Switch languages during onboarding, in Settings or from the command palette.
- **API domains and latency checks:** Manually choose `modelflare.dev`, `origin.modelflare.dev` or `cf.modelflare.dev` and compare response times from the device running the app. Checks send no API key, make no model calls and never switch domains automatically.
- **Update reminders:** The sidebar and About page show available updates. Open the download page or dismiss the reminder for that version.
- **Website partner page:** Learn about partnerships and fill in an application. Without a submission endpoint, the form clearly uses email instead of claiming the application was sent.

### Improved and fixed

- Translation files are organized by module. Release checks validate missing content, placeholders, plurals and documentation links. Russian plurals, localized amounts and dates, Japanese and Korean input methods, and mobile line breaks are improved.
- Refined the website's sky effects, download page and mobile layouts, with localized sharing images, search-engine language annotations and 404 pages.

## 0.1.16 - 2026-11-02

### New

- **Group chats:** With two or more bots, click ＋ in the sidebar to create a group chat and talk to several bots at once. Whoever you @ answers; with no @, the bot that answered last carries on. Bots can also @ another member to hand off. Each bot keeps its own model, workspace and memory, and costs are tracked per bot.

### Changed

- **Balance stays out of the way:** The bottom-left corner now shows only your avatar, name and the settings button. Click the avatar to see your balance and top up. You still get a sidebar reminder when your balance drops below the alert level.

## 0.1.15 - 2026-11-02

### New

- **Accounts shared by all bots:** Add chat and Notion accounts once in Settings › Connections, and every bot can use them. Each service can have several accounts, each with its own alias.
- **Switch bots from a chat:** Send `/bot` in a chat app to see your bots, and `/bot name` once to switch. That chat stays with the new bot, so you don't repeat it on every message. Each bot also knows about the others, so it can answer when you ask.
- **Telegram, Slack and Discord:** Paste a token to connect. No public address needed, and images and files work both ways.
- **Notion:** Connect with one-click authorization or a token. Bots can search, read, create and edit pages, and query databases. They can't delete pages.

### Improved

- **Web search no longer needs a DeepSeek key:** It's free by default, and you can switch to Tavily, Exa, Bocha, Zhipu or your own SearXNG.
- **Characters are separate from roles:** An avatar only sets a bot's looks, and picking a template doesn't change it.

### Changed

- Chat channel setup moved from each bot's info panel to Settings › Connections. Existing accounts move over automatically with no new sign-in, and the same bot still answers by default.
- Owners and allow lists now belong to the account, so anyone allowed on it can talk to any bot. Deleting a bot no longer affects accounts.
