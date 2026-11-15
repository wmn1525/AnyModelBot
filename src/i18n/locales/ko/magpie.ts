import type { TranslatedCatalog } from "../../index.js";
export default {
  "no_binary_cli": "magpie 실행 파일을 찾지 못했습니다. 먼저 npm run setup을 실행하세요",
  "no_binary": "magpie 실행 파일을 찾지 못했습니다(npm run setup으로 vendor/magpie에서 빌드하세요)",
  "unsupported_url": "지원하지 않는 Okinto New API 주소입니다",
  "missing_key": "API 키가 없습니다",
  "create_failed": "Okinto New API 연결을 만들지 못했습니다: {detail}",
  "not_running": "모델 게이트웨이가 실행 중이 아닙니다. 잠시 후 다시 시도하세요",
  "disconnect_failed": "연결 해제 실패: HTTP {status} {body}",
  "save_failed": "저장 실패: HTTP {status} {body}",
  "verify_failed": "저장 후 검증에 실패했습니다"
} satisfies TranslatedCatalog["magpie"];
