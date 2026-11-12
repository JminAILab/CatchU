# NC2 면접관 사본 칸과 표지 — 확장성 설계

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/scalability-requirements.md`와 검토 R-01
- 성능 설계 `performance-design.md`, 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`
- 계약 `inception/contract-design/contract-summary.md` C3
- 이 단계의 답 `nfr-design-questions.md`(Q2 A)

NC2는 배포 단위·큐·표를 더하지 않는다. 확장 구조는 지금 그대로이고, 아래는 크기가 묶이는 곳만 적는다.

| 자리 | 크기를 묶는 것 | 설계 |
|---|---|---|
| 발행 한 번의 소속 기록 읽기 | 근거 커밋 주소 수 | 근거 식별값으로 좁혀 한 번에 읽는다(Q2 A). 소속 기록 전체 크기와 무관하다 |
| 발행 한 번의 Catch 수 | 발행 입력 상한(항목 20개) | 지금 그대로 |
| 사본 크기 | 새 칸은 짧은 글 셋과 근거마다 참·거짓 | `workLimits`는 상한 없음(기능 설계 Q2 A). 고르는 문장 두 종류, 같은 글자는 한 번 |
| 화면 표지 판정 | 작성자 설명 4,000자 안의 링크 수 × 사본 근거 수 | 화면에서 바로 계산. 캐시·미리 계산 없음 |

- api는 지금처럼 상태 없이 여러 개로 늘릴 수 있다. 새 상태(메모리 캐시 등)를 두지 않는다.
- 소속 기록 행 수에 대한 가정(「수백 행」)은 두지 않는다. 읽기가 근거 수로 묶이기 때문이다(NFR 요구 검토 R-01).

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/scalability-requirements.md`, `reviews/review-01.md`(R-01)
- `performance-design.md`
- `construction/nc2-snapshot-fields/functional-design/functional-spec.md`
- `inception/contract-design/contract-summary.md` C3
- `nfr-design-questions.md` Q2 A
- 지금 코드: `api/src/publications/publish-input.ts`(`PUBLICATION_LIMITS`)
