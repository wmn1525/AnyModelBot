import type { TranslatedCatalog } from "../../index.js";
export default {
  "addedChannel": "✓ 「わたしについて」に追加しました：{line}（「取り消し」と返信すると元に戻せます）",
  "changedChannel": "✓ 「わたしについて」を更新しました：{line}（「取り消し」と返信すると元に戻せます）",
  "removedChannel": "✓ 「わたしについて」から削除しました：{line}（「取り消し」と返信すると元に戻せます）",
  "undone": "取り消しました。「わたしについて」は元の状態に戻りました。",
  "empty": "文を入力してから保存してください",
  "tooLong": "1 行は 300 文字までです",
  "secret": "パスワード、キー、トークン、確認コードは保存できません",
  "idOrCard": "本人確認書類の番号や銀行カード番号は「わたしについて」に保存できません",
  "missing": "この行はもうありません",
  "stale": "この行はすでに変更されているため、この提案は無効です",
  "notUndoable": "この変更はもう取り消せません"
} satisfies TranslatedCatalog["aboutMe"];
