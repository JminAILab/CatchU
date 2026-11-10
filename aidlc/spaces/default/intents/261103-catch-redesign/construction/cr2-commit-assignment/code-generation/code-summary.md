# CR2 소속 저장 — 코드 요약

입력: 승인된 코드 생성 계획 `code-generation-plan.md`, 시험 안내 `unit-test-instructions.md`, 기능 설계 `functional-design/`(W1~W7, BR1.x~BR4.1), 비기능 요구사항·설계 `nfr-requirements/`·`nfr-design/`, 계약 `inception/contract-design/contract-summary.md`(C1·C2).

## 한눈에

- api가 결과 반영의 등록 트랜잭션에서 커밋마다 소속 Catch를 기록하고(`commit_assignment`), worker 맥락 조회에 그 회원·저장소의 소속 SHA 전체를 `assignedCommitShas`로 준다.
- worker는 단위를 지금 규칙대로 다 정한 뒤 소속 변경을 빼고, 남은 새 변경으로만 후보를 만든다. 후보마다 본인 커밋 전체를 결과 v3의 `ownCommitShas`에 싣는다.
- 결과 메시지만 판본 "3"이다. 요청·진행 상태·수신 응답은 "2" 그대로다. 화면(web)은 바꾸지 않았다.

## 바꾼 파일

### api

| 파일 | 바뀐 것 |
|---|---|
| `api/src/catches/entities/commit-assignment.entity.ts`(새) | 소속 기록 엔티티. 기본 키 (member_id, github_repository_id, commit_sha), 외래 키 (catch_id, member_id) → catch_asset(catch_id, owner_id) 연쇄 삭제, 색인 (catch_id, member_id), CHECK 2개, assigned_at 기본 now() |
| `api/src/database/migrations/1794054790720-CreateCommitAssignment.ts`(새) | catch_asset 유일 조건 → 표·제약 → 색인 → 외래 키, down 역순 |
| `api/src/catches/entities/catch-asset.entity.ts` | `@Unique(['catchId', 'ownerId'])` |
| `api/src/catches/registration-batch.ts`·`registration-input-error.ts` | `RegistrationCandidate.ownCommitShas` 검사(1~3,000, 소문자 40자, 중복 없음, 필드 `ownCommitShas`), `PreparedWorkGroup.ownCommitShas` 합집합(처음 나온 순서) |
| `api/src/catches/registration-service.ts` | 열쇠마다 Catch를 찾고 `assertReady` 뒤 1,000행씩 `insert().values().orIgnore()`. 재응답 경로는 쓰지 않음 |
| `api/src/worker-context/worker-context.service.ts` | 최종 트랜잭션 안에서 `commit_sha`를 한 번 읽어 `assignedCommitShas` |
| `api/src/analysis-receiver/receiver.types.ts` | `Result.schemaVersion: '3'`, `Candidate.ownCommitShas` |
| `api/contracts/repository-analysis/worker-messages.yaml` | `Result.schemaVersion` enum ["3"], `Candidate.ownCommitShas` 필수 |
| 문서 | `api/docs/worker-context.md`(C1 칸), `repository-analysis-u7.md`(판본 문장, 재분석 단락), `catch-registration-rules.md`(「소속 기록 (CR2)」 절), `catch-registration-database.md`(표·마이그레이션), `member-withdrawal-deletion.md`(삭제 목록 행) |

### worker

