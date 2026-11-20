<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-19T01:00:29Z — 개발자 지시문에 규칙 묶음을 글자 그대로 붙이지 않고 규칙 파일 네 개(org·team·project·phases/inception)를 읽으라고 경로로 넘겼다; 묶음이 20KB를 넘어 지시문이 지나치게 길어져서다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-19T01:00:29Z — 집중 스캔이 STALE 저장소에 합쳐져 api/src/ai-generation/·web/src/features/rag-answer/(나머지)·api.ai-generation 깊은 범위가 얕은 범위로 내려갔다(NARROWER). 이번 intent는 ai-generation을 고치지 않으므로 받아들일 만하나 승인 때 알렸다.
- 2026-11-19T01:00:29Z — 개발자가 올린 걱정 7개(근거 이동의 DOM id 탐색, 확인 필요 Catch 409, 같은 Catch 두 프리셋 arrayUnique, 기존 발행본 삭제 시 파일 저장소 PDF 사본·JD 요약 연쇄 삭제, 방침 문구 SHA-256 대조, 프리셋 주소 위치와 메뉴 현재 자리, 깊게 못 읽은 곳)는 요구사항·설계 단계 입력이다.
