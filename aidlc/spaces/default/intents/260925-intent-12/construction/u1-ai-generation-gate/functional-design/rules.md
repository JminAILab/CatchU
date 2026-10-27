# U1 AI 생성 관문 최소 경로 — 업무 규칙

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U1, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US6.3, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US6.3, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR6.4·FR6.5·FR6.9·A04, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 AiGeneration, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01과 「에러 대응 최소선」, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q5, [엔티티](entities.md).

## 규칙

`source`의 Q는 [기능 설계 질문·답변](functional-design-questions.md)의 질문 번호다. 기계 대조·버림·숨긴 지시 방어·역량 평가 표현 금지·입력 상한은 U2 규칙이라 여기에 없다(Q1).

```yaml
rules:
  # BR1 인용 단위(줄) — U1에서 정하고 U2가 그대로 쓴다(Q2)
  - id: BR1.1
    statement: 근거 글은 줄바꿈 문자로만 줄을 나눈다
    category: constraint
    applies_to: AiSource.text
    trigger: generate() 호출 시 근거마다
    logic: IF 근거 글에 줄바꿈이 있으면 THEN 그 자리에서 나누고, 줄 글자에서 줄바꿈과 바로 앞의 캐리지 리턴을 뺀다. 그 밖의 앞말·공백 정리는 하지 않는다
    violation: 해당 없음(나누기 규칙)
    source: FR6.4, C-01 citation-location, Q2
  - id: BR1.2
    statement: 빈 줄은 인용 단위로 넘기지 않는다
    category: constraint
    applies_to: CitationLine
    trigger: 줄을 나눈 뒤
    logic: IF 줄이 비었거나 공백 문자만 있으면 THEN 넘기지 않고 블록 번호도 주지 않는다. 다른 줄의 위치는 원문 기준 그대로 둔다
    violation: 해당 없음
    source: Q2
  - id: BR1.3
    statement: 넘기는 줄마다 근거 글 안의 시작·끝 위치를 UTF-16 코드 단위로 기록한다
    category: calculation
    applies_to: CitationLine.lineStart, CitationLine.lineEnd
    trigger: 줄을 나눌 때
    logic: 줄 시작은 근거 글 처음부터 그 줄 첫 글자까지의 UTF-16 길이, 줄 끝은 줄 글자(BR1.1로 뺀 뒤)의 마지막 다음 위치다
    violation: 해당 없음
    source: C-01 citation-location, Q2
  - id: BR1.4
    statement: 근거 하나를 인용 문서 하나로 넘기고, 문서를 만들 때 문서 번호 → 근거 대응표를 함께 만든다
    category: policy
    applies_to: AiSource, CitationDocument
    trigger: 호출 구성 시
    logic: 요청 sources 순서대로 근거마다 인용이 켜진 문서를 하나 만들고 그 내용은 BR1.1·BR1.2로 만든 줄 블록이다. context에는 "자료 종류" 설명(GitHub 기록 원문 / 작성자 자료 원문)을 둔다. IF 넘길 줄이 하나도 없는 근거면 THEN 문서를 만들지 않고 자리 문서로도 넘기지 않는다(API가 빈 글 조각을 받지 않고, 가짜 글이 인용될 수 있다). 문서를 하나 만들 때마다 대응표에 (문서 번호, 근거 위치) 한 행을 더한다. 문서 번호와 근거 위치를 같은 값으로 보지 않는다
    violation: 해당 없음
    source: FR6.4, C-01 citation-location, Q2, 팀장 결정(2026-10-27)
  # BR2 호출 구성
  - id: BR2.1
    statement: 넘길 근거가 없으면 Claude를 부르지 않는다
    category: validation
    applies_to: AiGenerationRequest.sources
    trigger: 호출 전
    logic: IF sources가 비었거나 BR1.4 뒤 남은 문서가 없으면 THEN 호출하지 않고 항목 없음·droppedCount 0을 돌려준다
    violation: 빈 결과(오류 아님)
    source: C-01 AiGenerationRequest.sources
  - id: BR2.2
    statement: 요청의 model 값으로 모델을 고르고 생각 출력은 끈다
    category: policy
    applies_to: AiGenerationRequest.model
    trigger: 호출 구성 시
    logic: HAIKU는 Haiku 5.5, SONNET은 Sonnet 5.5로 부른다. 생각 출력을 끈다(사전 시험과 같음). 출력 상한은 요청 칸이 아니라 게이트를 만들 때 주는 설정이다. 실제 호출 시험(S8)은 시험 코드의 상수로 이 설정을 낮춰 게이트를 만든다
    violation: 해당 없음
    source: FR6.9, C-01 model, Q4, Q5
  - id: BR2.3
    statement: 지시는 게이트의 항목 형식 지시와 기능 지시로 만들고, 질문·JD 줄은 문서 뒤에 신뢰하지 않는 입력으로 붙인다
    category: policy
    applies_to: AiGenerationRequest.instruction, userText, publicationText
    trigger: 호출 구성 시
    logic: 시스템 지시 = 항목 형식 지시("한 줄에 한 항목, 줄 맨 앞은 '- ', 항목마다 사실 하나, 머리말·맺음말 없음") + instruction. 사용자 메시지 = 인용 문서들, 그 뒤 userText(있을 때). publicationText는 모델에 보내지 않는다
    violation: 해당 없음
    source: FR6.4, C-01, Q3
  - id: BR2.4
    statement: Claude 호출 자체가 실패하면 자동으로 다시 부르지 않고 AiProviderError로 끝낸다
    category: policy
    applies_to: generate()
    trigger: 연결 실패·시간 초과·API 오류 응답
    logic: IF 호출이 응답을 받지 못하거나 오류 상태로 끝나면 THEN 재시도 없이 AiProviderError(CALL_FAILED)를 낸다
    violation: AiProviderError
    source: C-01 errors, contract-summary 「에러 대응 최소선」 2
  # BR3 응답을 항목으로 묶기 — 사전 시험 방식(Q3)
  - id: BR3.1
    statement: 응답의 '- '로 시작하는 줄 하나를 항목 하나로 본다
    category: constraint
    applies_to: ProviderResponse.fragments
    trigger: 응답을 받은 뒤
    logic: 글 조각을 순서대로 이어 줄바꿈으로 나눈다. IF 줄이 '- '로 시작하고 그 뒤 글자가 있으면 THEN 항목 하나이며 항목 글은 '- ' 뒤의 나머지다
    violation: 해당 없음
    source: FR6.4, Q3
  - id: BR3.2
    statement: 한 줄 안 조각들의 인용을 모아 그 항목의 인용으로 한다
    category: calculation
    applies_to: GatedItem.citations
    trigger: 항목을 만들 때
    logic: 조각의 인용은 그 조각의 첫 번째 줄바꿈 아닌 글자가 놓인 줄에 속한다. 항목의 인용은 그 줄에 속한 인용 모두이며 응답에 나온 순서를 지킨다
    violation: 해당 없음
    source: FR6.4, Q3
  - id: BR3.3
    statement: 인용이 하나라도 있으면 CITED, 없으면 AI_INTERPRETATION이다
    category: policy
    applies_to: GatedItem.kind
    trigger: 항목을 만들 때
    logic: IF 항목 인용이 1개 이상 THEN CITED ELSE AI_INTERPRETATION(빈 인용 목록)
    violation: 해당 없음
    source: FR6.4, FR6.5, AC6.3.3, Q3
  - id: BR3.4
    statement: "'- '로 시작하지 않는 글은 항목으로 내보내지 않는다"
    category: policy
    applies_to: ProviderResponse.fragments
    trigger: 응답을 받은 뒤
    logic: IF 줄이 '- '로 시작하지 않거나 '- ' 뒤가 비었으면 THEN 내보내지 않고 그 줄의 인용도 버린다. 항목이 아니므로 droppedCount에 세지 않는다
    violation: 조용히 제외
    source: Q3
  # BR4 인용 보존·원문 위치 연결
  - id: BR4.1
    statement: 인용의 문서 번호·블록 범위로 근거와 원문 위치를 찾는다
    category: calculation
    applies_to: ItemCitation.location
    trigger: 항목 인용마다
    logic: 인용의 문서 번호로 BR1.4 대응표의 행을 찾아 근거를 정하고(문서 번호를 근거 위치로 바로 쓰지 않는다), 블록 범위 [시작, 끝)의 첫 줄 시작과 마지막 줄 끝을 근거 location.charStart에 더해 charStart·charEnd로 한다. publishedItemId·fieldPath·pdfPage는 근거 location에서 그대로 옮긴다
    violation: BR4.4
    source: FR6.5, AC6.3.5, C-01 citation-location
  - id: BR4.2
    statement: 인용문은 인용 기능이 이어 붙인 글이 아니라 그 범위의 원문이다
    category: policy
    applies_to: ItemCitation.quote
    trigger: 항목 인용마다
    logic: quote = 근거 글에서 BR4.1 범위(근거 글 기준 위치)의 글자 그대로. 범위 안의 빈 줄·줄바꿈도 원문대로 포함한다
    violation: 해당 없음
    source: FR6.4, AC6.3.1, C-01 citation-location
  - id: BR4.3
    statement: 출처 이름은 근거 종류에서 정해진 두 가지로 붙인다
    category: policy
    applies_to: ItemCitation.sourceLabel
    trigger: 항목 인용마다
    logic: GITHUB_RECORD → "GitHub 기록 원문", AUTHOR_MATERIAL → "작성자 자료 원문"
    violation: 해당 없음
    source: FR6.5, AC6.3.1, C-01 GatedItem
  - id: BR4.4
    statement: 원문 위치로 연결되지 않는 인용이 있는 항목은 버린다
    category: validation
    applies_to: GatedItem
    trigger: BR4.1 실패
    logic: IF 인용이 블록 범위 모양이 아니거나, 문서 번호가 대응표에 없거나, 블록 범위가 비었거나 넘긴 줄 밖이면 THEN 그 항목을 내보내지 않고 droppedCount에 1을 더한다
    violation: 경고 없이 항목 제외, 로그에 수만 남김
    source: FR6.5, AC6.3.5, A04 원문 위치 연결
  # BR5 거부 사례 처리 — U1은 ①②만(Q4)
  - id: BR5.1
    statement: 출력 상한에서 잘린 응답은 끝나지 않은 마지막 항목만 버리고 나머지를 낸다
    category: policy
    applies_to: ProviderResponse
    trigger: 중단 이유가 MAX_TOKENS
    logic: 응답 마지막 줄바꿈 뒤의 마지막 줄을 끝나지 않은 줄로 본다. IF 그 줄이 BR3.1의 항목이면 THEN 버리고 droppedCount에 1을 더한다. 나머지 항목은 낸다
    violation: 마지막 항목만 경고 없이 제외
    source: A04 거부 사례 처리, Q4 ①
  - id: BR5.2
    statement: 거절로 끝난 응답은 실패다
    category: policy
    applies_to: ProviderResponse
    trigger: 중단 이유가 REFUSAL
    logic: IF 중단 이유가 거절이면 THEN 이미 나온 항목이 있어도 내보내지 않고 AiProviderError(REFUSED)를 낸다
    violation: AiProviderError
    source: A04 거부 사례 처리, Q4 ②
  - id: BR5.3
    statement: 항목이 하나도 없는 응답은 실패다
    category: policy
    applies_to: GatedOutput.items
    trigger: BR3·BR4·BR5.1을 마친 뒤
    logic: IF 낼 항목이 0개면 THEN AiProviderError(NO_ITEMS)를 낸다. 잘린 응답에서 남은 항목이 0개인 경우도 같다
    violation: AiProviderError
    source: A04 거부 사례 처리, Q4 ②
  - id: BR5.4
    statement: 정상 끝과 출력 상한 말고 다른 중단 이유는 실패다
    category: policy
    applies_to: ProviderResponse.stopReason
    trigger: 응답을 받은 뒤
    logic: IF 중단 이유가 END_TURN·MAX_TOKENS·REFUSAL이 아니면 THEN AiProviderError(UNEXPECTED_STOP)를 낸다
    violation: AiProviderError
    source: C-01 errors, contract-summary 「에러 대응 최소선」 1
  - id: BR5.5
    statement: 실패와 버림은 숨기지 않고 기록하되 근거 글·질문·키는 남기지 않는다
    category: policy
    applies_to: generate()
    trigger: AiProviderError, BR4.4·BR5.1 버림
    logic: 기능 이름, 중단 이유, 실패 원인, 항목 수, droppedCount만 로그에 남긴다. 근거 글·인용문·userText·API 키는 로그와 오류 메시지에 넣지 않는다
    violation: 해당 없음
    source: contract-summary 「에러 대응 최소선」 1, team.md Code Style, NFR2
```

