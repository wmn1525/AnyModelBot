<h1 align="center">okinto 中转</h1>

> 0.1.31 · Windows インストール版と Linux AppImage は標準で更新をバックグラウンド取得します。インストールはユーザーが再起動を選んだ時のみ行い、実行中のタスクがあれば待ちます。現在の未署名 macOS 版は引き続き手動更新です。0.1.28 以前からは本版を一度手動インストールしてください。
> 「更新内容」ダイアログとバージョン情報の更新履歴を追加。バージョン確認、ダウンロード、更新説明は本リポジトリを参照します。


<p align="center"><b>自分のパソコンで動く、自分だけの AI ボット。好きなモデルを、使った分だけ。</b></p>

<p align="center">
  <a href="https://api.okinto.com">公式サイト</a> |
  <a href="https://github.com/wmn1525/AnyModelBot/releases">ダウンロード</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_en.md">English</a> |
  日本語 |
  <a href="./README_ko.md">한국어</a> |
  <a href="./README_ru.md">Русский</a> |
  <a href="https://api.okinto.com">okinto 中转</a> |
  <a href="https://api.okinto.com/pricing">料金</a> |
  <a href="./docs/development_ja.md">開発ガイド</a> |
  <a href="https://github.com/wmn1525/AnyModelBot/issues">フィードバック</a>
</p>

<div align="center">

[![リリース][release-shield]][releases-link]
[![ダウンロード][downloads-shield]][releases-link]
[![スター][stars-shield]][stars-link]
[![ライセンス][license-shield]][license-link]
[![CI][ci-shield]][ci-link]

[![対応環境][platform-shield]][releases-link]
[![料金][pricing-shield]][pricing-link]
[![okinto 中转][okinto-shield]][okinto-link]

</div>

# 🤖 okinto 中转

okinto 中转 は Windows、macOS、Linux で動く、ローカルを中心とした AI エージェントアプリです。ボットごとに役割、既定のモデル、ワークスペース、記憶を持ちます。アプリのほか、WeChat、Feishu、Telegram、Slack、Discord からも話しかけられます。ファイルの読み書き、コマンド実行、デスクトップ操作を任せることができ、ワークスペースの外で操作するときは承認を求めます。

