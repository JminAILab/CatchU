# NC2 면접관 사본 칸과 표지 — 코드 생성 계획

## Summary

- Builds: 발행 사본 선택 칸 넷(저장소 이름·작성 달·작업 전체 한계·근거별 본인 커밋), 면접관 화면의 저장소 줄·작성 시점·「이 기록으로 알 수 없는 것」·「이 작업의 본인 커밋」 표지, 세 AI 지시 문장, 안전망 경고 줄, 한계 문장 대조 시험
- Touches: api `src/publications/`(사본 형·만들기·발행 조회·로그, 새 한계 문장 상수 파일), `src/rag-answer/rag-answer-config.ts`, `src/jd-summary/jd-generation-request.ts`; web `src/lib/github-link-name.ts`, `src/features/publications/`(사본 보기·API 검사·CSS), `src/features/recipient/recipient-api.ts`; 같은 규칙을 적은 api·web 문서
- Tests: api 고칠 시험 파일 5개와 새 파일 1개(약 22개), web 고칠 시험 파일 3개와 공통 함수 시험 1개(약 22개), 기존 시험은 그대로 통과

## 입력

- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`: `functional-spec.md`(W1~W4, 화면 상태, FR10.3 자리 읽기, 함수 모양, 시험), `rules.md`(BR1.1~BR5.2, 2026-11-10 BR1.4·BR1.6·BR4.1 덧붙임), `entities.md`
- NFR 요구·설계 `construction/nc2-snapshot-fields/nfr-requirements/`, `nfr-design/`(성능·보안·신뢰성·관측 설계, 논리 구성 요소)
- 각 단계 검토의 남은 지적:
  - 기능 설계 검토 Minor: 바뀐 줄 링크 표지 자리 읽기를 README·PR에 적기(Step 11), 작성 시점이 든 h4를 글자로 찾는 시험 고치기(Step 8)
  - NFR 설계 검토 Major: 소속 기록 판정이 저장소가 같음을 직접 닫기(Step 4). Minor: 안전망 시험 만드는 법(Step 4), 잠금 조회 별칭과 조인 키(Step 4)
- 계약 `inception/contract-design/contract-summary.md` C3·C6(2026-11-10 덧붙임)·C7
- Unit 정의 `inception/units-generation/unit-of-work.md`(NC2, service), 요구사항 `inception/requirements-analysis/requirements.md` FR9~FR11·NFR1·NFR2·NFR5~NFR8
- 이야기 `inception/user-stories/stories.md` US6.1~US8.1(수락 기준 30개)
- 다듬은 화면 `inception/refined-mockups/mockups.md` 4절, `interaction-spec.md` 4절·9절
- 인프라 설계는 이 Unit에서 건너뛰었다(새 자원·환경변수·마이그레이션·CI 변경 없음).

## 이 계획이 고치는 사람 쪽 파일

같은 규칙을 적은 문서를 모두 함께 고친다(이 프로젝트 규칙).

- 사본 모양(C3 주인 문서): `api/docs/publications.md`의 사본 모양·발행 설명에 선택 칸 넷과 고르는 규칙(저장소 등록, 한국 시간 달, 한계 문장 넷 대조, 소속 기록으로 정하는 `ownCommit`), 안전망 경고 줄을 더한다. 조각 대상 칸 설명이 있는 `api/docs/published-index.md`에는 「새 사본 칸 넷은 조각이 되지 않는다」 한 줄을 더한다. `api/docs/catch-visibility.md`는 사본 칸을 다루는 줄이 있으면 같은 내용으로 맞추고, 없으면 고치지 않는다(코드 생성 때 확인해 `code-summary.md`에 적음).
- 발행·사본 화면: `web/src/features/publications/README.md`에 세 칸 표시, 표지의 뜻(FR10.5: 판본·커밋이 이 작업의 본인 커밋이라는 뜻이지 그 줄을 본인이 썼다는 뜻이 아님), 표지 자리(링크 밖, 바뀐 줄 링크도 링크 전체 뒤 — FR10.3 읽기와 그 까닭), 화면 낭독기 한계, 소속 기록 마이그레이션 전 Catch와 다른 Catch에 배정된 커밋에는 표지가 없는 한계.
- 받은 사람 화면: `web/src/features/recipient/README.md`의 `recipient-api.ts` 줄에 새 칸 넷을 옮긴다는 말.
- 소속 기록: `api/src/catches/entities/commit-assignment.entity.ts`의 주석과 소속 기록을 적은 api 문서에 새 쓰임과 한계 문장 상수 목록 한 줄(Step 10, 플랜 승인 때 팀장 덧붙임).
- JD 요약 지시: 지시 문장을 적은 api 문서는 없다(코드 검색 결과). `api/docs/jd.md`는 고치지 않고, PR에서 U10 담당 확인을 받는다.
- 고치지 않음: worker 코드와 결과 메시지 계약, 요구사항 FR10.2(사람 결정), 화면 그림.

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

- [x] **Step 1. 구조·설정 확인** — 새 파일 자리(`api/src/publications/work-limit-sentences.ts`, 새 시험 `api/test/publications/work-limit-sentences.test.cjs`)와 불러오기 방향을 확인한다. 새 의존성·환경변수·마이그레이션·CI 변경은 없다. 고칠 파일 목록을 이 계획대로 확정한다. (전체)
- [x] **Step 2. 시험 실행기 확인** — `unit-test-instructions.md`의 Unit 시험 명령(web `node --test`, api `npm --prefix api test -- …`)을 고치기 전 코드에서 한 번 돌려 실행되는지 확인한다. 새 시험 파일은 아직 없으므로 뺀 명령으로 돌린다. api 명령은 시험 DB(127.0.0.1:5433)가 있어야 하며, 없으면 사람에게 알리고 기다린다. (전체)
- [x] **Step 3. 시나리오·기대 결과·실패 조건 먼저 정하기** — US6.1~US8.1의 수락 기준 30개와 `unit-test-instructions.md` 「실패 조건」을 시험 파일·시험 이름에 짝짓는다. 시험 이름에 수락 기준 번호(AC6.1.1 등)를 적는다. AC8.1.1~AC8.1.3의 답 말투는 빌드와 시험의 질의응답 10개 다시 재기(FR11.2)가 판정하므로, 이 Unit 시험은 지시 문장이 붙었는지까지만 본다고 적는다. 짝을 찾지 못한 기준이 있으면 이 단계에서 사람에게 알린다. (US6~US8)
- [x] **Step 4. api 발행: 사본 칸 넷과 안전망 경고** (BR1.1~BR1.6, 성능·보안·신뢰성·관측 설계)
  - `api/src/publications/published-snapshot.ts`: `CatchSnapshot`에 선택 칸 `repositoryName?`·`authorDescriptionEditedMonth?`·`workLimits?`, `evidence[]` 항목에 `ownCommit?: boolean`.
  - 새 파일 `api/src/publications/work-limit-sentences.ts`: 한계 문장 상수 넷(완전 문장 둘, 같은 작업 경고 앞부분 둘)과 고르는 함수(같거나 앞부분으로 시작하는 문장만, 근거 순서, 같은 글자는 한 번).
  - `api/src/publications/publish.service.ts`:
    - `CATCH_LOCK_SQL`: `c.author_description_updated_at`을 더 읽고, `repository_registration`을 `analysis_request`의 세 칸(`member_id`, `registration_id`, `repository_id`)으로 LEFT JOIN 해 `owner`·`name`을 읽는다. 별칭은 지금 `r`(analysis_request)과 겹치지 않게 `rr`로 둔다(NFR 설계 검토 Minor).
    - `EVIDENCE_SQL`: `e.coverage_limits`를 더 읽는다.
    - 새 소속 기록 질의 하나: 근거 가운데 `/<소유자>/<저장소>/commit/<16진수 40자>` 주소의 식별값(소문자)만 모아, `member_id = 발행 회원 AND catch_id = ANY(고른 Catch) AND commit_sha = ANY(그 식별값)`으로 한 번 읽는다. 식별값이 없으면 보내지 않는다. 결과는 (catch_id, github_repository_id, commit_sha)이고, `ownCommit`은 「근거의 Catch, 그 Catch의 분석 요청 `repository_id`, 근거 식별값」 셋이 모두 맞을 때만 참이다. 그래서 다른 저장소의 같은 식별값은 참이 되지 않는다(NFR 설계 검토 Major, NFR5.3).
    - 트랜잭션 결과에 「저장소 이름을 뺀 Catch가 있었는지」를 함께 돌려주고, 발행 성공 뒤 `publishSucceeded` 옆에서 그 값이 참이면 경고 줄을 남긴다. 롤백되면 남기지 않는다.
  - `api/src/publications/snapshot-builder.ts`: `CatchSourceRow`에 `authorDescriptionUpdatedAt`·`repositoryOwner`·`repositoryName`(null 가능), `CatchEvidenceRow`에 `coverageLimits`·`ownCommit`. `buildCatchSnapshot`이 칸을 담는다: 이름 둘이 있으면 `owner/name`, 작성 달은 설명이 있을 때 UTC+9의 "YYYY-MM", `workLimits`는 고른 문장이 있을 때만, `ownCommit`은 모든 근거에. `snapshotTextLength`는 새 칸을 세지 않는다(지금 그대로).
  - `api/src/publications/publications-log.ts`: 사건 `SNAPSHOT_REPOSITORY_NAME_MISSING`(warn, 발행본 ID·회원 ID만, 나머지 null)과 함수 하나.
  - 구현 뒤 시험:
    - `api/test/publications/publish-api.test.cjs`(실제 DB): 새 사본에 저장소 이름이 등록의 `owner/name`(AC6.1.1), 작성 달 11월(AC6.2.1)·2026-11-30T16:00Z → "2026-12"(AC6.2.2)·설명 없으면 칸 없음(AC6.2.3), 발행 뒤 설명을 고쳐도 사본 그대로(AC6.2.4), 두 근거의 같은 한계 문장은 한 번(AC6.3.1), 같은 작업 경고와 근거별 조회 상태가 섞이면 경고만(AC6.3.2), 한계 없으면 칸 없음(AC6.3.3), 소속 기록에 있는 커밋 주소 근거는 `ownCommit` 참·병합 커밋 근거와 PR·이슈 근거는 거짓(AC7.2.2), 다른 Catch에 속한 커밋 주소와 다른 회원의 소속 기록은 거짓, 같은 식별값이지만 다른 저장소 ID의 소속 기록은 거짓(NFR5.3).
    - `api/test/publications/snapshot-builder` 쪽 순수 함수 시험(기존 발행 시험 파일 안 또는 같은 폴더의 새 시험, 코드 생성에서 자리 확정): 저장소 이름이 null이면 `repositoryName`만 빠지고 나머지는 같다(안전망, NFR 설계 검토 Minor의 만드는 법).
    - `api/test/publications/publications-logging.test.cjs`: 서비스가 「뺀 Catch 있음」을 받았을 때 발행 성공 뒤 경고 줄 하나(발행본 ID·회원 ID만), 롤백이면 없음.
    - 새 `api/test/publications/work-limit-sentences.test.cjs`: 고르는 함수 갈래(같음·앞부분·다른 문장·중복)와 C6 대조(Step 5).
  - 관련 스토리: US6.1, US6.2, US6.3, US7.1, US7.2
- [x] **Step 5. 한계 문장 대조 시험** (BR1.6, 신뢰성 설계 3절, NFR8.2)
  - `api/test/publications/work-limit-sentences.test.cjs`가 `resolve(__dirname, '../../../worker/app/candidates/build.py')`를 읽는다(지금 `api/test/analysis/shared-fixtures.check.cjs`와 같은 경로 기준). 한계 문장 둘은 `"` + 상수 + `"`, 같은 작업 경고 앞부분 둘은 `f"` + 상수가 글자 그대로 있는지 본다.
  - 반례: 원본 글자에서 한 문장만 다른 글자로 바꾼 사본으로 같은 검사 함수를 돌리면 실패해야 한다.
  - 실패 메시지(플랜 승인 때 팀장 덧붙임): 찾지 못한 상수의 이름과 「worker/app/candidates/build.py의 이 문장이 바뀌었다면 api/src/publications/work-limit-sentences.ts의 같은 상수도 함께 고친다」를 적는다. worker만 고친 사람이 api 시험 실패를 보고 바로 고칠 수 있게 하기 위해서다. 반례 시험은 이 메시지에 상수 이름과 두 파일 경로가 들어 있는지도 본다.
  - CI는 고치지 않는다(`ci.yml`이 `worker/app/*` 변경에도 api 시험을 돌린다). worker 파일은 고치지 않는다.
  - 관련 스토리: US6.3