| 파일 | 바뀐 것 |
|---|---|
| `app/candidates/grouping.py` | `group(outcome, assigned=frozenset())`, 7단계 소속 빼기(`_without_assigned`·`_links_kept`), `GroupedUnit.via_assigned`, `Grouping.assigned_units` |
| `app/candidates/build.py` | `build_candidates(request, outcome, assigned=frozenset())`, 후보의 `own_commit_shas`(최근 것부터), 같은 열쇠 합치기의 목록 잇기, 고정 문장, 로그 `assignedShas=%d assignedUnits=%d`(이른 종료 줄은 0) |
| `app/processing/generation.py`·`result.py`·`fake_generator.py` | `EligibleCandidate.own_commit_shas`, 결과 `"3"`·`ownCommitShas`, 합성 결과도 같은 규칙 |
| `app/request_context/decode.py`·`client.py`·`settings.py` | `assignedCommitShas` 필수 해석, `ContextFound.assigned_commits`, 응답 상한 1 MiB |
| `app/processing/live.py`, `app/generation/flow.py`·`material.py` | 소속 집합을 후보 판정과 재료 찾기에 같은 값으로 전달(`run_generation(..., assigned=)`, `gather(..., assigned)`) |
| `fixtures/m1-synthetic/results/*.json`(7개) | 판본 "3", 후보마다 합성 `ownCommitShas` |
| 문서 | 새 `docs/commit-assignment.md`, `request-context.md`, `candidate-decision.md`, `generation.md`, `generation-material.md`, `candidate-text.md`, `repository-analysis-u7.md`, `queue-consumer.md`, `README.md` |

### 공용 문서

`docs/CatchU_work_identity_cases.md`(C3), `docs/CatchU_작업동일성_판별기준.md`(35행), `docs/CatchU_work_identity_rules.md`(19·86행).

## 결정

- **소속 표의 기본 키는 열쇠 세 칸이다.** 기능 설계 엔티티의 identifier가 (회원, 저장소, SHA)이고 따로 둔 내부 ID가 없어 이 세 칸을 기본 키로 두었다(계획의 「유일 (member_id, github_repository_id, commit_sha)」을 기본 키로 만족). 충돌 무시 삽입과 맥락 조회 색인(앞 두 칸)은 그대로 성립한다.
- **SHA 형식 검사를 등록 입력에도 둔다.** 결과 검사(계약 YAML)가 먼저 막지만, 등록 함수의 기존 방식(빈 필수 내용도 다시 거부)에 맞춰 `prepareRegistrationBatch`도 같은 경계로 거부한다.
- **같은 변경으로 하나로 센 수(`merged_in`)는 PR·병합 단위도 남은 변경으로 다시 센다.** 규칙 BR1.8의 「단위 수준 값」 목록(다른 PR로 보낸 수·안쪽 병합 수·메모)에 들지 않는 변경 단위 값이라 BR1.5(남은 변경으로)를 따랐다. 뺀 변경이 없으면 지금 값 그대로다.
- **고정 문장은 소속 변경을 하나라도 뺀 커밋 묶음에 남은 커밋이 둘 이상이면 늘 붙인다**(BR1.8 logic 그대로).
- **`EligibleCandidate.own_commit_shas`는 기본값이 빈 튜플이다.** 판정·합성 생성기가 채우고, 비면 결과 계약(1개 이상)이 거부한다. 기존 시험의 후보 생성 3곳을 그대로 두기 위해서다.
- **3,000개 SHA 등록에 더해진 시간(참고, 통과 조건 아님):** SHA 1개 등록 8.8ms, 3,000개 100.7ms, 더해진 시간 **91.9ms**(시험 DB 127.0.0.1:5433, `registration-postgres.test.cjs` 「CR2 본인 커밋 3,000개」의 진단 줄). 앞선 한 번은 96.1ms였다.

## 계획과 다른 점

