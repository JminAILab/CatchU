<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 막힘 이유 순서를 지금 코드 순서(추출 미완료는 트랜잭션 밖 → 확인 필요 → 보호)에 비공개를 보호 다음으로 붙였다; 계약 Open question이 기능 설계에 맡긴 몫이고 지금 시험 순서를 깨지 않는다.
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 세기 경로 한 번 상한을 50개로 정했다; Catch 고르기 목록이 20개씩, PDF가 회원당 20벌이라 한 번에 들어오고, 넘으면 화면이 나눠 묻는다.
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] 발행 화면이 「발행할 수 없는 자료가 있습니다: (자료 이름)」을 보이려면 이름이 필요해 PresetSummary에 unpublishableItems(제목·이유)를 더했다; 계약 P-1의 「그 밖의 칸은 U1 기능 설계」 몫이다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-20T00:06:34Z — [unit u1-preset-contract] Q3 답으로 발행은 트랜잭션 밖에서 프리셋을 한 번 읽어 끝까지 간다; 승인된 ADR-002·components.md의 「트랜잭션 안에서 읽어 바뀌지 않게」와 다르며 functional-spec.md 「앞 단계와 달라지는 곳」에 적었다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-20T11:40:00Z — [unit u3-reader-views] 팀장 Q2 B로 모든 탭 패널을 그려 두고 숨겨, interaction-spec SourceJump의 「다른 탭 항목은 그려져 있지 않다」 전제만 바뀌었다; PDF 뷰어 상태를 남기는 대신 처음 그리는 양이 는다. 검토 Major 둘(recipient-api.ts pickItem이 프리셋 칸을 버림, 자료 화면 탭 거부 때 초점)은 다음 단계 계획에 옮긴다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-20T07:31:44Z — [unit u2-applicant-screens] 발행 확인 단계의 「작성자 설명이 없는 Catch N개」 안내(새 Catch BR6.5)는 프리셋 목록 응답에 설명 여부가 없어 그리지 않기로 썼다; 남기려면 U1 응답 칸을 더해야 해 functional-spec 열린 질문으로 사람에게 올린다.
- 2026-11-20T07:31:44Z — [unit u2-applicant-screens] 저장 실패(404·400 presetIds 등)·불러오기 실패·지우기 실패 글은 M3·M4에 없어 가장 짧은 글로 정했다; 다듬은 화면에 없는 글이라 검토에서 짚일 수 있다.
