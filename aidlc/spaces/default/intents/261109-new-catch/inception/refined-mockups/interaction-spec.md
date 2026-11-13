# 새 Catch — 동작 명세

화면 그림은 `mockups.md`에 있다. 이 문서는 바뀌거나 새로 생기는 부품마다 상태·입력·좁은 화면·접근성을 적는다. 양식은 부품 명세 양식(`.claude/knowledge/aidlc-design-agent/component-spec-template.md`)을 따른다.

근거:
- 대략 화면 `ideation/rough-mockups/wireframes.md`, 사용자 흐름 `ideation/rough-mockups/user-flow.md`
- 사용자 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md`
- 이 단계의 답 Q1~Q4(모두 A)

공통으로 따르는 것:
- **좁은 화면.** 모든 부품이 지금 화면의 배치 규칙을 그대로 따르고, 좁은 화면용 배치를 따로 두지 않는다(대략 화면 Q6). 화면 폭 기준은 지금 코드대로다. 내 자산 화면(`assets.module.css`, 본인 목록과 지원자 상세)은 760px 하나(`@media (max-width: 760px)`)이고, 발행 화면과 받은 사람 화면(`publications.module.css`)은 화면 폭 기준이 없다. 아래 각 부품의 「Responsive Behaviour」 표는 이 기준으로 적는다.
- **색 대비.** 지금 화면의 색만 쓰고 새 색을 더하지 않는다. 대비는 WCAG AA(글자 4.5:1, 부품 3:1) 기준이다.
- **쓰는 값.** 아래 「입력」 표는 화면이 받는 값을 말로 적은 것이다. API 모양과 칸 이름은 계약 설계·기능 설계에서 정한다.

---

## 1. 작성자 설명 칸 묶음 (지원자 상세)

| Field | Value |
|---|---|
| Component | 작성자 설명 칸 묶음(지금 `AuthorDescriptionPanel`을 바꿈) |
| Description | 칸 제목 8개의 글칸을 펼쳐 보이고 [설명 저장] 하나로 한 칸에 저장한다 |
| Category | input |
| 이야기 | US1.1, US1.2, US1.3, US2.1, US3.2 |

### States

| State | Description | Trigger |
|---|---|---|
| loading | 지금 그대로 「작성자 설명을 불러오고 있습니다.」, 8칸은 그리지 않음 | 상세를 엶 |
| error | 지금 그대로 실패 안내와 [다시 불러오기] | 읽기 실패 |
| default | 저장된 글을 칸 제목으로 나눠 8칸에 채움. 칸 제목을 읽지 못한 글은 전체를 「더 쓰기」에 넣음 | 읽기 성공 |
| dirty | 합계 글자 줄 끝에 「· 저장하지 않은 변경이 있습니다.」 | 어느 칸이든 바뀜 |
| saving | 8칸 모두 쓸 수 없고 단추는 「저장 중…」 | [설명 저장] |
| invalid | 합계 4,000자 넘음, 지금처럼 저장하지 못한다는 안내, 쓴 글은 그대로 | 저장 전 검사 |
| saved / save failed | 지금 안내 그대로 | 서버 응답 |
| empty save | 8칸이 모두 비면 지금처럼 설명이 지워짐 | 저장 |

### 저장 규칙 (말로)

- 빈 칸은 칸 제목째 넣지 않는다. 「더 쓰기」만 쓴 글은 칸 제목 글자를 붙이지 않는다. (FR1.2, FR1.5)
- 합계 글자 수는 저장될 글(칸 제목 글자 포함)로 센다. 칸 제목 줄의 모양은 기능 설계에서 정한다. (FR1.3, FR1.6)

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 저장된 작성자 설명 | string \| null | yes | — | 지금과 같은 한 칸의 글 |
| 저장 동작 | 함수 | yes | — | 지금과 같은 저장 요청 하나 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 760px 이하 | 칸 제목 위, 글칸 아래로 한 줄 전체(Q1 A). 지금 상세 창 너비를 따름 |
| 760px 초과 | 같음 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 지금처럼 `form` 안 `textarea` 8개 |
| Keyboard interaction | 위에서 아래로 Tab 순서: 8칸 → [설명 저장] |
| Label / aria-label | 칸 제목이 각 글칸의 보이는 `label`(지금 숨은 「작성자 설명」 이름표를 바꿈) |
| Screen reader | 새 안내 한 줄은 첫 글칸, 합계 글자 줄은 저장 단추의 설명(`aria-describedby`)으로 잇는다. 짚어 볼 곳 안내는 그 글칸의 설명 |
| Focus management | 지금 그대로. 상세 창을 열면 [닫기]에 초점 |

### Usage Example

```
<AuthorDescriptionFields saved={authorDescription} onSave={save} />
```

---

## 2. 발행하면 면접관에게 열릴 링크 목록

| Field | Value |
|---|---|
| Component | 링크 미리 보기 목록(새것) |
| Description | 8칸 전체의 GitHub 링크를 면접관 화면과 같은 이름으로 보인다 |
| Category | display |
| 이야기 | US2.3 |

### States

| State | Description | Trigger |
|---|---|---|
| default | 링크마다 한 줄, 같은 링크는 한 번만. 목록 아래 「이미 보낸 발행본에는 반영되지 않습니다. 고쳤다면 새로 발행하세요」 | 칸에 링크가 있음 |
| empty | 「발행하면 면접관에게 열릴 링크가 없습니다」(문구는 기능 설계), 아래 안내 한 줄은 없음 | 링크 없음 |

글을 고칠 때마다 화면 안에서 다시 계산한다. API를 부르지 않는다. 표지는 붙이지 않는다. (FR5.3, AC2.3.7)

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 8칸의 지금 글 | string 8개 | yes | — | 저장 전 글도 포함 |
| 근거 저장소 | string | yes | — | 다른 저장소 앞붙임을 정할 때 씀(FR3.3) |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 760px 이하 | 긴 이름은 자르지 않고 줄을 바꿈 |
| 760px 초과 | 같음 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | h4 제목 + `ul` |
| Keyboard interaction | 목록 항목은 글자다. 누를 수 있는 것이 아니라 Tab 순서에 들지 않음 |
| Label / aria-label | h4 「발행하면 면접관에게 열릴 링크」 |
| Screen reader | 알림 영역이 아니다. 글자를 칠 때마다 읽히지 않고, 제목 이동으로 찾아 읽는다 |
| Focus management | 바뀌지 않음 |

### Usage Example

```
<PublishLinkPreview fields={fields} evidenceRepository={repo} />
```

---

## 3. GitHub 링크 이름 (발행본 작성자 설명)

| Field | Value |
|---|---|
| Component | 링크 글(지금 `LinkedText`의 링크 부분을 바꿈) |
| Description | 작성자 설명 속 GitHub 주소를 주소 전체 대신 이름으로 보인다 |
| Category | display |
| 이야기 | US2.2 |

### States

| State | Description | Trigger |
|---|---|---|
| default | 이름 글자 + 숨은 「(새 탭)」 | 알아본 GitHub 링크 |
| hover | 주소 전체가 보임(새로 붙임) | 마우스를 올림 |
| focus | 지금 링크 초점 모양 그대로 | Tab |
| highlighted | 근거 위치가 링크와 겹치면 지금처럼 링크 전체를 강조로 감쌈. 위치는 원문 주소 길이로 셈 | 근거 단추 |
| fallback | 표의 모양에 맞지 않는 GitHub 주소는 지금처럼 주소 전체 | — |
| decode error | 풀리지 않는 퍼센트 인코딩은 원문 그대로 이름에 보임 | — |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 글 | string | yes | — | 저장된 작성자 설명 한 칸 |
| 근거 저장소 | string \| null | no | null | 다른 저장소 앞붙임 판정. 없으면 앞붙임 없음 |
| 강조 범위 | 범위 \| null | no | null | 지금 그대로 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 화면 폭 기준 없음(받은 사람 화면) | 지금 글 모양(`overflow-wrap: anywhere`)대로 긴 이름은 줄을 바꿈 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | `a` |
| Keyboard interaction | Tab으로 가고 Enter로 새 탭에서 엶 |
| Label / aria-label | 이름 글자가 링크의 접근 이름. 숨은 「(새 탭)」이 이어 읽힘(지금 그대로) |
| Screen reader | 이름에서 푼 글자의 제어 문자는 지움(방식은 기능 설계, NFR5) |
| 한계 | 주소 전체는 마우스를 올려야 보인다. 키보드·터치 사용자는 이름만으로는 주소 전체를 볼 수 없고 링크를 열면 확인된다. 보이는 방식은 기능 설계 |
| Focus management | 바뀌지 않음 |

### Usage Example

```
<LinkedText text={authorDescription} evidenceRepository={repo} range={range} />
```

---

## 4. 이 작업의 본인 커밋 표지

| Field | Value |
|---|---|
| Component | 링크 표지(새것, 2단계) |
| Description | 발행 사본의 본인 커밋 근거와 맞는 링크의 판본·커밋 이름 바로 뒤에 붙는다 |
| Category | display |
| 이야기 | US7.1, US7.2 |

### States

| State | Description | Trigger |
|---|---|---|
| shown | 「이 작업의 본인 커밋」 글자 | 저장소(대소문자 무시)와 식별값 앞부분이 본인 커밋 근거 하나와 맞음, 줄 범위 무관 |
| hidden | 아무것도 없음(부정 표지 없음) | 맞지 않음, 둘 이상과 맞음, 병합·PR·이슈 근거와만 맞음, 사본 근거 밖 |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 본인 커밋 근거 목록 | 저장소·식별값 목록 | yes | — | 발행 사본에 담긴 것만(FR10.2, 모양은 계약 설계) |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 화면 폭 기준 없음(받은 사람 화면) | 이름과 같은 줄에서 함께 줄을 바꿈 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 글자(꾸밈만 있는 요소가 아님) |
| Label / aria-label | 「이 작업의 본인 커밋」 글자가 그대로 읽힘. 색만으로 나타내지 않음 |
| Screen reader | 작성자가 글로 쓴 「[이 작업의 본인 커밋]」과 구별되는 모양(기능 설계, NFR5) |
| Focus management | 표지는 누르는 것이 아님 |

### Usage Example

```
CreateArticlePage.vue · L40–58 · 판본 ba6bba8 <OwnCommitMark />
```

---

## 5. 작성자 설명 칸 제목별 보기 (발행본)

| Field | Value |
|---|---|
| Component | 작성자 설명 구역(지금 `CatchSnapshotView`의 작성자 설명 부분을 바꿈) |
| Description | 저장된 한 칸의 글을 칸 제목마다 h5와 글로 나눠 보인다 |
| Category | display |
| 이야기 | US1.4, US1.5, US6.2 |

### States

| State | Description | Trigger |
|---|---|---|
| sections | 쓴 칸만 h5와 글. 「더 쓰기」는 다른 칸과 함께일 때 h5 「덧붙인 말」 | 칸 제목 줄이 있는 글 |
| plain | h5 없이 글만(지금 모양) | 「더 쓰기」만 있는 글, 옛 자유 글 |
| empty | 지금 그대로 「작성자 설명이 없습니다.」, 작성 시점 없음 | 글 없음 |
| with date | h4 안에 작은 글자 「2026년 11월에 마지막으로 고침」(한국 시간 달) | 사본에 작성 시점 있음(2단계) |
| old snapshot | 작성 시점 없이 나머지는 같음 | 이 변경 전 사본 |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 작성자 설명 | string \| null | yes | — | 지금 그대로 |
| 작성 시점 | 달 \| 없음 | no | 없음 | 2단계 사본 칸 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 화면 폭 기준 없음(받은 사람 화면) | 지금 사본 글 모양 그대로 세로로 쌓임 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | h4 「작성자 설명」 아래 h5 칸 제목(Q3 A) |
| Keyboard interaction | 글 속 링크만 Tab 순서에 듦 |
| Screen reader | 그리지 않은 빈 칸은 읽히지 않음. 작성 시점은 h4와 함께 읽힘 |
| Focus management | 근거 위치로 옮길 때 지금처럼 항목에 초점 |

### Usage Example

```
<AuthorDescriptionSections text={authorDescription} editedMonth={month} />
```

---

## 6. 다시 볼 곳 (지원자 상세, 3단계)

| Field | Value |
|---|---|
| Component | 다시 볼 곳 구역(새것) |
| Description | 같은 작업 안 본인 커밋끼리 본 사실을 근거 아래에 보인다 |
| Category | display |
| 이야기 | US9.1~US9.4, US10.1, US10.2 |

### States

| State | Description | Trigger |
|---|---|---|
| default | h3 「다시 볼 곳」 + 작은 글자 「본인만 확인」 + 사실 목록 | 사실 하나 이상 |
| hidden | 구역을 그리지 않음 | 사실 없음, 3단계 전 Catch |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 사실 목록 | 종류·파일·커밋 식별값 목록 | no | 없음 | 다시 고친 곳, 옮긴 곳, 확장자 바꿈, 되돌림, 시험 파일 있음 |
| 저장소 주소 | string | yes | — | 커밋 링크를 만들 때 씀(github.com https만) |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 760px 이하 | 지금 상세 구역처럼 세로로 쌓임 |
| 760px 초과 | 같음 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | h3 + `ul`, 커밋 식별값은 `a` |
| Keyboard interaction | 커밋 링크만 Tab 순서에 듦 |
| Label / aria-label | 링크 글자는 커밋 식별값 7자, 뒤에 숨은 「(새 탭)」(발행본 링크와 같은 꼴) |
| Screen reader | 지원자 상세의 근거 링크 「원본 근거 열기」에는 지금 「(새 탭)」이 없고, 이 intent에서 바꾸지 않음(가정 A4) |
| Focus management | 바뀌지 않음 |

### Usage Example

```
<RevisitFacts facts={facts} repositoryUrl={repoUrl} />
```

---

## 7. 본인 목록 「작성자 설명」 선택 칸

| Field | Value |
|---|---|
| Component | 걸러 보기 선택 칸(새것, 지금 저장소·공개 상태 칸과 같은 꼴) |
| Description | 전체/씀/안 씀으로 목록을 서버에서 거른다 |
| Category | input |
| 이야기 | US4.1, US4.2 |

### States

| State | Description | Trigger |
|---|---|---|
| default | 「전체」 | 화면을 엶 |
| loading | 지금 그대로 「Catch를 불러오고 있습니다」 | 값을 바꿈(첫 쪽부터 다시 불러옴) |
| empty | 「씀」: 제목 「작성자 설명을 쓴 Catch가 없습니다」(저장소를 골랐으면 「이 저장소에 작성자 설명을 쓴 Catch가 없습니다」), 본문 「작성자 설명을 전체로 바꾸면 다른 Catch를 볼 수 있습니다」. 「안 씀」은 같은 꼴(제목 문구는 기능 설계). 저장소 연결 문구는 붙이지 않음 | 칸이 켜진 채 서버가 빈 목록을 줌. 지금 「아직 표시할 Catch가 없습니다」 분기보다 먼저 봄 |
| empty (공개 상태) | 지금 공개 상태 분기 그대로 | 서버 결과는 있는데 공개 상태 칸이 불러온 목록 안에서 모두 거름 |
| empty (전체) | 지금 문구 그대로 | 걸러 보기가 모두 전체인데 Catch가 아예 없음 |
| error | 지금 그대로 목록 실패 안내 | 불러오기 실패 |

다음 쪽 커서는 이 조건도 함께 묶고, 다른 조건으로 받은 커서는 거부된다(FR7.2). 설명을 저장한 뒤에도 지금 쪽은 그대로다(FR7.4).

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 값 | 전체 \| 씀 \| 안 씀 | yes | 전체 | 목록 요청 조건 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 760px 이하 | 지금 걸러 보기 칸처럼 세로로 쌓임(`flex-direction: column`) |
| 760px 초과 | 지금 걸러 보기 칸처럼 자리가 모자라면 줄을 바꿔 놓임(`flex-wrap: wrap`) |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | `select` |
| Keyboard interaction | Tab 순서는 공개 상태 칸 다음 |
| Label / aria-label | 보이는 이름 「작성자 설명」, 지금 칸처럼 `label`이 감쌈 |
| Screen reader | 개수 줄은 지금처럼 `aria-live="polite"` |
| Focus management | 값을 바꿔도 초점은 선택 칸에 남음 |

### Usage Example

```
<label className={styles.filter}>작성자 설명 <select>…</select></label>
```

---

## 8. 발행 화면: 걸러 보기 체크 칸, 항목 작은 줄, 확인 단계 안내

| Field | Value |
|---|---|
| Component | 발행할 자료 고르기의 「내 Catch」 부분과 발행 내용 확인 안내 |
| Description | 설명을 쓴 Catch만 보기, 항목마다 저장소와 설명 여부, 확인 단계의 설명 없는 수 |
| Category | input / feedback |
| 이야기 | US5.1~US5.4 |

### States

| State | Description | Trigger |
|---|---|---|
| default | 체크 칸 꺼짐, 모든 고를 수 있는 Catch | 화면을 엶(열 때마다 새로 불러옴) |
| filtered | 설명을 쓴 Catch만, 첫 쪽부터 | 체크 칸을 켬 |
| loading | 지금 그대로 「Catch 목록을 불러오고 있습니다.」 | 켜거나 끔 |
| empty filtered | 목록 자리에 「작성자 설명을 쓴 Catch가 없습니다」, 고른 항목은 그대로 | 켰는데 맞는 Catch 없음(Q4 A) |
| limit | 지금 그대로 고르지 않은 단추를 누를 수 없음. 걸러 본 뒤에도 고른 수로 셈 | 최대 개수 |
| disabled | 체크 칸도 항목 단추처럼 누를 수 없음 | 발행 중 |
| error | 지금 실패 안내와 [목록 다시 불러오기]. 체크 칸은 그대로 쓸 수 있고 바꾸면 다시 불러옴 | 목록 불러오기 실패 |
| confirm notice | 「작성자 설명이 없는 Catch가 N개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다」, 발행은 막지 않음. N은 고르기 목록이 아니라 고른 자료(`SelectedItem`)에서 셈 | 설명 없는 Catch를 골라 확인 단계로 |

항목 작은 줄: 저장소 이름 · 공개 상태 · 「설명 안 씀」(없을 때만) · 「불일치 표시됨」(있을 때만) (Q2 A).

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 체크 칸 값 | boolean | yes | false | 목록 요청 조건(본인 목록 「씀」과 같은 기준) |
| 항목의 저장소 이름 | string | yes | — | 얻는 길은 기능 설계(FR8.2) |
| 항목의 설명 있음 | boolean | yes | — | 목록 자료 칸(FR8.6) |
| 고른 자료의 설명 있음 | boolean | yes | — | 확인 단계 수를 셀 때 씀. 지금 `SelectedItem`에는 없어 기능 설계에서 더함 |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 화면 폭 기준 없음(발행 화면) | 작은 줄이 길면 지금 글 모양대로 줄을 바꿈 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 체크 칸은 `input type=checkbox`, 항목은 지금처럼 `button aria-pressed` |
| Keyboard interaction | 체크 칸은 「내 Catch」 항목들 앞, Space로 켜고 끔 |
| Label / aria-label | 체크 칸은 보이는 이름이 감싼 `label`(지금 비밀번호 체크 칸과 같은 꼴) |
| Screen reader | 걸러 본 개수 줄은 `aria-live="polite"`(새로 두는 줄, 가정). 작은 줄은 단추 안 글자라 단추 이름과 함께 읽힘 |
| Focus management | 켜거나 꺼도 초점은 체크 칸에 남음 |

### Usage Example

```
<label className={styles.check}><input type="checkbox" /> 작성자 설명을 쓴 Catch만 보기</label>
```

---

## 9. 발행본: 저장소 줄과 이 기록으로 알 수 없는 것 (2단계)

| Field | Value |
|---|---|
| Component | 사본 머리 줄과 작업 전체 한계 목록(새것) |
| Description | 제목 아래 저장소 이름, 작업 사실 아래 작업 전체 한계 |
| Category | display |
| 이야기 | US6.1, US6.3, US6.4 |

### States

| State | Description | Trigger |
|---|---|---|
| default | h3 아래 작은 글자 저장소 이름. 작업 사실 아래 굵은 글자 「이 기록으로 알 수 없는 것」 + 목록(같은 문장 한 번) | 사본에 값 있음 |
| no limits | 목록을 그리지 않음 | 한계 없음 |
| old snapshot | 저장소 줄·목록 없이 지금 그대로 | 이 변경 전 사본 |

### Props / Inputs

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| 저장소 이름 | string \| 없음 | no | 없음 | 사본 칸 |
| 작업 전체 한계 | string 목록 \| 없음 | no | 없음 | 두 종류뿐(가정 A1) |

### Responsive Behaviour

| Breakpoint | Behaviour |
|---|---|
| 화면 폭 기준 없음(받은 사람 화면) | 세로로 쌓임 |

### Accessibility

| Requirement | Implementation |
|---|---|
| ARIA role | 저장소 줄은 `p`, 한계는 굵은 글자 + `ul`(지금 지원자 상세의 「이 근거로 알 수 없는 것」과 같은 꼴) |
| Screen reader | 목록은 펼친 채라 접힘 안에 숨지 않음 |
| Focus management | 「근거 자세히 보기」 접힘과 근거 위치 초점 이동은 지금 그대로 |

### Usage Example

```
<p className={styles.small}>{repositoryName}</p> … <strong>이 기록으로 알 수 없는 것</strong><ul>…</ul>
```

## Sources

- `ideation/rough-mockups/wireframes.md`, `ideation/rough-mockups/user-flow.md`
- `inception/user-stories/stories.md`, `inception/requirements-analysis/requirements.md`
- `inception/refined-mockups/refined-mockups-questions.md` Q1~Q4
- 지금 코드: `web/src/features/assets/author-description-panel.tsx`, `web/src/features/assets/assets-view.tsx`, `web/src/features/publications/publish-view.tsx`, `web/src/features/publications/snapshot-view.tsx`
