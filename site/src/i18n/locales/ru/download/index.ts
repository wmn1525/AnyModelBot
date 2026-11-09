export default {
  warn: "Не открывайте порт 3600 напрямую в интернет.",
  win: "Скачать для Windows",
  mac: "Скачать для macOS",
  linux: "Скачать для Linux",
  mobile: "Общайтесь через мессенджеры",
  generic: "Скачать",
  more: "Другие платформы",
  items: {
    "win-x64": "Установщик Windows (NSIS)",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    docker: "Команда Docker",
    changelog: "История изменений",
  },
  platform: {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux",
  },
  arch: {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage",
  },
  meta: "Версия {version} · опубликована {publishedAt}",
  sha: "SHA-256",
  started: "Загрузка началась — проверьте загрузки браузера.",
  downloading: "Загрузка…",
  macNote:
    "Управление компьютером в macOS находится в бета-версии: прямой режим ещё нужно проверить на большем числе реальных устройств. Разрешения «Универсальный доступ» и «Запись экрана» запрашиваются, только когда они впервые понадобятся боту. Остальные возможности совпадают с Windows и Linux.",
  linuxHint: "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  winHint:
    "Если Windows выдаёт предупреждение, нажмите «Подробнее», затем «Выполнить в любом случае».",
  macHint:
    "Подписано Developer ID и прошло нотарификацию Apple. Перенесите приложение в «Программы», запустите и нажмите «Открыть», если появится подтверждение загрузки.",
  firstRun: "Первый запуск",
  yourSystem: "Ваша система",
  verifyTitle: "Проверьте загрузку",
  verifyLead:
    "Выполните команду для своей системы и сравните SHA-256 с указанным здесь. Совпадение подтверждает целостность файла.",
  verifyUnixLabel: "macOS / Linux",
  verifyWin: "Get-FileHash .\\<file> -Algorithm SHA256",
  verifyUnix: "shasum -a 256 <file>",
  pageTitle: "Скачать AnyModelBot",
  pageLead:
    "Бесплатно и с открытым кодом. Само приложение не требует регистрации; войдите в Modelflare при первом запуске — и всё готово.",
  pageDescription:
    "Скачать AnyModelBot для Windows, macOS, Linux и Docker. Бесплатное приложение с открытым кодом и оплатой моделей по использованию.",
  altTitle: "Другие способы запуска",
  dockerTitle: "Docker",
  dockerSteps: {
    run: "Запустите контейнер",
    token: "Прочитайте токен доступа",
    open: "Откройте в браузере",
  },
  dockerUrl: "http://<host>:3600/?token=<token>",
  cliTitle: "Командная строка (CLI)",
  cliBody:
    "Запуск из исходников. Требуются Node.js 22.13+ и Go 1.26.8+ для сборки встроенного шлюза.",
  cliSteps: {
    clone: "Клонируйте репозиторий",
    setup: "Установите зависимости и соберите шлюз",
    start: "Запустите и откройте http://127.0.0.1:3600/",
  },
  releases: "Выпуски на GitHub",
  changelog: "История изменений",
};
