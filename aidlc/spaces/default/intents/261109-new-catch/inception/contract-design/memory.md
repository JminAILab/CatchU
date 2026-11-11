<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-10T02:50:00Z — FR9.3을 고정 문장 대조로 정해(Q1 A) Unit 의존의 「조건」이 지켜졌다. NC2는 web·api만 고치고 NC2·NC3 사이 의존이 없다. 같은 작업 경고는 괄호 안이 바뀌므로 앞부분 대조로 적었다. 커서는 NC1이 v2, NC3이 v3으로 올리는 차례로 적었다. 목록과 상세가 같은 응답 모양을 쓰므로 revisitFacts는 목록에도 실린다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
