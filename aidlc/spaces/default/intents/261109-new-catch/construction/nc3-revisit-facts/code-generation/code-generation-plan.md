# NC3 다시 볼 곳 사실과 작업 시각 — 코드 생성 계획

## Summary

- Builds: worker의 다시 볼 곳 규칙 다섯(RevisitFacts)과 작업 시각, 결과 메시지 Result "4", api의 결과 검사·저장(칸 셋)·본인 목록 작업 시각순 정렬과 커서 판본 3·응답 `revisitFacts`, web 지원자 상세의 「다시 볼 곳」 칸, 고지 4절 한 줄
- Touches: worker `app/collection/`·`app/candidates/`(새 `revisit.py`)·`app/processing/`·`fixtures/m1-synthetic/`; 계약 `api/contracts/repository-analysis/worker-messages.yaml`; api `src/catches/`·`src/analysis-receiver/`·마이그레이션 하나·`src/analysis-intake/analysis-notice.ts`; web `src/features/assets/`; 같은 규칙을 적은 api·worker·web 문서와 앞 단계 설계 문서 네 자리
- Tests: worker 새 시험 파일 1개와 고칠 4개(약 35개), api 고칠 8개와 새 1개(약 25개), web 고칠 2개와 새 1개(약 14개), 기존 시험은 그대로 통과

## 입력

