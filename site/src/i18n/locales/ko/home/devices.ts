export default {
  "h2": "어디서든 불러 보세요.",
  "h2dim": "같은 봇, 같은 기억.",
  "lead": "데스크톱, Docker, 브라우저는 물론 휴대폰의 Slack, Telegram, Discord에서도.",
  "items": {
    "desktop": {
      "title": "데스크톱",
      "sub": "Windows · macOS · Linux",
      "body": "Windows, macOS, Linux에서 다운로드하고 바로 시작하세요.",
      "more": "전체 다운로드 및 체크섬 →"
    },
    "docker": {
      "title": "Docker",
      "sub": "NAS / 서버",
      "body": "NAS나 서버에서 항상 켜 두세요."
    },
    "browser": {
      "title": "브라우저",
      "body": "데스크톱 앱과 Docker에 로컬 웹 콘솔이 포함되어 있습니다.",
      "format": "로컬 / 자체 호스팅"
    }
  },
  "pick": "사용할 환경 선택",
  "groupChat": "채팅 앱",
  "thread": {
    "user": "내가 보통 몇 시에 일일 보고서를 보내지?",
    "bot": "매일 오후 5시예요. 지난주에 알려 주셨어요.",
    "memo": "오후 5시에 일일 보고",
    "memoLabel": "기억"
  },
  "chatBody": "연결하면 휴대폰에서도 작업을 보낼 수 있습니다. 봇을 실행하는 컴퓨터나 서버는 켜져 있고 인터넷에 연결되어 있어야 합니다.",
  "howTo": "설정 방법 보기",
  "guideTitle": "설정 안내",
  "note": "아직 별도의 iOS/Android 앱은 없습니다. 휴대폰에서는 Slack, Telegram, Discord로 대화하세요. 웹 콘솔은 로컬 또는 자체 호스팅 방식이며 클라우드 웹 앱이 아닙니다.",
  "browserGuide": {
    "title": "로컬 웹 콘솔",
    "steps": [
      "데스크톱: 트레이 메뉴 → 브라우저에서 열기. 콘솔은 127.0.0.1에서 수신 대기하며 실행할 때마다 임의 접근 토큰을 생성합니다.",
      "Docker: http://<host>:3600/?token=<token>을 여세요. 토큰은 docker exec amb cat /data/ui-token으로 확인합니다.",
      "3600 포트를 인터넷에 직접 노출하지 마세요."
    ]
  }
};
