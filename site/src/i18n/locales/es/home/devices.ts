export default {
  "h2": "Lo encuentras dondequiera que estés.",
  "h2dim": "El mismo bot, la misma memoria.",
  "lead": "Escritorio, Docker y navegador, además de Slack, Telegram o Discord en tu teléfono.",
  "items": {
    "desktop": {
      "title": "Escritorio",
      "sub": "Windows · macOS · Linux",
      "body": "Windows, macOS y Linux: descarga y listo.",
      "more": "Todas las descargas y sumas de verificación →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / servidor",
      "body": "Ejecútalo en un NAS o un servidor, siempre encendido."
    },
    "browser": {
      "title": "Navegador",
      "body": "La app de escritorio y Docker incluyen una consola web local.",
      "format": "Local / autoalojado"
    }
  },
  "pick": "Elige dónde usarlo",
  "groupChat": "Apps de chat",
  "thread": {
    "user": "¿A qué hora suelo enviar el informe diario?",
    "bot": "A las 5 p. m., todos los días. Me lo dijiste la semana pasada.",
    "memo": "Informe diario a las 5 p. m.",
    "memoLabel": "Memoria"
  },
  "chatBody": "Una vez conectado, puedes enviarle tareas desde tu teléfono; la computadora o el servidor donde corre el bot tiene que estar encendido y en línea.",
  "howTo": "Ver los pasos",
  "guideTitle": "Guía de configuración",
  "note": "Todavía no hay app independiente para iOS/Android; en el teléfono, chatea con él en Slack, Telegram o Discord. La consola web es local o autoalojada, no una app web en la nube.",
  "browserGuide": {
    "title": "Consola web local",
    "steps": [
      "Escritorio: menú de la bandeja del sistema → Abrir en el navegador. La consola escucha en 127.0.0.1 y genera un token de acceso aleatorio en cada inicio.",
      "Docker: abre http://<host>:3600/?token=<token>; obtén el token con docker exec amb cat /data/ui-token.",
      "No expongas el puerto 3600 directamente a internet."
    ]
  }
};
