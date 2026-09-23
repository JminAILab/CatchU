# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

<!-- 2026-09-23 팀장 결정(docs/CatchU_작업관리.md 「코딩 운영」)에 따라 정리한 현행 팀 관행이다. aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/practices-discovery/team-practices.md는 2026-09-22 승인 당시 기록이며, 두 문서가 다르면 이 파일을 따른다. -->

## Way of Working

- 공통 작업 절차는 `docs/CatchU_작업관리.md`를 따른다. 10월 MVP 코딩은 그 문서의 「코딩 운영」대로 AI-DLC Construction 코드 생성 단계를 거치지 않고 이슈 → `영역/작업내용` 브랜치 → `dev` PR → 작성자 외 승인 1건 → merge commit으로 진행한다. 보호 브랜치에 squash·rebase 머지는 쓰지 않는다.
- 각 담당자는 10월 MVP 요구사항(`aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md`) 담당표의 자기 영역 설계·구현·시험을 맡는다. 미배정 공통 업무를 팀원 1이나 초기화 담당에게 자동 배정하지 않는다.
- 승인된 화면·설계 제출물은 다시 만들지 않고 재사용한다. 안내 문구를 없애려고 승인된 상류 단계를 재승인·재수행하지 않는다.

## Walking Skeleton

- 각 담당 조각이 처음 연결될 때 '최소 연결 첫 결과'를 한 번 마일스톤으로 승인받는다. 개별 코딩 작업마다 승인 게이트를 두지 않는다.
- 최소 연결이나 모의·합성 연결의 성공을 전체 완료나 실제 처리·배포 성공으로 보고하지 않는다.

## Testing Posture

- **Methodology**: custom
- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.

## Deployment

- 기능 개발은 이슈의 실제 의존 순서를 지키며 담당별로 병행한다. 코딩의 승인 게이트는 '최소 연결 첫 결과' 마일스톤 한 번이며, 그 밖의 코딩은 PR 리뷰로 확인한다.
- 배포 기준은 승인 범위의 NCP 수동 배포다. 자동 배포는 `docs/CatchU_작업관리.md`의 2026-09-20 배포 후속 방향에 따라 새 필수 조건이 아니며, 별도 범위 결정 전까지 계획·착수 조건에 넣지 않는다.

## Code Style

- 예외를 삼키지 않고 비동기 요청의 접수와 실제 완료·실패를 구분한다.
- 비밀값·인증정보·사용자 자료를 Git·환경변수 예시·화면·로그와 AI·이슈·PR 공유 로그에 남기지 않는다.

## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