- [x] **Step 6. AI 재료에서 빼기와 지시 문장** (BR1.5, BR5.1, BR5.2, 보안 설계 4절)
  - `api/src/rag-answer/rag-answer-config.ts`: 문장 상수 하나(「자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.」)를 두고 `QNA_INSTRUCTION`·`BASE_SUMMARY_INSTRUCTION` 끝에 붙인다.
  - `api/src/jd-summary/jd-generation-request.ts`: JD 요약 지시 끝에 같은 상수를 붙인다(U10 영역, PR에서 U10 담당 확인).
  - `chunker.ts`·`summary-sources.ts`는 고치지 않는다.
  - 구현 뒤 시험:
    - `api/test/published-index/chunker.test.cjs`: 세 칸·`ownCommit`이 든 사본으로 만든 조각 글에 새 칸 값과 「이 작업의 본인 커밋」이 0건(AC6.5.1, AC6.5.2).
    - `api/test/rag-answer/summary-sources.test.cjs`: 같은 사본의 요약 근거에 새 칸 값 0건(AC6.5.1).
    - `api/test/rag-answer/qna-controller.test.cjs`·`base-summary-handler.test.cjs`: 지시가 상수 문장으로 끝남, 딱지 상수 `SOURCE_LABELS`가 둘(AC6.5.3, AC8.1.1, AC8.1.2).
    - `api/test/jd/jd-summary.test.cjs`: JD 요약 지시가 같은 문장으로 끝남.
  - 관련 스토리: US6.5, US8.1
