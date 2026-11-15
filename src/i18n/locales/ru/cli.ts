import type { TranslatedCatalog } from "../../index.js";
export default {
  entered: "(введено)",
  done: "Готово. Для запуска выполните npm start. Чтобы подключить WeChat, отсканируйте QR-код в разделе «Настройки > Подключения» или выполните npm run weixin:login.",
  title: "Первоначальная настройка okbot (папка данных: {dir})",
  noMagpie:
    "Исполняемый файл magpie не найден. Сначала выполните npm run setup",
  alreadyConnected:
    "Okinto New API уже подключён (окончание ключа: {tail}{account}). Сохраняем текущее подключение.",
  accountSuffix: ", аккаунт: {name}",
  signedIn: "вход выполнен",
  askHow: "Подключение моделей: Enter — войти в Okinto New API в браузере этого компьютера, remote — войти на другом устройстве, key — использовать свой официальный API-ключ, skip — подключить позже в интерфейсе: ",
  askOfficial: "Какой сервис использовать (введите номер): ",
  askOfficialKey: "API-ключ {name} (получить: {url}): ",
  officialConnected: "{name} подключён, доступно моделей: {count}",
  alreadyOfficial: "Официальный API-ключ уже задан, этот шаг пропущен",
  regionCn: "Китай",
  regionGlobal: "Глобальный",
  askLoginLink: "Откройте ссылку выше в браузере и войдите. Когда страница перейдёт на адрес, который не открывается, вставьте сюда полную ссылку из адресной строки: ",
  askLine:
    "Домен API: Enter — api.okinto.com, origin — api.okinto.com, cf — api.okinto.com: ",
  askFeishuId: "Feishu App ID (cli_xxx, оставьте пустым, чтобы пропустить): ",
  askFeishuSecret: "Feishu App Secret: ",
  savedToBot: "✓ Сохранено для бота «{name}»",
  openLink:
    "Откройте ссылку ниже в браузере этого компьютера, войдите или зарегистрируйтесь в Okinto New API, затем нажмите Continue, чтобы разрешить подключение:",
  signedInConnected:
    "✓ Выполнен вход в {name}, ключ этого компьютера подключён. Найдено моделей: {count}",
  loginIncomplete: "Вход не завершён",
  setupFailed: "Не удалось выполнить настройку:",
  weixinConnected:
    "✓ WeChat подключён. Выполните npm start для отправки и получения сообщений. Если приложение уже работает, перезапустите его или заново включите канал WeChat в интерфейсе.",

  "tryCn": " (проверьте настройки подключения и повторите)",
  "connected": "Подключено к Okinto New API, доступно моделей: {count}"
} satisfies TranslatedCatalog["cli"];
