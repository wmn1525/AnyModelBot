import type { TranslatedCatalog } from "../../index.js";
export default {
  failed: "Bağlantı tamamlanamadı. Ağını kontrol edip tekrar dene.",
  feishuStartRefused: "Feishu başlamayı reddetti. Tekrar dene veya elindeki bir uygulamayı kullan.",
  feishuDeclined: "Feishu içinde reddettin.",
  feishuQrExpired: "QR kodunun süresi doldu. Tekrar dene.",
  feishuAppRefused: "Feishu bu uygulamayı reddetti. App ID ile Secret değerini ve uygulamanın mesaj izinlerini kontrol et.",
  feishuNoRefreshToken: "Feishu uzun ömürlü bir oturum vermedi. Tekrar dene.",
  feishuAuthExpired: "Yetkilendirmenin süresi doldu. Tekrar dene.",
  feishuAuthIncomplete: "Feishu yetkilendirmeyi tamamlamadı. Tekrar dene.",
  notionUnavailable: "Notion oturum hizmetine ulaşılamadı. Biraz sonra tekrar dene.",
  notionUnexpected: "Notion oturum hizmeti beklenmeyen bir yanıt verdi.",
  notionRegistrationUnavailable: "Notion oturum hizmeti yeni istemci kabul etmiyor.",
  notionRegistrationRefused: "Notion oturum hizmeti bu uygulamayı kaydetmeyi reddetti.",
  notionLinkExpired: "Bu oturum bağlantısının süresi doldu. Ayarlar bölümünden yeniden başla.",
  notionDeclined: "Yetkilendirmeyi reddettin.",
  notionAuthIncomplete: "Notion yetkilendirmeyi tamamlamadı.",
  notionExchangeFailed: "Notion yetkilendirmeyi tamamlamadı. Tekrar dene.",
} satisfies TranslatedCatalog["connections"];
