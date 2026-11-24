# Code Generation Plan — u4-privacy-policy

## Summary

- Builds: 개인정보 처리방침에 프리셋을 넣는 확정 문구 다섯 곳(C1~C5, C5 날짜 2026년 11월 30일)과 그 원문 출처·SHA-256
- Touches: `web/src/features/privacy/privacy-policy.md`·`privacy-policy.tsx`·`README.md`, `web/test/privacy-policy.test.mjs`
- Tests: 새 시험 없음. 지금 방침 시험 5건(사본 SHA-256, 화면·사본 차례·글자 대조, 더한 글·링크·강조 없음, 주소·제목, 바닥글 링크)을 새 사본에 맞춰 돌린다

근거: 기능 설계 `construction/u4-privacy-policy/functional-design/`(functional-spec 「확정 문구」 C1~C5, rules BR1.1~BR1.5, frontend-components), 계약 `inception/contract-design/contract-summary.md`(U4는 다른 단위와 경계 없음), 단위 `inception/units-generation/unit-of-work.md` U4, Bolt 계획 `inception/delivery-planning/bolt-plan.md` B4, 요구사항 `inception/requirements-analysis/requirements.md` FR4.3, 이야기 US4.3(AC4.3.1·AC4.3.2). U4는 NFR 요구·NFR 설계·인프라 설계를 건너뛰었다(정적 방침 글자만 바꿈).

C5의 날짜: 2026-11-20 팀장 답 「30」(이 단계 질문). C5의 새 줄은 `- 2026년 11월 30일: 처리하는 정보, 보관 기간, 하나씩 지우기에 프리셋(이름과 담은 자료 목록)을 더했습니다.`다.

이 단위는 web만 바꾼다. 주소·화면 구조·CSS·`page.tsx`는 바꾸지 않는다. 4번 「처리 위탁과 국외 이전」은 바꾸지 않는다(ADR-007, 프리셋 이름은 외부 AI로 보내지 않음).

## 함께 고칠 파일

같은 방침 글이나 그 출처·SHA-256을 적은 곳을 저장소에서 찾았다(`aidlc/`·`node_modules`·`.next` 밖). 아래 넷뿐이고, 모두 이 계획에서 고친다.