- 기능 설계 `construction/nc3-revisit-facts/functional-design/`: `functional-spec.md`(W1~W4, 6절 화면 상태, 10절 시나리오 S1~S20), `rules.md`(BR1.1~BR10.1), `entities.md`
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/`(NFR1.1~NFR8.4), NFR 설계 `construction/nc3-revisit-facts/nfr-design/`(보안·신뢰성·성능·확장성·관측 설계, 논리 구성 요소)
- 인프라 설계는 이 Unit에서 건너뛰었다(새 자원·환경변수 없음, 기존 배포가 api·worker를 같은 커밋으로 함께 바꿈).
- 각 단계 검토의 남은 지적:
  - NFR 설계 검토 Minor 1: 바꾸기 전·후 기록은 로그별로 읽는다. GitHub 호출 수는 「수집 종료」 `calls=`, AI 호출 수는 「생성 종료」 `generationCalls` 등, 시간·크기는 「종결 결과 생성」 `elapsedSeconds`·`resultBytes`다(Step 16).
  - NFR 설계 검토 Minor 2: 시각 글의 해석·정규화(Step 3·Step 10). 계약 date-time은 오프셋·소수 초를 허용하므로, api는 등록 때 `Date`로 해석해 `firstWorkAt ≤ lastWorkAt`을 비교하고 DB에는 timestamptz로 넣는다. 커서의 `lastWorkAt`은 DB 값을 `toISOString()`으로 옮긴 글만 쓰므로 등록 글 꼴과 무관하다. worker는 UTC 초 단위 `Z` 꼴로 보낸다.
  - NFR 설계 검토 Minor 3: 판본 "3"이 박힌 곳을 이름으로 고친다(Step 3·Step 10). `api/test/helpers/receiver-harness.cjs`, `api/test/u7-worker-context.test.cjs`, `api/src/analysis-receiver/receiver.types.ts`, `worker/app/processing/result.py`, `worker/fixtures/m1-synthetic/results/` 7개 파일. 고친 뒤 `schemaVersion` "3" 글자를 다시 찾아 남은 곳이 없음을 `code-summary.md`에 적는다.
- 계약 `inception/contract-design/contract-summary.md` C2·C4·C5, Unit `inception/units-generation/unit-of-work.md` NC3, 요구사항 FR12~FR15·NFR1·NFR2·NFR4~NFR8
- 이야기 `inception/user-stories/stories.md` US9.1~US11.2(수락 기준 17개), 다듬은 화면 `inception/refined-mockups/mockups.md` 2절·`interaction-spec.md` 6절

## 이 계획이 고치는 사람 쪽 파일

같은 규칙을 적은 문서를 모두 함께 고친다(프로젝트 규칙). 아래 「앞 단계 설계 문서」는 NFR 요구·NFR 설계에서 사람이 정한 대로 이 계획에 넣은 것이다.

- **앞 단계 설계 문서(Step 15):**
  - `construction/nc3-revisit-facts/functional-design/functional-spec.md` 2절 W1 「실패와 경계」 첫 줄(49행): 판정 예외는 그 후보 사실만 빈 배열로 두고 예외 종류 이름만 든 실패 로그를 남기는 한 곳 예외로 고친다(NFR 요구 Q1 B).
  - 같은 문서 10절 S10: 지운 시험 파일만 있으면 「시험 파일 있음」이 없는 경우를 더한다(NFR 요구 Q2 B).
  - `construction/nc3-revisit-facts/functional-design/rules.md` BR3.5 logic: 상태 `removed` 시험 파일은 치지 않는다(Q2 B).
  - `construction/nc3-revisit-facts/nfr-requirements/performance-requirements.md` NFR1.3: 「RevisitFacts 전체 시간 1초 이하」와 RevisitFacts만 재는 확인을 지우고, 구조 요구는 코드 검토로, 분석 전체 시간 전·후 기록만 남긴다(NFR 설계 Q1).
  - 고치지 않음: `rules.md` BR2.1(「순수 계산」은 GitHub를 부르지 않는다는 뜻), BR4.1(NFR 설계 Major 처리 덧붙임).
- **api 문서(Step 15):**
  - `api/docs/catch-owner-read-preparation.md`(C1·C2 주인 문서): 정렬, 커서 판본 3과 위치, 응답 `revisitFacts`, 시각은 응답에 없음, 공개 목록 커서는 그대로
  - `api/docs/catch-registration-rules.md`: 새 Catch에만 첫 후보의 사실·시각을 쓰는 규칙, 등록 입력 검사(종류별 개수·소속·시각 순서)
  - `api/docs/analysis-receiver.md`: Result "4"와 함께 배포
  - `api/docs/analysis-intake.md`: 고지 4절 한 줄(문구는 PR에서 팀장 승인)
- **worker 문서(Step 15):**
  - `worker/README.md`: 시험 설명의 「결과 v3」를 「결과 v4」로, RevisitFacts 시험 한 줄
  - `worker/docs/candidate-decision.md`: 작업 시각과 다시 볼 곳 사실 절(좁은 산출물 목록, 시험 파일 꼴, 판정 예외 갈래, 규칙 끄기 상수)
  - `worker/docs/commit-assignment.md`·`worker/docs/relation-collection.md`: 결과 판본을 적은 줄만 맞춘다(코드 생성 때 확인해 `code-summary.md`에 적음)
  - `worker/fixtures/m1-synthetic/README.md`: 결과 v4와 새 칸
- **web 문서(Step 15):** `web/src/features/assets/README.md`: 「다시 볼 곳」 칸(본인만, 링크 조건), 커서 판본 3
- **고치지 않음:** 요구사항·계약 요약(사람 결정 그대로), 재료 분류 `title.py`, 공개 Catch 응답 모양, 발행·Claude 연결 질의.

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
    },
    {
      "layer": "project",
      "text": "- ALWAYS Unit 확인 명령은 --timeout-ms 3600000(60분)으로 돌린다. 시작 전에 pmset -g batt로 충전기 연결을, sysctl -n vm.loadavg로 부하(1분 평균 6 미만)를 보고, 끝나면 결과와 함께 api·web·worker 각각 걸린 시간을 알린다. 기본 상한 30분은 배터리로 돌 때 api 시험 도중에 걸려 멈췄다. (learned 2026-11-10)"
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
  "input_sha256": "sha256:a24950ce0aa3e250dae085bc39ce7cc5a78c648b595ed5d8fa194ef62b0af990",
  "contract_sha256": "sha256:5a598f00a197bc131ca94a2a0b5f84fe01ddfd0a50f475f627aa20b6dd7a15bf"
}
```

## 단계

시험 방식은 팀 규칙(custom)이다. 시나리오·기대 결과·실패 조건은 기능 명세 10절 S1~S20과 NFR8.3·NFR8.4로 먼저 정했다(`unit-test-instructions.md` 「실패 조건」). 세부 시험 코드는 각 구현 단계 뒤에 쓰고 돌린다.

### 준비

