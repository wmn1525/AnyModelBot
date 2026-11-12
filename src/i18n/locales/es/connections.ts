import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "No se pudo completar la conexión. Revisa tu red y vuelve a intentarlo.",
  feishuStartRefused: "Feishu no permitió iniciar la autorización. Vuelve a intentarlo o usa una app que ya tengas.",
  feishuDeclined: "Rechazaste la autorización en Feishu.",
  feishuQrExpired: "El código QR expiró. Vuelve a intentarlo.",
  feishuAppRefused: "Feishu rechazó esta app. Revisa el App ID y el App Secret, y que la app tenga los permisos de mensajes.",
  feishuNoRefreshToken: "Feishu no devolvió credenciales de inicio de sesión de larga duración. Vuelve a intentarlo.",
  feishuAuthExpired: "La autorización expiró. Vuelve a intentarlo.",
  feishuAuthIncomplete: "Feishu no completó la autorización. Vuelve a intentarlo.",
  notionUnavailable: "No se pudo conectar con el servicio de inicio de sesión de Notion. Vuelve a intentarlo en un momento.",
  notionUnexpected: "El servicio de inicio de sesión de Notion devolvió una respuesta inesperada.",
  notionRegistrationUnavailable: "El servicio de inicio de sesión de Notion no acepta clientes nuevos.",
  notionRegistrationRefused: "El servicio de inicio de sesión de Notion no permitió registrar esta app.",
  notionLinkExpired: "Este enlace de inicio de sesión expiró. Vuelve a empezar desde Ajustes.",
  notionDeclined: "Rechazaste la autorización.",
  notionAuthIncomplete: "Notion no completó la autorización.",
  notionExchangeFailed: "Notion no completó la autorización. Vuelve a intentarlo.",
} satisfies TranslatedCatalog["connections"];
