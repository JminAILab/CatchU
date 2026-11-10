# U10 JD 관리·요약 구현 계획

## Summary

- Builds: 본인 JD 관리와 발행본의 요구사항별 요약·재열람을 승인 설계대로 구현한다. 실제 공용 연결은 제공자 준비 뒤 검증한다.
- Touches: api/src/jd/, api/src/jd-summary/, 새 DB 마이그레이션, web/src/features/jd/, /jds 라우트와 필요한 기존 등록·탐색·문서 파일.
- Tests: api·web의 네 책임별 7개씩 28개 시나리오와 핵심 경계 통합 6개를 계획한다. 기존 Node 검사기로 구현 후 작성·실행한다.

작성 기준은 `fdf5b787b25159c8edab9e97663129b5b3569e59` 통합본이다. 기능 설계, 비기능 요구사항, 비기능 설계 승인을 유지한다. 이 문서는 Code Generation의 구현 전 계획이며 **계획 승인 대기**다. 체크박스는 아직 수행하지 않은 구현 작업이다. 문서 작성이나 계획 승인은 U10 전체 완료·배포·실제 자료 사용 승인이 아니다.

## 1. 적용 근거와 구현 범위

- [기능 명세](../functional-design/functional-spec.md), [데이터 모델](../functional-design/entities.md), [업무 규칙](../functional-design/rules.md), [화면 구성](../functional-design/frontend-components.md), [기능 추적표](../functional-design/traceability.json).
- [비기능 요구사항 추적표](../nfr-requirements/traceability.json)와 여섯 요구사항 문서, [비기능 설계 추적표](../nfr-design/traceability.json)와 성능·보안·확장성·신뢰성·관측성·논리 컴포넌트 설계.
- [상류 요구사항](../../../inception/requirements-analysis/requirements.md)의 FR6.1·FR6.7·FR6.8, 공통 FR4·FR5·FR6.4~6.6·FR6.9·FR14·FR20, NFR1~NFR7.
- [스토리](../../../inception/user-stories/stories.md)의 US6.5와 US6.1, [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md), [공유 계약](../../../inception/contract-design/contract-summary.md)의 C-01~C-04·C-06·C-09~C-12.
- [코딩 절차](../../../../../../../../docs/CatchU_coding_procedures.md), [보안 점검](../../../../../../../../docs/CatchU_security_checks.md), [api 규약](../../../../../../../../api/CONVENTIONS.md), [api README](../../../../../../../../api/README.md), [web README](../../../../../../../../web/README.md).

JD 관리 → 요약 순서다. 기존 NestJS·TypeORM·PostgreSQL, api 내부 AiRun, Next.js·React를 사용한다. worker 배포 단위·새 성능/가동률/복구 목표·자동 재시도·폴링·점수화·결과 공개 기능은 범위에 없다. 실제 분석·실측 #450과 완료된 U7 검사는 다시 수행하지 않는다.

## 2. 현재 연결 상태와 선행 조건

| 경계 | 현재 코드에서 확인한 것 | 구현·완료 조건 |
|---|---|---|
| 인증·DB | 전역 회원 Guard, CurrentMemberId, TypeORM 엔티티/마이그레이션 자동 탐색 | 기존 인증과 no-store를 소비하고 U10 소유 조건을 추가한다. 요약도 회원 인증을 유지한다. |
| C-01~C-04 | AiGenerationModule/AI_GENERATION_GATE, AiRunModule, DailyRunLimitModule의 consume(..., manager), AiConsentModule의 require | 공용 계약·검사·한도 값을 복제하지 않는다. 합성 생성은 U10 시험에 명시적으로 주입한다. |
| C-09 | PublishedIndexModule/PUBLISHED_SEARCH, 실제 DB 검색과 합성 임베딩 경계 | 승인된 limit 6과 조각·원문 위치를 소비한다. 실제 외부 임베딩 검증과 합성 검사를 구분한다. |
| C-10 | PublicationAccess 인터페이스와 InMemoryPublicationAccess만 있음 | 실제 DB 제공자는 U4 #416의 연결 조건이다. JdSummaryModule은 제공자를 명시적으로 받도록 준비하고 실제 제공 전 제품 앱에 합성 구현을 등록하지 않는다. |
| C-11 | 현재 /s/[token]은 기존 수신자 화면이며 JD 슬롯·showEvidence 미연결 | U10은 계약 props를 받는 JdSummaryPanel을 제공한다. U4가 실제 슬롯·근거 이동을 제공한 뒤 함께 연결한다. U10이 U4 화면을 대신 재작성하지 않는다. |
| web 회원 HTTP | api-client.ts의 MemberRequest에는 PATCH·linkGrant가 없고 member는 Bearer만, recipient는 grant만 전송 | 공용 web/API 호출 제공 담당에 더하는 변경을 요청할 근거를 준비한다. 반영 전에는 주입형 U10 transport와 합성 검사까지 진행하고 PATCH·요약의 실제 브라우저 연결은 보류한다. 직접 fetch·토큰 복제로 우회하지 않는다. |

