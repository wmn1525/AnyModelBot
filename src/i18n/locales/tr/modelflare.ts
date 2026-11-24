import type { TranslatedCatalog } from "../../index.js";
export default {
  unreachable: "{host} adresine ulaşılamıyor ({reason}). Ağını kontrol et. Vekil sunucu veya VPN kullanıyorsan sistem vekilini veya TUN modunu açıp tekrar dene",
  timeout: "zaman aşımı",
  invalid_key: "Anahtar geçersiz veya iptal edilmiş",
  forbidden: "Bu anahtarın bu modeli veya grubu kullanmasına izin yok",
  unavailable: "Okinto New API geçici olarak kullanılamıyor (HTTP {status}){retry}",
  retry_after: "; {s} sn sonra tekrar dene",
  bad_models: "Okinto New API, okunamayan bir model listesi döndürdü",
  balance_failed: "Bakiye okunamadı (HTTP {status})",
  bad_balance: "Okinto New API, okunamayan bir bakiye döndürdü",
} satisfies TranslatedCatalog["modelflare"];
