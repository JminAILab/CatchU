# U3 발행본 색인·검색 — 기능 설계 질문

입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)의 U3, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(US4.1의 조각 나누기, US6.2의 색인 상태·검색), [사용자 스토리](../../../inception/user-stories/stories.md)의 US4.1·US6.2, [요구사항](../../../inception/requirements-analysis/requirements.md)의 FR4.7·FR6.2·FR6.4·FR6.8·NFR2와 「개발 담당 결정」, [컴포넌트 목록](../../../inception/domain-design/components.md)의 PublishedIndex, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-005·ADR-007, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-02·C-06·C-07·C-08·C-09, [납품 계획](../../../inception/delivery-planning/bolt-plan.md)의 B3.

이미 정해진 것(다시 묻지 않음): 조각 나누기·위치 기록은 U4가 연 발행 트랜잭션 안에서 `chunkInTransaction`으로 하고 외부 호출이 없다(C-08, ADR-005). 임베딩은 커밋 뒤 `EMBED_PUBLICATION` 작업으로 하고 상태는 `PENDING | DONE | FAILED`, 처리 시한은 상태를 읽을 때 판정한다(C-02). 조각 글은 snapshot 필드 문자열의 `[charStart, charEnd)` 부분 그대로이며 위치는 UTF-16 코드 단위다(C-07). 조각 대상 필드와 출처 종류는 C-07 `fieldPath`·`sourceKind-rule`이고, AI 설명 초안(`aiDraft`)과 제목은 넣지 않는다(FR6.4). [검색 다시 준비]는 실패 상태에서만 받고 하루 제한에 세지 않으며, 작성자 확인·버튼·HTTP 경로는 U4다(ADR-007, C-08). 벡터 저장소는 PostgreSQL pgvector, 임베딩은 Voyage AI다(C02). 로컬·시험은 합성 임베딩 제공자로 돈다(C07).

## Q1. [설계] 조각을 나누는 규칙

계약 C-07은 조각이 가리킬 필드(`workFacts[i]`, `subjectContribution`, `evidence[i].representedFacts[j]`, `authorDescription`, 텍스트 자료 `body`, PDF `pages[n]`)와 "조각 글은 원문 그대로"만 정했고, 한 필드를 몇 조각으로 나눌지는 정하지 않았다. Catch의 기록 필드는 짧지만 작성자 설명과 텍스트 자료 본문은 길 수 있다.

A. 필드 하나를 조각 하나로 하고, 정한 길이(1,000자, UTF-16 기준)를 넘는 필드만 빈 줄(문단) 경계에서 나눈다. 그래도 긴 문단은 줄바꿈에서, 줄바꿈도 없으면 1,000자 자리에서 자른다. 조각끼리 겹치지 않는다. 공백뿐인 부분은 조각을 만들지 않는다.
B. 필드와 상관없이 고정 길이 창(예: 800자, 200자 겹침)으로 나눈다 — 문맥이 끊기는 일이 조금 줄 수 있지만, 같은 글이 두 조각에 들어가 인용 위치가 겹치고 위치 계산·시험이 는다.
C. 필드 하나를 조각 하나로 하고 나누지 않는다 — 가장 단순하지만 긴 텍스트 자료가 통째로 한 조각이 되어 검색이 거칠고, 아주 길면 Voyage 입력 상한에 닿을 수 있다.
X. Other (please specify)

[Answer]: A

## Q2. [설계] Voyage 임베딩 모델과 벡터 차원

요구사항은 Voyage 모델 선택과 자료 보존·학습 사용 조건 확인을 개발 담당 결정으로 남겼고(「개발 담당 결정」, NFR2), 계약 요약은 모델·차원을 U3 기능 설계에서 정하라고 했다(C-09 미결). 차원은 `published_chunk`의 벡터 칸 모양이 되므로 나중에 바꾸려면 마이그레이션과 전체 다시 임베딩이 든다. 발행 문서는 한국어가 섞인다.

A. `voyage-3.5-lite`, 1024차원, 코사인 거리. 가장 싸고 시연 규모(소수 발행본, 질문 10개 평가)에 충분하다. 코드 착수 때 Voyage 공식 문서로 모델 이름·차원을 다시 확인하고, 자료 보존·학습 사용 조건(대시보드의 학습 사용 거부 설정 여부)을 확인해 결과를 이 설계에 적는다.
B. `voyage-3.5`, 1024차원, 코사인 거리 — 검색 품질이 조금 나을 수 있지만 값이 몇 배다. 확인 절차는 A와 같다.
C. 더 큰 모델(예: `voyage-3-large`) — 시연 규모에 비해 비싸다.
X. Other (please specify)

