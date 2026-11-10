# CR2 소속 저장 — 코드 생성 계획

## Summary

- Builds: 커밋마다 소속 Catch를 저장하고, 재분석 때 이미 소속된 커밋을 빼서 같은 작업이 새 Catch를 만들지 않게 한다(결과 메시지 v3, 맥락 조회 새 칸)
- Touches: api `catches`·`worker-context`·`analysis-receiver`·마이그레이션·계약 YAML, worker `request_context`·`candidates`·`generation/material`·`processing`, 공용 시험 자료 `worker/fixtures/m1-synthetic/results`, api·worker 문서
- Tests: api 약 14개(등록·소속·맥락 조회·수신 판본·탈퇴 연쇄 삭제), worker 약 18개(빼기·열쇠·묶음 설명·해석·결과 조합·로그), 기존 시험 판본 갱신, 로컬 실제 연결 확인 1회

입력:
- 기능 설계 `construction/cr2-commit-assignment/functional-design/`(`functional-spec.md`·`rules.md`·`entities.md`)
- 비기능 요구사항·설계 `construction/cr2-commit-assignment/nfr-requirements/`·`nfr-design/`(검토 Minor 포함)
- 계약 `inception/contract-design/contract-summary.md`(C1·C2), Unit `inception/units-generation/unit-of-work.md`, 요구사항 `inception/requirements-analysis/requirements.md`
- 납품 계획 `inception/delivery-planning/bolt-plan.md` B3 완료 조건

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

## 이 계획이 고치는 사람 쪽 파일

이 작업 전부터 있던 파일 가운데 이 계획이 고치는 것이다. 같은 규칙을 적은 문서를 모두 넣었다(프로젝트 규칙).

- 계약·api 문서: `api/contracts/repository-analysis/worker-messages.yaml`, `api/docs/worker-context.md`, `api/docs/repository-analysis-u7.md`(37행 판본 문장, 「기존 Catch를 보존하는 재분석」 둘째 단락), `api/docs/catch-registration-rules.md`, `api/docs/catch-registration-database.md`, `api/docs/member-withdrawal-deletion.md`(삭제 목록 표, 12월 intent 파일이지만 이 계획이 행 하나를 더한다)
- worker 문서: `worker/docs/request-context.md`(74행 「응답 본문 64 KiB」와 새 칸), `worker/docs/candidate-decision.md`, `worker/docs/generation.md`(「재료 찾기」), `worker/docs/generation-material.md`(9행), `worker/docs/candidate-text.md`(33행), `worker/README.md`(문서 목록에 새 문서 한 줄)
- 작업 동일성 문서: `docs/CatchU_work_identity_cases.md`(21행 C3), `docs/CatchU_작업동일성_판별기준.md`(35행), `docs/CatchU_work_identity_rules.md`(19·86행 재분석 관련 줄)
- 공용 시험 자료: `worker/fixtures/m1-synthetic/results/*.json` 중 Result 7개(판본 "3", 후보마다 `ownCommitShas`)

## 단계

- [x] **Step 1. 시나리오·기대 결과·실패 조건 정하기** (팀 시험 순서) — 기능 명세 W1~W7을 시험 시나리오로 옮겨 `unit-test-instructions.md`에 적는다(이미 적음). 구현 전에 확정하고, 세부 시험 코드는 구현 뒤 쓴다.
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 2. 시험 실행기 확인** — `unit-test-instructions.md`의 api·worker Unit 명령이 지금 코드에서 돈다(시험 DB `catchu-db-test` 127.0.0.1:5433). 새 실행기·설정은 들이지 않는다.
- [x] **Step 3. api 소속 표와 마이그레이션** (BR3.6·BR3.7, NFR4.7·NFR4.8·NFR6.4)
  - 새 엔티티 `api/src/catches/entities/commit-assignment.entity.ts`(`commit_assignment`: member_id uuid, github_repository_id text, commit_sha char 40, catch_id uuid, assigned_at timestamptz 기본 now()). 유일 (member_id, github_repository_id, commit_sha), 외래 키 (catch_id, member_id) → catch_asset(catch_id, owner_id) ON DELETE CASCADE, 색인 (catch_id, member_id)(Catch 삭제 연쇄 때 훑지 않게, 비기능 설계 검토 Minor). 검사 제약: SHA 형식, 저장소 ID 빈 문자열 아님.
  - `catch-asset.entity.ts`에 `@Unique(['catchId', 'ownerId'])`.
  - 새 마이그레이션 `api/src/database/migrations/<시각>-CreateCommitAssignment.ts`: 유일 조건 → 표·제약·색인 순, down은 역순. 엔티티를 데이터 소스·모듈 목록에 등록한다.
  - 관련 스토리: US1.1
