# U3 발행본 색인·검색 — 규모 요구사항

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR4.7·C02, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-09, [비기능 질문·답변](nfr-requirements-questions.md) Q2.

## 범위

12월 이용자는 소수의 외부 사용자이고(요구사항 의도 분석), NFR4는 규모 기준을 시연 규모로 둔다. U3은 확장 장치를 새로 두지 않고 시연 규모에서 성립하는 가정만 적는다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.4 | 시연 규모 가정: 발행본당 조각은 수백 개 이하다. 이 규모에서 검색은 근사 색인 없이 그 발행본 조각과 정확히 비교한다. 발행본 크기 상한은 U4가 발행 때 다시 확인하므로 조각 수의 상한도 그것을 따른다. 발행본 수가 늘어도 검색은 발행본 하나 안에서만 비교하므로 비교 양은 발행본 크기에만 따른다 | 기능 설계 S8 | NFR4, FR4.7, 기능 설계 BR5.4(요약 확인), Q2 |

## 채택하지 않은 것

- 벡터 근사 색인(HNSW 등): 시연 규모에서 필요 없고, 정확 비교가 결과를 예측하기 쉬워 시험도 단순하다. 발행본이 커져 검색이 느려지면 그때 다시 정한다.
- 별도 벡터 저장소: C02·C07이 PostgreSQL pgvector로 정했다.
