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
    "app": "Espacio de trabajo",
    "overview": "Resumen",
    "tasks": "Tareas",
    "memory": "Memoria"
  },
  "noTasks": "Aún no hay tareas ni reglas"
};
