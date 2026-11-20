# Rules — u3-reader-views

이 단위의 규칙은 읽는 쪽 화면(받은 사람 화면, 작성자 발행본 상세)과 자료 화면의 탭, 출처 이동, 자료 지우기 확인 문장이다. 사본의 프리셋 칸(`presetOrdinal`·`presetName`)은 U1이 싣는다(계약 P-3). 화면 글자·역할·키보드는 다듬은 화면 `inception/refined-mockups/mockups.md` M5~M7과 `interaction-spec.md`를 따른다.

```yaml
rules:
  - id: BR1.1
    statement: 탭 줄은 tablist, 탭은 tab(aria-selected·aria-controls), 탭마다 tabpanel(aria-labelledby)을 둔다
    category: validation
    applies_to: TabStrip(받은 사람 화면·작성자 상세·텍스트 자료 화면)
    trigger: 탭 줄을 그릴 때
    logic: IF 탭 줄 THEN 탭 줄 이름(aria-label)을 받고, 탭마다 tabpanel 하나를 그린다. 텍스트 자료 화면의 텍스트 탭에도 tabpanel을 둔다
    violation: 화면 낭독기가 탭 역할·선택 상태를 읽지 못한다
    source: NFR1, FR7.1
  - id: BR1.2
    statement: 왼쪽·오른쪽 화살표로 옆 탭으로 옮기면 그 탭이 바로 열리고, 끝에서는 처음으로 돈다. Home·End는 처음·끝 탭, Enter·Space·누름은 그 탭을 연다
    category: policy
    applies_to: TabStrip
    trigger: 탭에 초점이 있을 때 키를 누름
    logic: IF 화살표·Home·End THEN 새 탭을 열고 초점을 새 탭으로 옮긴다
    violation: 화살표로 탭이 열리지 않는다
    source: FR3.3, FR7.1, NFR1
  - id: BR1.3
    statement: 열린 탭만 Tab 순서에 있고(tabindex 0), 다른 탭은 tabindex -1이다. 다시 Tab이면 열린 탭의 패널로 들어간다
    category: policy
    applies_to: TabStrip
    trigger: 탭 줄에 Tab으로 들어오고 나갈 때
    logic: IF 탭 줄에 Tab으로 들어옴 THEN 열린 탭에 초점. IF 다시 Tab THEN 열린 패널 안의 첫 초점 요소(없으면 패널)로 간다
    violation: 열리지 않은 탭마다 Tab을 거친다
    source: FR3.3, NFR1
  - id: BR1.4
    statement: 모든 탭의 패널을 그려 두고 열리지 않은 패널은 hidden으로 숨긴다. 탭을 오가도 패널 안 상태(PDF 뷰어의 받은 파일·보던 쪽)가 남는다
    category: constraint
    applies_to: TabStrip, 발행본 자료
    trigger: 탭을 바꿀 때
    logic: IF 탭을 바꿈 THEN 패널을 다시 만들지 않고 hidden만 바꾼다. 항목의 화면 id는 지금처럼 publishedItemId다
    violation: 탭을 오가면 PDF를 다시 받는다
    source: FR3.2(기능 설계 Q2)
  - id: BR1.5
    statement: 탭 이름은 CSS로 탭 하나의 최대 폭을 넘으면 뒤를 「…」로 줄여 보이고, 글자는 자르지 않는다
    category: policy
    applies_to: 발행본 자료 탭 이름
    trigger: 탭 이름이 길 때
    logic: IF 이름이 최대 폭(16em)을 넘음 THEN 한 줄 말줄임으로 보이고, 화면 낭독기에는 이름 전체가 읽힌다
    violation: 이름이 잘려 읽힌다
    source: FR3.2(기능 설계 Q1)
  - id: BR2.1
    statement: 발행본 자료는 사본 항목을 presetOrdinal 순으로 묶어 탭마다 한 프리셋을 보이고, 탭 이름은 그 묶음의 presetName, 탭 안 순서는 position 순이다
    category: calculation
    applies_to: 받은 사람 화면·작성자 상세의 발행본 자료
    trigger: 사본을 그릴 때
    logic: IF 사본 THEN presetOrdinal 오름차순으로 묶고, 묶음 안은 position 오름차순으로 지금 항목 그리기를 쓴다
    violation: 프리셋이 섞이거나 순서가 다르다
    source: FR3.2, FR6.1
  - id: BR2.2
    statement: 탭 줄은 프리셋이 하나여도 보이고, 처음 열면 첫 탭이 열려 있으며, 탭 옆에 자료 개수를 붙이지 않는다. 탭 줄 아래에 열린 탭의 프리셋 이름 전체를 글자로 보인다
    category: policy
    applies_to: 발행본 자료
    trigger: 사본을 그릴 때
    logic: IF 사본 THEN 탭 줄(이름 「발행본 자료」)과 첫 탭을 연 상태로 그리고, 탭 줄 아래 열린 탭 이름 전체를 보인다
    violation: 프리셋 하나일 때 탭 줄이 없거나 개수가 붙는다
    source: FR3.2
  - id: BR2.3
    statement: 같은 자료가 두 프리셋에 있으면 탭마다 그 사본을 각각 보인다
    category: policy
    applies_to: 발행본 자료
    trigger: 사본을 그릴 때
    logic: IF 같은 자료의 사본 둘 THEN 두 탭에 각각 그린다(publishedItemId가 다르다)
    violation: 한 탭에만 보인다
    source: FR2.7
  - id: BR2.4
    statement: 사본 응답 검사는 항목마다 presetOrdinal(1~5 정수)과 presetName(글자)을 요구하고, 없으면 지금처럼 응답 모양 어긋남으로 본다
    category: validation
    applies_to: web/src/features/publications/publications-api.ts isPublishedItem
    trigger: 받은 사람 열람·작성자 상세 응답을 읽을 때
    logic: IF presetOrdinal 이 정수 1~5가 아니거나 presetName 이 글자가 아님 THEN 그 응답을 어긋난 응답으로 본다
    violation: 프리셋 칸 없는 사본으로 탭을 그리다 깨진다
    source: FR3.2(계약 P-3)
  - id: BR2.5
    statement: 프리셋 이름은 탭·탭 아래 이름·알림 글에서 글자로만 그린다
    category: validation
    applies_to: 발행본 자료
    trigger: 이름을 그릴 때
    logic: IF 이름에 태그 같은 글이 있어도 THEN React 글자로만 넣는다
    violation: 이름이 HTML로 해석된다
    source: NFR3
  - id: BR3.1
    statement: 받은 사람 화면 순서는 제목 → 이 링크에서 할 수 있는 것 안내 → Claude 연결 → 발행 시각 → 「AI 요약」 → 「발행본 자료」 → 「발행본에 질문하기」 → JD 요약이다
    category: policy
    applies_to: 받은 사람 화면
    trigger: 판정 통과 화면을 그릴 때
    logic: IF 판정 통과 THEN AI 요약 자리를 발행본 자료 위로 옮기고, 나머지 자리와 안내(기본 접힘)는 그대로 둔다
    violation: 요약이 자료 아래에 있다
    source: FR3.1
  - id: BR3.2
    statement: 탭을 바꿔도 「발행본에 질문하기」 대화가 남는다
    category: constraint
    applies_to: 받은 사람 화면
    trigger: 탭을 바꿀 때
    logic: IF 탭 바꿈 THEN 질문 자리는 탭 밖에 있어 다시 만들지 않는다
    violation: 질문과 답이 사라진다
    source: FR3.4
  - id: BR4.1
    statement: 출처 단추가 가리킨 항목이 다른 탭에 있으면, 한 번의 상태 바뀜에서 그 탭을 열고 옮길 대상을 정한다
    category: policy
    applies_to: 받은 사람 화면·작성자 상세의 출처 이동
    trigger: 답·요약의 출처 단추를 누를 때
    logic: IF 대상 항목의 presetOrdinal 이 열린 탭과 다름 THEN 열린 탭과 대상을 함께 바꾸고, 그려진 뒤 지금처럼 항목에 초점(preventScroll)을 두고 첫 강조나 항목 시작이 보이게 옮긴다
    violation: 다른 탭의 글로 가지 않거나 탭만 바뀐다
    source: FR3.5, FR3.7
  - id: BR4.2
    statement: 출처 이동으로 탭이 바뀌면 「(프리셋 이름) 탭을 열었습니다」를 aria-live="polite"로 알린다. 같은 탭이면 알리지 않는다
    category: policy
    applies_to: 출처 이동
    trigger: 출처 이동으로 탭이 바뀔 때
    logic: IF 탭이 바뀜 THEN 탭 줄 근처의 알림 칸 글을 바꾼다
    violation: 화면 낭독기가 탭이 바뀐 것을 모른다
    source: FR3.5, NFR1
  - id: BR4.3
    statement: [답으로 돌아가기]는 만들지 않는다
    category: constraint
    applies_to: 출처 이동
    trigger: 출처로 옮겨 간 뒤
    logic: IF 옮겨 감 THEN 돌아가기 단추를 그리지 않는다(2026-11-19 팀장 결정)
    violation: 돌아가기 단추가 생긴다
    source: FR3.5(mockups 「화면 초안과 달라진 곳」)
  - id: BR5.1
    statement: 텍스트 자료 화면의 「텍스트 자료」「PDF 자료」 탭은 TabStrip을 쓰고, 탭 이름과 자리는 지금 그대로다
    category: policy
    applies_to: 텍스트 자료 화면
    trigger: 화면을 그릴 때
    logic: IF 자료 화면 THEN MaterialsTabs 대신 TabStrip(탭 줄 이름 「자료 종류」)을 쓰고, 두 탭 모두 tabpanel을 둔다
    violation: 화살표로 탭이 옮겨지지 않는다
    source: FR7.1
  - id: BR5.2
    statement: 텍스트 자료와 PDF 지우기 확인 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」를 더한다
    category: policy
    applies_to: 텍스트 자료·PDF 지우기 확인
    trigger: 지우기를 누를 때
    logic: IF 지우기 확인 THEN 지금 문장 뒤에 그 문장을 붙인다
    violation: 프리셋에서 빠진다는 말이 없다
    source: FR4.1
```

