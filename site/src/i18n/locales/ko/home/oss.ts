export default {
  "facts": [
    {
      "text": "콘솔은 기본적으로 127.0.0.1에서 수신 대기하고 Host 헤더를 검사합니다. 로컬 접근에도 접근 토큰이 필요합니다.",
      "path": "src/web/server.ts"
    },
    {
      "text": "모델 키는 에이전트 프로세스에 전달되지 않습니다. 화면에는 끝 4자리만 표시합니다.",
      "path": "src/agent/bridge.ts · src/agent/host.ts"
    },
    {
      "text": "파일과 명령은 샌드박스 작업 공간에서 처리하며 범위 밖 작업에는 승인이 필요합니다. Linux에서는 명령을 bubblewrap 안에서만 실행해 데이터 폴더도 숨기며, 사용할 수 없으면 실행을 거부합니다.",
      "path": "src/agent/host.ts"
    },
    {
      "text": "기억에는 비밀번호, 키, 신분증 번호를 저장하지 않습니다.",
      "path": "src/agent/memory.ts"
    },
    {
      "text": "컴퓨터 사용 드라이버(Cua)의 텔레메트리 환경 변수를 0으로 설정하고 magpie의 자동 업데이트를 비활성화했습니다.",
      "path": "src/agent/cua-driver.ts · src/magpie/supervisor.ts"
    }
  ]
};
