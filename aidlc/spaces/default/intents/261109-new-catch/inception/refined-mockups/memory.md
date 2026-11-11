<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-10T00:40:00Z — 새 프로젝트 규칙(지금 코드가 그리는 모양 확인)에 따라 바뀌는 화면 네 곳의 코드를 먼저 읽었다. 대략 화면이 지금 모양과 다르게 그린 곳이 넷 나왔다. 칸 제목 자리, 발행 항목이 체크 칸이 아니라 누르는 단추인 것, 지원자 근거 링크에 「(새 탭)」이 없는 것, h5가 없는 것이다. 사람이 정할 것만 Q1~Q4로 물었고 모두 A로 정했다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

- 2026-11-10T00:40:00Z — 발행 화면의 걸러 본 개수 줄은 지금 코드에 없다. NFR6(걸러 본 개수를 aria-live로 알림)을 지키려고 본인 목록과 같은 개수 줄을 새로 두는 것으로 적었고, 가정으로 표시했다.

- 2026-11-10T00:55:00Z — 변경 요청 여섯 가지를 반영했다. 가장 큰 것은 화면 폭 기준이다. 첫 판은 부품 명세 양식의 768·1024px 구간을 그대로 썼다. 지금 코드는 내 자산 화면만 760px 하나이고 발행·받은 사람 화면은 기준이 없다. 새 프로젝트 규칙을 화면 그림에는 지켰지만, 양식이 미리 채워 둔 값에는 적용하지 않은 것을 검토와 사람이 짚었다. 그 밖에 바뀐 것은 다섯이다. 본인 목록 빈 결과 분기를 경우별로 적었고, 발행 체크 칸의 disabled·error 상태와 확인 단계 수를 `SelectedItem`에서 센다는 것을 적었다. 글칸 6줄 하나에서 3줄 8칸으로 바뀌는 것과 설명 연결이 옮겨 가는 것을 「바뀜」으로 표시했다. 비공개 안내 문구를 지금 `PRIVATE_CATCH_NOTICE`로 고쳤고, 마우스를 올려야 주소가 보이는 한계를 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
