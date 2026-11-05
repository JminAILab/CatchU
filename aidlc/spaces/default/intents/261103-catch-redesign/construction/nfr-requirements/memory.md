<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-05T03:00:00Z — [cr1] 질문을 내지 않았다. 인셉션 NFR1~NFR7이 이미 수치·판정 기준을 갖고 있고, CR1은 새 외부 호출·저장·계약이 없어 사람이 정할 빈칸이 없었다.
- 2026-11-05T03:00:00Z — [cr1] 부모 인셉션 NFR이 없는 항목(글 길이·발행 상한·처리 시간·로그)은 NFR ID를 붙이지 않고 「확인 사항」으로 두었다. 처음에 NFR4·NFR7 아래로 붙였다가 뜻이 맞지 않아 옮겼다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-05T03:00:00Z — [cr1] 운영 로그 건수 필드(기록의 글 제목 수 등)를 처음 넣었다가 뺐다. 요구사항 근거가 없는 운영 장치라 포트폴리오 MVP 규칙에 따라 넣지 않는다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
