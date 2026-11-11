<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

- 2026-11-09T13:20:00Z — 사람이 전체 다시 스캔을 골랐다. 협업자가 꺼져 있어 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다. scope 블록은 `kind: full`·`./`이지만 본문까지 끝까지 읽은 곳은 이 intent와 닿는 곳이고, 나머지 39개 경로는 `shallow.paths`에 남았다(Run Record에 밝힘).
- 2026-11-09T13:55:00Z — 변경 요청: 「이 intent가 닿는 자리」 표가 입력 문서만 보고 만들어져 승인된 대략 화면에서 더한 것이 빠졌다. 개발자가 대략 화면의 1·3단계 추가분과 발행 화면 `selected` 상태 사실을 넣고, 깊게 읽은 파일이 든 훑은 폴더를 「그 파일 밖」으로 밝혔다. 다시 올렸고 범위는 그대로다(COVERS).
- 2026-11-09T13:55:00Z — 대략 화면과 지금 코드가 다른 곳을 개발자가 찾았다. 지원자 상세의 근거 링크에는 「(새 탭)」 글자가 없고(사본 화면에만 있음), 그 링크는 `safeEvidenceUrl`로 아무 http·https 주소나 받는다. 요구사항 분석에서 다룰 사실이다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
- 2026-11-09T13:20:00Z — 다음 단계에서 지킬 사실 다섯: 본인 목록 응답에 작성자 설명 칸이 없고 순서는 무작위 UUID다. 받은 사람 web `recipient-api.ts` `pickItem`이 사본 칸을 골라 옮겨 새 칸이 조용히 빠질 수 있다. 결과 계약 `Candidate`는 `additionalProperties: false`라 판본 올림과 api·worker 함께 배포가 필요하다. 3단계 사실을 기존 Catch에 채우려면 DB 초기화나 재생성이 필요하다. worker가 blob sha를 버린다.
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
