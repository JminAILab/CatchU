# CR1 규칙 쪽 Catch — 코드 생성 계획

## Summary

- Builds: 이슈 나누기 끄기, 기록의 글 제목·작업 사실 둘째 줄, 재료 종류 순서·변경 묶음·한 파일 상한, 목록 2줄·안내 문장 (worker·web, 계약·DB 변경 없음)
- Touches: `worker/app/candidates/`, `worker/app/generation/`(flow·request·title·material), `worker/app/redact.py`(옮김), `worker/app/processing/generation.py`, `web/src/features/assets/`, `web/src/features/recipient/`, `web/test/auth-session-member-guard.test.mjs`(가짜 모듈 주소 한 줄), worker·web 문서
- Tests: worker 시험 약 45개(새 파일 2개, 고칠 파일 7개), web 시험 약 8개(고칠 파일 2개), 기존 시험은 그대로 통과, 로컬 실제 연결 확인 5가지(B1 완료 조건)

## 입력

- 기능 설계 `construction/cr1-readable-catch/functional-design/`
  - `functional-spec.md`: 흐름 W1~W4, 시나리오 S1~S29
  - `rules.md`: 규칙 BR1~BR7
  - `entities.md`
- 비기능 요구사항·설계 `construction/cr1-readable-catch/nfr-requirements/`, `nfr-design/`
- 계약 `inception/contract-design/contract-summary.md`(C5 그대로, C6·C7 접점)
- Unit 정의 `inception/units-generation/unit-of-work.md`
- 요구사항 `inception/requirements-analysis/requirements.md`
- 스토리 US1.4·US2.1·US2.2·US3.2·US4.1·US4.2·US4.3

## 이 계획이 고치는 사람 쪽 파일

이미 있던 문서 중 아래만 고친다. 모두 기능 설계 BR7.1과 비기능 설계가 정한 것이다.

- `worker/README.md` 221행: 가리기 위치
- `worker/docs/candidate-text.md`, `candidate-decision.md`, `candidate-checks.md`, `relation-collection.md`, `generation.md`
- `web/src/features/assets/README.md`, `web/src/features/recipient/README.md`
- `docs/CatchU_작업동일성_판별기준.md`, `docs/CatchU_work_identity_unit.md`의 나누기 언급
- `docs/CatchU_work_identity_rules.md` 9·10·32행의 「나눈 부분」, `docs/CatchU_work_identity_cases.md` 70행 L5 사례(같은 나누기 규칙을 적은 문서라 함께 고친다)

크기 상한(36,000 B)에 가까운 `generation.md`(35,312 B)와 `relation-collection.md`(35,793 B)는 글자 수를 늘리지 않게 고친다.

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

해당하지 않는 층: DB·저장소 접근·API 끝점은 CR1이 바꾸지 않는다(계약 C5). 시험 층은 worker 업무 규칙과 web 화면이다.

## 단계

- [x] **Step 1. 구조·설정 확인** — 새 패키지·설정·의존이 없음을 확인한다. 고칠 파일 목록을 이 계획대로 확정한다. (전체)
- [x] **Step 2. 시험 실행기 확인** — `unit-test-instructions.md`의 Unit 시험 명령(worker pytest, web node --test)을 지금 코드에서 한 번 돌려 실행되는지 확인한다. (전체)
- [x] **Step 3. 시나리오·기대 결과·실패 조건 먼저 정하기** — 기능 설계 3절 S1~S29와 실패 조건, 비기능 확인 사항을 `unit-test-instructions.md`의 시나리오 표에 시험 파일·시험 이름과 짝지어 둔다. 이 표가 Step 4~11 시험의 기준이다. (US1.4, US2.1, US2.2, US3.2, US4.1~4.3)
- [x] **Step 4. 가리기 검사 옮기기** (BR2.4, 비기능 설계 Q2 A)
  - `worker/app/generation/redact.py`를 `worker/app/redact.py`로 옮긴다.
  - `worker/app/generation/request.py`와 `worker/tests/test_generation_redact.py`의 불러오기를 고친다. 옛 파일은 지운다.
  - 구현 뒤 `test_generation_redact.py`를 돌린다.
  - 관련 스토리: US2.1
- [x] **Step 5. 이슈 나누기 지우기** (BR1.1~1.3, BR7.2)
  - `worker/app/candidates/grouping.py`에서 다음을 지운다: `_split`과 부르는 곳, `NOT_SPLIT_*` 한계, 나눈 조각(`parts`)·경로 허용 목록.
  - `worker/app/candidates/identity.py`에서는 조각 값만 뺀다. 조각이 없던 단위의 열쇠 입력은 그대로 둔다.
  - `worker/app/candidates/build.py`에서 나누기 글(`_part_texts`)을 지운다.
  - 구현 뒤 시험 S1·S2·S18을 쓰고 기존 작업 동일성 시험을 돌린다(`test_candidate_identity.py`·`test_candidate_grouping.py`).
  - 관련 스토리: US1.4
