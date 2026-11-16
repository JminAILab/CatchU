<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-15T04:59:05Z — 입력 문서 §4-1의 「기록 문서의 지위」는 9/11 정리 대상 문서로 좁혀 읽었다; Q7이 그 문서들만 다뤘고, 다른 문서의 지위 칸은 11-14 지침 PR에서 이미 고쳤다. 「하지 않는 것」에 적었다.
- 2026-11-15T04:59:05Z — docs 목록 누락은 입력 문서의 「입력 폴더 4개 + verification + 이 입력 폴더」를 2026-11-15에 직접 대조해 6개로 확정했다(ai-dlc-input, -mvp, -december, -catch, -reorg, verification).
- 2026-11-15T04:59:05Z — 「12월 10일 제출」과의 관계(리뷰 R-02)는 질문하지 않고 가정으로 적었다; 의도 정리 답 둘(왜 지금, 하지 않는 것)을 함께 읽으면 정해지는 해석이라.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-15T05:08:05Z — 수정 요청 7의 묶음 배치: JD 관리·요약은 면접관 화면(면접관 회원이 JD를 등록하고 받은 링크에서 요약), 텍스트·PDF 자료는 발행(Catch와 함께 골라 발행), AI 기본 요약·질의응답은 면접관 화면에 넣었다. 받은 링크의 Claude 분석은 회원 Claude 연결을 쓰므로 Claude 연결 묶음 설명을 지원자·면접관 둘로 넓혔다. 근거는 web/src/features/jd·materials·recipient-claude README와 문구 파일.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
