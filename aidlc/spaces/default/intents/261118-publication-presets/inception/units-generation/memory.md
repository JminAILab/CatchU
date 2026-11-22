<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-19T13:21:04Z — 단위 계획 승인 때 팀장이 고쳐 AI 읽기 셋과 탈퇴·자료 지우기 연쇄 삭제 시험을 U1로 옮겼다; 앞선 사본 규칙을 한 단위에서 끝내고, 연쇄 삭제를 만드는 단위에서 확인해 탈퇴가 깨진 채 dev에 들어가지 않게 하려고. U1이 XL, U3은 화면만, U4는 방침 문구만 남았다.
- 2026-11-19T13:21:04Z — U3은 화면만 남아 kind ui로 두었다. U2에는 api 조회 조건 하나(Catch 목록)가 있지만 화면 기능이 중심이라 ui로 두었다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
