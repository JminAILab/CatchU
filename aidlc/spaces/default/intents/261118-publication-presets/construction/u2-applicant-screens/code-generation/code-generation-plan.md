# Code Generation Plan — u2-applicant-screens

## Summary

- Builds: 프리셋 목록·편집 화면과 상단 메뉴 「프리셋」, 발행 화면의 프리셋 고르기·막힘 표시, api 본인 Catch 목록 `publishable=true`, web 응답 해석의 `blockedSources`
- Touches: 새 `web/src/features/presets/`·`web/src/app/(member)/presets/`, `web/src/features/publications/`(발행 화면·호출·README), `web/src/lib/api-response.ts`·`routes.ts`, 상단 메뉴, `web/src/features/assets/catch-api.ts`, `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts`, 문서 4개
- Tests: web 새 시험 1개(약 30건)와 고치는 시험 2개(발행·응답 해석), api 새 시험 1개(DB, 같은 결과 시험 포함 약 8건)와 고치는 시험 1개

근거: 기능 설계 `construction/u2-applicant-screens/functional-design/`(functional-spec·rules BR1~BR5·frontend-components, 검토 review-01), NFR 요구 `nfr-requirements/`(검토 review-01), NFR 설계 `nfr-design/`(performance·security·logical-components, 검토 review-01), 계약 `inception/contract-design/contract-summary.md` P-1·P-2, 단위 `inception/units-generation/unit-of-work.md` U2, Bolt 계획 `inception/delivery-planning/bolt-plan.md` B2, 요구사항 FR1·FR2·NFR1~NFR6, 다듬은 화면 `inception/refined-mockups/mockups.md` M1~M4·`interaction-spec.md`, U1 API `api/docs/presets.md`. U2는 인프라 설계를 건너뛰었다.

이 단위는 U1(api 프리셋 경로, 발행 요청 `presetIds`)이 들어간 이 브랜치 위에서 만든다. 이 단위가 dev에 들어가면 dev 발행 화면이 다시 발행된다(Bolt B2).

## 앞 단계 검토에서 넘어와 이 계획에 넣은 것

| 출처 | 반영 |
|---|---|
| 기능 설계 Major(첫 저장 뒤 화면이 새로 그려짐) | NFR 설계 Q1 A(팀장): `window.history.replaceState`로 주소만 바꾸고, 화면 모드(새 프리셋/고치기)는 주소가 아니라 화면 상태의 프리셋 ID로 정한다. 다음 [저장]은 PUT, h1 「프리셋 고치기」, [프리셋 지우기]가 보인다. 두 번째 저장이 PUT이고 프리셋이 늘지 않는 시험(Step 5, Step 9) |
| 기능 설계 Minor 1(저장소 이름) | 편집 화면이 저장소 목록을 1번 부르고, 실패하면 저장소 이름만 뺀다(NFR 설계 performance 1)(Step 5) |
| 기능 설계 Minor 2, NFR 설계 Minor 3(`catch-api.ts`) | `web/src/features/assets/catch-api.ts` 걸러 보기 타입·쿼리에 `publishable`을 더하고, 없을 때 쿼리는 지금 그대로(내 자산 화면)(Step 3) |
| 기능 설계 Minor 2, NFR 요구 Q1 A | `publishable`은 본인 목록만, 공개 목록은 400(Step 3) |
| 기능 설계 Minor 3(발행 검사) | `publishDraftErrors`의 `itemCount`를 고른 프리셋 수로 바꾸고 1~5개 검사, 0개는 「프리셋을 하나 이상 골라 주세요.」, 6개 이상은 「프리셋은 5개까지 고를 수 있습니다.」. [다음]은 지금처럼 누르면 이 검사 결과를 보인다. `PUBLISH_LIMITS`에 `presets: 5`를 더하고 `FIELD_TEXT`에 `presetIds` 칸 글을 더한다(Step 7) |
| 기능 설계 Minor 4(문서) | `web/src/features/publications/README.md`의 발행 동작·오류 표·시험 줄 전부, `api/docs/catch-owner-read-preparation.md`(본인 목록 쿼리)를 새 설계에 맞춰 고친다(Step 10) |
| 기능 설계 Minor 5(상태 빈 곳) | 저장 중에는 입력·단추를 모두 막는다. 지우기 실패는 지우기 전 상태로 돌아간다. 새 프리셋에서 바꾼 것 없이 [저장]해도 이름 검사부터 같은 흐름이다. 저장 404 뒤에는 안내와 <프리셋 목록으로>를 보인다(Step 5) |
| 기능 설계 Minor 6, NFR 설계 security 5 | [새 프리셋]은 단추(50개면 `disabled`), <프리셋 목록으로>·<고치기>는 링크(Step 4, Step 5) |
| NFR 요구 Major(NFR1 접근성) | NFR 설계 security 5의 키보드·이유 읽힘·글자 표시를 시험으로 확인(Step 9) |
| NFR 요구 Minor 1, NFR 설계 performance 2(늦은 응답) | 목록마다 세대 번호와 `AbortController`, 세기 응답은 세대가 다르면 버림. 응답 순서를 뒤바꾼 시험(Step 5, Step 9) |
| NFR 요구 Minor 2(같은 결과 시험) | `publishable=true` 결과 ID 집합 = U1 `eligibility.ts`가 이유 없음으로 낸 ID 집합(Step 3, Step 8) |
| NFR 요구 Minor 3(기록 남기지 않기) | 만들거나 고치는 모든 파일에 이름·제목·자료 ID를 `console`·`Logger`로 넘기지 않는다. 코드 생성 끝에 바뀐 파일 전부를 찾아 본다(Step 11) |
| NFR 설계 Minor 1(SQL NULL) | 보호 아님 조건은 `IS DISTINCT FROM 'SOURCE_PRIVATE'` 꼴로 써서 보호 관측이 없는 Catch를 SQL에서 조용히 빼지 않는다. 기록 문제 Catch가 있으면 지금처럼 500인 시험(Step 3, Step 8) |
| NFR 설계 Minor 2(커서 범위) | `publishable`이 있을 때만 범위 배열 끝에 더한다. 없는 요청의 범위는 지금과 같아 이미 내준 커서가 그대로 쓰인다. 옛 커서 시험(Step 3, Step 8) |
| NFR 설계 Minor 4(저장 뒤 다시 불러오기) | 저장 뒤 상세를 다시 불러도 담긴 목록을 바꾸지 않고, 같은 `(kind, sourceId)` 항목의 글자 수·이유만 서버 값으로 맞춘다(Step 5) |
| 기능 설계 열린 질문(확인 단계의 「작성자 설명이 없는 Catch N개」) | 기능 설계대로 그리지 않는다. 지금 확인 단계 시험의 그 줄은 지운다. 남기려면 U1 응답 칸이 바뀌어야 해 이 단위에서 하지 않는다(Step 7) |

