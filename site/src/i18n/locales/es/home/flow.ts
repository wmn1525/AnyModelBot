export default {
  "h2": "Tus datos.",
  "h2dim": "¿A dónde van realmente?",
  "lead": "Lo que se queda en tu computadora y lo que tiene que salir: las dos cosas, en un diagrama.",
  "local": "Tu dispositivo",
  "localBadge": "Local",
  "out": "Sale de tu dispositivo",
  "vendors": "Proveedores de modelos",
  "channels": "Canales que conectas",
  "onlyRequest": "Solo esta solicitud",
  "nodes": {
    "chats": {
      "label": "Historial de chats (SQLite)",
      "body": "Se guarda en una base de datos SQLite en tu directorio de datos; al eliminar un bot se eliminan sus chats."
    },
    "memory": {
      "label": "Memoria a largo plazo (Markdown)",
      "body": "Archivos Markdown en tu directorio de datos, con un registro de cambios journal.jsonl; no se guardan contraseñas, claves ni números de identificación."
    },
    "workspace": {
      "label": "Archivos del espacio de trabajo",
      "body": "El espacio de trabajo propio del bot; de forma predeterminada solo escribe aquí; salir de él requiere tu aprobación."
    },
    "key": {
      "label": "Clave del modelo (aislada, se ven los últimos 4)",
      "body": "Se guarda en el proceso del gateway y en la configuración; el proceso del agente nunca ve la clave real; la interfaz solo muestra los últimos 4 caracteres."
    },
    "console": {
      "label": "Consola: 127.0.0.1 + token",
      "body": "Escucha en 127.0.0.1 y verifica el encabezado Host de forma predeterminada; el modo Docker requiere un token de acceso."
    },
    "gateway": {
      "label": "Gateway de OKINTO",
      "sub": "Reenvía esta solicitud · retención de registros configurable",
      "body": "Reenvía la solicitud al proveedor que elijas; la retención de registros sigue el documento “Retención de datos” de OKINTO."
    },
    "vendors": {
      "label": "OpenAI / Anthropic / Google …",
      "body": "Recibe lo que envías al modelo, incluido el contenido de la pantalla durante el uso de la computadora."
    },
    "channels": {
      "label": "Apps de chat",
      "sub": "Slack · Telegram · Discord",
      "body": "Por naturaleza, los mensajes de estas apps pasan por sus servidores."
    }
  },
  "retentionLink": "Documento “Retención de datos” de OKINTO",
  "retentionUrl": "https://docs.newapi.pro/es/guides/features/data-retention/?utm_source=anymodelbot&utm_campaign=amb_homepage",
  "compare": {
    "caption": "okbot frente a los asistentes típicos alojados en la nube",
    "head": [
      "",
      "okbot",
      "Asistentes típicos en la nube"
    ],
    "rows": [
      [
        "Dónde se ejecuta",
        "Tu computadora / tu servidor",
        "La nube del proveedor"
      ],
      [
        "Dónde están los chats y la memoria",
        "Tu disco",
        "Los servidores del proveedor"
      ],
      [
        "Modelos",
        "Cualquier modelo de OKINTO; cámbialo cuando quieras",
        "Normalmente ligados a los modelos del propio proveedor"
      ],
      [
        "Cobro",
        "App gratis; OKINTO cobra los modelos por uso",
        "Normalmente una suscripción mensual con niveles"
      ],
      [
        "Uso de la computadora",
        "Opera tu propia computadora (24 acciones acotadas)",
        "Opera una computadora en la nube que proporciona el proveedor"
      ],
      [
        "¿Las solicitudes de inferencia salen de tu dispositivo?",
        "Sí, a través de OKINTO hasta el proveedor del modelo",
        "Sí"
      ],
      [
        "Código auditable",
        "MIT",
        "En general, no"
      ]
    ],
    "note": "“Asistentes típicos en la nube” describe el enfoque habitual de los productos alojados por el proveedor y de pago por suscripción, no un producto concreto."
  },
  "security": "Lee las notas de seguridad completas →"
};
