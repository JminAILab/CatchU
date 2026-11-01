# U5 RAG 응답 — 엔티티

## Sources

작성일: 2026-10-30. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U5, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US4.2·US6.2·US19.3, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US4.2·US6.2·US19.3, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR2.7·FR6.2·FR6.4·FR6.6·FR6.8·FR6.9·FR14.8·FR14.10·NFR3, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 QnA·BaseSummary, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-02·C-03·C-06·C-07·C-09·C-10·C-11·C-12, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q8과 요약 확인.

## 범위

U5가 소유하는 표는 `base_summary`(발행본마다 AI 기본 요약 하나) 하나다(components Entity Ownership, C-06). 질문 횟수는 표가 아니라 Redis 키다(components). 대화는 서버에 저장하지 않는다(FR6.2). 그 밖은 저장하지 않는 값 객체(HTTP 요청·응답, SSE 이벤트, AI 생성 요청 구성, 평가 입력·결과)다. 읽기만 하는 `publication`·`published_item`(C-07), `publication_index`·`published_chunk`(U3), `daily_execution_count`(C-03)는 여기서 다시 정의하지 않는다. 자료형은 논리 자료형이며 특정 언어·DB 문법을 가리키지 않는다. `GatedItem`·`AiSource`의 모양은 C-01 그대로다.

