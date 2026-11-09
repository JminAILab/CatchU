# U3 발행본 색인·검색 — 엔티티

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U3, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US4.1·US6.2, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US4.1·US6.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR4.7·FR6.2·FR6.4·FR6.8·FR14.8·FR14.10·NFR2, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 PublishedIndex, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-005·ADR-007, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06·C-07·C-08·C-09, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q4.

## 범위

U3이 소유하는 표는 `publication_index`(발행본마다 색인 상태 하나)와 `published_chunk`(발행 사본의 조각과 임베딩) 둘이다(components Entity Ownership). 읽기만 하는 `publication`·`published_item`·`published_pdf_page`는 C-07 모양 그대로이며 여기서 다시 정의하지 않는다. 그 밖은 저장하지 않는 값 객체(계약 C-08·C-09의 입력·반환과 임베딩 제공자 경계)다. 자료형은 논리 자료형이며 특정 언어·DB 문법을 가리키지 않는다. 벡터 칸은 "1024개 실수 벡터"로 적는다(Q2).

```yaml
entities:
  # ---- 저장하는 엔티티(U3 소유) ----
  - name: PublicationIndex
    table: publication_index
    description: 발행본 하나의 색인 상태와 처리 시한. 발행 트랜잭션 안에서 만들어지고 발행본과 같은 수명이다(C-02, C-08, ADR-005)
    identifier: publicationId
    attributes:
      - { name: publicationId, type: uuid, required: true, unique: true, references: "Publication.publicationId (ON DELETE CASCADE)", constraints: "기본 키" }
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED], default: PENDING, constraints: "C-02 table-convention 이름 그대로" }
      - { name: deadlineAt, type: timestamp-with-zone, required: true, constraints: "접수 시각 + 임베딩 처리 시한 10분(Q3). 발행 때와 [검색 다시 준비] 접수 때 새로 쓴다" }
      - { name: updatedAt, type: timestamp-with-zone, required: true, constraints: "상태를 쓸 때마다 그 시각" }
    entity_constraints:
      - "발행본 하나에 행 하나(publicationId가 기본 키)"
      - "status는 PENDING→DONE, PENDING→FAILED, FAILED→PENDING(다시 준비)만 바뀐다. DONE은 바뀌지 않는다(functional-spec 상태 전이)"
    relationships:
      - { to: Publication, cardinality: "1:1", direction: "PublicationIndex → Publication", owned_by: Publication, note: "발행본 삭제·작성자 탈퇴 때 연쇄 삭제(C-06)" }

  - name: PublishedChunk
    table: published_chunk
    description: 발행 사본 한 필드의 한 부분. 글은 그 필드 문자열의 [charStart, charEnd) 그대로이고 임베딩은 발행 뒤 채워진다(C-07, C-08, FR4.7)
    identifier: chunkId
    attributes:
      - { name: chunkId, type: uuid, required: true, unique: true, constraints: "기본 키. 검색 결과의 chunkId이자 C-01 AiSource.sourceId" }
      - { name: publicationId, type: uuid, required: true, constraints: "복합 외래 키의 앞 칸" }
      - { name: publishedItemId, type: uuid, required: true, references: "(publicationId, publishedItemId) → PublishedItem(publicationId, publishedItemId) ON DELETE CASCADE", constraints: "C-06의 복합 외래 키. 다른 발행본의 항목을 가리킬 수 없다" }
      - { name: seq, type: integer, required: true, min: 1, constraints: "발행본 안 조각 순서. (publicationId, seq) 유일. 항목 순서 → 필드 순서 → 필드 안 위치 순서(BR1.9)" }
      - { name: fieldPath, type: string, required: true, constraints: "C-07 fieldPath 형식만: workFacts[i] | subjectContribution | evidence[i].representedFacts[j] | authorDescription | body | pages[n]" }
      - { name: charStart, type: integer, required: true, min: 0, constraints: "fieldPath 문자열의 UTF-16 코드 단위, 포함" }
      - { name: charEnd, type: integer, required: true, constraints: "UTF-16 코드 단위, 제외. charStart보다 크고 charEnd - charStart <= 1000(Q1)" }
      - { name: pdfPage, type: integer, required: false, default: null, min: 1, constraints: "fieldPath가 pages[n]이면 n, 아니면 비움" }
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL], constraints: "C-07 sourceKind-rule" }
      - { name: text, type: string, required: true, constraints: "필드 문자열의 [charStart, charEnd) 그대로. 공백만으로 된 글은 없다(BR1.4)" }
      - { name: catchEvidenceUrls, type: list<string>, required: true, default: "[]", constraints: "발행 트랜잭션 안에서 함께 저장. 항목이 CATCH면 snapshot.evidence[].sourceUrl 목록(순서 그대로), 아니면 빈 배열(BR1.10). 검색은 이 칸을 그대로 읽는다" }
      - { name: embedding, type: "vector(1024)", required: false, default: null, constraints: "voyage-4-lite 문서 임베딩(Q2). 발행 때는 비어 있고 임베딩 작업이 한 번에 채운다" }
    entity_constraints:
      - "unique (publicationId, seq)"
      - "PublicationIndex.status가 DONE인 발행본의 조각은 모두 embedding이 있다(BR2.4)"
      - "Catch의 aiDraft·제목, 발행본 제목, 항목 제목은 조각이 되지 않는다(FR6.4, BR1.1)"
    relationships:
      - { to: PublishedItem, cardinality: "N:1", direction: "PublishedChunk → PublishedItem", owned_by: Publication, note: "복합 외래 키, 항목·발행본 삭제 때 연쇄 삭제" }
      - { to: Publication, cardinality: "N:1", direction: "PublishedChunk → Publication", owned_by: Publication, note: "PublishedItem을 거쳐 발행본 수명을 따른다" }

  # ---- 읽기만 하는 엔티티(U4·U8 소유, C-07 모양 그대로) ----
  - name: Publication
    description: 발행본. U3은 publicationId·publishedAt만 읽는다(C-07)
    owner: u4-publication-link
  - name: PublishedItem
    description: 발행본 항목. U3은 publishedItemId·position·itemKind·snapshot을 읽는다(C-07)
    owner: u4-publication-link
  - name: PublishedPdfPage
    description: PDF 항목의 쪽별 글 사본. U3은 pageNumber·text·readable을 읽는다(C-07, PDF 부분은 후순위)
    owner: u8-pdf-materials

  # ---- 저장하지 않는 값 객체 ----
  - name: ChunkDraft
    description: chunkInTransaction이 필드를 나눈 결과 한 칸. 저장 직전 PublishedChunk가 된다
    attributes:
      - { name: publishedItemId, type: uuid, required: true }
      - { name: fieldPath, type: string, required: true }
      - { name: charStart, type: integer, required: true }
      - { name: charEnd, type: integer, required: true }
      - { name: pdfPage, type: integer, required: false }
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL] }
      - { name: text, type: string, required: true }
      - { name: catchEvidenceUrls, type: list<string>, required: true, default: "[]" }
  - name: ChunkHit
    description: 검색 결과 한 칸(C-09 그대로). C-01 AiSource로 그대로 옮긴다(sourceId = chunkId)
    attributes:
      - { name: chunkId, type: uuid, required: true }
      - { name: publishedItemId, type: uuid, required: true }
      - { name: fieldPath, type: string, required: true }
      - { name: charStart, type: integer, required: true }
      - { name: charEnd, type: integer, required: true }
      - { name: pdfPage, type: integer, required: false }
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL] }
      - { name: text, type: string, required: true }
      - { name: score, type: number, required: true, constraints: "1 - 코사인 거리. 클수록 가깝다" }
      - { name: catchEvidenceUrls, type: list<string>, required: true, default: "[]", constraints: "PublishedChunk.catchEvidenceUrls 그대로(BR5.8). 검색 때 published_item을 읽지 않는다" }
  - name: SearchResult
    description: search()의 반환(C-09)
    attributes:
      - { name: hits, type: list<ChunkHit>, required: true, constraints: "score 내림차순, 같으면 seq 오름차순. 최대 limit개" }
      - { name: publicationText, type: string, required: true, constraints: "그 발행본 조각 글 전부를 seq 순서로 줄바꿈 하나로 이어 붙인 글. C-01 검사에만 쓴다" }
  - name: IndexState
    description: getIndexState()의 반환(C-09)
    allowed: [PENDING, DONE, FAILED]
  - name: ReindexResult
    description: requestReindex()의 반환(C-08)
    allowed: [REQUEUED, NOT_FAILED]
  - name: EmbeddingProvider
    description: 임베딩 제공자 경계(U3 안). 실제 구현은 Voyage, 시험·개발 구현은 합성 제공자다(C07)
    attributes:
      - { name: embedDocuments, type: "operation(list<string>) -> list<vector(1024)>", required: true, constraints: "조각 글을 문서용 입력으로. 입력 순서 그대로 같은 개수를 돌려준다" }
      - { name: embedQuery, type: "operation(string) -> vector(1024)", required: true, constraints: "질문 글을 질문용 입력으로" }
  - name: EmbeddingSettings
    description: 임베딩 설정 값(코드 상수와 환경변수)
    attributes:
      - { name: model, type: string, required: true, default: voyage-4-lite, constraints: "코드 착수 때 Voyage 공식 문서로 다시 확인(Q2)" }
      - { name: dimension, type: integer, required: true, default: 1024 }
      - { name: distance, type: enum, required: true, allowed: [COSINE], default: COSINE }
      - { name: processingDeadline, type: duration, required: true, default: 10분, constraints: "Q3" }
      - { name: maxChunkLength, type: integer, required: true, default: 1000, constraints: "UTF-16 코드 단위(Q1)" }
      - { name: apiKey, type: secret, required: false, constraints: "환경변수 CATCHU_EMBEDDING_API_KEY만 읽는다. 로그·오류·응답에 싣지 않는다" }
```

## 요약

- **PublicationIndex**: 발행본마다 하나. `PENDING`으로 태어나 임베딩 작업이 `DONE` 또는 `FAILED`로 바꾸고, 시한(10분)이 지난 `PENDING`은 읽을 때 `FAILED`가 된다. `FAILED`일 때만 [검색 다시 준비]로 `PENDING`에 돌아간다.
- **PublishedChunk**: 발행 사본 필드의 원문 부분 하나. 위치(`fieldPath`·UTF-16 범위·PDF 쪽)와 출처 종류, Catch 조각이면 그 Catch의 근거 URL 목록을 발행 때 함께 갖고, 임베딩은 발행 뒤 한 번에 채운다. 그래서 검색은 발행 트랜잭션 밖에서 `published_item`을 읽지 않는다(C-07 읽기 범위 그대로). `(publication_id, published_item_id)` 복합 외래 키로 같은 발행본의 항목만 가리키며 발행본과 함께 지워진다.
- **값 객체**: 나누기 중간 결과(ChunkDraft), 계약 반환(ChunkHit·SearchResult·IndexState·ReindexResult), 임베딩 제공자 경계와 설정 값.
