# U3 발행본 색인·검색 — 성능 설계

## Sources

작성일: 2026-10-28. 입력: [성능 요구사항](../nfr-requirements/performance-requirements.md)(performance-requirements)의 NFR4.1~NFR4.3, [보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1·W2·W5, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-08·C-09, [비기능 설계 질문·답변](nfr-design-questions.md).

## 범위

NFR4는 응답 시간 목표를 새로 만들지 않는다. 성능 설계는 외부 호출이 끝없이 기다리지 않게 하는 상한, 부르지 않아도 되는 호출을 하지 않는 순서, DB 연결을 오래 붙잡지 않는 트랜잭션 경계 세 가지다.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.1 시간 제한·묶음 | 호출마다 `AbortSignal.timeout`(문서 30초·질문 10초)을 건다(security-design ④). 처리기는 `seq` 순 조각을 128개씩 잘라 차례로 보낸다. 묶음을 동시에 보내지 않는다. 시연 규모에서는 묶음이 몇 개뿐이라 차례로 보내도 처리 시한 10분 안에 들고, 한 묶음이 실패하면 남은 호출을 그 자리에서 멈출 수 있기 때문이다. 시간 초과는 `TIMEOUT` 제공자 오류이며 다시 보내지 않는다. 묶음 크기 128은 상수 하나로 두고, 코드 착수 때 Voyage 한 번 호출 상한보다 크면 그 상수만 줄인다 |
| NFR4.2 처리 시한 10분 | 마감은 `chunkInTransaction`·`requestReindex`가 `now + 10분`으로 쓴다. 처리기는 시작할 때와 저장 트랜잭션 안에서 마감을 다시 본다(reliability-design). 그 밖의 처리 시간 목표나 묶음 사이 마감 검사는 두지 않는다 |
| NFR4.3 부르지 않는 호출 | `search`는 인자 검사 → 상태 판정 → 빈 질문 검사를 모두 통과한 뒤에만 `embedQuery`를 부른다. `chunkInTransaction`은 조각 나누개(순수 함수)와 DB 쓰기만 하고 Voyage·큐를 부르지 않는다. S1·S9·S10에서 제공자 호출 횟수를 센다 |

## 트랜잭션 경계

외부 호출 중에는 DB 트랜잭션을 열어 두지 않는다. 연결 묶음(TypeORM)은 api 전체가 함께 쓰기 때문이다.

| 일 | 트랜잭션 |
|---|---|
| W1 조각 나누기 | U4의 발행 트랜잭션 안. 외부 호출 없음 |
| W2 1~2단계(색인 행·조각 읽기) | 트랜잭션 없이 읽기 두 번 |
| W2 3단계(Voyage 호출) | 트랜잭션 없음 |
| W2 5단계(저장) | 짧은 트랜잭션 하나: 색인 행 `SELECT … FOR UPDATE` → 다시 확인 → 조각 벡터를 한 문장으로 갱신 → 색인 행 `DONE` → 커밋 |
| W3·W4 상태 판정·다시 준비 | 조건부 UPDATE 한 문장씩. W4의 작업 등록은 커밋 뒤 |
| W5 검색 | 트랜잭션 없이 읽기. 질문 임베딩은 DB 읽기 전후 어디서든 연결을 붙잡지 않은 상태에서 부른다 |

저장할 때 조각마다 UPDATE를 따로 보내지 않고, 조각 ID 배열과 벡터 문자열 배열을 `unnest`로 펼쳐 `UPDATE published_chunk … FROM (SELECT unnest($2::uuid[]), unnest($3::text[]))` 한 문장으로 쓴다. 갱신된 행 수가 읽은 조각 수와 다르면 예기치 못한 오류로 되돌리고 던진다(reliability-design).

## 검색 쿼리

- 비교: `SELECT … , embedding <=> $2::vector AS distance FROM published_chunk WHERE publication_id = $1 ORDER BY distance, seq LIMIT $3`. 정렬과 자르기를 DB가 하므로 api로 옮기는 행은 `limit`개뿐이다. `score = 1 - distance`(BR5.2·BR5.4).
- `publicationText`: 같은 발행본 조각 글을 `seq` 순으로 읽어 줄바꿈 하나로 잇는다(BR5.7). 벡터 칸은 읽지 않는다.
- 두 쿼리 모두 `(publication_id, seq)` 유일 색인으로 그 발행본 행만 찾는다(scalability-design).

## 두지 않는 것

캐시(질문 임베딩·검색 결과), 묶음 동시 전송, 별도 연결 묶음, 처리 시간 목표(p95 등)는 두지 않는다. 캐시는 사본을 만들지 않는다는 규칙(reliability-requirements NFR5.3)과 맞지 않고, 나머지는 시연 규모에서 근거가 없다(performance-requirements 「채택하지 않은 것」).
