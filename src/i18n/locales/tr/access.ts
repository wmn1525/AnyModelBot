import type { TranslatedCatalog } from "../../index.js";
export default {
  refusal: "Bu botu kullanmana henüz izin verilmedi; sahip bilgilendirildi. Onaylayınca hemen sohbet edebilirsin.",
  approved: "Sahip seni onayladı. Artık benimle sohbet edebilirsin.",
  chWeixin: "WeChat",
  chFeishu: "Feishu",
  chWeb: "web",
  who: "{channel} kullanıcısı {name}",
  ownerNotice: "Birisi “{bot}” botunu kullanmak istiyor: {who}{said}\nİzin vermek için “yes {code}”, reddetmek için “no {code}” yanıtla veya okbot bilgi panelinden ele al.",
  allowedAck: "✅ “{who}” bu botu kullanabilir",
  deniedAck: "❌ “{who}” reddedildi",
  ownerOf: "{channel} sahibi{who}",
  notSet: " ayarlanmadı",
  listSep: ", ",
  pendingRequests: "; {count} kullanım isteği bekliyor (“yes <code>” yanıtla veya uygulamanın bilgi panelinden ele al)",
  policy: "Kim kullanabilir: yalnızca sahipler ve izin listesindeki kişiler ({owners}; {allowed} izinli){req}",
  said: ": “{text}”",
} satisfies TranslatedCatalog["access"];
