import type { TranslatedCatalog } from "../../index.js";
export default {
  invalid_key: "{name} bu anahtarı kabul etmedi. Kontrol edip tekrar dene",
  rate_limited: "{name} şu an istekleri sınırlıyor. Biraz sonra tekrar dene",
  network: "{name} adresine ulaşılamıyor. Bu cihazın oraya ulaşmak için vekil sunucuya ihtiyacı varsa önce vekili ayarla",
  upstream: "{name} bir model listesi döndürmedi: {detail}",
} satisfies TranslatedCatalog["official"];
