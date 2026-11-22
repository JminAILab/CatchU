# Performance Design — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드.

| 요구 | 설계 |
|---|---|
| NFR6.1 | `GET /v1/presets`는 회원의 프리셋 행을 만든 순서로 한 번에 읽는다. 쪽 나눔·cursor가 없다 |
| NFR6.2 | 읽는 순서: 프리셋 행(회원 조건) → 항목 행(프리셋 ID 묶음) → 종류별 원본을 ID 묶음으로 한 번씩(Catch 행·근거·소속 기록·보호 관측 / 텍스트 자료 / PDF 행과 쪽 글). 원본마다·프리셋마다 따로 조회하지 않는다. 조회 수는 「프리셋 1 + 항목 1 + 종류별 고정 수」로 데이터 양과 무관하다. 시험은 프리셋 1개와 50개(항목 20개씩)의 조회 수를 세어 같음을 본다 |
| NFR6.3 | 세기 경로는 본문 검사에서 1~50개를 본 뒤 NFR6.2와 같은 종류별 묶음 읽기를 한 번 한다 |
| NFR6.4 | 발행 트랜잭션은 편 항목에서 원본 ID를 종류별로 중복 없이 모아 지금 잠금 SQL에 한 번씩 넘긴다. 사본 내용과 글자 수는 편 항목마다 만든다 |

- 캐시는 두지 않는다. 값이 원본을 따라 늘 맞아야 하고(ADR-005), 규모가 상한으로 묶여 있다.
- 읽기 경로는 잠그지 않는다(READ COMMITTED, 지금 본인 Catch 목록과 같음).
