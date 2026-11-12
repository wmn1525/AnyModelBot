export default {
  "aria": "{name}와의 대화",
  "infoPanel": "오른쪽 패널(⌘⇧I)",
  "newConvCmd": "새 대화(/new)",
  "toBottom": "맨 아래로 이동",
  "copyMessage": "메시지 복사",
  "commandsLabel": "명령어",
  "commands": {
    "stop": "처리 중인 메시지 중지",
    "tasks": "백그라운드 작업 목록 보기(/stop <number>로 개별 작업 중지)",
    "model": "모델 목록 보기 또는 변경",
    "new": "새 대화 시작(인계 메모와 함께 기존 대화 보관)",
    "reset": "이 대화의 컨텍스트 지우기",
    "status": "현재 모델, 모드, 진행 상황 보기",
    "help": "모든 명령어 보기"
  },
  "perm": {
    "menu": "파일 접근",
    "title": "파일 접근: {note}",
    "workspace": "작업 공간 쓰기",
    "workspaceNote": "이 봇의 작업 공간만 수정할 수 있으며 그 밖의 작업 전에는 확인합니다",
    "readonly": "읽기 전용",
    "readonlyNote": "파일을 수정할 수 없으며 명령은 읽기 전용 샌드박스에서 실행됩니다",
    "more": "권한 설정 더 보기…"
  },
  "approval": {
    "neededTask": "‘{title}’에 승인이 필요합니다 · {code}",
    "needed": "승인이 필요합니다 · {code}",
    "fallbackReason": "봇이 작업 공간 밖에서 작업하려고 합니다",
    "allowOnce": "한 번 허용",
    "deny": "거부"
  },
  "question": {
    "taskAsks": "‘{title}’의 질문",
    "otherOptional": "다른 답변(선택)",
    "yourAnswer": "답변 입력",
    "orOther": "또는 다른 답변 입력",
    "submit": "제출"
  },
  "file": {
    "open": "{name} 열기",
    "reveal": "폴더에서 보기",
    "gone": "파일을 찾을 수 없습니다"
  },
  "work": {
    "stopping": "중지 중…",
    "stoppingAfter": "{d} 경과 · 중지 중…",
    "process": "작업 내역",
    "done": "{d} 동안 작업함",
    "replying": "{d} 동안 답변 작성 중",
    "thinkingFor": "{d} 동안 생각 중",
    "thinking": "생각 중"
  },
  "error": {
    "stopFailed": "중지하지 못했습니다: {error}",
    "fixKey": "로그인",
    "fixOfficialKey": "키 변경",
    "officialKeyInvalid": "{name}에서 이 API 키를 거부했습니다. 유효하지 않거나 취소되었을 수 있습니다.",
    "authInvalid": "OKINTO New API 접근 권한이 만료되었거나 취소되었습니다. 다시 로그인하세요.",
    "loadHistory": "메시지 기록을 불러오지 못했습니다: {error}"
  },
  "menu": {
    "more": "추가 작업",
    "switchModel": "모델 변경…",
    "newConv": "새 대화",
    "reset": "컨텍스트 지우기",
    "status": "상태 보기",
    "allCommands": "모든 명령어"
  },
  "reset": {
    "title": "이 대화의 컨텍스트를 지울까요?",
    "body": "{name}이(가) 이 웹 대화의 내용을 잊게 됩니다. 장기 기억은 유지됩니다.",
    "confirm": "지우기"
  },
  "empty": {
    "guideTitle": "안녕하세요, 저는 {name}입니다",
    "guideBody": "5분 동안 시작 체크리스트를 따라 제가 할 수 있는 일을 살펴보세요.",
    "title": "{name}와 대화 시작",
    "body": "여기서 바로 봇을 사용해 보세요. 오른쪽 패널에서 WeChat, Feishu, Telegram, Slack, Discord를 연결할 수 있습니다.",
    "sample": "어떤 일을 도와줄 수 있어?",
    "helpChip": "/help로 명령어 보기"
  },
  "composer": {
    "steer": "작성 중인 답변에 요청 추가",
    "steerTitle": "작성 중인 답변에 요청 추가({key})",
    "stopping": "중지 중…",
    "placeholder": "{name}에게 메시지 보내기 · /를 입력하면 명령어 표시",
    "label": "메시지",
    "currentModel": "현재 모델: {model}",
    "pickModel": "모델 선택",
    "stop": "생성 중지(Esc)",
    "stopTitle": "중지(Esc)",
    "send": "보내기",
    "sendTitle": "보내기({key})"
  },
  "model": {
    "followBot": "봇 기본값 사용",
    "setDefault": "이 봇의 기본 모델로 설정"
  }
};
