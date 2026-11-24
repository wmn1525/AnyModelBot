import type { TranslatedCatalog } from "../../index.js";
export default {
  err_notAllowed: "이 위치는 선택할 수 없습니다. 구체적인 프로젝트 폴더를 선택하세요.",
  err_unavailable: "이 폴더에 접근할 수 없습니다. 다시 선택하세요.",
  err_system: "시스템이 이 폴더에 대한 접근을 막았습니다. 접근 권한을 확인한 뒤 다시 시도하세요.",
  err_desktopOnly: "봇이 실행 중인 컴퓨터의 데스크톱 앱에서 폴더를 선택하세요.",
  err_changed: "보내기 조건이 바뀌었습니다. 확인한 뒤 다시 시도하세요.",
  promptFolderGone: "[이 메시지에 연결된 작업 폴더 \"{name}\"를 지금 사용할 수 없습니다({reason}). 다른 위치의 같은 이름 파일을 읽거나 쓰거나 다른 폴더로 바꾸지 말고, 이번 턴에는 파일을 수정하지 마세요. 폴더를 더 이상 사용할 수 없으니 다시 선택해 달라고 사용자에게 알리세요]",
  reasonUnavailable: "없어졌거나 바뀌었거나 폴더가 아닙니다",
  reasonSystem: "시스템이 접근을 허용하지 않습니다",
  reasonNotAllowed: "이 위치는 작업 폴더로 쓸 수 없습니다",
} satisfies TranslatedCatalog["folders"];
