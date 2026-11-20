# main 자동 배포(공통 단계)

`main`에 반영된 판본을 GitHub Actions가 검사해 ECR에 올리고 EKS에서 교체한다([#313](https://github.com/JminAILab/CatchU/issues/313), [#342](https://github.com/JminAILab/CatchU/issues/342)). 이 폴더에는 그 가운데 배포 대상 정하기·판본 확인·이미지 단계 스크립트가 있다. EKS 교체·권한·실패했을 때는 [EKS 자동 배포](../../aws/cd/README.md)에 있다.

이 자동 배포는 처음에 개발 서버([README](../README.md))를 교체하려고 만들었다. 개발 서버를 지우면서 개발 서버 교체 갈래(SSM 문서·서버 쪽 스크립트·배포 파일 묶음·배포 역할·environment `dev-server`)를 뺐고, 워크플로·폴더 이름은 그때 이름을 그대로 쓴다. 지운 파일은 판본 [`eaf9d976`](https://github.com/JminAILab/CatchU/tree/eaf9d9769e6361651d885f8af47f69809421f90d/deploy/dev-server/cd)에서 볼 수 있다.

## 배포 대상

`main` 반영 뒤 어디까지 할지는 저장소 변수 `DEPLOY_TARGET` 하나로 고른다. `plan` job이 읽어 판정한다([`ci-target.sh`](ci-target.sh)).

| 값 | 하는 일 |
|---|---|
| `eks` | 이미지 검사·ECR 올리기 뒤 EKS에서 교체한다([EKS 자동 배포](../../aws/cd/README.md)) |
| `none` | 이미지 검사·ECR 올리기까지만 한다. EKS는 바꾸지 않는다. 손으로 교체하거나 배포를 멈추는 동안 둔다 |
| 없음, 그 밖의 값(지운 `dev-server` 포함) | 실행이 실패로 끝난다. 이미지도 올리지 않는다 |

- 보기·바꾸기: `gh variable get DEPLOY_TARGET`, `gh variable set DEPLOY_TARGET --body none`. 저장소 Settings의 Actions 변수 화면에서도 된다.
- 값이 없을 때 배포를 건너뛰고 성공으로 끝내지 않는 것은, 값을 넣기 전에 `main`에 반영되거나 값을 지웠을 때 배포가 빠진 것을 실행 기록에서 바로 알 수 있게 하려는 것이다. 값을 고친 뒤 Actions에서 `main`으로 수동 실행하면 그 판본이 배포된다.
- 값은 실행마다 `plan`에서 한 번 읽는다. 이미 `plan`을 지난 실행은 바꾼 값을 따르지 않는다. 교체를 멈추려고 `none`으로 바꿨으면 진행 중인 실행이 끝났는지 본다.
- 앱 이미지의 태그는 두 값에서 같다(`main-<커밋 12자>`). EKS 교체 스크립트(`deploy/aws/scripts/deploy.sh`)가 이 태그를 찾는다.
- 두 값 모두 environment `eks`의 역할로 이미지를 올린다. `none`에서는 EKS 교체 단계를 건너뛰므로 클러스터는 바뀌지 않는다.

## 흐름

워크플로는 [`.github/workflows/deploy-dev-server.yml`](../../../.github/workflows/deploy-dev-server.yml)이고 job 셋으로 돈다.

| job | 하는 일 | AWS 권한 |
|---|---|---|
| `plan` | 배포할 커밋·배포 대상 확인, 이미 올린 판본인지 조회 | 있음(environment `eks`) |
| `check` | 배포할 커밋의 이미지 검사. 이미 올린 판본이면 건너뜀 | 없음. OIDC 토큰도 요청할 수 없는 별도 러너 |
| `deploy` | 빌드·ECR 올리기. 배포 대상이 `eks`면 이어서 EKS 교체 | 있음(environment `eks`) |

이미지 검사는 배포할 커밋의 스크립트를 러너에서 그대로 실행한다. 그래서 AWS 권한을 받는 job과 러너를 나눴다. 권한이 있는 job은 배포할 커밋의 코드를 러너에서 실행하지 않는다. 이미지 빌드는 Docker 안에서만 돌아 러너의 권한에 닿지 않는다.

**판본은 둘로 나뉜다.** 배포 도구(이 폴더 `cd/`와 `deploy/aws/cd/`)는 언제나 그 실행의 `main` 판본을 쓴다. 이미지와 EKS 실행 파일은 배포할 커밋에서 가져온다. 그래서 지난 커밋으로 되돌릴 때도 도구는 지금 판본으로 돈다.

1. **시작:** `main`에 push될 때(dev→main PR 병합)와, `main`에서 수동 실행할 때. 수동 실행에 커밋을 넣으면 그 `main` 커밋을 배포한다(되돌리기). 다른 브랜치에서는 돌지 않는다. 배포할 커밋과 도구 커밋은 모두 `main`의 first-parent 커밋, 곧 `main`에 반영된 판본이어야 한다([`ci-source.sh`](ci-source.sh)).
2. **판본 확인:** 앱 이미지 네 개의 태그는 `main-<배포할 커밋 12자>`다. 모두 있으면 이미지 검사·빌드를 건너뛴다. 되돌리기는 보통 여기서 바로 교체로 간다.
3. **검사·빌드·올리기(arm64 러너):** `check` job에서 [이미지 검사](../../README.md#검사)를 통과한 뒤, `deploy` job에서 네 이미지를 만든다. web은 `https://<도메인>`(environment 변수 `DEV_SERVER_DOMAIN`)으로 만든다. 이미지 검사는 배포할 커밋의 검사 스크립트로 그 커밋의 소스를 본다. 출처 증명은 붙이지 않고, 올린 태그가 실행 이미지인지 확인한다([`ci-images.sh`](ci-images.sh)).
4. **EKS 교체:** 배포 대상이 `eks`일 때만 [EKS 자동 배포](../../aws/cd/README.md)의 순서로 교체한다.

배포는 한 번에 하나만 돈다(GitHub 동시 실행 막기). 진행 중에 `main` push가 여러 번 오면, 기다리는 실행은 가장 나중 것 하나만 남는다.

## AWS 권한

- GitHub OIDC로 실행마다 임시 권한을 받는다. 저장소에는 AWS 키를 두지 않는다. 역할과 권한 범위는 [EKS 자동 배포 「처음 준비」](../../aws/cd/README.md)에 있다.
- OIDC 공급자는 계정에 한 번만 만든다: `aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --profile catchu`.
- 저장소가 GitHub의 고정 주체 형식을 쓰므로, 역할이 믿는 주체는 이름 대신 소유자·저장소 고유 번호가 붙은 `repo:JminAILab@312341191/CatchU@1332558334:environment:eks` 꼴이다. 저장소 이름이 바뀌거나 같은 이름으로 다시 만들어져도 다른 저장소로 넘어가지 않는다. 형식은 `gh api repos/JminAILab/CatchU/actions/oidc/customization/sub`의 `sub_claim_prefix`로 확인한다.

## 되돌리기

Actions 화면에서 `deploy-dev-server`를 `main`으로 Run workflow하고, 되돌릴 `main` 커밋(40자리)을 넣는다. 배포 기록은 지난 실행의 요약에 있다.

- 넣을 수 있는 커밋은 `main`에 반영된 판본(`git log --first-parent origin/main`에 나오는 커밋)뿐이다. merge commit으로 반영된 PR 안의 중간 커밋은 `main`의 조상이어도 승인된 최종 판본이 아니므로 받지 않는다. 그 안에 뒤 커밋에서 되돌린 코드가 들어 있을 수 있어서다.
- **이전 이미지가 지금 DB 스키마와 호환될 때만** 한다. migration은 되돌리지 않는다. EKS 교체는 그 사이 migration이 달라졌으면 멈춘다([EKS 자동 배포](../../aws/cd/README.md)).
- ECR은 저장소마다 최근 10개만 남긴다. 그보다 오래된 판본은 태그가 지워졌으므로 다시 빌드·검사한다.
- 이미지 검사(`check-images.mjs`)가 없는 커밋(#275 이전)은 배포하지 않고 멈춘다.

## 실패했을 때

| 어디서 | 상태 | 다음 행동 |
|---|---|---|
| 배포 대상 확인 | 바뀌지 않음. 이미지도 올리지 않음 | 저장소 변수 `DEPLOY_TARGET`을 넣거나 고친 뒤 `main`으로 수동 실행한다(위 「배포 대상」) |
| 판본 확인·검사·빌드·올리기 | 바뀌지 않음 | 실행 기록을 보고 고친 뒤 다시 실행한다 |
| EKS 교체 | 종료 코드에 따름 | [EKS 자동 배포 「실패했을 때」](../../aws/cd/README.md)대로 한다 |

## 검사

`ci-images.sh`(이미지 단계)나 `ci-target.sh`(배포 대상 정하기), 워크플로의 배포 대상 조건을 바꾸면 회귀 시험을 돌린다. EKS 교체 단계의 시험은 [EKS 자동 배포 「검사」](../../aws/cd/README.md#검사)에 있다.

```bash
bash deploy/dev-server/cd/ci-images.test.sh
bash deploy/dev-server/cd/ci-target.test.sh
```

- `ci-target.test.sh`는 `ci-target.sh`를 값마다 실행해 `eks`·`none`만 받고 없는 값·다른 값(지운 `dev-server` 포함)은 실패로 끝나는지 본다. 워크플로 파일에서는 이미지 올리기에 조건이 없는지, kubectl 받기·EKS 교체는 `eks` 조건을 다는지, environment가 `eks` 하나인지, 지운 개발 서버 단계가 없는지 글자로 본다. 워크플로를 실제로 돌리지는 않는다.
- `ci-images.test.sh`는 aws·docker를 합성 응답으로 바꾸고, 합성 git 저장소에서 plan·push를 실제로 실행한다. 확인하는 것은 판본 조회, 이미 올린 태그 다시 쓰기와 새로 빌드해 올리기, manifest 판정이다.
  - manifest 판정: 실행 이미지는 받고, in-toto 증명 문서·층이 모자란 것(최소 2)·이미지 설정이 아닌 문서는 거부한다.
- 실제 ECR·Docker에는 닿지 않는다. 그래서 OIDC 권한 받기, arm64 빌드, 실제 manifest 응답은 실제 배포 실행에서 확인한다.
- GitHub Actions `images` 워크플로의 `cd-scripts` job이 이 두 명령과 EKS 교체 단계 시험을 그대로 쓴다. `main`으로 가는 배포 PR과 수동 실행에서 돈다. `deploy/`를 바꾼 dev PR은 병합 전에 그 브랜치로 수동 실행한다([배포 안내 「검사」](../../README.md#검사)).
- 셸 정적 검사(`bash -n`·shellcheck)는 셸 안의 Python 코드를 검사하지 못한다. 그래서 이 시험이 판정 코드를 실제로 실행한다.

## 끄는 법

- 교체만 멈추기: 배포 대상을 `none`으로 둔다(위 「배포 대상」). 이미지는 계속 올라간다. `eks`로 되돌리면 그다음 `main` push부터 교체한다.
- 전부 끄기: Actions 화면에서 `deploy-dev-server` 워크플로를 Disable한다(`gh workflow disable deploy-dev-server`). 이미지도 올라가지 않는다. 다시 켜면 그다음 `main` push부터 돈다.
