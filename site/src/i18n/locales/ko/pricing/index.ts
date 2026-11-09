export default {
  "eyebrow": "요금 · 사용량 기반 결제",
  "h2mark": "월 이용료 없이",
  "h2rest": ", 쓴 만큼만 결제하세요.",
  "lead": "AnyModelBot은 무료 오픈 소스입니다. 구독도, 요금제 등급도 없습니다. 모델 사용량은 Modelflare에서 토큰 단위로 과금하며 전체 가격표가 공개되어 있습니다.",
  "source": "가격 출처: modelflare.dev/pricing · 수집 시각 {fetchedAt}(UTC+8) · 버전 {pricingVersion}.",
  "stale": "{snapshotDate} 기준 가격입니다(새로고침 실패. 최신 기준은 modelflare.dev/pricing입니다).",
  "cards": {
    "app": {
      "tag": "AnyModelBot",
      "price": "$0",
      "unit": "/ 영구",
      "note": "무료 오픈 소스(MIT)",
      "points": [
        "데스크톱, Docker, CLI 모두 무료",
        "구독이나 요금제 등급 없음",
        "원하는 만큼 봇을 만들고 각자의 역할을 직접 설정",
        "Modelflare 신규 가입 시 Bot 크레딧 $1 증정(AnyModelBot 전용)"
      ]
    },
    "usage": {
      "tag": "모델 사용량 · Modelflare 과금",
      "unit": "/ 입력 100만 토큰",
      "note": "예: {model}, 기본 경로, 출력 100만 토큰당 {output}; 공식 가격 {officialIn} / {officialOut}",
      "points": [
        "입력과 출력을 각각 토큰 단위로 과금",
        "공개된 가격표",
        "모델을 언제든 변경하고 해당 모델 가격 적용",
        "Modelflare 구독 시 플랜 크레딧의 10%를 Bot 크레딧으로 추가 증정"
      ],
      "cta": "전체 가격표 보기 ↗"
    },
    "month": {
      "tag": "한 달 사용 비용",
      "unit": "/ 월",
      "note": "예: 하루 메시지 50개, 각각 입력 3,000 + 출력 600토큰, {model}.",
      "points": [
        "아래 계산기에 내 사용량 입력",
        "캐시 할인과 특별 요청 배수는 예상 비용에 미포함",
        "최종 금액은 Modelflare 청구서 기준"
      ],
      "cta": "계산기 열기"
    }
  },
  "contrast": {
    "caption": "사용량 기반 결제와 등급별 구독 비교",
    "head": [
      "",
      "사용량 기반(AnyModelBot + Modelflare)",
      "등급별 구독(일반적 방식)"
    ],
    "rows": [
      [
        "과금 방식",
        "월 이용료 없이 사용한 만큼 결제",
        "월 이용료를 내고 등급에 따라 사용량 제한"
      ],
      [
        "사용하지 않은 부분",
        "고정 지출 없음",
        "월간 한도는 대개 이월되지 않음"
      ],
      [
        "모델 변경",
        "언제든 변경, 해당 모델 가격 적용",
        "대개 등급에 따라 모델 제한"
      ],
      [
        "가격 표시",
        "100만 토큰당 가격 공개",
        "제공량 대비 배수로 표시하는 경우가 많음"
      ]
    ],
    "note": "‘등급별 구독’은 월 구독형 제품의 일반적인 방식을 뜻하며 특정 제품이나 실제 가격을 가리키지 않습니다."
  },
  "table": {
    "more": "텍스트 모델 {textCount}개 전체 가격 보기 →",
    "caption": "Modelflare 텍스트 모델 가격(기본 경로, 100만 토큰당 USD)",
    "col": {
      "model": "모델",
      "route": "기본 경로",
      "input": "입력 / 100만",
      "output": "출력 / 100만",
      "official": "공식 가격(입력 / 출력)",
      "vs": "공식 가격 대비"
    },
    "default": "기본",
    "context": "컨텍스트 {n}",
    "showAll": "텍스트 모델 {textCount}개 모두 표시",
    "showFeatured": "주요 모델만",
    "search": "모델 검색",
    "allVendors": "모든 제공업체",
    "media": "이미지 및 동영상 모델 {mediaCount}개는 modelflare.dev/pricing에서 확인하세요 ↗",
    "expand": "{model}의 모든 경로 표시",
    "detail": {
      "route": "경로",
      "positioning": "특성",
      "vs": "공식 가격 대비",
      "price": "입력 / 출력"
    },
    "positioning": {
      "stable": "안정성 우선 경로",
      "award": "가격 우선 경로",
      "campaign": "기간 한정 경로",
      "enterprise": "안정성 우선 경로(승인된 기업 운영 환경 전용)",
      "other": "기타 경로"
    },
    "unlock": "한 번에 US${amount} 충전 시 사용 가능(기간 한정, Modelflare 규정 적용)",
    "tiers": "단일 요청이 {n}토큰을 초과하면 긴 컨텍스트 요금이 적용됩니다: 입력 {input} · 출력 {output}",
    "none": "일치하는 모델이 없습니다.",
    "note": "기본 경로의 100만 토큰당 USD 가격입니다. Modelflare 안내에 따라 계정별 접근 권한이나 할인은 다를 수 있습니다. 출처: modelflare.dev/pricing · 수집 시각 {fetchedAt}(UTC+8) · 버전 {pricingVersion}."
  },
  "calc": {
    "title": "월간 비용 예상하기",
    "model": "모델",
    "search": "입력하여 모델 검색",
    "none": "일치하는 모델이 없습니다.",
    "route": "경로",
    "routeDefault": "기본 경로",
    "routeAward": "가격 우선 경로(award)",
    "routeAwardNote": "재시도 가능한 개발 및 테스트에 적합",
    "msgs": "하루 메시지 수",
    "inTok": "메시지당 입력 토큰",
    "inTokNote": "대화 기록과 도구 결과 포함",
    "outTok": "메시지당 출력 토큰",
    "days": "30일 기준 예상",
    "presets": {
      "light": "가볍게",
      "everyday": "일상 사용",
      "heavy": "집중 사용(에이전트)"
    },
    "hint": "메시지 하나는 봇의 답변 하나에 사용된 모든 모델 호출을 뜻합니다. 에이전트 작업에는 여러 번의 호출이 포함될 수 있습니다.",
    "result": "월 약 {amount}",
    "split": "입력 {input} · 출력 {output}",
    "perMsg": "메시지당 약 {amount}",
    "official": "공식 가격 기준 약 {amount}",
    "disclaimer": "예상치입니다. 캐시 할인과 요청별 배수(예: 우선 서비스 등급)는 제외됩니다. 모델의 구간 기준을 초과하는 요청에는 상위 구간 가격이 적용되며 계산에 반영됩니다. 최종 금액은 Modelflare 청구서 기준입니다.",
    "copy": "예상 비용 복사",
    "copyText": "AnyModelBot 예상 사용 비용: {model}({route}), 하루 메시지 {msgs}개, 각각 입력 {inTok} + 출력 {outTok}토큰 — 월 약 {amount}(30일 기준, 가격 수집 시각 {fetchedAt})",
    "full": "이 모델의 전체 가격 보기 ↗",
    "expandBar": "세부 정보"
  },
  "banner": {
    "text": "이미 Modelflare 계정이 있나요? 앱에서 한 번 로그인하면 바로 시작할 수 있습니다. 사용량은 가격표에 따라 과금됩니다.",
    "cta": "Modelflare 열기 ↗"
  },
  "pageTitle": "AnyModelBot 요금 — 사용량 기반 결제, 공개 가격표",
  "pageDescription": "AnyModelBot은 구독 없는 무료 오픈 소스입니다. 모델 사용량은 Modelflare에서 토큰 단위로 과금합니다. 공개 가격표와 월간 비용 계산기를 확인하세요."
};