공용 web 보완의 최소 사례는 (1) 본인 JD의 `PATCH /v1/jds/{jdId}`, (2) 로그인 회원이 비밀번호 링크에 요약을 접수·조회할 때 Bearer와 `X-Link-Grant`를 함께 전달하는 것이다. 기존 갱신·로그아웃·세션 교체 처리와 기존 호출은 유지되어야 한다. 영향을 받는 파일은 `web/src/lib/api-client.ts`, `web/src/lib/auth-api.ts`, 관련 기존 검사다. **이 파일들은 U10이 직접 바꿀 목록이 아니라 제공 담당의 별도 변경 대상**이다. 기존 계약의 소유 규칙에 따라 반영된 판본을 확인한 뒤 U10 어댑터를 연결한다.

이 선행 조건들은 독립 구현을 막지 않지만 실제 연결·Unit 완료의 조건이다. 미제공 상태를 합성 성공으로 완료 처리하지 않는다. 첫 실제 연결 결과는 팀의 별도 확인을 받는다.

## 3. 주요 업무 시나리오와 기대 결과

세부 테스트 코드는 각 구현 뒤 작성한다. 아래 기대·실패 조건을 먼저 고정한다.

| 책임 | 7개 시나리오와 기대 결과 | 예정 검사 파일 |
|---|---|---|
| api JdManagement | ① 본인 CRUD만 허용 ② 타인/없는 ID 동일 404 ③ 제목 200·본문 20,000 UTF-16 경계/공백/추가 필드 거부 ④ CRLF·공백·불릿 원문 보존 ⑤ 20개 cursor와 동률 ID 정렬·본문 미노출 ⑥ 수정 후 기존 실행 사본 불변 ⑦ 삭제 실패를 성공으로 숨기지 않음 | api/test/jd/jd-management.test.cjs |
| api JdSummary | ① 비어 있지 않은 1~20줄·각 2,000자/원문 순서 ② 줄별 검색·HAIKU 생성 최대 한 번과 정확한 source 매핑 ③ 실제 공용 길이 계산·계약 위반 생성 차단 ④ CONTENT/EMPTY/서버 안내/검색 조각 없음 구분 ⑤ 생성 오류·개별 시간 초과는 GENERATION_FAILED, 검색 오류는 SEARCH_FAILED ⑥ 일부 DONE·전부 FAILED·PROCESSING_FAILED 집계 ⑦ 전체 20분 시한/terminal 상태·부모 부재에서 늦은 저장 거부와 기존 DONE 보존 | api/test/jd/jd-summary.test.cjs |
| web JD 관리 | ① 로그인 및 빈 목록 ② 선택·상세·다음 페이지 ③ 생성·수정 성공 뒤 목록 반영 ④ 서버/입력/인증 실패의 입력 보존과 성공 오인 방지 ⑤ 삭제 확인·취소·실패 ⑥ 입력 상한 안내·조용한 잘라내기 금지 ⑦ 세션 교체·늦은 응답 폐기 | web/test/jd-management.test.mjs |
| web JD 요약 | ① 비로그인 조회 금지·JD 선택/관리 이동 ② 접수 오류별 안내와 동의 후 한 번만 재요청 ③ 새 runId·목록·수동 새로고침·재열람 ④ 원문과 세 칸·EMPTY/일부 실패 구분 ⑤ R-01 문구를 최초 조회/재열람에 동일 적용, 전체 시한은 별도 안내 ⑥ React 텍스트·라벨·정확한 citation.location 전달 ⑦ 로그인/token/run 전환·접근 상실에서 상태 제거 및 늦은 응답 폐기 | web/test/jd-summary.test.mjs |

핵심 통합 6개는 `api/test/jd/jd-integration.test.cjs`와 실제 화면 확인에 배치한다.

