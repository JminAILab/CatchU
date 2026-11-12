<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] FR10.3 「판본·커밋 이름 바로 뒤」를 「링크 바로 뒤」로 읽었다(Q3 B, 팀장 결정). 파일·커밋 링크는 이름 끝이 판본 이름이라 같은 자리이고, 바뀐 줄 링크는 본인 커밋의 바뀐 줄을 가리키므로 같은 뜻이다. NC1 코드 주석(「줄 꼬리 앞」)을 코드 생성에서 고친다.
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] 작업 전체 한계는 첫 근거만이 아니라 모든 근거의 coverage_limits에서 고른다. AC6.3.1이 「근거 두 개에 같은 문장」을 전제하기 때문이다.
- 2026-11-11T04:25:16Z — [unit nc3-revisit-facts] 「뒤 커밋이 앞 커밋이 넣은 줄을 다시 고친 곳」을 줄 번호가 아니라 줄 글자 맞추기로 읽었다. patch만 있고 파일 전체가 없어 중간에 다른 계정 커밋이 끼면 줄 번호를 따라갈 수 없다. TheMe d42d9a3이 지운 줄이 ba6bba8이 넣은 줄과 글자가 같음을 실제 응답으로 확인했다.
- 2026-11-11T04:25:16Z — [unit nc3-revisit-facts] ADR-002의 확인 거리(지운 파일 항목의 sha)를 CatchU 커밋 b289406e로 확인했다. removed 항목 sha는 지우기 전 내용 식별값이고 renamed 항목 sha는 바뀐 뒤 값이다. 그래서 여러 커밋에 걸친 옮김을 범위에 넣었다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] JD 요약 지시(U10 영역)도 함께 고친다(Q5 덧붙임, 팀장 결정). Unit 경계 「RagAnswer(지시)」보다 넓다. PR에서 U10 담당 확인을 받고 효과는 재지 않는다.
- 2026-11-10T13:36:03Z — [unit nc2-snapshot-fields] 질문 Q4에서 종류 표지를 「테두리 상자」로 적었으나 지금 kindBadge는 테두리 없이 둥근 배경 상자다. 결정(같은 모양)은 그대로이고 문서에는 실제 모양으로 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-11T04:25:16Z — [unit nc3-revisit-facts] 「다시 볼 곳」 커밋 링크는 예시·합성(MOCK) Catch에서도 글자로만 보이게 했다. Q4 A의 「링크를 만들 수 없으면 글자」에 지금 근거 링크가 LIVE·api일 때만 링크인 것과 같은 조건을 더했다. 합성 저장소 이름으로 실제 github.com 주소가 열리지 않게 하기 위해서다.
- 2026-11-11T04:25:16Z — [unit nc3-revisit-facts] 공개 Catch 목록은 본인 목록과 커서 함수를 함께 쓰지만, 계약 C2 「바뀌지 않는 것」을 지키려고 지금 모양(v 2, after 글)을 따로 두기로 했다. 코드 생성에서 함수를 나눈다.
- 2026-11-11T04:25:16Z — [unit nc3-revisit-facts] 팀장 정정: 커밋 식별값 바로 뒤에는 이/가·을/를을 붙이지 않고 받침과 상관없는 「에서」「의」로 쓴다(식별값 끝 글자마다 받침이 다름). 다음에도 쓸 작성 규칙이라 단계 마지막 승인 때 남길지 묻는다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
