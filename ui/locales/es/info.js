export default {
  "aria": "Panel derecho",
  "botSettings": "Ajustes del bot",
  "closeTitle": "Cerrar (⌘⇧I)",
  "closeAria": "Cerrar panel derecho",
  "channels": "Canales",
  "channelsDefault": "Este bot responde de forma predeterminada",
  "channelsManage": "Administrar canales de chat",
  "channelsSub": "Todos los bots comparten estas cuentas. Agrégalas en Ajustes > Canales de chat",
  "approvals": "Aprobaciones pendientes",
  "due": "Vence a las {time}",
  "noApprovals": "No hay aprobaciones pendientes",
  "recent": "Conversaciones recientes",
  "noConvs": "Aún no hay conversaciones",
  "noMessages": "Sin mensajes",
  "emptyMessage": "(vacío)",
  "channel": {
    "web": "Web",
    "feishu": "Feishu",
    "weixin": "WeChat",
    "telegram": "Telegram",
    "slack": "Slack",
    "discord": "Discord"
  },
  "feishu": {
    "bindHint": "Envíale un mensaje al bot desde tu propia cuenta de Feishu para terminar la vinculación.",
    "sub": "Recibe mensajes mediante una conexión persistente",
    "secretSaved": "Guardado {masked}. Déjalo en blanco para conservarlo",
    "saveConnect": "Guardar y conectar",
    "disconnect": "Desconectar",
    "disconnectTitle": "¿Desconectar Feishu?",
    "disconnectBody": "Esto elimina el App ID y el App Secret de Feishu del bot."
  },
  "messenger": {
    "bindHint": "Envíale un mensaje al bot desde tu propia cuenta para terminar la vinculación.",
    "secretSaved": "Guardado {masked}. Déjalo en blanco para conservarlo",
    "saveConnect": "Guardar y conectar",
    "disconnect": "Desconectar",
    "disconnectTitle": "¿Desconectar {channel}?",
    "disconnectBody": "Esto elimina las credenciales de {channel} del bot. Cuando vuelvas a conectarlo, la primera persona que le escriba se convertirá en su propietario.",
    "telegram": {
      "sub": "Recibe mensajes mediante long polling",
      "token": "Token del bot"
    },
    "slack": {
      "sub": "Recibe mensajes mediante Socket Mode",
      "botToken": "Token del bot",
      "appToken": "Token de nivel de app"
    },
    "discord": {
      "sub": "Recibe mensajes mediante el Gateway",
      "token": "Token del bot"
    }
  },
  "weixin": {
    "sub": "Canal oficial iLink",
    "linked": "Vinculado: {id}",
    "qrAlt": "Código QR para iniciar sesión en WeChat",
    "scanHint": "Escanea el código con WeChat y luego confirma en tu teléfono.",
    "verifyCode": "Código de verificación",
    "submit": "Enviar",
    "pausedUntil": "En pausa hasta {time}",
    "login": "Escanear para iniciar sesión",
    "relogin": "Escanear para volver a iniciar sesión",
    "enable": "Activar el canal de WeChat",
    "disable": "Desactivar el canal de WeChat",
    "unlink": "Desvincular",
    "unlinkTitle": "¿Desvincular WeChat?",
    "unlinkBody": "Tendrás que volver a escanear el código QR para enviar y recibir mensajes de WeChat.",
    "quota": "Cuota de envío (hasta 10 mensajes en las 24 horas siguientes a cada mensaje recibido): {list}",
    "quotaItem": "{user}…: quedan {count}",
    "quotaSep": "; "
  },
  "memory": {
    "title": "Memoria",
    "refresh": "Actualizar memoria",
    "empty": "Aún no hay memoria a largo plazo",
    "delete": "Eliminar este recuerdo",
    "deleteTitle": "¿Eliminar este recuerdo?",
    "deleted": "Eliminado"
  },
  "access": {
    "head": "Solicitudes de uso",
    "allowed": "Se permitió a “{who}”",
    "denied": "Se denegó a “{who}”",
    "messages": {
      "one": "envió {count} mensaje",
      "many": "envió {count} mensajes",
      "other": "envió {count} mensajes"
    },
    "wants": "Quiere usar este bot · código de vinculación {code}",
    "quote": "“{text}”",
    "allow": "Permitir",
    "deny": "Denegar",
    "replyHint": "También puedes responder “yes {code}” en el chat."
  },
  "turn": {
    "stopFailed": "No se pudo detener: {error}",
    "processing": "Procesando durante {d}",
    "waitingAgent": "Esperando al proceso del agente",
    "idle": "Sin avances durante {d}",
    "stop": "Detener",
    "activity": "Actividad"
  },
  "tasks": "Tareas",
  "tabsLabel": "Pestañas del panel",
  "tab": {
    "resources": "Vista previa",
    "app": "Espacio de trabajo",
    "overview": "Resumen",
    "tasks": "Tareas",
    "memory": "Memoria"
  },
  "noTasks": "Aún no hay tareas ni reglas",
  "preview": {
    "openPanel": "Vista previa en el panel lateral",
    "empty": "Haz clic en un archivo o enlace del chat para abrirlo aquí.",
    "address": "Dirección del sitio web",
    "invalidUrl": "Ingresa una dirección web válida (http o https).",
    "download": "Descargar",
    "downloadFull": "Descargar archivo completo",
    "openSystem": "Abrir con la app predeterminada",
    "openBrowser": "Abrir en el navegador",
    "openBrowserExt": "Abrir en el navegador ↗",
    "openNewTab": "Abrir en una pestaña nueva ↗",
    "revealMac": "Mostrar en Finder",
    "revealWin": "Mostrar en el Explorador de archivos",
    "saveAs": "Guardar como…",
    "websiteHint": "Algunos sitios no se pueden mostrar aquí o piden iniciar sesión. Si no carga, elige «Abrir en el navegador ↗» en el menú ⋯.",
    "slow": "Sigue cargando… está tardando un poco",
    "reload": "Volver a cargar",
    "failed": "No se pudo abrir este archivo",
    "failedDesc": "Puede que otra app lo esté usando.",
    "gone": "No se encuentra {name}",
    "goneDesc": "Puede que se haya eliminado o movido.",
    "unsupported": "Todavía no se puede previsualizar este tipo de archivo aquí",
    "unsupportedDesc": "Intenta abrirlo con otra app de tu computadora.",
    "emptyFile": "Este archivo está vacío",
    "emptyFileDesc": "Aparecerá aquí cuando el bot escriba en él.",
    "truncated": "Se muestran los primeros 2 MB de {size}.",
    "tooLarge": "Este archivo es demasiado grande para previsualizarlo aquí",
    "tooLargeDesc": "{name} pesa {size}. La vista previa de páginas web admite hasta 32 MB.",
    "htmlSafe": "Modo seguro: los scripts pueden ejecutarse, pero esta página no puede obtener datos de internet, enviar formularios ni acceder a tus cuentas",
    "webPage": "Página web",
    "lines": {
      "one": "{n} línea",
      "many": "{n} líneas",
      "other": "{n} líneas"
    },
    "pages": {
      "one": "{n} página",
      "many": "{n} páginas",
      "other": "{n} páginas"
    },
    "firstPart": "Primeros 2 MB",
    "noColor": "Archivo grande, sin resaltado",
    "justUpdated": "Recién actualizado",
    "newChanges": "Hay cambios · Actualizar",
    "updateFailed": "No se pudo actualizar · Reintentar",
    "updated": "Se actualizó a la versión más reciente",
    "more": "Más acciones",
    "viewLabel": "Vista",
    "view": {
      "markdown": {
        "preview": "Vista previa",
        "source": "Código fuente"
      },
      "html": {
        "preview": "Vista previa",
        "source": "Código"
      },
      "csv": {
        "table": "Tabla",
        "source": "Texto sin formato"
      },
      "json": {
        "formatted": "Con formato",
        "source": "Texto sin formato"
      }
    },
    "wrap": "Ajustar líneas",
    "encoding": "Codificación de texto",
    "encodingAuto": "Detectar automáticamente ({encoding})",
    "copyMarkdown": "Copiar Markdown",
    "copyAll": "Copiar todo",
    "copyJson": "Copiar JSON",
    "copyCsv": "Copiar como CSV",
    "copySource": "Copiar código fuente",
    "copyImage": "Copiar imagen",
    "copyUrl": "Copiar URL",
    "copyImageUrl": "Copiar dirección de la imagen",
    "copyPath": "Copiar ruta del archivo",
    "shownPart": " (parte mostrada)",
    "copied": "Copiado",
    "pathCopied": "Ruta copiada",
    "copyFailed": "No se pudo copiar. Inténtalo de nuevo.",
    "savedTo": "Guardado en «{folder}»",
    "saveFailed": "No se pudo guardar. Prueba otra ubicación.",
    "downloading": "Descargando {name}",
    "scriptRevealedMac": "Por seguridad, los scripts no se ejecutan directamente. Se mostró en Finder.",
    "scriptRevealedWin": "Por seguridad, los scripts no se ejecutan directamente. Se mostró en el Explorador de archivos.",
    "scriptRevealed": "Por seguridad, los scripts no se ejecutan directamente. Se mostró en su carpeta.",
    "zoom": "Zoom",
    "zoomIn": "Acercar",
    "zoomOut": "Alejar",
    "zoomReset": "Restablecer al 100 %",
    "close": "Cerrar",
    "closeTab": "Cerrar pestaña",
    "closeNamed": "Cerrar {name}",
    "closeOthers": "Cerrar las demás pestañas",
    "closeAll": "Cerrar todas",
    "tabsLabel": "Archivos abiertos",
    "expand": "Ampliar",
    "exitExpand": "Salir de la vista ampliada",
    "expandHint": "Presiona Esc o haz clic de nuevo para salir",
    "outline": "Esquema",
    "yesterday": "Ayer",
    "files": {
      "title": "Archivos de este chat",
      "open": "Abrir otros archivos de este chat",
      "gone": "Ya no está disponible",
      "empty": "Todavía no hay archivos en este chat",
      "viewAll": {
        "one": "Ver {n}",
        "many": "Ver los {n}",
        "other": "Ver los {n}"
      }
    },
    "image": {
      "fit": "Ajustar",
      "zoomIn": "Acercar",
      "zoomOut": "Alejar",
      "pan": "Arrastra para moverte cuando esté ampliada"
    },
    "json": {
      "expandAll": "Expandir todo",
      "collapseAll": "Contraer todo",
      "items": {
        "one": "{n} elemento",
        "many": "{n} elementos",
        "other": "{n} elementos"
      },
      "invalid": "No es un JSON válido. Hay un error cerca de la línea {line}.",
      "expand": "Expandir",
      "collapse": "Contraer"
    },
    "csv": {
      "search": "Buscar",
      "header": "La primera fila es el encabezado",
      "column": "Columna {n}",
      "rows": {
        "one": "{n} fila",
        "many": "{n} filas",
        "other": "{n} filas"
      },
      "columns": {
        "one": "{n} columna",
        "many": "{n} columnas",
        "other": "{n} columnas"
      },
      "matches": "{hits} / {total} filas",
      "noResults": "No hay resultados para «{query}»",
      "headerOnly": "Solo hay encabezado, sin filas de datos",
      "parseFailed": "No se pudo leer como tabla. Se muestra el texto sin formato.",
      "overRows": "Se muestran las primeras 50.000 de {total} filas. Ábrelo con la app predeterminada para verlo todo.",
      "overRowsWeb": "Se muestran las primeras 50.000 de {total} filas. Descarga el archivo completo para verlo todo.",
      "over10mb": "Este archivo pesa más de 10 MB. Se muestran las primeras {n} filas. Ábrelo con la app predeterminada para verlo todo.",
      "over10mbWeb": "Este archivo pesa más de 10 MB. Se muestran las primeras {n} filas. Descarga el archivo completo para verlo todo."
    }
  },
  "expandWorkspace": "Ampliar espacio",
  "restoreWorkspace": "Volver al chat"
};