- `api/src/worker-context/worker-context.types.ts`에는 칸을 더하지 않았다. 이 파일에 응답 모양 타입이 없고 응답은 서비스가 바로 만든다. 새 타입을 만드는 대신 서비스 응답에 칸을 더했다.
- 계획의 함께 고칠 문서 목록 밖에서, 같은 규칙(「네 메시지 모두 v2」)을 적은 문서를 프로젝트 규칙에 따라 더 고쳤다: `worker/docs/repository-analysis-u7.md` 3행, `worker/docs/queue-consumer.md` 3행, `worker/README.md` 191행(합성 세트의 「스키마 v2 판정」).
- 계획 목록 밖의 기존 시험을 새 계약에 맞춰 고쳤다(동작 기대값은 바꾸지 않음).
  - api: `test/support/catch-db-fixture.cjs`(새 마이그레이션·엔티티, 합성 `ownCommitShas`), `test/helpers/receiver-harness.cjs`(결과 "3"), `test/integration/result-application-b.test.cjs`(마이그레이션 목록·표 수 32, 소속 표 되돌리기 확인), `test/catches/null-title-migration.test.cjs`·`evidence-position-migration.test.cjs`(앞에 소속 표 되돌리기 한 번 더).
  - worker: `tests/test_collection_controls.py`(`_Found` 대역에 소속 집합), `test_collection_flow.py`(손으로 만든 후보에 본인 커밋), `test_generation_material.py`(`group` 대역의 새 인자), `test_generation_response.py`(후보 칸 목록), `test_generation_title.py`(`run_generation` 인자 목록).
- `queue-harness.cjs`는 결과를 공용 자료에서 읽어 고칠 것이 없었다.

## 시험

### 쓴 시험(구현 뒤, 팀 시험 순서)

| 파일 | 더한 시험 | 덮는 것 |
|---|---|---|
| `api/test/catches/registration-postgres.test.cjs` | 9 | 새 Catch 30개 소속(AC1.1.4), 기존 Catch에 새 SHA만·내용·설명·저장 시각 그대로(AC1.2.1), 다른 Catch 소속 건너뜀(AC1.1.1·AC1.2.2), 같은 열쇠 합집합, 재응답은 안 씀, 3,000개(1,000행 묶음)와 시간, 다른 회원 외래 키 거부·CHECK, 소속 쓰기 DB 오류 전체 롤백, Catch 삭제 연쇄 |
| `api/test/catches/registration-batch.test.cjs` | 2 | 합집합 순서, 목록 누락·빈·3,001개·대문자·중복 거부(값 미노출) |
| `api/test/db/worker-context-api.test.cjs` | 2(+기존 1 고침) | 빈 배열, 그 회원·저장소 것만(다른 회원·저장소 제외), 조회 실패 500·내부 문구 없음 |
| `api/test/u7-worker-context.test.cjs` | 1 | 결과만 v3, 요청·진행·수신 응답 v2 |
| `api/test/analysis/receiver.test.cjs` | 1 | "3" 수신, "2"·목록 빠짐·형식 오류·3,001개 `SCHEMA_INVALID` |
| `api/test/db/member-cascade-delete.test.cjs` | 기존 시험에 표 한 줄 | 탈퇴 뒤 소속 0건, 남는 회원의 소속 유지(AC1.1.6) |
| `api/test/catches/upstream-foreign-keys.test.cjs` | 1 | 새 외래 키 메타데이터·연쇄 삭제·마이그레이션 SQL 대조 |
| `worker/tests/test_candidate_assignment.py`(새) | 19 | W1, W3, W4, W5(이어진 연결·빈 연결·커밋 하나), W6(후보 0·미제공 0·로그 두 숫자·SHA 없음), 이른 종료 줄 0, BR1.1 같은 변경, 빈·무관 집합이면 지금과 같음(AC1.1.8), 결정성(AC1.1.5), 재료 찾기(AC1.1.7)와 다른 집합의 결함 |
| `worker/tests/test_request_context.py` | 11 | 새 칸 해석(빈 배열·집합), 3,000개 응답, 형식·중복·칸 없음 `CONTEXT_RESPONSE_INVALID` |
| `worker/tests/test_request_context_settings.py` | 1 | 기본 상한 1 MiB |
| `worker/tests/test_processing.py` | 9(시나리오 8개 매개변수 포함) | 합성 결과 "3"·`ownCommitShas`, 조합 순서 |
| `worker/tests/test_worker_messages.py` | 2 | 공용 자료의 판본·목록 형식, "2" 결과·목록 오류 거부 |
| `worker/tests/test_live_processing.py` | 2 | 맥락의 소속 집합이 후보 판정과 재료 찾기에 같은 값으로 감, 모두 소속이면 EMPTY·제공자 안 만듦 |

