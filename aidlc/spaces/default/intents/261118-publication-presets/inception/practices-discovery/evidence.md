# 근거 — 발행 프리셋 intent(#597) Practices Discovery

> 지위: 이끄는 쪽(pipeline-deploy)의 근거 기록 마지막 통합본(2026-11-19 02:03 UTC, 커밋 `8b937012`). 첫 초안은 같은 날 01:38 UTC에 같은 커밋에서 썼고, 면담(`practices-discovery-questions.md`, Q1~Q7 답, 요약 확인 「Looks correct」)을 받아 이 판으로 통합했다. 협업자 검토가 꺼져 있어 quality·developer·devsecops 쪽 검토 파일은 없다.
>
> 시험·빌드·프로그램은 돌리지 않았다. git 조회와 파일 읽기만 했다. GitHub 저장소 설정(저장소 변수·ruleset·environment)은 조회하지 않았다.

## 기준선

- 다시 하는 확인이다. 기준선은 2026-11-14 팀장 결정(`docs/ai-dlc-input-reorg/CatchU_문서개편_입력.md` §3 「정한 것」)으로 바꾼 `aidlc/spaces/default/memory/team.md` 다섯 절이다. 바꾼 커밋은 `1d215f28`(#551, PR #556)이고 11월 판본은 `bfb43cf5`에 있다.
- Testing Posture의 `Methodology: custom`과 「Ordering」 문장은 글자 그대로 두었다. 이를 뒤집는 근거는 찾지 못했고 면담 Q7도 그대로 두기로 했다.
- 이 intent는 brownfield·mvp·Standard 깊이이고 협업자는 꺼져 있다(`aidlc-state.md`).

## 본 자료

### 역분석 자료(`aidlc/spaces/default/codekb/CatchU/`, 11-09 전체 + 11-16·11-19 집중 스캔)

| 자료 | 이 단계에서 쓴 것 |
|---|---|
| `code-quality-assessment.md` | 세 서비스 시험 틀·위치·수(api `node:test` 168, web `node:test` 84, worker pytest 54, deploy bash 6), 커버리지 명령은 있으나 CI가 재지 않음, 시험 이름이 요구사항 ID를 담, 린트·타입 엄격함(api `--max-warnings=0`, worker Ruff·mypy strict), 억제 표시 4곳·TODO 없음, CI/CD 요약(11-09) |
| `technology-stack.md` | 판본 고정 위치(Node 24.21.0·`engine-strict`, Python 3.12.10, uv 0.12.18), CI action을 커밋 SHA로 고정, Dependabot은 주 1회 action 갱신, 배포 도구(Compose·Caddy·EC2·ECR·SSM, EKS 1.37) |
| `code-structure.md` | 폴더 하나 = Nest 모듈 하나, 파일 이름 규칙(`*-input.ts`·`*-store.ts`·`*-config.ts` 등), 손으로 쓴 마이그레이션과 제약 이름 접두사, 시험이 빌드한 `dist/`를 부름 |
| `dependencies.md` | 세 서비스 사이 코드 import 없음, 계약 YAML로만 잇고 한쪽만 판본을 올리면 거부됨(api·worker 함께 배포 필요), 같은 상한 값이 세 서비스에 따로 있음 |
| `architecture.md` | 배포 두 갈래(개발 서버 Compose 한 대, EKS 설정). 다만 이 파일의 「EKS 아직 자원 없음」은 11-09 글이라 아래 11/16~18 커밋보다 오래됐다 |
| `business-overview.md` | 제출 12/10, 쓰는 사람 둘(구직자·면접관), 발행본에 묶음(프리셋) 개념이 아직 없음 |

### 저장소 자료

| 자료 | 본 것 |
|---|---|
| git 이력 | `origin/dev` first-parent 11/14~11/18: 모두 `Merge pull request #… from JminAILab/<영역>/<작업내용>` 형태의 merge commit(#547~#601). `origin/main` first-parent: `dev` → `main` 배포 PR merge commit만(#593·#602 11/18 등). 작업 커밋은 접두사 5종 + 「— 이유」 한 줄. 예외는 Dependabot의 `chore(deps): bump …`(봇의 고정 형식) |
| 이 intent의 브랜치 | 현재 `api/publication-presets`. `dev`의 `61b03716`(#596)에서 갈라졌고 위에 입력 문서 커밋 1개와 단계 승인 커밋 5개(`974908fe`~`8b937012`)가 있다. 원격에는 아직 없다. 원격 `intent/*` 브랜치도 없다 |
| `.github/workflows/ci.yml` | `dev`·`intent/**` 대상 PR·push. `changes`(경로 판정·판정 시험·문서 크기) → 바뀐 서비스만 `web`(`npm run check`)·`api`(lint·typecheck·test, PostgreSQL+pgvector·Valkey)·`worker`(ruff·format·mypy·pytest)·`deps-audit`. 머리 주석은 아직 11월 통합 브랜치를 말한다 |
| `.github/workflows/images.yml` | `main` 대상 PR과 수동 실행만. `images`·`cd-scripts`가 `main-ci` 필수 검사 |
| `.github/workflows/deploy-dev-server.yml` | `main` push·수동 실행. 11/16부터 저장소 변수 `DEPLOY_TARGET`(`dev-server`·`eks`·`none`)으로 교체 대상을 고른다(#342, `084eb112`·`d7d8c312`). 되돌리기는 `main` first-parent 커밋만 |
| `deploy/README.md`, `deploy/aws/README.md`, `deploy/aws/cd/README.md` | 고정점: 11/30 밖에서 핵심 흐름 확인, 12/9 00:00 동결(배포·구성 변경 안 함, 자동 배포 끔), 12/10 제출. 예산 계산 기준은 11/16 생성·11/19 전환·11/21 개발 서버 삭제(11/9 팀장 결정). `deploy/aws/cd/README.md`는 「아직 실제 클러스터에서 돌려 보지 않았다 … 그 전에는 배포 대상을 `eks`로 두지 않는다」고 적는다 |
| `docs/CatchU_레포_컨벤션.md` | §2 dev·main 검증, §3 merge commit만과 개인 브랜치 rebase·`--force-with-lease`, §4 접두사 5종, §6 11행(11/18 고침), §7 ruleset |
| `docs/CatchU_coding_procedures.md` | 「코딩 운영」 2026-11-14 결정(이슈 → 브랜치 → dev PR, AI-DLC 작업 폴더는 intent 작업 브랜치로 합친 뒤 dev PR), 「검사 선택과 결과 보고」 |
| 이 intent의 승인된 범위 | `ideation/scope-definition/scope-document.md` 「순서와 반영 방식」: 계약 변경(발행 요청·사본)을 먼저 PR로 올려 담당 리뷰를 받고 나머지를 이어 올린다, 모두 2026-11-30까지 dev |

## 다섯 영역 관찰과 통합 결과

### Way of Working — 기준선 그대로

- 맞음: 보호 브랜치는 PR·merge commit만(11/14 뒤 merge 30여 건 모두), 브랜치 이름 `영역/작업내용`, 커밋 접두사 5종 + 이유. squash·rebase 머지 흔적 없음.
- Construction 작업 폴더의 합칠 곳은 이 intent의 작업 브랜치 `api/publication-presets`다(`org.md`의 `<area>/<intent>` 꼴에 맞다). Bolt는 `--strategy merge`로 합친다(`org.md`).
- 11/18 보안 리뷰 방식 변경(컨벤션 §6 11행, #590·PR #591·#599)은 면담 Q4에 따라 팀 관행에 넣지 않았다. 컨벤션이 정본이다.
- dev PR을 나눠 올리는 방법은 면담 Q3에 따라 이 intent에만 적용하고 팀 관행 문장은 고치지 않았다(아래 「이 intent에만 쓰는 결정」).
- 참고: CI는 `dev`·`intent/**`에만 돌아, `api/publication-presets`에 올린 커밋은 dev PR을 열 때 처음 검사된다. Construction 중 확인은 `project.md`의 Unit 확인 명령 규칙이 맡는다.

### Walking Skeleton — 기준선 그대로

- mvp 범위는 첫 Bolt를 따로 먼저 돌리는 설정이다(`aidlc-state.md`의 scope `mvp`). 시스템은 이미 끝까지 돈다(`architecture.md`). 면담 Q5에 따라 첫 묶음을 첫 단위로 따로 돌린다(아래 「이 intent에만 쓰는 결정」).
- 「최소·모의 연결 성공을 전체 완료로 보고하지 않는다」는 그대로 둔다.

### Testing Posture — 기준선 그대로

- custom과 Ordering을 그대로 둔다. 근거: 2026-11-14 팀장 결정이다. 시나리오·기대 결과·실패 조건은 구현 전에, 세부 시험 코드는 구현 뒤에 쓰는 섞인 순서라 custom이다. 시험 이름·주석이 요구사항 ID를 달고 기대 결과를 이슈 완료 기준에서 가져온다(`code-quality-assessment.md` 「시험」, 코딩 절차 「검사 선택과 결과 보고」). 이 근거는 `team.md`가 모든 세션이 읽는 규칙이라 `team-practices.md`에 넣지 않았다(승인 검토에서 팀장 결정).
- 커버리지: 세 서비스에 측정 명령이 있고 CI는 재지 않는다(`code-quality-assessment.md`). 면담 Q7에 따라 하한을 두지 않고, 서비스별 명령으로 잰 값을 보고만 한다. `team.md`의 커버리지 줄(팀장이 공용 기반으로 넣은 명령을 쓴다)이 이미 이를 담아 새 줄을 더하지 않았다. `org.md`의 mvp 80% 하한은 「팀 관행을 정하지 않았을 때」의 기본값이고, 이 팀은 custom 관행을 정했다.
- 11/14 뒤 dev 쪽 측정 도구·CI 검사 구성 변경 없음(`ci.yml`에 11/14 뒤 커밋 없음). `images.yml`의 `cd-scripts`에는 EKS 교체 단계 회귀 시험이 더해졌다(#342, `084eb112`·`d7d8c312`). 팀장 몫의 배포 검사라 팀 시험 관행은 바뀌지 않는다.

### Deployment — 면담 Q1로 문장을 바꿈

- 근거: 11/16에 `main` 자동 배포가 대상(`dev-server`·`eks`·`none`)을 고르게 바뀌었고(#342), 11/16~18에 EKS 쪽 S3 파일 저장·worker 판정·api 큐·worker 조회·GitHub 연결을 켜는 커밋과 EFS 마운트 첫 시험(`ab1185d4`, 11/18)이 들어왔다(#276, PR #580·#583·#600·#601). 예산 기준은 11/19 전환·11/21 개발 서버 삭제다.
- 결정: 사람이 Q1에서 준 문장으로 바꿨다. 「지금은 개발 서버(EC2)에 배포하고, 12월 최종 환경은 EKS다」가 빠지고 「배포 대상은 AWS EKS다. `main` 병합 때의 자동 배포는 저장소 변수 `DEPLOY_TARGET`으로 켜고 끈다(끄면 이미지만 올린다).」가 들어갔다. 뒤 두 문장(배포·CI, 공유 인프라·CI는 팀장)은 그대로다.
- 12/9 00:00 동결·12/10 제출은 면담 Q2에 따라 팀 관행에 넣지 않았다. `deploy/aws/README.md`가 정본이다.

### Code Style — 기준선 그대로

- 11/14 뒤 린트·타입 설정 변경 없음(`api/eslint.config.mjs`·`web/eslint.config.mjs`·`worker/pyproject.toml`·tsconfig 이력). 의존성 판본 올림은 Dependabot 두 건뿐. 면담 Q6에 따라 두 줄을 그대로 둔다.
- 「예외를 삼키지 않는다」는 코드와 맞는다(`code-quality-assessment.md` 「오류 처리」 good). 다만 근거 이동이 항목 요소가 없으면 조용히 끝나는 자리가 있고(`recipient-screen.tsx`·`publication-detail-screen.tsx`), 이 intent의 탭 작업이 바로 닿는다. 관행을 바꿀 일은 아니고 설계 단계의 일이다.
- 비밀값 규칙과 맞는 근거: 저장소에 AWS 키 없음(OIDC), 역할 주소를 environment 비밀값으로, 실행 값 예시는 이름만(`deploy/README.md`, `deploy-dev-server.yml` 머리 주석).

## 면담 결정

면담 기록은 `practices-discovery-questions.md`다. 요약 확인 답은 「Looks correct」였다.

| 질문 | 사람의 답 | 반영 |
|---|---|---|
| Q1 배포 절의 문장 | X. 「배포 대상은 AWS EKS다. `main` 병합 때의 자동 배포는 저장소 변수 `DEPLOY_TARGET`으로 켜고 끈다(끄면 이미지만 올린다). 배포·CI는 기존 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.」 | `team-practices.md` Deployment 절을 이 문장 그대로 바꿨다 |
| Q2 12/9 00:00 배포 동결을 팀 관행에 넣을까 | A. 넣지 않는다 | 바꾼 것 없음 |
| Q3 계약 변경 PR을 먼저 올리고 나머지를 이어 올릴 때 브랜치 | A. 한 작업 브랜치(`api/publication-presets`)에서 dev PR을 차례로 연다. 앞 PR이 병합되면 dev를 merge로 받아 이어 간다. 팀 관행 문장은 고치지 않는다 | 팀 관행 문장 그대로, 이 intent에만 적용(아래) |
| Q4 11/18에 바뀐 보안 리뷰 방식을 팀 관행에 넣을까 | A. 넣지 않는다 | 바꾼 것 없음 |
| Q5 끝까지 이어지는 얇은 판을 먼저 만들까 | A. 예. 첫 묶음을 첫 작업 단위로 따로 돌려 승인받는다. 팀 관행 문장은 그대로 둔다 | 팀 관행 문장 그대로, 이 intent에만 적용(아래) |
| Q6 코드 스타일 절 | A. 지금 두 줄을 그대로 둔다 | 바꾼 것 없음 |
| Q7 시험 방식과 커버리지 하한 | A. 방식은 그대로 두고, 하한 없이 잰 값을 보고만 한다 | 바꾼 것 없음(기존 커버리지 줄 유지, 하한 줄 더하지 않음) |

새 굳은 제약(ALWAYS·NEVER)은 면담에서 나오지 않아 `discovered-rules.md`의 두 절은 `None.`이다.

## 이 intent에만 쓰는 결정(팀 관행 문장 아님)

뒤 단계(Units Generation·Delivery Planning·Construction)가 읽도록 적는다. 승인돼도 `team.md`·`project.md`로 옮겨지지 않는다.

1. **dev PR 나누기(Q3)**: 이 intent의 모든 작업은 한 작업 브랜치 `api/publication-presets`에서 한다. Construction 작업 폴더(Bolt)는 이 브랜치로 merge로 합친다. 승인된 범위의 순서대로 계약 변경(발행 요청·사본) PR을 먼저 `dev`에 열고, 그 PR이 병합되면 `dev`를 merge commit으로 받아(rebase·강제 push 없음) 다음 Bolt를 이어 간 뒤 다음 dev PR을 연다. 다음 PR에는 앞 PR 병합 뒤의 커밋만 실린다. 모두 2026-11-30까지 `dev`에 들어간다(범위 문서 「순서와 반영 방식」).
2. **먼저 도는 첫 단위(Q5)**: 승인된 만드는 순서의 첫 묶음(발행 요청·사본 계약 변경 + 프리셋 저장)을 첫 단위(첫 Bolt)로 따로 먼저 돌리고, 사람이 따로 승인한 뒤에 나머지 단위를 돌린다. 이 첫 묶음이 위 1의 첫 dev PR과 겹친다. 첫 단위가 끝나도 최소 연결의 성공을 전체 완료로 보고하지 않는다(팀 관행 Walking Skeleton 절).

## 근거로 확인하지 못한 것

- GitHub 저장소 변수 `DEPLOY_TARGET`의 지금 값, environment `eks` 준비 여부, ruleset 실제 설정(저장소 설정이라 조회하지 않음). 새 배포 문장은 대상을 EKS로 적지만, 지금 `main` 병합이 실제로 EKS를 바꾸는지는 이 값에 달렸다.
- EKS 전환을 실제로 했는지, 개발 서버(EC2)를 지웠는지(커밋은 EKS 쪽 기능을 켜는 중임을 보여 줄 뿐이고, `deploy/aws/cd/README.md`는 실제 클러스터에서 자동 배포를 아직 돌려 보지 않았다고 적는다).
- 시나리오를 구현 전에 정했는지는 git 이력에 드러나지 않는다(팀 결정을 따름).
- 역분석 자료 `architecture.md`·`code-quality-assessment.md`의 배포·CI 줄은 11-09 글이라 11/16 뒤의 EKS 자동 배포를 담지 않는다.
- 옛 배포 문장(「지금은 개발 서버(EC2)에 … 12월 최종 환경은 EKS」)과 같은 뜻의 글이 `README.md` 「기술 구성과 배포」 58행과 `docs/CatchU_결정과_근거.md` 108행에 남아 있다. 이 단계는 팀 관행만 바꾸므로 고치지 않았고, 팀장 결정으로 이 작업에서도 고치지 않는다.