- [x] **Step 4. 결과 메시지 v3 계약과 api 수신 타입** (BR2.1·BR2.2, NFR6.1)
  - `worker-messages.yaml`: `Result.schemaVersion` enum ["3"], `Candidate.ownCommitShas`(필수, 1~3,000, 중복 없음, 소문자 40자). Request·ProcessingEvent·ResultReceipt는 "2" 그대로.
  - `api/src/analysis-receiver/receiver.types.ts`: Result 판본 "3", Candidate에 `ownCommitShas`.
  - 결과 후보 → 등록 입력: `api/src/catches/registration-batch.ts`의 `RegistrationCandidate`에 `ownCommitShas`, `PreparedWorkGroup`에 열쇠 후보들의 합집합(처음 나온 순서), `prepareRegistrationBatch`가 채운다. 후보를 등록 입력으로 옮기는 곳(`analysis-receiver/repository-registration.port.ts` 등)에서 값을 넘긴다.
  - `api/test/helpers/worker-messages.cjs`·`receiver-harness.cjs`·`queue-harness.cjs`의 결과 시험 자료를 "3"과 `ownCommitShas`로 고친다. `worker/fixtures/m1-synthetic/results/` Result 7개도 같이 고친다.
  - 관련 스토리: US1.1
- [x] **Step 5. api 소속 쓰기** (BR3.2~BR3.5, NFR4.2·NFR4.3·NFR4.4·NFR4.6)
  - `registration-service.ts`의 `registerCandidates`: 열쇠마다 Catch를 찾고 `assertReady`를 지난 뒤, 그 묶음의 `ownCommitShas`를 1,000행씩 `insert().values([...]).orIgnore()`로 쓴다(member_id = 입력 ownerId, github_repository_id = 수신 맥락의 `repository_id`, catch_id = 그 Catch). 새 Catch·기존 Catch 모두. 재응답 경로(저장된 등록이 있을 때)는 쓰지 않는다. 기존 Catch 내용 쓰기는 더하지 않는다.
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 6. api 맥락 조회 새 칸** (BR3.1, NFR4.8·NFR4.9)
  - `api/src/worker-context/worker-context.service.ts`: 응답을 만들 때 시도의 `memberId`·`repositoryId`로 `commit_assignment.commit_sha`를 한 번 읽어 `assignedCommitShas`(배열)로 싣는다. 조회 실패는 지금 500 경로. `worker-context.types.ts`에 칸 추가.
  - 관련 스토리: US1.1
- [x] **Step 7. worker 맥락 해석과 응답 상한** (BR2.3, NFR6.3)
  - `worker/app/request_context/decode.py`: 최상위 칸 목록에 `assignedCommitShas`를 더해 필수로 읽는다(배열, 소문자 40자, 중복 없음). `DecodedContext`·`ContextFound`에 `assigned_commits: frozenset[str]`.
  - `settings.py`의 `max_response_bytes` 기본값 1 MiB.
  - 시험 대역 `worker/tests/context_synthetic.py`·`live_synthetic.py`에 새 칸.
  - 관련 스토리: US1.1
