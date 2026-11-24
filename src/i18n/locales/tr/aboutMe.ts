import type { TranslatedCatalog } from "../../index.js";
export default {
  addedChannel: "✓ Hakkımda bölümüne eklendi: {line} (geri almak için “undo” yanıtla)",
  changedChannel: "✓ Hakkımda güncellendi: {line} (geri almak için “undo” yanıtla)",
  removedChannel: "✓ Hakkımda bölümünden silindi: {line} (geri almak için “undo” yanıtla)",
  undone: "Geri alındı. Hakkımda eski haline döndü.",
  empty: "Önce bir cümle yaz",
  tooLong: "Bir satır en fazla 300 karakter olabilir",
  secret: "Parolalar, anahtarlar, tokenlar ve kodlar kaydedilemez",
  idOrCard: "Kimlik ve banka kartı numaraları Hakkımda bölümüne kaydedilemez",
  missing: "Bu satır artık yok",
  stale: "Bu satır değişti, bu yüzden öneri artık geçerli değil",
  notUndoable: "Bu değişiklik artık geri alınamaz",
} satisfies TranslatedCatalog["aboutMe"];
