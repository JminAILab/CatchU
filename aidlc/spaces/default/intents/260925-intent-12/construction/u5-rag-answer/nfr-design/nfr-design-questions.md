# U5 RAG 응답 — 비기능 설계 질문

입력: [U5 비기능 요구사항](../nfr-requirements/)(성능·보안·규모·신뢰성·관측·기술 선택), [U5 기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01·C-02·C-03·C-09·C-10·C-11·C-12, api의 현재 구성(`api/src/app.module.ts` — U2 동의·탈퇴, U3 `PublishedIndexModule`(AiRun 포함)이 등록됨, `api/src/publications` — U4 `PublicationAccess`는 인터페이스와 메모리 구현만 있음, `api/src/ai-generation/ai-generation.module.ts`, `api/src/ai-generation/checked-gate.ts`).

이미 정해진 것(다시 묻지 않음): 다시 쓰기 호출 상한(`createGuardedFetch` 256 KiB, 재시도 0, 10초, 200토큰, 모델 상수 재사용, 키 없으면 호출만 실패), 질의응답 모델은 코드 상수 하나(기본 `HAIKU`), SSE 머리와 15초 keep-alive, 연결이 끊기면 게이트 스트림을 닫고 시작한 다시 쓰기는 끝까지 두고 버림, 질문 횟수 Redis 전용 연결(`CATCHU_QUEUE_REDIS_URL`, 1초, 쌓지 않음, 주소 없으면 통과·기록), 로그 칸과 로그에 넣지 않는 것, 회로 차단기·캐시·자동 재시도 없음, 새 런타임 의존성 없음(비기능 요구사항 Q1~Q4와 수정 요청 R-01~R-04).

## Q1. [설계] U5 모듈을 api 앱에 등록하는 시점

U5의 받은 사람 경로는 링크 조건 판정(C-10 `PublicationAccess`)을 반드시 거쳐야 한다(security-requirements NFR1.1). 그런데 지금 api에는 U4의 실제 `PublicationAccess`가 없고 시험용 메모리 구현만 있다. 메모리 구현으로 앱에 등록하면 실제 링크 조건 없이 요약·질의응답이 열린다. U3은 같은 사정에서 U2 `AiRun`이 들어온 뒤 등록했다(U3 비기능 설계 Q1). U5는 키가 없어도 기동을 막지 않으므로(NFR2.3) 키 때문에 등록을 미룰 이유는 없다.

A. U5 코드 PR을 낼 때 U4의 실제 `PublicationAccess`(DB 구현)가 통합 브랜치에 있으면 그 PR에서 U5 모듈(경로·`BASE_SUMMARY` 처리기 등록·질문 횟수 Redis 연결)을 앱에 등록한다. 없으면 U5 구성 요소와 만들기 함수만 두고 시험이 직접 만들며, 앱 등록은 U4가 합쳐진 뒤 U5 담당이 작은 PR로 한다. 어느 경우에도 메모리 구현을 앱에 넣지 않는다. 마이그레이션(`base_summary`)은 U4의 `publication` 표가 있어야 하므로 등록과 같은 때 넣는다.
B. 지금 앱에 등록하되 U4 구현이 없으면 U5 경로가 늘 `404`를 돌려주게 한다 — 앱 조립을 먼저 확인할 수 있지만 쓰이지 않는 분기와 시험이 늘고, 배포에 빈 경로가 열린다.
X. Other (please specify)

[Answer]: A로 하되, 마이그레이션(base_summary)은 앱 등록을 기다리지 않고 U5 코드 PR에 넣는다. U4의 publication 표는 이미 통합 브랜치에 있다(#422, 6b836c1의 CreatePublicationTables). U3도 첫 PR(#429)에 마이그레이션을 넣고 앱 등록만 #436으로 미뤘다. U5의 DB 시험(행 만들기·늦은 결과 버림·발행본 삭제 때 함께 지우기)이 이 표를 쓴다.

## Consolidated Summary Confirmation

- 앱 등록(Q1): U5 코드 PR을 낼 때 U4의 실제 `PublicationAccess`(DB 구현)가 통합 브랜치에 있으면 그 PR에서 U5 모듈(경로·`BASE_SUMMARY` 처리기 등록·질문 횟수 Redis 연결)을 앱에 등록한다. 없으면 U5 구성 요소와 만들기 함수만 두고 시험이 직접 만들며, 앱 등록은 U4가 합쳐진 뒤 U5 담당이 작은 PR로 한다. 어느 경우에도 메모리 구현을 앱에 넣지 않는다.
- 마이그레이션(Q1): `base_summary` 마이그레이션은 앱 등록을 기다리지 않고 U5 코드 PR에 넣는다. U4의 `publication` 표는 이미 통합 브랜치에 있다(#422, 6b836c1의 `CreatePublicationTables`). U5의 DB 시험(행 만들기·늦은 결과 버림·발행본 삭제 때 함께 지우기)이 이 표를 쓴다. 같은 PR에서 `api/docs/member-withdrawal-deletion.md`에 "base_summary | 발행본" 행을 더한다.
- 비기능 요구사항 검토에서 남은 두 점을 질문 없이 정한 것: 연결이 끊기면 U5는 게이트 스트림 반복을 `return`(for-await의 `break`)으로 닫는다. 게이트가 이벤트를 기다리는 중이면 닫힘은 그 기다림이 끝난 뒤라 최대 게이트 시간 제한(45초)까지 늦을 수 있으며 한계로 적는다(NFR R-05). EKS의 WAF(`catchu-edge`) 로깅이 요청 주소를 남기는지는 이 저장소 설정만으로 알 수 없으므로 팀장 공용 기반의 확인 몫으로 적는다(NFR R-06).
- 그 밖의 설계는 비기능 요구사항 그대로다(호출 상한, 모델 상수, SSE 머리·keep-alive, Redis 전용 연결, 로그 칸, 회로 차단기·캐시·자동 재시도 없음, 새 런타임 의존성 없음).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
