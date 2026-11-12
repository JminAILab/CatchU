# NC2 면접관 사본 칸과 표지 — 논리 구성 요소

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/`(여섯 문서)
- 이 단계의 설계 `performance-design.md`, `security-design.md`, `reliability-design.md`, `observability-design.md`
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`
- 계약 `inception/contract-design/contract-summary.md` C3·C6
- 이 단계의 답 `nfr-design-questions.md`

새 배포 단위·인프라 자원은 없다. NC2가 고치는 논리 구성 요소와 그 안에서 NFR 설계가 걸리는 곳만 적는다.

| 구성 요소 | 자리 | NFR 설계가 걸리는 곳 | 실패 영역 |
|---|---|---|---|
| 발행(Publications) | api `publications/` | 잠금 조회 JOIN·근거 칸·소속 기록 질의(성능), 회원 범위(보안 1절), 안전망과 경고 줄(신뢰성 2절·관측) | 발행 트랜잭션 하나. 실패하면 그 발행만 롤백 |
| 한계 문장 상수(새 파일) | api `publications/` 안 파일 하나 | 문장 대조 시험(신뢰성 3절) | 시험 실패로 PR이 멈춤. 운영 영향 없음 |
| 사본 형(C-07) | api `published-snapshot.ts`, web `publications-api.ts` | 선택 칸, web 모양 검사(신뢰성 1절) | 모양 틀린 사본은 그 응답만 「올바르지 않은 응답」 |
| 받은 사람 칸 고르기 | web `recipient-api.ts` | 새 칸 옮기기(신뢰성 1절) | 받은 사람 화면 하나 |
| 사본 보기·표지 | web `snapshot-view.tsx`, `lib/github-link-name.ts`, CSS 모듈 | 출력 안전·표지 모양(보안 3절), 접근성(성능 설계) | 화면 그리기. 서버 영향 없음 |
| AI 지시 | api `rag-answer-config.ts`, `jd-summary/jd-generation-request.ts` | 지시 문장(보안 4절) | AI 답의 말투. 호출 수 영향 없음 |
| 조각·요약 근거 | api `published-index/chunker.ts`, `rag-answer/summary-sources.ts` | 바꾸지 않음. 새 칸 0건 시험만(보안 4절) | — |

## 공유 자원

- PostgreSQL: 지금 표만 읽는다(`catch_asset`, `catch_evidence`, `analysis_request`, `repository_registration`, `commit_assignment`). 쓰는 곳은 지금처럼 `published_item`뿐이다.
- 외부 서비스: 새로 부르는 것이 없다. AI 호출은 지금 경로 그대로다.

## 경계

- worker와 결과 메시지 계약은 고치지 않는다(NC2 경계). 문장 대조 시험만 worker 파일을 읽는다.
- NC3와 겹치는 파일은 없다.

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/performance-requirements.md`, `security-requirements.md`, `scalability-requirements.md`, `reliability-requirements.md`, `observability-requirements.md`, `tech-stack-decisions.md`
- `performance-design.md`, `security-design.md`, `scalability-design.md`, `reliability-design.md`, `observability-design.md`
- `construction/nc2-snapshot-fields/functional-design/functional-spec.md`
- `inception/contract-design/contract-summary.md` C3·C6
- `nfr-design-questions.md` Q1 A, Q2 A
