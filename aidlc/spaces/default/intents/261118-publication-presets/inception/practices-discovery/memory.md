<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-19T02:05:38Z — 팀장이 정한 새 배포 문장(배포 대상 EKS, DEPLOY_TARGET으로 켜고 끔)과 달리 README.md 58행·docs/CatchU_결정과_근거.md 108행은 옛 문장(지금은 개발 서버 EC2)을 담고 있다. deploy/aws/cd/README.md는 실제 클러스터에서 아직 돌려 보지 않았다고 적는다. 고치지 않고 승인 때 알렸다.
- 2026-11-19T02:05:38Z — team.md 머리 HTML 주석(11/14 기준선 설명)은 승인 뒤에도 남아 11/19 배포 절 변경을 말하지 않는다.
