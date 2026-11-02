# U7 저장소·분석 — Unit 검사 지침

## 적용 범위와 순서

[코드 생성 계획](code-generation-plan.md)의 Step 1에서 아래 업무 시나리오·기대 결과·실패 조건을 확인한다. 세부 시험 코드는 해당 기능 구현 후 작성·실행한다. standard 전략으로 C1~C6 각각 핵심 사례 8개와 I1~I8 경계 통합을 다룬다. 여러 입력 조합은 매개변수 사례로 확장한다. 단순 구현 모양 검사가 아니라 권한·동의·상태·DB 반영·외부 경계의 관찰 가능한 결과를 검증한다.

2026-10-29 담당자의 교착 결함 수정 요청에 따른 Step 10은 아래 L1~L11을 먼저 기대 결과로 정하고, 구현 후 세부 시험을 작성·실행한다. 기존 web·worker 검사는 제품 변경이나 새 우려가 없으면 이미 기록된 결과를 재사용한다.

## 도구·설정과 준비 확인

api/web은 기존 Node test, worker는 pytest·pytest-cov를 사용한다. api/package.json·web/package.json·worker/pyproject.toml과 기존 시험 도우미를 재사용한다. Node 24.21.0·api npm 11.19.0, uv 0.12.18·Python 3.12.10 및 잠금 의존성을 준비한다. 앱의 버전 제약을 낮추거나 새 검사 프레임워크를 추가하지 않는다.

2026-10-29 계획 작성 시 현재 Node 24.19.0/npm 11.16.0에서 아래 api 22개·web 40개는 통과했다. 기준 판본 검증은 아직 아니다. uv가 PATH에 없고 worker/.venv가 없어 worker는 미실행이다. DB·Valkey·실제 외부 서비스·커버리지는 이번 준비 검사에서 실행하지 않았다.

다음 명령은 각각 api/, web/, worker/를 작업 디렉터리로 실행한다. 셸은 PowerShell이며 npm은 npm.cmd를 쓴다. 먼저 기존 파일로 실행기 준비를 확인한다.

api/:
```powershell
node --test test/worker-messages.test.cjs
```

web/:
```powershell
node --test test/repository-management.test.mjs test/analysis-request.test.mjs
```

worker/ (기준 도구·잠금 의존성 준비 후):
```powershell
uv run --locked pytest tests/test_worker_messages.py tests/test_request_check.py
```

아래 새 파일을 포함하는 명령은 계획의 해당 구현·시험 파일 작성 후 실행한다. 존재하지 않는 파일 때문에 실패한 것을 제품 결함 검사 결과로 세지 않는다.

## 핵심 사례와 기대 결과

