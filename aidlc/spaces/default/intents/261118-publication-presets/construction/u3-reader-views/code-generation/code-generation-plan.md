# Code Generation Plan — u3-reader-views

## Summary

- Builds: 공용 탭 부품 TabStrip, 받은 사람 화면·작성자 상세의 프리셋 탭과 다른 탭으로 가는 출처 이동, 받은 사람 화면의 AI 요약 자리 올리기, 자료 화면 탭과 지우기 확인 문장
- Touches: 새 `web/src/components/tab-strip/`·`web/src/features/publications/snapshot-jump.ts`, `web/src/features/publications/`(사본 보기·상세·응답 검사), `web/src/features/recipient/`(화면·자리·응답 해석·README), `web/src/features/materials/`(화면·탭·PDF 확인 문장·README)
- Tests: web 새 시험 1개(약 25건)와 고치는 시험 4~5개(받은 사람·받은 사람 PDF·작성자 상세·자료 화면, 사본 고정 자료)

근거: 기능 설계 `construction/u3-reader-views/functional-design/`(functional-spec·rules BR1~BR5·frontend-components, 검토 review-01), NFR 요구 `nfr-requirements/`(검토 review-01), NFR 설계 `nfr-design/`(performance·security·logical-components, 검토 review-01), 계약 `inception/contract-design/contract-summary.md` P-3, 단위 `inception/units-generation/unit-of-work.md` U3, Bolt 계획 B3, 요구사항 FR3·FR4.1·FR7.1·NFR1·NFR3, 다듬은 화면 M5~M7·`interaction-spec.md`. U3는 인프라 설계를 건너뛰었다.

이 단위는 U1(사본의 `presetOrdinal`·`presetName`)과 U2가 들어간 이 브랜치 위에서 만든다. api는 바꾸지 않는다.

## 앞 단계 검토에서 넘어와 이 계획에 넣은 것

| 출처 | 반영 |
|---|---|
| 기능 설계 Major 1 | `recipient-api.ts`의 `pickItem`이 `presetOrdinal`·`presetName`을 옮긴다. 그 밖의 칸은 지금처럼 버린다(Step 3, Step 8) |
| 기능 설계 Major 2, NFR 설계 Major | 자료 화면의 두 갈래(텍스트·PDF가 h1·안내·패널이 다른 두 return)를 이렇게 합친다: 바깥 틀(main) 하나에 h1·안내는 지금처럼 열린 탭에 따라 바꿔 그리고, TabStrip(`label` 「자료 종류」, `keepInactive: false`)의 `panels`에 텍스트 패널(지금 목록·편집 화면)과 PDF 패널(지금 `PdfMaterialsTab`)을 넣는다. 열리지 않은 패널은 빈 `hidden` 패널. PDF를 쓰지 않는 구성(`pdf`가 없음)은 지금처럼 탭 줄 없이 텍스트만 그린다. 「저장하지 않은 입력」 확인을 거절하는 시나리오를 시험에 넣는다(Step 6, Step 8) |
| 이 단계 앞 NFR 설계 Q1 A | 탭 거절: 화살표·누름마다 묻고 거절하면 탭·초점 그대로. TabStrip `onChange`는 `boolean | void`를 돌려주고, `false`일 때만 초점을 옮기지 않는다(`undefined`는 바뀐 것으로 본다). interaction-spec의 `onChange: void`와 달라지는 점을 TabStrip 머리 주석과 코드 요약에 적는다(NFR 설계 Minor 1)(Step 2) |
| 기능 설계 Minor 1 | 패널 `tabIndex=0`(Step 2) |
| 기능 설계 Minor 2 | `RecipientSlots`를 AI 요약 자리와 질문하기·JD 자리로 나눠 순서를 바꾼다. 패널이 받는 값은 그대로(Step 5) |
| NFR 요구 Major 1·2 | 이 단위 NFR 번호와 상류 대응은 NFR 설계에 적었고, 시험 수단은 NFR 설계 performance 4 표대로(Step 8) |
| NFR 요구 Minor 1 | `presetName`은 앞뒤 공백 뺀 1자 이상, 같은 순번에 이름이 섞이면 첫 항목 이름(Step 3, Step 4) |
| NFR 요구 Minor 2, NFR 설계 Minor 2 | 숨긴 패널은 `hidden` 속성만으로 숨기고, 패널에 `display`를 정하는 CSS 클래스를 붙이지 않는다(붙이면 `[hidden]`에 `display: none`을 함께 둔다). 시험은 속성과 클래스 둘 다 본다(Step 2, Step 8) |
| NFR 설계 Minor 3 | `isPublishedItem`은 `isPublishedSnapshot` 안에서만 쓰이고, 그것은 작성자 상세(`isPublicationDetail`)와 받은 사람(`readPublishedSnapshot`)만 부른다. 프리셋 칸이 없는 지금 시험 고정 자료와 `features/recipient/README.md`를 함께 고칠 파일에 넣는다(Step 8, Step 9) |

