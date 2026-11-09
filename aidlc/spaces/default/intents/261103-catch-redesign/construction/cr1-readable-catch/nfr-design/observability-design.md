# CR1 규칙 쪽 Catch — 관측 설계

입력:
- 비기능 요구사항 `construction/cr1-readable-catch/nfr-requirements/observability-requirements.md`
- 기능 설계 `construction/cr1-readable-catch/functional-design/`(rules.md BR3.3·BR7.1, functional-spec.md 7절)

## 설계

| 요구 | 설계 |
|---|---|
| NFR7.1 worker 문서 크기 상한 | 재료 순서·변경 묶음 설명은 새 문서 `worker/docs/generation-material.md`에 쓴다. `generation.md`의 「재료 찾기」에는 새 문서를 가리키는 줄과 지금 재료 커밋 범위 설명만 남긴다. `candidate-decision.md`의 「나누기」 절은 지운다. `relation-collection.md`는 나누기 신호 문장만 바꾸고 늘리지 않는다. 문서 크기 검사(36,000 B)를 검증 명령과 CI에서 그대로 돌린다. |

## 확인 사항의 설계

- **로그:**
  - 새 로그 필드를 두지 않는다(Q2 A).
  - 「제목만 없음」 집계는 최종 제목이 없는 후보만 센다. 기록의 글이 제목이면 이 집계에 들지 않는다.
  - 고쳐 쓰기 집계는 실제로 고쳐 쓰기를 부른 경우만 센다(지금과 같은 뜻).
- **원문 비노출:** 로그 필드는 지금처럼 건수·코드만 담는다. 시험은 보안 설계의 로그 시험을 쓴다.
- **경보·대시보드·추적:** 새로 두지 않는다.
