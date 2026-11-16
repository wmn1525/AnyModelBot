export default {
  "status": "상태",
  "checks": "테스트",
  "version": "버전",
  "dataDir": "데이터 폴더",
  "copyPath": "경로 복사",
  "logFile": "로그 파일",
  "logFileSub": "크기에 따라 순환하며 최근 파일 4개를 유지합니다",
  "logFileOff": "사용 안 함",
  "test": "테스트",
  "testing": "테스트 중…",
  "model": "모델: {model}",
  "none": "(없음)",
  "copyReport": "진단 정보 복사",
  "copied": "진단 정보를 복사했습니다(키 제외)",
  "note": "복사한 진단 정보에는 위 상태, 최근 테스트 결과, 로그가 포함됩니다. API 키, 토큰 등 비밀 정보는 ***로 대체되므로 지원팀에 바로 보낼 수 있습니다.",
  "community": "해결되지 않으면 커뮤니티에 물어보세요",
  "secs": "{s}초",
  "restarts": {
    "other": "{count}회 다시 시작함"
  },
  "lastExit": "마지막 종료 코드={code}{signal}",
  "verdict": {
    "ok": "정상",
    "bad": "문제 발견"
  },
  "gateway": {
    "name": "모델 게이트웨이",
    "fromEnv": "{env}로 설정됨",
    "running": "실행 중",
    "starting": "시작 중",
    "restarting": "다시 시작 중",
    "failed": "실패",
    "stopped": "중지됨",
    "external": "외부 엔드포인트"
  },
  "agent": {
    "name": "에이전트 프로세스",
    "nameFor": "에이전트 프로세스 · {bot}",
    "noRuntime": "에이전트 런타임(DSH)을 찾을 수 없어 봇은 대화만 가능합니다",
    "disabled": "에이전트 모드가 꺼져 있어 봇은 대화만 가능합니다",
    "startsOnFirst": "첫 메시지가 도착하면 시작합니다",
    "stderr": {
      "other": "에이전트 프로세스 출력(stderr 마지막 {count}줄)"
    }
  },
  "host": {
    "running": "실행 중",
    "starting": "시작 중",
    "backoff": "재시도 대기 중",
    "error": "일시 중지됨",
    "stopped": "시작 전"
  },
  "hostSub": {
    "elapsed": "{time} 경과",
    "stage": "단계: {stage}",
    "firstStart": "처음 실행할 때는 몇 분이 걸릴 수 있습니다(백신이 런타임 파일을 하나씩 검사합니다)",
    "maxWait": {
      "other": "최대 {count}분 대기"
    },
    "initTime": "시작에 {time} 소요",
    "activeTurns": {
      "other": "대화 {count}건 진행 중"
    },
    "retryIn": {
      "other": "{count}분 후 자동으로 재시도합니다. 아래의 ‘에이전트 프로세스 다시 시작’을 눌러도 됩니다"
    }
  },
  "init": {
    "prepare": "준비 중",
    "bridgeReady": "모델 브리지 준비 완료",
    "sdkLoaded": "런타임 로딩 중",
    "patchWritten": "설정 작성 중",
    "childSpawned": "프로세스 시작됨",
    "initializing": "초기화 중(플러그인 로딩)"
  },
  "stage": {
    "ok": "통과",
    "warn": "경고",
    "fail": "실패",
    "timeout": "시간 초과",
    "skipped": "건너뜀",
    "pending": "진행 중"
  },
  "pwsh": {
    "checking": "확인 중",
    "checkingBusy": "확인 중…",
    "missing": "설치되지 않음",
    "looking": "PowerShell 7 찾는 중",
    "usedBy": "에이전트가 명령 실행에 사용합니다",
    "old": "이전 버전입니다. PowerShell 7을 설치하면 훨씬 빠르고 안정적으로 명령을 실행할 수 있습니다",
    "builtin": "에이전트가 내장 Windows PowerShell 5.1로 명령을 실행하고 있어 명령마다 20~30초가 걸릴 수 있습니다. PowerShell 7을 설치하면 훨씬 빠르고 안정적으로 실행할 수 있습니다",
    "recheck": "다시 확인",
    "install": "PowerShell 7 설치",
    "copyCmd": "설치 명령 복사",
    "download": "다운로드 ↗",
    "fallback": "{from}을(를) 시작하지 못해({reason}) 자동으로 교체했습니다",
    "unusable": "사용 불가",
    "notInstalled": "설치되지 않음",
    "usedByFrom": "에이전트가 명령 실행에 사용합니다({source})",
    "installingSub": "에이전트용 PowerShell 7을 설치하고 있습니다(관리자 권한 불필요). 설치 전까지는 Windows PowerShell 5.1을 계속 사용합니다",
    "badSub": "앱에서 관리하는 PowerShell 7을 사용할 수 없습니다: {reason}",
    "failedSub": "설치하지 못했습니다: {error}",
    "unknownReason": "알 수 없는 원인",
    "using51": "현재 에이전트는 Windows PowerShell 5.1을 사용합니다",
    "slow51": "에이전트가 Windows PowerShell 5.1을 사용하고 있어 명령마다 20~30초가 걸릴 수 있습니다",
    "slow51Advice": "에이전트가 Windows PowerShell 5.1을 사용하고 있어 명령마다 20~30초가 걸릴 수 있습니다. PowerShell 7은 훨씬 빠릅니다",
    "reinstall": "재설치",
    "installShort": "설치",
    "reinstallPrivate": "앱에서 관리하는 PowerShell 7 재설치",
    "useSystem": "시스템 기본값으로 전환",
    "useSystemNote": "앱에서 관리하는 PowerShell 7 사용 중단",
    "usePrivate": "앱에서 관리하는 PowerShell 7 사용",
    "installSelf": "PowerShell 7 직접 설치…",
    "more": "더 보기",
    "moreLabel": "PowerShell 추가 작업",
    "source": {
      "private": "앱에서 관리",
      "programFiles": "Program Files",
      "preview": "미리 보기"
    }
  },
  "testModel": {
    "name": "모델 테스트",
    "sub": "내장 게이트웨이와 엔드포인트 직접 연결로 최소 요청을 각각 한 번 보내 상태 코드, 지연 시간, 반환된 모델 이름을 비교합니다",
    "viaGateway": "내장 게이트웨이 경유",
    "direct": "엔드포인트 직접 연결"
  },
  "probe": {
    "untested": "테스트 전",
    "ok": "정상",
    "echoed": "반환된 모델 {model}",
    "reply": "응답 ‘{reply}’"
  },
  "testAgent": {
    "name": "에이전트 테스트",
    "sub": "에이전트 프로세스로 최소 대화 한 차례를 실행해 멈추는 지점을 확인합니다: 시작 → 플러그인 → 모델 → 응답. 대화 기록에는 저장되지 않습니다",
    "ok": "에이전트가 정상 작동합니다",
    "stuckAt": "멈춘 단계: {stage}",
    "bot": "봇: {name}",
    "total": "총 {time}"
  },
  "restart": {
    "name": "에이전트 프로세스 다시 시작",
    "sub": "답변이 계속 로딩될 때 사용하세요. 에이전트 프로세스를 중지하고 재시도 대기를 초기화합니다. 다음 메시지가 오면 다시 시작합니다",
    "button": "다시 시작",
    "restarting": "다시 시작하는 중…",
    "done": "에이전트 프로세스를 다시 시작했습니다",
    "notRunning": "아직 에이전트 프로세스가 시작되지 않았습니다. 다음 메시지가 오면 시작합니다"
  },
  "logs": {
    "title": "최근 로그",
    "lines": {
      "other": "{count}줄"
    },
    "empty": "(아직 로그가 없습니다)",
    "readFailed": "로그를 읽지 못했습니다: {error}"
  }
};
