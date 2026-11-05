<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-05T01:20:00Z — 엔진은 같은 층 Unit을 이름 순으로 고르므로(CR2 먼저), 팀장이 고른 CR1 → CR3 → CR2 순서는 B1 뒤 CR3으로 건너가는 지시가 한 번 필요하다고 bolt-plan에 적었다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-05T01:25:00Z — 팀장 승인 메모: 작업 브랜치에 통합 브랜치(0dfe9fb4)를 합쳤다(08ce0af7). U4 발행 화면(#468, `web/src/features/publications`)이 Catch 제목을 목록으로 보이므로, CR1 기능 설계에서 FR8.1의 2줄 제한을 이 화면들에도 적용할지 확인한다. 새 기능은 더하지 않는다.