1. 실제 DB에서 JD 판본 재확인·C-03 소비·run/inputCopy/PENDING 행의 동일 트랜잭션과 rollback을 확인한다. 외부 호출은 잠금 밖이다.
2. 커밋 뒤 한 번 enqueue하고 ENQUEUE_FAILED에도 202·PENDING을 유지하며 조회 시 시한 실패를 확정한다. 접수와 완료 로그를 구분한다.
3. 실제 HTTP Guard와 주입한 C-10 경계로 매 요청 회원·링크·발행본·run 소유를 확인한다. AUTH 오류와 LINK 오류의 응답 구분을 확인한다. 실제 C-10 연결은 제공 후 같은 기대 결과로 확인한다.
4. 실제 FK로 실행자/JD 복합 소유·부모별 CASCADE·유일성·다른 회원 JD 보존을 확인한다. 삭제 후 기존 행 UPDATE가 결과를 되살리지 않는지 기존 보호 흐름에 포함한다. 별도 동시성 부하·재전송 시험 체계는 만들지 않는다.
5. 실제 공용 검사 관문에 시험용 호출 대역을 주입한 조합과, 이미 검사된 출력 대역을 직접 주입한 U10 처리 시험을 구분한다. 전자는 공용 검사 연결, 후자는 U10 흐름 증거다. 원문·토큰·grant·SQL·stack의 로그 비노출도 확인한다.
6. 제공자 합류 후 실제 web↔api의 JD CRUD와 C-11 슬롯에서 재열람·접근 상실·원문 강조를 확인한다. 합류 전은 미실행이며 정적 렌더·합성 props 결과로 대체하지 않는다.

경계값은 파라미터 사례로 묶을 수 있으며 34개는 계획 시나리오 수다. 구현 뒤 실제 테스트 개수·검사 파일·미실행을 결과에 기록한다. 이미 승인된 전체 NFR 검토를 반복하거나 새 성능 합격선을 만들지 않는다.

## 4. 순차 구현 작업

### Step 1 — 구조·검사 준비와 제공 경계 확인

- [ ] 최신 작업 브랜치·기존 변경·Node/npm·기존 검사 설정을 확인하고 필요한 의존성만 기존 잠금 판본으로 준비한다. 새 runner·coverage 도구·CI를 추가하지 않는다.
- [ ] api는 `src/jd/`, `src/jd-summary/`, web은 `src/features/jd/`에 책임을 배치한다. 운영 설정 골격은 기존 공용 모듈/환경설정을 소비하는 등록 코드로 한정한다.
- [ ] 첫 테스트 작성 전에 [검사 지침](unit-test-instructions.md)의 파일 지정 실행 명령과 격리된 테스트 DB 사용을 확인한다. 본 절 시나리오를 구현 기대값으로 유지한다.
- [ ] 공용 web 보완과 U4 제공 상태를 확인한다. 미제공 경계는 시험용 주입으로 분리하고 실제 연결은 후속 조건으로 남긴다.

### Step 2 — U10 데이터와 마이그레이션

- [ ] `api/src/jd/jd.entity.ts`, `api/src/jd-summary/jd-summary-run.entity.ts`, `jd-summary-result.entity.ts`를 승인 entities에 맞춰 추가한다. inputCopy는 run 소유 jsonb이며 별도 보관 사본을 만들지 않는다.
- [ ] UUID·timestamptz·varchar CHECK, (memberId,jdId) 복합 FK, 부모 CASCADE, (runId,requirementIndex) 유일성과 목록 접근 인덱스를 구현한다. 문자열의 UTF-16 업무 상한은 서버에서 검사한다. DB char_length와 JavaScript length가 같다고 가정하지 않는다.
- [ ] 최신 마이그레이션이 적용된 U10 전용 합성 개발 DB에서 `npm.cmd run migration:generate -- src/database/migrations/CreateJdSummary`로 새 migration을 생성한다. 다른 Unit 표의 DROP/변경이 섞이면 중단한다. 기존 migration은 고치지 않는다.
- [ ] U10 소유 임시 DB에서 up/down/up을 확인하고 데이터·FK 검사를 구현 후 작성한다. 실제 자료 DB는 사용하지 않는다. `api/docs/member-withdrawal-deletion.md`의 부모 책임표를 같은 변경에 갱신한다.

### Step 3 — JD 관리 API와 검사

- [ ] `api/src/jd/`에 입력 검사·cursor·store·service·controller·module을 작성한다. GET/POST /v1/jds와 GET/PATCH/DELETE /v1/jds/{jdId}를 회원 Guard 아래 둔다.
- [ ] 인증 memberId로만 조회·변경하고 원문을 보존한다. 승인된 422 INVALID_INPUT/INPUT_TOO_LARGE는 U10 입구의 검증과 기존 ApiError에 연결한다. 전역 ValidationPipe의 400 동작을 바꾸지 않는다.
- [ ] 필요한 422 코드를 `api/src/common/errors/error-codes.ts`와 `api/CONVENTIONS.md`의 오류 표에 더한다. 기존 코드·공용 계약 의미는 바꾸지 않는다. API 응답과 로그에 입력값을 넣지 않는다.
- [ ] JdManagementModule을 `api/src/app.module.ts`에 등록하고 본 책임의 7개 시나리오를 `jd-management.test.cjs`로 작성·실행한다.

