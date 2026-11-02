<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
- 2026-10-29T01:15:37Z [unit u7-repository-analysis] — 승인 요구사항의 직접 등록과 주소 입력 UI 선택을 구분했다. FR1.2는 입력 방식을 정하지 않으므로 기존 모달의 하단만 주소 입력으로 바꾸는 안을 사용자에게 확인받고 근거와 설계 선택을 분리해 기록했다.
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-27T00:54:25Z [unit u1-ai-generation-gate] — 원문 위치로 연결되지 않는 인용이 있는 항목은 인용만 떼지 않고 항목째 버리고 droppedCount에 센다(BR4.4); 인용만 떼면 근거 없는 항목이 AI 해석으로 바뀌어 검증 안 된 문장이 남기 때문이다. 정상 호출에서는 생기지 않는 경우라 공수는 없다.
- 2026-10-27T00:54:25Z [unit u1-ai-generation-gate] — Q1 답(droppedCount 0)과 Q4 답(잘린 마지막 항목 버림)을 함께 적용해 droppedCount는 잘림·위치 연결 실패로 버린 수를 센다고 정했다; 요약 확인에서 사람이 확인했다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-10-27T00:54:25Z [unit u1-ai-generation-gate] — 계약 C-01은 줄 구분 방식을 U2 기능 설계에서 정한다고 적었지만 U1에서 정했다(Q2); 승인된 계약 문서는 고치지 않고 U1 기능 명세의 「다른 Unit에 넘기는 것」에 U2가 그대로 쓴다고 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-10-27T00:54:25Z [unit u1-ai-generation-gate] — 정상 끝·출력 상한·거절 밖의 중단 이유도 AiProviderError로 둔다(BR5.4); 쓰지 않는 기능(도구 호출·중단 문자열)의 중단이 오면 성공으로 내보내지 않는 쪽이 단순하고 안전하다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