## 함께 고칠 파일

같은 규칙(발행 요청 모양, 막힘 칸, 본인 Catch 목록 쿼리, 메뉴·주소)을 적은 곳을 찾았다. 모두 이 계획에서 고친다.

| 파일 | 고치는 것 |
|---|---|
| `web/src/lib/routes.ts`, `web/README.md` 「페이지 주소」 | `/presets`·`/presets/new`·`/presets/{id}` 더함, `/publications/new` 줄의 「본인 Catch·텍스트 자료 고르기」를 「프리셋 고르기」로 |
| `web/src/components/header/member-header.tsx` | 메뉴 「프리셋」 |
| `web/src/lib/api-response.ts` | `blockedSources` 더함, `catchIds` 지움 |
| `web/src/features/publications/publications-api.ts`·`publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts` | 프리셋 고르기·`presetIds`·막힘 안내·`catchIds`/`FlaggedCatches` 없앰·`PRIVATE_CATCH_NOTICE` 쓰임 없앰 |
| `web/src/features/publications/README.md` | 발행 동작·오류 표(409 `blockedSources`, 새 `CATCH_PRIVATE`, 400 `presetIds`)·시험 줄 |
| `web/src/features/assets/catch-api.ts`, `web/src/features/assets/README.md` | `publishable` 걸러 보기(본인 목록 쿼리 설명) |
| `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts` | `publishable` |
| `api/docs/catch-owner-read-preparation.md` | 본인 목록 쿼리에 `publishable` |
| `web/src/features/presets/README.md`(새) | 프리셋 화면 안내 |

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

시험 층: 화면(Frontend behavior, 화면 모델 단위 시험과 서버 렌더링)과 API(본인 Catch 목록, DB 통합). 데이터 모델·저장소 층은 바뀌지 않는다(새 표 없음). 부품당 5~8건(standard): 목록 화면, 편집 화면, 발행 화면, 응답 해석, 메뉴, api 조건.

## Steps

### Step 1: 구조와 시험 실행기 확인, 기준선 — [x]

- 지금 web `node --test`와 api `api/scripts/test-with-db.cjs`(5433)로 `unit-test-instructions.md`의 기준선 명령을 바꾸기 전 트리에서 돌려 결과를 남긴다(발행·응답 해석·본인 Catch 목록).
- 이야기: US1.1~US2.4

### Step 2: 시나리오·기대 결과·실패 조건 먼저 정하기 — [x]