| 파일 | 담은 것 | 고치는 것 |
|---|---|---|
| `web/src/features/privacy/privacy-policy.md` | 원문 사본 | C1~C5 |
| `web/src/features/privacy/privacy-policy.tsx` | 화면 글 | C1~C5를 같은 글자로 |
| `web/test/privacy-policy.test.mjs` | 출처 주석, `SOURCE_SHA256`, 첫 시험 이름, 원문에서 뽑은 목록 항목 수(93행 주석 「33항목」, 94행 기대값 `33`) | 새 출처와 새 값, 목록 항목 수 33 → 34(C5가 9번 절에 `<li>` 하나를 더함) |
| `web/src/features/privacy/README.md` | 「근거」·「검사」의 출처 | 새 출처, #496 문구는 앞 판본 기록 |

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
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. 작업에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
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
  "input_sha256": "sha256:2c6dfe11bf7b84b526de04b91c6ffa1bf16c0999abc8c900b38b4489cf6c37b7",
  "contract_sha256": "sha256:6ff05b9b42bd7dbad0e63d173bb508a9fb24b4a1436e3bdb2f5706fc9118f55c"
}
```

이 단위의 시험 층은 화면(Frontend behavior) 하나다. DB·저장소·업무 규칙·API 층은 없다(입력·저장·api 호출 없음, frontend-components 「상태·입력·API」). 시험 수는 지금 방침 시험 5건으로 standard의 부품당 5~8건을 채우고, 기능 설계대로 새 대조 방식을 더하지 않는다(functional-spec 「원문 출처와 대조」).

## Steps

### Step 1: 구조와 설정 확인 — [x]

- 새 파일·폴더·설정은 없다. `web/src/features/privacy/`의 지금 파일 넷(`privacy-policy.md`·`privacy-policy.tsx`·`privacy-policy.module.css`·`README.md`)과 `web/src/app/(guest)/privacy/page.tsx`를 그대로 쓴다.
- 이야기: US4.3

### Step 2: 시험 실행기 확인 — [x]

- 지금 web 실행기(`node --test`, `web/package.json`의 `test`)로 이 단위 명령(`unit-test-instructions.md`)이 바꾸기 전 트리에서 통과하는지 먼저 돌린다(기준선).
- 이야기: US4.3

### Step 3: 시나리오·기대 결과·실패 조건 먼저 정하기 — [x]

팀 관행 순서대로 글을 고치기 전에 `unit-test-instructions.md` 「시나리오」 표를 확정한다. 이 단위는 새 시험 코드를 쓰지 않으므로, 시나리오는 지금 시험 5건과 Step 7의 사본 차이 확인이 무엇을 잡는지로 정한다.

- 1번 표의 프리셋(C1, AC4.3.1), 2번 보관 목록(C2), 하나씩 지우기 두 곳(C3·C4, AC4.3.2), 9번 바뀐 날짜와 내용(C5)
- 사본·화면 글자 어긋남, SHA-256을 안 바꿈, SHA-256만 바꾸고 사본이 확정 문구와 다름
- 이야기: US4.3

### Step 4: 원문 사본 고치기 — [x]

- `web/src/features/privacy/privacy-policy.md`의 지금 13·23·24·56행을 functional-spec 「확정 문구」 C1~C4의 새 글로 바꾸고, 83행 바로 다음에 C5의 새 줄(날짜 30일)을 넣는다. 그 밖의 글자·줄·순서·빈 줄은 바꾸지 않는다. 줄 끝은 LF, 84행 → 85행.
- 규칙: BR1.1(C1), BR1.3(C2), BR1.2(C3·C4), BR1.4(C5)
- 이야기: US4.3(AC4.3.1·AC4.3.2)

### Step 5: 화면 글 고치기 — [x]

- `web/src/features/privacy/privacy-policy.tsx`에서 사본과 같은 글자로 바꾼다. C1: 「자료·JD를 올리고 발행할 때」 줄 둘째 `<td>`. C2·C3: 2번 `<ul>`의 첫째·둘째 `<li>`. C4: 5번 「하나씩 지우기」 `<li>`. C5: 9번 「이 방침은 2026년 11월 16일부터 적용합니다.」 `<li>` 바로 다음에 새 `<li>` 하나. 태그 구조·CSS 이름·강조·링크는 더하거나 바꾸지 않는다.
- 규칙: BR1.1~BR1.5
- 이야기: US4.3(AC4.3.1·AC4.3.2)

### Step 6: 시험의 출처와 SHA-256 고치기 — [x]

- `web/test/privacy-policy.test.mjs` 머리 주석의 원문 출처를 「#496 팀장 확정 문구 댓글」에서 이 단위 기능 설계 문서(`aidlc/spaces/default/intents/261118-publication-presets/construction/u4-privacy-policy/functional-design/functional-spec.md` 「확정 문구」, #496 2026-11-12 확정 문구에 C1~C5를 바꾼 글)와 C5 날짜(2026-11-20 팀장 답 30일)로 바꾼다. 「접힌 칸」 같은 댓글 전용 말은 새 출처에 맞게 고친다. 머리 주석의 기대·실패 조건·고칠 때 안내는 그대로 둔다.
- `SOURCE_SHA256`을 새 사본의 SHA-256으로 바꾼다.
- 첫 시험 이름 「원문 사본은 팀장 확정 문구의 접힌 칸 그대로다(SHA-256)」를 새 출처에 맞게 「원문 사본은 확정 문구 그대로다(SHA-256)」로 바꾼다. 시험 몸통과 다른 시험 4건의 대조 방식은 바꾸지 않는다.
- 둘째 시험(화면·사본 차례·글자 대조)의 원문에서 뽑은 목록 항목 수를 바꾼다. 94행 기대값 배열의 마지막 `33`을 `34`로, 93행 주석의 「목록 8묶음 33항목」을 「목록 8묶음 34항목」으로 바꾼다(U4 기능 설계 검토의 Major, C5가 9번 절에 `<li>` 하나를 더해서). 대조 방식과 다른 기대값(제목·절·표·줄·머리 칸·목록 묶음 수, `<br>` 3곳, 코드 1곳)은 그대로 둔다.
- 규칙: BR1.5
- 이야기: US4.3

### Step 7: 사본과 확정 문구의 차이 확인 — [x]

- 바꾸기 전 사본과 바꾼 사본의 차이(`git diff -- web/src/features/privacy/privacy-policy.md`)가 C1~C5 다섯 곳뿐이고, 각 줄이 functional-spec 「확정 문구」 표의 새 글(C5는 날짜 30일)과 글자 그대로 같은지 확인한다(functional-spec 「실패와 경계」: SHA-256만 바꾸면 시험은 통과하지만 출처와 어긋난다). 결과를 `code-summary.md`에 적는다.
- 규칙: BR1.5
- 이야기: US4.3

### Step 8: 이 단위 시험 돌리기 — [x]

- `unit-test-instructions.md`의 이 단위 명령을 돌려 5건이 통과하는지 본다. 실패하면 사본·화면·SHA-256 중 어긋난 곳을 고친다(시험 대조 방식은 바꾸지 않는다).
- 이야기: US4.3

### Step 9: 설정·빌드 — [x]

- 바꿀 환경·빌드 설정은 없다. web 빌드·검사는 Unit 확인 명령(Bolt 계획 「확인 명령」)이 돈다.

### Step 10: 문서 — [x]

- `web/src/features/privacy/README.md` 「근거」의 글 출처를 이 단위 기능 설계 문서 「확정 문구」(2026-11-20, #597 발행 프리셋, C5 날짜 2026년 11월 30일)로 바꾸고, #496 결정·고친 확정 문구(2026-11-12) 댓글은 앞 판본의 기록으로 남긴다. 「같은 폴더의 `privacy-policy.md`가 그 접힌 칸을 …」 문장과 「검사」의 「사본이 확정 문구 그대로인지(SHA-256)」를 새 출처에 맞게 고친다. 「구성」·「지키는 것」은 그대로 둔다.
- 규칙: BR1.5
- 이야기: US4.3

## 이야기와 단계

| 이야기·수락 기준 | 단계 |
|---|---|
| US4.3 AC4.3.1 저장 항목 표에 프리셋 | Step 4, Step 5 |
| US4.3 AC4.3.2 하나씩 지우기에 프리셋, 팀장 확정 문구 | Step 4, Step 5, Step 7 |
| BR1.4 9번 바뀐 날짜와 내용 | Step 4, Step 5 |
| BR1.5 사본·화면 같게, 출처와 SHA-256 | Step 5, Step 6, Step 7, Step 10 |

## 이 단위에서 하지 않는 것

- 방침을 main에 올리는 일. C5 날짜 30일은 main 배포일이며, dev PR 병합과 main 배포는 Bolt B4와 팀장 결정을 따른다. 30일에 main 배포가 안 되면 날짜를 다시 고쳐야 한다.
- 4번 외부 AI 절, 시행일 줄(11월 16일), `page.tsx`, CSS.
- 브라우저 320px 폭 확인은 Build and Test에서 한다(frontend-components 「확인」).
