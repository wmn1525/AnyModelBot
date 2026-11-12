import type { TranslatedCatalog } from "../../index.js";
export default {
  unreachable: "Не удалось подключиться к {host} ({reason}). Проверьте сеть. Если вы используете прокси или VPN, включите системный прокси или режим TUN и повторите попытку",
  timeout: "время истекло",
  invalid_key: "Ключ недействителен или отозван",
  forbidden: "Этому ключу запрещён доступ к модели или группе",
  unavailable: "OKINTO New API временно недоступен (HTTP {status}){retry}",
  retry_after: "; повторите через {s} с",
  bad_models: "Не удалось прочитать список моделей, возвращённый OKINTO New API",

  "balance_failed": "Не удалось получить баланс (HTTP {status})",
  "bad_balance": "Не удалось прочитать ответ о балансе OKINTO New API"
} satisfies TranslatedCatalog["modelflare"];
