# 데이터와 개인정보

[简体中文](./privacy.md) | [English](./privacy_en.md) | [日本語](./privacy_ja.md) | 한국어 | [Русский](./privacy_ru.md)

**핵심:** 대화, 기억, 파일, 키는 내 기기에 저장됩니다. 모델에 보내는 내용은 선택한 모델 제공업체로 전달됩니다. 공식 API 키는 직접, 그 외에는 Modelflare를 거칩니다. 데이터에 위험이 전혀 없다고 주장하지 않습니다. 모델에 전송한 정보는 기기를 벗어납니다.

이 문서는 AnyModelBot이 무엇을 어디에 저장하고, 무엇이 기기 외부로 나가며, 어떻게 삭제하는지 설명합니다. 문의: [support@anymodel.bot](mailto:support@anymodel.bot).

## 데이터 폴더

| 실행 방식 | 데이터 폴더 |
| :--- | :--- |
| 데스크톱 · Windows | `%APPDATA%\anymodel bot\data` |
| 데스크톱 · macOS | `~/Library/Application Support/anymodel bot/data` |
| 데스크톱 · Linux | `~/.config/anymodel bot/data` |
| 명령줄 `npm start` | `./data`(`AMB_DATA_DIR`로 변경) |
| Docker | 컨테이너 내부 `/data`(README 예시에서는 `amb-data` 볼륨으로 마운트) |

## 데이터 목록

| 데이터 | 저장 위치(데이터 폴더 내부) | 기기 외부 전송 여부 | 전송 대상 |
| :--- | :--- | :--- | :--- |
| 대화와 세션 | `anymodel.db`(SQLite) | 답변에 필요한 부분 | 모델 컨텍스트로 Modelflare를 거쳐 선택한 제공업체에 전달 |
| 가져온 스킬 | `skills/<봇 ID>/`, 활성화 사본은 `dsh/<봇 ID>/skills/` | 이름, 설명, 사용 중 읽은 본문과 자료는 전송 | 선택한 모델의 문맥. 가져오기는 사용 중인 AnyModelBot 인스턴스로만 전송하며 GitHub에 접속하지 않습니다 |
| 대화 검색 색인 | `anymodel.db`의 `message_search` 및 전문 검색 색인 | 아니요 | 인스턴스 안에 저장된 메시지를 검색하며 모델을 호출하지 않습니다 |
| 기억 | `memory/`(Markdown: `bots/`, `groups/`, `team/`) | 사용 시 | 모델 요청의 컨텍스트에 포함. 비밀 정보로 보이는 내용은 기록 전에 제외 |
| 봇 작업 공간 파일 | `workspaces/<bot>/`(받은 파일 `inbox/`, 생성한 이미지·동영상 `media/` 포함) | 봇이 읽어 모델에 보낼 때 | 위와 동일 |
| Modelflare 로그인 정보 | `modelflare-account.json`(권한 600, 데스크톱 앱은 시스템 키체인으로 암호화) | 토큰 갱신 시 modelflare.dev로만 | Modelflare |
| API 키 | `magpie/config/`의 격리된 게이트웨이 설정 | 모든 모델 요청에서 Modelflare 인증용으로 | Modelflare |
| 공식 API 키(입력한 경우) | `magpie/config/`의 격리된 게이트웨이 설정 | 모든 모델 요청에서 해당 제공업체 인증용으로 | 해당 모델 제공업체 |
| WeChat 로그인 상태와 동기화 커서 | 데이터 폴더 내부(`weixin/` 등) | WeChat iLink API와 통신할 때 | Tencent WeChat |
| Feishu 채팅 계정의 App ID / Secret | `anymodel.db` | Feishu Open Platform에 지속 연결할 때 | Feishu |
| Telegram, Slack, Discord 토큰 | `anymodel.db` | 해당 플랫폼과 통신할 때 | 연결한 플랫폼 |
| 허용 목록과 접근 요청 | `anymodel.db`: 채널 계정별 사용 허용 대상, 낯선 사람이 보낸 첫 메시지(신원 확인용으로 일부만 저장) | 아니요 | — |
| 전송 대기 중인 답변 | `anymodel.db` 보낼 편지함: 미전송 내용과 사유. 상대방이 다시 메시지를 보낼 때까지 보류된 WeChat 메시지 포함(최대 7일 보관, 전송된 항목은 7일 후, 전달 불가 항목은 30일 후 삭제) | 전송 시 | WeChat / Feishu |
| 백그라운드 작업과 규칙 | `anymodel.db`(작업·규칙·실행 기록, 30일 보관). `workspaces/<bot>/tasks/`의 작업 폴더는 30일 미사용 시 삭제(‘내 확인 필요’에서 먼저 안내). `dsh/<bot>/sessions/`의 세션 파일은 작업과 함께 삭제 | 실행 중 | 대화와 동일: 모델 요청의 컨텍스트로 Modelflare를 거쳐 선택한 제공업체에 전달 |
| 설정 | `config.json` | 아니요 | — |
| 로그 | `logs/app.log`(크기에 따라 순환) | 아니요. ‘진단 정보 복사’는 사용자가 직접 복사하며 키는 `***`로 대체 | — |
| 연결한 계정의 토큰(Notion, Feishu, 추가한 경우에만) | `anymodel.db`, 모든 봇이 공유 | 봇이 읽거나 쓸 때 해당 서비스에 인증 정보로 전송 | Notion, Feishu |
| 봇이 읽은 Notion 내용과 Feishu 메시지 | 별도로 저장하지 않으며 대화에 포함되면 대화와 함께 저장 | 예 | 모델 요청 컨텍스트로 Modelflare를 거쳐 선택한 제공업체에 전달 |
| 스크린샷(컴퓨터 사용) | 장기 보관하지 않음 | 예 | 모델 요청의 일부로 Modelflare를 거쳐 비전 지원 모델에 전달. 파일로 요청한 경우가 아니면 WeChat이나 Feishu 대화에 전달하지 않음 |

