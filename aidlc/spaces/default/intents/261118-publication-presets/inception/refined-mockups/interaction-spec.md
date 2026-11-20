# Interaction Spec — 발행 프리셋

근거: `mockups.md`(M1~M8), 승인된 화면 초안 `ideation/rough-mockups/wireframes.md`·`user-flow.md`, 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 이 단계 질문 Q1~Q5, 지금 코드(`web/src`). 형식은 `.claude/knowledge/aidlc-design-agent/component-spec-template.md`를 따른다.

부품마다 「지금」은 코드 그대로 다시 쓰는 것, 「바뀜」·「새로」는 이 작업에서 만드는 것이다. 기능 설계에서 화면 요소(역할·키보드·Tab 순서)를 정할 때는 이 문서와 대조한다(project.md 규칙).

## TabStrip (탭 줄) — 바뀜

| Field | Value |
|---|---|
| Component | TabStrip |
| Description | 탭 줄과 열린 탭의 영역. 지금 자료 화면의 `MaterialsTabs`를 일반 부품으로 바꿔 받은 사람 화면·작성자 상세·텍스트 자료 화면이 함께 쓴다 |
| Category | navigation |

### States

| State | Description | Trigger |
|---|---|---|
| default | 첫 탭이 열려 있다 | 화면 열기 |
| selected | 고른 탭이 열리고 그 패널이 보인다 | 누름, 화살표 키 |
| focus | 초점이 열린 탭에 있다 | Tab으로 탭 줄에 들어옴 |
| wrapped | 탭이 넘치면 다음 줄로 넘어간다 | 좁은 폭 |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| tabs | { id: string, label: string }[] | yes | — | 탭 목록. 받은 사람 화면은 발행 당시 프리셋 이름 |
| active | string | yes | — | 열린 탭 id |
| onChange | (id: string) => void | yes | — | 탭이 바뀔 때 |
| label | string | yes | — | 탭 줄 이름(예: 「발행본 자료」, 「자료 종류」) |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 탭 줄 `tablist`, 탭 `tab`(`aria-selected`, `aria-controls`), 영역 `tabpanel`(`aria-labelledby`). 지금 자료 화면은 텍스트 탭의 `tabpanel`이 없다. 이 작업에서 두 탭 모두 갖춘다 |
| Keyboard interaction | 왼쪽·오른쪽 화살표로 옆 탭으로 옮기면 그 탭이 바로 열린다. 끝에서 다음으로 가면 처음으로 돈다. Home·End는 처음·끝 탭. Enter·Space는 지금처럼 연다 |
| Tab 순서 | 탭 줄에 Tab으로 들어오면 열린 탭에만 초점이 간다(열리지 않은 탭은 `tabindex=-1`). 다시 Tab이면 열린 탭의 영역으로 들어간다 |
| Label | 탭 이름 글자. 줄인 탭 이름은 화면 낭독기에 전체 이름이 읽힌다 |
| Screen reader | 「탭, 2개 중 1번째, 선택됨」처럼 역할·위치·선택 상태 |
| Focus management | 탭을 바꿔도 초점은 탭에 남는다 |

## PresetNameDisplay (긴 탭 이름) — 새로

- 탭 이름이 탭 너비를 넘으면 뒤를 「…」로 줄여 보인다. 탭 줄 아래 열린 탭의 프리셋 이름 전체를 글자로 보인다(M5).
- 이름은 글자로만 그린다(NFR3).

## SourceJump (출처 이동) — 바뀜

| Field | Value |
|---|---|
| Component | SourceJump |
| Description | 답·요약의 출처 단추가 가리킨 항목을 연다. 다른 탭이면 탭을 바꾼다. [답으로 돌아가기]는 만들지 않는다(2026-11-19 팀장 결정, `mockups.md` 「화면 초안과 달라진 곳」). 답으로 돌아오는 방법은 #615가 정한다 |
| Category | navigation |

### States

| State | Description | Trigger |
|---|---|---|
| same-tab | 가리킨 항목이 열린 탭에 있다. 탭은 그대로, 항목으로 옮긴다 | 출처 단추 |
| other-tab | 가리킨 항목이 다른 탭에 있다. 같은 상태 바뀜 안에서 탭을 바꾸고 항목으로 옮긴다 | 출처 단추 |

### Behaviour

1. 출처 단추를 누르면 가리킨 항목이 있는 탭을 연다. 탭 바꾸기와 강조 대상 정하기는 한 번의 상태 바뀜에서 한다(다른 탭 항목은 그려져 있지 않아 지금처럼 화면 id로 찾으면 못 찾기 때문, developer-scan.md).
2. 지금처럼 항목에 초점을 두고(`preventScroll`), 강조가 있으면 첫 강조가 보이게, 없으면 항목 시작이 보이게 옮긴다(지금 `recipient-screen.tsx`, Q2).

### Accessibility

| Requirement | Implementation |
|---|---|
| Keyboard | 옮긴 뒤 초점은 항목에 있다 |
| Screen reader | 탭이 바뀐 것을 알린다(예: 「포트폴리오 탭을 열었습니다」, `aria-live="polite"`) |