## 규칙 요약

| ID | 무리 | 요지 |
|---|---|---|
| BR1.1 | 줄 | 줄바꿈으로만 나누고 줄 끝 `\r`·`\n`은 뺀다 |
| BR1.2 | 줄 | 빈 줄(공백만)은 넘기지 않고 다른 줄 위치는 원문 기준 |
| BR1.3 | 줄 | 줄마다 UTF-16 시작·끝 기록 |
| BR1.4 | 줄 | 근거 하나 = 인용 문서 하나, 출처 종류 설명은 context, 문서 번호 → 근거 대응표를 함께 만듦(빈 근거는 문서·자리 문서 없음) |
| BR2.1 | 호출 | 근거가 없으면 부르지 않고 빈 결과 |
| BR2.2 | 호출 | HAIKU/SONNET 그대로, 생각 출력 끔, 출력 상한은 게이트를 만들 때 주는 설정(S8은 시험 상수) |
| BR2.3 | 호출 | 항목 형식 지시 + 기능 지시, userText는 문서 뒤 신뢰하지 않는 입력, publicationText는 안 보냄 |
| BR2.4 | 호출 | 호출 실패는 재시도 없이 AiProviderError |
| BR3.1 | 항목 | '- '로 시작하는 줄 하나 = 항목 하나 |
| BR3.2 | 항목 | 줄 안 조각들의 인용을 모은다 |
| BR3.3 | 항목 | 인용 있으면 CITED, 없으면 AI_INTERPRETATION |
| BR3.4 | 항목 | '- '로 시작하지 않는 글은 내보내지 않음(버림 수에 안 셈) |
| BR4.1 | 위치 | 문서 번호를 대응표로 근거에 잇고, 블록 범위 → 원문 위치 |
| BR4.2 | 위치 | quote는 그 범위의 원문 |
| BR4.3 | 위치 | 출처 이름 두 가지 |
| BR4.4 | 위치 | 대응표에 없는 문서 번호 등 위치로 연결 안 되는 인용이 있으면 항목을 버리고 셈 |
| BR5.1 | 거부 | 잘린 응답은 끝나지 않은 마지막 항목만 버리고 셈 |
| BR5.2 | 거부 | 거절은 AiProviderError |
| BR5.3 | 거부 | 항목 0개는 AiProviderError |
| BR5.4 | 거부 | 그 밖의 중단 이유는 AiProviderError |
| BR5.5 | 거부 | 실패·버림은 수만 기록, 근거 글·질문·키는 남기지 않음 |
