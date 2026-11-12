<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-10T05:13:30Z [unit nc1-sections-and-links] 사람이 Q2 덧붙임으로 정정했다: GET /me/repositories는 DB만 읽는 것이 아니라 refreshStatus로 자격 정보 보관소를 읽어 만료를 확인한다. 「DB만 읽는다」고 단정하기 전에 호출 경로 전체를 확인한다.
- 2026-11-10T05:13:30Z [unit nc1-sections-and-links] 사람이 요청했다: Catch 개편 CR1 때처럼 Unit 단계가 끝날 때마다 그 단계 커밋을 만든다(승인 관문이 없는 Unit 단계도). 체크포인트의 learnings 단계에서 다룬다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-10T13:55:00Z [unit nc2-snapshot-fields] 사람이 Q2 덧붙임으로 설계를 바꿨다: ownCommit을 기여 범위 문장 대조 대신 이 Catch의 commit_assignment로 정한다. NC2 기능 설계(BR1.4·BR1.6·BR4.1, entities, functional-spec)와 계약 요약 C3·C6을 같은 ID 덧붙임으로 고쳤다. 기능 설계의 검토는 고치기 전 판본에 대한 것이다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-10T13:55:00Z [unit nc2-snapshot-fields] 같은 규칙을 적은 다른 자리는 고치지 않았다: bolt-plan B2 「확인하는 가설」(api 문장 대조만으로 본인 커밋 표지), 요구사항 FR10.2(「catch_evidence.contribution_scope에서 정할 수 있다」). 사람에게 보고만 한다.
- 2026-11-10T13:55:00Z [unit nc2-snapshot-fields] 소속 기록 마이그레이션 전에 등록된 Catch는 표지가 없다. DB 초기화 뒤에는 해당 없음.