- [x] **Step 1 — 구조 확인.** 새 배포 단위·설정·환경변수는 없다. 새 파일은 worker `app/candidates/revisit.py`, `tests/test_revisit_facts.py`, api 마이그레이션 하나와 그 시험 하나, web `src/features/assets/revisit-facts.tsx`와 그 시험 하나다. (US9~US11 공통)
- [x] **Step 2 — 고치기 전 확인.** `unit-test-instructions.md`의 worker·api·web 명령을 바뀌지 않은 판본에서 돌려 결과를 적는다. 새 시험 파일은 빼고 돌린다. 시험 DB(`catchu-db-test`)가 떠 있는지 함께 본다. (전체)

### 결과 계약 (C4)

- [x] **Step 3 — 결과 메시지 판본 "4".**
  - `api/contracts/repository-analysis/worker-messages.yaml`:
    - `Result.schemaVersion`을 `"4"`로 올리고, `Candidate`에 필수 `revisitFacts`·`firstWorkAt`·`lastWorkAt`을 더한다.
    - `RevisitFact`(`additionalProperties: false`, `kind` 다섯 값, `paths` 원소 1~1,024자·최대 20개, `commits` 원소 16진수 40자·최대 20개)를 둔다.
    - `revisitFacts`는 최대 30개다.
  - 같은 값을 쓰는 곳도 맞춘다: `api/src/analysis-receiver/receiver.types.ts` 형, `worker/app/processing/result.py`, `api/test/helpers/receiver-harness.cjs`, `api/test/u7-worker-context.test.cjs`.
  - 시험: `api/test/worker-messages.test.cjs`가 판본 "3" 거부, 새 칸 누락·모르는 칸·31번째 사실·21개 경로·1,025자 경로·짧은 식별값 거부를 본다(S19, NFR1.4).
  - (US9·US11, BR5.1, NFR7.3)

### worker

- [x] **Step 4 — 수집이 파일 내용 식별값을 남긴다.** `worker/app/collection/records.py` `ChangedFile`에 `blob_sha: str | None = None`을 더한다. `normalize.py` `commit_changes`가 파일 항목 `sha`를 16진수 40자일 때만 소문자로 옮긴다. 시험: `worker/tests/test_collection_flow.py`에서 removed·renamed·added 항목의 값, 꼴이 틀린 값은 None. (US9.2, BR1.1, NFR1.1)
- [x] **Step 5 — RevisitFacts.** `worker/app/candidates/revisit.py`(새 파일, 순수 함수와 상수)를 만든다.
  - 입력과 걸러 내기:
    - 입력은 후보 하나의 본인 커밋 기록이다.
    - 병합 커밋을 빼고 (작성 시각, 식별값) 순서로 둔다(BR2.1).
    - 못 받은·잘린 커밋은 경로 규칙에서, patch 없는 파일은 줄 규칙에서 뺀다(BR2.2).
    - 좁은 산출물 목록 여섯 묶음을 뺀다(BR2.3). 비밀 경로는 `app.redact.is_secret_path`로 본다.
  - 규칙 다섯:
    - 다시 고침: (경로, 줄 글자) 사전, 이름 바꿈 잇기, removed 제외, 되돌린 쌍 제외(BR3.1)
    - 옮김: renamed와 blob_sha 짝, 모호·빈 파일 식별값 제외(BR3.2)
    - 확장자 바꿈(BR3.3)
    - 되돌림: 40자 식별값, 같은 후보만(BR3.4)
    - 시험 파일: 좁은 꼴, **상태 `removed`는 치지 않음**(BR3.5, NFR8.4)
  - 켜진 종류 상수(BR2.4). 종류·커밋 순서로 정렬한 뒤 30개, 경로·커밋 20개, 경로 1,024자 상한(BR2.5)이다.
  - 기록이 없는 식별값을 받으면 정해진 예외 하나를 낸다(신뢰성 설계 1절).
  - **자기 결과 확인(플랜 승인 때 팀장 덧붙임):** 끝에서 자기 결과를 api 등록 검사와 같은 규칙으로 확인한다. 규칙은 전체 30개, 사실마다 경로·커밋 20개, 경로 1,024자, 종류별 경로·커밋 개수, 커밋이 그 후보 본인 커밋 안, 한 사실 안 겹침 없음이다. 어기면 기록 없는 식별값과 같은 정해진 예외를 낸다. 그러면 Step 8의 감싸기가 함께 잡아 그 후보 사실만 빈다(NFR8.3의 빈틈: 규격을 어긴 결과가 worker 보내기 전 계약 검사 `consumer/parent.py` `_valid_result`에서 WORKER_DEFECT가 되거나 api 등록 검사가 결과 전체를 거부하는 것을 막는다). api·web 검사는 바깥 경계로 그대로 둔다.
  - 결과 자료형은 `kind`·`paths`·`commits`만 갖는다.
  - (US9.1~US9.3, US10.1, US10.2)
