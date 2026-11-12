export default {
  "defaultBotName": "Ping",
  "nameGeneric": "tu bot",
  "nameToast": "tu bot",
  "title": "Primeros pasos",
  "allDone": "Primeros pasos completados",
  "progress": "Primeros pasos · {progress}",
  "toastProgress": "Primeros pasos {progress} · {title}",
  "collapse": "Minimizar en la barra lateral",
  "demoThis": "Mensaje de demostración",
  "watchDemo": "Ver demostración",
  "tryThis": "Prueba esto",
  "sendThis": "Enviar",
  "followHint": "Solo sigue las indicaciones",
  "takeMe": "Muéstrame",
  "completed": "Listo",
  "upNext": "A continuación",
  "hide": "Ocultar la lista",
  "coachLabel": "Guía de primeros pasos",
  "closeCoach": "Cerrar la guía",
  "doneTitle": "¡Buen trabajo!",
  "fill": "Insertar",
  "openConsole": "Habilita modelos de imagen en la consola de OKINTO ↗",
  "later": "Quizás más tarde",
  "stopHere": "Suficiente por ahora",
  "next": "Siguiente: {title}",
  "demo": {
    "label": "Demostración",
    "generating": "Generando la imagen de ejemplo",
    "alt": "Imagen de ejemplo: un pequeño robot azul con auriculares, en estilo de ilustración plana",
    "zoomIn": "Ver a tamaño completo",
    "zoomOut": "Reducir",
    "caption": "Esta imagen de ejemplo viene incluida en la app; no se llamó a ningún modelo.",
    "enable": "Habilitar modelos de imagen ↗"
  },
  "steps": {
    "hello": {
      "title": "Saluda a {name}",
      "desc": "Chatea con tu bot aquí mismo. Las respuestas van apareciendo a medida que se escriben.",
      "how": [
        "Enter para enviar, Shift + Enter para un salto de línea",
        "Esc para detenerlo",
        "Escribe / para ver todos los comandos"
      ],
      "try": "¿En qué me puedes ayudar?",
      "doneText": "Vuelve aquí cuando quieras. La lista de la esquina inferior izquierda te acompaña."
    },
    "model": {
      "title": "Cambia de modelo",
      "desc": "Con una sola cuenta tienes GPT, Claude, Gemini y más, así que cada trabajo puede ir a un modelo distinto.",
      "how": [
        "Haz clic en el nombre del modelo, en la esquina inferior derecha del cuadro de texto, y elige uno",
        "Solo se aplica a esta conversación. Para seguir usándolo, haz clic en “Establecer como modelo predeterminado de este bot” al final de la lista",
        "Cada modelo muestra su longitud de contexto, sus capacidades y su precio estimado"
      ],
      "doneText": "Listo, cambiado solo para esta conversación. Hazle una pregunta."
    },
    "weixin": {
      "title": "Conecta {name} a WeChat",
      "desc": "Escanea un código QR y luego escríbele directamente en WeChat. No tienes que instalar ninguna app nueva y está en línea siempre que tu computadora esté encendida.",
      "how": [
        "Haz clic en el nombre del bot, arriba, para abrir el panel derecho, y luego en “Administrar canales de chat”",
        "En la fila de WeChat, haz clic en “Conectar”",
        "Escanea el código con WeChat y confirma en tu teléfono"
      ],
      "note": "La regla de WeChat: por cada mensaje que envías, puede responder hasta 10 veces en un plazo de 24 horas. Para Feishu, Telegram, Slack o Discord, agrega una cuenta en el mismo lugar. Todos los bots comparten las cuentas y puedes enviar /bot y un nombre en un chat para cambiar de bot.",
      "doneText": "Envíale un mensaje en WeChat. Para hablar con otro bot, envía /bot."
    },
    "hands": {
      "title": "Ponlo a trabajar",
      "desc": "Puede escribir archivos y ejecutar comandos en su propio espacio de trabajo, y luego entregarte los resultados.",
      "how": [
        "Solo modifica cosas dentro de su propio espacio de trabajo",
        "Antes de tocar archivos fuera de él, te pregunta en el chat y espera a que hagas clic en “Permitir una vez”",
        "¿Prefieres ir a lo seguro? Cambia el permiso, en la esquina inferior izquierda del cuadro de texto, a “Solo lectura”"
      ],
      "try": "Crea “today-todo.md” en tu espacio de trabajo con tres cosas que hacer hoy y luego envíamelo.",
      "doneText": "Los archivos terminados aparecen en el chat. En WeChat y Feishu, te los envía directamente."
    },
    "memory": {
      "title": "Haz que te recuerde",
      "desc": "Cuéntale tus preferencias y los datos que usas a menudo. Los recuerda en chats nuevos y en WeChat, pero nunca guarda contraseñas, claves ni cosas similares.",
      "how": [
        "Solo di “Recuerda…”. También anota por su cuenta las cosas importantes mientras chatean",
        "Para que lo olvide, di “Olvida…” o elimínalo en “Memoria”, en el panel derecho"
      ],
      "try": "Recuerda: da respuestas breves y empieza por la conclusión.",
      "doneText": "Entendido. Puedes verlo o eliminarlo en “Memoria”, en el panel derecho."
    },
    "media": {
      "title": "Genera una imagen",
      "desc": "Puede crear imágenes y videos. Solo pídeselo y se pone a trabajar; te consulta primero solo cuando el costo es alto.",
      "how": [
        "Describe la imagen que quieres",
        "Las imágenes terminadas aparecen directamente en el chat; haz clic en una para verla a tamaño completo",
        "Si cuesta más de $0.5, primero te pregunta qué modelo usar"
      ],
      "try": "Dibuja un pequeño robot azul con auriculares, en estilo de ilustración plana.",
      "demoNote": "La demostración funciona igual que la real, pero no se llama a ningún modelo ni se cobra nada.",
      "doneText": "Eso fue una demostración. Para crear una de verdad, solo pídelo.",
      "noModelText": "Eso fue una demostración. Tu cuenta aún no tiene un modelo de imagen. Cuando habilites uno, la misma solicitud te dará una imagen real."
    }
  }
};
