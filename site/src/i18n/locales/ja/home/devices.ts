export default {
  h2: "どこからでも話しかけられる。",
  h2dim: "同じボット、同じ記憶。",
  lead: "デスクトップ、Docker、ブラウザー。スマートフォンでは Slack、Telegram、Discord から話せます。",
  items: {
    desktop: {
      title: "デスクトップ",
      sub: "Windows · macOS · Linux",
      body: "Windows、macOS、Linux。ダウンロードしてすぐ使えます。",
      more: "すべてのダウンロードとチェックサム →",
    },
    docker: {
      title: "Docker",
      sub: "NAS / サーバー",
      body: "NAS やサーバーで、いつでも稼働。",
    },
    browser: {
      title: "ブラウザー",
      body: "デスクトップ版にも Docker にも、ローカルの Web コンソールが付属します。",
      format: "ローカル / セルフホスト",
    },
  },
  pick: "使う場所を選択",
  groupChat: "チャットサービス",
  thread: {
    user: "日報はいつも何時に送ってたっけ？",
    bot: "毎日17時です。先週教えてくれましたね。",
    memo: "日報は毎日17時",
    memoLabel: "記憶",
  },
  chatBody:
    "接続すれば、スマートフォンからタスクを送れます。ボットを動かすパソコンやサーバーは、電源を入れてネットにつないだままにしてください。",
  howTo: "手順を見る",
  guideTitle: "設定ガイド",
  note: "iOS / Android 専用アプリはまだありません。スマートフォンでは Slack、Telegram、Discord から会話できます。Web コンソールはローカルまたはセルフホストで動くもので、クラウド版アプリではありません。",
  browserGuide: {
    title: "ローカル Web コンソール",
    steps: [
      "デスクトップ版：トレイメニュー →「ブラウザーで開く」。コンソールは 127.0.0.1 で待ち受け、起動するたびにランダムなアクセストークンを生成します。",
      "Docker：http://<host>:3600/?token=<token> を開きます。トークンは docker exec amb cat /data/ui-token で確認できます。",
      "ポート 3600 をインターネットに直接公開しないでください。",
    ],
  },
};
