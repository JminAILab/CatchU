# U3 발행본 색인·검색 — 업무 규칙

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U3, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US4.1·US6.2, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US4.1·US6.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR4.7·FR6.2·FR6.4·FR6.8·FR14.8·FR14.10·NFR2, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 PublishedIndex, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-005·ADR-007, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06·C-07·C-08·C-09와 「에러 대응 최소선」, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q4, [엔티티](entities.md).

## 규칙

`source`의 Q는 [기능 설계 질문·답변](functional-design-questions.md)의 질문 번호다. 링크 조건 판정(C-10), 작성자 확인과 [검색 다시 준비] 버튼·HTTP 경로, 발행 크기 재확인(FR4.7)은 U4 규칙이라 여기에 없다.

```yaml
rules:
  # BR1 발행 트랜잭션 안의 조각 나누기(chunkInTransaction, C-08)
  - id: BR1.1
    statement: 조각은 C-07이 정한 사본 필드에서만 만들고, AI 설명 초안과 제목은 넣지 않는다
    category: constraint
    applies_to: PublishedChunk.fieldPath
    trigger: chunkInTransaction 호출 때 항목마다
    logic: IF 항목이 CATCH면 THEN workFacts[i](i 순서), subjectContribution, evidence[i].representedFacts[j](i, j 순서), authorDescription(null이 아닐 때) 순서로 필드를 고른다. IF TEXT_MATERIAL이면 THEN body. IF PDF_MATERIAL이면 THEN 읽을 수 있는 쪽의 pages[n](n 오름차순). aiDraft·mismatch·evidence의 sourceUrl·sourceRevision, 항목 제목, 발행본 제목은 고르지 않는다
    violation: 해당 없음(고르기 규칙). 사본에 정해진 필드 모양이 없으면 BR1.7의 예외
    source: FR4.7, FR6.2, FR6.4, C-07 fieldPath, C-09 publicationText
  - id: BR1.2
    statement: 조각 글은 필드 문자열의 [charStart, charEnd) 부분 그대로이고 위치는 UTF-16 코드 단위다
    category: constraint
    applies_to: PublishedChunk.text, charStart, charEnd
    trigger: 조각을 만들 때
    logic: 조각 글은 필드 문자열을 그 범위로 자른 것과 글자 하나까지 같다. 공백·줄바꿈을 바꾸거나 정리하지 않는다. 범위의 양 끝은 BR1.4로만 좁힌다
    violation: 저장 전 검사에서 다르면 예외(BR1.7)
    source: C-07 char-offset, C-07 chunk-text, C-01 location
  - id: BR1.3
    statement: 필드 하나가 조각 하나이고, 1,000자를 넘는 필드만 문단 → 줄 → 1,000자 자리 순으로 나눈다
    category: calculation
    applies_to: ChunkDraft
    trigger: 필드마다
    logic: >
      IF 필드 길이(UTF-16)가 1,000 이하면 THEN 범위 하나. 그렇지 않으면 빈 줄(공백 문자만 있는 줄)을 경계로 문단을 나누고,
      앞 문단부터 이어 붙인 범위가 1,000을 넘지 않을 때까지 한 조각에 모은다. 문단 하나가 1,000을 넘으면 그 문단을 줄바꿈 경계로 같은 방식으로 모으고,
      줄 하나가 1,000을 넘으면 1,000자 자리에서 자른다. 자르는 자리가 UTF-16 대리쌍 가운데면 한 칸 앞에서 자른다. 조각끼리 겹치지 않는다
    violation: 해당 없음(계산 규칙)
    source: Q1
  - id: BR1.4
    statement: 조각 범위의 앞뒤 공백은 범위에서 빼고, 공백만 남는 범위는 조각을 만들지 않는다
    category: constraint
    applies_to: ChunkDraft
    trigger: BR1.3으로 범위를 정한 뒤
    logic: IF 범위의 앞이나 뒤가 공백 문자(줄바꿈 포함)면 THEN 그만큼 범위를 좁힌다(글은 바꾸지 않음). IF 좁힌 범위가 비면 THEN 그 범위는 버린다
    violation: 해당 없음
    source: Q1, C-07 chunk-text
  - id: BR1.5
    statement: PDF는 발행본 소유 사본의 읽을 수 있는 쪽만 조각으로 만든다
    category: constraint
    applies_to: PublishedChunk.pdfPage
    trigger: PDF_MATERIAL 항목
    logic: published_pdf_page에서 readable이 참인 쪽만 쓴다. fieldPath는 pages[n], pdfPage는 n이며 위치는 그 쪽 text 기준이다. 자료 원본(Materials)은 읽지 않는다
    violation: 해당 없음
    source: FR3.4, FR4.7, ADR-005, C-07(PDF 부분은 후순위)
  - id: BR1.6
    statement: 출처 종류는 필드로 정한다
    category: calculation
    applies_to: PublishedChunk.sourceKind
    trigger: 조각을 만들 때
    logic: CATCH의 workFacts·subjectContribution·evidence = GITHUB_RECORD, CATCH의 authorDescription·TEXT_MATERIAL·PDF_MATERIAL = AUTHOR_MATERIAL
    violation: 해당 없음
    source: C-07 sourceKind-rule, FR6.5
  - id: BR1.7
    statement: 조각 나누기는 U4가 넘긴 트랜잭션 안에서만 하고 외부 호출을 하지 않으며, 실패하면 예외를 던진다
    category: policy
    applies_to: chunkInTransaction
    trigger: chunkInTransaction 호출
    logic: 넘겨받은 manager로 published_item·published_pdf_page를 읽고 published_chunk·publication_index를 쓴다. Voyage·큐를 부르지 않는다. IF 읽기·쓰기 실패, 사본 모양이 C-07과 다름, 위치 검사(BR1.2) 불일치 중 하나면 THEN 예외를 던진다
    violation: U4가 트랜잭션 전체를 되돌린다 = 발행 실패, 어떤 Catch도 공개로 바뀌지 않는다
    source: FR4.7, ADR-005, C-08, AC4.1.8
  - id: BR1.8
    statement: 조각과 함께 색인 상태 행을 PENDING, 마감 = 발행 시각 + 10분으로 만든다
    category: policy
    applies_to: PublicationIndex
    trigger: chunkInTransaction 안, 조각 쓰기 뒤
    logic: publication_index(status PENDING, deadline_at = now + 10분, updated_at = now)를 쓴다. 조각이 0개여도 만든다
    violation: 쓰기 실패는 BR1.7
    source: C-02 row-creation, C-08, Q3
  - id: BR1.9
    statement: 조각 순서(seq)는 항목 position → 필드 순서(BR1.1) → 필드 안 위치 순서로 1부터 매긴다
    category: calculation
    applies_to: PublishedChunk.seq
    trigger: 조각을 쓸 때
    logic: 같은 발행본을 다시 나누면 같은 순서가 나온다. publicationText와 같은 점수의 검색 결과 순서에 쓴다
    violation: 해당 없음
    source: C-09 publicationText, ADR-005(조각이 발행과 함께 확정)
  - id: BR1.10
    statement: CATCH 조각에는 그 항목 사본의 근거 URL 목록을 발행 트랜잭션 안에서 함께 저장한다
    category: calculation
    applies_to: PublishedChunk.catchEvidenceUrls
    trigger: 조각을 쓸 때
    logic: IF 항목이 CATCH면 THEN 사본 snapshot.evidence[].sourceUrl을 순서대로 그 항목의 모든 조각에 저장한다. 아니면 빈 배열. 검색(BR5.8)은 이 칸만 읽으므로 U3은 발행 트랜잭션 밖에서 published_item을 읽지 않는다
    violation: 해당 없음
    source: C-09 ChunkHit.catchEvidenceUrls, C-07(U3은 발행 트랜잭션 안에서만 발행본 표를 읽음), C-01 AiSource

  # BR2 임베딩 작업(EMBED_PUBLICATION 처리기, C-02)
  - id: BR2.1
    statement: 처리기는 시작할 때 색인 행이 PENDING이고 마감 전일 때만 일한다
    category: policy
    applies_to: EMBED_PUBLICATION 처리기
    trigger: 작업 실행
    logic: IF publication_index 행이 없거나(발행본 삭제) status가 PENDING이 아니거나 now >= deadline_at이면 THEN 아무것도 쓰지 않고 끝낸다(마감 지난 PENDING은 BR3.1로 FAILED 저장)
    violation: 해당 없음(버림은 오류가 아니다). 로그에 발행본 ID와 버린 이유만 남긴다
    source: C-02 late-result, FR14.10
  - id: BR2.2
    statement: 조각이 0개인 발행본은 Voyage를 부르지 않고 DONE이 된다
    category: policy
    applies_to: PublicationIndex.status
    trigger: BR2.1을 통과하고 조각이 0개일 때
    logic: status = 'PENDING'이고 마감 전일 때만 DONE으로 조건부 UPDATE한다
    violation: 해당 없음
    source: 요약 확인(질문 없이 정한 단순한 안)
  - id: BR2.3
    statement: 조각 임베딩은 voyage-4-lite 문서용 입력, 1024차원으로 만들고 차원이 다르면 실패로 본다
    category: constraint
    applies_to: PublishedChunk.embedding
    trigger: embedDocuments 호출
    logic: 조각 글을 seq 순서로 제공자 한 번 호출 상한 안의 묶음으로 나눠 보낸다. IF 돌아온 벡터 개수가 보낸 개수와 다르거나 길이가 1024가 아니면 THEN 제공자 실패로 본다
    violation: BR2.5
    source: FR6.2, NFR2, Q2
  - id: BR2.4
    statement: 임베딩은 발행본 단위로 한 번에 저장한다(부분 완료 없음)
    category: policy
    applies_to: PublishedChunk.embedding, PublicationIndex.status
    trigger: 모든 묶음의 임베딩을 받은 뒤
    logic: 한 트랜잭션에서 색인 행을 잠그고 다시 확인한다. IF 행이 있고 PENDING이고 now < deadline_at이면 THEN 모든 조각의 embedding과 status DONE을 함께 쓰고 커밋한다. 그렇지 않으면 아무것도 쓰지 않고 버린다
    violation: 저장 거부(부모 없음 포함)는 다시 시도하지 않고 버린다
    source: C-02 late-result, FR14.10, 에러 대응 최소선 4·5, 요약 확인
  - id: BR2.5
    statement: 임베딩 호출이 하나라도 실패하면 색인을 FAILED로 쓰고 다시 시도하지 않는다
    category: policy
    applies_to: PublicationIndex.status
    trigger: 제공자 오류, 시간 초과, BR2.3 불일치
    logic: >
      status = 'PENDING'일 때만 FAILED로 조건부 UPDATE하고 updated_at을 쓴다. 이미 받은 묶음의 벡터는 버린다. 자동 재시도·중간 재개는 없다.
      처리기가 DB 오류 등 예기치 못한 오류를 만나면 발행본 ID와 오류 종류만 로그에 남기고 던지며, 상태는 마감 판정(BR3.1)에 맡긴다
    violation: 작성자에게 [검색 다시 준비]가 보인다(U4, ADR-007)
    source: FR6.8, ADR-007, 에러 대응 최소선 1·2
  - id: BR2.6
    statement: 같은 발행본에 임베딩 작업이 겹쳐 돌아도 따로 막지 않는다
    category: policy
    applies_to: EMBED_PUBLICATION 처리기
    trigger: [검색 다시 준비] 뒤 이전 작업이 늦게 끝남
    logic: >
      BR2.4의 다시 확인을 통과한 쪽이 저장한다. 조각과 모델이 같아 같은 벡터이며 피해는 임베딩 호출 1회 중복이다.
      이전 작업이 늦게 실패하면 다시 준비로 새로 PENDING이 된 행을 BR2.5가 FAILED로 만들 수 있고, 그러면 새 작업의 결과도 BR2.4에서 버려져 작성자가 다시 눌러야 한다
    violation: 해당 없음(한계로 적음)
    source: 에러 대응 최소선 6

  # BR3 색인 상태(getIndexState, C-09)
  - id: BR3.1
    statement: 상태를 읽을 때 마감이 지난 PENDING은 FAILED로 판정하고 저장한다
    category: calculation
    applies_to: getIndexState
    trigger: getIndexState·search 호출
    logic: C-02 readStatus로 판정한다. IF 행이 PENDING이고 now >= deadline_at이면 THEN FAILED를 돌려주고, status = 'PENDING'일 때만 FAILED로 조건부 UPDATE한다
    violation: 해당 없음
    source: C-02 readStatus, FR6.8, ADR-005
  - id: BR3.2
    statement: 색인 행이 없는 발행본은 FAILED로 돌려준다
    category: policy
    applies_to: getIndexState
    trigger: 행이 없을 때
    logic: 행을 만들지 않고 FAILED를 돌려준다. 실제 발행에서는 BR1.8로 행이 항상 있으므로 이 경우는 U4 합성 구현이나 시험 자료에서만 생긴다
    violation: 해당 없음
    source: C-02("대기"에 영원히 남지 않음)
  - id: BR3.3
    statement: 상태 이름은 PENDING · DONE · FAILED 하나로 쓴다
    category: constraint
    applies_to: PublicationIndex.status, IndexState
    trigger: 표·반환·로그
    logic: 다른 이름(대기·완료·실패의 영문 변형)을 쓰지 않는다. 화면 문구는 U4·U5가 정한다
    violation: 해당 없음
    source: C-02 status-names

  # BR4 [검색 다시 준비](requestReindex, C-08, ADR-007)
  - id: BR4.1
    statement: 다시 준비는 FAILED일 때만 받아 PENDING, 마감 = 접수 시각 + 10분으로 돌린다
    category: policy
    applies_to: requestReindex
    trigger: U4가 작성자 확인 뒤 호출
    logic: 먼저 BR3.1로 현재 상태를 판정한다. IF FAILED면 THEN status = 'FAILED'일 때만 조건부 UPDATE로 PENDING, deadline_at = now + 10분, updated_at = now를 쓰고 커밋한 뒤 REQUEUED를 돌려준다. 그 밖(PENDING·DONE·행 없음, UPDATE된 행 0개)이면 NOT_FAILED
    violation: NOT_FAILED는 U4가 화면에 알린다
    source: ADR-007, C-08, Q3
  - id: BR4.2
    statement: 다시 준비는 임베딩만 새 runKey로 다시 등록하고 하루 실행 제한에 세지 않는다
    category: policy
    applies_to: requestReindex
    trigger: BR4.1의 커밋 뒤
    logic: AiRun.enqueueAfterCommit(EMBED_PUBLICATION, "EMBED_PUBLICATION-{publicationId}-{새 uuid}", { publicationId }). 조각은 다시 나누지 않는다. DailyRunLimit를 부르지 않는다. IF 등록이 ENQUEUE_FAILED면 THEN 로그만 남기고 REQUEUED를 그대로 돌려준다(시한으로 FAILED 확정)
    violation: 해당 없음
    source: ADR-007, C-02 runKey, C-03, 에러 대응 최소선 2·3

  # BR5 의미 검색(search, C-09)
  - id: BR5.1
    statement: 색인이 DONE이 아니면 검색하지 않고 IndexNotReady를 던진다
    category: policy
    applies_to: search
    trigger: search 호출
    logic: BR3.1로 판정한 상태가 PENDING·FAILED면 Voyage를 부르지 않고 IndexNotReady
    violation: 호출자는 409 INDEX_NOT_READY("아직 쓸 수 없음")로 바꾼다(U5·U10)
    source: C-09, ADR-005
  - id: BR5.2
    statement: 찾는 범위는 그 발행본의 조각뿐이다
    category: authorization
    applies_to: search
    trigger: search 호출
    logic: publication_id가 넘겨받은 값인 조각만 비교한다. 자료를 빼는 선택 인자는 없다. 링크 조건 판정은 호출자가 먼저 한다(C-10)
    violation: 해당 없음
    source: FR4.4, FR6.2, FR6.3, AC6.2.3, AC6.2.7, NFR1
  - id: BR5.3
    statement: 질문은 voyage-4-lite 질문용 입력으로 임베딩하고, 실패하면 로그를 남기고 그대로 던지며 다시 시도하지 않는다
    category: policy
    applies_to: search
    trigger: embedQuery 호출
    logic: IF 제공자 오류·시간 초과·차원 불일치면 THEN 발행본 ID와 오류 종류만 로그에 남기고 제공자 오류를 그대로 던진다. 새 오류 이름은 두지 않는다
    violation: U5·U10이 IndexNotReady가 아닌 예외를 자기 기능의 일반 실패로 처리한다. 계약 C-09는 바꾸지 않는다
    source: Q4, 에러 대응 최소선 1·2
  - id: BR5.4
    statement: 결과는 코사인 거리가 가까운 순으로 limit개이며 점수는 1 - 코사인 거리다
    category: calculation
    applies_to: SearchResult.hits
    trigger: 질문 임베딩 뒤
    logic: 발행본 안 모든 조각과 정확히 비교한다(근사 색인 없음). 점수 내림차순, 같으면 seq 오름차순. 조각이 limit보다 적으면 있는 만큼
    violation: 해당 없음
    source: FR6.2(의미 검색으로만 고름), Q2, 요약 확인
  - id: BR5.5
    statement: limit는 1 이상 50 이하의 정수만 받는다
    category: validation
    applies_to: search(limit)
    trigger: search 호출
    logic: IF limit가 정수가 아니거나 범위 밖이면 THEN Voyage를 부르지 않고 인자 오류를 던진다
    violation: 호출 Unit의 프로그램 오류로 본다(사용자 입력이 아님)
    source: C-09 search(limit), 개발 담당 결정(상한 값)
  - id: BR5.6
    statement: 공백뿐인 질문은 Voyage를 부르지 않고 빈 결과를 돌려준다
    category: validation
    applies_to: search(query)
    trigger: search 호출
    logic: IF query가 비었거나 공백뿐이면 THEN hits = [], publicationText는 그대로 돌려준다
    violation: 해당 없음
    source: 에러 대응 최소선 1(불필요한 외부 호출을 실패처럼 숨기지 않음)
  - id: BR5.7
    statement: publicationText는 그 발행본 조각 글 전부를 seq 순서로 줄바꿈 하나로 이어 붙인 글이다
    category: calculation
    applies_to: SearchResult.publicationText
    trigger: search 호출(색인 DONE)
    logic: 조각 나누기 대상과 같은 범위라 aiDraft·제목이 없다. C-01 검사에만 쓰인다
    violation: 해당 없음
    source: C-09 publicationText, C-01 check-scope
  - id: BR5.8
    statement: 검색 결과의 catchEvidenceUrls는 조각에 저장한 칸을 그대로 쓴다
    category: calculation
    applies_to: ChunkHit.catchEvidenceUrls
    trigger: 결과를 만들 때
    logic: published_chunk.catchEvidenceUrls(BR1.10)를 그대로 옮긴다. published_item·snapshot을 읽지 않는다
    violation: 해당 없음
    source: C-09 ChunkHit, C-07 읽기 범위, C-01 AiSource.catchEvidenceUrls

  # BR6 설정·비밀값·기록
  - id: BR6.1
    statement: Voyage 키는 CATCHU_EMBEDDING_API_KEY에서만 읽고, 개발·시험이 아닌 환경에서 키가 없으면 기동을 멈춘다
    category: policy
    applies_to: EmbeddingSettings.apiKey
    trigger: api 기동
    logic: IF NODE_ENV가 development·test가 아니고 키가 비었으면 THEN 기동 오류. IF development·test이고 키가 비었으면 THEN 합성 제공자를 쓰고 기동 로그에 한 줄 알린다. SDK가 스스로 읽는 VOYAGE_API_KEY는 쓰지 않는다
    violation: 합성 제공자의 결과를 실제 임베딩 성공으로 보고하지 않는다
    source: C07, api/.env.example(#389), team.md Walking Skeleton·Code Style
  - id: BR6.2
    statement: 키·조각 글·질문 글은 로그·오류 메시지에 남기지 않는다
    category: policy
    applies_to: 모든 로그
    trigger: 로그·예외 생성
    logic: 로그에는 발행본 ID, 조각 개수, 상태, 오류 종류·HTTP 상태만 남긴다
    violation: 해당 없음
    source: team.md Code Style, NFR1, NFR2
```