- 기능 설계 「시나리오」 표와 NFR 요구·설계의 확인 줄을 `unit-test-instructions.md` 「시나리오」 표로 확정한다(시험 코드는 Step 8·9에서 쓴다). 위 「앞 단계 검토」 표의 시험(두 번째 저장 PUT, 늦은 응답, 같은 결과, NULL 보호, 옛 커서)을 포함한다.
- 이야기: 위 전부

### Step 3: api 본인 Catch 목록 `publishable` — [x]

- `api/src/catches/owner-catch-input.ts`: `ownerCatchQuery`가 입력에서 `publishable`을 먼저 꺼내 글자 `true`만 받고(그 밖·배열은 400, 값 미기재) 나머지를 지금 `pageFilters`에 넘긴다. `publicCatchQuery`는 바꾸지 않는다(모르는 키 400). 커서 범위는 `publishable`이 있을 때만 배열 끝에 더한다(BR5.1, security-design 1).
- `api/src/catches/owner-catch-store.ts`: `publishable`이면 `c.visibility = 'PUBLIC'`, 작업 사실·기여 확인됨, 보호 관측 값 `IS DISTINCT FROM 'SOURCE_PRIVATE'` 조건을 더한다. 회원 조건은 그대로, 기록 문제 판정은 지금처럼 응답을 만들 때(500).
- `web/src/features/assets/catch-api.ts`: 걸러 보기 타입에 `publishable?: true`, 있을 때만 쿼리 `publishable=true`. 없을 때 쿼리는 지금 그대로.
- 규칙: BR5.1, NFR2.2~NFR2.4
- 이야기: US1.2(AC1.2.2)

### Step 4: 주소·메뉴·응답 해석·프리셋 호출 — [x]

- `web/src/lib/routes.ts`: `presets`·`presetNew`·`presetEditPath(id)`(ID `encodeURIComponent`).
- `web/src/app/(member)/presets/page.tsx`·`presets/new/page.tsx`·`presets/[presetId]/page.tsx`.
- `web/src/components/header/member-header.tsx`: 「텍스트 자료」와 「발행본」 사이에 「프리셋」.
- `web/src/lib/api-response.ts`: `details.blockedSources` 검사·세 칸 복사, `catchIds` 타입·검사·복사 지움(BR5.2, security-design 3).
- `web/src/features/presets/presets-api.ts`: 목록·상세·만들기·고치기·지우기·세기 호출과 응답 모양 검사, 실패를 화면 이유(이름·maxTotalLength·50개·404·그 밖)로 바꿈.
- 규칙: BR1.1·BR1.2·BR5.2, NFR4.2·NFR4.3
- 이야기: US1.1, US2.4

### Step 5: 프리셋 목록·편집 화면 — [x]

- 공용 부품: 발행 화면의 고르기 단추·순서 목록(`SourcePickerView`·`SelectedListView` 중 공용 부분)을 옮겨 편집 화면과 발행 화면이 함께 쓴다. 옮기기 전 Step 1 발행 시험 기준선을 남긴다.
- `presets-list-screen.tsx`·`presets-list-view.tsx`: M2 글, 상태 넷, [새 프리셋] 단추(50개면 `disabled`와 안내), <고치기> 링크(읽히는 이름 「(이름) 고치기」)(BR2.1~BR2.3).
- `preset-editor-screen.tsx`·`preset-editor-view.tsx`: 이름 칸(`aria-describedby`·`aria-invalid`), 고르기 목록 셋과 저장소 목록, 쪽마다 세기와 세대 번호·`AbortController`, 담기·빼기·순서, 20개·60,000자 막힘, 이유 글, 상한 넘음 안내, 링크 안내 줄, 저장(POST/PUT, 저장 중 모두 막힘, 결과 표), 첫 저장 뒤 `replaceState`와 화면 상태 ID 바꿈, 저장 뒤 상세로 글자 수·이유만 맞춤, 지우기 확인·실패, 이탈 경고 셋(BR3.1~BR3.11, performance-design 1~5).
- 규칙: BR2·BR3
- 이야기: US1.1~US1.6

### Step 6: 발행 화면의 프리셋 고르기 — [x]

- `publish-screen.tsx`: 고르기 목록 셋·저장소 목록 불러오기를 프리셋 목록 하나로 바꾸고, 고른 상태를 프리셋 ID 배열로. 막힘 때 목록 다시 불러오기와 이름 찾기, 404 때 없어진 프리셋을 고른 목록에서 뺌, 400 `presetIds` 때 다시 불러오기(BR4.1~BR4.6). `FlaggedCatches` 없앰.
- `publish-view.tsx`: 새 `PresetPickerView`(이유 순서, 「외 N개」, 5개 안내 한 번 `aria-live`), 「고른 프리셋과 순서 (n/5)」, 확인 단계 「고른 프리셋과 순서」, 막힘 안내 줄, `PRIVATE_CATCH_NOTICE` 쓰임 없앰(BR4.7), 확인 단계의 작성자 설명 없는 Catch 안내 없앰.
- 규칙: BR4
- 이야기: US2.1, US2.2, US2.4