| 영역·파일 | 구현 후 확인할 8개 핵심 사례 |
|---|---|
| C1 등록: api/test/repository-registration.test.cjs, test/db/repository-registration.test.cjs | ① 공개 주소 직접 등록·관계 검사 없음 ② .git/끝 slash/공백 정규화와 GitHub ID 중복 ③ 외부 호스트·userinfo·포트·query·fragment·하위 경로 거부 ④ private 확인/지원 불가/404 확인 불가 구분 ⑤ redirect·시간·응답 크기 경계 ⑥ 타 회원 조회/위조 등록 참조 거부 ⑦ 동시 중복·좌표 갱신·회원별 격리 ⑧ FK CASCADE·복합 소유 제약·마이그레이션 준비 조건 |
| C2 접수: api/test/db/u7-analysis-intake.test.cjs | ① 새 등록·현재 동의로 접수 ② 없거나 낡은 동의 거부 ③ 접수 사본 불변과 연결/범위 변경 재대조 ④ 동일 키·동시 접수에서 중복 소비 없음 ⑤ 한도 도달/KST 경계와 429·남은 횟수 비노출 ⑥ 접수 롤백은 소비도 롤백·실행 실패는 환급 없음 ⑦ 두 허용 실패 분기의 새 동의·키·요청 연결 ⑧ ACTIVE/RECOVERING/UNKNOWN/EMPTY/정상·유효 부분 결과/기존 Catch 재요청 거부 |
| C3 메시지·컨텍스트: api/test/u7-worker-context.test.cjs, 양쪽 worker-messages 검사 | ① 네 종류 메시지 v2 동등 판정 ② 필수 관측 누락·추가 필드·잘못된 조합 거부 ③ v1 혼입 거부·이미지 정본 일치 ④ DB 사본과 큐 범위 각각 검증 ⑤ 요청 당시 좌표 유지·연결 교체 거부 ⑥ 내부 인증·타 회원·지난 시도 거부 ⑦ 삭제된 부모 컨텍스트 거부 ⑧ 큐·응답·로그에 자격정보 비노출 |
| C4 worker: worker/tests/test_u7_observation.py, test_u7_pipeline.py, test_u7_budget.py | ① 완전 조회 본인 0개는 NONE·Catch 없음 ② 본인 커밋 발견은 FOUND ③ 한계/조회 불명은 UNKNOWN ④ 후보 0개·중복 묶음과 커밋 관측 구분 ⑤ 조기 종료·생성 실패·부분 결과의 관측 보존 ⑥ 약 500개 목록/상세/관계/후보/생성 개수 대조 ⑦ 호출·시간·bytes·프레임 상한과 안전한 실패 ⑧ 기존 가리기·기여·Haiku·재시도 0 유지 |
| C5 수신·상태: api/test/analysis/u7-receiver.test.cjs, 기존 수신/DB 검사 | ① 정상 관측 저장·Catch 반영 후 열람 준비 ② 관측 불일치·수신 맥락 위조 거부 ③ 중복·동일 ID 다른 내용·지난 결과 거부 ④ 부모 삭제 뒤 늦은 결과 차단 ⑤ 본인 기록 없음과 일반 0개/부분 실패 구분 ⑥ 처리/반영/lifecycle별 상태와 조회 실패 분리 ⑦ 닫힌 반영 실패·처리 시한의 기존 재요청 조건 ⑧ 소유권·같은 작업·반영 실패 트랜잭션 보호 |
| C6 화면: web/test/repository-registration.test.mjs, 기존 분석·모달 검사 | ① 하단 주소 등록·상단 이력 보존 ② 등록 뒤 현재 고지·새 동의로만 분석 ③ 비공개/지원 불가/확인 불가/한도 개별 안내 ④ NONE/UNKNOWN/FOUND·수집 한계 구분 ⑤ 상태 조회 실패는 분석 실패/자동 접수로 바뀌지 않음 ⑥ 응답 불명의 키·본문·재열기 보존 ⑦ 허용된 실패만 재요청·정상/부분 결과 재생성 없음 ⑧ 회원/연결 변경·취소·중복 클릭·Catch 이동·키보드 초점 |

거부 사례 AC1.2.3·6·7·8은 각각 독립 시험으로 둔다. private임을 확인하지 못한 404를 private로 단정하지 않는다. C2의 KST 계산/원자 소비는 U2 실제 C-03 제공자와도 통합 확인한다. 시험 대역만 통과하면 실제 C-03 연결은 미검증이다.

## 경계 통합 8종

| ID | 경계와 통과 조건 |
|---|---|
| I1 | 회원 등록→새 동의→접수 DB: 같은 회원·GitHub ID·불변 사본을 보존 |
| I2 | 접수→C-03: 실제 제공자와 동시성·중복·거부·롤백 확인 |
| I3 | 접수 DB→dispatcher→worker 컨텍스트: v2와 당시 범위·현재 연결을 일치시킴 |
| I4 | worker 수집→후보→생성→Result: 관측·실패·한계를 끝까지 보존 |
| I5 | 실제 Valkey 왕복→수신·receipt→Catch DB: 동등 메시지 판정과 반영/수신 구분 |
| I6 | 회원/등록/요청 삭제→늦은 컨텍스트·결과: 부활·타 회원 반영 없음 |
| I7 | web 등록→동의→상태→Catch: 실제 API 연결과 본인 화면, 거부 안내 |
| I8 | 약 500개→전송→반영: 단계별 개수·시간·크기·제외 사유를 대조하며 전체 분석이라고 과장하지 않음 |

합성 연결 검사는 api/test/integration/u7-analysis-chain.test.cjs, worker U7 파이프라인/상한 시험, 기존 큐 검사를 확장한다. 실제 GitHub·생성 실행과 합성 연결의 결과를 별도로 기록한다.

## api 실행 명령

