export default {
  "h2": "Verilerin.",
  "h2dim": "Gerçekte nereye gider?",
  "lead": "Makinede kalan ve çıkmak zorunda olan — ikisi de çizildi.",
  "local": "Cihazın",
  "localBadge": "Yerel",
  "out": "Cihazından çıkar",
  "vendors": "Model sağlayıcıları",
  "channels": "Bağladığın kanallar",
  "onlyRequest": "Yalnızca bu istek",
  "nodes": {
    "chats": {
      "label": "Sohbet geçmişi (SQLite)",
      "body": "Veri dizinindeki bir SQLite veritabanında durur; bir botu silmek sohbetlerini de siler."
    },
    "memory": {
      "label": "Uzun süreli bellek (Markdown)",
      "body": "Veri dizinindeki Markdown dosyaları, journal.jsonl değişiklik günlüğüyle; şifreler, anahtarlar ve kimlik numaraları kaydedilmez."
    },
    "workspace": {
      "label": "Çalışma alanı dosyaları",
      "body": "Botun kendi çalışma alanı; yazmalar varsayılan olarak burada kalır; dışarı çıkmak senin onayını ister."
    },
    "key": {
      "label": "Model anahtarı (yalıtık, son 4 görünür)",
      "body": "Ağ geçidi sürecinde ve yapılandırmada durur; ajan süreci gerçek anahtarı hiç görmez; arayüz yalnızca son 4 karakteri gösterir."
    },
    "console": {
      "label": "Konsol: 127.0.0.1 + token",
      "body": "Varsayılan olarak 127.0.0.1 üzerinde dinler ve Host başlığını kontrol eder; Docker modu bir erişim tokeni ister."
    },
    "gateway": {
      "label": "Okinto ağ geçidi",
      "sub": "Bu isteği iletir · günlük saklama süresi ayarlanabilir",
      "body": "İsteği seçtiğin sağlayıcıya iletir; günlük saklama Okinto’in “Veri saklama” belgesine uyar."
    },
    "vendors": {
      "label": "OpenAI / Anthropic / Google …",
      "body": "Modele gönderdiğini alır, bilgisayar kullanımı sırasındaki ekran içeriği dahil."
    },
    "channels": {
      "label": "Sohbet uygulamaları",
      "sub": "Slack · Telegram · Discord",
      "body": "Bu uygulamalardaki mesajlar doğası gereği onların sunucularından geçer."
    }
  },
  "retentionLink": "Okinto “Veri saklama” belgesi",
  "retentionUrl": "https://docs.newapi.pro/guides/features/data-retention/?utm_source=anymodelbot&utm_campaign=amb_homepage",
  "compare": {
    "caption": "okbot ile tipik bulut asistanlarının karşılaştırması",
    "head": [
      "",
      "okbot",
      "Tipik bulut asistanları"
    ],
    "rows": [
      [
        "Nerede çalışır",
        "Senin bilgisayarın / senin sunucun",
        "Sağlayıcının bulutu"
      ],
      [
        "Sohbetler ve bellek nerede durur",
        "Senin diskin",
        "Sağlayıcı sunucuları"
      ],
      [
        "Modeller",
        "Okinto’deki herhangi bir model, istediğin zaman değiştir",
        "Genelde sağlayıcının kendi modellerine bağlı"
      ],
      [
        "Faturalama",
        "Ücretsiz uygulama; modelleri Okinto kullanıma göre ücretlendirir",
        "Genelde kademeli aylık abonelik"
      ],
      [
        "Bilgisayar kullanımı",
        "Kendi bilgisayarını işletir (24 sınırlı eylem)",
        "Sağlayıcının verdiği bir bulut bilgisayarı işletir"
      ],
      [
        "Çıkarım istekleri cihazından çıkar mı?",
        "Evet, Okinto üzerinden model sağlayıcısına",
        "Evet"
      ],
      [
        "Denetlenebilir kod",
        "MIT",
        "Çoğunlukla hayır"
      ]
    ],
    "note": "“Tipik bulut asistanları”, sağlayıcıda barınan, abonelik ücretli ürünlerin yaygın yaklaşımını anlatır; belirli bir ürünü değil."
  },
  "security": "Güvenlik notlarının tamamını oku →"
};
