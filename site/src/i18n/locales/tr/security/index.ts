export default {
  "title": "Güvenlik — okbot",
  "description": "okbot verisi nereye gider, yerel korumalar ve bilinen sınırlar: cihazda kalan ve çıkmak zorunda olan.",
  "h1": "Güvenlik",
  "lead": "Ana sayfadaki veri akışı şemasının uzun hali: cihazda kalan, çıkmak zorunda olan, kodda doğrulayabileceğin korumalar ve vermediğimiz sözler.",
  "stays": "Cihazında kalır",
  "leaves": "Cihazından çıkar",
  "leavesItems": [
    "Modele gönderdiğin her şey (bilgisayar kullanımı sırasındaki ekran içeriği dahil) okinto ağ geçidinden seçtiğin sağlayıcıya gider.",
    "Model istekleri okinto üzerinden geçer. Günlükler, önbellek ve verilerin işlenmesi okinto gizlilik politikası ile hesap ayarlarına tabidir.",
    "Slack, Telegram ve Discord mesajları doğası gereği bu platformların sunucularından geçer.",
    "Notion veya GitHub gibi uygulamalar bağlarsan ya da özel bir MCP bağlayıcısı eklersen, botların okuyup yazdığı şey bu hizmetlere gider; okudukları da model isteklerine girer. Hesap hizmeti destekliyorsa uygulama içi geri bildirimin metni, kategorisi, arka planı, sürümü ve sistem bilgileri Okinto'ya özel destek talebi olarak gönderilir. Hata ve günlükler isteğe bağlıdır, anahtarlar gizlenir, iletişim bilgileri için onay gerekir; sohbetler ve ekran görüntüleri eklenmez.",
    "Kurulu masaüstü uygulamaları açılıştan sonra ve her 6 saatte bir GitHub'da güncelleme arar ve güncelleme dosyalarını varsayılan olarak arka planda indirir. Otomatik indirmeyi Ayarlar → Genel'den kapatabilirsin. İsteklerde hesap bilgisi veya sohbet içeriği yoktur. Kurulum için çalışan görev yokken Yeniden başlat ve güncelle'ye basman gerekir.",
  ],
  "guardsTitle": "Koddaki korumalar",
  "limitsTitle": "Sınırlar ve vermediğimiz sözler",
  "limits": [
    "Çevrimdışı veya yerel model yok; çıkarım istekleri her zaman cihazından çıkar.",
    "Bilgisayar kullanımı varsayılan olarak otomatik çalışır (arayüzü değiştiren eylemlerden önce sormaya çevrilebilir); macOS doğrudan modu gerçek makinelerde doğrulanmadı.",
    "Uygulamanın ağ davranışı üçüncü tarafça denetlenmedi, bu yüzden “sıfır telemetri” demiyoruz.",
    "Linux dışındaki platformlarda bubblewrap katmanı yok; sanal alanın gücü platforma göre değişir."
  ],
  "report": "Geri bildirim veya iş birliği için GitHub Issues üzerinden projeyle iletişime geç."
};
