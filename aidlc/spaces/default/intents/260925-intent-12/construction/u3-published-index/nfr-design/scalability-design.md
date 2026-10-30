# U3 발행본 색인·검색 — 규모 설계

## Sources

작성일: 2026-10-28. 입력: [규모 요구사항](../nfr-requirements/scalability-requirements.md)(scalability-requirements)의 NFR4.4, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W2·W5와 「엔티티 관계」, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-09, [비기능 설계 질문·답변](nfr-design-questions.md).

## 범위

12월 이용자는 소수이고 NFR4는 규모 기준을 시연 규모로 둔다. U3은 확장 장치를 새로 두지 않고, 시연 규모에서 성립하는 구조와 그 가정이 깨질 때 다시 볼 자리만 적는다.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.4 발행본 하나 안의 정확 비교 | 검색은 `WHERE publication_id = $1`로 그 발행본 조각만 읽어 코사인 거리로 전부 비교한다(performance-design 「검색 쿼리」). 비교 양은 그 발행본의 조각 수에만 따르고, 전체 발행본 수와는 무관하다. 그 발행본 행은 `(publication_id, seq)` 유일 색인(기능 설계 entities.md)으로 찾는다. 벡터 근사 색인(HNSW·IVFFlat)은 만들지 않는다 |

## 상태와 확장

- 색인 기록기·처리기·검색은 요청 사이에 메모리 상태를 두지 않는다. 상태는 모두 `publication_index`·`published_chunk`에 있다. api 프로세스를 늘려도 U3 쪽에서 맞출 것이 없다.
- 임베딩 작업의 동시 실행 수와 큐는 U2의 `AiRun`이 정한다. 같은 발행본 작업이 겹쳐도 저장 트랜잭션의 행 잠금과 다시 확인으로 한쪽만 저장된다(reliability-design).
- 벡터 칸은 `vector(1024)` 하나다. 차원이 바뀌면 마이그레이션이 필요하다. 그래서 차원은 코드 착수 첫 단계에서 확인한 뒤 마이그레이션을 쓴다(security-requirements NFR2.1).

## 가정이 깨질 때

- 가정: 발행본당 조각은 수백 개 이하다. 발행 크기 상한은 U4가 발행 때 다시 확인한다(FR4.7).
- 발행본이 커져 검색이 눈에 띄게 느려지면 근사 색인 도입을 그때 다시 정한다(scalability-requirements 「채택하지 않은 것」). 새 수치 기준은 두지 않는다(NFR4).

## 두지 않는 것

샤딩, 읽기 복제본, 별도 벡터 저장소, 자동 확장 규칙, 처리량 목표는 두지 않는다. C02·C07이 PostgreSQL pgvector로 정했고, 나머지는 시연 규모에서 근거가 없다.