- [x] **Step 6. 기록의 글 칸 만들기** (BR2.1~2.7)
  - 새 모듈 `worker/app/candidates/record_text.py`를 만든다. 여기서 다음을 한다.
    - 고르기: PR 제목 조건, 단위 안 가장 이른 본인 커밋 첫 줄
    - 첫 줄 잡기
    - 한 글 검사(`app.redact.mask_text`)
    - 부실 판단: 문자·숫자 2자 이하, 부실 목록 35개
  - 후보 자료(`worker/app/processing/generation.py`의 후보, `build.py`의 후보 결과)에 기록의 글 칸(종류·글·부실 여부)을 더한다.
  - 같은 열쇠 후보를 합칠 때는 첫 후보의 칸을 남긴다.
  - 구현 뒤 새 시험 파일 `worker/tests/test_candidate_record_text.py`에 S3~S7·S17·S19~S22·S29와 2,000/2,001자 경계를 쓴다.
  - 관련 스토리: US2.1, US2.2
- [x] **Step 7. 작업 사실 바꾸기** (BR4.1~4.6)
  - `build.py`의 첫 줄을 종류만 쓰게 바꾼다: 「PR #n, 상태 …」, 「PR 없이 합친 병합」, 「PR·병합 없이 들어간 본인 커밋」·「… 묶음」. PR 조회가 허용되지 않은 요청은 「병합 없이 들어간 본인 커밋」이다.
  - 둘째 줄로 기록의 글 줄을 더한다.
  - 다른 계정 문장을 지운다. `other_authors` 값과 그 값을 쓰는 곳은 그대로 둔다.
  - 같은 값 후보를 합칠 때 첫 후보의 작업 사실을 그대로 둔다.
  - 구현 뒤 `test_candidate_grouping.py`의 작업 사실 기대값을 고친다. `candidate_scenarios.py`의 `assert_member_text`는 센 숫자 검사를 CatchU 문장(첫 줄·나의 기여)에만 하게 고친다. S8·S9·S23·S28을 시험한다.
  - 관련 스토리: US2.2
- [x] **Step 8. 제목 우선순위** (BR3.1~3.3)
  - `worker/app/generation/flow.py`에서 기록의 글 칸이 쓸 만하면 제목을 정하고, 고쳐 쓰기를 부르지 않는다. 생성 실패·건너뜀에서도 그 제목을 남긴다.
  - 「제목만 없음」 집계는 최종 제목 기준으로 센다.
  - 구현 뒤 `test_generation_flow.py`에 S16, 고쳐 쓰기 0번, 집계 시험을 더한다. 생성 요청 본문에 기록의 글이 없다는 시험도 더한다(NFR1.1).
  - 관련 스토리: US2.1
- [x] **Step 9. 종류 판정 보완** (BR5.1)
  - `worker/app/generation/title.py`의 `classify`에 다음을 더한다.
    - `*Test`·`*Tests` 이름 꼴(대문자 T), `androidTest` 폴더, 이름이 `Tests`로 끝나는 폴더
    - 모바일 설정 파일
    - `.ipynb`(코드)
  - 구현 뒤 `test_generation_title.py`에 S11과 각 꼴의 시험을 더한다. 조각 제목 종류가 바뀌는 `build.gradle.kts`도 시험한다.
  - 관련 스토리: US3.2
- [x] **Step 10. 재료 순서·변경 묶음·한 파일 상한** (BR5.2~5.7)
  - 새 모듈 `worker/app/generation/groups.py`를 만든다. 큰 후보 판정, 폴더 깊이 묶음, 계층 이름 묶음, 시험 파일 붙이기, 묶음 순서를 맡는다.
  - `worker/app/generation/request.py`의 `select`가 다음을 하게 한다.
    - 종류 순서로 담는다.
    - 큰 후보는 첫 채우기(몫까지)와 두 번째 채우기(남은 양)로 담는다.
    - 한 파일은 6,000 B(머리글 포함)까지만 담는다.
    - 크기 제외 표시는 지금대로 둔다.
  - 구현 뒤 `test_generation_material.py`에 S10·S12, 새 파일 `worker/tests/test_generation_groups.py`에 S24~S27을 쓴다.
  - 커밋 3,000 합성 후보로 결과만 단언한다(상한 안, 같은 입력이면 같은 결과). 시간은 단언하지 않는다(비기능 설계 Q1 A).
  - 관련 스토리: US3.2
- [x] **Step 11. 화면** (BR6.1~6.3)
  - `web/src/features/assets/assets-view.tsx`·`assets.module.css`:
    - 목록 카드 제목에 2줄 말줄임 클래스를 단다. 버튼 글은 전체 제목을 둔다.
    - 안내의 「설명」을 「설명 초안」으로 바꾼다(목록·상세).
  - `web/src/features/recipient/recipient-format.ts`·`recipient-screen.tsx`·`recipient.module.css`:
    - 목록 카드 제목에 2줄 말줄임 클래스를 단다.
    - 안내 문장을 새 세 꼴로 바꾼다.
  - 구현 뒤 `web/test/assets-view.test.mjs`·`web/test/recipient.test.mjs`를 고친다. S13(클래스 단언과 전체 글), S14, S15(목록·상세), 옛 꼴 작업 사실 Catch 그리기, 태그 꼴 제목을 글자로 그리기를 시험한다.
  - 관련 스토리: US4.1, US4.2, US4.3
