import type { TranslatedCatalog } from "../../index.js";
export default {
  "no_binary_cli": "magpie の実行ファイルが見つかりません。先に npm run setup を実行してください",
  "no_binary": "magpie の実行ファイルが見つかりません。npm run setup を実行し、vendor/magpie からビルドしてください",
  "unsupported_url": "この Okinto New API アドレスには対応していません",
  "missing_key": "API キーがありません",
  "create_failed": "Okinto New API 接続を作成できませんでした：{detail}",
  "not_running": "モデルゲートウェイが起動していません。少し待ってから再試行してください",
  "disconnect_failed": "接続を解除できませんでした：HTTP {status} {body}",
  "save_failed": "保存できませんでした：HTTP {status} {body}",
  "verify_failed": "保存後の検証に失敗しました"
} satisfies TranslatedCatalog["magpie"];
