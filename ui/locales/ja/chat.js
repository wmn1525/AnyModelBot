export default {
  "aria": "{name} との会話",
  "infoPanel": "右パネル（⌘⇧I）",
  "newConvCmd": "新しい会話（/new）",
  "newConv": {
    "divider": "新しい会話を始めました",
    "already": "すでに新しい会話です",
    "busy": "返信が終わると新しい会話を始められます",
    "agentOff": "エージェントモードがオフのため、新しい会話を始められません。「コンテキストを消去」でやり直せます。",
    "failed": "新しい会話を始められませんでした：{error}",
  },
  "toBottom": "一番下にスクロール",
  "copyMessage": "メッセージをコピー",
  "commandsLabel": "コマンド",
  "commands": {
    "stop": "処理中のメッセージを停止",
    "tasks": "バックグラウンドタスクを表示（/stop <番号> で個別に停止）",
    "model": "モデルの一覧を表示、または切り替え",
    "new": "新しい会話を開始（現在の会話は引き継ぎメモを付けて保存）",
    "reset": "この会話のコンテキストを消去",
    "status": "現在のモデル、モード、進行状況を表示",
    "help": "すべてのコマンドを表示"
  },
  "perm": {
    "menu": "ファイルへのアクセス",
    "title": "ファイルへのアクセス：{note}",
    "workspace": "ワークスペースへの書き込み",
    "workspaceNote": "このボットのワークスペース内のみ編集できます。それ以外は事前に確認します",
    "readonly": "読み取り専用",
    "readonlyNote": "ファイルは編集できません。コマンドは読み取り専用のサンドボックスで実行されます",
    "more": "その他の権限設定…"
  },
  "approval": {
    "neededTask": "「{title}」に承認が必要です · {code}",
    "needed": "承認が必要です · {code}",
    "fallbackReason": "ボットがワークスペース外で操作しようとしています",
    "allowOnce": "今回のみ許可",
    "deny": "拒否"
  },
  "question": {
    "taskAsks": "「{title}」からの質問",
    "otherOptional": "その他（任意）",
    "yourAnswer": "回答を入力",
    "orOther": "または別の回答を入力",
    "submit": "送信"
  },
  "file": {
    "open": "{name} を開く",
    "reveal": "フォルダーで表示",
    "gone": "ファイルが見つかりません"
  },
  "work": {
    "stopping": "停止中…",
    "stoppingAfter": "{d} 経過、停止中…",
    "process": "処理の記録",
    "done": "{d} かけて処理しました",
    "replying": "{d} 間返信を生成中",
    "thinkingFor": "{d} 間思考中",
    "thinking": "思考中"
  },
  "error": {
    "stopFailed": "停止できませんでした：{error}",
    "fixKey": "ログイン",
    "fixOfficialKey": "キーを変更",
    "officialKeyInvalid": "{name} がこの API キーを拒否しました。無効か、取り消された可能性があります。",
    "authInvalid": "Okinto New API へのアクセス許可が無効か、取り消されています。もう一度ログインしてください。",
    "loadHistory": "メッセージ履歴を読み込めませんでした：{error}"
  },
  "menu": {
    "more": "その他の操作",
    "switchModel": "モデルを切り替え…",
    "newConv": "新しい会話",
    "reset": "コンテキストを消去",
    "status": "状態を表示",
    "allCommands": "すべてのコマンド",
    "usables": "スキルとアプリ"
  },
  "use": {
    "skills": "スキル",
    "apps": "アプリ",
    "search": "スキルやアプリを検索",
    "noMatch": "一致する項目はありません",
    "prefill": "{name}を使って{cursor}…",
    "appExample": "{app}を使って…",
    "appTool": "{app} · {tool}",
    "readonlyDesc": "読み取り専用：検索と閲覧のみ",
    "readonlyNo": "読み取り専用のため、書き込みはできません",
    "noSkills": "このボットにはまだ使えるスキルがありません。",
    "noSkillsBody": "スキルをインポートするか、スキルライブラリのインストール指示をボットに送ってください。",
    "importSkill": "スキルをインポート",
    "noApps": "このボットにはまだ使えるアプリがありません。",
    "noAppsBody": "アプリを接続すると、このボットですぐに使えます。",
    "noAppsAssigned": "接続済みのアプリは、まだこのボットに割り当てられていません。",
    "connectApp": "アプリを接続",
    "unassigned": "このボットに未割り当て",
    "assign": "このボットに割り当てる",
    "assigned": "{app} を {bot} に割り当てました。すぐに使えます。",
    "usingSkill": "スキルを使用中 · {name}",
    "usingApp": "{app} を使用中",
    "failedSkill": "スキルを使えませんでした · {name}。{reason}",
    "failedApp": "{app} を使えませんでした。{reason}",
    "reason": {
      "loading": "スキルはまだ読み込み中です。",
      "connection": "{app} の接続を確認してください。",
      "denied": "この呼び出しは許可されませんでした。",
      "readonly": "読み取り専用のため、書き込みはできません。",
      "failed": "今回はうまくいきませんでした。"
    },
    "used": "使用：{list}",
    "notUsed": "使えなかったもの：{list}",
    "sep": "、",
    "state": {
      "active": "有効",
      "waiting": "次のメッセージから有効",
      "loading": "読み込み中"
    },
    "try": "こう言ってみましょう：{example}",
    "fill": "入力欄に入れる",
    "fillTitle": "このボットの入力欄に入れる",
    "copy": "コピー",
    "copyFailed": "コピーできませんでした"
  },
  "reset": {
    "title": "この会話のコンテキストを消去しますか？",
    "body": "{name} は、この Web チャットでの会話内容を忘れます。長期メモリは保持されます。",
    "confirm": "消去"
  },
  "empty": {
    "guideTitle": "こんにちは、{name} です",
    "guideBody": "5 分ほどで、チェックリストを通じてできることを体験できます。",
    "title": "{name} と話してみましょう",
    "body": "ここでボットを試せます。右パネルから WeChat、Feishu、Telegram、Slack、Discord に接続できます。",
    "sample": "どんなことを手伝ってくれますか？",
    "helpChip": "/help でコマンドを表示"
  },
  "composer": {
    "steer": "生成中の返信に指示を追加",
    "steerTitle": "生成中の返信に指示を追加（{key}）",
    "stopping": "停止中…",
    "placeholder": "{name} にメッセージを送信。/ でコマンドを表示",
    "label": "メッセージ",
    "currentModel": "現在のモデル：{model}",
    "pickModel": "モデルを選択",
    "stop": "生成を停止（Esc）",
    "stopTitle": "停止（Esc）",
    "send": "送信",
    "sendTitle": "送信（{key}）"
  },
  "model": {
    "followBot": "ボットの既定設定を使う",
    "setDefault": "このボットの既定モデルに設定"
  }
};