## 로컬 콘솔 접근 제어

- 콘솔은 기본적으로 `127.0.0.1:3600`에서 수신 대기하며 네트워크나 인터넷에서 접근할 수 없습니다.
- 데스크톱 앱은 실행할 때마다 임의 접근 토큰을 생성하여 다른 로컬 프로그램이 관리 API를 직접 호출하지 못하게 합니다.
- 루프백이 아닌 주소(예: Docker의 `0.0.0.0`)에서 수신 대기할 때는 토큰이 필수입니다. 토큰은 데이터 폴더의 `ui-token`에 있습니다(Docker: `docker exec amb cat /data/ui-token`).
- 3600 포트를 인터넷에 직접 노출하지 마세요. 원격 접근에는 직접 관리하는 VPN이나 인증 기능이 있는 리버스 프록시를 사용하세요.

## Modelflare 로그인

- 로그인은 RFC 8252의 네이티브 앱 방식에 따라 PKCE(RFC 7636)를 사용하는 OIDC 인증 코드 흐름으로 진행합니다. AnyModelBot은 클라이언트 비밀 값이 없는 공개 클라이언트이며 인증 결과는 임시 루프백 포트로 전달됩니다.
- 로그인은 modelflare.dev에서 진행합니다. AnyModelBot은 Modelflare 비밀번호를 보지 못합니다.
- Modelflare 프로필의 인증된 앱에서 언제든 이 기기의 권한을 취소할 수 있습니다. 앱에서 로그아웃해도 권한을 취소하고 이 기기와 봇에 발급한 키를 삭제합니다.

## 모델 요청과 Modelflare