## 함께 고칠 파일

| 파일 | 고치는 것 |
|---|---|
| `web/src/features/materials/materials-view.tsx`·`materials-screen.tsx`·`pdf-materials-tab.tsx`·`pdf-materials-api.ts`, `web/src/features/materials/README.md` | TabStrip, 화면 틀 합치기, 지우기 확인 문장(텍스트·PDF), README의 탭·확인 문장 |
| `web/src/features/publications/snapshot-view.tsx`·`publication-detail-screen.tsx`·`publication-detail-view.tsx`·`publications-api.ts`, `web/src/features/publications/README.md` | 프리셋 탭, 출처 이동, 응답 검사, README의 사본 보기 |
| `web/src/features/recipient/recipient-screen.tsx`·`recipient-view.tsx`·`recipient-api.ts`, `web/src/features/recipient/README.md` | 출처 이동, 자리 순서, 응답 해석, README의 화면 순서·자리 표 |
| 사본을 만드는 web 시험 고정 자료(`recipient.test.mjs`·`recipient-pdf.test.mjs`·`publications-owner.test.mjs`·`jd-recipient-binding.test.mjs` 등) | 항목에 `presetOrdinal`·`presetName` |

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

시험 층: 화면(Frontend behavior)만. 순수 함수(묶기·키 처리·출처 대상·갱신 뒤 탭) 단위 시험과 서버 렌더링 시험. 데이터·api 층은 바뀌지 않는다. 부품당 5~8건(standard): TabStrip, 사본 탭, 출처 이동, 받은 사람 화면, 작성자 상세, 자료 화면, 응답 해석.

## Steps

### Step 1: 시험 실행기 확인, 기준선, 시나리오 — [x]

- `unit-test-instructions.md`의 기준선 명령을 바꾸기 전 트리에서 돌려 결과를 남긴다.
- 기능 설계 「시나리오」 표와 NFR 설계 performance 4 표를 `unit-test-instructions.md` 「시나리오」로 확정한다(위 「앞 단계 검토」 표의 시험 포함). 시험 코드는 Step 8에서 쓴다.
- 이야기: US2.3, US3.1~US3.5, US4.1, US4.4

### Step 2: TabStrip — [x]

- `web/src/components/tab-strip/tab-strip.tsx`(+ CSS 모듈): `tabs`·`active`·`onChange(id) => boolean | void`·`label`·`idPrefix`·`panels`·`keepInactive`·`tabTestId?`. 역할·`aria-*`·열린 탭만 `tabIndex=0`·패널 `tabIndex=0`·`hidden`, 키(왼쪽·오른쪽 돎·Home·End는 바꾸기 요청 뒤 `false`가 아니면 새 탭에 초점, Enter·Space·누름). 키 처리는 순수 함수로 떼어 시험한다. 패널에 `display`를 정하는 클래스를 두지 않는다. 탭 이름 말줄임 클래스(최대 폭 16em)는 선택으로 켠다.
- 규칙: BR1.1~BR1.5, NFR1.1
- 이야기: US3.2, US4.4

### Step 3: 응답 검사와 받은 사람 응답 해석 — [x]

- `publications-api.ts`: `PublishedItem`에 `presetOrdinal`·`presetName`, `isPublishedItem`이 정수 1~5와 앞뒤 공백 뺀 1자 이상 이름을 요구.
- `recipient-api.ts` `pickItem`: 두 칸을 옮김.
- 규칙: BR2.4, NFR4.1·NFR4.2
- 이야기: US3.1

### Step 4: 사본 탭과 출처 이동 공용 함수 — [x]

- `snapshot-view.tsx`: `groupByPreset`(순번 오름차순, 안은 `position`, 이름은 묶음 첫 항목), `PublishedSnapshotView`가 TabStrip(`label` 「발행본 자료」, `keepInactive: true`, 패널 key=순번)로 그림, 탭 아래 이름 전체, 알림 칸(`aria-live="polite"`). 항목 그리기는 그대로.
- 새 `snapshot-jump.ts`: `useSnapshotJump(snapshot)`(열린 탭·대상·알림 글을 한 상태로, `showEvidence`가 탭과 대상을 한 번에, 효과에서 초점·스크롤, 갱신 뒤 같은 순번 유지 아니면 첫 탭). 갱신 뒤 탭 고르기와 출처 대상 정하기는 순수 함수.
- 규칙: BR2.1~BR2.5, BR4.1~BR4.3, NFR5.1·5.2·5.5, NFR1.2, NFR3.1·3.2
- 이야기: US2.3, US3.1, US3.2, US3.4

