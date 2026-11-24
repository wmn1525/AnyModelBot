import type { TranslatedCatalog } from "../../index.js";
export default {
  instanceLockUnavailable: "Bu açılış tek örnek kilidini alamadı. Başka bir örnek çalışıyor olabilir veya kilit oluşturulamadı. Kilit sonucunu ve gerçek veri dizinini başlangıç günlüğünde kontrol et.",
  updateReady: "{version} sürümü indirildi. Hazır olunca yeniden başlatıp güncelle.",
  updateInstallFailed: "Güncelleme kurulumu bitmedi. Uygulama yeniden başlayacak. Daha sonra tekrar dene.",
  trayOpen: "{product} aç",
  trayOpenInBrowser: "Tarayıcıda aç",
  trayAutostart: "Oturum açınca başlat",
  trayOpenDataDir: "Veri klasörünü aç",
  trayQuit: "Çık",
  errorTitle: "{product} bir sorunla karşılaştı",
  errorDetail: "{message}\n\nAyrıntılar için günlüğe bak: {log}",
  logDisabled: "(kapalı)",
  bootFailed: "{product} başlatılamadı",
  uiNotStarted: "Yerel arayüz başlamadı",
  trayNeeds: "Seni bekliyor ({count})",
} satisfies TranslatedCatalog["desktop"];
