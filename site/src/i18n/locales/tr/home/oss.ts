export default {
  "facts": [
    {
      "text": "Konsol varsayılan olarak 127.0.0.1 üzerinde dinler ve Host başlığını kontrol eder; yerel erişim de erişim tokeni ister.",
      "path": "src/web/server.ts"
    },
    {
      "text": "Model anahtarları ajan sürecine hiç girmez; arayüz yalnızca son 4 karakteri gösterir.",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "Dosyalar ve komutlar sanal alanlı bir çalışma alanında çalışır, ötesi için onay ister; Linux'ta komutlar yalnızca veri dizinini de gizleyen bubblewrap içinde çalışır, kullanılamadığında reddedilir.",
      "path": "src/agent/host.ts"
    },
    {
      "text": "Bellek şifreleri, anahtarları ve kimlik numaralarını reddeder.",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "Bilgisayar kullanımı sürücüsünün (Cua) telemetri ortam değişkenleri 0 yapılır; magpie otomatik güncellemesi kapalıdır.",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
