import type { TranslatedCatalog } from "../../index.js";
export default {
  refusal: "Aún no tienes permiso para usar este bot; ya se avisó al propietario. En cuanto te dé acceso, podrás chatear de inmediato.",
  approved: "El propietario te dio acceso. Ya puedes chatear conmigo.",
  chWeixin: "WeChat",
  chFeishu: "Feishu",
  chWeb: "web",
  who: "usuario de {channel} {name}",
  ownerNotice: "Alguien quiere usar el bot “{bot}”: {who}{said}\nResponde “yes {code}” para permitirlo o “no {code}” para denegarlo, o gestiónalo en el panel de información de okbot.",
  allowedAck: "✅ Se permitió que “{who}” use este bot",
  deniedAck: "❌ Se denegó el acceso a “{who}”",
  ownerOf: "propietario en {channel}:{who}",
  notSet: " sin definir",
  listSep: ", ",
  pendingRequests: "; solicitudes de uso pendientes: {count} (responde “yes <código>” o gestiónalas en el panel de información de la app)",
  policy: "Quién puede usarlo: solo los propietarios y las personas de la lista de permitidos ({owners}; permitidos: {allowed}){req}",
  said: ": “{text}”",
} satisfies TranslatedCatalog["access"];
