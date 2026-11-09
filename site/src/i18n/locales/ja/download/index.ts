export default {
  warn: "ポート 3600 をインターネットに直接公開しないでください。",
  win: "Windows 版をダウンロード",
  mac: "macOS 版をダウンロード",
  linux: "Linux 版をダウンロード",
  mobile: "チャットサービスから利用",
  generic: "ダウンロード",
  more: "ほかのプラットフォーム",
  items: {
    "win-x64": "Windows インストーラー（NSIS）",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    docker: "Docker コマンド",
    changelog: "変更履歴",
  },
  platform: {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux",
  },
  arch: {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage",
  },
  meta: "バージョン {version} · 公開日 {publishedAt}",
  sha: "SHA-256",
  started:
    "ダウンロードを開始しました。ブラウザーのダウンロード一覧をご確認ください。",
  downloading: "ダウンロード中…",
  macNote:
    "macOS のコンピューター操作はベータ版です。直接操作モードは、さらに多くの実機での検証が必要です。「アクセシビリティ」と「画面収録」の権限は、ボットが初めて必要としたときに確認します。それ以外の機能は Windows / Linux 版と同じです。",
  linuxHint: "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  winHint:
    "Windows の警告が表示されたら、「詳細情報」→「実行」を選択してください。",
  macHint:
    "Developer ID 署名と Apple の公証済みです。「アプリケーション」に移して起動し、ダウンロードの確認が出たら「開く」を選びます。",
  firstRun: "初回起動",
  yourSystem: "お使いの環境",
  verifyTitle: "ダウンロードを検証",
  verifyLead:
    "お使いの OS のコマンドを実行し、SHA-256 がここに掲載された値と一致することを確認してください。一致すればファイルは破損していません。",
  verifyUnixLabel: "macOS / Linux",
  verifyWin: "Get-FileHash .\\<file> -Algorithm SHA256",
  verifyUnix: "shasum -a 256 <file>",
  pageTitle: "AnyModelBot をダウンロード",
  pageLead:
    "無料・オープンソース。アプリ自体の登録は不要です。初回起動時に Modelflare にログインすれば準備完了です。",
  pageDescription:
    "Windows、macOS、Linux、Docker 向けの AnyModelBot をダウンロード。無料のオープンソースアプリで、モデルは従量課金です。",
  altTitle: "ほかの起動方法",
  dockerTitle: "Docker",
  dockerSteps: {
    run: "コンテナーを起動",
    token: "アクセストークンを確認",
    open: "ブラウザーで開く",
  },
  dockerUrl: "http://<host>:3600/?token=<token>",
  cliTitle: "コマンドライン（CLI）",
  cliBody:
    "ソースから実行できます。Node.js 22.13 以降と、内蔵ゲートウェイのビルドに Go 1.26.8 以降が必要です。",
  cliSteps: {
    clone: "リポジトリをクローン",
    setup: "依存関係をインストールし、ゲートウェイをビルド",
    start: "起動後、http://127.0.0.1:3600/ を開く",
  },
  releases: "GitHub のリリース",
  changelog: "変更履歴",
};
