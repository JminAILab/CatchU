# EKS 자동 배포

`main`에 반영된 판본을 GitHub Actions가 EKS에 배포한다([#342](https://github.com/JminAILab/CatchU/issues/342)). 워크플로와 배포 대상·판본 확인·이미지 단계는 공통 단계를 쓴다([../../dev-server/cd/README.md](../../dev-server/cd/README.md)). 배포 대상 값이 `eks`면 이어서 교체 단계가 돈다. AWS 역할은 `none`에서도 아래 「권한」의 역할을 쓴다. 교체는 손으로 쓰는 [`deploy.sh`](../scripts/deploy.sh)를 그대로 부른다([../k8s/README.md](../k8s/README.md) 「앱 교체(deploy.sh)」).

**아직 실제 클러스터에서 돌려 보지 않았다.** 아래 「처음 준비」를 한 뒤 「아직 못 본 것」의 순서로 확인하고, 그 전에는 배포 대상을 `eks`로 두지 않는다.

## 흐름

| job | `eks`일 때 하는 일 |
|---|---|
| `plan` | 배포할 커밋·배포 대상 확인, 앱 이미지 네 개가 이미 올라가 있는지 조회. environment `eks`의 역할을 쓴다 |
| `check` | 배포할 커밋의 이미지 검사(AWS 권한 없음). 이미 올린 판본이면 건너뜀 |
| `deploy` | kubectl 받기 → 빌드·ECR 올리기(앱 이미지 네 개) → EKS 교체([`ci-deploy.sh`](ci-deploy.sh)) |

EKS 교체 단계는 세 가지를 한다.

1. **`deploy.sh`의 전제 맞추기.** `deploy.sh`는 프로필 `catchu`만 쓰고 셸에 AWS 키 환경변수가 있으면 멈춘다. 그래서 OIDC로 받은 임시 키를 러너의 프로필 `catchu`로 옮기고 환경변수를 지운다. 기대 계정 번호는 역할 주소(environment 비밀값)에서 읽고, kubeconfig `~/.kube/catchu`를 만든다. kubectl은 `deploy.sh`가 확인된 판본(1.37.1)을 받아 해시를 확인하고 쓴다.
2. **되돌리기 확인.** 지금 떠 있는 판본(api Deployment의 `catchu.io/source-revision`)이 배포할 커밋의 조상이 아니면 되돌리기로 본다. 그 사이에 `api/src/database/migrations/`가 달라졌으면 아무것도 바꾸지 않고 멈춘다(「되돌리기」).
3. **`deploy.sh --commit <커밋>`.** 옛 api·worker 종료 확인 → migration 일회 Pod → 동의 기록 삭제 권한 확인 → 새 api·worker·web 시작과 확인. 같은 판본·구성이 정상으로 돌고 있으면 아무것도 바꾸지 않는다. `--resume`은 붙이지 않는다.

- **실행 기록:** 실행 요약에 커밋, 지금 판본과의 관계, 결과, `deploy.sh`의 교체 기록(이미지 digest 네 개, 옛 실행의 종료 코드, migration Pod의 결과)이 남는다. 계정 번호는 가린다.
- **바깥 확인은 하지 않는다.** `deploy.sh`가 세 서비스의 준비(ALB 상태 확인 통과 포함)를 본 것으로 끝낸다. 개발 서버용 바깥 확인은 Caddy의 응답을 기대해 그대로 쓸 수 없다.
- **중단:** api·worker는 옛 것을 내린 뒤 새 것을 띄우므로 교체하는 동안 로그인·분석이 멈춘다. 실제 시간은 처음 돌릴 때 잰다.
- **시간:** 빌드·올리기는 약 5분이다(개발 서버 배포 실측). 교체는 각 단계의 대기 상한을 모두 채우면 약 36분이다. 임시 권한은 60분, `deploy` job의 상한도 60분이다.
- 배포는 한 번에 하나만 돈다(같은 워크플로의 동시 실행 막기).

## 권한

- **AWS:** 역할 `catchu-github-eks-deploy`는 environment `eks`에서 돈 실행만 믿는다([`iam-trust.json`](iam-trust.json)). 그 environment의 배포 브랜치는 `main` 하나다. 권한([`iam-deploy.json`](iam-deploy.json))은 앱 이미지 저장소 네 개의 올리기·조회와 클러스터 `catchu` 조회뿐이다. SSM·Secrets Manager·배포 파일 묶음 저장소에는 닿지 않는다.
- **쿠버네티스:** 역할은 EKS 접근 항목으로 그룹 `catchu-deploy`에 들어가고, 접근 정책은 붙이지 않는다. 그룹의 권한은 [`../k8s/deploy-rbac.yaml`](../k8s/deploy-rbac.yaml)이 전부다. namespace `catchu`에서 Deployment 조회·적용·실행 수 바꾸기, Pod 조회·지켜보기·만들기, Pod 로그 읽기, NetworkPolicy `default-deny`와 ConfigMap `catchu-db` 조회만 된다.
- **주지 않는 것:** Secret 읽기, Pod 안 명령 실행(exec)·붙기·포트 연결, Pod·Deployment 지우기, 다른 namespace(`catchu-ops` 포함), 이 권한 자체를 고치기.
- **한계:** `catchu`에 Pod를 만들 수 있으므로 같은 namespace의 Secret을 붙인 Pod를 만들어 읽는 길은 남는다. 그래서 RDS 관리자 비밀번호는 `catchu-ops`에만 둔다. api의 GitHub 토큰 보관 볼륨도 같은 방법으로 Pod에 붙여 암호문을 읽을 수 있고, 암호문을 푸는 키는 Secret `catchu-api`에 있다. 이 역할은 이미지를 올리고 그 이미지로 앱을 바꿀 수 있으므로, 막는 선은 「`main`에서만」과 `main` 반영 PR의 승인 1건이다.
- **`none`에서도:** 배포 대상이 `none`인 실행도 이 역할과 위 쿠버네티스 권한을 받는다. EKS를 바꾸지 않는 것은 EKS 교체 단계의 조건(배포 대상이 `eks`일 때만) 하나가 지킨다. 조건과 관계없이 막아야 할 때(동결·장애)는 워크플로를 끈다(`gh workflow disable deploy-dev-server`, [공통 단계 「끄는 법」](../../dev-server/cd/README.md#끄는-법)).

## 처음 준비

클러스터와 namespace `catchu`를 만든 뒤 한 번 한다(2단계). AWS·GitHub 설정을 만드는 일이라 팀장이 직접 한다. 저장소 루트의 zsh나 bash에서 친다.

1. **역할:** 기대 계정 번호 파일([../README.md](../README.md) 「처음 준비」)에서 번호를 읽어 자리를 채운다. 역할 설명은 영문만 받는다.
   ```bash
   acct=$(tr -d '[:space:]' < ~/.config/catchu/aws-account-id)
   aws iam create-role --role-name catchu-github-eks-deploy --description "GitHub Actions deploy to EKS (CatchU #342)" --assume-role-policy-document "$(sed "s/ACCOUNT_ID/${acct}/g" deploy/aws/cd/iam-trust.json)" --profile catchu --query Role.RoleName
   aws iam put-role-policy --role-name catchu-github-eks-deploy --policy-name catchu-github-eks-deploy --policy-document "$(sed "s/ACCOUNT_ID/${acct}/g" deploy/aws/cd/iam-deploy.json)" --profile catchu
   ```
2. **접근 항목:** 역할을 쿠버네티스 그룹 `catchu-deploy`에 넣는다. 접근 정책은 붙이지 않는다.
   ```bash
   aws eks create-access-entry --cluster-name catchu --principal-arn "arn:aws:iam::${acct}:role/catchu-github-eks-deploy" --kubernetes-groups catchu-deploy --type STANDARD --profile catchu --region ap-northeast-2 --query accessEntry.kubernetesGroups
   ```
3. **쿠버네티스 권한:**
   ```bash
   bash deploy/aws/scripts/check-target.sh --cluster
   kubectl --kubeconfig ~/.kube/catchu apply -f deploy/aws/k8s/deploy-rbac.yaml
   ```
4. **권한 확인:** 그룹 `catchu-deploy`로 가장해 본다. 하위 자원은 `--subresource`로 묻는다(`can-i create pods/exec`는 exec가 아니라 이름이 exec인 Pod를 묻는다).
   ```bash
   k() { kubectl --kubeconfig ~/.kube/catchu --namespace catchu "$@"; }
   k auth can-i get secrets --as github-deploy --as-group catchu-deploy                       # no
   k auth can-i create pods --subresource=exec --as github-deploy --as-group catchu-deploy    # no
   k auth can-i create pods --as github-deploy --as-group catchu-deploy                       # yes
   k auth can-i --list --as github-deploy --as-group catchu-deploy
   ```
   마지막 목록에 `deployments.apps`·`deployments.apps/scale`·`pods`·`pods/log`와 이름을 정한 `configmaps`·`networkpolicies` 말고 다른 자원이 없어야 한다(자기 권한 조회와 API 목록 조회는 모든 사용자에게 있다). #342 완료 기준 「Secret 읽기와 exec가 거부된다」의 증거다.
5. **GitHub environment `eks`:** 저장소 Settings의 Environments에서 만들고 배포 브랜치를 `main`으로 제한한다. 값 두 개를 넣는다. 역할 주소는 계정 번호가 실행 로그에 찍히지 않게 secrets에 둔다.
   - secrets: `AWS_DEPLOY_ROLE_ARN`(위 역할의 주소). `gh secret set AWS_DEPLOY_ROLE_ARN --env eks`를 치고 값을 붙여 넣는다.
   - variables: `DEV_SERVER_DOMAIN`(`catchu.dev`). `gh variable set DEV_SERVER_DOMAIN --env eks --body catchu.dev`. web 이미지에 넣는 공개 주소다. 이름은 개발 서버 때 이름을 그대로 쓴다.

## 켜기와 멈추기

- **켜기:** `gh variable set DEPLOY_TARGET --body eks`. 그다음 `main` push부터 EKS를 교체한다. 지금 `main` 판본을 바로 배포하려면 Actions에서 `deploy-dev-server`를 `main`으로 수동 실행한다.
- **멈추기:** `gh variable set DEPLOY_TARGET --body none`. 이미지는 계속 올라가고 EKS는 바뀌지 않는다. 진행 중인 실행은 취소하지 말고 끝날 때까지 기다린다.
- **`none`으로 둘 때:** 손으로 교체할 때, 노드 작업을 할 때, 손으로 적용하는 실행 파일·Secret을 바꿀 때, 그리고 **노드나 서비스가 정상이 아닐 때**다. `deploy.sh`는 세 서비스가 「정한 수만큼 실행·준비」가 아니면 같은 커밋이어도 api·worker를 0으로 내리고 다시 띄운다. 노드가 응답하지 않는 동안 `main` 병합이 들어오면 살아나던 서비스까지 내려가고, 종료를 확인하지 못해 3으로 멈춘다.
- 12/9 00:00 동결부터는 `none`으로 둔다.
- 동료에게 서비스를 알린 직후처럼 분석이 몰리는 때에는 배포·api 재시작·DB 설정 변경·노드 작업을 하지 않는다. 교체 한 번에 끊기는 분석이 최대 worker 수(3)만큼이다([#480 11/06 결정](https://github.com/JminAILab/CatchU/issues/480#issuecomment-6680876515)).

## 되돌리기

Actions 화면에서 `deploy-dev-server`를 `main`으로 Run workflow하고, 되돌릴 `main` 커밋(40자리)을 넣는다.

- 넣을 수 있는 커밋은 `main`에 반영된 판본(`git log --first-parent origin/main`에 나오는 커밋)뿐이다.
- **그 사이에 DB 구조 변경이 있으면 멈춘다.** 지금 떠 있는 판본과 되돌릴 커밋 사이에 `api/src/database/migrations/`의 파일이 달라졌으면 아무것도 바꾸지 않고 종료 코드 2로 끝나며, 실행 요약에 달라진 파일이 찍힌다. migration은 되돌리지 않으므로 옛 판본이 새 DB 구조 위에서 돌게 되기 때문이다. 이때는 되돌리지 않고 고치는 PR을 `main`에 올린다.
- 이 확인은 Deployment에 적힌 커밋을 본다. 지난 교체가 migration을 적용한 뒤 새 실행을 띄우기 전에 멈췄다면 Deployment에는 옛 커밋이 남아 있어 이 확인으로 잡히지 않는다. 그때는 api·worker가 0이라 `deploy.sh`가 2로 멈춘다(아래 표).
- ECR은 저장소마다 최근 10개만 남긴다. 그보다 오래된 판본은 다시 빌드·검사한다.

## 실패했을 때

| 어디서 | 클러스터 상태 | 다음 행동 |
|---|---|---|
| 배포 대상 확인·판본 확인·검사·kubectl 받기·빌드·올리기 | 바뀌지 않음 | 실행 기록을 보고 고친 뒤 `main`으로 수동 실행한다 |
| EKS 교체, 종료 코드 2 | 바뀌지 않음 | 요약의 사유나 `deploy.sh` 출력의 「멈춤」 줄을 본다. 되돌리기 확인, 계정·클러스터·이미지·실행 파일 확인, 또는 지난 교체가 멈춘 채(api·worker 0)라서다 |
| EKS 교체, 종료 코드 3~8 | api·worker가 0으로 멈춘 채 | [../k8s/README.md](../k8s/README.md) 「앱 교체(deploy.sh)」의 종료 코드 표대로 원인을 본 뒤, 이 컴퓨터의 `main`을 최신으로 받은 작업 폴더에서 `bash deploy/aws/scripts/deploy.sh --commit <커밋> --resume`으로 이어 간다(옛 `deploy.sh`는 worker를 1개로 띄운다) |
| 실행이 취소되거나 시간 초과 | 교체 도중일 수 있음 | `kubectl get deploy,pod`로 상태를 본 뒤 손으로 이어 간다 |

3~8로 멈춘 뒤의 자동 실행은 모두 2로 멈춘다. 자동 배포는 `--resume`을 붙이지 않으므로, 사람이 결과를 확인하고 손으로 이어 가기 전에는 그 상태를 덮어쓰지 않는다. 이어 간 뒤에는 다음 `main` push부터 다시 자동으로 돈다.

## 검사

```bash
bash deploy/aws/cd/ci-deploy.test.sh
bash deploy/dev-server/cd/ci-target.test.sh
bash deploy/dev-server/cd/ci-images.test.sh
```

- `ci-deploy.test.sh`는 aws·kubectl·`deploy.sh`를 합성 명령으로 바꾼 합성 저장소에서 `ci-deploy.sh`를 실제로 실행한다. 보는 것은 전제 맞추기(프로필·키 환경변수·기대 계정 번호·kubeconfig), 되돌리기 확인, `--resume`을 붙이지 않는 것, 종료 코드, 실행 요약과 계정 번호 가리기다. 끝에서 권한 파일 세 개에 범위 밖 권한이 들어오지 않았는지 글자로 본다.
- 나머지 둘은 배포 대상별 단계 조건·environment와, 지운 개발 서버 값(`dev-server`)·배포 파일 묶음을 받지 않는 것을 본다. GitHub Actions `images` 워크플로의 `cd-scripts` job이 세 명령을 그대로 쓴다.
- 권한 파일은 클러스터 없이 두 가지로 한 번 확인했다(2026-11-16). `iam-deploy.json`은 AWS의 정책 모의 평가(`aws iam simulate-custom-policy`)로 허용·거부를 봤다. `deploy-rbac.yaml`은 이 컴퓨터의 Docker에 띄운 쿠버네티스 API 서버 1.37.1에 올려, 그룹 `catchu-deploy`로 `deploy.sh`가 쓰는 kubectl 호출이 허용되고 Secret 읽기·exec·지우기가 거부되는 것을 봤다. 권한 파일을 고치면 같은 방법이나 실제 클러스터의 「처음 준비」 4로 다시 본다.

## 아직 못 본 것

실제 클러스터가 있어야 확인된다. 사용자가 없는 전환 전에 본다(교체할 때마다 api·worker가 잠깐 멈춘다). 확인하는 동안 `main` 병합을 멈춘다. 배포 대상이 `eks`인 동안의 `main` 병합은 개발 서버에 배포되지 않는다.

| 순서 | 하는 일 | 확인되는 것(#342 완료 기준) |
|---|---|---|
| 1 | 「처음 준비」 1~5 | Secret 읽기·exec 거부(4의 출력) |
| 2 | 배포 대상을 `eks`로 바꾸고, `main`이 아닌 브랜치에서 워크플로를 수동 실행 | `main`이 아닌 실행은 역할을 받지 못한다(environment `eks`가 그 브랜치의 job을 거부한다) |
| 3 | 손으로 이미 띄운 판본 그대로 `main`으로 수동 실행 | OIDC로 역할 받기, kubectl 받기, 접근 항목 → 그룹 → 권한, 같은 판본이면 바꾸지 않는다 |
| 4 | 바로 앞 `main` 판본을 커밋으로 넣어 수동 실행 | 되돌리기. 그 사이 migration 파일이 다르면 2로 멈추고, 같으면 교체된다 |
| 5 | 커밋 없이 다시 수동 실행(`main` 최신) | 교체 1회와 실행 기록(커밋·digest·migration 결과), 실제 중단 시간 |
| 6 | api를 손으로 0으로 줄인 뒤 수동 실행 → 2로 멈추는 것을 보고 손으로 `--resume` | 멈춘 상태를 다음 실행이 덮어쓰지 않는다 |
| 7 | 배포 대상을 `dev-server`로 되돌린다(전환 전이면) | — |

결과는 #342 댓글에 실행 링크와 함께 남긴다. `main` 병합으로 시작한 실행은 전환 뒤 첫 dev→main 병합에서 본다.
