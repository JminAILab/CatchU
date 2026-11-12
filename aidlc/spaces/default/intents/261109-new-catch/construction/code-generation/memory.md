<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-11T00:52:41Z [unit nc2-snapshot-fields] 사람이 플랜 승인 때 두 가지를 더하게 했다(문장 대조 실패 메시지에 상수 이름과 고칠 두 파일, 소속 기록 설명 자리에 표지 근거와 한계 상수 목록 한 줄). Step 12 전에 rag-eval.cjs의 JD 지시를 운영 상수로 바꾸게 했다(계획 밖, code-summary 「계획에서 벗어난 것」 5).
- 2026-11-11T00:52:41Z [unit nc2-snapshot-fields] 사람이 로컬 확인 DB를 catchu-cr1-db(55460, pgvector)로 바로잡았다. 5432의 catchu-db-86은 pgvector가 없는 옛 컨테이너다. 로컬 확인 환경은 NC1 code-summary의 기록을 먼저 보고 정한다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