- [x] **Step 7. web 사본 형·검사·받은 사람 칸 옮기기** (BR2.1, BR2.2, 신뢰성 설계 1절)
  - `web/src/features/publications/publications-api.ts`: `CatchSnapshot` 형에 선택 칸 넷. `isCatchSnapshot`이 칸이 없으면 통과, 있으면 모양 검사(비어 있지 않은 글, `^[0-9]{4}-(0[1-9]|1[0-2])$`, 비어 있지 않은 글 배열 1개 이상, 참·거짓). 틀리면 지금처럼 사본 전체가 올바르지 않은 응답이다.
  - `web/src/features/recipient/recipient-api.ts` `pickItem`: 새 칸을 있을 때만 옮기고 `ownCommit`도 옮긴다.
  - 구현 뒤 시험 `web/test/recipient.test.mjs`·`web/test/publications-owner.test.mjs`: 옛 사본 통과, 새 칸 넷 옮김(AC6.4.2), 모양 틀린 칸 셋 거부.
  - 관련 스토리: US6.4
- [x] **Step 8. 사본 보기: 저장소 줄·작성 시점·한계 목록** (BR3.1~BR3.4, NFR6.2·NFR6.3)
  - `web/src/features/publications/snapshot-view.tsx`: Catch 항목에서 h3 바로 다음, 불일치 표지 앞에 `repositoryName`을 작은 글자 `p`로(`styles.small`). h4 「작성자 설명」 안에 작은 글자 `span` 「YYYY년 M월에 마지막으로 고침」(앞의 0 뺌). 「기록에서 확인한 내용」 안 작업 사실(또는 빈 안내) 다음, `details` 앞에 `strong` 「이 기록으로 알 수 없는 것」과 `ul`. 칸이 없으면 각각 그리지 않는다. 모두 React 텍스트로만 그린다.
  - h3는 지금 `PublishedSnapshotView`에 있으므로 저장소 줄을 그 자리에 둘지, `CatchSnapshotView` 맨 위에 둘지는 h3 바로 아래·불일치 표지 위라는 결과가 같게 코드 생성에서 정한다.
  - 작성 시점이 h4 안에 들어가 h4 글자가 바뀌므로, h4를 「작성자 설명」 글자로 찾는 기존 web 시험(`web/test/recipient.test.mjs`·`publications-owner.test.mjs`의 h4 글자 대조)을 모두 찾아 고친다(기능 설계 검토 Minor, NFR6.2).
  - 구현 뒤 시험(같은 두 파일): 저장소 줄 위치(AC6.1.1)와 작성자 발행본 상세도 같음(AC6.1.2), 작성 시점 글(AC6.2.1·AC6.2.2)과 설명 없을 때 없음(AC6.2.3), 한계 목록 한 번(AC6.3.1)·없으면 안 그림(AC6.3.3)·작업 사실 아래 펼친 채(AC6.3.4), 옛 사본은 세 칸 없이 지금 그대로(AC6.4.1), 태그 꼴 한계 항목이 글자로 보임.
  - 관련 스토리: US6.1, US6.2, US6.3, US6.4
