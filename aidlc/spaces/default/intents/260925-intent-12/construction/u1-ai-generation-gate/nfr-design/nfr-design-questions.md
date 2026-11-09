# U1 AI 생성 관문 최소 경로 — 비기능 설계 질문

입력: [U1 비기능 요구사항](../nfr-requirements/)(성능·보안·규모·신뢰성·관측·기술 선택), [U1 기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01, api의 현재 모듈 구성(`api/src/application.module.ts`).

이미 정해진 것(다시 묻지 않음): 호출 상한 네 가지(주소 고정·redirect 금지·본문 256 KiB·45초)와 재시도 0, 기본 출력 상한 4,000 토큰, 로그 칸, 키 이름과 키가 비었을 때 게이트 생성 거부, 회로 차단기·대체 모델·캐시 없음, U2가 붙기 전에는 시험 밖에서 `generate()`를 쓰지 않는다는 조건.

## Q1. [설계] 게이트를 api 앱에 등록할지

"U2가 붙기 전에는 시험 밖에서 `generate()`를 쓰지 않는다"는 조건을 코드 구조로도 지킬지 정한다. 키가 비었으면 게이트를 만들 때 멈추므로, 앱이 뜰 때 게이트를 만들면 키 없는 개발 환경에서 앱이 뜨지 않는다.

A. U1은 api 앱 모듈에 등록하지 않는다. AI 생성 공통 폴더에 게이트와 그것을 만드는 함수만 두고, 시험이 직접 만든다. 앱 등록(Nest 모듈·주입)은 U2가 방어 문구·입력 상한과 함께 한다 — 조건이 코드 구조로 지켜지고 앱 기동에 영향이 없다.
B. Nest 모듈로 등록하되 게이트는 처음 쓸 때 만든다 — U2·U5가 주입 자리를 먼저 볼 수 있지만, 아무 곳에서나 주입해 쓸 수 있게 되어 조건을 코드로 막지 못한다.
X. Other (please specify)

[Answer]: A

## Q2. [시험] 기록한 응답 시험이 바꿔 끼우는 지점

기능 설계 S1~S7·S9와 보안 요구사항(redirect·본문 상한·시간 초과)은 실제 Claude 없이 돌아야 한다.

A. HTTP 응답 수준에서 바꿔 끼운다: 게이트에 넘기는 fetch 자리에 시험용 fetch를 넣어 기록한 HTTP 응답(정상·잘림·거절·redirect·큰 본문·느린 응답)을 돌려준다. SDK의 응답 해석·전송 상한까지 한 방식으로 시험된다.
B. SDK 호출 수준에서 바꿔 끼운다: 해석된 응답 객체를 돌려주는 가짜 클라이언트를 넣는다 — 시험이 간단하지만 redirect·본문 상한·시간 초과는 따로 전송 시험을 둬야 한다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 앱 등록(Q1): U1은 api 앱 모듈에 등록하지 않는다. AI 생성 공통 폴더에 게이트와 그것을 만드는 함수만 두고 시험이 직접 만든다. Nest 등록·주입은 U2가 방어 문구·입력 상한과 함께 한다. 앱 기동에는 영향이 없다.
- 시험 지점(Q2): 기록한 응답 시험은 게이트에 넘기는 fetch 자리에 시험용 fetch를 넣어 기록한 HTTP 응답(정상·잘림·거절·redirect·큰 본문·느린 응답)을 돌려준다. SDK 응답 해석과 전송 상한까지 한 방식으로 시험한다.
- 그 밖의 설계는 비기능 요구사항 그대로다: 호출 상한 네 가지와 재시도 0, 기본 출력 상한 4,000 토큰, 로그 칸, 키 없으면 게이트 생성 거부, 회로 차단기·대체 모델·캐시 없음.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
