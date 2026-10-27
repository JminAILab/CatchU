# U1 AI 생성 관문 최소 경로 — 엔티티

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U1, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US6.3, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US6.3, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR6.4·FR6.5·FR6.9·A04, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 AiGeneration, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q5.

## 범위

U1은 아무것도 저장하지 않는다. AiGeneration은 엔티티를 소유하지 않으므로(components) 아래는 모두 한 번의 `generate()` 호출 안에서만 사는 값 객체다. 입력·출력 모양은 계약 C-01을 그대로 따르고, U1 안에서만 쓰는 중간 값(인용 줄, 제공자 응답)을 더했다. 자료형은 논리 자료형이며 특정 언어를 가리키지 않는다.

```yaml
entities:
  - name: AiSource
    description: 근거 글 하나. 호출 Unit이 넘기며 인용 문서 하나가 된다(C-01 그대로)
    owner: 호출 Unit(U5·U10, 시험에서는 시험 자료)
    attributes:
      - { name: sourceId, type: string, required: true, constraints: "검색 조각 ID 또는 호출자가 정한 ID. 한 요청 안에서 유일" }
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL] }
      - { name: text, type: string, required: true, constraints: "발행 사본 필드 중 location 범위의 원문 그대로. 줄로 나눌 대상" }
      - { name: location, type: SourceLocation, required: true }
      - { name: catchEvidenceUrls, type: list<string>, required: true, default: "[]", constraints: "U1은 쓰지 않고 그대로 둔다(PR 번호 허용은 U2 검사)" }
  - name: SourceLocation
    description: 사본 필드 안의 원문 범위(C-01·C-07·C-09·web이 같게 쓰는 모양)
    attributes:
      - { name: publishedItemId, type: uuid, required: true }
      - { name: fieldPath, type: string, required: true }
      - { name: charStart, type: integer, required: true, min: 0, constraints: "사본 필드 문자열의 UTF-16 코드 단위, 포함" }
      - { name: charEnd, type: integer, required: true, constraints: "UTF-16 코드 단위, 제외. charStart 이상" }
      - { name: pdfPage, type: integer, required: false, default: null, constraints: "U1은 그대로 옮긴다" }
  - name: AiGenerationRequest
    description: 생성 요청 하나(C-01 그대로)
    attributes:
      - { name: feature, type: enum, required: true, allowed: [BASE_SUMMARY, QNA, JD_SUMMARY] }
      - { name: instruction, type: string, required: true, constraints: "기능별 지시문" }
      - { name: sources, type: list<AiSource>, required: true, constraints: "비면 호출하지 않는다(BR2.1)" }
      - { name: userText, type: string, required: false, default: null, constraints: "질문·JD 요구사항 줄. 신뢰하지 않는 입력" }
      - { name: publicationText, type: string, required: false, default: null, constraints: "U2 검사 전용. U1은 쓰지 않고 모델에 보내지 않는다" }
      - { name: model, type: enum, required: true, allowed: [HAIKU, SONNET], default: HAIKU }
  - name: CitationLine
    description: 인용 단위(줄) 하나. U1 안에서만 쓰며 Claude에 넘기는 블록 하나가 된다
    attributes:
      - { name: sourceIndex, type: integer, required: true, min: 0, constraints: "요청 sources 안 위치. 인용 문서 번호와 같다고 보지 않고 CitationDocument로 잇는다(BR1.4)" }
      - { name: blockIndex, type: integer, required: true, min: 0, constraints: "그 문서 안에서 넘긴 줄의 순번(빈 줄은 번호를 받지 않음)" }
      - { name: lineStart, type: integer, required: true, min: 0, constraints: "근거 text 안 UTF-16 시작, 포함" }
      - { name: lineEnd, type: integer, required: true, constraints: "근거 text 안 UTF-16 끝, 제외. 줄 끝 \\r·\\n 제외" }
      - { name: text, type: string, required: true, constraints: "공백만으로 된 줄이 아님" }
  - name: CitationDocument
    description: Claude에 넘긴 인용 문서 하나와 그 근거를 잇는 대응표의 한 행. 문서를 만들 때 함께 만든다(BR1.4)
    attributes:
      - { name: documentIndex, type: integer, required: true, min: 0, unique: true, constraints: "Claude에 넘긴 문서 순번. 인용의 문서 번호가 가리키는 값" }
      - { name: sourceIndex, type: integer, required: true, min: 0, unique: true, constraints: "요청 sources 안 위치. 줄이 없어 문서가 되지 않은 근거는 행이 없으므로 documentIndex와 다를 수 있다" }
  - name: ProviderResponse
    description: Claude 인용 호출의 응답을 U1이 읽는 모양
    attributes:
      - { name: fragments, type: list<ResponseFragment>, required: true }
      - { name: stopReason, type: enum, required: true, allowed: [END_TURN, MAX_TOKENS, REFUSAL, OTHER] }
  - name: ResponseFragment
    description: 응답의 글 조각 하나(인용이 붙을 수도 안 붙을 수도 있음)
    attributes:
      - { name: text, type: string, required: true }
      - { name: citations, type: list<ProviderCitation>, required: true, default: "[]" }
  - name: ProviderCitation
    description: 인용 기능이 돌려준 인용 하나
    attributes:
      - { name: locationKind, type: enum, required: true, allowed: [BLOCK_RANGE, OTHER], constraints: "U1이 넘긴 줄 블록 문서는 BLOCK_RANGE만 정상" }
      - { name: documentIndex, type: integer, required: false }
      - { name: startBlockIndex, type: integer, required: false, constraints: "포함" }
      - { name: endBlockIndex, type: integer, required: false, constraints: "제외" }
      - { name: citedText, type: string, required: false, constraints: "인용 기능이 돌려준 인용 글. quote로 쓰지 않고(BR4.2) 실제 호출 시험의 대조에만 쓴다(S8)" }
  - name: GatedItem
    description: 화면에 낼 수 있는 항목 하나(C-01 그대로)
    attributes:
      - { name: kind, type: enum, required: true, allowed: [CITED, AI_INTERPRETATION] }
      - { name: text, type: string, required: true, constraints: "응답 줄에서 '- '를 뺀 나머지" }
      - { name: citations, type: list<ItemCitation>, required: true, constraints: "CITED는 1개 이상, AI_INTERPRETATION은 빈 목록" }
  - name: ItemCitation
    description: 항목에 붙은 근거 원문 하나(C-01 GatedItem.citations의 원소)
    attributes:
      - { name: sourceId, type: string, required: true, references: AiSource.sourceId }
      - { name: quote, type: string, required: true, constraints: "location 범위의 원문 그대로" }
      - { name: location, type: SourceLocation, required: true, constraints: "quote 자체의 범위로 좁힌 값" }
      - { name: sourceLabel, type: enum, required: true, allowed: ["GitHub 기록 원문", "작성자 자료 원문"] }
  - name: GatedOutput
    description: generate()의 결과(C-01 그대로)
    attributes:
      - { name: items, type: list<GatedItem>, required: true, constraints: "응답 순서 그대로" }
      - { name: droppedCount, type: integer, required: true, min: 0, default: 0, constraints: "U1에서는 BR4.4·BR5.1로 버린 항목 수. 로그용, 화면에 보이지 않음" }
  - name: AiProviderError
    description: 생성 실패(C-01 오류). 자동 재시도 없이 호출자가 실패로 기록한다
    attributes:
      - { name: reason, type: enum, required: true, allowed: [CALL_FAILED, REFUSED, NO_ITEMS, UNEXPECTED_STOP] }
relationships:
  - { from: AiGenerationRequest, to: AiSource, cardinality: "1 to 0..n", direction: "요청이 근거를 가진다" }
  - { from: AiSource, to: SourceLocation, cardinality: "1 to 1", direction: "근거가 위치를 가진다" }
  - { from: AiSource, to: CitationLine, cardinality: "1 to 0..n", direction: "근거를 줄로 나눈다" }
  - { from: CitationDocument, to: AiSource, cardinality: "0..1 to 1", direction: "문서 번호가 근거 하나를 가리킨다(줄 없는 근거는 문서 없음)" }
  - { from: ProviderCitation, to: CitationDocument, cardinality: "n to 1", direction: "인용의 문서 번호로 대응표 행을 찾는다" }
  - { from: ProviderResponse, to: ResponseFragment, cardinality: "1 to 0..n", direction: "응답이 조각을 가진다" }
  - { from: ResponseFragment, to: ProviderCitation, cardinality: "1 to 0..n", direction: "조각이 인용을 가진다" }
  - { from: ProviderCitation, to: CitationLine, cardinality: "n to 1..n", direction: "인용 블록 범위가 줄들을 가리킨다" }
  - { from: GatedOutput, to: GatedItem, cardinality: "1 to 0..n", direction: "결과가 항목을 가진다" }
  - { from: GatedItem, to: ItemCitation, cardinality: "1 to 0..n", direction: "항목이 근거 원문을 가진다" }
  - { from: ItemCitation, to: AiSource, cardinality: "n to 1", direction: "sourceId로 근거를 가리킨다" }
```

## 요약

- **입력·출력(C-01 그대로):** `AiGenerationRequest`·`AiSource`·`SourceLocation`과 `GatedOutput`·`GatedItem`·`ItemCitation`, 오류 `AiProviderError`. 계약의 칸을 늘리거나 바꾸지 않는다. `AiInputTooLarge`는 U2가 넣는다(Q1).
- **U1 안의 중간 값:** `CitationLine`(Claude에 넘기는 줄 블록과 원문 위치), `CitationDocument`(문서 번호 → 근거 대응표), `ProviderResponse`·`ResponseFragment`·`ProviderCitation`(인용 호출 응답을 읽는 모양). 밖으로 내보내지 않는다.
- **저장:** 없다. 요청·응답·근거 글은 한 호출 안에서만 쓰고 기록에 남기지 않는다(BR5.5).
- `AiProviderError.reason`은 U1이 실패 원인을 로그에서 구분하려고 둔 값이다. 계약의 오류 이름은 그대로이며 호출자는 이름만으로 실패를 기록할 수 있다.