## 규칙 요약

| 묶음 | 규칙 | 한 줄 요약 |
|---|---|---|
| BR1 조각 나누기 | BR1.1~BR1.10 | C-07 필드만, 원문 그대로, 1,000자 넘는 필드만 문단→줄→자리로 나눔, 앞뒤 공백 제외, PDF는 읽을 수 있는 사본 쪽만, 출처 종류는 필드로, 발행 트랜잭션 안·외부 호출 없음·실패면 예외, 색인 행 PENDING+10분, seq 순서, CATCH 조각에 근거 URL 함께 저장 |
| BR2 임베딩 작업 | BR2.1~BR2.6 | PENDING·마감 전에만 일함, 조각 0개면 바로 DONE, voyage-4-lite 1024차원 검사, 발행본 단위 한 번에 저장, 하나라도 실패면 FAILED·재시도 없음, 예기치 못한 오류는 로그 뒤 던지고 마감 판정에 맡김, 겹침은 막지 않음(늦은 실패 한계 포함) |
| BR3 색인 상태 | BR3.1~BR3.3 | 마감 지난 PENDING은 읽을 때 FAILED 저장, 행 없으면 FAILED, 상태 이름 하나 |
| BR4 다시 준비 | BR4.1~BR4.2 | FAILED일 때만 PENDING+10분, 임베딩만 새 runKey로, 하루 제한 없음 |
| BR5 의미 검색 | BR5.1~BR5.8 | DONE 아니면 IndexNotReady, 그 발행본 조각만, 질문 임베딩 실패는 그대로 던짐, 코사인 정확 검색, limit 1~50, 빈 질문은 빈 결과, publicationText 계산, catchEvidenceUrls는 조각 칸 그대로 |
| BR6 설정·기록 | BR6.1~BR6.2 | 키는 CATCHU_EMBEDDING_API_KEY만, 개발·시험 밖에서 키 없으면 기동 중지, 키·글을 로그에 남기지 않음 |
