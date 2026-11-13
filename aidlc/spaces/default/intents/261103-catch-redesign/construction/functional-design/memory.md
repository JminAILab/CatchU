<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-05T02:10:00Z — [cr1] CR1에는 판정이 없으므로 요구사항의 「AI 쪽을 껐을 때」로 본다(FR4.1). 기존 생성 호출(조각 제목·문장 틀)은 그대로 두고 제목 우선순위만 바꾼다.
- 2026-11-05T02:10:00Z — [cr1] 가리기에 걸리거나 부실한 PR 제목을 본인 커밋 첫 줄로 대체하지 않는다. FR5.1은 고르는 조건만 정하고 대체를 말하지 않으므로, 한 단위에 기록의 글 출처를 하나로 둔다(BR2.4).
- 2026-11-05T02:10:00Z — [cr1] 기록의 글 제목은 생성 호출의 성공·실패와 관계없이 쓴다(BR3.1). 생성 실패가 사람이 쓴 제목까지 지우지 않게 하려는 것이다.
- 2026-11-05T02:10:00Z — [cr1] PR 조회가 허용되지 않은 요청의 커밋 묶음 첫 줄은 「병합 없이 들어간 본인 커밋」으로 둔다. PR을 확인하지 않고 「PR 없이」라고 쓰지 않으려는 것이고, 지금 문서의 구분을 이었다(BR4.1).
- 2026-11-05T02:10:00Z — [cr1] 「센 숫자를 쓰지 않는다」는 CatchU가 만든 문장의 규칙이라 기록의 글 줄(작성자 원문)에는 적용하지 않는다(BR4.6). 기존 시험 `assert_member_text`의 범위를 고쳐야 한다.
- 2026-11-05T02:10:00Z — [cr1] 계층 이름 목록(BR5.4)과 시험 대상 짝짓기(BR5.5)는 요구사항이 예만 들어 설계에서 목록을 정했다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-05T02:10:00Z — [cr1] 종류 판정을 재료와 조각 제목이 함께 쓰므로, 판정 보완(BR5.1)이 조각 제목의 종류에도 번진다. 표를 둘로 나누지 않고 하나로 둔다(입력 문서 §4-2 「지금 제목 규칙의 종류 표를 다시 쓰되」).
- 2026-11-05T02:10:00Z — [cr1] 질문 확인 중 사실 오류 다섯 군데를 바로잡고 질문을 다시 냈다(묶음 설명은 화면에 안 나옴, Tests/ 폴더는 이미 대소문자 무시 등). 팀장 요청으로 질문 내용을 코드와 다시 대조했다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
