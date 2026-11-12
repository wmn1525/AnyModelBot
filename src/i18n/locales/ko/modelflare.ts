import type { TranslatedCatalog } from "../../index.js";
export default {
  "unreachable": "{host}에 연결할 수 없습니다({reason}). 네트워크를 확인하세요. 프록시나 VPN을 사용 중이라면 시스템 프록시 또는 TUN 모드를 켜고 다시 시도하세요",
  "timeout": "시간 초과",
  "invalid_key": "키가 올바르지 않거나 폐기되었습니다",
  "forbidden": "이 키로는 이 모델이나 그룹을 사용할 수 없습니다",
  "unavailable": "OKINTO New API를 일시적으로 사용할 수 없습니다(HTTP {status}){retry}",
  "retry_after": "; {s}초 후 재시도",
  "bad_models": "OKINTO New API가 반환한 모델 목록을 읽을 수 없습니다",

  "balance_failed": "잔액을 불러오지 못했습니다 (HTTP {status})",
  "bad_balance": "OKINTO New API 잔액 응답을 읽을 수 없습니다"
} satisfies TranslatedCatalog["modelflare"];
