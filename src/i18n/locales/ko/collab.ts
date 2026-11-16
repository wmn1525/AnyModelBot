import type { TranslatedCatalog } from "../../index.js";
export default {
  "msgPoints": "배경:",
  "msgFiles": "관련 파일:",
  "msgAskOnly": "작업은 필요 없어요. 답만 해 주세요.",
  "msgDoneWhen": "완료 기준: {criteria}",
  "msgRedo": "{issue}. 고쳐 주세요. (다시 하기 {n}/{limit})",
  "msgAdds": "사용자 추가 요청: {text}",
  "whyUser": "사용자가 멈추라고 했어요",
  "whyTimeout": "{limit}을 넘었어요",
  "whyBudget": "이 일에 {budget}을 다 썼어요",
  "whyError": "오류가 생겼어요: {reason}",
  "hours": {"other": "{count}시간"},
  "minutes": {"other": "{count}분"},
  "noText": "(설명 없음)",
  "fallbackReply": "{bot}의 메시지:\n\n{text}",
  "fallbackStopped": "{bot}이(가) 먼저 멈췄어요({why}). {text}",
  "droppedExpired": "{bot}이(가) 24시간 안에 시작하지 못해 이 일은 취소됐어요.",
  "droppedModel": "{bot}이(가) 사용자의 API 키 모델로 바뀌어서, 대기 중이던 이 일은 시작할 수 없어 취소했어요.",
  "deleted": "{bot}이(가) 삭제되어 이 일은 멈췄어요."
} satisfies TranslatedCatalog["collab"];
