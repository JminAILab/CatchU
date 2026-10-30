# U3 발행본 색인·검색 — 성능 요구사항

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR6.2·FR6.8, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-09, [비기능 질문·답변](nfr-requirements-questions.md) Q2.

## 범위

NFR4는 처리 시간·가동률·복구 수치를 새로 만들지 않는다고 정했다. 그래서 U3은 응답 시간 목표를 두지 않고, 외부 호출이 끝없이 기다리지 않게 하는 상한과 불필요한 호출을 하지 않는 규칙만 둔다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.1 | Voyage 호출 시간 제한: 문서 임베딩은 호출당 30초, 질문 임베딩은 호출당 10초. 문서 임베딩은 한 번에 조각 128개까지 묶는다. 128개가 Voyage 한 번 호출 상한(글 개수·토큰) 안인지는 코드 착수 때 확인하고 다르면 묶음 크기를 줄인다. 시간 초과는 제공자 오류이며 재시도하지 않는다 | 시간 초과 합성 응답 시험 | Q2, NFR4, 기능 설계 R-01(호출 시간 제한) |
| NFR4.2 | 임베딩 처리 시한은 10분이다. 마감은 발행 때와 [검색 다시 준비] 접수 때 그 시각 + 10분이다. 그 밖의 처리 시간 목표는 두지 않는다 | 기능 설계 S5 | 기능 설계 Q3·BR1.8·BR4.1, C-02 |
| NFR4.3 | `search`는 색인이 `DONE`이 아니거나 질문이 비었거나 `limit`가 범위 밖이면 Voyage를 부르지 않는다. 발행 트랜잭션 안의 조각 나누기는 외부 호출을 하지 않는다 | 기능 설계 S1·S9·S10에서 제공자 호출 횟수 확인 | 기능 설계 BR1.7·BR5.1·BR5.5·BR5.6, ADR-005 |

## 채택하지 않은 것

- 검색·임베딩 응답 시간 목표(p95 등): NFR4가 새 수치를 만들지 않는다고 정했다.
- 질문 임베딩 캐시: 근거가 없고 시연 규모에서 필요하지 않다.
