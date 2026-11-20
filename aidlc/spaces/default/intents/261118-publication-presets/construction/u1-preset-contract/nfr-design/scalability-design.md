# Scalability Design — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드.

| 요구 | 설계 |
|---|---|
| NFR6.5 | 프리셋 표에 회원별 조회 색인 `(member_id, created_at)`, 항목 표에 `(preset_id, position)` 유일 색인을 둔다. 최대 1,000행/회원이라 다른 분할은 두지 않는다 |
| NFR6.6 | 발행 상한 검사(20개, 60,000자)는 편 항목 전체로 한다. 프리셋 수(1~5)는 상한을 바꾸지 않는다 |
| NFR6.7 | 새 배포 단위·외부 자원·캐시 없음. api는 지금처럼 상태 없이 돌고 DB가 상태를 가진다 |
