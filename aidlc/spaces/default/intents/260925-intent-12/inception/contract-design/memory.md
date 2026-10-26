<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-24T14:50:10Z — 팀장 Q1 조건 2의 경계 목록을 계약 17건(C-01~C-17)으로 폈다. U8 안의 PDF 수신·복사 순서도 도메인 설계 승인 때 계약 설계로 넘긴 항목이라 계약으로 두었다
- 2026-10-24T14:50:10Z — 하루 실행 제한은 접수 때 1을 쓰고 실패해도 돌려주지 않는 가장 단순한 안으로 적었다. MCP 도구는 목록 두 개(쪽 단위)와 받은 링크 읽기 하나로 최소화했다
- 2026-10-26T00:10:00Z — U7 분리(Q4)에서 JD에 걸린 소비 자리(C-01·C-02·C-04·C-07·C-09~C-12, JD 표 소유, JdSummaryPanel, JD 경로)는 U10으로 옮기고, 저장소 등록·수집 상한 행과 C-03 하루 횟수만 U7에 남겼다; 저장소 분석은 10월 경로와 요청별 동의를 쓰므로 AI 관문·AiRun·첫 이용 동의를 소비하지 않는다

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-10-24T14:50:10Z — 검토가 기본 요약 상태 행을 누가 만드는지와 발행 때 자동 요약이 하루 제한에 드는지를 짚었다. 승인 질문에서 팀장이 정한다