### 돌린 시험과 결과

| 명령 | 결과 |
|---|---|
| api Unit 명령(`unit-test-instructions.md`, 7개 파일) | 158 통과, 0 실패 |
| worker Unit 명령(10개 파일) | 617 통과, 0 실패(시작 전 기준 573) |
| api 추가 확인(바꾼 공용 도우미를 쓰는 12개 파일: 결합·마이그레이션 사슬·dev 주입·u7 수신·Catch HTTP·받는 사람 HTTP 등) | 147 통과, 1 건너뜀(기존), 0 실패 |
| worker 전체 pytest(intent 검증 명령이 아닌 회귀 확인, 커버리지 없음) | 2,581 통과, 12 건너뜀(기존), 0 실패, 138초 |
| `npm --prefix api run lint`·`typecheck` | 통과 |
| worker `ruff check .`·`ruff format --check`·`mypy` | 통과(새로 고친 시험 파일 3개를 `ruff format`으로 맞춤) |
| 문서 크기 검사 `.github/scripts/check-doc-sizes.sh` | 통과. 새 `worker/docs/commit-assignment.md`는 아직 추적 전이라 검사 목록에 안 잡혀 따로 쟀다: 6,144 B |

시작 전 기준 확인(Step 2): api Unit 명령 142개 중 141 통과·1 실패(`worker-context-api` 「GitHub 확인 중 closed 변경」이 382초 멈춘 뒤 `fetch failed ECONNRESET`). 그 파일만 다시 돌리니 41/41 통과해 부하 때 생긴 것으로 보았다.

### 쓰고 돌리지 않은 시험

없다. 실제 GitHub·실제 api로 잇는 확인은 아래 「로컬 실제 연결 확인」이다.

## 검증

- Unit 시험 명령·lint·typecheck·ruff·mypy·문서 크기 검사는 위와 같다.
- intent 검증 명령(오케스트레이터, 2026-11-08, 60분 상한): **종료 코드 0, 11분 57초.** api(lint·typecheck·시험·커버리지) 약 8분 51초, web 약 19초, worker(ruff·mypy·pytest 2,581 passed·12 skipped, 커버리지 96%) 약 2분 48초.
  - 앞선 시도(2026-11-07)는 배터리로 돌 때 60분 상한에 걸렸다(실패한 시험 없음). 충전기를 연결한 뒤 api만 따로 재니 8분 50초였고 실패·멈춘 시험이 없었다.

## 로컬 실제 연결 확인

2026-11-08, 팀장. 도구는 `cr1-live-tools`(이 작업 폴더 판본, cr1 DB 그대로)를 썼다. 저장소는 CR1 때 만든 공개 시험 저장소 `ljm0850/catchu-live-test`다(처음 정한 `ljm0850/algo-problem`에서 팀장이 바꿈). 로그인·GitHub 연결·저장소 등록·분석 요청·커밋 올리기는 팀장이 했다. 아래는 worker 로그 「후보 판정 종료」 줄과 DB 건수만 적었다. 저장소 원문과 SHA는 적지 않았다.

시작 전 cr1 DB 상태는 Catch 52개, 소속 기록 0건이었다. Catch는 모두 CR2 전에 만든 것이다.

