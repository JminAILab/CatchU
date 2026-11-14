# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

<!-- 2026-11-14 팀장 결정(docs/ai-dlc-input-reorg/CatchU_문서개편_입력.md §3 「정한 것」)에 따라 11월 개발이 끝난 뒤의 기준으로 바꾼 현행 팀 관행이다. 11월 판본은 git 이력(bfb43cf5), 10월 판본은 git 이력(08822dc2)에 있다. aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/practices-discovery/team-practices.md는 2026-09-22 승인 당시 기록이며, 두 문서가 다르면 이 파일을 따른다. -->

## Way of Working

- 공통 작업 절차는 `docs/CatchU_작업관리.md`, 코딩 기준은 `docs/CatchU_coding_procedures.md` 「코딩 운영」을 따른다. 각 담당은 이슈 → `영역/작업내용` 브랜치 → `dev` PR(작성자 외 승인 1건, merge commit)로 작업한다. 보호 브랜치에 squash·rebase 머지는 쓰지 않는다.
- AI-DLC 스킬과 에이전트를 적극 쓴다. 코드 작업을 시작할 때 AI가 작업 크기에 맞는 AI-DLC 스킬을 한 줄로 권하고, 고르는 것은 담당이 한다.
- AI-DLC가 Construction 작업 폴더를 만들면 `docs/CatchU_레포_컨벤션.md` §2.1의 AI-DLC 예외를 따른다. 작업 폴더의 결과를 그 intent의 작업 브랜치로 합친 뒤 `dev` PR로 올린다.
- 미배정 공통 업무를 팀원 1이나 초기화 담당에게 자동 배정하지 않는다.
- 승인된 화면·설계 제출물은 다시 만들지 않고 재사용한다. 안내 문구를 없애려고 승인된 상류 단계를 재승인·재수행하지 않는다.

## Walking Skeleton

- 최소 연결이나 모의·합성 연결의 성공을 전체 완료나 실제 처리·배포 성공으로 보고하지 않는다.

## Testing Posture

- **Methodology**: custom
- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.
- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. 작업에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다.

## Deployment

- 배포 대상은 AWS다. 지금은 개발 서버(EC2)에 배포하고, 12월 최종 환경은 EKS다. 배포·CI는 기존 개발 서버 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.

## Code Style

- 예외를 삼키지 않고 비동기 요청의 접수와 실제 완료·실패를 구분한다.
- 비밀값·인증정보·사용자 자료를 Git·환경변수 예시·화면·로그와 AI·이슈·PR 공유 로그에 남기지 않는다.

## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
