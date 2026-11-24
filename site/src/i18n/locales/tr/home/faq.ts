export default {
  "h2": "Sorular.",
  "h2dim": "Doğrudan yanıtlar.",
  "ask": "Bir sorun mu var? Aç bak.",
  "more": "Bulamadın mı? Belgelere bak",
  "community": "Ya da toplulukta sor",
  "items": [
    {
      "q": "Bir bota nasıl beceri eklerim?",
      "a": "Üç yol: Uygulamalar ve beceriler’deki beceri kitaplığından bir kurulum istemini kopyala ya da bota bir becerinin GitHub bağlantısını gönder, sonra kartı onayla; botun ayarları → Beceriler → ZIP içe aktar altında SKILL.md içeren bir ZIP (en fazla 20 MB) içe aktar; ya da bir bot bir işi doğru yapınca “beceri olarak kaydet” de veya /skill gönder ve taslak kartı onayla, böylece Becerilerim’e kaydolur. Orada başka botlarda açabilir, ZIP olarak dışa aktarabilir veya zamanlayabilirsin. Gizli bilgiler asla bir beceriye yazılmaz; bir becerinin ihtiyaç duyduğu yazılım ve internet, beceriye bağlıdır."
    },
    {
      "q": "Eski bir sohbeti nasıl bulurum?",
      "a": "Kenar çubuğundan sohbet geçmişinde ara ya da genel arama için Ctrl/Cmd+Shift+F, bu sohbet için Ctrl/Cmd+F kullan. Bota, sohbete, kanala veya tarihe göre süz, sonra mesaja gitmek için bir sonuç seç. Arama yalnızca bu cihazda saklanan kayıtları kapsar ve model çağrısı yapmaz."
    },
    {
      "q": "Grok Bot, OpenAI dots veya Claude Duet’ten farkı ne?",
      "a": "Onlar da arka planda senin için çalışır ve karar sende olunca sana danışır. Fark şu: okbot açık kaynak (MIT) ve kendi bilgisayarında veya sunucunda çalışır. GPT, Claude, Gemini, Grok ve diğerleriyle çalışır; uygulama ücretsizdir, modeller kullanıma göre ücretlendirilir, tek bir sağlayıcının aboneliği yoktur. GitHub’daki README’de tam bir karşılaştırma tablosu var. Grok Bot, dots ve Claude Duet sırasıyla xAI, OpenAI ve Anthropic ürünleridir; okbot bu şirketlerle bağlantılı değildir."
    },
    {
      "q": "Altı karakterin farkı ne?",
      "a": "Yalnızca adları ve görünüşleri. Hiçbirinin sabit bir işi yok. Avatar, botlarını bir bakışta ayırmana yarar. Adı, kişiliği, modeli ve çalışma alanını sen seçersin; her bot sohbet edebilir, bilgisayarında iş yapabilir ve bir şeyleri hatırlayabilir. Uygulamanın şablonları yalnızca bir başlangıçtır: her sözcüğü değiştirebilir ya da sıfırdan başlayabilirsin."
    },
    {
      "q": "Verilerim okbot sunucularına yükleniyor mu?",
      "a": "Sohbetler, bellek, dosyalar ve anahtarlar cihazında saklanır. Model istekleri seçtiğin sağlayıcıya gider: kendi resmi API anahtarınla doğrudan, aksi halde Okinto üzerinden; günlük saklama “Veri saklama” belgesine uyar. Bilgisayar kullanımı sırasında görülen ekran içeriği seçilen modele gönderilir."
    },
    {
      "q": "Çevrimdışı çalışır mı?",
      "a": "Hayır. Modeller Okinto’den veya sağlayıcıların resmi API’lerinden gelir; yerel modeller desteklenmez."
    },
    {
      "q": "Telefonumda kullanabilir miyim?",
      "a": "Henüz ayrı bir uygulama yok; Slack, Telegram veya Discord’da sohbet et."
    },
    {
      "q": "Bir sohbet hesabı birkaç botla konuşabilir mi?",
      "a": "Evet. Hesabı bir kez Ayarlar › Bağlantılar’da ekle, bütün botlar paylaşır. Her hizmetin takma adlı birkaç hesabı olabilir. Yeni sohbetlere varsayılan bir bot yanıt verir; geçmek için bir kez /bot ve bir ad gönder, o sohbet yeni botta kalır. Botlarını görmek için /bot gönder."
    },
    {
      "q": "Botlar Notion veya GitHub gibi uygulamalarımla çalışabilir mi?",
      "a": "Evet, bağladıktan sonra. Avatar menüsündeki Uygulamalar ve beceriler’i kullan: GitHub, Notion, Linear, Atlassian ve Canva yerleşiktir, özel MCP bağlayıcıları da ekleyebilirsin. Aynı uygulamanın birkaç hesabını bağlayıp herhangi bir bota numara veya takma adla sorabilirsin. Salt okunur araçlar hemen çalışır, yazmalar önce sorar, silmeler veya başkalarına gönderilen her şey her zaman sorar. Salt okunur botlar yalnızca okuyabilir."
    },
    {
      "q": "Okinto hesabım yoksa ne olur?",
      "a": "İlk açılışta Okinto ile oturum aç / kaydol’a tıkla ve tarayıcıda kaydol. Geri dönünce uygulama kendisi bağlanır, kopyalanacak anahtar yoktur. Docker’da veya uzak bir sunucuda oturum açtıktan sonra düştüğün bağlantıyı yapıştır. Üç API alanı da kullanılabilir; yanıt sürelerini karşılaştır ve Ayarlar’dan birini seç. Hesabı da atlayabilirsin: Kendi API anahtarını kullan’a tıkla ve OpenAI, Anthropic, Google Gemini, DeepSeek veya başka bir sağlayıcının resmi anahtarını gir; model istekleri doğrudan onlara gider."
    },
    {
      "q": "Bilgisayar kullanımı güvenli mi?",
      "a": "İzin verilen 24 eylemle sınırlıdır; varsayılan olarak otomatik çalışır, arayüzü değiştiren eylemlerden önce soracak şekilde değiştirilebilir; ekran içeriği modele gider; önce ayrı bir makinede veya hesapta dene."
    },
    {
      "q": "Bir indirmeyi nasıl doğrularım?",
      "a": "Her indirmede bir SHA-256 vardır; Windows’ta Get-FileHash, macOS/Linux’ta shasum -a 256 kullan. GitHub sürümlerinde ayrıca bir SHA256SUMS dosyası vardır; sha256sum -c ile tek seferde kontrol edebilirsin."
    },
    {
      "q": "Pencereyi kapatınca bot duruyor mu?",
      "a": "Pencereyi kapatmak onu sistem tepsisinde tutar (oturum açılışında başlatma isteğe bağlıdır); bilgisayar kapalı veya uykudayken çevrimdışıdır; hep açık kalsın diye Docker kullan."
    },
    {
      "q": "Telemetri topluyor musun?",
      "a": "Kesin söyleyebildiğimiz: bilgisayar kullanımı sürücüsündeki (Cua) telemetri kapalı ve magpie’nin otomatik güncellemesi devre dışı. Model isteklerinin nasıl gittiği için veri akışı şemasına bak. Kod MIT lisanslı — kendin oku."
    },
    {
      "q": "Dosya gönderebilir veya sohbetteki görselleri üretim referansı yapabilir miyim?",
      "a": "Evet. Web birebir sohbetinde görsel ve metin dosyaları ekleyebilir, ne yapılacağını açıkladıktan sonra ZIP’i güvenle inceletebilirsin; masaüstü uygulamasında çalışma klasörü de seçebilirsin. Okinto hesabıyla giriş yaptığında, seçili modelin güncel yetenekleri ve görsel sınırları doğrulanabiliyorsa sohbet görsellerini üretim referansı olarak kullanabilirsin. Kendi API Key’leri bu özelliği henüz desteklemiyor."
    },
  ]
};
