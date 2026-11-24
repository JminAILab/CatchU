<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-20T06:38:02Z — [unit u4-privacy-policy] C5 날짜를 계획 전에 팀장에게 물어 「30」을 받았다; 기능 설계가 날짜 없이는 코드 생성을 시작하지 않는다고 해서 계획에 2026년 11월 30일로 적었다. 30일에 main 배포가 안 되면 날짜를 다시 고쳐야 한다는 점을 계획 「하지 않는 것」에 남겼다.
- 2026-11-20T06:38:02Z — [unit u4-privacy-policy] 새 시험을 더하지 않고 지금 방침 시험 5건으로 standard 부품당 5~8건을 채웠다; 기능 설계가 새 대조 방식을 더하지 말라고 했고, SHA-256만 바꾸는 어긋남은 사본 diff 확인 단계(Step 7)로 잡는다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