- [x] **Step 9. 표지 판정과 그리기** (BR4.1~BR4.7, 보안 설계 3절, 성능 설계 「접근성」)
  - `web/src/lib/github-link-name.ts`: `ownCommitsOf(evidence)`(ownCommit 참이고 커밋 주소인 근거의 (저장소, 소문자 40자), 중복 없음), `isOwnCommitLink(url, ownCommits)`(링크 이름 표의 판본·커밋 꼴이고 판본이 16진수 7~40자일 때, 저장소 대소문자 무시로 같고 식별값 앞부분이 맞는 본인 커밋이 정확히 하나면 참). 커밋 바뀐 줄 이름을 「줄 꼬리 앞」에 표지를 붙인다고 적은 주석을 「표지는 링크 밖, 링크 전체 뒤」로 고친다.
  - `web/src/features/publications/snapshot-view.tsx`: 작성자 설명을 그릴 때 사본 근거로 본인 커밋 목록을 한 번 만들어 넘기고, 판정이 참인 링크는 `GithubLink`(그리고 강조 `mark`)가 닫힌 뒤 형제 `span` 「이 작업의 본인 커밋」을 둔다(`data-testid="own-commit-mark"`). `tabIndex`·`role`·`aria-hidden`을 두지 않는다. 강조가 링크와 겹쳐도 표지는 `mark` 밖이다. 텍스트 자료 본문과 편집 화면 링크 목록에는 넘기지 않는다.
  - `web/src/features/publications/publications.module.css`: 표지 클래스 하나. 값은 `.kindBadge`와 같고(둥근 배경 상자, 12px 굵은 글자, 같은 색) 새 색이 없다. 링크와 같은 줄에서 함께 줄을 바꾸도록 `inline-block`과 왼쪽 여백 하나.
  - 구현 뒤 시험:
    - `web/test/github-link-name.test.mjs`: 짧은 식별값 파일 줄 링크(AC7.1.1), 대문자 40자 커밋 링크(AC7.1.2), 저장소 대소문자 다름(AC7.1.5), 줄 범위 없는 파일 링크(AC7.1.6)는 참. 다른 저장소의 같은 식별값(AC7.2.1), ownCommit 거짓 근거만 맞음(AC7.2.2), 7자 앞부분이 둘과 맞음(AC7.2.3), 20건 밖 식별값(AC7.2.5), PR 링크·브랜치 판본·표 밖 꼴은 거짓.
    - `web/test/recipient.test.mjs`·`publications-owner.test.mjs`: 표지가 링크 요소 밖 바로 뒤에 있고 글자 「이 작업의 본인 커밋」(AC7.1.1·AC7.1.3·AC7.1.4), 바뀐 줄 링크는 이름이 나뉘지 않고 링크 전체 뒤, 맞지 않으면 아무 표지 없음(AC7.2.4), 작성자가 쓴 「[이 작업의 본인 커밋]」은 표지 요소가 아님(AC7.2.6), 강조가 겹칠 때 표지는 `mark` 밖, 옛 사본(ownCommit 없음)은 표지 없음, 표지 화면에 뜻 안내 문장이 없음(AC7.1.4).
  - 관련 스토리: US7.1, US7.2
