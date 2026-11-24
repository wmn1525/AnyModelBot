export default {
  "h2": "Nerede olursan ol botu bulursun.",
  "h2dim": "Aynı bot, aynı bellek.",
  "lead": "Masaüstü, Docker ve tarayıcı — telefonda da Slack, Telegram veya Discord.",
  "items": {
    "desktop": {
      "title": "Masaüstü",
      "sub": "Windows · macOS · Linux",
      "body": "Windows, macOS ve Linux — indir ve kullan.",
      "more": "Tüm indirmeler ve sağlama toplamları →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / sunucu",
      "body": "Bir NAS veya sunucuda çalıştır, hep açık kalsın."
    },
    "browser": {
      "title": "Tarayıcı",
      "body": "Masaüstü uygulaması ve Docker, yerel bir web konsoluyla gelir.",
      "format": "Yerel / kendi sunucun"
    }
  },
  "pick": "Nerede kullanacağını seç",
  "groupChat": "Sohbet uygulamaları",
  "thread": {
    "user": "Günlük raporu genelde ne zaman gönderirim?",
    "bot": "Her gün 17:00 — geçen hafta söylemiştin.",
    "memo": "Günlük rapor 17:00",
    "memoLabel": "Bellek"
  },
  "chatBody": "Bağladıktan sonra telefondan görev gönderebilirsin; botu çalıştıran bilgisayar veya sunucunun açık ve çevrimiçi kalması gerekir.",
  "howTo": "Adımları gör",
  "guideTitle": "Kurulum kılavuzu",
  "note": "Henüz ayrı bir iOS/Android uygulaması yok; telefonda Slack, Telegram veya Discord'da sohbet et. Web konsolu yerel veya kendi sunucundadır — bulut web uygulaması değildir.",
  "browserGuide": {
    "title": "Yerel web konsolu",
    "steps": [
      "Masaüstü: sistem tepsisi menüsü → Tarayıcıda aç. Konsol 127.0.0.1 üzerinde dinler ve her açılışta rastgele bir erişim tokeni üretir.",
      "Docker: http://<host>:3600/?token=<token> adresini aç; tokeni docker exec amb cat /data/ui-token ile oku.",
      "3600 portunu doğrudan internete açma."
    ]
  }
};