- [x] **Step 6 — RevisitFacts 시험.** `worker/tests/test_revisit_facts.py`(새 파일)에 합성 커밋 기록으로 아래를 쓴다.
  - 시나리오와 수락 기준: S1(TheMe 꼴 줄 글자), S2(다른 후보 커밋 없음), S5(여러 커밋 옮김·한 커밋 renamed·모호한 식별값), S6(확장자만·폴더와 함께), S7(같은 후보 되돌림, 다른 후보 Y 없음, 되돌린 쌍에 다시 고침 없음), S9·S10(좁은 시험 꼴, 지운 시험 파일만 있으면 없음, 섞이면 고친 경로만), S11(잠금 파일)
  - 판정 경계: 산출물 목록 여섯 묶음 각 하나, 병합 커밋 제외, 잘린 커밋 제외, patch 없는 파일은 줄 규칙만 제외, 글자 없는 줄 무시, 상한·정렬, 꺼진 규칙, 기록 없는 식별값 예외
  - 자기 결과 확인: 규격을 어긴 결과(종류별 개수, 소속 밖 커밋, 한 사실 안 겹침, 상한 넘음)를 만들도록 판정 함수를 바꿔 끼우면 정해진 예외가 난다
  - 시간은 단정하지 않는다(NFR 설계 Q1).
  - (US9.1~US9.3, US10.1, US10.2)
- [x] **Step 7 — 작업 시각.**
  - `worker/app/processing/generation.py` `EligibleCandidate`에 `revisit_facts: tuple[RevisitFact, ...] = ()`, `first_work_at: datetime | None = None`, `last_work_at: datetime | None = None`을 더한다.
  - `worker/app/candidates/build.py`는 `_merge_same_identity` 뒤 후보마다 `grouping.commits`로 최소·최대 `authored_at`을 싣는다. 기록이 없으면 지금처럼 `ValueError`다.
  - 시험: `worker/tests/test_candidate_flow.py`에서 합쳐진 후보의 커밋 시각이 들어감, 커밋 시각(committed)을 쓰지 않음(S14).
  - (US11.1, BR4.1)
- [x] **Step 8 — 처리와 결과.**
  - `worker/app/processing/live.py`가 `build_candidates` 뒤 `run_generation` 앞에서 실패 처리를 한다.
    - `(*outcome.commits, *outcome.relations.commits)` 사전을 만들어 후보마다 RevisitFacts를 부른다.
    - `Exception`이면 그 후보 사실을 빈 배열로 두고 `logger.error("다시 볼 곳 계산 실패: requestId=%s attemptId=%s error=%s", …, type(error).__name__)` 한 줄을 남긴다. 팀 규칙 예외 한 곳이라는 주석을 단다.
  - `result.py`가 새 칸 셋(시각은 UTC 초 단위 `Z` 글)을 싣고 `schemaVersion: "4"`를 쓴다.
  - `fake_generator.py`가 템플릿의 새 칸을 읽는다.
  - 시험:
    - `worker/tests/test_live_processing.py`: 정상 후보와 예외 후보가 섞인 결과, 기록 없는 식별값, 판정 결과가 규격을 어긴 후보(그 후보 사실만 비고 로그 한 줄, 다른 후보 사실과 결과 전송은 그대로), 로그 한 줄의 칸 넷, 생성 뒤에도 새 칸 유지(NFR8.3, NFR4.3)
    - `worker/tests/test_processing.py`: 결과 판본 "4"와 계약 검사
  - (US9·US11, BR5.1)