- [x] **Step 10. 문서** — 「이 계획이 고치는 사람 쪽 파일」의 api·web 문서를 고친다. README의 표지 자리 문단에는 FR10.3 「판본·커밋 이름 바로 뒤」를 「링크 바로 뒤」로 읽은 까닭(기능 설계 Q3 B)을 함께 적는다(기능 설계 검토 Minor). 문서 크기 검사(`docs-size`)를 돌린다. (전체)
  - 소속 기록의 새 쓰임(플랜 승인 때 팀장 덧붙임): 소속 기록을 설명하는 자리 — `api/src/catches/entities/commit-assignment.entity.ts`의 엔티티 주석과, 소속 기록을 적은 api 문서(코드 생성 때 찾아 `code-summary.md`에 파일 이름을 적음) — 에 한 줄씩 적는다. ① 소속 기록이 이제 발행 사본의 본인 커밋 표지(`ownCommit`)의 근거로도 쓰여, 소속 기록의 뜻이나 쓰는 규칙을 바꾸면 표지도 바뀐다. ② worker에 새 작업 전체 한계 문장을 더하면 `api/src/publications/work-limit-sentences.ts`의 상수 목록에도 더해야 면접관 화면에 보인다. 까닭: 소속 기록과 한계 문장을 바꾸는 사람이 표지·한계 목록에 미치는 영향을 그 자리에서 알게 하기 위해서다.
