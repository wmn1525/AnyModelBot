// perms · tr
export default {
  workspace: "Çalışma alanına yazma",
  workspaceNote: "Yalnızca bu botun çalışma alanını değiştirebilir; dışarıdaki her şey önce senden onay ister",
  readonly: "Salt okunur",
  readonlyNote: "Dosyaları değiştiremez; komutlar salt okunur bir korumalı alanda çalışır",
  full: "Tam erişim",
  fullNote: "Komutlar korumalı alan olmadan çalışır ve tüm dosyalarını okuyup değiştirebilir; özyinelemeli silmeler yine önce sorar",
  fullWarning: "Komutlar korumalı alan olmadan, doğrudan senin kullanıcın olarak çalışır: bilgisayarındaki her dosyayı okuyup değiştirebilir, okbot verileri dahil (sohbet geçmişi, kanal tokenları ve anahtarlar). Sınırın dışındaki eylemler artık onay istemez; yalnızca özyinelemeli silmeler (rm -r, Remove-Item -Recurse ve benzerleri) önce sorar. Bunu yalnızca şu anki modele ve göreve güvendiğinde aç.",
  confirmTitle: "Tam erişim açılsın mı?",
  confirmLabel: "Tam erişimi aç",
};
