export default {
  "status": "状態",
  "checks": "テスト",
  "version": "バージョン",
  "dataDir": "データフォルダー",
  "copyPath": "パスをコピー",
  "logFile": "ログファイル",
  "logFileSub": "サイズに応じて切り替え、最新の 4 ファイルを保持します",
  "logFileOff": "無効",
  "test": "テスト",
  "testing": "テスト中…",
  "model": "モデル：{model}",
  "none": "（なし）",
  "copyReport": "診断情報をコピー",
  "copied": "診断情報をコピーしました（キーは除去済み）",
  "note": "上記の状態、最新のテスト結果、ログをコピーします。API キーやトークンなどの秘密情報は *** に置き換えるため、そのままサポートに送れます。",
  "community": "解決しないときは、コミュニティで質問できます",
  "secs": "{s} 秒",
  "restarts": {
    "other": "{count} 回再起動"
  },
  "lastExit": "前回の終了コード={code}{signal}",
  "verdict": {
    "ok": "正常",
    "bad": "問題が見つかりました"
  },
  "gateway": {
    "name": "モデルゲートウェイ",
    "fromEnv": "{env} による設定",
    "running": "稼働中",
    "starting": "起動中",
    "restarting": "再起動中",
    "failed": "失敗",
    "stopped": "停止中",
    "external": "外部エンドポイント"
  },
  "agent": {
    "name": "エージェントプロセス",
    "nameFor": "エージェントプロセス · {bot}",
    "noRuntime": "エージェントランタイム（DSH）が見つかりません。ボットはチャットのみ利用できます",
    "disabled": "エージェントモードが無効です。ボットはチャットのみ利用できます",
    "startsOnFirst": "最初のメッセージを受信すると起動します",
    "stderr": {
      "other": "エージェントプロセスの出力（標準エラー出力の末尾 {count} 行）"
    }
  },
  "host": {
    "running": "稼働中",
    "starting": "起動中",
    "backoff": "再試行待ち",
    "error": "一時停止中",
    "stopped": "未起動"
  },
  "hostSub": {
    "elapsed": "{time} 経過",
    "stage": "段階：{stage}",
    "firstStart": "初回起動には数分かかることがあります（ウイルス対策ソフトがランタイムの各ファイルを検査します）",
    "maxWait": {
      "other": "最大 {count} 分待機します"
    },
    "initTime": "{time} で起動しました",
    "activeTurns": {
      "other": "{count} 件のターンを処理中"
    },
    "retryIn": {
      "other": "{count} 分後に自動で再試行します。下の「エージェントプロセスを再起動」からも再試行できます"
    }
  },
  "init": {
    "prepare": "準備中",
    "bridgeReady": "モデルブリッジの準備完了",
    "sdkLoaded": "ランタイムを読み込み中",
    "patchWritten": "設定を書き込み中",
    "childSpawned": "プロセス起動済み",
    "initializing": "初期化中（プラグインを読み込み中）"
  },
  "stage": {
    "ok": "成功",
    "warn": "警告",
    "fail": "失敗",
    "timeout": "タイムアウト",
    "skipped": "スキップ",
    "pending": "処理中"
  },
  "pwsh": {
    "checking": "確認中",
    "checkingBusy": "確認中…",
    "missing": "未インストール",
    "looking": "PowerShell 7 を検索中",
    "usedBy": "エージェントのコマンド実行に使用します",
    "old": "古いバージョンです。PowerShell 7 をインストールすると、コマンドをより高速かつ安定して実行できます",
    "builtin": "エージェントは Windows 標準の PowerShell 5.1 でコマンドを実行しており、1 回につき 20～30 秒かかることがあります。PowerShell 7 をインストールすると、より高速かつ安定して実行できます",
    "recheck": "再確認",
    "install": "PowerShell 7 をインストール",
    "copyCmd": "インストールコマンドをコピー",
    "download": "ダウンロード ↗",
    "fallback": "{from} を起動できなかったため（{reason}）、自動的に切り替えました",
    "unusable": "利用不可",
    "notInstalled": "未インストール",
    "usedByFrom": "エージェントのコマンド実行に使用します（{source}）",
    "installingSub": "エージェント用に PowerShell 7 をインストール中です（管理者権限は不要）。完了するまでは Windows PowerShell 5.1 を使用します",
    "badSub": "アプリ管理の PowerShell 7 を利用できません：{reason}",
    "failedSub": "インストールできませんでした：{error}",
    "unknownReason": "原因不明",
    "using51": "現在、エージェントは Windows PowerShell 5.1 を使用しています",
    "slow51": "エージェントは Windows PowerShell 5.1 を使用しており、コマンド 1 回につき 20～30 秒かかることがあります",
    "slow51Advice": "エージェントは Windows PowerShell 5.1 を使用しており、コマンド 1 回につき 20～30 秒かかることがあります。PowerShell 7 なら大幅に短縮できます",
    "reinstall": "再インストール",
    "installShort": "インストール",
    "reinstallPrivate": "アプリ管理の PowerShell 7 を再インストール",
    "useSystem": "システムの既定設定に戻す",
    "useSystemNote": "アプリ管理の PowerShell 7 の使用を停止します",
    "usePrivate": "アプリ管理の PowerShell 7 を使用",
    "installSelf": "自分で PowerShell 7 をインストール…",
    "more": "その他",
    "moreLabel": "PowerShell のその他の操作",
    "source": {
      "private": "アプリ管理",
      "programFiles": "Program Files",
      "preview": "プレビュー"
    }
  },
  "testModel": {
    "name": "モデルをテスト",
    "sub": "内蔵ゲートウェイ経由とエンドポイントへの直接接続で最小限のリクエストを 1 回ずつ送り、ステータスコード、応答時間、返されたモデル名を比較します",
    "viaGateway": "内蔵ゲートウェイ経由",
    "direct": "エンドポイントへの直接接続"
  },
  "probe": {
    "untested": "未テスト",
    "ok": "正常",
    "echoed": "返されたモデル名：{model}",
    "reply": "返信：「{reply}」"
  },
  "testAgent": {
    "name": "エージェントをテスト",
    "sub": "エージェントプロセスで最小限のターンを実行し、起動 → プラグイン → モデル → 返信のどこで止まるかを調べます。チャット履歴には保存しません",
    "ok": "エージェントは正常に動作しています",
    "stuckAt": "停止している段階：{stage}",
    "bot": "ボット：{name}",
    "total": "合計 {time}"
  },
  "restart": {
    "name": "エージェントプロセスを再起動",
    "sub": "返信が終わらない場合に使用します。プロセスを停止して再試行の待ち時間を解除し、次のメッセージで再起動します",
    "button": "再起動",
    "restarting": "再起動中…",
    "done": "エージェントプロセスを再起動しました",
    "notRunning": "エージェントプロセスはまだ起動していません。次のメッセージで起動します"
  },
  "logs": {
    "title": "最近のログ",
    "lines": {
      "other": "{count} 行"
    },
    "empty": "（ログはまだありません）",
    "readFailed": "ログを読み込めませんでした：{error}"
  }
};