| 회차 | worker 로그 | 결과 | Catch | 소속 기록 | 작성자 설명 |
|---|---|---|---|---|---|
| ① 첫 분석 | `candidates=6 assignedShas=0 assignedUnits=0`, 미제공 0 | SUCCEEDED·APPLIED. 후보 6개 모두 CR2 전 같은 열쇠 Catch로 이어짐(`EXISTING` 6) | 52 그대로 | 0 → 10(Catch 6개) | 이 저장소 Catch 2개에 팀장이 씀(① 앞 1개, ① 뒤 1개), 각 소속 2건 |
| ② 그대로 재분석 | `candidates=0 assignedShas=10 assignedUnits=6`, 미제공 0 | EMPTY·APPLIED | 52 그대로(새 Catch 0) | 10 그대로 | 2개 모두 저장 시각 그대로 |
| ③ 새 커밋 1개 뒤 재분석 | `candidates=1 assignedShas=10 assignedUnits=6`, 미제공 0 | SUCCEEDED·APPLIED. 새 Catch 1개(`CREATED` 1) | 53 | 10 → 11(새 Catch에 1건, 앞 Catch 6개의 10건 그대로) | 2개 모두 저장 시각·소속 그대로 |

- B3 완료 조건 「두 번째 분석이 새 Catch를 만들지 않는다」는 ②로 확인했다.
- CR2 전에 만든 Catch가 재분석 때 이어지며 소속을 처음 얻는 길은 ①로 확인했다.
- 새 커밋만 새 Catch가 되고 앞 Catch의 소속·작성자 설명이 그대로인 것은 ③으로 확인했다.
- ①의 본인 커밋 관측은 15개였고 소속은 10건이었다. 소속은 기여 근거가 되는 본인 커밋만 쓴다(BR2.1).

「같은 PR에 커밋이 더해진」 경우(US1.2 AC1.2.1)는 병합된 PR에 커밋을 더할 수 없어 실제 저장소로 만들기 어렵다. 합성 시험 W3(`worker/tests/test_candidate_assignment.py`의 같은 PR 새 커밋 시험, `api/test/catches/registration-postgres.test.cjs`의 기존 Catch에 새 SHA만 더하는 시험)으로 갈음한다.

## 한계

- 맥락 조회 응답이 1 MiB(소속 SHA 약 24,000개)를 넘으면 그 저장소의 재분석이 매번 `CONTEXT_RESPONSE_TOO_LARGE`로 끝난다. api는 목록을 자르지 않는다.
- 단위 미확정으로 보류한 본인 변경은 소속이어도 지금처럼 미제공(판정 불가)으로 센다.
- CR2 배포 전에 만든 Catch는 소속이 없다. 다음 재분석에서 같은 열쇠로 이어지며 소속이 써진다.
- 기존 PR에 아주 작은 커밋만 더해지면 기준 미달로 후보가 되지 않을 수 있고, 그 커밋은 다음 재분석에서 다시 판정된다.
- 같은 PR의 새 커밋 후보에도 생성(AI 쪽이 켜졌으면 판정도)을 부르고 그 결과는 버려진다(ADR-001이 받아들인 낭비).
- 합성(MOCK) 결과도 소속을 쓴다. 합성 자료의 SHA는 사례끼리 겹칠 수 있어 같은 회원·저장소로 여러 사례를 돌리면 뒤 사례의 같은 SHA는 건너뛴다(오류 아님).

## 운영에 넣을 때

- api와 worker를 같은 배포에 넣는다. worker는 `assignedCommitShas`가 없는 옛 응답을 받지 않고(`CONTEXT_RESPONSE_INVALID`), api는 "2" 결과를 받지 않는다(`SCHEMA_INVALID`). 옛 판본을 함께 받는 처리는 없다.
- 진행 중인 분석이 없을 때 배포한다. 큐에 남은 옛 판본 작업은 실패로 끝나도 된다(BR4.1).
- 마이그레이션 `1794054790720-CreateCommitAssignment`를 api 배포 전에 적용한다. `down`은 소속 표와 catch_asset 유일 조건을 지운다(소속 기록도 사라진다).
- 새 환경변수는 없다. 맥락 조회 응답 상한(1 MiB)은 코드 기본값이다.