- 모델 요청은 내장 magpie 게이트웨이에서 Modelflare로 전달되고, Modelflare가 선택한 제공업체로 전달합니다.
- 요청에는 답변에 필요한 프롬프트, 대화 맥락, 사용 중인 기억, 파일 내용, 도구 결과와 컴퓨터 사용 시의 스크린샷이 포함됩니다.
- Modelflare가 요청 출처를 식별하도록 `X-Modelflare-Skill: anymodel-bot/<version>` 헤더를 보냅니다. 앱에서 여는 Modelflare 링크에는 `utm_source=anymodelbot`이 포함됩니다. 앱에서 충전 페이지를 열 때 URL의 `#` 뒤에 로그인 시 ID 토큰의 계정 식별자(`#amb_account=…`, 비밀 정보 아님)를 붙여 Modelflare 페이지가 브라우저에 같은 계정으로 로그인되어 있는지 확인합니다. `#` 뒤의 내용은 서버, CDN, 분석 스크립트로 전송되지 않습니다. ‘키 구성 변경’ 안내는 기기에서 임의의 솔트로 키의 HMAC을 계산해 비교할 뿐, 키나 그 요약을 저장하거나 전송하지 않습니다.
- Modelflare는 요청 로그를 보관합니다. 항목과 기간은 [Modelflare 신뢰 센터](https://modelflare.dev/trust?utm_source=anymodelbot&utm_campaign=amb_readme)를 확인하세요. 각 모델 제공업체의 데이터 처리는 자체 약관을 따릅니다.

## 내 공식 API 키 사용

- 시작 화면이나 설정 → 모델에서 OpenAI, Anthropic 등의 공식 키를 입력하면 해당 제공업체의 모델 요청은 내장 게이트웨이에서 바로 전송되며 Modelflare를 거치지 않고 `X-Modelflare-Skill` 헤더도 붙지 않습니다. 내용 보관은 해당 제공업체의 약관을 따릅니다.
- 제공업체 주소는 앱에 고정되어 있어 화면이나 API에서 바꿀 수 없으므로 키가 다른 곳으로 전송되지 않습니다. 키는 게이트웨이의 격리된 설정(권한 600)에만 저장되고 로그나 명령줄 인수에 남지 않으며, 화면에는 마지막 4자만 표시됩니다.
- 공식 키만 쓰고 로그인하지 않으면 앱은 Modelflare의 계정 데이터와 가격 목록을 읽지 않습니다. 키를 입력할 때 확인을 위해 모델 목록을 한 번 읽고, 이후 목록을 최신으로 유지하려고 1시간마다 읽습니다.
- 내장 게이트웨이는 공개 모델 목록(컨텍스트 길이, 참고 가격)을 `models.dev`에서 읽습니다. 이 요청은 다운로드만 하며 키나 대화 내용을 포함하지 않습니다.
- 이미지·동영상 생성은 Modelflare로만 사용할 수 있습니다.

## 텔레메트리

- 내장 컴퓨터 사용 드라이버(Cua Driver)의 텔레메트리는 `CUA_TELEMETRY_ENABLED=0`과 `CUA_DRIVER_RS_TELEMETRY_ENABLED=0`으로 비활성화합니다.
- 내장 magpie 게이트웨이는 자동 업데이트와 계정 검색을 끄고 실행하며 컴퓨터에 있는 다른 AI 도구의 인증 정보를 읽지 않습니다.
- AnyModelBot 자체 코드(`src`, `electron`, `ui`, `scripts`, `dsh-runtime/plugins`)에는 분석이나 텔레메트리 전송이 없습니다. telemetry, analytics, sentry, posthog, mixpanel을 검색하면 위의 Cua 환경 변수 두 개만 검색됩니다.
- 포함된 제3자 구성 요소는 각 문서에 설명된 대로 작동하며 여기서 별도로 보장하지 않습니다.

## 앱의 다른 네트워크 요청

모델 요청 외에 다음 작업을 위해 네트워크에 접속합니다.

- Modelflare 모델 목록, 잔액, 사용량, 알림 조회(modelflare.dev의 계정 데이터).
- 이미지나 동영상 생성 시 docs.modelflare.dev에서 모델 요청 형식 조회.
- WeChat 채널: `ilinkai.weixin.qq.com`과 통신하고 WeChat CDN에서 보낸 이미지와 파일 다운로드.
- Feishu 채널: Feishu Open Platform과 지속 연결 유지.
- Telegram, Slack, Discord 채널: 연결 후 `api.telegram.org`, `slack.com`, `discord.com` 및 파일 호스트와 통신해 메시지와 첨부 파일 송수신.
- Windows에서 에이전트 모드가 켜져 있고 사용 가능한 PowerShell 7이 없으면 Microsoft 공식 릴리스 위치에서 PowerShell 7 다운로드(`AMB_PWSH_AUTO_INSTALL=0`으로 끌 수 있음, [개발 안내](./development_ko.md) 참조).
- 데스크톱 설치 버전은 시작 후와 6시간마다 GitHub에서 업데이트를 확인하고 기본적으로 업데이트 파일을 백그라운드에서 내려받습니다. 설정 → 일반에서 자동 다운로드를 끌 수 있습니다. 요청에는 계정 인증 정보나 대화 내용이 포함되지 않습니다. 설치하려면 ‘재시작하여 업데이트’를 클릭해야 하며 실행 중인 작업이 없어야 합니다.
- 아직 설치하지 않은 새 버전의 ‘업데이트 내용’을 열면 해당 버전의 변경 내역을 GitHub(`raw.githubusercontent.com`)에서 읽어 옵니다. 열 때만 요청하며 계정 인증 정보나 대화 내용은 포함하지 않습니다. 설치된 버전의 변경 내역은 앱에 포함되어 있어 네트워크를 쓰지 않습니다.
- `AMB_CATALOG_URL`을 직접 설정해 원격 봇 목록을 사용할 때만 목록과 필요한 패키지를 내려받고 서명과 해시를 검증합니다. 사용자 데이터는 업로드하지 않습니다. 기본 공식 봇 목록, 화면, 예시 데이터와 스킬은 앱에 포함되어 있어 열거나 설치할 때 이러한 네트워크 요청이 발생하지 않습니다.

## 컴퓨터 사용과 스크린샷

- 화면을 읽을 때 스크린샷을 캡처하고 모델 요청의 일부로 비전 지원 모델에 보냅니다.
- 컴퓨터 사용은 기본적으로 자동 실행됩니다. 봇 설정 → 컴퓨터 사용에서 ‘화면 변경 전에 확인’으로 바꿀 수 있으며 화면 읽기는 계속 자동으로 진행합니다.
- 읽기 전용 권한의 봇에는 읽기 도구만 제공됩니다.

## 채널

- WeChat, Feishu, Telegram, Slack, Discord에서 봇과 주고받은 메시지는 해당 플랫폼의 서버를 거치며 각 개인정보 처리방침을 따릅니다.
- 기본적으로 소유자와 허용한 사람만 봇과 대화할 수 있습니다. 다른 사람의 메시지는 모델에 전달하지 않고 접근 요청으로만 기록합니다([개발 안내](./development_ko.md#봇을-사용할-수-있는-사람) 참조).

## 데이터 삭제

1. AnyModelBot을 종료하세요(트레이 메뉴 → 종료).
2. 위 표의 데이터 폴더를 삭제하세요. Docker: `docker rm -f amb && docker volume rm amb-data`.
3. Modelflare 프로필의 인증된 앱에서 AnyModelBot의 권한을 취소하세요.
4. 필요하면 Feishu Open Platform에서 만든 앱(QR 코드로 만든 앱 포함)을 비활성화하고, WeChat 봇 연결을 해제하며, Telegram(@BotFather)·Slack·Discord에서 만든 봇을 삭제하세요. Notion에서도 AnyModelBot 연결을 끊고 생성한 토큰을 삭제하세요.
