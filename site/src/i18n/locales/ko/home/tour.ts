export default {
  "title": "okbot 데모",
  "note": "애니메이션으로 보는 사용 흐름입니다. 화면은 예시입니다.",
  "prev": "이전 단계",
  "next": "다음 단계",
  "steps": "데모 단계",
  "scenes": [
    {
      "title": "다운로드 및 설치",
      "caption": "운영체제(Windows, macOS, Linux)에 맞는 설치 파일을 받거나 Docker 명령 하나로 서버에서 실행하세요."
    },
    {
      "title": "okinto 로그인",
      "caption": "처음 실행할 때 브라우저에서 okinto에 한 번 로그인하면 자동으로 연결됩니다. Docker나 원격 환경에서는 로그인 후의 링크를 붙여 넣으면 됩니다."
    },
    {
      "title": "기본 모델 선택",
      "caption": "계정에서 사용할 수 있는 모델이 표시됩니다. 기본 모델을 고르고 대화 중 언제든 바꾸세요."
    },
    {
      "title": "봇 만들기",
      "caption": "이름과 몇 줄의 역할 설명으로 하는 일과 말투를 정하세요. 아바타는 마음에 드는 것으로 고르면 됩니다. 템플릿은 출발점일 뿐입니다."
    },
    {
      "title": "대화하고 언제든 모델 바꾸기",
      "caption": "답변은 실시간으로 표시되고 중지할 수 있습니다. 입력창의 모델을 눌러 변경하세요."
    },
    {
      "title": "작업 맡기기",
      "caption": "파일을 읽고 쓰고 명령을 실행합니다. 작업 공간 밖의 작업은 대화에서 승인할 때까지 기다립니다."
    },
    {
      "title": "채팅 앱에서도 만나기",
      "caption": "한 번 연결하면 Slack, Telegram, Discord에서도 같은 기억을 가진 같은 봇과 대화할 수 있습니다."
    }
  ],
  "ui": {
    "installing": "okbot 설치 중…",
    "slogan": "어떤 모델이든, 하나의 도우미로",
    "login": "okinto 로그인 / 회원가입",
    "loginWait": "브라우저에서 로그인을 마치면 여기로 돌아옵니다",
    "loginReopen": "로그인 페이지 다시 열기 ↗",
    "loginCopy": "링크 복사",
    "loginCancel": "취소",
    "authTitle": "okbot의 계정 사용 허용",
    "authSub": "이 컴퓨터에 okbot 전용 키를 만듭니다.",
    "authBtn": "허용하고 돌아가기",
    "connected": "연결됨 · 모델 {n}개 발견",
    "pickHint": "기본 모델을 선택하세요. 대화 중 언제든 변경할 수 있습니다.",
    "filter": "모델 검색",
    "start": "대화 시작",
    "newBot": "새 봇",
    "creating": "만드는 중…",
    "noChat": "아직 대화가 없습니다",
    "newFirst": "첫 번째 봇 만들기",
    "botName": "이름",
    "botNamePh": "예: 그룹 대화 요약",
    "botNameValue": "코딩 도우미",
    "botPersona": "역할",
    "botPersonaPh": "예: 당신은 유능한 도우미입니다. 간결하고 정확하게 답변하세요.",
    "botPersonaValue": "당신은 코딩 도우미입니다. 작업 공간의 코드를 읽고 수정하며 문제 해결을 위한 스크립트를 작성하세요.",
    "create": "만들기",
    "templates": "템플릿으로 시작",
    "tpls": [
      {
        "name": "그룹 대화 요약",
        "desc": "그룹 대화를 일일 요약으로 정리"
      },
      {
        "name": "고객 지원 도우미",
        "desc": "문서에 따라 답하고 확실하지 않으면 담당자에게 연결"
      },
      {
        "name": "코딩 도우미",
        "desc": "코드를 읽고 스크립트를 작성하며 작업 공간 수정"
      }
    ],
    "search": "검색",
    "today": "오늘 21:08",
    "thinking": "생각 중…",
    "working": "작업 중…",
    "took": "{s} 동안 작업함",
    "input": "{name}에게 메시지 · /로 명령어 보기",
    "perm": "작업 공간: 쓰기",
    "pickerSearch": "검색하거나 모델 ID 입력",
    "switched": "{model}(으)로 변경됨",
    "chatUser": "이 함수에서 왜 범위를 벗어나지?",
    "chatReply": "반복문이 <=를 사용해 마지막에 arr[len]을 읽습니다. <로 바꾸면 됩니다. 아래에 수정한 코드를 적었어요.",
    "task": "다운로드 폴더의 청구서를 경비 폴더로 정리해 줘.",
    "approvalMeta": "승인이 필요합니다",
    "allowOnce": "한 번 허용",
    "deny": "거부",
    "allowed": "허용됨",
    "fileSub": "작업 공간에 저장됨",
    "channelOk": "{im} · 연결됨",
    "channelSub": "한 번 연결하면 이 봇에게 메시지가 바로 전달됩니다",
    "imFrom": "Slack",
    "imUser": "오늘 요약 준비됐어?",
    "imReply": "네. 결정 사항 3개, 할 일 2개를 정리하고 기억에 저장했어요."
  }
};
