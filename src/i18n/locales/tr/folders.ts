import type { TranslatedCatalog } from "../../index.js";
export default {
  err_notAllowed: "Bu konum kullanılamaz. Belirli bir proje klasörü seçin.",
  err_unavailable: "Bu klasöre erişilemiyor. Yeniden seçin.",
  err_system: "Sistem bu klasöre erişimi engelledi. Erişim izinlerini kontrol edip yeniden deneyin.",
  err_desktopOnly: "Klasörü, botun çalıştığı bilgisayardaki masaüstü uygulamasında seçin.",
  err_changed: "Gönderme koşulları değişti. Kontrol edip yeniden deneyin.",
  promptFolderGone: "[Bu mesaja bağlı \"{name}\" çalışma klasörü artık kullanılamıyor ({reason}): başka yerdeki aynı adlı dosyaları okuma veya yazma, başka klasöre geçme ve bu turda dosya değiştirme. Kullanıcıya klasörün artık kullanılamadığını ve yeniden seçmesini söyle.]",
  reasonUnavailable: "artık yok, değiştirilmiş veya klasör değil",
  reasonSystem: "sistem erişime izin vermiyor",
  reasonNotAllowed: "bu konum çalışma klasörü olamaz",
} satisfies TranslatedCatalog["folders"];
