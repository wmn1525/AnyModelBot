import type { Channel } from "./channels";
export default [
  {
    id: "slack", icon: "hash", title: "Slack", body: "Slack DM'inden mesaj at — bilgisayardan ya da telefondan, görseller ve dosyalar da olur.", format: "Kanal (Socket Mode)",
    guide: { title: "Slack bağlantısı", steps: [
      "api.slack.com/apps adresinde bir uygulama oluştur, Socket Mode'u aç ve connections:write ile bir uygulama düzeyi tokeni (xapp-…) üret.",
      "chat:write, im:history, files:read ve files:write bot kapsamlarını ekle, message.im olayına abone ol ve App Home içinde mesajlara izin ver. Uygulamayı çalışma alanına kur ve bot tokenini (xoxb-…) kopyala.",
      "Ayarlar → Sohbet kanalları → Slack → Hesap ekle bölümünü aç, iki tokeni yapıştır ve kaydet. Sonra Slack'te bota doğrudan mesaj gönder.",
    ], limit: "Şimdilik yalnızca doğrudan mesajlar. Uygulamanın açık olması gerekir: kapalıyken gönderilen mesajlar alınmaz." },
  },
  {
    id: "telegram", icon: "send", title: "Telegram", body: "@BotFather ile bir bot oluştur ve her yerden sohbet et — görseller ve dosyalar da olur.", format: "Kanal (bot tokeni)",
    guide: { title: "Telegram bağlantısı", steps: [
      "Telegram'da @BotFather ile bir sohbet aç, /newbot gönder ve yönergeleri izle. Verdiği bot tokenini kopyala.",
      "Ayarlar → Sohbet kanalları → Telegram → Hesap ekle bölümünü aç, tokeni yapıştır ve kaydet.",
      "Yeni botunu Telegram'da aç ve bir mesaj gönder. Bağlantı long polling kullanır, bu yüzden bilgisayarının herkese açık bir adresi olması gerekmez.",
    ], limit: "Şimdilik yalnızca doğrudan mesajlar. Uygulama kapalıyken gönderilen mesajlar, en fazla 24 saatlikse sonradan alınır." },
  },
  {
    id: "discord", icon: "headset", title: "Discord", body: "Botu sunucuna ekle ve bilgisayardan ya da Discord uygulamasından ona DM gönder.", format: "Kanal (bot tokeni)",
    guide: { title: "Discord bağlantısı", steps: [
      "Discord Developer Portal'da bir uygulama oluştur, bir bot ekle ve tokenini kopyala.",
      "OAuth2 → URL Generator içinde bot kapsamını işaretle ve katıldığın bir sunucuya botu eklemek için bağlantıyı aç.",
      "Ayarlar → Sohbet kanalları → Discord → Hesap ekle bölümünü aç, tokeni yapıştır ve kaydet. Sonra bota doğrudan mesaj gönder.",
    ], limit: "Şimdilik yalnızca doğrudan mesajlar. Uygulamanın açık olması gerekir: kapalıyken gönderilen mesajlar alınmaz." },
  },
] satisfies Channel[];
