<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-19T06:34:55Z — 화면 초안(W3·W4)의 `[ ]` 고르기 표기를 지금 코드의 누르는 단추(aria-pressed)로 바로잡았다(Q1). 돌아가기 단추 자리는 초안의 「글 바로 위」에서 「항목 안 제목 바로 아래」로 바꿨다(Q2 팀장 결정). mockups.md 머리 표에 두 차이를 적었다.
- 2026-11-19T06:34:55Z — 탭 키보드에 Home·End와 끝에서 처음으로 도는 동작을 더했다; WAI-ARIA 탭 패턴의 기본이고 화살표 이동(rough Q5 B)에 따르는 최소 동작이다. 기능 설계에서 대조할 수 있게 interaction-spec에 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-19T08:39:58Z — 승인 검토에서 팀장이 [답으로 돌아가기]를 이 작업에서 만들지 않기로 했다; #615(넓은 화면 좌우 배치)가 들어오면 답이 옆에 남아 좁은 화면에서만 필요해지기 때문. 이 결정이 FR3.6, AC3.4.2~AC3.4.4, AC3.5.2 돌아가기 부분, user-flow F4를 대신한다고 mockups.md에 적었다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