### Step 5: 받은 사람 화면과 작성자 상세 — [x]

- `recipient-screen.tsx`: 지금 `target`·`showEvidence`·효과를 `useSnapshotJump`로.
- `recipient-view.tsx`: `RecipientSlots`를 AI 요약 자리와 질문하기·JD 자리로 나누고 순서를 「발행 시각 → AI 요약 → 발행본 자료 → 질문하기 → JD」로. 머리 주석의 자리 표도 고침. 안내(기본 접힘)는 건드리지 않음.
- `publication-detail-screen.tsx`·`publication-detail-view.tsx`: `useSnapshotJump`와 탭 값 넘기기. 순서는 그대로.
- 규칙: BR3.1·BR3.2, BR4.1·BR4.2
- 이야기: US3.1, US3.3, US3.4, US3.5

### Step 6: 자료 화면 — [x]

- `materials-screen.tsx`: 두 return을 바깥 틀 하나로 합치고(위 「앞 단계 검토」 표), TabStrip(`label` 「자료 종류」, `idPrefix` `materials`, `tabTestId`로 지금 `materials-tab-text`·`materials-tab-pdf` 유지)에 두 패널. `changeTab`은 거절이면 `false`를 돌려줌. 텍스트 지우기 확인 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」.
- `materials-view.tsx`: `MaterialsTabs` 지움. `pdf-materials-tab.tsx`: 지금 `role="tabpanel"`을 TabStrip 패널로 옮김. `pdf-materials-api.ts`: `PDF_DELETE_CONFIRM` 끝에 같은 문장.
- 규칙: BR5.1·BR5.2
- 이야기: US4.1, US4.4

### Step 7: 기록 남기지 않기 확인 — [x]

- 바뀐 파일 전부에서 새 `console.` 호출이 없는지 찾아 `code-summary.md`에 적는다(NFR4.3).

### Step 8: 시험 — [x]

- 새 `web/test/reader-tabs.test.mjs`: TabStrip 역할·속성·키 처리(돎·Home·End·거절 때 초점 그대로)·패널 `hidden`과 `display` 클래스 없음, `groupByPreset`(순서·같은 자료 두 탭·이름 섞임), 출처 대상(다른 탭·같은 탭·알림), 갱신 뒤 탭, 응답 검사(칸 없음·0·6·빈 이름), `pickItem` 두 칸, `<b>`·`<img onerror>` 이름, 탭 바꿈 요청 0·처음 그릴 때 PDF 요청 0(약 25건).
- 고치는 시험: `recipient.test.mjs`(화면 순서·탭·대화 남음·출처), `recipient-pdf.test.mjs`, `publications-owner.test.mjs`(작성자 상세 탭·출처), `materials-screen.test.mjs`(탭 키·거절 시나리오·확인 문장), `pdf-materials-api.test.mjs`(확인 문장), 사본 고정 자료가 있는 다른 시험(`jd-recipient-binding.test.mjs` 등)에 두 칸.
- 이야기: 위 전부

### Step 9: 문서 — [x]

- `web/src/features/recipient/README.md`(화면 순서·자리 표·탭·출처 이동), `web/src/features/publications/README.md`(사본 보기 탭), `web/src/features/materials/README.md`(탭·지우기 확인 문장).

### Step 10: 이 단위 시험 — [x]

- `unit-test-instructions.md`의 이 단위 명령을 돌려 통과를 확인하고, `npm --prefix web run lint`·`typecheck`도 돌린다. 실패하면 고친다(시험 기대를 낮추지 않는다).
- 브라우저 확인(키보드·초점·탭을 오갈 때 PDF 다시 받지 않음·320px 폭)은 Build and Test에서 한다.

## 이야기와 단계

| 이야기 | 단계 |
|---|---|
| US2.3 | Step 4, Step 8 |
| US3.1 | Step 3, Step 4, Step 5, Step 8 |
| US3.2 | Step 2, Step 8 |
| US3.3 | Step 5, Step 8 |
| US3.4·US3.5 | Step 4, Step 5, Step 8 |
| US4.1·US4.4 | Step 6, Step 8 |

## 이 단위에서 하지 않는 것

- [답으로 돌아가기](2026-11-19 팀장 결정), 「이 링크에서 할 수 있는 것」 안내, 모양 다듬기, api.
- 팀원 3의 화면 정리가 dev에 들어왔는지는 코드 생성을 시작할 때 `origin/dev`로 확인하고, 들어와 있으면 이 브랜치에 dev를 병합한 뒤 그 위에서 만든다(단위 정의 U3). 병합은 사람에게 먼저 묻는다.