작업 디렉터리 api/. test-with-db.cjs가 전용 시험 DB에 마이그레이션을 적용한다. _test 접미사와 접속 대상이 시험 전용인지 확인한다. 같은 DB를 쓰는 명령은 병렬로 실행하지 않는다. TEST_DB_*는 기존 설정을 보존하며 비밀값을 출력하지 않는다.

등록·접수·삭제:
```powershell
npm.cmd test -- test/repository-registration.test.cjs test/db/repository-registration.test.cjs test/db/u7-analysis-intake.test.cjs test/db/analysis-intake.test.cjs test/db/analysis-intake-real.test.cjs test/db/analysis-request-history.test.cjs test/db/analysis-notice.test.cjs test/db/member-cascade-delete.test.cjs
```

컨텍스트·메시지·수신·연결:
```powershell
npm.cmd test -- test/u7-worker-context.test.cjs test/worker-messages.test.cjs test/analysis/u7-receiver.test.cjs test/analysis/receiver.test.cjs test/analysis/deadline-decision.test.cjs test/integration/u7-analysis-chain.test.cjs test/integration/analysis-intake-real-chain.test.cjs test/integration/analysis-queue-dispatch.test.cjs test/integration/analysis-queue-consumer.test.cjs test/integration/analysis-deadline.test.cjs test/integration/analysis-queue-valkey.test.cjs
```

같은 자료를 읽는 양 언어 fixture 검사도 동일한 v2로 전환한다.
```powershell
npm.cmd test -- test/analysis/shared-fixtures.check.cjs
```

## 동시 삭제·수신 보완 검사

대상은 api/test/integration/receiver-parent-locking.test.cjs다. 실제 PostgreSQL·DatabaseReceiverStore·AnalysisReceiver를 사용하며, GitHub와 생성 제공자를 호출하지 않는다. L1~L8은 회원/등록, 진행/결과, 삭제 선행/수신 선행의 2×2×2 조합이다. 시험 장벽과 pg_blocking_pids로 대기 관계를 확인하고, 단순 sleep이나 SQL 모양 검사만으로 통과시키지 않는다.

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| L1~L4 | 회원 또는 등록 삭제가 먼저 부모 잠금을 잡은 뒤 진행 또는 결과 수신 시작 | 삭제가 정상 커밋되고 수신은 기존 맥락 거부로 끝난다. 40P01·수신 저장 오류로 대체되지 않으며 삭제된 하위 자료를 되살리지 않는다 |
| L5~L8 | 진행 또는 결과 수신이 먼저 부모 잠금을 잡은 뒤 회원 또는 등록 삭제 시작 | 삭제가 수신 커밋까지 대기한 뒤 정상 커밋된다. 수신도 정상 종결되며 삭제 뒤 해당 요청·시도·수신 기록이 없고 다른 회원 자료는 유지된다 |
| L9 | 최초 요청 조회 뒤 회원 또는 등록이 삭제됨 | 잠금 후 최신 부모 존재 여부를 확인해 거부하며 오래된 조회를 수신 맥락으로 쓰지 않는다 |
| L10 | 최초 조회와 요청 잠금 사이에 요청의 부모 참조가 바뀜 | 이미 잠근 부모와 다른 요청 맥락을 거부한다. 자식 잠금을 유지한 채 새 부모를 추가 잠금하지 않는다 |
| L11 | 최초 조회와 요청 잠금 사이에 현재 시도가 바뀜 | 잠금 후 현재 시도를 사용해 지난 시도 메시지를 거부하고, 새 시도의 상태와 수신 기록을 오염시키지 않는다 |

자신이 만든 합성 회원의 식별자를 생성 즉시 기록하고 종료 시 그 자료만 정리한다. 시험 장벽·대기 확인 실패는 시험 실패로 남기며 교착 오류를 재시도해 감추지 않는다. 실행 제한 시간은 무한 대기를 막는 시험 장치로만 사용한다.

작업 디렉터리 api/. 같은 전용 DB를 쓰는 명령은 순서대로 실행한다. 새 파일 작성 전에는 기존 수신 회귀 파일만 실행해 실행기·DB 준비를 확인한다.

```powershell
npm.cmd test -- test/integration/receiver-registration.test.cjs
```

구현과 새 시험 파일 작성 뒤 새 동시성 사례와 영향 경계 회귀를 실행한다.

