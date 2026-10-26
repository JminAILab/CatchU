<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-10-24T07:55:00Z — 색인·기본 요약이 발행 완료를 구독하게 해(ADR-005) Publication과의 의존 순환을 없앴다; 대신 발행 직후 질의응답·요약이 준비 전일 수 있어 그 상태 표시는 기능 설계로 넘겼다.
- 2026-10-24T07:55:00Z — Materials는 입력상 텍스트(Claude MCP 덩어리)와 PDF(RAG 덩어리)에 걸쳐 있어 한 컴포넌트로 두고 Unit 나누기에서 나눌지 정하게 했다; 엔티티 소유가 한 곳이어야 탈퇴 삭제가 단순해서다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
