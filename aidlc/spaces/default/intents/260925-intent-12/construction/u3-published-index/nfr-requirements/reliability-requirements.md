# U3 발행본 색인·검색 — 신뢰성 요구사항

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR5·FR6.8·FR14.8·FR14.10, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06과 「에러 대응 최소선」, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-005·ADR-007.

## 범위

가동률·복구 수치는 새로 만들지 않는다(NFR4). U3의 신뢰성은 "끝나지 않은 작업이 대기에 남지 않는다", "실패는 숨기지 않고 사람이 다시 시도한다", "지운 자료가 되살아나지 않는다" 세 가지다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.5 | 임베딩 실패는 숨기지 않고 자동으로 다시 돌리지 않는다. 제공자 실패는 `FAILED`로 쓰고, 예기치 못한 오류는 로그를 남기고 던지며 마감(10분) 판정으로 `FAILED`가 된다. 다시 시도는 작성자의 [검색 다시 준비]뿐이다. 임베딩은 발행본 단위로 한 번에 저장해 일부만 된 `DONE`이 없다. 색인이 준비 전·실패면 검색은 `IndexNotReady`를 던지고 열람·기본 요약은 영향을 받지 않는다 | 기능 설계 S3~S5·S7·S9 | FR6.8, ADR-005, ADR-007, 에러 대응 최소선 1~3·5, 기능 설계 BR2.4·BR2.5·BR3.1 |
| NFR5.1 | `publication_index`·`published_chunk`는 발행본 삭제·작성자 탈퇴 때 DB 연쇄 삭제로 함께 지워진다. `published_chunk`는 `(publication_id, published_item_id)` 복합 외래 키로 같은 발행본의 항목만 가리킨다. 두 표를 만드는 PR에서 `api/docs/member-withdrawal-deletion.md` 표에 "따라 지워지는 부모" 행을 더한다 | 기능 설계 S11, `test/db/member-cascade-delete.test.cjs` | NFR5, FR14.8, C-06 |
| NFR5.2 | 늦게 도착한 임베딩 결과는 저장하지 않는다. 처리기는 시작할 때와 저장 트랜잭션 안에서 색인 행이 있고 `PENDING`이며 마감 전인지 다시 확인하고, 아니면 버린다. 부모가 없어 거부된 저장은 다시 시도하지 않는다 | 기능 설계 S5·S6 | NFR5, FR14.10, C-02 late-result |
| NFR5.3 | 임베딩 벡터와 조각 글은 `published_chunk`에만 둔다. 캐시·파일·다른 표에 사본을 두지 않는다 | 코드 검토 | NFR5(지운 자료가 되살아나지 않음), 보안 점검 「LLM·검색 기능」 |

## 알려진 한계

- [검색 다시 준비] 직후 이전 작업이 늦게 끝나면 임베딩 호출이 1회 겹치고, 이전 작업이 늦게 실패하면 새 시도도 버려져 작성자가 한 번 더 눌러야 한다(기능 설계 BR2.6, 에러 대응 최소선 6).
- 작업 등록이 실패하거나 큐에서 작업이 사라지면 10분 동안 `PENDING`으로 보인 뒤 `FAILED`가 된다(C-02).