```powershell
npm.cmd test -- test/integration/receiver-parent-locking.test.cjs test/analysis/u7-receiver.test.cjs test/analysis/receiver.test.cjs test/integration/receiver-registration.test.cjs test/db/member-cascade-delete.test.cjs test/db/result-application.test.cjs test/integration/result-application-b.test.cjs test/analysis/deadline-decision.test.cjs
```

정적 검사는 API README의 lint/typecheck/build 명령을 따른다. 아래 기존 API 커버리지 묶음에 새 test/integration/receiver-parent-locking.test.cjs와 test/integration/receiver-registration.test.cjs를 함께 넣어 실행한다. TEST_COVERAGE_INCLUDE는 실제 변경 파일을 포함하고 80% 기준을 유지하며, 환경 변수를 복원하기 전에 검사 종료 코드를 보관해 실패를 성공으로 보고하지 않는다. 잠금 보완 결과는 code-summary에 이전 실행과 구분해서 기록한다.

## worker 실행 명령

작업 디렉터리 worker/. 합성 GitHub·합성 생성 제공자·가짜 시계를 사용한다. LIVE 함수 이름이 있는 시험도 외부 서비스 실제 실행을 뜻하지 않는다.

관측·접수·결과:
```powershell
uv run --locked pytest tests/test_u7_observation.py tests/test_u7_pipeline.py tests/test_u7_budget.py tests/test_worker_messages.py tests/test_request_check.py tests/test_processing.py tests/test_request_context.py tests/test_request_context_settings.py tests/test_live_processing.py
```

수집·기여·생성·큐 경계:
```powershell
uv run --locked pytest tests/test_collection_boundary.py tests/test_collection_controls.py tests/test_collection_flow.py tests/test_collection_relations.py tests/test_collection_graphql.py tests/test_collection_lookup_batches.py tests/test_collection_transport.py tests/test_lookup_call_budget.py tests/test_candidate_cases.py tests/test_candidate_flow.py tests/test_candidate_grouping.py tests/test_candidate_identity.py tests/test_candidate_same_change.py tests/test_generation_flow.py tests/test_generation_redact.py tests/test_generation_patch.py tests/test_generation_material.py tests/test_generation_response.py tests/test_generation_title.py tests/test_generation_rewrite_coverage.py tests/test_generation_claude.py tests/test_consumer_processor.py tests/test_consumer_receipts.py tests/test_consumer_settings.py tests/test_consumer_redis.py
```

실제 큐 시험은 시험 전용 CATCHU_TEST_REDIS_URL이 준비되어야 한다. 미설정에 따른 skip은 별도로 센다. 실제 서비스 계정·API 키를 일반 자동 시험에 넣지 않는다.

## web 실행 명령

작업 디렉터리 web/. 기존 API 대역과 상태 객체·순수 응답/상태 변환 검사를 재사용한다.
```powershell
node --test test/repository-registration.test.mjs test/repository-management.test.mjs test/repository-connection-recheck.test.mjs test/repository-options-store.test.mjs test/analysis-request.test.mjs test/analysis-request-retry.test.mjs test/analysis-request-response.test.mjs test/analysis-request-rate-limit.test.mjs
```

화면 확인은 위 자동 시험에 더해 실제 모달에서 760·1024·1536px, 키보드 초점·닫기/재열기·입력 오류·Catch 이동을 확인한다. HTML 문자열 검사만으로 화면 검증 완료라고 쓰지 않는다.

## 줄 커버리지

Unit 구현의 줄 커버리지 목표는 80% 이상이다. 각 서비스의 기존 도구로 측정하며, 실행하지 않은 파일을 분모에서 빠뜨려 비율을 올리지 않는다. 실제 변경 파일 목록과 측정 대상의 교집합/누락을 보고하고 Node 보고서에 없는 변경 파일은 0%로 합산한다. API는 dist 기준, web 변환 TSX의 원본 줄 대응 한계도 함께 적는다. 아래 범위 밖에 U7 변경 파일이 생기면 그 파일도 포함해 다시 측정한다.

