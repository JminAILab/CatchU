# U3 발행본 색인·검색 — 비기능 설계 질문

입력: [U3 비기능 요구사항](../nfr-requirements/)(성능·보안·규모·신뢰성·관측·기술 선택), [U3 기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-02·C-06·C-07·C-08·C-09, api의 현재 구성(`api/src/application.module.ts`, `api/src/ai-generation/guarded-fetch.ts`, `api/src/common/node-env.ts`).

이미 정해진 것(다시 묻지 않음): Voyage 호출 상한 네 가지(주소 코드 고정, `createGuardedFetch` 재사용으로 redirect 금지·본문 8 MiB, U3 호출부의 `AbortSignal.timeout`으로 문서 30초·질문 10초)와 재시도 0, 묶음 128개, 처리 시한 10분, 키 `CATCHU_EMBEDDING_API_KEY`와 개발·시험 밖 키 없음 기동 중지, 개발·시험에서 키 없을 때만 합성 제공자, 근사 색인 없는 정확 비교, 로그 칸과 로그에 넣지 않는 것(오류 응답 본문 포함), 회로 차단기·캐시·사본 없음, 새 런타임 의존성 없음. U2의 `AiRun`(C-02)과 U4의 발행본 표(C-07)는 아직 코드에 없어 합성 AiRun·시험 자료로 먼저 개발한다(기능 설계 「Assumptions & Open Questions」).

## Q1. [설계] U3 모듈을 api 앱에 등록할지

U3은 키가 없으면 기동을 멈추는 규칙(NFR1.3)이 있어, 앱이 뜰 때 U3을 만들면 개발 서버(EC2)에 `CATCHU_EMBEDDING_API_KEY`가 먼저 들어가 있어야 한다. 또 U3의 임베딩 처리기를 등록할 U2의 `AiRun`이 아직 없다. U1은 같은 사정으로 앱에 등록하지 않고 만들기 함수만 두었다(U1 비기능 설계 Q1).

A. U3 코드 PR에서는 api 앱 모듈에 등록하지 않는다. `api/src/published-index`에 구성 요소와 만들기 함수(키 확인 포함)만 두고 시험이 직접 만든다. 앱 등록(Nest 모듈·주입)과 `EMBED_PUBLICATION` 처리기 등록은 U2의 `AiRun`이 통합 브랜치에 들어온 뒤 U3 담당이 한다 — 앱 기동과 개발 서버 배포에 영향이 없다. 배포에 들어가는 것은 마이그레이션뿐이다.
B. Nest 모듈로 앱에 등록하고 기동 때 키를 확인한다. 처리기 등록만 `AiRun`이 들어온 뒤로 미룬다 — U4·U5가 주입 자리를 먼저 쓸 수 있지만, 팀장이 개발 서버에 키를 먼저 넣어야 U3을 합칠 수 있다(합치기 전 조율 1건 추가). 키가 없는 동안 개발 서버 api가 뜨지 않는다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 앱 등록(Q1): U3 코드 PR에서는 api 앱 모듈에 등록하지 않는다. `api/src/published-index`에 구성 요소와 만들기 함수(키 확인 포함)만 두고 시험이 직접 만든다. 앱 등록(Nest 모듈·주입)과 `EMBED_PUBLICATION` 처리기 등록은 U2의 `AiRun`이 통합 브랜치에 들어온 뒤 U3 담당이 한다. 앱 기동과 개발 서버 배포에는 영향이 없고, 배포에 들어가는 것은 마이그레이션뿐이다.
- 그 밖의 설계는 비기능 요구사항 그대로다: 호출 상한 네 가지(주소 고정, `createGuardedFetch`로 redirect 금지·본문 8 MiB, 호출부 `AbortSignal.timeout`으로 문서 30초·질문 10초)와 재시도 0, 묶음 128개, 처리 시한 10분, 키 없음 처리와 합성 제공자, 근사 색인 없는 정확 비교, 로그 칸과 로그에 넣지 않는 것, 회로 차단기·캐시·사본 없음, 새 런타임 의존성 없음.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