## ToggleOptionButton (고르기 단추) — 지금

| Field | Value |
|---|---|
| Component | ToggleOptionButton |
| Description | 지금 발행 화면의 자료 고르기 단추를 그대로 쓴다. 프리셋 편집의 자료 고르기, 발행 화면의 프리셋 고르기에 쓴다 |
| Category | input |

### States

| State | Description | Trigger |
|---|---|---|
| default | 안 고름 | — |
| pressed | 고름(`aria-pressed=true`) | 누름 |
| disabled | 고를 수 없음. 단추 안에 이유 글자 | 상한·이유 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | `button`(`aria-pressed`) |
| Keyboard | Enter·Space |
| Screen reader | 이름, 보조 줄(항목 수·글자 수), 눌림 상태, 막힘 이유가 읽힌다 |

## ReorderList (순서 단추) — 지금

- 지금 발행 화면의 「고른 항목과 순서」처럼 [위로][아래로][빼기]를 쓰고, `aria-label`은 「(이름) 위로」 꼴이다. 프리셋 안 자료와 발행 화면의 프리셋 순서에 쓴다.
- 옮긴 뒤 초점은 옮긴 항목의 같은 단추에 남는다. 첫 항목 [위로], 끝 항목 [아래로]는 막힌다.

## PresetEditorForm — 새로

| Field | Value |
|---|---|
| Component | PresetEditorForm |
| Description | 이름 칸, 담을 자료 고르기, 담긴 자료와 순서, 저장·지우기 |
| Category | input |

### States

| State | Description | Trigger |
|---|---|---|
| clean | 저장한 그대로 | 열기, 저장 성공 |
| dirty | 바뀐 것이 있음 | 이름·담기·순서 바꿈 |
| saving | 저장 중, [저장] 막힘 | [저장] |
| saved | 「저장했습니다.」(`role="status"`), 편집 화면에 남음 | 저장 성공 |
| error | 이름 칸 오류 또는 저장 실패 안내, 입력은 남음 | 검증·요청 실패 |

### Behaviour

- dirty 상태에서 목록으로 가거나 다른 화면으로 가면 텍스트 자료 화면과 같은 이탈 경고를 같은 부품으로 쓴다(Q3).
- 새 프리셋을 처음 저장하면 그 프리셋의 편집 화면 주소로 바뀐다(Q5).
- 지우기는 이름을 밝힌 확인을 거친다. 확인하면 목록으로 간다.

### Accessibility

| Requirement | Implementation |
|---|---|
| Label | 이름 칸에 보이는 이름표 「이름」, 도움말(탭 이름 안내·1~50자)은 `aria-describedby` |
| 오류 | 이름 칸 아래 글자 오류, 칸에 `aria-invalid` |
| Focus management | 저장 실패·오류 때 초점은 [저장]에 남고 안내가 읽힌다(`role="alert"`) |

## PresetPicker (발행 화면) — 바뀜

- 지금 「발행할 자료 고르기」 자리에 ToggleOptionButton으로 프리셋을 보인다. 단추 안에 이름, 「항목 N개 · M자」, 막혔으면 이유.
- 고를 수 없는 이유를 정하는 순서: 항목 0개 → 발행할 수 없는 자료 → 상한(지금 고른 프리셋과 더한 값). 이유는 하나만 보인다.
- 다섯 개를 고르면 안 고른 단추가 모두 막히고 「프리셋은 5개까지 고를 수 있습니다.」가 목록 위에 한 번만 보인다(`aria-live="polite"`). 이때 단추 안에는 그 프리셋 자체의 이유(항목 0개, 발행할 수 없는 자료)가 있을 때만 그것을 보이고, 상한 이유는 보이지 않는다.
- 같은 이름의 프리셋은 그대로 보이고 따로 구분하지 않는다(가정).

## MemberHeader (상단 메뉴) — 바뀜

- 메뉴 항목에 「프리셋」을 「텍스트 자료」와 「발행본」 사이에 더한다. 현재 자리 판정은 지금 방식(주소가 같거나 그 아래) 그대로이고, 프리셋 화면 주소는 「발행본」 아래에 두지 않는다(requirements FR1.1, 열린 질문).
- 320px 폭에서 [프로필]이 밀리지 않는지 확인한다(Q4).

## Assumptions & Open Questions

- 프리셋 화면 주소는 기능 설계에서 정한다. 「발행본」 주소 아래가 아니어야 한다.
- 프리셋 편집 화면이 자료마다의 글자 수를 어디서 얻는지(고르기 목록 응답에 싣는지, 서버에 따로 묻는지)는 기능 설계의 첫 질문으로 넘긴다. 값을 얻을 수 없으면 M3의 막힘 이유(「전체 글이 60,000자를 넘습니다」)와 글자 수 표시를 다시 정한다.
- 좁은 화면에서 답으로 돌아오는 방법은 #615가 정한다.
- 프리셋 목록의 <고치기>는 읽히는 이름을 「(프리셋 이름) 고치기」로 한다.