- [x] **Step 9 — 합성 자료.** `worker/fixtures/m1-synthetic/`의 템플릿과 `results/` 7개 파일에 새 칸을 채우고 판본을 "4"로 바꾼다. 「후보 하나 성공」에는 종류마다 사실 하나를 두고, 커밋은 그 후보 `ownCommitShas` 안이다. 나머지는 빈 배열이다. 고친 뒤 `"schemaVersion": "3"`을 다시 찾아 남은 곳이 없음을 확인한다. 시험: 지금 합성 결과 시험과 `api` `npm run test:analysis-fixtures`가 그대로 통과. (BR5.3)

### api

- [x] **Step 10 — 결과 검사와 등록.**
  - `api/src/catches/registration-batch.ts`에 등록 입력 검사를 더한다.
    - 종류별 경로·커밋 개수, 같은 사실 안 겹침, 사실 커밋이 그 후보 `ownCommitShas` 안인지 본다.
    - `firstWorkAt ≤ lastWorkAt`은 `Date`로 해석해 비교한다(검토 Minor 2).
    - 어기면 `CatchRegistrationInputError('INVALID_INPUT', '<칸>')`다.
  - `new-catch-content.ts`·`registration-service.ts`는 새 Catch INSERT에 첫 후보의 `revisit_facts`·`first_work_at`·`last_work_at`을 쓴다. 기존 Catch는 쓰지 않는다.
  - 시험:
    - `api/test/catches/registration-batch.test.cjs`: 종류별 개수 초과·부족, 소속 밖 커밋, 시각 뒤바뀜
    - `api/test/catches/registration-postgres.test.cjs`: 새 Catch에 값 저장, 재분석 때 기존 Catch 그대로(S20), 위반 결과에 Catch 0개(S19)
  - (US9·US11, BR5.2, BR6.1)
- [x] **Step 11 — 마이그레이션.**
  - 새 마이그레이션이 `catch_asset`에 `revisit_facts jsonb NOT NULL DEFAULT '[]'::jsonb`, `first_work_at timestamptz NULL`, `last_work_at timestamptz NULL`을 더한다.
  - 검사 둘을 둔다. 배열 검사, 그리고 시각이 둘 다 있거나 없고 앞이 뒤보다 늦지 않다는 검사다. `down`은 칸과 검사를 지운다.
  - `api/src/catches/entities/catch-asset.entity.ts`에 칸을 더한다.
  - 시험: `api/test/catches/revisit-facts-migration.test.cjs`(새 파일)에서 옛 행 기본값·null, 배열 아닌 값과 시각 하나만·뒤바뀜 거부(NFR8.2, NFR7.1).
  - (BR6.2)
- [x] **Step 12 — 본인 목록·상세.**
  - 읽기와 응답:
    - `catch-reader.ts` `READ_COLUMNS`에 `revisit_facts`·`last_work_at`을 더한다.
    - `owner-catch-response.ts`가 `revisitFacts`를 옮긴다. 모양이 틀리면 `CatchReadIntegrityError`다. 시각은 응답에 없다.
  - 커서와 정렬:
    - `owner-catch-input.ts`에 본인 목록 커서 판본 3(`after: {lastWorkAt, catchId}`, `toISOString` 왕복 검사)을 둔다. 공개 목록용 지금 판본 2 함수는 따로 남긴다.
    - `owner-catch-store.ts`는 `ORDER BY c.last_work_at DESC NULLS LAST, c.catch_id ASC`와 다음 쪽 고정 조각 둘을 쓴다.
    - `public-catch-store.ts`는 판본 2 함수를 쓰도록 이름만 바꾼다.
  - 시험:
    - `api/test/catches/owner-catch-http.test.cjs`:
      - 순서 B·A·C(S13), 같은 시각 순서(S15), 시각 섞인 45개 세 쪽(S17)
      - 커서 400: 판본 1·2, 다른 조건, 꼴 틀림(S18)
      - 공개 목록 커서·순서 그대로, 응답에 시각 없음, 회원 둘
    - `api/test/catches/owner-catch-response.test.cjs`: `revisitFacts` 옮김·무결성 오류
  - (US9.1, US11.1, US11.2, BR7.1~BR7.3, BR8.1)
