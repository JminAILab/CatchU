<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-19T12:14:58Z — 구성 요소 목록에 바뀌지 않는 이웃(MemberAccount, CatchLibrary, MaterialLibrary)도 넣었다; 새 표의 외래 키가 가리키는 원본의 주인을 선언해야 엔티티 참조가 닫힌다. 「바뀜 없음」으로 표시했다.
- 2026-11-19T12:14:58Z — 사본 모양(C-07)을 SnapshotContract로 따로 적었다; 앞선 사본 고르기를 발행 안에 두면 조각 → 발행 → 조각 고리가 생긴다. 지금 `published-snapshot.ts` 자리다.
- 2026-11-19T12:14:58Z — Q1 B의 「규칙」에 사본 내용 만들기(snapshot-builder)도 넣었다; Catch 글자 수가 사본 내용을 만들어야 셀 수 있어서다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-19T12:14:58Z — Q9 답으로 받은 링크 읽기에서 겹친 사본을 뺀다; 승인된 FR6.2(지금처럼 순서대로 읽음)에 더하는 결정이라 components.md 「앞 단계와 달라지는 곳」에 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-19T12:40:00Z — 승인 검토에서 팀장이 「앞선 사본인가」를 사본 읽기 때 참·거짓 값으로 싣고 원본 ID는 싣지 않기로 정했다; 표시 방법을 기능 설계로만 넘기면 공용 사본 계약 변경이 가려진다는 검토 지적 때문. 받은 링크 열람 응답에서 빼는 자리는 Publications다.
- 2026-11-19T12:40:00Z — 승인 검토에서 팀장이 Catch 고르기 목록을 서버가 거르게 했다(ADR-009); 화면에서 거르면 20개씩 불러올 때 고를 것이 적게 남는다. CatchLibrary를 「바뀜 없음」에서 바꿨다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
