<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-03 — 저장소가 없는 첫 분석(NO_STORE)이라 범위를 묻지 않고, 저장소 전체 대신 이 intent가 건드리는 영역(worker, api의 분석·Catch·탈퇴·고지, web의 Catch·받은 사람 화면)으로 좁혀 스캔했다(kind: partial). 모노레포 전체 스캔은 비용에 비해 이 intent에 쓸모가 적다고 봤다.
- 2026-11-03 — 첫 스냅샷은 폴더 단위로 잡았는데, 게시 도구는 분석된 파일 경로가 스냅샷 경로에 그대로 들어 있어야 받아들였다. 스캔 뒤 소스가 바뀌지 않았음(HEAD 6cd0f160, worker·api·web 변경 없음)을 확인하고, 분석된 파일 45개로 스냅샷을 다시 잡았다. 그 지문이 스캔 때 찍은 지문(28aff7c7)과 같아 그대로 게시했다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-03 — 이미 소속된 커밋 목록을 큐 요청(Request)에 실을지, worker가 시도마다 부르는 맥락 조회 응답에 실을지. 입력 문서는 「요청에 실어」라고 했지만 큐 작업 크기와 계약 판본 영향이 다르다(개발자 스캔 「걱정되는 점」). 요구사항·설계에서 묻는다.
