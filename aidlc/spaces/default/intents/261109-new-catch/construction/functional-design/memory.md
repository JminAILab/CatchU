<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] FR10.3 「판본·커밋 이름 바로 뒤」를 「링크 바로 뒤」로 읽었다(Q3 B, 팀장 결정). 파일·커밋 링크는 이름 끝이 판본 이름이라 같은 자리이고, 바뀐 줄 링크는 본인 커밋의 바뀐 줄을 가리키므로 같은 뜻이다. NC1 코드 주석(「줄 꼬리 앞」)을 코드 생성에서 고친다.
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] 작업 전체 한계는 첫 근거만이 아니라 모든 근거의 coverage_limits에서 고른다. AC6.3.1이 「근거 두 개에 같은 문장」을 전제하기 때문이다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] JD 요약 지시(U10 영역)도 함께 고친다(Q5 덧붙임, 팀장 결정). Unit 경계 「RagAnswer(지시)」보다 넓다. PR에서 U10 담당 확인을 받고 효과는 재지 않는다.
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] 질문 Q4에서 종류 표지를 「테두리 상자」로 적었으나 지금 kindBadge는 테두리 없이 둥근 배경 상자다. 결정(같은 모양)은 그대로이고 문서에는 실제 모양으로 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
