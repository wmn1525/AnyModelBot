import type { TranslatedCatalog } from "../../index.js";
export default {
  "msgPoints": "Контекст:",
  "msgFiles": "Файлы:",
  "msgAskOnly": "Ничего делать не нужно. Просто ответьте.",
  "msgDoneWhen": "Готово, когда: {criteria}",
  "msgRedo": "{issue}. Пожалуйста, исправьте. (Переделка {n}/{limit})",
  "msgAdds": "Пользователь добавляет: {text}",
  "whyUser": "вы попросили остановиться",
  "whyTimeout": "дольше {limit}",
  "whyBudget": "на это ушло {budget}",
  "whyError": "произошла ошибка: {reason}",
  "hours": {"one": "{count} час", "few": "{count} часа", "many": "{count} часов", "other": "{count} часа"},
  "minutes": {"one": "{count} минута", "few": "{count} минуты", "many": "{count} минут", "other": "{count} минуты"},
  "noText": "(без описания)",
  "fallbackReply": "Сообщение от {bot}:\n\n{text}",
  "fallbackStopped": "{bot} остановился ({why}). {text}",
  "droppedExpired": "{bot} не начал работу за 24 часа, поэтому запрос отменён.",
  "droppedModel": "{bot} перешёл на модель с вашим API-ключом, поэтому запрос в очереди отменён.",
  "deleted": "{bot} удалён, поэтому работа остановлена."
} satisfies TranslatedCatalog["collab"];
