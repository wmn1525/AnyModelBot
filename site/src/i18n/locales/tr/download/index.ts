export default {
  "warn": "3600 portunu doğrudan internete açma.",
  "win": "Windows için indir",
  "mac": "macOS için indir",
  "linux": "Linux için indir",
  "mobile": "Sohbet uygulamalarından kullan",
  "generic": "İndir",
  "more": "Diğer platformlar",
  "items": {
    "win-x64": "Windows yükleyici (NSIS)",
    "mac-arm64": "macOS Apple silicon",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    "docker": "Docker komutu",
    "changelog": "Değişiklik günlüğü"
  },
  "platform": {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux"
  },
  "arch": {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage"
  },
  "meta": "Sürüm {version} · Yayım {publishedAt}",
  "sha": "SHA-256",
  "started": "İndirme başladı — tarayıcının indirmelerine bak.",
  "downloading": "İndiriliyor…",
  "macNote": "macOS'ta bilgisayar kullanımı beta: doğrudan mod hâlâ daha fazla gerçek makinede denenmeli. Erişilebilirlik ve Ekran Kaydı izinleri yalnızca bir bot ilk kez ihtiyaç duyduğunda istenir. Uygulamanın geri kalanı Windows ve Linux ile aynı.",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "Windows uyarı verirse Daha fazla bilgi'yi, sonra Yine de çalıştır'ı seç.",
  "macHint": "Apple tarafından Developer ID ile imzalandı ve noter onayından geçti. Uygulamayı Uygulamalar'a sürükle, aç ve indirmeyi onaylaman istenirse Aç'ı seç.",
  "firstRun": "İlk açılış",
  "yourSystem": "Sistemin",
  "verifyTitle": "İndirmeyi doğrula",
  "verifyLead": "Sistemine uygun komutu çalıştır ve SHA-256 değerini buradakiyle karşılaştır. Eşleşirse dosya sağlamdır.",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<dosya> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <dosya>",
  "pageTitle": "okbot'u indir",
  "pageLead": "Ücretsiz ve açık kaynak. Uygulamanın kendisi kayıt istemez; ilk açılışta Okinto ile oturum aç, hazırsın.",
  "pageDescription": "okbot'u Windows, macOS, Linux ve Docker için indir. Ücretsiz, açık kaynak, kullandıkça öde.",
  "altTitle": "Çalıştırmanın diğer yolları",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "Konteyneri başlat",
    "token": "Erişim tokenini oku",
    "open": "Tarayıcıda aç"
  },
  "dockerUrl": "http://<host>:3600/?token=<token>",
  "cliTitle": "Komut satırı (CLI)",
  "cliBody": "Kaynaktan çalıştır. Paketlenen ağ geçidini derlemek için Node.js 22.13+ ve Go 1.26.8+ gerekir.",
  "cliSteps": {
    "clone": "Depoyu klonla",
    "setup": "Bağımlılıkları kur ve ağ geçidini derle",
    "start": "Başlat, sonra http://127.0.0.1:3600/ adresini aç"
  },
  "releases": "GitHub sürümleri",
  "changelog": "Değişiklik günlüğü"
};
