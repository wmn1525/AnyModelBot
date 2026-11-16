import type { TranslatedCatalog } from "../../index.js";
export default {
  "msgPoints": "Contexto:",
  "msgFiles": "Archivos:",
  "msgAskOnly": "No hace falta hacer nada. Solo responde.",
  "msgDoneWhen": "Listo cuando: {criteria}",
  "msgRedo": "{issue}. Corrígelo, por favor. (Rehacer {n}/{limit})",
  "msgAdds": "El usuario agrega: {text}",
  "whyUser": "le pediste que se detuviera",
  "whyTimeout": "pasó de {limit}",
  "whyBudget": "esto gastó {budget}",
  "whyError": "algo salió mal: {reason}",
  "hours": {"one": "{count} hora", "many": "{count} horas", "other": "{count} horas"},
  "minutes": {"one": "{count} minuto", "many": "{count} minutos", "other": "{count} minutos"},
  "noText": "(sin resumen)",
  "fallbackReply": "Mensaje de {bot}:\n\n{text}",
  "fallbackStopped": "{bot} se detuvo ({why}). {text}",
  "droppedExpired": "{bot} no empezó en 24 horas, así que se canceló esta solicitud.",
  "droppedModel": "{bot} cambió a un modelo de tu propia clave de API, así que se canceló esta solicitud en cola.",
  "deleted": "{bot} se eliminó, así que esto se detuvo."
} satisfies TranslatedCatalog["collab"];
