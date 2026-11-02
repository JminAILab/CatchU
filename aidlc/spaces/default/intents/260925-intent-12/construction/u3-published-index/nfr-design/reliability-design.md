# U3 발행본 색인·검색 — 신뢰성 설계

## Sources

작성일: 2026-10-28. 입력: [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md)(reliability-requirements)의 NFR4.5·NFR5.1~NFR5.3과 「알려진 한계」, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W2~W5와 「상태 전이」, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06과 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md).

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.5 실패를 숨기지 않고 자동으로 다시 돌리지 않음 | 제공자는 한 번만 보내고, 처리기·검색도 다시 부르지 않는다. 작업은 C-02대로 시도 1회다. 제공자 실패는 `UPDATE … SET status='FAILED' WHERE publication_id=$1 AND status='PENDING'`로 쓴다. 예기치 못한 오류는 로그를 남기고 던지며 상태는 마감 판정에 맡긴다. 검색은 상태가 `DONE`이 아니면 `IndexNotReady`를 던진다 |
| NFR4.5 일부만 된 `DONE` 없음 | 모든 묶음의 벡터를 메모리에 모은 뒤 저장 트랜잭션 하나에서 조각 벡터와 `DONE`을 함께 쓴다. 갱신된 조각 수가 읽은 조각 수와 다르면 되돌리고 예기치 못한 오류로 던진다 |
| NFR5.1 연쇄 삭제 | 마이그레이션에서 `publication_index.publication_id → publication ON DELETE CASCADE`, `published_chunk (publication_id, published_item_id) → published_item (publication_id, published_item_id) ON DELETE CASCADE`를 건다(기능 설계 entities.md). 조각은 항목을 따라, 항목은 발행본을 따라 지워진다. 같은 PR에서 `api/docs/member-withdrawal-deletion.md` 표에 두 표의 행을 더한다. S11과 `test/db/member-cascade-delete.test.cjs`로 확인한다 |
| NFR5.2 늦은 결과 버림 | 처리기 시작 때 색인 행을 읽어 `PENDING`·마감 전이 아니면 끝낸다. 저장 트랜잭션에서 `SELECT … FOR UPDATE`로 다시 읽어 같은 조건을 확인한다. 행이 없거나(발행본 삭제) 조건이 맞지 않으면 아무것도 쓰지 않고 버린다. 행을 잠근 동안에는 발행본 삭제가 기다리므로 저장 중 부모가 사라지지 않는다. 그래도 외래 키 오류(`23503`)가 나면 다시 시도하지 않고 버림으로 기록한다 |
| NFR5.3 사본 없음 | 벡터와 조각 글은 `published_chunk`에만 쓴다. 처리기가 모은 벡터는 그 작업이 끝나면 버려지는 지역 변수다. 캐시·파일·다른 표를 쓰지 않는다 |

## 실패와 결과

| 일어난 일 | 색인 상태 | 처리기·검색의 끝 |
|---|---|---|
| Voyage 오류 응답·연결 실패·시간 초과·redirect·본문 상한 초과·응답 모양 불일치(임베딩 작업) | `PENDING`이면 `FAILED` | 정상 종료(작업 실패로 던지지 않음). 로그 경고 |
| 같은 일(검색의 질문 임베딩) | 바뀌지 않음 | `EmbeddingProviderError`를 그대로 던짐. 호출자가 일반 실패로 처리 |
| 시작·저장 때 행 없음·`PENDING` 아님·마감 지남 | 바뀌지 않음(마감 지난 `PENDING`은 읽을 때 `FAILED`) | 정상 종료, 버림 기록 |
| DB 오류 등 예기치 못한 오류 | 바뀌지 않음 → 10분 뒤 읽을 때 `FAILED` | 로그 뒤 던짐. 작업은 1회로 끝남 |
| 작업 등록 실패(`ENQUEUE_FAILED`) | `PENDING` → 10분 뒤 `FAILED` | `requestReindex`는 로그를 남기고 `REQUEUED`를 돌려줌 |

## 회복 방법

- 사람이 다시 시도한다: 작성자가 [검색 다시 준비]를 누르면 `FAILED`인 색인만 `PENDING`으로 돌아가고 새 작업이 등록된다. 다른 회복 장치는 두지 않는다(에러 대응 최소선 2).
- U3 마이그레이션의 `down`은 기존 마이그레이션과 같이 두 표를 지운다. 색인은 발행 사본에서 만든 자료라 원본 자료는 잃지 않지만, 그때까지 발행된 발행본은 색인 행이 없어 `FAILED`로 보인다(BR3.2).

## 알려진 한계 (그대로 둠)

- [검색 다시 준비] 직후 이전 작업이 늦게 끝나면 임베딩 호출이 1회 겹친다. 이전 작업이 늦게 실패하면 새 시도도 버려져 작성자가 한 번 더 눌러야 한다(BR2.6).
- 작업 등록이 실패하거나 큐에서 작업이 사라지면 10분 동안 `PENDING`으로 보인 뒤 `FAILED`가 된다(C-02).

## 두지 않는 것

회로 차단기, 자동 재시도·backoff, 대체 제공자, 캐시된 결과, 새 상태 확인 경로는 두지 않는다. 호출이 적고 다시 시도는 사람이 하므로 회로 차단기가 막을 연쇄 실패가 없고, 나머지는 에러 대응 최소선 2·NFR5.3과 맞지 않는다.
