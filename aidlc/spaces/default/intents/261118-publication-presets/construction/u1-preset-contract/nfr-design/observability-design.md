# Observability Design — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드.

| 요구 | 설계 |
|---|---|
| NFR4.5 | 프리셋 모듈에 로그 객체 하나(지금 `publications-log.ts`와 같은 꼴): `presetSaved(memberId, presetId)`, `presetSaveFailed(memberId, code)`, `presetDeleted(memberId, presetId)`, `presetDeleteFailed(memberId, code)`. 이름·자료는 인자로 받지 않는다 |
| NFR4.6 | 발행 로그는 지금 `publishFailed(owner, code)`를 그대로 쓰고, 오류 코드 목록에 CATCH_PRIVATE·PRESET_LIMIT_REACHED를 더한다 |
| NFR4.7 | 목록·상세·세기의 500은 공통 오류 필터의 서버 오류 로그로 남고 따로 남기지 않는다 |
| NFR4.8 | 읽기 경로는 예외를 잡아 비우지 않는다(NFR2.10) |

- 새 지표·대시보드·알림·추적은 두지 않는다. 상관 ID는 지금 요청 로그 방식 그대로다.
