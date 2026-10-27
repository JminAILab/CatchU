<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-27T01:50:00Z [unit u1-ai-generation-gate] — 키가 비었을 때는 api 기동이 아니라 게이트를 만들 때 멈추게 했다(NFR1.1); 일반 개발·시험은 합성 제공자로 돌고 키를 비워 두므로(api/.env.example) 기동을 막으면 모든 개발이 멈추기 때문이다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-10-27T01:50:00Z [unit u1-ai-generation-gate] — SDK 시간 제한 하나는 네트워크 대기마다 새로 걸려 천천히 보내는 응답을 끝까지 막지 못한다(10월 worker 문서); Q1에서 단계별 마감을 하지 않기로 해 이 한계를 감수했다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