```yaml
entities:
  # ---- 저장하는 엔티티(U5 소유) ----
  - name: BaseSummary
    table: base_summary
    description: 발행본 하나의 AI 기본 요약과 실행 상태. 발행 때는 만들지 않고 처리기나 [다시 만들기]가 처음 쓴다(C-02 row-creation). 발행본과 같은 수명이다
    identifier: baseSummaryId
    attributes:
      - { name: baseSummaryId, type: uuid, required: true, unique: true, constraints: "기본 키" }
      - { name: publicationId, type: uuid, required: true, unique: true, references: "Publication.publicationId (ON DELETE CASCADE)", constraints: "발행본 하나에 행 하나" }
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED], default: PENDING, constraints: "C-02 table-convention 이름 그대로" }
      - { name: deadlineAt, type: timestamp-with-zone, required: true, constraints: "처리기가 만들 때 publishedAt + 10분, [다시 만들기] 접수 때 접수 시각 + 10분(Q3)" }
      - { name: items, type: "json(GatedItem[])", required: true, default: "[]", constraints: "C-01 GatedItem 모양 그대로(kind는 CITED·AI_INTERPRETATION만, jdRole null). DONE이면 1개 이상, PENDING·FAILED면 빈 목록" }
      - { name: generatedAt, type: timestamp-with-zone, required: false, constraints: "DONE이 될 때의 시각. PENDING·FAILED면 비어 있다" }
      - { name: updatedAt, type: timestamp-with-zone, required: true, constraints: "행을 쓸 때마다 그 시각" }
    entity_constraints:
      - "publicationId 유일(발행본마다 요약 하나, FR2.7)"
      - "status = DONE이면 items가 1개 이상이고 generatedAt이 있다. status가 PENDING·FAILED면 items는 빈 목록이다"
      - "상태 전이는 functional-spec의 BaseSummary 상태 전이만 따른다"
    relationships:
      - { to: Publication, cardinality: "1:0..1", direction: "BaseSummary → Publication", owned_by: Publication, note: "발행본 삭제·작성자 탈퇴 때 연쇄 삭제(C-06, FR2.7)" }

  # ---- 저장하지 않는 값 객체 ----
  - name: QuestionRequest
    description: 받은 사람이 보내는 질문 하나. POST /v1/public/links/{token}/questions 본문(C-12)
    identifier: 없음(값 객체)
    attributes:
      - { name: question, type: string, required: true, min: 1, max: 500, constraints: "UTF-16 길이. 공백만이면 거부(BR1.1)" }
      - { name: history, type: "HistoryMessage[]", required: true, constraints: "빈 목록 허용. 최근 6개만 쓰고 나머지는 버린다(BR1.2)" }
    relationships: []

  - name: HistoryMessage
    description: 브라우저가 보낸 앞 대화 한 줄. 신뢰할 수 없는 입력이며 서버에 남지 않는다(FR6.2)
    identifier: 없음(값 객체)
    attributes:
      - { name: role, type: enum, required: true, allowed: [USER, ASSISTANT] }
      - { name: text, type: string, required: true, constraints: "앞 2,000자만 쓴다(BR1.2). ASSISTANT는 그 답의 항목 글을 이어 붙인 것" }
    relationships: []

  - name: QuestionCount
    description: 링크당 하루 질문 횟수. Redis 키 하나이고 엔티티 표가 없다(components, C-06)
    identifier: "qna-question-count:{publicationId}:{한국 시간 날짜 YYYY-MM-DD}"
    attributes:
      - { name: count, type: integer, required: true, min: 1, constraints: "질문을 셀 때 1씩 늘린다. 100을 넘으면 거부(Q2, BR3.1)" }
      - { name: expiresAt, type: timestamp-with-zone, required: true, constraints: "처음 셀 때 다음 한국 시간 자정으로 둔다. 지우지 않고 만료에 맡긴다(C-06)" }
    relationships:
      - { to: Publication, cardinality: "N:1", direction: "QuestionCount → Publication", note: "외래 키 없음. 발행본이 지워져도 키는 만료로 사라진다" }

  - name: SearchQuestion
    description: 검색어와 답 생성 userText로 쓰는 질문. 앞 대화가 없으면 질문 그대로, 있으면 다시 쓴 한 문장(Q1)
    identifier: 없음(값 객체)
    attributes:
      - { name: text, type: string, required: true, min: 1, max: 500, constraints: "다시 쓴 결과는 앞 500자만 쓴다(BR4.1)" }
      - { name: rewritten, type: boolean, required: true, constraints: "로그 표시용. 글은 로그에 남기지 않는다" }
    relationships: []

  - name: QnaStreamEvent
    description: 질의응답 SSE 이벤트(C-12)
    identifier: 없음(값 객체)
    attributes:
      - { name: event, type: enum, required: true, allowed: [item, done, error] }
      - { name: data, type: object, required: true, constraints: "item = GatedItem(C-01), done = {}, error = { code: ANSWER_FAILED | INDEX_NOT_READY }" }
    relationships: []

  - name: RecipientSummaryView
    description: GET /v1/public/links/{token}/summary 응답(C-12)
    identifier: 없음(값 객체)
    attributes:
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED] }
      - { name: items, type: "GatedItem[]", required: true, constraints: "DONE일 때만 항목이 있고 그 밖은 빈 목록" }
    relationships: []

  - name: OwnerSummaryView
    description: 작성자 GET /v1/publications/{publicationId}/summary 응답
    identifier: 없음(값 객체)
    attributes:
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED] }
      - { name: items, type: "GatedItem[]", required: true, constraints: "RecipientSummaryView와 같다" }
      - { name: canRegenerate, type: boolean, required: true, constraints: "status가 PENDING이 아니면 true(Q4)" }
    relationships: []

  - name: SummarySource
    description: 기본 요약 생성 때 사본 필드 하나에서 만드는 C-01 AiSource. 색인을 쓰지 않는다(BR5.1)
    identifier: "sourceId = {publishedItemId}/{fieldPath}"
    attributes:
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL], constraints: "C-07 sourceKind-rule" }
      - { name: text, type: string, required: true, min: 1, constraints: "그 필드 문자열 전체 그대로" }
      - { name: location, type: object, required: true, constraints: "{ publishedItemId, fieldPath, charStart: 0, charEnd: 필드의 UTF-16 길이, pdfPage }" }
      - { name: catchEvidenceUrls, type: "string[]", required: true, constraints: "CATCH 항목이면 snapshot evidence[].sourceUrl, 아니면 빈 목록(C-01 caller-rule)" }
    relationships: []

  - name: RagEvalInput
    description: RAG 품질 평가 입력. 저장소에 넣지 않는 로컬 파일이다(Q7)
    identifier: 없음(로컬 파일)
    attributes:
      - { name: publicationId, type: uuid, required: true }
      - { name: questions, type: "{ question: string, goldQuotes: string[] }[]", required: true, min: 10, max: 10, constraints: "goldQuotes는 질문마다 1개 이상의 원문 글귀" }
      - { name: jd, type: "string|null", required: false, constraints: "JD 두 방식 비교(Q8)에 쓰는 JD 원문 하나" }
    relationships: []

  - name: RagEvalReport
    description: 평가 결과. 원문이 든 로컬 결과 파일과, 건수·위치·판정만 든 docs/ 기록 하나로 나뉜다(Q7, Q8)
    identifier: "실행 날짜"
    attributes:
      - { name: mode, type: enum, required: true, allowed: [SYNTHETIC_CHECK, MEASUREMENT], constraints: "SYNTHETIC_CHECK는 NFR3 측정이 아니다" }
      - { name: hitRateAt5, type: number, required: true, constraints: "0~1. 앞 5개 기준 적중 질문 수 / 10" }
      - { name: hitRateAt8, type: number, required: true, constraints: "앞 8개 기준. NFR3 판정 기준" }
      - { name: hitRateAt12, type: number, required: true }
      - { name: passedItems, type: integer, required: true, min: 0 }
      - { name: droppedItems, type: integer, required: true, min: 0, constraints: "'맞는데 버려진 항목'의 상한값으로 적는다" }
      - { name: evidencePassRate, type: number, required: true, constraints: "passedItems / (passedItems + droppedItems). 분모가 0이면 '해당 없음'" }
      - { name: missedHitLocations, type: "{ questionNo, locations: { publishedItemId, fieldPath, charStart, charEnd }[] }[]", required: true, constraints: "8개 기준 비적중 질문의 검색 조각 위치" }
      - { name: humanJudgement, type: object, required: true, constraints: "사람이 채운다: 남의 기여 오귀속 건수, 근거 비뒷받침 건수, 다른 곳의 맞는 근거 n건, 통과 여부, 조정 내용" }
      - { name: jdComparison, type: "{ requirementNo, searchBased: { items, dropped }, fullInput: { items, dropped } | INPUT_TOO_LARGE }[]", required: false, constraints: "요구사항 나누기·지시문을 U10 것과 스크립트 것 중 무엇으로 했는지 함께 적는다" }
    relationships: []
```

## 요약

- **BaseSummary(`base_summary`)** 가 U5의 유일한 표다. 발행본마다 하나이고, 상태는 C-02 이름(`PENDING`·`DONE`·`FAILED`), 처리 시한은 10분, 항목은 게이트가 돌려준 `GatedItem` 그대로다. 발행본을 따라 연쇄 삭제된다.
- **질문 횟수**는 Redis 키 `qna-question-count:{publicationId}:{한국 시간 날짜}`이고 다음 한국 시간 자정에 만료된다. 키 구분자의 콜론은 Redis 키라 문제 없다(BullMQ 작업 ID가 아니다).
- **질의응답 값 객체**: 질문 500자, 앞 대화 최근 6개·메시지마다 2,000자, SSE 이벤트 `item`·`done`·`error`. 대화는 서버에 저장하지 않는다.
- **기본 요약 근거(SummarySource)** 는 색인이 아니라 사본 필드 하나를 근거 하나로 만든다. AI 설명 초안·제목은 넣지 않는다.
- **평가 값 객체**는 저장소 밖 로컬 입력·결과와 `docs/`의 건수·위치·판정 기록으로 나뉜다.
