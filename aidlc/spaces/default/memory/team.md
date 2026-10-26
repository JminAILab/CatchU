# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

<!-- 2026-10-24 팀장 결정(docs/CatchU_11월_범위_결정.md 「11월 진행 방식」)에 따라 11월 개발 기준으로 바꾼 현행 팀 관행이다. 10월 판본은 git 이력(08822dc2)에 있다. aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/practices-discovery/team-practices.md는 2026-09-22 승인 당시 기록이며, 두 문서가 다르면 이 파일을 따른다. -->

## Way of Working

- 이 파일의 11월 규칙(팀 방식·Unit 담당·승인·커버리지·인프라 담당·U1 뒤 착수)은 12월 intent(11월 개발)에 적용한다. 10월 MVP의 남은 작업은 코딩 절차 「코딩 운영」 끝의 10월 문단을 따르고, 이 파일과 `org.md`의 Construction 브랜치·커버리지 기준을 머지 조건으로 삼지 않는다.
- 11월 개발(12월 intent)의 통합 브랜치(integration branch)는 `intent/260925-intent-12`다. 다른 브랜치를 Unit 맡기·합치기의 기준으로 쓰지 않는다.
- 공통 작업 절차는 `docs/CatchU_작업관리.md`, 코딩 기준은 `docs/CatchU_coding_procedures.md` 「코딩 운영」을 따른다. 구현은 AI-DLC 공식 팀 방식이다. 각 담당이 자기 Unit을 맡아 기능 설계부터 시험까지 진행·제출하고, 팀장이 통합 브랜치에 merge commit으로 합친 뒤 통합 브랜치를 PR·작성자 외 승인 1건·merge commit으로 `dev`에 올린다. 팀 방식 사전 시험이 실패하면 구현만 이슈 → `영역/작업내용` 브랜치 → `dev` PR로 바꾼다. 보호 브랜치에 squash·rebase 머지는 쓰지 않는다.
- 각 담당은 12월 intent 납품 계획 담당표의 자기 Unit을 맡는다. 미배정 공통 업무를 팀원 1이나 초기화 담당에게 자동 배정하지 않는다.
- 승인된 화면·설계 제출물은 다시 만들지 않고 재사용한다. 안내 문구를 없애려고 승인된 상류 단계를 재승인·재수행하지 않는다.

## Walking Skeleton

- 각 담당 Unit이 처음 실제로 연결될 때 '최소 연결 첫 결과'를 한 번 마일스톤으로 승인받는다.
- 최소 연결이나 모의·합성 연결의 성공을 전체 완료나 실제 처리·배포 성공으로 보고하지 않는다.

## Testing Posture

- **Methodology**: custom
- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.
- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다.

## Deployment

- 첫 Unit U1을 가장 먼저 통합 브랜치에 합친다. U1이 통합 브랜치에 합쳐진 뒤로는 담당마다 준비되는 대로 Unit을 맡아 함께 진행하며, 앞 Unit이 끝나기를 기다려 시작하지 않는다. Unit 사이의 의존은 합치고 끝내는 순서에만 적용한다.
- 배포 대상은 AWS다. 11/13 1차 통합 확인은 개발 서버(EC2)에서 하고, 12월 최종 환경은 EKS다. 배포·CI는 기존 개발 서버 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.

## Code Style

- 예외를 삼키지 않고 비동기 요청의 접수와 실제 완료·실패를 구분한다.
- 비밀값·인증정보·사용자 자료를 Git·환경변수 예시·화면·로그와 AI·이슈·PR 공유 로그에 남기지 않는다.

## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
