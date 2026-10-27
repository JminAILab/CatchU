# U1 AI 생성 관문 최소 경로 — 코드 생성 계획

## Summary

- Builds: C-01 `AiGenerationGate.generate()` 최소 경로(줄 나누기·Claude 인용 호출·항목 묶기·원문 위치·거부 사례 ①②)와 시험
- Touches: `api/src/ai-generation/`(새 폴더, 앱 미등록), `api/test/ai-generation/`, `api/package.json`·`package-lock.json`(Claude SDK), `api/docs/ai-generation.md`, `api/CONVENTIONS.md`, `api/.env.example` 주석
- Tests: 기록한 HTTP 응답 시험 약 40개(구성 요소별 5~8개, 시나리오 S1~S7·S9와 보안·신뢰성 항목)와 키가 있을 때만 도는 실제 호출 시험 1개(S8)

## Sources

입력: [U1 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [U1 비기능 요구사항](../nfr-requirements/)·[비기능 설계](../nfr-design/)(논리 구성 요소·보안·성능·신뢰성·관측), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01, [Unit 정의](../../../inception/units-generation/unit-of-work.md)의 U1, [요구사항](../../../inception/requirements-analysis/requirements.md)의 FR6.4·FR6.5·FR6.9·A04, [사용자 스토리](../../../inception/user-stories/stories.md)의 US6.3, api 규약(`api/CONVENTIONS.md`)과 시험 실행기(`api/scripts/test-with-db.cjs`).

구현하는 스토리는 US6.3의 인용 연결 부분이다. 아래 모든 단계는 US6.3에 대응하며, 각 단계 끝 괄호에 기능 규칙(BR)·비기능 요구사항(NFR) ID를 적는다.

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

## 적용하지 않는 층

U1은 DB 표·저장소 계층·API 경로·화면이 없다(기능 설계 「범위」, 비기능 설계 Q1). 그래서 데이터 모델·저장소·API·화면 층의 단계는 없고, 업무 로직과 외부 호출 경계만 있다. 마이그레이션도 없다.

## Steps

- [ ] Step 1: 구조와 의존성. `api/package.json`에 Claude 공식 TypeScript SDK(`@anthropic-ai/sdk`)를 정확한 버전으로 더하고 `package-lock.json`을 함께 바꾼다(`npm install --save-exact`). 고른 판본에서 고정 주소·fetch 바꿔 끼우기·시간 제한·재시도 0·인증 토큰 자리 비우기·생각 끔·처리 위치·인용 문서(사용자 정의 내용) 설정을 지원하는지 확인하고, 하나라도 없으면 멈추고 묻는다. `api/src/ai-generation/` 폴더와 C-01 모양 그대로의 형식 파일(`ai-generation.types.ts`: `AiSource`·`AiGenerationRequest`·`GatedItem`·`GatedOutput`, 오류 `AiProviderError`(원인 `reason`)·`AiInputTooLarge`는 이름만 두고 U1은 던지지 않음)을 만든다. api 앱 모듈에는 등록하지 않는다(기술 선택, 비기능 설계 Q1)
- [ ] Step 2: 시험 실행기 확인. 기존 실행기(`npm test -- <파일>`)로 `test/ai-generation/` 아래 파일을 지정해 돌 수 있는지 빈 시험 하나로 확인하고, 정확한 명령을 `unit-test-instructions.md`대로 쓴다(이미 적힌 명령이 그대로 돌면 바꾸지 않는다)
- [ ] Step 3: 시나리오 먼저(팀 시험 순서). `unit-test-instructions.md` 「시나리오·기대 결과·실패 조건」 표(S1~S9와 보안·신뢰성 항목)를 이번 구현의 기준으로 삼는다. 표에 없는 동작은 만들지 않는다
- [ ] Step 4: 줄 나누개 `citation-lines.ts` — 근거 글을 `\n`으로 나누고 줄 끝 `\r`을 빼며, 빈 줄(공백만 포함)은 블록 번호 없이 건너뛰고 줄마다 UTF-16 시작·끝을 기록한다(BR1.1~BR1.3)
- [ ] Step 5: 요청 만들개 `citation-request.ts` — 근거마다 인용이 켜진 사용자 정의 내용 문서(줄마다 글 블록 하나, context에 출처 종류 설명)를 만들고 문서 번호 → 근거 위치 대응표를 함께 만든다. 줄 없는 근거는 문서를 만들지 않는다. 시스템 지시 = 항목 형식 지시 + `instruction`, 사용자 메시지 = 문서들 + `userText`(있을 때). `publicationText`는 넣지 않는다. 근거가 없거나 남은 문서가 없으면 호출하지 않는다는 표시를 돌려준다(BR1.4, BR2.1, BR2.3, NFR2.3)
- [ ] Step 6: 지키는 fetch `guarded-fetch.ts` — 받은 fetch(기본 전역 fetch)를 늘 감싼다. redirect를 따라가지 않게 요청하고 3xx면 실패로 끝낸다. 응답 본문을 압축을 푼 뒤 바이트로 세며 넘기고, 합이 256 KiB를 넘으면 그 자리에서 읽기를 멈추고 실패로 끝낸다(NFR2.2 ②③)
- [ ] Step 7: Claude 호출기 `claude-citation-client.ts` — SDK 클라이언트를 고정 주소 상수·키 명시·인증 토큰 자리 비움·재시도 0·시간 제한(기본 45초)·지키는 fetch로 만들고, 모델(HAIKU→Haiku 5.5, SONNET→Sonnet 5.5)·생각 끔·처리 위치 미국·출력 상한(기본 4,000)을 실어 한 번 부른다. 응답을 `ProviderResponse`(조각·인용·중단 이유·토큰 수·요청 ID)로 옮긴다(BR2.2, NFR1.1, NFR2.1, NFR2.2 ①④, NFR4.1, NFR4.2, NFR4.4)
- [ ] Step 8: 응답 묶개 `response-items.ts`와 인용 위치 찾개 `citation-locator.ts` — 중단 이유 판정(거절·예상 밖 → 오류), 조각을 줄로 잇고 인용을 첫 줄바꿈 아닌 글자의 줄에 붙이기, '- ' 줄만 항목, 잘린 마지막 항목 버림·셈, 항목이 아닌 줄 수 세기, 대응표로 근거 찾기·블록 범위를 원문 위치와 원문 인용문·출처 이름으로 바꾸기, 연결되지 않으면 항목 버림·셈, 남은 항목 0개면 오류(BR3.1~BR3.4, BR4.1~BR4.4, BR5.1~BR5.4, NFR6.1)
- [ ] Step 9: 게이트 `ai-generation.gate.ts`와 만들기 함수 `createAiGenerationGate` — 설정(키·출력 상한·시간 제한·fetch)을 받아 키가 비었으면 키 값 없이 오류로 멈춘다. `generate()`는 W1 순서로 위 구성 요소를 부르고, SDK 오류는 원문 메시지를 붙이지 않고 원인 이름·상태 코드만 옮겨 `AiProviderError(CALL_FAILED)`로 낸다. 호출마다 Nest `Logger`를 클래스 이름으로 직접 만들어 로그 한 줄(기능·중단 이유·실패 원인·항목 수·`droppedCount`·항목 아닌 줄 수·입력/출력 토큰 수·걸린 시간·요청 ID)을 남기고 근거 글·인용문·`userText`·키는 남기지 않는다(기능 설계 W1, BR5.5, NFR1.1, NFR1.2, NFR6.2, NFR6.3)
- [ ] Step 10: 기록한 응답 시험 — `test/ai-generation/`에 구성 요소별 시험 파일을 둔다. 게이트 시험은 만들기 함수에 시험용 fetch를 넘겨 기록한 HTTP 응답(정상·잘림·거절·항목 없음·예상 밖 중단·redirect·본문 256 KiB 딱 맞음/넘음/작은 조각 합 초과·느린 응답·연결 실패·오류 상태)을 돌려준다. `unit-test-instructions.md`의 S1~S7·S9와 보안·신뢰성 항목을 모두 덮는다(기능 설계 S1~S7·S9, 비기능 설계 시험 절)
- [ ] Step 11: 실제 호출 시험(S8) — `test/ai-generation/live-citation.test.cjs`. `CATCHU_GENERATION_API_KEY`가 비었으면 건너뛰고 미실행으로 출력한다. 근거 2개(GitHub 기록 1·작성자 자료 1, 각 10줄 안팎의 공개 가능한 합성 글)와 시험 상수 출력 상한으로 게이트를 기본 fetch로 만들어 한 번 부르고, 합격 기준 ①~⑤를 모양으로 확인한다. 상한 전에 끝나 ①이 아니면 상수를 낮춰 다시 돌리라고 출력한다. 결과 기록(쓴 상한 상수·다시 돌렸는지·①~⑤ 결과)을 시험 출력으로 남기고 근거 글·인용문·키는 넣지 않는다(기능 설계 S8, NFR6.1)
- [ ] Step 12: 실행과 검사 — `unit-test-instructions.md`의 Unit 시험 명령, 커버리지 명령(80% 줄 기준, `dist/ai-generation/**`), `npm run lint`, `npm run typecheck`를 돌린다. 기준을 낮추거나 끄지 않으며 못 미치면 그 차이를 적는다
- [ ] Step 13: 문서 — `api/docs/ai-generation.md`(U1 동작, 앱 미등록과 U2에 넘기는 것, 실제 호출 시험 돌리는 법과 결과 기록, PR 「리뷰 요청」에 적을 보안 점검 차이: 숨긴 지시 방어·역량 평가 표현 금지·입력 상한·근거 대조는 U2, 비밀값·개인정보 가리기는 호출 Unit, SDK 시간 제한이 본문 읽기까지 걸리는지 확인 결과)를 새로 쓰고, `api/CONVENTIONS.md` 파일 역할 표에 `src/ai-generation/` 한 줄(기본 앱 미등록)을 더하며, `api/.env.example`의 `CATCHU_GENERATION_API_KEY` 주석을 "U1 게이트와 실제 호출 시험이 읽음"으로 고친다
- [ ] Step 14: S8 실제 호출 결과 반영(팀장 요청, 2026-10-27) — `test/ai-generation/live-citation.test.cjs`의 `LIVE_MAX_OUTPUT_TOKENS`를 140, `LIVE_RUN_ATTEMPT`를 2로 고치고, 팀장이 돌린 두 번의 결과(1차 160: ①②③⑤ 통과·④ 재실행 필요, 항목 3개 뒤 빈 '- ' 줄에서 끊겨 버릴 항목 없음·`nonItemLineCount` 1 / 2차 140, 임시 사본으로 실행: ①~⑤ 통과, 항목 2·`droppedCount` 1·인용 대조 2건·1.9초)를 `code-summary.md`와 `api/docs/ai-generation.md`의 S8 결과 기록에 남긴다. 키 값과 근거 글·인용문은 기록하지 않는다. 다른 코드는 바꾸지 않는다(기능 설계 S8, NFR6.1)
