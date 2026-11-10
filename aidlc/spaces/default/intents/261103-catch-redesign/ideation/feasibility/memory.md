<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-03T12:54:26Z — 단계 파일은 AWS 플랫폼·규정 담당의 별도 검토를 합친다고 적었지만, 이 단계는 inline이고 지원 담당을 따로 부르지 않았다. AWS 쪽은 비밀값(SSM·EKS)뿐이고 규정 쪽은 고지 갱신이라, 둘 다 질문 Q4·Q5로 사람에게 확인했다.
- 2026-11-03T12:54:26Z — 바로 앞의 시장 조사는 내부 기능 개편이라 건너뛰었다(외부 시장 위치 없음, 판정 모델 공급자는 입력 문서에서 이미 결정).

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
