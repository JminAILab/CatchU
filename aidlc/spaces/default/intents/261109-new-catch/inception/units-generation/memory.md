<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-10T02:20:00Z — Unit을 단계마다 하나씩 셋으로 나눴다. 기능으로는 3단계가 1단계에 기대지 않지만, 본인 목록 커서와 지원자 상세를 함께 고치므로 NC3이 NC1에 기댄다(Q2 A). NC2는 공통 부품 때문에 NC1에 기댄다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

- 2026-11-10T02:20:00Z — 요약 확인에서 사람이 NC1 종류를 service에서 ui로 바꿨다(화면 부품 설계가 나오고 빈 확장성·관측 문서가 나오지 않게). 같은 답에서 계획을 승인했는데, 요약 확인이 먼저 묶여 있어 계획 승인 답은 기록 명령으로 남기지 못하고 질문 파일 「Plan Approval」에만 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