| ID | 내용 | 화면 |
|---|---|---|
| BR1.1 | 탭 역할·패널 | 탭 줄 셋 |
| BR1.2 | 화살표·Home·End | 탭 줄 셋 |
| BR1.3 | 열린 탭만 Tab 순서 | 탭 줄 셋 |
| BR1.4 | 모든 패널 그리고 숨김 | 발행본 자료 |
| BR1.5 | CSS 말줄임 | 발행본 자료 |
| BR2.1 | 프리셋별 묶음 | 발행본 자료 |
| BR2.2 | 하나여도 탭 줄, 첫 탭, 이름 전체 | 발행본 자료 |
| BR2.3 | 같은 자료 탭마다 | 발행본 자료 |
| BR2.4 | 응답 검사 프리셋 칸 | 응답 해석 |
| BR2.5 | 이름 글자로만 | 발행본 자료 |
| BR3.1 | 요약을 자료 위로 | 받은 사람 화면 |
| BR3.2 | 질문 대화 남음 | 받은 사람 화면 |
| BR4.1 | 출처로 다른 탭 | 두 화면 |
| BR4.2 | 탭 바뀜 알림 | 두 화면 |
| BR4.3 | 돌아가기 없음 | 두 화면 |
| BR5.1 | 자료 화면 탭 | 텍스트 자료 화면 |
| BR5.2 | 지우기 확인 문장 | 텍스트 자료 화면 |