会話、記憶、ファイル、API キーは自分の端末に保存します。モデルは [okinto 中转](https://api.okinto.com)（一つのアカウントで好きなモデルをトークン単位の従量料金で利用）から、または自分の公式 API キーで OpenAI、Anthropic、Google などから直接利用できます。okinto 中转 自体にサブスクリプション料金はありません。

xAI の Grok Bot、OpenAI の dots、Anthropic の Claude Duet と同じく、バックグラウンドで働き、判断が必要になったら呼びかける常駐型の個人 AI エージェントです。okinto 中转 は MIT ライセンスのオープンソースで、自分のパソコンやサーバー上で動き、GPT、Claude、Gemini、Grok など好きなモデルを使えます。特定の事業者の定額契約に縛られず、使った分だけ支払います（[詳しい比較](#-okinto-中转-と-grok-botopenai-dotsclaude-duet-の比較)）。

追加設定なしで Super Agent として使えます。バックグラウンドタスク、定期ルール、「あなたの対応待ち」を標準で備えています。設計は DeepSeek の [super-agent プロトタイプ](https://github.com/deepseek-ai/dsh-superagent-prototype) を参考にしており、エージェントは [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上で動きます（[詳しい紹介・中国語](./docs/blog/superagent.md)）。

📥 [ダウンロード](#-ダウンロード) · 🎨 [画面紹介](#-画面紹介) · 🌟 [主な機能](#-主な機能) · 🆚 [比較](#-okinto-中转-と-grok-botopenai-dotsclaude-duet-の比較) · 🔐 [プライバシー](#-仕組みとプライバシー)

⭐ okinto 中转 が気に入ったら、リポジトリにスターを付けて新しいリリースをチェックしてください。

---

**[okinto 中转](https://api.okinto.com)** でモデルを利用できます。[コンソール](https://api.okinto.com)でアカウントを登録し、API キーを作成して、アプリに互換 API を設定します。利用可能なモデル、グループ、料金、使用量は[料金表](https://api.okinto.com/pricing)とアカウントの記録をご確認ください。

API アドレス：`https://api.okinto.com`。設定方法は [API ドキュメント](https://docs.newapi.pro)を参照してください。各プロバイダーの公式 API キーによる直接接続も利用できます。

---

# 📥 ダウンロード

利用する環境を選んでください。各リリースページに全インストーラーと `SHA256SUMS` ファイルを掲載しています。

| 環境 | アーキテクチャ | インストーラー | |
| :--- | :--- | :--- | :--- |
| ![Windows][win-badge] | x64 | `okbot-<version>-win-x64.exe` | [ダウンロード][releases-link] |
| ![Windows][win-badge] | arm64 | `okbot-<version>-win-arm64.exe` | [ダウンロード][releases-link] |
| ![macOS][mac-badge] | Apple silicon | `okbot-<version>-mac-arm64.dmg` | [ダウンロード][releases-link] |
| ![macOS][mac-badge] | Intel | `okbot-<version>-mac-x64.dmg` | [ダウンロード][releases-link] |
| ![Linux][linux-badge] | x64 | `okbot-<version>-linux-x86_64.AppImage` | [ダウンロード][releases-link] |
| ![Linux][linux-badge] | arm64 | `okbot-<version>-linux-arm64.AppImage` | [ダウンロード][releases-link] |

**初回起動。** Windows の警告が出る場合は *詳細情報 → 実行* を選びます。macOS 版は Developer ID 署名と Apple の公証を完了しています。「アプリケーション」に移して起動し、ダウンロードの確認が出たら「開く」を選びます。Linux では AppImage に実行権限を付けて（`chmod +x`）起動します。ウィンドウを閉じるとトレイに格納されます。終了するにはトレイメニューまたは設定を使ってください。

**ダウンロードの検証。**

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

macOS では `shasum -a 256 <file>`、Windows PowerShell では `Get-FileHash <file>` を実行し、`SHA256SUMS` の該当行と比較します。

**NAS やサーバーで Docker を使う**（x64・arm64 対応イメージ）

```bash
git clone https://github.com/wmn1525/AnyModelBot.git
cd AnyModelBot
git submodule update --init --depth 1 vendor/magpie
docker build -t okbot .
docker run -d --name amb -p 3600:3600 -v amb-data:/data okbot
docker exec amb cat /data/ui-token   # http://<host>:3600/?token=<token> を開く
```

ポート 3600 をインターネットに直接公開しないでください。

**ソースから実行する**

```bash
git clone https://github.com/wmn1525/AnyModelBot.git
cd AnyModelBot
npm install
npm run setup      # 内蔵ゲートウェイを取得してビルド
npm start          # http://127.0.0.1:3600/ でローカルコンソールを起動
```

ソースからのビルドには Node.js 22.13 以降と Go 1.26.8 以降が必要です。Docker イメージを自分でビルドする場合は [開発ガイド](./docs/development_ja.md) を参照してください。

# 🌠 画面紹介

画面構成、配色、操作仕様は[デザインライブラリ](./ui/design/README.md)を参照してください。

# 🌟 主な機能

## 🤖 実際に作業するボット

ボットは単なるチャット画面ではありません。役割、既定のモデル、専用のワークスペースと記憶を持ちます。

- **必要な数だけ作成。** ボットごとに役割、モデル、ワークスペース、アバターを設定できます。
- **どんな相手にするかは自由。** 役割は文章で指定し、テンプレートは出発点として使えます。6 種類のアバターは見た目だけを変え、機能には影響しません。
- **ファイルを扱う実作業。** ファイルの読み書きやサンドボックス内でのコマンド実行を行い、成果物をファイルとして会話に返します。
- **ボットごとに 3 段階の権限。** *読み取り専用*、*ワークスペースへの書き込み*（既定：自分のフォルダー内だけ変更し、外は確認）、*フルアクセス*（サンドボックスなし、再帰的な削除は確認）を選べます。
- **スキルのインポート。** 「ボット設定 → スキル」で `SKILL.md` を含む ZIP（1 パッケージにつき 1 スキル、最大 20 MB）を選び、確認して追加します。表示、有効化、無効化、削除に対応し、同名のスキルを再インポートすると確認後に置き換えられます。変更は実行中の作業終了後に反映されます。 [スキルの使い方](./docs/skills_ja.md).
- **承認カードで確認。** 範囲外の操作は止まり、回答を待ちます。
- **再起動後も状況が分かる。** 終了やクラッシュの際に処理中だったメッセージは、次の起動時に会話内で通知します。必要なら再送でき、自動でやり直すことはありません。
- **グループチャット。** グループに複数のボットを追加できます。@ で指定したボットが答え、指定しなければ最後に回答したボットが続けます。ボットが別のメンバーを @ して引き継ぐこともできます。モデル、ワークスペース、記憶、費用はボットごとに分けて管理します。
- **チャット履歴の検索。** サイドバーから端末に保存された全メッセージを検索し、Bot・会話・チャネル・期間で絞り込んで元のメッセージへ移動できます。`Ctrl/Cmd+Shift+F` で全体検索、`Ctrl/Cmd+F` で現在のチャットを検索。モデル呼び出しは不要です。入力前の検索ダイアログには、最近のチャットを日付ごとに表示します。
- **スラッシュコマンド。** `/model` や `/reset` はアプリでも各チャネルでも使えます。チャネルでは `/bot` で別のボットに切り替えられます。

## 🧩 既製の Bot

人設を書かなくても、「見つける」にある既製の Bot をすぐに使えます。Bot にはそれぞれ専用の画面があり、開いたときはサンプルを表示し、最初のメッセージを送ったときにインストールします。

公式 Bot の画面、サンプル、ペルソナ、スキルはインストーラーに同梱されています。初回表示やインストール時に Bot パッケージをダウンロードする必要はありません。更新はアプリとともに配信され、既存のプロジェクトデータは保持されます。モデル呼び出しやオンライン調査にはネット接続が必要です。どのボットもデスクトップのワークスペースで、左に作品の一覧、右に内容を表示します。「新規」はガイド付きフォームで始められ、上部のバーで会話全体に切り替えられます。入力欄ではモデルも選べます。

- **企業リサーチ：** 手元のデバイスで企業を調査：4 方面のリサーチ、選別、要約、出典付きレポートと PDF
- **PPT マスター：** 文書やテーマから編集可能な PPTX を作成。テンプレート作成や既存の PPT の編集も
- **映像スタジオ：** 短編動画・連続ドラマの脚本、素材、絵コンテ、音声、完成映像
- **米国株リサーチ：** 米国上場企業の決算と SEC 提出書類を調べ、すべての数字をたどれるレポートを作成

詳しくは[公式サイトの Bot ページ](https://api.okinto.com)をご覧ください。

## ⏳ 裏で働き、必要なときだけ声をかける

- **バックグラウンドタスク。** 調査、レポート、ファイル整理など時間のかかる依頼や「バックグラウンドで進めて」という指示では、タスクを裏で実行します。その間も会話でき、結果は依頼元の会話に戻ります。
- **追加の依頼。** WeChat では結果を引用し、Feishu では結果に返信すると、そのタスクに続けて依頼できます。
- **ルール。** 「毎朝 8 時に X の価格を調べ、200 を下回ったら教えて」で、定期的に確認して重要な変化だけを知らせるルールを作れます。まず動きを見たいときは「最初は観察だけ」と伝えてください。送信予定の内容を記録し、実際の送信やファイル変更は行いません。確認できたら実行モードへ切り替えます。
- **あなたの対応待ち。** 回答、承認、再試行など、全ボットの待ち項目がサイドバーの一か所に集まります。対応事項があるときだけ表示されます。情報パネルのタスク欄では、ボットのタスクやルールを手順ごとに確認できます。
- **静かに動くのが基本。** 通知するのは結果、判断の依頼、失敗だけで、進捗は送りません。通知しない時間は 22:00〜08:00。自発的なメッセージは 1 日に WeChat で 3 件、その他のチャネルで 5 件までとし、残りを一つにまとめます。
- **予算管理。** タスクとルールには予算があります（タスクごとに 1 米ドル、ルールの実行ごとに 0.10 米ドル、月に 3 米ドル）。使い切ると停止して確認します。タスク詳細やルール編集画面で変更できます。
- **いつでも一時停止。** ボット設定 › ボットからのメッセージのスイッチで、会話を続けたままバックグラウンド作業を止められます。
- **自動整理。** タスクと実行履歴は 30 日間保持します。30 日間使われていないタスクフォルダーは確認なしで削除します。詳細に予定日を表示し、「保持」で残せます。履歴は Markdown で書き出せます。

詳しい紹介（中国語）：[okinto 中转 スーパーエージェント](./docs/blog/superagent.md)。

## 🖥️ パソコンを操作し、画像や動画を作る

- **コンピューター操作**には同梱の [Cua Driver](https://github.com/trycua/cua) を使います。既定では自動実行し、*画面を変更する前に確認*へ切り替えるとクリックやキー入力のたびに待ちます。画面の読み取りに承認は不要です。macOS ではベータ機能で、「アクセシビリティ」と「画面収録」の権限は初めて必要になったときに確認し、足りない権限はチャットで案内します。
- **画像・動画の生成**は、曖昧な依頼も妥当に解釈してすぐに始めます。見積もりが 0.50 米ドルを超えるときだけ先に確認するため、モデルやプロンプトを見てその場でモデルを変更できます。毎回確認したい場合はボット設定で有効にしてください。

## 🌐 okinto 中转 または公式 API で好きなモデルを

- **okinto 中转 を利用。** [コンソール](https://api.okinto.com)で API キーを作成し、[API ドキュメント](https://docs.newapi.pro)に従って互換 API とモデル ID を設定します。
- **公式 API キーも利用可能。** OpenAI、Anthropic、Google Gemini、xAI、DeepSeek、Kimi、GLM、Qwen、MiniMax、Mistral に対応。公式 API のリクエストはプロバイダーへ直接送信され、料金もプロバイダーが請求します。
- **ボットごとに既定モデルを設定**でき、会話中にも変更できます。
- **料金と使用量。** 対応モデル、課金グループ、残高、使用量は okinto 中转 コンソールで確認してください。

## 🧠 記憶を引き継ぎ、どこからでもつながる

- **会話をまたぐ記憶。** チーム、ボット、グループの 3 層に Markdown で記憶し、秘密情報らしい内容は除外します。
- **長い会話も続けやすく。** コンテキスト管理が上限に近づく前に圧縮するか、引き継ぎ要約を作って新しい区間を始めます。
- **すべてのボットでアカウントを共有。** WeChat、Feishu、Telegram、Slack、Discord、Notion のアカウントは設定で一度追加すれば共有できます。サービスごとに別名付きで複数登録でき、チャットで `/bot name` を一度送るだけでボットが切り替わります。Notion や Feishu のメッセージを読ませることもできます。
- **WeChat と Feishu。** WeChat は QR コードで接続します。Feishu は返信が逐次表示されるカードに対応し、WeChat でも画像とファイルを扱えます。
- **Telegram、Slack、Discord。** 設定 › 接続にトークンを貼り付けるだけで、公開アドレスは不要です。返信は逐次表示され、画像とファイルを双方向で送れます。現在はダイレクトメッセージのみで、承認や質問には文章で回答します。
- **4 つの使い方。** デスクトップ、コマンドライン、Docker、`127.0.0.1:3600` のローカル Web コンソールから使えます。

## 🔒 ローカル中心で、見やすい画面

- **データは手元に。** 会話、記憶、ファイル、API キーは端末に保存します。コンソールは `127.0.0.1` のみで待ち受け、デスクトップは起動ごとに新しいアクセストークンを作ります。
- **あなたが許可した相手だけに回答。** 既定では所有者と許可リストの相手に限ります。WeChat は QR コードを読み取ったアカウント、Feishu、Telegram、Slack、Discord は接続後最初に話しかけた本人が所有者です。それ以外には短い案内だけを返し、モデルは呼びません。情報パネルまたは `yes <code>` の返信で許可できます。
- **返信を失わないために。** 送信前にローカルへ保存し、通信エラー時は再試行、再起動後も送信を再開します。WeChat の 24 時間制限を過ぎた返信は、次にメッセージを受け取ってから届けます。
- **テレメトリーを無効化。** 同梱の操作ドライバーのテレメトリーと、内蔵ゲートウェイの自動更新を無効にしています。
- **アプリ内更新。** 0.1.29 以降のデスクトップインストール版では「設定 → 一般 → 更新を自動ダウンロード」が標準で有効です。バックグラウンドでダウンロードし、完了すると「再起動して更新」を表示します。インストールはユーザーのクリック後、実行中のタスクがない場合に行います。設定をオフにすると手動ダウンロードになります。0.1.28 以前からは、一度だけ 0.1.29 以降を手動インストールしてください。Docker とソースからの実行は手動更新です。0.1.30 以降は、更新後に初めて開いたときに変更点を表示します。新しいバージョンの通知から更新前に内容を確認でき、「設定 → このアプリについて」でいつでも更新履歴を見られます。
- **ライト、ダーク、システムに合わせる。** 6 体のボットの目がポインターを追います。
- **トレイと自動起動。** 閉じるとトレイに格納します。macOS と Windows ではログイン時の自動起動も使えます。

> [!NOTE]
> 機能はモデル、OS、付与した権限によって異なります。コンピューター操作にはデスクトップセッションが必要で、macOS ではベータです。モデルへのリクエストは選択した提供元へ送信されます（公式 API キーの場合は直接、それ以外は okinto 中转 経由）。[仕組みとプライバシー](#-仕組みとプライバシー)を参照してください。

# 🆚 okinto 中转 と Grok Bot、OpenAI dots、Claude Duet の比較

2026 年後半、xAI の [Grok Bot](https://x.ai/bot)、OpenAI の [dots](https://openai.com/index/introducing-dots/)、Anthropic の Claude Duet により、常駐型の個人 AI エージェントが注目されるようになりました。状況を見守り、裏で働き、判断が必要になったら尋ねます。okinto 中转 も同じ種類の仕事を、オープンソースで、自分の端末で、好きなモデルを使って行います。

| | okinto 中转 | Grok Bot | OpenAI dots | Claude Duet |
| :--- | :--- | :--- | :--- | :--- |
| オープンソース | ✅ MIT | — | — | — |
| 実行場所 | 自分のパソコンまたはサーバー | xAI のクラウドコンピューター | OpenAI のクラウドコンピューター | Anthropic のクラウド |
| モデル | GPT、Claude、Gemini、Grok、DeepSeek、Kimi、GLM など 70 種類以上（okinto 中转 または公式 API 経由） | 主に xAI の Grok | OpenAI のモデル | Claude（Opus 5.5） |
| 費用 | アプリ無料、モデルはトークン単位 | 定額契約 | ChatGPT Pro / Business Premium 契約 | Claude Pro / Max 契約 |
| 利用手段 | デスクトップ（Windows、macOS、Linux）、Docker、WeChat、Feishu、Telegram、Slack、Discord | デスクトップ、iPhone | ChatGPT、Slack、Teams | iOS、Android、claude.ai |
| 提供状況 | 今すぐダウンロード可能 | ベータ | 一部地域 | 研究プレビュー、米国の待機リスト |

okinto 中转 もバックグラウンドで働きます。依頼したタスクを終えたらチャットアプリに結果を届け、承認や回答が必要な項目はサイドバーの「あなたの対応待ち」に表示します。すべての作業手順を確認でき、ワークスペース外の操作は先に尋ねます。

> [!NOTE]
> 他製品の情報は 2026 年 10 月時点の公開情報に基づいており、変更されている可能性があります。各社の公式情報をご確認ください。Grok Bot、dots、Claude Duet はそれぞれ xAI、OpenAI、Anthropic の製品・商標です。okinto 中转 はこれらの企業と提携していません。

# 🔐 仕組みとプライバシー

| 端末に保存するもの | 端末の外に送るもの |
| :--- | :--- |
| 会話とセッション（ローカル SQLite） | 回答に必要なプロンプト、ファイル、ツール結果を 選んだ提供元へ（公式 API キーの場合は直接、それ以外は okinto 中转 経由） |
| 記憶（Markdown） | 画面を見るよう依頼したときのスクリーンショット |
| ボットごとの作業ファイル | 各プラットフォームを通るチャネルのメッセージ |
| API キーとログイントークン | okinto 中转 コンソールと API へのアクセス（api.okinto.com） |
| 設定 | Notion・Feishu アカウントを追加した場合の読み書き。読み取った内容はモデルのリクエストにも含まれる |

okinto 中转 を利用すると、モデルへのリクエストは端末を離れ、中継サービスを経由します。[コンソール](https://api.okinto.com)に掲載される利用規約とプライバシー情報をご確認ください。データの流れは[プライバシーの説明](./docs/privacy_ja.md)を参照してください。

| レイヤー | 技術 |
| :--- | :--- |
| 画面 | Preact + htm、ビルド不要 |
| バックエンド | Node.js 22.13 以降、TypeScript、`node:sqlite` |
| デスクトップ | Electron、トレイ対応 |
| モデルゲートウェイ | [magpie](https://github.com/yetone/magpie)（Go、MIT）、同梱してアプリから起動 |
| エージェントランタイム | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）、別プロセスで実行 |
| コンピューター操作 | 同梱の [Cua Driver](https://github.com/trycua/cua) |
| チャネル | Feishu（持続接続と逐次更新カード）、WeChat（iLink）、Telegram（ロングポーリング）、Slack（Socket Mode）、Discord（Gateway） |
| データアカウント | Notion（REST API・公式リモート MCP）、Feishu メッセージ（ユーザー権限・読み取り専用） |
| テストと CI | Vitest、GitHub Actions |

# 📝 ロードマップ

検討中の方向性です。実装の約束やスケジュールではありません。各版の変更は [変更履歴](./CHANGELOG_ja.md) をご覧ください。

- [x] **定期タスク**：タイマーに従って実行（上記のルールとして提供済み）。
- [x] **アプリ内グループチャット**：複数のボットと一つのグループで会話。
- [ ] **チャネルのグループチャット**：現在のチャネルは一対一のみ。
- [x] **多言語画面**：中国語簡体字、英語、日本語、韓国語、ロシア語。設定で切り替え可能。
- [ ] **macOS のコンピューター操作**：より多くの実機で直接モードを検証し、ベータを終了。
- [ ] **メール・カレンダー・イベント起動**：アカウントを接続し、特定の人からのメッセージや会議開始前などの出来事でもルールを実行。外部コンテンツをきっかけにした実行は権限を下げ、他人が書いた文章からボットに指示できないようにする。
- [ ] **常時稼働・バックアップ・移行**：パソコンがオフだとルールは動かないため、自分のサーバーへの簡単な配備、会話・記憶・アカウントの移行、バックアップ・復元を整備。
- [ ] **独自 MCP サーバーの追加**：現在は内蔵ツールとアカウントのみ。GitHub や Linear などを自分で接続できるようにする。
- [ ] **ボット同士の協力**：別のモデルで下書きとレビューを分担するなど、費用を分けて作業を引き継ぐ。
- [ ] **音声メッセージの文字起こし**：現在 Telegram の音声は聞けず、WeChat はプラットフォーム側の文字起こしに依存。
- [ ] **独立したモバイルアプリ**：現在は WeChat、Feishu、Telegram、Slack、Discord から利用。

ほかのアイデアは [Issue](https://github.com/wmn1525/AnyModelBot/issues) や [Discussion](https://github.com/wmn1525/AnyModelBot/discussions) へ。取り組む項目には [`roadmap`](https://github.com/wmn1525/AnyModelBot/labels/roadmap) ラベルを付けます。

# 🤝 コントリビューション

不具合報告、修正、文書、アイデアのいずれも歓迎します。

1. まず既存の [Issue](https://github.com/wmn1525/AnyModelBot/issues) と [Discussion](https://github.com/wmn1525/AnyModelBot/discussions) を確認してください。[`good first issue`](https://github.com/wmn1525/AnyModelBot/labels/good%20first%20issue) が初めての参加に向いています。
2. フォークして `master` からブランチを作成します。
3. ローカルで動かし、変更します。

   ```bash
   npm install
   npm run setup          # 内蔵ゲートウェイを取得してビルド
   npm run electron:dev   # 開発モードでデスクトップを起動
   npm run typecheck && npm test
   ```

4. `master` 向けのプルリクエストで変更内容と理由を説明します。小さな修正を超えるものは、先に Issue で方針を相談してください。

詳しくは [貢献ガイド](./CONTRIBUTING_ja.md) をお読みください。セキュリティ上の問題は公開 Issue ではなく [セキュリティポリシー](./SECURITY_ja.md) に従って報告してください。

# 🔗 関連プロジェクト

- [okinto 中转](https://api.okinto.com)：モデルを提供する AI API ゲートウェイ。
- [magpie](https://github.com/yetone/magpie)：同梱の Go ゲートウェイ（MIT）。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：エージェントランタイム（MIT）。
- [Cua](https://github.com/trycua/cua)：コンピューター操作ドライバー。
- [kimi-computer-use](https://github.com/songkeys/kimi-computer-use)：macOS 操作ブリッジ。
- [openclaw-weixin](https://github.com/Tencent/openclaw-weixin)：WeChat チャネルの移植元（MIT）。
- [DS Bot](https://github.com/Fei2411/DS-Bot)：記憶とコンテキスト管理の設計元（Apache-2.0）。

ライセンスと告知の全文：[第三者に関する告知](./THIRD_PARTY_NOTICES_ja.md)。

# 💬 コミュニティ

- **質問・アイデア：** [GitHub Discussions](https://github.com/wmn1525/AnyModelBot/discussions)
- **不具合・機能要望：** [GitHub Issues](https://github.com/wmn1525/AnyModelBot/issues)

# 🚀 貢献者

<a href="https://github.com/wmn1525/AnyModelBot/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=wmn1525/AnyModelBot" alt="okinto 中转 の貢献者" />
</a>

# ⭐️ スターの推移

<a href="https://www.star-history.com/#wmn1525/AnyModelBot&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=wmn1525/AnyModelBot&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=wmn1525/AnyModelBot&type=Date" />
    <img alt="okinto 中转 のスター数の推移" src="https://api.star-history.com/svg?repos=wmn1525/AnyModelBot&type=Date" width="100%" />
  </picture>
</a>

# 📜 ライセンス

okinto 中转 は [MIT ライセンス](./LICENSE) で公開しています。同梱の第三者ソフトウェアはそれぞれのライセンスに従います。[第三者に関する告知](./THIRD_PARTY_NOTICES_ja.md) と [`LICENSES/`](./LICENSES) をご確認ください。

<!-- link & badge references -->
[release-shield]: https://img.shields.io/github/v/release/wmn1525/AnyModelBot?include_prereleases&label=release&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB4PSIzIiB5PSI5IiB3aWR0aD0iOTQiIGhlaWdodD0iODIiIHJ4PSIzNiIgZmlsbD0iI2Q3ZmYwMCIvPjxyZWN0IHg9IjI5IiB5PSIzNiIgd2lkdGg9IjEzIiBoZWlnaHQ9IjI4IiByeD0iNi41IiBmaWxsPSIjMTYxYTAwIi8+PHJlY3QgeD0iNTgiIHk9IjM2IiB3aWR0aD0iMTMiIGhlaWdodD0iMjgiIHJ4PSI2LjUiIGZpbGw9IiMxNjFhMDAiLz48L3N2Zz4=&style=flat-square&labelColor=161a00&color=d7ff00
[downloads-shield]: https://img.shields.io/github/downloads/wmn1525/AnyModelBot/total?logo=github&logoColor=d7ff00&style=flat-square&labelColor=161a00&color=d7ff00
[stars-shield]: https://img.shields.io/github/stars/wmn1525/AnyModelBot?logo=github&logoColor=d7ff00&style=flat-square&labelColor=161a00&color=d7ff00
[license-shield]: https://img.shields.io/github/license/wmn1525/AnyModelBot?logo=opensourceinitiative&logoColor=d7ff00&style=flat-square&labelColor=161a00&color=d7ff00
[ci-shield]: https://img.shields.io/github/actions/workflow/status/wmn1525/AnyModelBot/ci.yml?branch=master&label=CI&logo=githubactions&logoColor=d7ff00&style=flat-square&labelColor=161a00&color=d7ff00
[platform-shield]: https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Docker-d7ff00?style=flat-square&labelColor=161a00
[pricing-shield]: https://img.shields.io/badge/pricing-pay--as--you--go-d7ff00?style=flat-square&labelColor=161a00
[okinto-shield]: https://img.shields.io/badge/okinto-%E4%B8%AD%E8%BD%AC-d7ff00?style=flat-square&labelColor=161a00
[win-badge]: https://img.shields.io/badge/Windows-161a00?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2Q3ZmYwMCI+PHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjkuNSIgaGVpZ2h0PSI4LjUiLz48cmVjdCB4PSIxMi41IiB5PSIzIiB3aWR0aD0iOS41IiBoZWlnaHQ9IjguNSIvPjxyZWN0IHg9IjIiIHk9IjEyLjUiIHdpZHRoPSI5LjUiIGhlaWdodD0iOC41Ii8+PHJlY3QgeD0iMTIuNSIgeT0iMTIuNSIgd2lkdGg9IjkuNSIgaGVpZ2h0PSI4LjUiLz48L3N2Zz4=
[mac-badge]: https://img.shields.io/badge/macOS-161a00?style=for-the-badge&logo=apple&logoColor=d7ff00
[linux-badge]: https://img.shields.io/badge/Linux-161a00?style=for-the-badge&logo=linux&logoColor=d7ff00

[releases-link]: https://github.com/wmn1525/AnyModelBot/releases
[stars-link]: https://github.com/wmn1525/AnyModelBot/stargazers
[license-link]: https://github.com/wmn1525/AnyModelBot/blob/master/LICENSE
[ci-link]: https://github.com/wmn1525/AnyModelBot/actions/workflows/ci.yml
[pricing-link]: https://api.okinto.com/pricing
[okinto-link]: https://api.okinto.com
