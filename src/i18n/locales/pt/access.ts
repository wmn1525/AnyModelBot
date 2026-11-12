import type { TranslatedCatalog } from "../../index.js";
export default {
  refusal:
    "Você ainda não tem permissão para usar este bot; o proprietário foi avisado. Assim que ele aprovar, você já pode conversar.",
  approved: "O proprietário aprovou seu acesso. Agora você pode conversar comigo.",
  chWeixin: "WeChat",
  chFeishu: "Feishu",
  chWeb: "web",
  who: "usuário {name} ({channel})",
  ownerNotice:
    "Alguém quer usar o bot “{bot}”: {who}{said}\nResponda “yes {code}” para permitir ou “no {code}” para negar, ou resolva isso no painel de informações do okbot.",
  allowedAck: "✅ “{who}” agora pode usar este bot",
  deniedAck: "❌ Acesso negado a “{who}”",
  ownerOf: "proprietário ({channel}){who}",
  notSet: " não definido",
  listSep: ", ",
  pendingRequests:
    "; {count} pedido(s) de uso aguardando (responda “yes <código>” ou resolva no painel de informações do app)",
  policy:
    "Quem pode usar: só os proprietários e as pessoas na lista de permitidos ({owners}; permitidos: {allowed}){req}",
  said: ": “{text}”",
} satisfies TranslatedCatalog["access"];
