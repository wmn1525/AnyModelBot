import type { TranslatedCatalog } from "../../index.js";
export default {
  "addedChannel": "✓ '내 정보'에 추가했어요: {line} ('취소'라고 답하면 되돌릴 수 있어요)",
  "changedChannel": "✓ '내 정보'를 수정했어요: {line} ('취소'라고 답하면 되돌릴 수 있어요)",
  "removedChannel": "✓ '내 정보'에서 삭제했어요: {line} ('취소'라고 답하면 되돌릴 수 있어요)",
  "undone": "취소했어요. '내 정보'가 원래대로 돌아갔어요.",
  "empty": "문장을 입력한 뒤 저장하세요",
  "tooLong": "한 줄은 최대 300자입니다",
  "secret": "비밀번호, 키, 토큰, 인증 코드는 저장할 수 없어요",
  "idOrCard": "신분증 번호와 은행 카드 번호는 '내 정보'에 저장할 수 없어요",
  "missing": "이 줄은 더 이상 없어요",
  "stale": "이 줄이 이미 바뀌어서 이 제안은 더 이상 유효하지 않아요",
  "notUndoable": "이 변경은 더 이상 취소할 수 없어요"
} satisfies TranslatedCatalog["aboutMe"];
