<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-10-24T12:40:00Z — 공용 기반(U1·U2)에 대한 의존을 DAG 대신 계약 의존 표로 적었다; 팀장 답(Q3)이 계약·합성 제공자로 병행 착수하라고 했고, DAG에 넣으면 Unit 맡기가 막히기 때문이다.
- 2026-10-24T12:40:00Z — US19.2(리허설·제출)를 U2의 통합 확인 진행에 대응시켰다; 이 단계 추적 검사는 모든 스토리가 Unit에 대응하기를 요구해서다. 제외된 9월 스토리 ID 12개는 stories.md 범위 밖 표에 적혀 있어 검사가 빈칸으로 잡지만 대응시킬 Unit이 없다.

- 2026-10-26T00:00:00Z — U7 분리(Q4)에서 U1 경계의 "세 AI 기능의 연결" 담당을 U2·U5·U10으로 바꾸고, 계약 의존 표의 AI 생성 공통·AiRun·첫 이용 동의 소비 Unit을 U10으로 옮겼다; 세 기능은 기본 요약·질의응답·JD 요약이고, 저장소 분석은 10월 경로와 요청별 동의(ADR-008)를 쓰기 때문이다. 하루 실행 제한은 분석도 세므로 U7을 남기고 U10을 더했다. 위험 문장은 팀장 지시대로 U5·U7·U10이다. 새 U7·U10의 복잡도는 둘 다 M으로 적었다(원래 U7은 L).
- 2026-10-26T01:20:00Z — Q5대로 YAML `depends_on`을 모두 빈 목록으로 두고 통합·완료 전제는 그림·표에만 남겼다; 팀 방식의 Unit 맡기가 `depends_on`을 착수 막기로 쓰기 때문이다. 첫 Unit은 YAML 맨 앞 순서로만 정해진다.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
