import type { TranslatedCatalog } from "../../index.js";
export default {
  file_failed:
    "⚠️ Не удалось отправить файл «{name}». Он находится в рабочей папке.",
  handle_failed: "⚠️ Произошла ошибка: {message}",
  reply_with_number: "(Ответьте номером варианта)",
  reply_truncated:
    "… (Ответ слишком длинный: достигнут лимит сообщений для этого запроса. Отправьте любое сообщение, чтобы продолжить)",
  sent_file: "[Файл] {name}",
  approval_title: "Нужно разрешение ({code})",
  question_title: "Нужен ваш ответ",
  card_generating: "[Генерация…]",
  card_action_failed: "Ошибка",
  unsupported_message: "[Неподдерживаемый тип сообщения: {type}]",
  feishu_no_credentials: "Учётные данные не настроены",
  messengerMissing: "Учётные данные {channel} неполны",
  wx_login_required: "Вход ещё не выполнен: отсканируйте QR-код",
  wx_expired: "Срок входа истёк (-14). Отсканируйте QR-код снова в приложении",
  login_cancelled: "Отменено",
  login_terminal_scan: "Отсканируйте QR-код в WeChat для входа:",
  login_terminal_saved: "Изображение QR-кода сохранено: {path}",
  login_wait: "Отсканируйте QR-код в WeChat",
  login_fetching: "Получаем QR-код…",
  login_scanned: "Код отсканирован. Подтвердите в WeChat",
  login_need_code: "Введите код подтверждения из WeChat",
  login_code_wrong: "Код не совпадает. Сверьтесь с числом в WeChat и введите его снова",
  login_verifying: "Проверяем…",
  login_code_blocked: "Слишком много неверных кодов. Отсканируйте новый QR-код ({n}/{max})",
  login_code_blocked_stop: "Слишком много неверных кодов. Попробуйте войти позже",
  login_already_bound: "Этот аккаунт WeChat уже привязан к боту",
  login_qr_expired_too_often:
    "QR-код истекал слишком много раз. Начните заново",
  login_qr_refreshing: "QR-код истёк, обновляем ({n}/{max})",
  login_no_token: "Не удалось войти: сервер не вернул ilink_bot_id/bot_token",
  login_confirmed: "✅ WeChat подключён",
  login_timeout: "Время ожидания входа истекло. Повторите попытку",
  login_failed: "Не удалось войти: {message}",
  aes_key_bad:
    "aes_key декодируется в {len} байт; ожидалось 16 байт или 32 шестнадцатеричных символа",
  aes_key_missing: "Отсутствует aes_key",
  item_unsupported: "Элемент типа {type} нельзя скачать",
  full_url_bad: "full_url не является URL с http(s)",
  no_cdn_ref: "Отсутствует ссылка CDN",
  cdn_failed_http: "Ошибка загрузки с CDN: HTTP {status} {message}",
  cdn_failed: "Ошибка загрузки с CDN",
  too_large: "Файл слишком большой ({size} МБ, лимит {max} МБ)",
  decrypt_failed: "Не удалось расшифровать — возможно, неверный ключ",
  awayPrefix: "Пока вас не было: ",
  heldNoToken:
    "Пользователь ещё не писал боту; сообщение отправится после его обращения",
  heldWindowClosed:
    "Пользователь не писал более 24 часов; сообщение отправится после его следующего обращения",
  heldQuota:
    "Лимит исчерпан: до 10 ответов в течение 24 часов после каждого сообщения пользователя. Отправка продолжится после следующего сообщения",
  heldReserved:
    "Оставшийся лимит зарезервирован для результатов фоновых задач; сообщение отправится после следующего обращения пользователя",
  fileFallback: "файл",
  laterNotRunning: "Канал не работает",
  laterExpired:
    "Срок входа в WeChat истёк; ожидаем нового сканирования QR-кода",
  feishuNoPush: "Транспорт Feishu не может самостоятельно отправлять сообщения",
} satisfies TranslatedCatalog["channel"];
