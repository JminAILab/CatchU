# U7 저장소·분석 — 코드 생성 계획

## Summary

- Builds: 기존 U7 구현에서 회원·등록 삭제와 진행·결과 수신의 DB 잠금 순서를 맞추고, 잠금 후 맥락을 다시 검증합니다.
- Touches: api의 database-receiver.store.ts, 수신 동시성 회귀 시험, 수신 설명 문서와 U7 검증 기록을 보완합니다.
- Tests: 실제 PostgreSQL 동시 실행 8종과 조회 사이 변경 3종, 기존 수신·삭제·반영 회귀 및 API 정적 검사·80% 줄 커버리지를 확인한 뒤 독립 재검토합니다.

## 범위와 근거

작성일·보완일: 2026-10-29. 담당 leechaeah, 이슈 [#424](https://github.com/JminAILab/CatchU/issues/424), 우선순위 P1. Unit당 이슈 하나를 유지한다. 기준 HEAD는 5551cf8c43a468d71293932979c856e9a18132ab이며 기존 U7 구현은 로컬에 작성돼 있다. 담당자의 ‘DB 교착 결함 수정·회귀 검사 후 다시 검토’ 요청에 따라 Step 10을 추가했다. 이 문서는 실행 계획이며 검사 결과는 [구현·검사 요약](code-summary.md)에 별도로 기록한다.

입력은 [기능 명세](../functional-design/functional-spec.md), [업무 규칙](../functional-design/rules.md), [엔티티](../functional-design/entities.md), [비기능 설계](../nfr-design/logical-components.md) 및 같은 폴더의 성능·보안·규모·신뢰성·관측 설계다. 상위 근거는 [요구사항](../../../inception/requirements-analysis/requirements.md), [스토리](../../../inception/user-stories/stories.md), [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md), [계약](../../../inception/contract-design/contract-summary.md)이다.

U7은 US1.2·US1.3의 수용 기준 12개를 구현한다. FR19.1·US19.1에는 U7 실제 분석 증거를 제공하며 전체 통합 진행 책임은 U2에 있다. 기존 모달 상단 이력·상태·Catch 보기·제한된 실패 재요청을 유지하고 하단 선정 목록을 직접 주소 등록으로 교체한다. JD·발행·색인·RAG 품질 평가는 범위 밖이다.

## 최초 계획 시점의 준비 상태와 선행 조건

| 항목 | 확인 결과와 구현 시 조치 |
|---|---|
| 기존 검사 | api 메시지 검사 22개, web 저장소 관리·분석 요청 검사 40개 통과. 현행 10월 경로의 회귀 기준선이며 U7 구현 검증이 아니다 |
| Node·npm | 현재 v24.19.0 / 11.16.0. 저장소 기준 Node 24.21.0 / api npm 11.19.0과 맞춘 뒤 재검사한다. 기준·잠금 파일을 낮춰 우회하지 않는다 |
| worker | 현재 PATH에서 uv를 찾지 못했고 worker/.venv도 없다. 기준 uv 0.12.18·Python 3.12.10과 잠금 의존성을 준비한 뒤 검사한다 |
| DB·Valkey | 이번 계획 작성에서는 기동·접속·마이그레이션을 검사하지 않았다. 전용 로컬 시험 DB와 큐의 대상을 확인한 뒤 사용한다 |
| U2 C-03 | 현재 api/src에서 DailyRunLimit 구현을 찾지 못했다. 승인 계약의 소비 경계와 시험 대역은 준비하되 실제 제공 구현·조립은 #414와 연결한다. 한도를 무시하는 제품 대역으로 완료 처리하지 않는다 |
| OQ2·실제 실행 | CatchU 공개 전환 또는 팀장이 정한 대체 공개 저장소와 분석·평가 대상 결정이 필요하다. 공개 여부, 계정·자료 사용·외부 전송·비용·실행 환경 조건이 갖춰진 뒤 실제 실행한다 |

도구 준비는 기존 판본 설치·활성화 범위다. AI-DLC 버전, 제품 의존성, 잠금 파일, 전역 시스템 설정을 임의로 변경하지 않는다. 구현 가능한 독립 부분은 계속 진행하고 위 선행 조건 때문에 하지 못한 검사는 미실행으로 남긴다.

위 표는 최초 계획 당시의 관찰이다. 이후 기준 도구 준비와 구현·합성 검사를 수행했으며 결과는 code-summary에 있다. OQ2는 CatchU 공개 전환으로 결정됐지만 실제 공개 적용·실행 확인은 남아 있다. 고지 문구는 담당자 요청대로 초안만 보존하며, U2 실제 C-03 연결·실제 분석·약 500개 실측·원격 CI·병합의 남은 조건을 이번 보완으로 완료 처리하지 않는다.

## 실행 순서

각 Step은 체크박스 전체 조건을 확인한 뒤 완료로 바꾼다. 테스트 순서는 “각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.”를 따른다. 아래 Step 1의 시나리오를 먼저 확정하고, 각 기능을 구현한 뒤 그 기능의 시험 코드를 작성·실행한다.

이번 보완에서는 기존 완료 항목을 다시 구현하지 않고 Step 10을 먼저 수행한다. 그 뒤 남아 있는 Step 8·9의 실행 조건과 완료 판정을 이어간다.

### Step 1 — 시나리오와 검사 환경 준비

- [ ] [검사 지침](unit-test-instructions.md)의 C1~C6·I1~I8을 구현 전 기대 결과로 사용한다. 수용 기준 12개, 업무 규칙 12개, 세부 비기능 요구사항 20개를 빠짐없이 대응한다.
- [ ] 현재 브랜치·HEAD·기존 변경을 재확인하고 타 작업의 변경을 보존한다. 관련 서비스 README·api/CONVENTIONS.md·보안 점검·기능별 현행 문서를 읽는다.
- [ ] 기준 Node/npm·uv/Python과 잠금 의존성을 준비한다. 기존 Node test·pytest 설정을 재사용하고 새 검사 도구를 도입하지 않는다. api/package.json·web/package.json·worker/pyproject.toml의 검사 설정, API TEST_COVERAGE_INCLUDE 및 worker coverage 설정이 새 파일도 검사하는지 확인한다.
- [ ] 검사 지침의 준비 확인 명령을 실행한다. DB는 별도 시험 대상과 _test 접미사를 확인하고 운영·공유 개발 자료를 초기화하지 않는다. Valkey 없이 건너뛴 검사를 통과로 기록하지 않는다.
- 추적: US1.2·US1.3 전부, BR5.1, NFR6.3.

### Step 2 — 회원별 저장소 등록과 DB 제약

- [ ] api/src/member-repositories에 회원별 등록 엔티티·서비스·주소 해석·GitHub 메타데이터 어댑터·회원 API를 추가하고 실제 앱 모듈에 연결한다. GET /me/repositories는 회원 등록을 읽으며 등록 입구는 기능 명세의 HTTP 계약을 따른다.
- [ ] https://github.com의 저장소 루트만 해석한다. 소유·기여 사전 검사는 없으며 고정 GitHub API 호스트·redirect 금지·기존 호출 시간/응답 크기 경계를 적용한다. 공개·비공개 확인·지원 불가·확인 불가를 구분하고 서버가 확인한 ID·좌표를 저장한다.
- [ ] 새 repository_registration의 회원별 유일성·회원 CASCADE, AnalysisRequest의 등록 복합 FK, 불변 동의 범위 및 AnalysisAttempt 관측 필드를 엔티티와 새 마이그레이션으로 함께 구현한다. 신규 등록을 전역 repository_selection에 넣지 않는다.
- [ ] 마이그레이션은 생성 명령으로 만들고 SQL을 검토한다. 기존 적용 파일을 수정하지 않는다. 기존 분석 자료가 새 FK·동의 사본으로 안전하게 전환될 조건을 확인하고, 충족하지 못하면 명확히 거부한다. 과거 동의를 사후 생성하거나 운영 자료를 자동 삭제하지 않는다. 신규 시험 DB에서 up/down/up과 미준비 자료의 거부를 검사한다.
- [ ] 구현 뒤 C1의 8개 사례를 api/test/repository-registration.test.cjs와 api/test/db/repository-registration.test.cjs에 작성·실행하고 기존 삭제 검사를 확장한다.
- 추적: US1.2 AC1.2.1·3·7, BR1.1~1.3, NFR1.1~1.3·5.1.

### Step 3 — 접수·불변 동의·하루 제한·재요청

- [ ] api/src/analysis-intake와 member-analysis의 접수/동의 저장을 회원 등록에 연결한다. 동일 키 재응답을 먼저 판정하고 외부 공개 확인은 트랜잭션 밖에서, 회원/연결/등록/범위 재대조는 기존 잠금 안에서 수행한다.
- [ ] 등록 참조·확인 좌표·허용 자료 종류·범위 판본을 요청 동의에 고정한다. 등록 정보 갱신이 과거 동의를 바꾸지 않게 한다.
- [ ] C-03 consume(memberId, ANALYSIS, now, manager)를 모든 접수 조건 통과 후 새 요청 저장과 같은 트랜잭션에서 호출한다. 실제 U2 제공 구현의 연결 여부를 명시한다. 등록/조회/동일 키는 소비하지 않고 실패 실행은 환급하지 않는다. 429 DAILY_LIMIT_REACHED를 기존 응답 형태로 전달하며 남은 횟수를 표시하지 않는다.
- [ ] 최신 CLOSED 실패, 결과·Catch 없음, 다른 ACTIVE 없음, 새 동의와 한도를 기존 상세 재요청 표대로 검사한다. CLOSED/APPLY_FAILED와 FAILED/APPLIED의 서로 다른 조건을 보존한다.
- [ ] 구현 뒤 C2의 8개 사례를 api/test/db/u7-analysis-intake.test.cjs에 작성·실행한다. 기존 멱등·동시 접수·시한·재요청 회귀도 실행한다.
- 추적: US1.2 AC1.2.1·6·8, US1.3 AC1.3.2~4, BR1.4·3.1·4.2·4.3, NFR2.1·4.5·4.6·7.1.

### Step 4 — 현행 메시지·실행 컨텍스트·패키징 전환

- [ ] api/contracts/repository-analysis/common.yaml 및 worker-messages.yaml에 U7 현행 스키마를 만들고 원본·변경점을 기록한다. 과거 승인된 10월 YAML은 보존한다.
- [ ] Request·ProcessingEvent·Result·ResultReceipt의 schemaVersion을 2로 맞춘다. Result의 ownCommitObservation·observedOwnCommitCount·collectionLimitNotes를 필수로 두고 UNKNOWN/null/빈 목록도 명시한다. 추가 필드·누락·잘못된 조합을 거부한다.
- [ ] api/src/analysis-queue, analysis-receiver 검사기·자료형, worker/app/contract·processing·consumer와 공용 fixture/시험 도우미를 같은 정본에 연결한다. dispatcher의 DB 동의 사본 검사와 큐 범위 형태 검사를 분리한다.
- [ ] api/src/worker-context는 요청 당시 등록·동의 사본으로 좌표를 복원한다. 요청→시도 잠금, 내부 인증, 현재 시도·회원·자격정보 연결 교체 검사를 보존한다. 큐의 selectionReference/credentialContextReference는 attemptId를 유지하고 비밀값을 넣지 않는다.
- [ ] api/Dockerfile·worker/Dockerfile의 계약 복사/조회 경로와 .github/workflows/ci.yml의 계약 변경 감지를 함께 맞춘다. 기존 api/worker 검사 작업을 사용하며 새 CI 체계를 만들지 않는다. 공유 설정 검토 상대는 기존 담당 기준을 따른다.
- [ ] 구현 뒤 C3의 8개 사례를 api/test/u7-worker-context.test.cjs, 양쪽 worker-messages 검사와 fixture에 작성·실행한다. 이미지 안 스키마 해시·동일 사례 판정도 확인한다.
- 추적: US1.2·US1.3, BR1.2·1.4·4.1, NFR1.1~1.3·2.1·5.2·6.2·7.2.

### Step 5 — worker 본인 기록 관측과 수집·생성 한계

- [ ] worker/app/collection에서 실제 연결 GitHub 숫자 ID로 관측한다. 필요한 조회 완료·판정 방해 한계 없음·본인 커밋 0일 때만 NONE이다. 하나라도 확인하면 FOUND, 나머지는 UNKNOWN이며 후보 0개를 본인 커밋 0개로 해석하지 않는다.
- [ ] CollectionOutcome부터 candidates·GenerationOutput·processing 결과 조합까지 세 관측 필드를 전달한다. 후보 없는 조기 종료·조회 불명·부분 수집·생성 실패에서도 관측과 기존 실패를 보존한다.
- [ ] 기존 본인 기여·작업 동일성·가리기·Haiku 5.5·자동 생성 재시도 없음 규칙을 재사용한다. 원문을 새 로그나 fixture로 남기지 않는다.
- [ ] 목록·상세·필수 관계·후보·생성·결과 bytes와 시간을 함께 측정할 안전한 집계를 기존 흐름에 붙인다. 기존 상한은 기준선으로 남기고 약 500개 합성 경계 사례를 만든다. 최종 상한은 실제 측정 후 근거와 함께 정한다.
- [ ] 구현 뒤 C4의 8개 사례를 worker/tests/test_u7_observation.py·test_u7_pipeline.py·test_u7_budget.py에 작성·실행하고 기존 수집·후보·생성·LIVE·소비자 회귀를 수행한다.
- 추적: US1.2 AC1.2.2·4·5, BR2.1~2.3, NFR2.2~2.4·4.1~4.4·6.2·7.2.

### Step 6 — 결과 반영·상태와 삭제 보호

- [ ] api/src/analysis-receiver·result-application에서 당시 동의 좌표와 등록 소유권을 대조하고 관측을 저장한다. 삭제된 회원·등록·요청의 늦은 결과를 반영하지 않는다.
- [ ] 기존 중복·순서·현재 시도·동일 작업·트랜잭션·Catch 등록 보호를 유지한다. 처리 상태, 반영 상태, lifecycle, ownerResultsReady와 관측을 함께 반환한다.
- [ ] 실행 불명·수집 한계·본인 기록 없음·정상 0개·부분 결과·확인된 실패를 구별한다. 관측 필드가 기존 재요청 허용 조건을 느슨하게 만들지 않게 한다.
- [ ] 구현 뒤 C5의 8개 사례를 api/test/analysis/u7-receiver.test.cjs와 기존 수신·DB·통합 검사에 작성·실행한다.
- 추적: US1.2 AC1.2.2·5, US1.3 AC1.3.1~4, BR1.2·2.1·4.1~4.3, NFR5.1·5.2·7.1·7.2.

### Step 7 — 기존 모달의 직접 등록과 결과 안내

- [ ] web/src/features/repository-management·analysis-request·assets/repository-options-store.ts를 새 회원 목록·등록 API에 연결한다. 모달 상단과 기존 Catch 보기 콜백은 유지한다.
- [ ] 하단에 주소 입력·등록을 제공하고 등록 성공 뒤 현재 고지·새 동의를 거쳐 분석을 요청한다. 등록만으로 분석을 실행하지 않는다. 등록 오류와 접수 오류를 구분한다.
- [ ] 본인 기록 없음·관측 불명·수집 한계·부분 결과와 기존 상태를 구별한다. 한도 안내, 응답 불명 시 같은 키·본문 보존, 연결 변경·회원 변경·취소 보호, 허용된 실패 재요청을 연결한다.
- [ ] 구현 뒤 C6의 8개 사례를 web/test/repository-registration.test.mjs와 기존 분석·모달 시험에 작성·실행한다. 실제 화면은 회원 지원 폭 760·1024·1536px에서 초점·키보드·모달 닫기·재열기·오류 안내·Catch 이동을 확인한다.
- 추적: US1.2 AC1.2.1~3·6~8, US1.3 전체, BR1.1·1.3·1.4·2.1·3.1·4.1~4.3, NFR1.1·2.1·7.1·7.2.

### Step 8 — 연결 검사와 실제 분석·약 500개 측정

- [ ] api/test/integration/u7-analysis-chain.test.cjs 등에서 I1~I8의 경계 통합을 실행한다. 실제 PostgreSQL·Valkey와 합성 외부 응답으로 요청→worker→수신→DB 연결을 확인한다. 합성 성공을 실제 분석 성공으로 쓰지 않는다.
- [ ] U2 C-03 실제 제공 구현 연결과 본인 화면 연결을 확인한다. OQ2·자료 사용·외부 전송·비용·실행 환경 조건이 갖춰지면 새 등록 경로로 실제 GitHub 수집→실제 생성→결과 반영→본인 Catch·근거 열람까지 실행한다.
- [ ] 실제 거부 1~2종을 기록하고 이유별 개별 자동 시험도 유지한다. 약 500개는 목록 개수만 세지 않고 상세·관계·후보 묶음/제외·생성·전달·DB 반영 개수와 상한/시한을 대조한다.
- [ ] 실측 근거로 상한을 확정하고 관련 경계 시험을 다시 실행한다. worker 동시 실행 수는 기존 1을 유지한다. 상한·시한·결과 크기 때문에 목표를 충족하지 못하면 그 지점과 필요한 결정을 남긴다.
- [ ] 실행 조건이 없으면 해당 항목은 체크하지 않고 사유·필요 조치·대상·다음 행동을 기록한다. 운영 배포, 구판 큐 삭제, 기존 자료 초기화는 이 계획의 자동 실행 항목이 아니다.
- 추적: US1.2 AC1.2.4·5, US1.3, FR19.1/US19.1의 U7 증거, BR5.1, NFR4.1~4.6·6.1~6.3.

### Step 9 — 문서·검증 결과·제출 준비

- [ ] 현행 api/docs, worker/docs, web 기능 README에 바뀐 사용법·응답·메시지 판본·검사 명령을 반영한다. README는 안내 역할을 유지하고 기능 상세는 전용 문서에 둔다.
- [ ] v2 전환 전 구판 진행 요청·대기/결과 큐 확인과 양쪽 이미지 교체 조건, DB 자료 준비·되돌리기 조건을 문서화한다. 준비가 안 된 환경에서는 배포를 미실행으로 남긴다.
- [ ] Unit 검사와 80% 줄 커버리지를 확인한다. 공통 메시지·DB 관계가 바뀌므로 서비스 README의 필수 정적 검사·전체 회귀·web 실행 검사 및 기존 CI를 제출 전에 확인한다. 실패/건너뜀/환경 미준비/실제 미실행을 구분한다.
- [ ] code-summary.md·traceability.json·source-manifest.json에 실제 변경·실행 증거·수용 기준/BR/NFR 대응·전체 변경 파일을 기록한다. 계획만 있는 경로를 구현 파일로 기록하지 않는다.
- [ ] 구현 산출물의 독립 검토와 후속 시험 단계로 넘긴다. #424·Project는 남은 완료 기준에 맞춰 갱신한다. 제출은 #419 결정대로 통합 브랜치 대상 PR이며 실제 분석·병합 전에는 이슈를 완료로 표시하지 않는다. 별도 Unit 이슈는 만들지 않는다.
- 추적: US1.2·US1.3 전체, BR5.1, NFR6.1~6.3.

### Step 10 — 동시 삭제·수신의 잠금 순서 보완

- [ ] [검사 지침](unit-test-instructions.md)의 L1~L11을 기대 결과로 확정한다. 전용 PostgreSQL 시험 DB와 기준 Node/npm을 준비하고, 새 시험의 실행 경로와 기존 수신·삭제 회귀 명령이 준비됐는지 확인한다.
- [ ] api/src/analysis-receiver/database-receiver.store.ts에서 최초 요청 조회는 부모 식별용으로만 사용한다. 회원 → 회원별 등록 → 요청 → 현재 시도 → 수신 기록 순서로 잠그며, 잠근 요청의 부모 참조가 처음 읽은 값과 일치하는지 다시 확인한다. 현재 시도·동의·회원 상태·등록 소유권은 잠금 뒤 읽은 자료로 판정하고, 삭제·변경으로 맥락이 사라지면 기존 맥락 거부를 반환한다. 요청을 잠근 뒤 다른 부모를 추가로 잠그는 방식은 사용하지 않는다.
- [ ] 구현 뒤 api/test/integration/receiver-parent-locking.test.cjs에 회원/등록 × 진행/결과 × 삭제 선행/수신 선행 8종과 조회 사이 삭제·부모 참조 변경·현재 시도 변경 3종을 작성한다. 실제 PostgreSQL과 제품 수신 경로를 사용하고, 시험 장벽과 pg_blocking_pids로 실행 순서를 확인한다. 삭제와 수신 모두 교착 없이 종결되고, 삭제 뒤 요청·시도·수신 기록이 남거나 되살아나지 않으며 타 회원 자료가 유지되는지 검사한다.
- [ ] 기존 수신 직렬화·중복 결과·커밋 실패·삭제·Catch 반영 회귀와 API lint/typecheck/build를 실행한다. 변경 파일을 포함한 기존 API 커버리지 도구로 80% 기준을 확인한다. API 수신 수정과 무관한 web·worker 전체 검사 결과는 기존 기록을 재사용하며, 새 실패나 영향이 확인되면 필요한 범위만 추가 검사한다.
- [ ] api/docs/analysis-receiver.md와 api/docs/receiver-registration.md의 수신 잠금 설명·시험 명령을 현행 동작에 맞춘다. code-summary.md·traceability.json·source-manifest.json에는 이번 수정 파일과 실제 실행 결과를 추가하고 이전 변경 경로와 미충족 항목을 보존한다.
- [ ] 수정된 구현과 시험 근거를 독립 재검토에 넘긴다. #424의 결함 상태는 실제 수정·검사·검토 결과에 맞춰 갱신한다. 새 자동 재시도·복구 장치, 스키마 변경, 고지 판본 변경은 이 보완에 넣지 않는다.
- 추적: US1.2 AC1.2.2·5, US1.3 AC1.3.1~4, BR1.2·4.1~4.3, NFR5.1·5.2·7.1·7.2. 기존 Step 6의 삭제 보호와 수신 원자성을 보완한다.

## 완료 판정과 범위 변경

코드와 자동 검사가 끝나도 OQ2에 따른 실제 분석·거부·실측과 통합 브랜치 병합 증거가 없으면 U7 전체 완료가 아니다. 실행 불가 조건은 code-summary와 #424에 남긴다. 기존 테스트 실패를 지우거나 한도·동의·권한을 약화해 통과시키지 않는다.

C-03/C-06 등 다른 Unit 제공 계약은 소비 경계를 지킨다. 공용 계약의 의미를 바꿔야 하면 영향과 막힌 범위를 정리해 별도 계약 수정 절차로 넘긴다. U7 내부 구현 선택은 위 승인 설계 안에서 정하되 공개 범위·실제 자료 사용·비용·제품 동작의 새 결정은 임의로 확정하지 않는다.

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