[Answer]: X. A안과 같되 모델은 최신 세대인 voyage-4-lite로 한다(1024차원, 코사인 거리, 값은 voyage-3.5-lite와 같음). 착수 때 공식 문서로 이름·차원과 자료 보존·학습 사용 조건을 다시 확인해 설계에 적는 것은 그대로 둔다.

## Q3. [설계] 임베딩 처리 시한

발행 뒤 이 시간 안에 색인이 `DONE`이 되지 않으면 상태를 읽을 때 `FAILED`로 확정하고, 작성자에게 [검색 다시 준비]가 보인다(C-02, ADR-007). 너무 짧으면 큐가 잠깐 밀린 것만으로 실패가 되고, 너무 길면 작업이 사라졌을 때 받은 사람이 오래 "아직 쓸 수 없음"을 본다. 값은 개발 담당 결정이다(C-02 미결).

A. 10분. 시연 규모 발행본의 임베딩은 보통 수 초~수십 초라 여유가 있고, 작업이 사라져도 10분 뒤 다시 준비할 수 있다.
B. 30분 — 큐 지연에 더 너그럽지만 실패를 알기까지 오래 걸린다.
C. 3분 — 실패를 빨리 알지만 큐가 잠깐 밀려도 실패가 될 수 있다.
X. Other (please specify)

[Answer]: A

## Q4. [설계] 검색 중 Voyage 질문 임베딩이 실패할 때

`search`는 질문 글을 Voyage로 임베딩한 뒤 조각을 찾는다. 계약 C-09의 오류는 `IndexNotReady`(색인 준비 전·실패) 하나뿐이고, 질문 임베딩 호출 자체가 실패하는 경우는 적혀 있지 않다. 이 오류를 받는 쪽은 U5(질의응답)·U10(JD 요약)이다.

A. 새 오류 이름을 만들지 않는다. 제공자 오류를 로그에 남기고 그대로 예외로 던지며 자동 재시도하지 않는다. U5·U10은 `IndexNotReady`가 아닌 예외를 자기 기능의 일반 실패로 처리한다. 계약은 바꾸지 않는다.
B. C-09에 `EmbeddingUnavailable` 오류를 더하는 계약 수정 PR을 내고, 호출자가 별도 응답 코드로 바꾼다 — 받은 사람에게 "잠시 뒤 다시"를 따로 보일 수 있지만 계약 PR과 U5·U10의 처리·시험이 는다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 조각 규칙(Q1 A): 필드 하나가 조각 하나다. 1,000자(UTF-16)를 넘는 필드만 빈 줄(문단) 경계 → 줄바꿈 → 1,000자 자리 순으로 나눈다. 조각끼리 겹치지 않고, 공백뿐인 부분은 조각을 만들지 않는다. 조각 글은 원문 그대로이고 위치는 C-07 `fieldPath`·UTF-16 `[charStart, charEnd)`다.
- 임베딩 모델(Q2): `voyage-4-lite`, 1024차원, 코사인 거리. 코드 착수 때 Voyage 공식 문서로 모델 이름·차원과 자료 보존·학습 사용 조건을 다시 확인해 이 설계에 적는다.
- 처리 시한(Q3 A): 임베딩 처리 시한은 10분. 발행 때와 [검색 다시 준비] 접수 때 `deadline_at = 그 시각 + 10분`.
- 검색 중 질문 임베딩 실패(Q4 A): 새 오류 이름 없이 로그를 남기고 제공자 오류를 그대로 던지며 재시도하지 않는다. U5·U10은 `IndexNotReady`가 아닌 예외를 일반 실패로 처리한다. 계약 C-09는 바꾸지 않는다.
- 질문하지 않고 가장 단순한 안으로 정한 것: 임베딩은 발행본 단위 한 번에 처리해, 모두 성공하면 벡터 저장과 `DONE`을 한 트랜잭션으로 쓰고 하나라도 실패하면 `FAILED`로 쓴다(부분 완료 없음). 벡터 근사 색인(HNSW 등)은 두지 않고 발행본 안에서 정확 검색한다(발행본당 조각 수백 개 수준). 조각이 0개인 발행본은 임베딩 작업이 Voyage를 부르지 않고 바로 `DONE`이 된다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
