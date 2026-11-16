import type { TranslatedCatalog } from "../../index.js";
export default {
  "msgPoints": "Contexto:",
  "msgFiles": "Arquivos:",
  "msgAskOnly": "Não precisa fazer nada. Só responda.",
  "msgDoneWhen": "Pronto quando: {criteria}",
  "msgRedo": "{issue}. Corrija, por favor. (Refazer {n}/{limit})",
  "msgAdds": "O usuário acrescenta: {text}",
  "whyUser": "você pediu para parar",
  "whyTimeout": "passou de {limit}",
  "whyBudget": "isso gastou {budget}",
  "whyError": "algo deu errado: {reason}",
  "hours": {"one": "{count} hora", "many": "{count} horas", "other": "{count} horas"},
  "minutes": {"one": "{count} minuto", "many": "{count} minutos", "other": "{count} minutos"},
  "noText": "(sem resumo)",
  "fallbackReply": "Mensagem de {bot}:\n\n{text}",
  "fallbackStopped": "{bot} parou ({why}). {text}",
  "droppedExpired": "{bot} não começou em 24 horas, então este pedido foi cancelado.",
  "droppedModel": "{bot} mudou para um modelo da sua própria chave de API, então este pedido na fila foi cancelado.",
  "deleted": "{bot} foi excluído, então isto parou."
} satisfies TranslatedCatalog["collab"];
