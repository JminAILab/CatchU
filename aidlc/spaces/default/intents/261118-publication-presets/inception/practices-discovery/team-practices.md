# 팀 관행 — 발행 프리셋 intent(#597) 다시 확인

> 지위: Practices Discovery 마지막 통합본(면담 반영, 2026-11-19). 협업자 검토는 꺼져 있었다. 아래 다섯 절은 승인되면 `aidlc/spaces/default/memory/team.md`의 같은 절을 바꿔 쓴다. 2026-11-14 팀장 결정으로 바꾼 현행 `team.md` 글을 그대로 두고, 면담 Q1의 답으로 Deployment 문장만 바꿨다. Testing Posture의 근거 설명은 `team.md`에 넣지 않고 `evidence.md`에 둔다(team.md는 모든 세션이 읽는 규칙이라서). 면담 Q2~Q7은 팀 관행 문장을 바꾸지 않았다(결정과 이유는 `evidence.md` 「면담 결정」).
>
> 근거로 쓴 역분석 자료: `code-structure.md`, `technology-stack.md`, `dependencies.md`, `code-quality-assessment.md`, `architecture.md`, `business-overview.md`(모두 `aidlc/spaces/default/codekb/CatchU/`). 그 밖의 근거는 `evidence.md`에 적었다.

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

- 배포 대상은 AWS EKS다. `main` 병합 때의 자동 배포는 저장소 변수 `DEPLOY_TARGET`으로 켜고 끈다(끄면 이미지만 올린다). 배포·CI는 기존 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.

## Code Style

- 예외를 삼키지 않고 비동기 요청의 접수와 실제 완료·실패를 구분한다.
- 비밀값·인증정보·사용자 자료를 Git·환경변수 예시·화면·로그와 AI·이슈·PR 공유 로그에 남기지 않는다.