- [x] **Step 12. 로그 원문 비노출** (보안 확인 사항)
  - 구현은 바꾸지 않는다(지금 로그는 건수·코드만 남긴다).
  - `worker/tests/test_consumer_processor.py`에 시험을 더한다. 기록의 글이 든 후보로 처리한 뒤 로그에 `workFacts[1]`과 제목 원문이 없는지 단언한다.
  - 관련 스토리: US2.2
- [x] **Step 13. 환경·빌드 설정** — 바꿀 설정이 없음을 확인한다. 계약 파일과 판본 문자열을 바꾸지 않는다(NFR6 해당 없음, 계약 C5). (전체)
- [x] **Step 14. 문서**
  - 새 문서 `worker/docs/generation-material.md`를 쓴다.
  - 「이 계획이 고치는 사람 쪽 파일」의 문서를 고친다. 상한에 가까운 두 문서는 글자 수를 늘리지 않는다. 문서 크기 검사를 돌린다(NFR7.1).
  - 나누기 규칙을 적은 작업 동일성 문서 네 개를 함께 고친다. `CatchU_작업동일성_판별기준.md`, `CatchU_work_identity_unit.md`, `CatchU_work_identity_rules.md` 9·10·32행, `CatchU_work_identity_cases.md` 70행 L5다. 한 문서만 고쳐 서로 어긋나는 일을 막는다.
  - 관련 스토리: 전체
- [x] **Step 15. 12월 AI 지시 주입 확인과 시간 측정** (NFR1.2, 성능 확인 사항)
  - `api/src/rag-answer/`·`api/src/ai-generation/`이 근거 조각을 지시와 나눠 넣는지, 근거를 따르지 말라는 지시가 있는지 읽는다.
  - 결과(파일·줄·판정)를 `code-summary.md`에 적는다. 고칠 것이 있으면 12월 AI 담당에게 알릴 글을 남긴다. CR1에서 api 코드는 바꾸지 않는다.
  - 커밋 3,000 합성 후보의 재료 고르기 시간을 한 번 재서 적는다(기준 5초).
- [x] **Step 16. 검증** — 이 Unit의 시험 명령을 돌린다. 그다음 intent 검증 명령(api·web·worker 전체 검사·시험·커버리지)을 돌린다. 기존 시험이 모두 통과하는지 확인한다. 결과를 `code-summary.md`에 적는다.
- [x] **Step 17. web 커버리지 보고 오류 고치기** (팀장 결정 2026-11-05)
  - `web/test/auth-session-member-guard.test.mjs` 32행의 가짜 모듈 주소만 고친다. `encodeURIComponent`가 만드는 `%2F`를 커버리지 보고가 거부하므로, 이름 속 영문·숫자·`-` 밖의 글자를 파일 이름에 쓸 수 있는 글자로 바꾼다. 시험 내용과 시험 수(901개)는 바꾸지 않는다.
  - 검증 명령은 바꾸지 않고 그대로 다시 돌려 종료 코드 0을 확인한다.
  - `code-summary.md`의 「한계」·「돌리지 않은 것」을 고치고 「계획과 다른 점」 6에 이유를 적는다.
- [x] **Step 18. 로컬 실제 연결 확인과 결과 기록** (B1 완료 조건, 팀장 요청 2026-11-05)
  - 이 작업 폴더를 #450 로컬 실제 분석 도구의 사본으로 띄운다. 로그인·GitHub 연결·저장소 등록·분석 요청·발행·링크는 팀장이 브라우저에서 한다.
  - 공개 저장소 `ljm0850/TheMe`와 `ljm0850/catchu-live-test`를 분석해 다섯 가지를 본다: 기록의 글이 제목으로 나온다, 작업 사실 첫 줄에 SHA·날짜가 없다, 여러 이슈를 가리키는 PR이 Catch 하나다, 목록 제목이 2줄에서 말줄임으로 끝난다, 받은 사람 안내가 새 문장이다.
  - TheMe는 통합 브랜치 판본의 같은 커밋 분석 결과(데모 DB)와 작업 열쇠끼리 맞대어 본다. 여러 이슈 PR은 대상이 없으면 새로 만들지 않고 「확인 대상 없음」으로 적고, 근거로 나누기 코드 삭제와 합성 사례 C7을 적는다. GitHub에 새 글은 올리지 않는다.
  - 결과를 `code-summary.md` 「로컬 실제 연결 확인」에 적는다.
  - 관련 스토리: US2.1, US2.2, US4.1~4.3

## 스토리와 단계

| 스토리 | 단계 |
|---|---|
| US1.4 | Step 5 |
| US2.1 | Step 4, 6, 8 |
| US2.2 | Step 6, 7, 12 |
| US3.2 | Step 9, 10 |
| US4.1 | Step 11 |
| US4.2 | Step 11 |
| US4.3 | Step 11 |

## 다른 작업의 파일

12월 intent의 파일(`api/src/ai-generation/` 등)은 Step 15에서 읽기만 하고 고치지 않는다.
