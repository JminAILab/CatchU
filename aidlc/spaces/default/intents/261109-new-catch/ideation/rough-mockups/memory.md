<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-09T10:22:18Z — 대략 화면은 새 화면이 아니라 기존 화면 네 곳(지원자 목록·상세 편집, 발행 화면, 면접관 발행본 Catch)의 바뀌는 곳만 그린다; 팀 규칙(승인된 화면 재사용)과 Catch 개편 대략 화면의 같은 방식을 따랐다. 입력 문서 §4-2·§4-3에서 이미 정한 배치는 다시 묻지 않았다.
- 2026-11-09T10:22:18Z — 「이 작업만의 조회 한계」를 근거마다 저장된 「이 근거로 알 수 없는 것」의 모음으로 읽었다; 입력 문서에 정의가 없어 Q5에 가정으로 적었다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-09T11:05:00Z — 변경 요청 1: 첫 초안의 면접관 화면 그림이 링크를 「파일 줄 링크」 같은 이름으로 그렸지만 지금 코드는 주소 전체를 글자로 보인다. 지금 모양과 다르게 그린 것을 지적받아, 링크 이름 규칙을 새로 정하고 2절·4절이 함께 쓰게 했다.
- 2026-11-09T11:05:00Z — 변경 요청 2~8을 반영했다. R-03은 링크 이름으로 갈음했고, R-01·R-02·R-04~R-06은 사람이 정한 대로 적었다. 남은 두 가지(「더 쓰기」 머리 글자, 칸 제목과 같은 줄)는 열린 질문으로 올렸다.
- 2026-11-09T11:20:00Z — 2차 변경 요청 8가지를 반영했다. 그 가운데 '설명 씀/안 씀'은 1차 때 정한 「불러온 목록 안에서 거름」을 서버 거름으로 바꿨다(목록이 20개씩이라 다음 쪽 Catch가 빠짐). 발행 화면의 「설명 안 씀」 때문에 Catch 목록 자료에 칸 하나가 더 붙는다. 이 칸은 걸러 보기 칸과 같은 것으로 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

- 2026-11-09T10:22:18Z — Q2 관련 커밋 넣기는 할 일 목록 문구(「근거에 든 본인 커밋 주소만」)가 넣는 장치(B)를 뜻하는지 안내(A)를 뜻하는지 갈려, 가장 단순한 안 A를 기본으로 두고 B가 더 막는 것과 공수를 함께 적었다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
