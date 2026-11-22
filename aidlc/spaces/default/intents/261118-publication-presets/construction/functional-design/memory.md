<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 막힘 이유 순서를 지금 코드 순서(추출 미완료는 트랜잭션 밖 → 확인 필요 → 보호)에 비공개를 보호 다음으로 붙였다; 계약 Open question이 기능 설계에 맡긴 몫이고 지금 시험 순서를 깨지 않는다.
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 세기 경로 한 번 상한을 50개로 정했다; Catch 고르기 목록이 20개씩, PDF가 회원당 20벌이라 한 번에 들어오고, 넘으면 화면이 나눠 묻는다.
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 발행 화면이 「발행할 수 없는 자료가 있습니다: (자료 이름)」을 보이려면 이름이 필요해 PresetSummary에 unpublishableItems(제목·이유)를 더했다; 계약 P-1의 「그 밖의 칸은 U1 기능 설계」 몫이다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] Q3 답으로 발행은 트랜잭션 밖에서 프리셋을 한 번 읽어 끝까지 간다; 승인된 ADR-002·components.md의 「트랜잭션 안에서 읽어 바뀌지 않게」와 다르며 functional-spec.md 「앞 단계와 달라지는 곳」에 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
