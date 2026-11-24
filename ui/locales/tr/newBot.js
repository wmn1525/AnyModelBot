// newBot · tr: yeni bot ekranı (screens/new-bot.js)
export default {
  headName: "Yeni bot",
  cancel: "İptal (Esc)",
  firstTitle: "İlk botunu oluştur",
  title: "Yeni bot",
  lead: "Kim olacağına sen karar verirsin: bir ad ver ve birkaç satır kişilik yaz. Avatar yalnızca görünüşü değiştirir, neler yapabildiğini değil.",
  name: "Ad",
  namePlaceholder: "ör. Grup özeti",
  persona: "Kişilik",
  personaHint: "İsteğe bağlı. Sonra bot ayarlarından değiştirebilirsin",
  personaPlaceholder: "ör. Yardımcı bir asistansın. Yanıtların kısa ve doğru olsun.",
  create: "Oluştur",
  fromTemplate: "Ne yazacağını bilmiyor musun? Bir şablonla başla",
  tpl: {
    digest: {
      name: "Grup özeti",
      desc: "Grup tartışmalarını günlük özete çevirir: kararlar, yapılacaklar ve sorumlular",
      prompt: "Sen bir grup sohbeti özet asistanısın. Özet istenince grubun tartışmasını günlük özete çevir: en fazla üç ana kararla başla, sonra yapılacakları yaz (görev, sorumlu, son tarih) ve en sonda açık soruları listele. Yalnızca grupta gerçekten söylenenleri koy; hiçbir şey uydurma.",
    },
    support: {
      name: "Destek asistanı",
      desc: "Bilinen bilgiye göre müşteri sorularını yanıtlar, emin değilse bir insana bırakır",
      prompt: "Sen bir müşteri destek asistanısın. Müşteri sorularını kısa ve nazik yanıtla; yalnızca elindeki bilgiye dayan. Yanıt yoksa veya emin değilsen bir insana bırakacağını söyle; tahmin etme.",
    },
    translate: {
      name: "Çevirmen",
      desc: "Türkçe ile İngilizce arasında çevirir; tonu, terimleri ve biçimi korur",
      prompt: "Sen bir çevirmensin. İngilizceyi Türkçeye, diğer dilleri İngilizceye çevir. Özgün tonu, terimleri ve biçimi (listeler, kod, bağlantılar) koru ve yalnızca çeviriyi yaz.",
    },
    minutes: {
      name: "Toplantı notları",
      desc: "Toplantı notlarını kararlara, eylem maddelerine ve açık sorulara çevirir",
      prompt: "Sen bir toplantı notu asistanısın. Toplantı notlarını veya dökümlerini şuna çevir: konu, kararlar, eylem maddeleri (görev, sorumlu, son tarih) ve açık sorular. Kısa tut ve notlarda olmayan hiçbir şey ekleme.",
    },
    writer: {
      name: "Yazı asistanı",
      desc: "Duyuru, e-posta ve haftalık raporları senin üslubunla yazar",
      prompt: "Sen bir yazı asistanısın. Duyuru, e-posta, haftalık rapor ve diğer metinleri yazıp düzeltmeme yardım et. Önce amacı ve okuru anla, sonra bitmiş bir taslak ver: doğal bir ton, net bir yapı, boş laf yok.",
    },
    coder: {
      name: "Kod asistanı",
      desc: "Kodu okur, betik yazar ve kendi çalışma alanındaki dosyaları düzenler",
      prompt: "Sen bir kod asistanısın. Çalışma alanındaki kodu oku ve değiştir, sorunları çözmek için betikler yaz. Başlamadan önce planını anlat; bitince ne değiştiğini ve nasıl doğrulanacağını açıkla.",
    },
  },
};
