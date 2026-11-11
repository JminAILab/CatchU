<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-10T23:12:44Z [unit nc2-snapshot-fields] 소속 기록을 근거 식별값으로 좁혀 읽는다(Q2 A). 읽기 크기가 근거 수에 묶여 NFR 요구 검토 R-01의 「수백 행」 가정이 필요 없어졌다. 안전망 경고는 커밋 뒤에 남긴다(Q1 A, R-02).
- 2026-11-10T23:12:44Z [unit nc2-snapshot-fields] 사람이 bolt-plan B2 「확인하는 가설」에 소속 기록 결정을 덧붙이게 했고, 요구사항 FR10.2는 가능한 방법을 적은 문장이라 그대로 두게 했다.
- 2026-11-11T05:40:00Z [unit nc3-revisit-facts] 사람이 Q1에서 내 「1초 이하」 숫자를 뺐다(요구사항 근거 없음, 처리 시한 60분이라 판단에 쓸 데 없음). 느려지지 않게 하는 것은 구조 요구와 코드 검토로, 측정은 분석 전체 elapsedSeconds 전·후 기록만으로 한다. NFR 요구 NFR1.3 문서 고침은 코드 생성 계획에 넣는다.
- 2026-11-11T05:40:00Z [unit nc3-revisit-facts] 종류별 개수 검사는 계약 스키마 if/then 대신 api 등록 입력 검사(registration-batch)와 web 응답 검사에 두었다. 지금 계약이 모양만 보고 뜻 검사는 등록 쪽이 맡는 나눔을 따른다.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
