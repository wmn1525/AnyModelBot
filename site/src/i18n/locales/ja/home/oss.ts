export default {
  facts: [
    {
      text: "コンソールは既定で 127.0.0.1 で待ち受け、Host ヘッダーを検証します。ローカルからのアクセスにもアクセストークンが必要です。",
      path: "src/web/server.ts",
    },
    {
      text: "モデルのキーはエージェントのプロセスに渡りません。画面には末尾4文字だけを表示します。",
      path: "src/agent/bridge.ts · src/agent/host.ts",
    },
    {
      text: "ファイル操作とコマンド実行はサンドボックス内のワークスペースに制限され、外部への操作には許可が必要です。Linux ではコマンドを bubblewrap 内でのみ実行してデータディレクトリも隠し、使えない場合は実行を拒否します。",
      path: "src/agent/host.ts",
    },
    {
      text: "記憶にはパスワード、キー、身分証番号を保存しません。",
      path: "src/agent/memory.ts",
    },
    {
      text: "コンピューター操作ドライバー Cua のテレメトリー環境変数を 0 に設定し、magpie の自動更新を無効にしています。",
      path: "src/agent/cua-driver.ts · src/magpie/supervisor.ts",
    },
  ],
};
