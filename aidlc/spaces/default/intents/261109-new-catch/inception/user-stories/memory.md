<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-10T00:10:00Z — 협업자가 꺼져 있어 기획자 혼자 이야기를 쓴다(협업 라운드 없음). 사람은 의도 설명의 둘(지원자, 면접관)로 고정하고 묻지 않았다. 질문은 묶는 방식과 화면 밖 요구 처리 둘만 했다.

- 2026-11-09T23:55:34Z — FR3(링크 이름)과 FR5(링크 목록)는 할 일 목록에 번호가 없고 대략 화면에서 더한 것이라, 짚어 볼 곳 링크를 보이고 확인하는 일로 보아 US2에 넣었다. FR1.7(편집 영역 안내)은 할 일 (3)의 한 줄이라 US3에 넣었다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

- 2026-11-09T23:55:34Z — Q2 A에 적은 다섯 요구 말고 FR11.2(질의응답 10개 다시 재기)도 Deferred(`build-and-test`)로 넘겼다. NFR3과 같은 측정이고 화면에서 하는 일이 아니어서 같은 원칙을 적용했다. 승인 질문에서 알린다.

- 2026-11-10T00:20:00Z — 변경 요청 여섯 가지를 반영했다. 수락 기준을 더한 곳은 US2.2(근거 강조·긴 이름), US7.1(대소문자·줄 범위 없는 링크), US8.1(남의 기여 0건)이다. 관찰 대상이 어긋난 기준(AC6.4.2·AC11.1.2)은 그 이야기의 사람이 보는 결과로 고쳤고, 화면 밖 기준 AC9.2.3은 빼서 NFR1로 넘겼다. 「(새 탭)」은 지금 코드(`snapshot-view.tsx` visually-hidden)대로 화면 낭독기에만 읽히는 글자로 고쳤다. 첫 판이 지금 코드의 표시 방식을 확인하지 않고 「붙는다」라고 쓴 것을 사람이 짚었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