### Step 4 — JD 관리 화면과 검사

- [ ] `web/src/features/jd/`에 타입·응답 파서·주입 가능한 API 어댑터·상태 모델·JdManagementPage/JdList/JdEditor/DeleteJdConfirm 및 CSS Module을 작성한다.
- [ ] 회원 라우트 `web/src/app/(member)/jds/page.tsx`, `web/src/lib/routes.ts`, `web/src/lib/member-navigation.ts`, `web/src/components/header/member-header.tsx`에 JD 관리 진입을 연결한다. 주소는 Unit 내부 구현 선택 `/jds`로 하며 `web/README.md` 주소 표도 함께 갱신한다.
- [ ] 공용 인증/세션 경계로 요청 결과를 적용하고 저장 실패 입력을 유지한다. PATCH 제공 전에는 실제 수정 연결을 완료로 기록하지 않는다. 공용 제공자 보완 뒤 U10 어댑터만 연결한다.
- [ ] 구현 후 `web/test/jd-management.test.mjs`의 7개 시나리오와 변경한 탐색 경계의 기존 검사를 실행한다.

### Step 5 — 요약 접수·조회 API와 검사

- [ ] `api/src/jd-summary/`에 입력 분리·접수·run 저장/조회·controller·module을 작성한다. C-12 POST/GET 상세와 승인된 실행 목록 GET 경로를 제공한다.
- [ ] 인증 → C-10 recipient 접근 → 본인 JD·상한 → C-04 → C-09 DONE → 짧은 JD 행 잠금·판본 재검증 → 같은 manager의 C-03/run/inputCopy/결과 저장 → 커밋 → enqueue 순서를 구현한다.
- [ ] 목록은 memberId/publicationId 조건과 20개 cursor, 상세는 runId까지 적용한다. JD/발행본 존재를 외부 원문 직접 조회로 우회하지 않는다.
- [ ] 조회 시 C-02 readStatus 판정을 소비하고 실행 행 잠금 안에서 만료 PENDING과 남은 결과만 닫는다. 기존 DONE 결과는 유지한다.
- [ ] 구현 후 접수·권한·조회·트랜잭션의 시나리오를 `jd-summary.test.cjs`, `jd-integration.test.cjs`에 작성·실행한다.

### Step 6 — JD_SUMMARY 처리기·결과 저장·로그

- [ ] 처리기·검색/생성 요청 매핑·결과 분류를 `api/src/jd-summary/`에 작성하고 C-02에 JD_SUMMARY handler를 한 번 등록한다. payload는 runId만 쓴다.
- [ ] 원문 순서대로 C-09 검색(6개)과 C-01 HAIKU를 호출한다. 반환 계약 확인, 공용 inputLength/assertGenerationRequest, 위치·quote·jdRole 보존을 적용한다. U2 검사·영어 추출·모델 정책을 복제하지 않는다.
- [ ] R-01대로 개별 생성 호출 시간 초과와 제공자 오류는 GENERATION_FAILED로 통일한다. 전체 시한은 DEADLINE_EXCEEDED, 검색은 SEARCH_FAILED, 정상 빈 결과는 DONE/EMPTY로 구분한다.
- [ ] 저장 직전 짧은 실행 행 잠금 아래 PENDING·시한·부모 존재를 재확인하고 기존 결과 행만 조건부 UPDATE한다. 완료 집계·시한 확정도 같은 잠금 기준을 사용한다. 삭제 행 INSERT/upsert·자동 재시도·환급은 하지 않는다.
- [ ] 승인된 허용 필드로 accepted/enqueue/processing/완료·실패 로그를 남기고 실제 커밋 뒤에만 완료로 기록한다. 남은 시나리오와 공용 관문 조합 검사를 구현 후 작성·실행한다.

### Step 7 — 요약 화면·재열람과 검사

