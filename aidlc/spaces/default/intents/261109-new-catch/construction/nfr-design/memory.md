<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-10T23:12:44Z [unit nc2-snapshot-fields] 소속 기록을 근거 식별값으로 좁혀 읽는다(Q2 A). 읽기 크기가 근거 수에 묶여 NFR 요구 검토 R-01의 「수백 행」 가정이 필요 없어졌다. 안전망 경고는 커밋 뒤에 남긴다(Q1 A, R-02).
- 2026-11-10T23:12:44Z [unit nc2-snapshot-fields] 사람이 bolt-plan B2 「확인하는 가설」에 소속 기록 결정을 덧붙이게 했고, 요구사항 FR10.2는 가능한 방법을 적은 문장이라 그대로 두게 했다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
