export default {
  "warn": "3600 포트를 인터넷에 직접 노출하지 마세요.",
  "win": "Windows용 다운로드",
  "mac": "macOS용 다운로드",
  "linux": "Linux용 다운로드",
  "mobile": "채팅 앱에서 사용하기",
  "generic": "다운로드",
  "more": "다른 플랫폼",
  "items": {
    "win-x64": "Windows 설치 파일(NSIS)",
    "mac-arm64": "macOS Apple silicon용",
    "mac-x64": "macOS Intel",
    "linux-x64": "Linux AppImage",
    "docker": "Docker 명령",
    "changelog": "변경 내역"
  },
  "platform": {
    "win-x64": "Windows",
    "mac-arm64": "macOS",
    "mac-x64": "macOS",
    "linux-x64": "Linux"
  },
  "arch": {
    "win-x64": "x64",
    "mac-arm64": "Apple silicon",
    "mac-x64": "Intel",
    "linux-x64": "x64 · AppImage"
  },
  "meta": "버전 {version} · 게시일 {publishedAt}",
  "sha": "SHA-256",
  "started": "다운로드를 시작했습니다. 브라우저의 다운로드 목록을 확인하세요.",
  "downloading": "다운로드 중…",
  "macNote": "macOS의 컴퓨터 사용 기능은 베타입니다. 직접 실행 모드는 더 많은 실제 기기에서 테스트가 필요합니다. ‘손쉬운 사용’과 ‘화면 기록’ 권한은 봇이 처음 필요로 할 때만 요청합니다. 나머지 기능은 Windows 및 Linux와 동일합니다.",
  "linuxHint": "chmod +x anymodel-bot-*.AppImage && ./anymodel-bot-*.AppImage",
  "winHint": "Windows 경고가 나타나면 ‘추가 정보’를 누른 뒤 ‘실행’을 선택하세요.",
  "macHint": "Developer ID 서명과 Apple 공증을 완료했습니다. 응용 프로그램 폴더로 옮겨 실행하고 다운로드 확인이 나타나면 ‘열기’를 선택하세요.",
  "firstRun": "첫 실행",
  "yourSystem": "현재 시스템",
  "verifyTitle": "다운로드 검증",
  "verifyLead": "운영체제에 맞는 명령을 실행하고 SHA-256을 여기 표시된 값과 비교하세요. 일치하면 파일이 온전한 것입니다.",
  "verifyUnixLabel": "macOS / Linux",
  "verifyWin": "Get-FileHash .\\<file> -Algorithm SHA256",
  "verifyUnix": "shasum -a 256 <file>",
  "pageTitle": "AnyModelBot 다운로드",
  "pageLead": "무료 오픈 소스입니다. 앱 자체는 가입이 필요 없으며 처음 실행할 때 Modelflare에 로그인하면 준비가 끝납니다.",
  "pageDescription": "Windows, macOS, Linux, Docker용 AnyModelBot을 다운로드하세요. 무료 오픈 소스, 사용한 만큼 결제.",
  "altTitle": "다른 실행 방법",
  "dockerTitle": "Docker",
  "dockerSteps": {
    "run": "컨테이너 시작",
    "token": "접근 토큰 확인",
    "open": "브라우저에서 열기"
  },
  "dockerUrl": "http://<host>:3600/?token=<token>",
  "cliTitle": "명령줄(CLI)",
  "cliBody": "소스에서 실행합니다. Node.js 22.13 이상과 내장 게이트웨이 빌드를 위한 Go 1.26.8 이상이 필요합니다.",
  "cliSteps": {
    "clone": "저장소 복제",
    "setup": "의존성 설치 및 게이트웨이 빌드",
    "start": "시작 후 http://127.0.0.1:3600/ 열기"
  },
  "releases": "GitHub 릴리스",
  "changelog": "변경 내역"
};
