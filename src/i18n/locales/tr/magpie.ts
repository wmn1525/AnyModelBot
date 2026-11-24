import type { TranslatedCatalog } from "../../index.js";
export default {
  no_binary_cli: "magpie yürütülebilir dosyası bulunamadı. Önce npm run setup çalıştır",
  no_binary: "magpie yürütülebilir dosyası bulunamadı (vendor/magpie içinden derlemek için npm run setup çalıştır)",
  unsupported_url: "Desteklenmeyen Okinto adresi",
  missing_key: "API anahtarı eksik",
  create_failed: "Okinto bağlantısı oluşturulamadı: {detail}",
  not_running: "Model ağ geçidi çalışmıyor. Biraz sonra tekrar dene",
  disconnect_failed: "Bağlantı kesilemedi: HTTP {status} {body}",
  save_failed: "Kaydedilemedi: HTTP {status} {body}",
  verify_failed: "Kaydederken doğrulama başarısız",
} satisfies TranslatedCatalog["magpie"];
