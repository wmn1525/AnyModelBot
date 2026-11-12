import type { TranslatedCatalog } from "../../index.js";
export default {
  "unreachable": "{host} に接続できません（{reason}）。ネットワークを確認してください。プロキシや VPN を使用している場合は、システムプロキシまたは TUN モードを有効にして再試行してください",
  "timeout": "タイムアウト",
  "invalid_key": "キーが無効か、取り消されています",
  "forbidden": "このキーには、このモデルまたはグループの利用権限がありません",
  "unavailable": "OKINTO New API は一時的に利用できません（HTTP {status}）{retry}",
  "retry_after": "。{s} 秒後に再試行してください",
  "bad_models": "OKINTO New API から返されたモデル一覧を読み取れませんでした",

  "balance_failed": "残高を取得できませんでした（HTTP {status}）",
  "bad_balance": "OKINTO New API の残高レスポンスを読み取れませんでした"
} satisfies TranslatedCatalog["modelflare"];
