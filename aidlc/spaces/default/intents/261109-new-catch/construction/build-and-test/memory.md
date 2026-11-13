<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-12T00:36:24Z — 서비스별 전체 커버리지는 intent 검증 명령을 한 줄로 묶어 돌리지 않고 api·web·worker로 나눠 돌렸다; 서비스별 시간을 따로 알리는 프로젝트 규칙 때문이다. 명령 내용은 검증 명령과 같다.
- 2026-11-12T00:36:24Z — 「PR 본문에 적는다」가 붙은 NFR은 코드 확인 부분을 Met으로 두고, PR에 적는 일은 남은 일로 옮겼다; 병합 시점이 기준인 NFR7.4와 FR15.1~FR15.3만 Unverified 행으로 남겼다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-12T00:36:24Z — 평가 스크립트가 답 0개(NO_ITEMS) 질문 하나에서 실행 전체를 멈춰 결과가 남지 않았다; 팀장 결정으로 그 질문을 「답 실패」로 남기고 다음 질문으로 가게 고치고 시험을 더한 뒤 다시 쟀다(5번이 답 실패).
- 2026-11-12T00:36:24Z — FR15.4 측정 뒤 세 규칙을 worker 상수로 끄고, 되돌림 규칙을 끈 때 되돌림 쌍을 다시 고침으로 남기게 고쳤다(A2); Build and Test 안에서 코드를 바꿨으므로 시험·문서를 함께 고쳤다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-12T00:36:24Z — AC8.1.1·AC8.1.2 불충족은 NC2로 돌아가 지시를 고치는 길(2~3시간, NFR3 재판정) 대신 팀장이 Accept failure를 골랐다; intent 뒤 후속과 NC3 PR 「수행하지 못한 검증」으로 넘긴다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-12T00:36:24Z — 검색 조각에 「본인 커밋」 표시와 「병합 커밋은 변경으로 세지 않음」 문장이 없어, 질의응답이 병합 커밋을 본인 변경과 구분하지 못한다(7번); 후속에서 조각에 넣을지 볼 일이다.
- 2026-11-12T00:36:24Z — 기본 요약 항목이 모두 인용 없는 AI 해석 항목이라 딱지가 붙지 않는다; 후속에서 작성자 주장을 인용 항목으로 내게 할지 정한다.
