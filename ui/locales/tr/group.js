// group · tr: grup sohbetleri (screens/group.js)
export default {
  /** @ listesinde herkesi temsil eden öğe; girdi kutusuna da bu yazılır. İngilizce kalır: src/core/groups.ts yalnızca "everyone"/"all" tanır */
  everyone: "everyone",
  placeholder: "Mesaj yaz, kimin yanıtlayacağını @ ile seç",
  mentionLabel: "@ için bir üye seç",
  editTitle: "Grup adı ve üyeler",
  empty: "@ ettiğin bot yanıtlar. @ yoksa son yanıtlayan bot sürdürür. Her bot kendi modelini, çalışma alanını ve belleğini kullanır.",
  /** Silinen bir botun bıraktığı yanıtlarda görünen ad */
  removedBot: "Silinmiş bot",
  working: "{name} yanıtlıyor…",
  noMessages: "Henüz mesaj yok",
  sheet: {
    newTitle: "Yeni grup sohbeti",
    editTitle: "Grup adı ve üyeler",
    name: "Ad",
    namePlaceholder: "Üye adları kullanılsın diye boş bırak",
    members: "Üyeler",
    membersHint: "En az iki bot seç",
    create: "Oluştur",
    save: "Kaydet",
  },
  delete: {
    title: "“{name}” silinsin mi?",
    body: "Grup sohbeti ve mesajları kalıcı olarak silinir. Botlar ve onlarla birebir sohbetler etkilenmez.",
    confirm: "Kalıcı olarak sil",
  },
};
