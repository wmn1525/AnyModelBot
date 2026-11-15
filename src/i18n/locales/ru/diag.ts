import type { TranslatedCatalog } from "../../index.js";
export default {
  fetch_timeout: "Время истекло: нет ответа за {s} с",
  no_endpoint: "Адрес API не настроен",
  no_model:
    "Нет доступной модели: сначала выберите модель по умолчанию в Okinto New API",
  no_content: "В ответе отсутствует choices[0].message.content: {body}",
  verdict_endpoint_ok: "API работает",
  verdict_endpoint_error: "Ошибка API: {error}",
  verdict_both_ok: "Встроенный шлюз и прямой доступ к API работают",
  verdict_gateway_ok: "Встроенный шлюз работает",
  verdict_direct_failed:
    "Через встроенный шлюз запрос успешен, напрямую — нет. Возможно, шлюз использовал другой маршрут или повторил запрос",
  verdict_gateway_broken: "Сам API работает; проблема во встроенном шлюзе",
  verdict_gateway_failed_no_direct:
    "Встроенный шлюз вернул ошибку; сравнить с прямым вызовом не удалось",
  verdict_both_failed: "И сам API ({error}), и встроенный шлюз вернули ошибку",
  gateway_state: "{error} (состояние встроенного шлюза: {state})",
  gateway_state_error:
    "{error} (состояние встроенного шлюза: {state}, {lastError})",
  skip_not_connected: "Источник этой модели ещё не подключён",
  skip_no_chat: "У этого официального API нет Chat Completions, проверяется только встроенный шлюз",
  skip_external:
    "Режим внешнего API: боты обращаются к нему напрямую, без встроенного шлюза",
  stage_queue: "Очередь сообщений",
  stage_spawn: "Запуск процесса агента",
  stage_plugins: "Загрузка плагинов",
  stage_model: "Вызов модели",
  stage_reply: "Получение ответа",
  timeout_spawn:
    "Процесс агента не запустился за {s} с (initialize не вернул результат)",
  timeout_plugins:
    "Процесс агента запущен, но за {s} с не отправил запрос к модели",
  timeout_model: "Запрос к модели отправлен, но провайдер не ответил за {s} с",
  timeout_reply: "Модель ответила, но агент не завершил обработку за {s} с",
  agent_off: "Режим агента отключён (AMB_AGENT=off); ботам доступен только чат",
  no_runtime: "Среда агента (DSH) не найдена; ботам доступен только чат",
  agent_no_model:
    "Нет доступной модели: сначала подключите Okinto New API и выберите модель по умолчанию",
  queue_idle: "Нет выполняемых запросов",
  queue_busy: {
    one: "Выполняется {count} запрос (прошло {s} с). Новые сообщения в этом разговоре присоединяются к нему или ждут, пока агент их примет. При зависании используйте /stop или «Перезапустить процесс агента» ниже",
    few: "Выполняются {count} запроса (самый долгий — {s} с). Новые сообщения в том же разговоре присоединяются к текущему запросу или ждут, пока агент их примет. При зависании используйте /stop или «Перезапустить процесс агента» ниже",
    many: "Выполняется {count} запросов (самый долгий — {s} с). Новые сообщения в том же разговоре присоединяются к текущему запросу или ждут, пока агент их примет. При зависании используйте /stop или «Перезапустить процесс агента» ниже",
    other:
      "Выполняется {count} запроса (самый долгий — {s} с). Новые сообщения в том же разговоре присоединяются к текущему запросу или ждут, пока агент их примет. При зависании используйте /stop или «Перезапустить процесс агента» ниже",
  },
  spawn_waiting: "Ожидание уже начатого запуска (прошло {s} с, этап: {stage})",
  spawn_initializing: "pid {pid}, ожидание инициализации…",
  agent_exited: "Процесс агента завершился (code={code}, signal={signal})",
  agent_exited_stderr:
    "Процесс агента завершился (code={code}, signal={signal}); stderr: {stderr}",
  plugins_missing:
    "В запросе к модели отсутствуют инструменты плагинов: {tools}",
  plugins_tools: {
    one: "{count} инструмент",
    few: "{count} инструмента",
    many: "{count} инструментов",
    other: "{count} инструмента",
  },
  http_error: "HTTP {status}: {error}",
  api_rejected:
    " ({path} отклонён: {why}; выполнено переключение на Chat Completions)",
  already_running: "Уже запущен (pid {pid})",
  no_request_seen: "(запрос к модели не обнаружен)",
  no_response_seen: "(ответ провайдера не обнаружен)",
  no_text_reply: "Обработка завершилась без текстового ответа",
  stage_now: "; текущий этап: {stage}",
  stage_now_output: "; текущий этап: {stage}; последний вывод: {line}",
  timeout: "Время истекло",
  report_title: "Диагностика okbot · {at}",
  report_version:
    "Версия {version} · {platform} {arch} · {os}{electron} · Node {node} · работает {uptime} с",
  report_data_dir: "Папка данных: {dir}",
  report_log_file: "Файл журнала: {file}",
  report_not_enabled_paren: "(отключено)",
  report_default_model: "Модель по умолчанию: {model}",
  report_auto: "(авто)",
  report_gateway_managed:
    "[Шлюз моделей] встроенный magpie · {state} · pid {pid} · перезапусков: {restarts}{lastExit}{lastError}",
  report_gateway_external: "[Шлюз моделей] внешний API {url}",
  report_last_exit: " · последнее завершение: code={code} signal={signal}",
  report_agent: "[Агент] {enabled} · среда {runtime}",
  report_enabled: "включён",
  report_not_enabled: "отключён",
  report_missing: "отсутствует",
  report_host:
    "Бот {id}: {state} · pid {pid} · перезапусков: {restarts} · активных: {active}{lastExit}",
  report_last_error: "Последняя ошибка: {error}",
  report_model_test: "[Тест модели] {at} · модель {model} · {verdict}",
  report_via_gateway: "Через встроенный шлюз",
  report_direct: "Прямой API",
  report_probe_skipped: "{name}: не проверено ({reason})",
  report_probe: "{name}: {result} · HTTP {status} · {ms} мс · {url}",
  report_ok: "Успешно",
  report_failed: "ошибка",
  report_echoed: " · возвращённая модель {model}",
  report_reply: " · ответ {reply}",
  report_error: "Ошибка: {error}",
  report_agent_test:
    "[Тест агента] {at} · бот {bot} · модель {model} · {result} · {ms} мс",
  report_passed: "пройден",
  report_not_passed: "не пройден ({stage})",
  report_log_tail: {
    one: "[Последняя {count} строка журнала]",
    few: "[Последние {count} строки журнала]",
    many: "[Последние {count} строк журнала]",
    other: "[Последние {count} строки журнала]",
  },
  outboxLine:
    "[Исходящие] ожидают: {pending} (повторная отправка: {retrying}){lastError}{held} · не отправлено за 7 дней: {gone}{lastGone}",
  outboxLastError: " · последняя ошибка: {error}",
  outboxHeld: " · ждут нового сообщения пользователя: {n}",
  outboxLastGone: " · последнее: {text}",
} satisfies TranslatedCatalog["diag"];