- [x] **Step 8. worker 소속 빼기** (BR1.1~BR1.5·BR1.7·BR1.8, NFR4.1·NFR4.12)
  - `worker/app/candidates/grouping.py`: `group(outcome, assigned=frozenset())`. 단위를 지금처럼 정한 뒤 각 단위에서 소속 변경(그 변경의 commits·own_commits 중 하나라도 소속)을 뺀다. 뺀 단위에 기여·본인 변경이 없으면 버리고 수를 센다(`Grouping.assigned_units`). 커밋 묶음은 남은 커밋으로 `CommitsUnit`을 다시 만들고, 연결 쌍은 두 끝이 남은 것만, 같은 변경 수는 남은 변경으로 다시 세며, 소속 커밋을 뺀 표시(`via_assigned`)를 단다. PR·병합 단위의 단위 수준 값은 그대로.
  - `build.py`: `build_candidates(request, outcome, assigned=frozenset())`. `_bundle_links`는 `via_assigned`이면 고정 문장 「이미 다른 Catch에 속한 커밋을 거쳐 이어진 커밋도 한 묶음에 두었다.」를 더하고, 연결이 비어도 결함으로 멈추지 않는다(표시가 없을 때는 지금처럼 결함). 후보에 본인 커밋 목록 전체(`own_commit_shas`, 최근 것부터)를 싣고, 같은 열쇠 합치기는 남긴 후보 목록 뒤에 다른 후보의 새 SHA를 잇는다. `_log`에 `assignedShas=%d assignedUnits=%d`(이른 종료 줄은 둘 다 0).
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 9. worker 소속 집합 전달과 재료 찾기** (BR1.6, NFR4.1)
  - `worker/app/processing/live.py`: `self._found.assigned_commits`를 `build_candidates`와 `run_generation`에 같은 값으로 넘긴다.
  - `worker/app/generation/flow.py`·`material.py`: `run_generation(..., assigned=frozenset())`을 받아 `group(outcome, assigned)`로 다시 계산한다. CR3이 넣은 판정 흐름은 바꾸지 않는다.
  - 합성 경로(`processing/synthetic.py`·`fake_generator.py`)와 FR10 확인 명령(`processing/confirm.py`)은 기본값(빈 집합)을 쓴다.
  - 관련 스토리: US1.1
- [x] **Step 10. worker 결과 조합 v3** (BR2.1·BR2.2, NFR6.1)
  - `worker/app/processing/result.py`의 `_envelope`: Result 판본 "3", 후보마다 `ownCommitShas`. 진행 상태(`pipeline.py`)·합성 요청(`synthetic.py`)은 "2" 그대로. `EligibleCandidate`(또는 결과 후보 모양)에 칸 추가. 합성 결과도 같은 규칙.
  - 관련 스토리: US1.1
- [x] **Step 11. api 시험** — 아래 시험을 구현 뒤 쓰고 돌린다(`unit-test-instructions.md` api 명령).
  - `api/test/catches/registration-postgres.test.cjs`: 새 Catch 소속 쓰기(30개 SHA 모두, AC1.1.4), 기존 Catch에 새 SHA만 더하고 내용·작성자 설명·저장 시각 그대로(AC1.2.1), 이미 다른 Catch 소속 SHA는 건너뛰고 반영 성공(AC1.1.1·AC1.2.2), 같은 열쇠 후보 둘의 합집합, 재응답 경로는 쓰지 않음, 3,000개 SHA 등록(1,000행 묶음), 다른 회원 Catch로 쓴 행은 외래 키 거부, 소속 쓰기 DB 오류면 전체 롤백.
  - `api/test/catches/registration-batch.test.cjs`: 합집합 순서.
  - `api/test/db/worker-context-api.test.cjs`·`api/test/u7-worker-context.test.cjs`: 새 칸(빈 배열, 그 회원·저장소 것만, 다른 회원·저장소 제외).
  - `api/test/analysis/receiver.test.cjs`: "3" 수신, "2" 결과 `SCHEMA_INVALID`, `ownCommitShas` 빠짐·형식 틀림 거부.
  - `api/test/db/member-cascade-delete.test.cjs`·`api/test/catches/upstream-foreign-keys.test.cjs`: 탈퇴 뒤 소속 0건, 새 외래 키가 연쇄 삭제(AC1.1.6).
  - 결과 판본을 "2"로 만드는 기존 시험(`analysis-queue-dispatch`·`u7-analysis-chain` 등)의 결과 자료를 "3"으로 고친다.
- [x] **Step 12. worker 시험** — 아래 시험을 구현 뒤 쓰고 돌린다(`unit-test-instructions.md` worker 명령).
  - 새 `worker/tests/test_candidate_assignment.py`: W3(같은 PR 새 커밋, 열쇠 그대로·본인 목록 새 것만), W4(통합 PR), W5(직접 커밋 이음, 새 열쇠, 고정 문장, 연결 빈 경우도 멈추지 않음), W6(모두 소속 → 후보 0, 미제공 0, `assigned_units`), 같은 변경 SHA 일부 소속이면 변경 전체 뺌, 빈 집합이면 지금 결과와 같음(AC1.1.8), 같은 입력 두 번 같은 열쇠·목록(AC1.1.5), 재료 찾기가 같은 집합으로 모든 후보를 찾음(AC1.1.7), 로그 두 숫자와 SHA 없음.
  - `test_request_context.py`·`test_request_context_settings.py`: 새 칸 해석(빈 배열, 형식 틀림·중복·칸 없음은 `CONTEXT_RESPONSE_INVALID`), 1 MiB 기본값, 3,000개 응답.
  - `test_processing.py`·`test_worker_messages.py`: 결과 "3"과 `ownCommitShas`, 공용 자료 검사.
  - `test_live_processing.py`: 맥락의 소속 집합이 후보 판정과 재료 찾기에 같은 값으로 간다.
  - CR3 시험(`test_generation_flow.py`·`test_judgement.py`의 호출 수, NFR2)과 기존 작업 동일성 시험(`test_candidate_identity.py`·`test_candidate_cases.py`)이 그대로 통과(AC1.1.8).
