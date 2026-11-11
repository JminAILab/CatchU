<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-09T14:10:00Z — 질문을 셋으로 줄였다. 입력 문서 §8-1, 성공 기준 12개, 대략 화면 결정이 대부분을 정했고, 대략 화면이 넘긴 열린 질문 가운데 사람이 정할 것(칸 제목 같은 줄, 「더 쓰기」 머리 글자, 판본·브랜치 기준)만 물었다. 「작업 전체 한계」 목록, 「되돌림」 뜻, 작업 시각 기준, 다시 볼 곳 링크 판별은 가정으로 두고 정리 확인에서 보인다.
- 2026-11-09T15:05:00Z — 변경 요청 일곱 가지를 반영했다. 가장 큰 것은 FR10이다. 첫 판은 「사본 근거의 본인 커밋」과 맞춘다고만 썼지만, 사본 근거에는 병합·PR·이슈 근거가 본인 여부 표시 없이 섞여 있다. PR 근거 판본(head_sha)과 맞추면 남의 커밋에 표지가 붙을 수 있다는 것을 사람이 짚었다. 그래서 사본에 근거별 본인 커밋 여부를 담는 요구(FR10.2)와 비교 규칙(FR10.3)을 더했다. 새 ID는 각 묶음의 다음 번호를 썼고 기존 ID는 그대로다(FR10.3~10.4만 내용이 바뀌어 FR10.5·10.6으로 밀림, 첫 판은 승인 전이라 재번호 규칙 대상 아님).

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
