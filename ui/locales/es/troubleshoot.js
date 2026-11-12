export default {
  "status": "Estado",
  "checks": "Pruebas",
  "version": "Versión",
  "dataDir": "Carpeta de datos",
  "copyPath": "Copiar ruta",
  "logFile": "Archivo de registro",
  "logFileSub": "Rota por tamaño; conserva los 4 archivos más recientes",
  "logFileOff": "No habilitado",
  "test": "Probar",
  "model": "Modelo: {model}",
  "none": "(ninguno)",
  "copyReport": "Copiar diagnóstico",
  "copied": "Diagnóstico copiado (sin claves)",
  "note": "El diagnóstico copiado incluye el estado de arriba, los resultados de las pruebas más recientes y los registros. Las claves de API, los tokens y otros secretos se reemplazan por ***, así que puedes enviarlo directamente al soporte.",
  "secs": "{s} s",
  "restarts": {
    "one": "Se reinició {count} vez",
    "many": "Se reinició {count} veces",
    "other": "Se reinició {count} veces"
  },
  "lastExit": "Última salida: code={code}{signal}",
  "verdict": {
    "ok": "Todo bien",
    "bad": "Se encontraron problemas"
  },
  "gateway": {
    "name": "Gateway de modelos",
    "fromEnv": "Definido por {env}",
    "running": "En ejecución",
    "starting": "Iniciando",
    "restarting": "Reiniciando",
    "failed": "Falló",
    "stopped": "Detenido",
    "external": "Endpoint externo"
  },
  "agent": {
    "name": "Proceso del agente",
    "nameFor": "Proceso del agente · {bot}",
    "noRuntime": "No se encontró el runtime del agente (DSH); los bots solo pueden chatear",
    "disabled": "El modo agente está desactivado; los bots solo pueden chatear",
    "startsOnFirst": "Se inicia cuando llega el primer mensaje",
    "stderr": {
      "one": "Salida del proceso del agente (última {count} línea de stderr)",
      "many": "Salida del proceso del agente (últimas {count} líneas de stderr)",
      "other": "Salida del proceso del agente (últimas {count} líneas de stderr)"
    }
  },
  "host": {
    "running": "En ejecución",
    "starting": "Iniciando",
    "backoff": "Esperando para reintentar",
    "error": "En pausa",
    "stopped": "No iniciado"
  },
  "hostSub": {
    "elapsed": "{time} transcurridos",
    "stage": "Etapa: {stage}",
    "firstStart": "El primer inicio puede tardar unos minutos (el antivirus analiza cada archivo del runtime)",
    "maxWait": {
      "one": "Espera hasta {count} minuto",
      "many": "Espera hasta {count} minutos",
      "other": "Espera hasta {count} minutos"
    },
    "initTime": "Se inició en {time}",
    "activeTurns": {
      "one": "{count} turno en curso",
      "many": "{count} turnos en curso",
      "other": "{count} turnos en curso"
    },
    "retryIn": {
      "one": "Se reintentará automáticamente en {count} minuto, o haz clic en “Reiniciar proceso del agente” más abajo",
      "many": "Se reintentará automáticamente en {count} minutos, o haz clic en “Reiniciar proceso del agente” más abajo",
      "other": "Se reintentará automáticamente en {count} minutos, o haz clic en “Reiniciar proceso del agente” más abajo"
    }
  },
  "init": {
    "prepare": "Preparando",
    "bridgeReady": "Puente de modelos listo",
    "sdkLoaded": "Cargando el runtime",
    "patchWritten": "Escribiendo la configuración",
    "childSpawned": "Proceso iniciado",
    "initializing": "Inicializando (cargando plugins)"
  },
  "stage": {
    "ok": "Superada",
    "warn": "Advertencia",
    "fail": "Falló",
    "timeout": "Tiempo agotado",
    "skipped": "Omitida",
    "pending": "En curso"
  },
  "pwsh": {
    "checking": "Verificando",
    "checkingBusy": "Verificando…",
    "missing": "No instalado",
    "looking": "Buscando PowerShell 7",
    "usedBy": "El agente ejecuta comandos con él",
    "old": "Versión antigua: instala PowerShell 7 para que los comandos sean mucho más rápidos y confiables",
    "builtin": "El agente ejecuta comandos con el Windows PowerShell 5.1 integrado, que puede tardar entre 20 y 30 segundos por comando. Instala PowerShell 7 para que los comandos sean mucho más rápidos y confiables",
    "recheck": "Volver a verificar",
    "install": "Instalar PowerShell 7",
    "copyCmd": "Copiar comando de instalación",
    "download": "Descargar ↗",
    "fallback": "{from} no se pudo iniciar ({reason}), así que se reemplazó automáticamente",
    "unusable": "No se puede usar",
    "notInstalled": "No instalado",
    "usedByFrom": "El agente ejecuta comandos con él ({source})",
    "installingSub": "Instalando PowerShell 7 para el agente (no se necesitan permisos de administrador); hasta entonces, los comandos seguirán usando Windows PowerShell 5.1",
    "badSub": "No se puede usar el PowerShell 7 administrado por la app: {reason}",
    "failedSub": "No se instaló: {error}",
    "unknownReason": "motivo desconocido",
    "using51": "Por ahora, el agente usa Windows PowerShell 5.1",
    "slow51": "El agente usa Windows PowerShell 5.1, que puede tardar entre 20 y 30 segundos por comando",
    "slow51Advice": "El agente usa Windows PowerShell 5.1, que puede tardar entre 20 y 30 segundos por comando; PowerShell 7 es mucho más rápido",
    "reinstall": "Reinstalar",
    "installShort": "Instalar",
    "reinstallPrivate": "Reinstalar el PowerShell 7 administrado por la app",
    "useSystem": "Volver a la opción predeterminada del sistema",
    "useSystemNote": "Dejar de usar el PowerShell 7 administrado por la app",
    "usePrivate": "Usar el PowerShell 7 administrado por la app",
    "installSelf": "Instalar PowerShell 7 manualmente…",
    "more": "Más",
    "moreLabel": "Más acciones de PowerShell",
    "source": {
      "private": "Administrado por la app",
      "programFiles": "Program Files",
      "preview": "Preview"
    }
  },
  "testModel": {
    "name": "Probar modelo",
    "sub": "Envía una solicitud mínima a través del gateway integrado y otra directamente al endpoint, y compara los códigos de estado, la latencia y el nombre del modelo devuelto",
    "viaGateway": "A través del gateway integrado",
    "direct": "Directo al endpoint"
  },
  "probe": {
    "untested": "Sin probar",
    "ok": "OK",
    "echoed": "Modelo devuelto: {model}",
    "reply": "Respuesta: “{reply}”"
  },
  "testAgent": {
    "name": "Probar agente",
    "sub": "Ejecuta un turno mínimo a través del proceso del agente (no se guarda en el historial de chats) para ver dónde se atasca: inicio → plugins → modelo → respuesta",
    "ok": "El agente funciona",
    "stuckAt": "Atascado en: {stage}",
    "bot": "Bot: {name}",
    "total": "Total {time}"
  },
  "restart": {
    "name": "Reiniciar proceso del agente",
    "sub": "Úsalo cuando las respuestas se quedan cargando sin fin: detiene el proceso del agente y anula la espera para reintentar. Se reinicia con el siguiente mensaje",
    "button": "Reiniciar",
    "done": "Proceso del agente reiniciado",
    "notRunning": "El proceso del agente aún no se ha iniciado; se iniciará con el siguiente mensaje"
  },
  "logs": {
    "title": "Registros recientes",
    "lines": {
      "one": "{count} línea",
      "many": "{count} líneas",
      "other": "{count} líneas"
    },
    "empty": "(aún no hay registros)",
    "readFailed": "No se pudieron leer los registros: {error}"
  }
};