### Step 7: 발행 호출과 검사 — [x]

- `publications-api.ts`: 요청 `{ title, password?, presetIds }`, 실패 종류에 `catch-private`(409 `CATCH_PRIVATE`, 글 「비공개 Catch는 발행할 수 없습니다.」)와 막힘 종류의 `blockedSources`, 400 `presetIds` 구분, `catchIds` 지움. `publishDraftErrors`를 프리셋 1~5개 검사로(위 「앞 단계 검토」 표), `PUBLISH_LIMITS.presets = 5`, `FIELD_TEXT.presetIds`.
- `publish-sources.ts`: 발행 화면이 더는 쓰지 않는 고르기 타입은 공용 부품 쪽으로 옮기거나 남기고, 쓰지 않는 내보내기는 지운다.
- 규칙: BR4.1·BR4.6, BR5.2
- 이야기: US2.1, US2.4

### Step 8: api 시험 — [x]

- 새 `api/test/catches/publishable-filter.test.cjs`(DB): `publishable=true` 거른 결과, `false`·빈 값·두 번 400, 공개 목록 400, 남의 Catch 안 섞임, 옛 커서(`publishable` 없음) 그대로 쓰임·조건 다른 커서 400, 보호 관측 없는 Catch가 있으면 500(조용히 빠지지 않음), PublishableSource 같은 결과(약 8건).
- 고치는 `api/test/catches/owner-catch-http.test.cjs`: `publishable` 쿼리 해석 줄.
- 이야기: US1.2

### Step 9: web 시험 — [x]

- 새 `web/test/presets.test.mjs`: 메뉴 순서·현재 자리, 목록 상태 넷·50개·글자 표시·`<b>` 이름, 편집 고르기 요청 쿼리·담기/빼기·20개·60,000자 막힘·세기 실패 때 막지 않음·늦은 응답 버림, 순서 단추, 이유 글, 상한 넘음, 저장 이름 검사·결과 표·첫 저장 뒤 두 번째 저장 PUT·프리셋 수 그대로·주소 바뀜, 저장 중 막힘, 지우기 확인·취소·실패, 요청 수(NFR6.2·6.3, 저장소 목록 포함), 접근성 속성(약 30건).
- 고치는 `web/test/publish.test.mjs`: 프리셋 고르기·이유 순서·외 N개·5개·0개·실패·확인 단계·`presetIds` 요청·막힘 줄(이름 찾기·못 찾음)·404·400·`CATCH_PRIVATE`. 지금 자료 고르기 시험 가운데 편집 화면으로 옮긴 동작은 `presets.test.mjs`로 옮긴다.
- 고치는 `web/test/api-response.test.mjs`: `blockedSources` 옳은 모양·남는 속성·어긋난 kind·빈 ID·배열 아님, `catchIds` 옮기지 않음.
- 이야기: 위 전부

### Step 10: 문서 — [x]

- `web/README.md` 「페이지 주소」, `web/src/features/presets/README.md`(새), `web/src/features/publications/README.md`(발행 동작·오류 표·시험), `web/src/features/assets/README.md`(본인 목록 쿼리), `api/docs/catch-owner-read-preparation.md`(`publishable`).
- 이야기: 해당 없음(문서)

### Step 11: 기록 남기지 않기 확인과 이 단위 시험 — [x]

- 이 단위가 만들거나 고친 파일 전부에서 새로 더한 `console.`·`Logger` 호출이 없는지 찾아 `code-summary.md`에 적는다(NFR4.1).
- `unit-test-instructions.md`의 이 단위 명령을 돌려 통과를 확인한다. 실패하면 고친다(시험 기대를 낮추지 않는다).
- 브라우저 320px 폭의 헤더·편집 화면 확인은 Build and Test에서 한다.

## 이야기와 단계

| 이야기 | 단계 |
|---|---|
| US1.1 | Step 4, Step 5, Step 9 |
| US1.2 | Step 3, Step 5, Step 8, Step 9 |
| US1.3·US1.4·US1.5·US1.6 | Step 5, Step 9 |
| US2.1·US2.2 | Step 6, Step 7, Step 9 |
| US2.4 | Step 4, Step 6, Step 7, Step 9 |

## 이 단위에서 하지 않는 것

- 받은 사람·작성자 상세의 탭, 자료 화면 탭(U3). 방침(U4, 끝남). 모양 다듬기와 드래그.
- 확인 단계의 「작성자 설명이 없는 Catch N개」 안내(U1 응답이 바뀌어야 함, 기능 설계 열린 질문).