- [x] **Step 13 — 본인만 보기 확인과 고지.**
  - 시험:
    - `api/test/publications/publish-api.test.cjs`: 사실·시각이 든 Catch를 발행한 사본에 그 글자가 없다.
    - `api/test/published-index/chunker.test.cjs`: 그 사본의 조각에도 없다(S8, AC9.4.1, AC11.1.4).
  - `api/src/analysis-intake/analysis-notice.ts` 4절에 초안 한 줄을 더한다. 판본 이름은 그대로이고, 문구는 PR에서 팀장 승인을 받는다. 작업 시각을 함께 적을지도 그 PR에서 정한다(BR10.1, C5).
  - (US9.4, US11.1)

### web

- [x] **Step 14 — 「다시 볼 곳」 칸.**
  - 응답 형과 검사:
    - `web/src/features/assets/types.ts`에 `RevisitFact`와 `CatchAsset.revisitFacts`를 더한다.
    - `catch-api.ts` 응답 검사에 모양·종류별 개수·식별값 꼴을 더한다. 어긋나면 받지 못한 응답이다.
  - `web/src/features/assets/revisit-facts.tsx`(새 파일):
    - `revisitCommitHref`가 고정 호스트, 이름 꼴, 40자로 주소를 만든다.
    - 문장 다섯 꼴은 식별값 뒤에 「에서」「의」만 붙인다(BR9.2). React 글자로만 그린다.
    - 커밋 링크(7자 + 숨은 「 (새 탭)」, `target="_blank"`, `rel="noopener noreferrer"`)는 `dataMode === "api"`이고 LIVE일 때만 만든다.
    - 사실이 없으면 아무것도 그리지 않는다.
  - `assets-view.tsx`가 근거 칸과 Catch 설명 초안 칸 사이에 그 칸을 둔다. 지금 NC1 주석 자리다. 제목은 h3 「다시 볼 곳」 + 작은 글자 「본인만 확인」이다.
  - `data-testid`를 칸과 항목에 붙인다.
  - 시험:
    - `web/test/assets-revisit-facts.test.mjs`(새 파일): 문장 다섯·조사, 링크 조건(LIVE·api·이름 꼴·MOCK·이름 없음), 숨은 글자, 태그 꼴 경로가 글자 그대로(S4, NFR5.1, NFR5.2, NFR6.1)
    - `web/test/assets-view.test.mjs`: 칸 자리(근거 아래, 초안 위), 사실 없음이면 제목도 없음(S3)
    - `web/test/assets-api.test.mjs`: 응답 검사 경계(종류별 개수 초과·부족, 모르는 kind)
  - (US9.1~US9.4, US10.1, BR9.1~BR9.3)

### 문서와 확인

- [x] **Step 15 — 같은 규칙을 적은 문서.** 위 「이 계획이 고치는 사람 쪽 파일」의 api·worker·web 문서와 앞 단계 설계 문서 네 자리를 고친다. 결과 판본·커서 판본을 적은 줄은 다시 찾아 남은 옛 값이 없음을 `code-summary.md`에 적는다. (전체)
- [x] **Step 16 — Unit 확인과 최소 연결 첫 결과.**
  - Unit 시험: `unit-test-instructions.md`의 명령을 프로젝트 규칙대로 돌린다(`--timeout-ms 3600000`, 충전기·부하 확인, api·web·worker 시간 보고).
  - 최소 연결 첫 결과(팀 규칙 「Walking Skeleton」):
    - 로컬에서 합성(MOCK) 분석 하나를 돌린다.
    - api가 Result "4"를 받아 Catch에 사실이 저장되는지 본다.
    - 지원자 상세에 「다시 볼 곳」 칸이 근거 아래 보이는지 본다. MOCK이라 커밋은 글자다.
    - 본인 목록이 시각순인지 본다.
    - 이것을 전체 완료나 실제 처리 성공으로 보고하지 않는다.
  - 실제 저장소(TheMe) 분석, 규칙 버림 기준·사람 대조, 바꾸기 전·후 기록(「수집 종료」 `calls=`, 「생성 종료」 `generationCalls`, 「종결 결과 생성」 `elapsedSeconds`·`resultBytes`), 실패 로그 0줄은 빌드와 시험에서 한다.
  - (전체)
