import type { TranslatedCatalog } from "../../index.js";
export default {
  external_mode:
    "При использовании внешнего адреса модели подключения OKINTO New API не управляются",
  bot_not_found: "Бот не найден",
  magpie_failed: "Не удалось запустить magpie: {message}",
  default_bot_name: "Мой помощник",
  default_bot_prompt: "Ты — отзывчивый помощник. Отвечай кратко и точно.",
  feishu_failed:
    "Аккаунт Feishu «{name}»: не удалось установить постоянное соединение: {message}",
  messenger_failed:
    "Не удаётся подключить аккаунт {channel} «{name}». Проверьте учётные данные в разделе «Настройки → Каналы чата»: {message}",
  feishu_history_denied:
    "Аккаунт Feishu «{name}» не может читать историю сообщений, поэтому сообщения за время отключения не будут получены. Предоставьте приложению разрешение im:message.history:readonly на открытой платформе Feishu.",
  weixin_expired:
    "Аккаунт WeChat «{name}»: срок входа истёк. Отсканируйте QR-код снова в разделе «Настройки → Каналы чата»",
  weixin_connected: "Аккаунт WeChat «{name}» подключён",
  weixin_account_name: "WeChat",
  feishu_account_name: "Feishu",
  media_image: "Изображение",
  media_file: "Файл",
  media_video: "Видео",
  media_quoted_image: "Цитируемое изображение",
  media_quoted_file: "Цитируемый файл",
  media_quoted_video: "Цитируемое видео",
  media_voice: "[Голосовое сообщение]",
  media_not_downloaded: "{label} (не удалось скачать: {error})",
  weixinExpiredSubject: "Срок входа в WeChat истёк",
  data_dir_locked:
    "Другой процесс okbot ({who}) использует папку данных {dir}. Закройте его или задайте другую папку данных (AMB_DATA_DIR).",
  data_dir_locked_remote: "pid {pid} на {host}",
} satisfies TranslatedCatalog["app"];