- [ ] `web/src/features/jd/`에 JdSummaryPanel/JdPicker/JdRunList/JdRunResult/JdRequirementResult를 작성한다. C-11 props와 공용 세션 변화, U2 동의 창·고지 한 줄을 소비한다.
- [ ] 원문별 세 칸·출처·AI 해석·SERVER_NOTICE·빈 결과·일부 실패를 React 텍스트로 표시한다. R-01 문구는 최초 조회와 재열람에서 같게 유지한다. showEvidence에 받은 location을 그대로 전달한다.
- [ ] 로그인 세션/token/run 변경과 접근 상실 때 상태·요청 세대를 초기화한다. AUTH는 로그인 안내, LINK는 onAccessLost에 넘긴다. 재실행은 새 접수이며 자동 폴링·자동 재접수는 없다.
- [ ] 구현 후 `web/test/jd-summary.test.mjs`의 7개 시나리오를 작성·실행한다. C-11 실제 슬롯을 붙이기 전 합성 props·transport 검증임을 표시한다.

### Step 8 — 제공자 합류와 실제 최소 연결

- [ ] U4의 실제 PublicationAccess·C-11 제공, 공용 web PATCH/동시 헤더 지원 판본을 확인하고 실제 제공자를 U10 등록부·어댑터에 연결한다. product AppModule의 JdSummary 등록은 그때 수행한다.
- [ ] 공유 화면 소유 담당과 JD 슬롯 연결 파일을 확정한다. 제공자의 파일 변경은 담당 변경으로 가져오며 U10이 무단 수정하지 않는다. 기존 계약을 깨는 변경이 필요하면 그 연결 작업을 멈추고 별도 조율한다.
- [ ] 실제 JD CRUD·C-11·DB·공용 큐 연결의 최소 결과를 확인한다. 합성/실제/실패/미실행을 구분하고 첫 실제 연결 결과의 사용자 확인을 받는다. 미제공 항목이 남으면 Unit 완료로 보고하지 않는다.

### Step 9 — 검사·빌드·문서와 추적

- [ ] 정해진 Unit 검사·필요한 기존 경계 회귀·기존 타입/정적 검사·빌드를 수행한다. 커버리지 측정은 기존 도구만 사용하고 미호출 파일·미실행을 숨기지 않는다. 전체 프로젝트 80% 확인은 Build and Test의 조립된 전체 검사 범위에서 수행한다.
- [ ] 새 `api/docs/jd.md`, `web/src/features/jd/README.md`에 동작·연결·오류·검사 한계를 기록하고 api/web README에는 링크·주소만 맞춘다. 환경변수·새 의존성 추가가 실제 필요하면 제공자/담당과 범위를 확인한다.
- [ ] 구현·검사 뒤 `code-summary.md`, `traceability.json`에 실제 파일·스토리/수용 기준·28개 상세 NFR 대응과 결과를 기록한다. FR19 확인 표에는 실제 증거 위치와 미실행 조건을 연결한다. 실제 JD 비교 한 건은 자료·호출 허용이 확인된 후속 검증으로 남긴다.
- [ ] 공식 Code Generation 검토와 보고를 수행한다. 이번 계획 작성 시점에는 구현 완료 보고·공식 구현 검토·Unit 제출/완료를 수행하지 않는다.

## 5. 스토리·요구사항과 작업 대응

| 근거 | 작업 | 기대 증거 |
|---|---|---|
| US6.5 / AC6.5.1~3, FR6.7 | Steps 2~4, 8~9 | 본인 CRUD·별도 화면·회원 삭제·타인 JD 보존 |
| US6.1 / AC6.1.1·5·10, FR6.4·6.5·6.9 | Steps 5~7, 9 | 원문·세 칸·출처·EMPTY/실패·R-01·위치 전달 |
| AC6.1.2·8, 공통 링크/회원 권한 | Steps 3~5, 7~8 | HTTP 거부·로그인/링크 구분·재열람·세션 상태 정리 |
| AC6.1.3·4·7, FR6.6·6.8·FR20 | Steps 5~8 | 사본·원자 차감·큐·시한·새 실행·동의 |
| AC6.1.6, NFR4.1·4.2 | Steps 3, 5~7 | UTF-16 저장/실행 경계·실제 입력 계산·잘라내기 없음 |
| AC6.1.9, FR14.8~10, NFR5.1~3 | Steps 2, 5~6, 9 | FK·삭제 책임표·기존 행 조건부 저장 |
| NFR1.1~4·NFR2.1~4·NFR7.1 | Steps 3~8 | 공용 권한/동의·출력/외부 자료 경계·합성 주입 |
| NFR4.3~7·NFR6.4~5·NFR7.2~3 | Steps 2, 5~8 | 순차 호출·목록·원자 접수·실패/시한 집계 |
| NFR3.1~2·NFR6.1~3 | Steps 6, 8~9 | 안전한 로그·증거 범위 구분·실제 비교 미실행 표시 |

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:b6cb6e0b1ba6bb0736259ab7987a5841cfc41f21a49cf2fb5eade7c786b2dc66",
  "contract_sha256": "sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6"
}
```