- [x] **Step 11. 검증** — 이 Unit의 시험 명령을 돌리고, intent 검증 명령(`verification-command.txt`, api·web·worker 전체 검사·시험·커버리지)을 60분 상한으로 돌린다. 시작 전에 `pmset -g batt`(충전기)와 `sysctl -n vm.loadavg`(1분 평균 6 미만)를 보고, 끝나면 api·web·worker 각각 걸린 시간을 `code-summary.md`에 적는다. 기존 시험이 모두 통과하는지 확인한다. PR 본문에 적을 것(GitHub·AI 호출 수 그대로, 표지 자리 읽기, U10 담당 확인 요청)을 `code-summary.md`에 모아 둔다. (전체)
- [x] **Step 12. 로컬 실제 연결 확인(최소 연결 첫 결과)** — bolt-plan B2 「보일 결과」대로 로컬 api·DB·web에서 새로 분석한 Catch(소속 기록이 있는 것)를 발행하고, 받은 사람 링크로 열어 제목 아래 저장소 이름, 「작성자 설명」 옆 작성 시점, 작업 사실 아래 「이 기록으로 알 수 없는 것」(있을 때), 본인 커밋 판본 링크 뒤 표지와 병합 커밋 링크에는 표지가 없음을 확인한다. 서버를 띄우기 전에 사람에게 알리고, 결과(화면에서 본 것, 합성 자료인지)를 `code-summary.md`에 적는다. 이 확인은 전체 완료나 배포 성공이 아니다(팀 규칙). (US6.1, US6.2, US6.3, US7.1, US7.2)

## 스토리와 단계

| 스토리 | 단계 |
|---|---|
| US6.1·US6.2 | Step 4, 8 |
| US6.3 | Step 4, 5, 8 |
| US6.4 | Step 7, 8 |
| US6.5 | Step 6 |
| US7.1·US7.2 | Step 4, 9 |
| US8.1 | Step 6 |

## 다른 작업의 파일

- 12월 intent(260925-intent-12)의 파일은 이 계획이 고치는 것(`api/src/catches/entities/commit-assignment.entity.ts`의 주석, `api/src/publications/`의 다섯 파일과 시험, `api/src/rag-answer/rag-answer-config.ts`와 시험, `api/src/jd-summary/jd-generation-request.ts`와 시험, `api/src/published-index/`의 시험 하나, `web/src/features/publications/`·`recipient/`의 파일과 시험, 문서)만 고친다. 그 밖은 읽기만 한다.
- `worker/app/candidates/build.py`는 시험이 읽기만 한다.
- `api/src/published-index/chunker.ts`, `api/src/rag-answer/summary-sources.ts`, `web/src/lib/github-source-url.ts`는 고치지 않는다.