- [x] **Step 13. 문서** (NFR7.1) — 새 `worker/docs/commit-assignment.md`(빼기 규칙·열쇠·묶음 설명·로그 두 숫자·이른 종료 줄의 0은 계산 전이라는 뜻·1 MiB 한계). 「이 계획이 고치는 사람 쪽 파일」의 문서를 고친다. 문서 크기 검사(`.github/scripts/check-doc-sizes.sh`)를 돌린다.
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 14. 검증** — Unit 시험 명령을 돌리고, intent 검증 명령(api·web·worker 전체)을 60분 상한으로 돌려 서비스별 걸린 시간과 함께 `code-summary.md`에 적는다. 3,000개 SHA 등록에 더해진 시간을 한 번 재서 참고로 적는다(통과 조건 아님).
- [x] **Step 15. 로컬 실제 연결 확인(B3 완료 조건)** — `/Users/ljm/Desktop/github/CatchU/.local-handoffs/issue-450-live-tools/README.md`의 로컬 실제 분석 도구를 이 작업 폴더 판본으로 띄울 준비를 하고, 준비가 끝나면 팀장에게 알리고 기다린다. 로그인·GitHub 연결·저장소 등록·분석 요청·커밋 올리기는 팀장이 한다. 저장소는 CR1 확인 때 만든 공개 시험 저장소 `ljm0850/catchu-live-test`이고, 환경은 CR1 때의 cr1 DB를 그대로 쓴다(팀장 결정 2026-11-07, 처음 정한 `ljm0850/algo-problem`에서 바꿈). CR2 전에 만든 Catch가 재분석 때 소속을 얻는 길도 함께 본다.
  - ① CR2 코드로 첫 분석을 한다(CR2 전에 만든 같은 열쇠의 Catch가 있으면 거기에 이어지며 소속이 처음 써진다). 팀장이 Catch 하나에 작성자 설명을 쓴다.
  - ② 바꾸지 않고 다시 분석한다. 새 Catch가 0개인지 보고, worker 로그의 `assignedShas`·`assignedUnits`로 결과가 빈 이유(모두 이미 소속)를 확인한다.
  - ③ ②가 끝난 뒤 팀장이 그 저장소에 새 커밋 하나를 올리고 다시 분석한다. 새 커밋만 새 Catch가 되고, 앞 Catch의 소속과 작성자 설명이 그대로인지 본다.
  - 「같은 PR에 커밋이 더해진」 경우(US1.2 AC1.2.1)는 GitHub에서 병합된 PR에 커밋을 더할 수 없어 실제 저장소로 만들기 어렵다. 이 경우는 합성 시험(기능 명세 W3, Step 11·12)으로 갈음한다. `code-summary.md`에도 그렇게 적는다.
  - 결과(각 회차의 Catch 수, 로그 두 숫자, 설명 유지 여부)를 `code-summary.md`에 건수로 적는다. 저장소 원문·SHA는 적지 않는다.
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 16. 코드 요약** — `code-summary.md`: 바꾼 파일, 결정, 계획과 다른 점, 시험·검증 결과, 로컬 실제 연결 확인 결과(「같은 PR에 커밋이 더해진」 경우는 합성 시험 W3으로 갈음했다는 줄 포함), 한계(1 MiB 초과 시 `CONTEXT_RESPONSE_TOO_LARGE`, 보류 변경은 그대로 미제공, CR2 배포 전 Catch는 다음 재분석에서 소속), 「운영에 넣을 때」(api·worker 함께, 진행 중 분석 없을 때, 옛 판본 작업은 실패해도 됨). `source-manifest.json`, `traceability.json`.

## 스토리와 단계

| 스토리 | 단계 |
|---|---|
| US1.1 | Step 3~12, 13, 15 |
| US1.2 | Step 5, 8, 11, 12, 15 |
| US1.3 | Step 5, 8, 12, 15 |