api/에서는 TEST_COVERAGE_INCLUDE를 일시 설정하고 원래 값을 복원한다.
```powershell
$u7PreviousCoverage = $env:TEST_COVERAGE_INCLUDE
try {
  $env:TEST_COVERAGE_INCLUDE = 'dist/{member-repositories,analysis-intake,member-analysis,worker-context,analysis-queue,analysis-receiver,result-application}/**'
  npm.cmd run test:coverage -- test/repository-registration.test.cjs test/db/repository-registration.test.cjs test/db/u7-analysis-intake.test.cjs test/db/analysis-intake.test.cjs test/db/analysis-intake-real.test.cjs test/db/analysis-request-history.test.cjs test/db/analysis-notice.test.cjs test/db/member-cascade-delete.test.cjs test/u7-worker-context.test.cjs test/worker-messages.test.cjs test/analysis/u7-receiver.test.cjs test/analysis/receiver.test.cjs test/analysis/deadline-decision.test.cjs test/integration/u7-analysis-chain.test.cjs test/integration/analysis-intake-real-chain.test.cjs test/integration/analysis-queue-dispatch.test.cjs test/integration/analysis-queue-consumer.test.cjs test/integration/analysis-deadline.test.cjs test/integration/analysis-queue-valkey.test.cjs test/analysis/shared-fixtures.check.cjs
} finally {
  if ($null -eq $u7PreviousCoverage) { Remove-Item Env:TEST_COVERAGE_INCLUDE -ErrorAction SilentlyContinue } else { $env:TEST_COVERAGE_INCLUDE = $u7PreviousCoverage }
}
```

web/:
```powershell
node --test --experimental-test-coverage '--test-coverage-include=src/features/{repository-management,analysis-request}/**' '--test-coverage-include=src/features/assets/repository-options-store.ts' test/repository-registration.test.mjs test/repository-management.test.mjs test/repository-connection-recheck.test.mjs test/repository-options-store.test.mjs test/analysis-request.test.mjs test/analysis-request-retry.test.mjs test/analysis-request-response.test.mjs test/analysis-request-rate-limit.test.mjs
```

worker/:
```powershell
uv run --locked pytest --cov=app/collection --cov=app/candidates --cov=app/generation --cov=app/processing --cov=app/contract --cov=app/request_context --cov=app/consumer --cov-report=term-missing --cov-fail-under=80 tests/test_u7_observation.py tests/test_u7_pipeline.py tests/test_u7_budget.py tests/test_worker_messages.py tests/test_request_check.py tests/test_processing.py tests/test_request_context.py tests/test_request_context_settings.py tests/test_live_processing.py tests/test_collection_boundary.py tests/test_collection_controls.py tests/test_collection_flow.py tests/test_collection_relations.py tests/test_collection_graphql.py tests/test_collection_lookup_batches.py tests/test_collection_transport.py tests/test_lookup_call_budget.py tests/test_candidate_cases.py tests/test_candidate_flow.py tests/test_candidate_grouping.py tests/test_candidate_identity.py tests/test_candidate_same_change.py tests/test_generation_flow.py tests/test_generation_redact.py tests/test_generation_patch.py tests/test_generation_material.py tests/test_generation_response.py tests/test_generation_title.py tests/test_generation_rewrite_coverage.py tests/test_generation_claude.py tests/test_consumer_processor.py tests/test_consumer_receipts.py tests/test_consumer_settings.py tests/test_consumer_redis.py
```

## 시험 자료와 결과 기록

DB 자료는 시험에서 생성한 합성 회원·등록·동의·Catch로 제한하고 기존 격리·초기화 도우미를 재사용한다. 외부 경계는 합성 HTTP·제공자·시계로 정상·거부·지연·과대 응답을 제어한다. 실제 코드·diff·토큰·개인정보를 fixture나 출력에 남기지 않는다.

실제 분석은 [관측 설계](../nfr-design/observability-design.md)와 [성능 설계](../nfr-design/performance-design.md)의 조건·증거 항목을 따른다. OQ2 미결, U2 실제 제공자 미연결, 비용·자료 조건 미충족이면 미실행으로 남긴다. 새 등록부터 실제 수집·생성·DB 반영·본인 화면 Catch/근거, 실제 거부 1~2종, 약 500개 단계별 대조 결과를 별도로 기록한다.

결과에는 기준 커밋·도구 판본·명령·통과/실패/skip 수·커버리지·실제/합성 구분·미실행 이유를 적는다. 이 문서의 명령 자체는 검사 통과 증거가 아니다.

