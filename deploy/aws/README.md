# CatchU AWS 실행 환경(EKS)

11월부터 12월 제출까지 서비스를 돌릴 AWS 환경의 설정 파일·생성 명령·운영 순서다([#276](https://github.com/JminAILab/CatchU/issues/276)). 구성의 정본은 #276 본문과 [2026-10-19 결정](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6260130109)이다. 이미지·한 호스트 실행은 [../README.md](../README.md), 지금 쓰는 개발 서버는 [../dev-server/README.md](../dev-server/README.md)에 있다.

**아직 AWS 자원은 하나도 없다.** 이 폴더의 생성 명령은 실행하는 순간 요금이 생기므로 아래 「단계와 시작 조건」의 승인 지점마다 팀장 승인을 받은 뒤에만 실행한다. 비밀값과 계정 번호는 이 폴더에 적지 않는다.

## 파일

| 파일 | 하는 일 |
|---|---|
| [`cluster.yaml`](cluster.yaml) | eksctl 설정. VPC·서브넷, 가용 영역마다 NAT 하나(2a·2c), EKS 1.37, 노드 `t4g.large` 2대(자동 복구 켬), 애드온 판본 고정, 노드 역할의 비밀값 읽기 거부, Load Balancer Controller 권한(WAF를 이름으로 찾는 목록 조회 포함) |
| [`scripts/lib/guard.sh`](scripts/lib/guard.sh) | 모든 스크립트가 맨 앞에서 읽는 공통 확인. 계정·리전·클러스터가 다르면 멈춘다 |
| [`scripts/check-target.sh`](scripts/check-target.sh) | 손으로 치는 생성·변경·삭제 명령 앞에 돌리는 같은 확인(`--cluster`면 kubeconfig까지) |
| [`scripts/lib/network.sh`](scripts/lib/network.sh) | eksctl이 만든 VPC·프라이빗 서브넷·노드 보안 그룹을 찾고, 노드에서 오는 한 포트만 받는 보안 그룹을 만든다 |
| [`scripts/create-rds.sh`](scripts/create-rds.sh) | RDS PostgreSQL 16(Multi-AZ, 저장 암호화, 백업 7일, 삭제 보호)과 로그에 값이 남지 않게 한 파라미터 그룹 |
| [`scripts/create-queue.sh`](scripts/create-queue.sh) | ElastiCache Valkey 8.1 큐(주 2a·복제본 2c, 자동 장애 조치, TLS·비밀번호, `noeviction`, 스냅샷 없음) |
| [`scripts/create-efs.sh`](scripts/create-efs.sh) | GitHub 토큰 보관 폴더용 EFS(암호화, 백업 끔, TLS 강제, 사용자 번호 1000 접근점)와 짝이 되는 암호화 키 |
| [`scripts/create-scripts.test.sh`](scripts/create-scripts.test.sh) | 위 스크립트들의 회귀 시험(AWS에 닿지 않음, 「시험」) |
| [`scripts/create-waf.sh`](scripts/create-waf.sh), [`waf/`](waf) | ALB 앞 WAF. `/v1/internal`로 시작하는 주소(대소문자·인코딩 변형 포함)는 404, Google 로그인 시작은 주소당 5분 20회를 넘으면 429 |
| [`k8s/`](k8s) | 쿠버네티스 실행 파일. namespace·NetworkPolicy·Service·Ingress(ALB)는 손으로 적용하고, Deployment(web·api·worker)와 migration 일회 Pod 틀은 `deploy.sh`만 쓴다([k8s/README.md](k8s/README.md)) |
| [`scripts/deploy.sh`](scripts/deploy.sh) | 앱 교체. 옛 api·worker 종료 확인 → migration 일회 Pod → 새 api·worker·web 시작과 확인([k8s/README.md](k8s/README.md) 「앱 교체(deploy.sh)」) |
| [`scripts/deploy.test.sh`](scripts/deploy.test.sh) | `deploy.sh` 회귀 시험과 실행 파일 조건 검사(AWS·클러스터에 닿지 않음, [k8s/README.md](k8s/README.md) 「시험」) |
| [`scripts/make-secrets.sh`](scripts/make-secrets.sh)·[`put-parameter.sh`](scripts/put-parameter.sh) | 앱 Secret·ConfigMap 만들기와 SSM에 새 비밀값 넣기([k8s/README.md](k8s/README.md) 「Secret과 ConfigMap」) |
| [`scripts/db-admin.sh`](scripts/db-admin.sh)·[`db/`](db)·[`k8s/ops/`](k8s/ops) | DB 관리용 psql 일회 Pod(namespace `catchu-ops`)와 RDS 계정 SQL·루트 인증서([k8s/README.md](k8s/README.md) 「DB 관리 Pod」). 공통 RDS 조회는 [`scripts/lib/rds.sh`](scripts/lib/rds.sh) |
| [`scripts/secrets.test.sh`](scripts/secrets.test.sh)·[`db-roles.test.sh`](scripts/db-roles.test.sh) | 위 스크립트 회귀 시험과 계정 SQL의 실제 PostgreSQL 시험(Docker) |

생성 스크립트는 **깨끗할 때 한 번 만드는 용도**다. 인자 없이 실행하면 확인만 하고 아무것도 만들지 않으며(무엇을 만들지 보여 준다), `--apply`를 줄 때만 만든다. 그 스크립트가 만들 자원(이름은 각 파일 머리말) 가운데 하나라도 이미 있으면, 확인 모드에서도 `--apply`에서도 아무것도 만들지 않고 그 목록을 보여 준 뒤 멈춘다(「생성이 중간에 멈췄을 때」). 이미 있는 자원의 상태를 맞추거나 점검하지는 않는다. 조회가 실패해도 '있음'이나 '없음'으로 넘기지 않고 멈춘다. 모두 저장소 루트에서 실행하고, [`scripts/create-scripts.test.sh`](scripts/create-scripts.test.sh)로 AWS에 닿지 않고 시험한다(「시험」).

다음 PR로 남긴 것: migration 뒤 동의 기록 삭제 권한 회수·확인과 Secret 값이 바뀌었을 때 api·worker를 다시 띄우는 일(`deploy.sh`에 잇는다), 로그 수집(관측 애드온·로그 그룹 미리 만들기·토큰 줄 버림), 경보, ACM 인증서·Route 53, Load Balancer Controller 설치, 노드 패치 절차, 전환 절차.

## 처음 준비

도구 판본(2026-10-15·10-19 확인). 다르면 `guard.sh`가 경고한다.

| 도구 | 판본 |
|---|---|
| aws CLI | 2.28.11 |
| eksctl | 0.231.0 |
| kubectl | 1.37.1 |
| helm | 4.3.0 |

- **프로필:** 이 Mac의 기본 AWS 프로필은 다른 회사 계정이다. 손으로 치는 명령에는 모두 `--profile catchu`를 붙인다. 명령줄 `--profile`이 다른 설정보다 우선하기 때문이다. 셸에 `AWS_ACCESS_KEY_ID` 같은 키 환경변수가 있으면 지운다(스크립트는 있으면 멈춘다).
- **기대 계정 번호:** `guard.sh`는 `aws sts get-caller-identity`의 계정이 이 값과 같아야 진행한다. 저장소 밖 파일 `~/.config/catchu/aws-account-id`에 12자리 숫자 한 줄로 적는다. 콘솔 계정 정보에서 확인한 번호를 직접 적는다(`sts` 결과를 복사하면 확인이 되지 않는다). 환경변수 `CATCHU_EXPECTED_ACCOUNT`가 있으면 그 값을 쓴다. 화면에는 일치 여부만 찍힌다.
- **kubeconfig:** 클러스터를 만든 뒤 `aws eks update-kubeconfig --name catchu --kubeconfig ~/.kube/catchu --profile catchu`로 따로 만든다. kubectl·helm 명령에는 모두 `--kubeconfig ~/.kube/catchu`를 붙인다(기본 kubeconfig는 다른 클러스터를 가리킬 수 있다).
- **바꾸기 전 확인:** 손으로 치는 생성·변경·삭제 명령 바로 앞에는 `bash deploy/aws/scripts/check-target.sh`(kubectl·helm으로 클러스터를 바꾸면 `--cluster`)를 돌려 '일치'를 본다. 멈추면 그 명령을 치지 않는다.
- **설정 형식 확인(비용 0):** `AWS_PROFILE=catchu eksctl create cluster -f deploy/aws/cluster.yaml --dry-run`. eksctl은 `--dry-run`과 `--profile`을 함께 받지 않는다.

## 단계와 시작 조건

날짜는 고정하지 않는다. 앞 단계의 시작 조건이 갖춰지면 다음 단계로 가고, 단계마다 날짜는 그때 정한다. 시각은 모두 한국 시각이다. AWS 정비 시간대는 UTC로 넣으므로 아래 명령에는 둘 다 적었다.

움직이지 않는 날짜(고정점):

| 날짜 | 무엇 |
|---|---|
| 11/30(월) | 핵심 흐름을 밖에서 접속해 확인한다(12월 개발 완료 기준). 전환이 늦어지면 어느 환경으로 확인할지 그때 팀장이 정한다 |
| 12/9(수) 00:00 | 동결. 배포·구성 변경을 하지 않고 자동 배포를 끈다 |
| 12/10(목) | 공식 제출. 밖에서 접속되는 서비스가 있어야 한다 |
| 제출 확인 뒤 | 자원 삭제(「삭제 순서」). 지원 계정 기한(12/11)의 정확한 시각과 제출 뒤 평가자 접속 기간을 기관에 먼저 확인한다 |

예산 한도:

- 계산 기준은 11/12에 만들고 4일 뒤 전환하는 것이다. 이때 10/1~12/11 합계는 약 91만 원(세금 포함)이고 예산 100만 원에서 약 9만 원이 남는다. 1단계부터 하루 약 2.6만 원이 든다.
- **생성은 11/9보다 앞당기지 않는다.** 11/9~11/11처럼 계산 기준(11/12)보다 일찍 만들면 남는 돈이 줄어(11/9 생성이면 약 2만 원) RDS 대기 서버·큐 복제본을 전환 뒤로 미루고, 그다음 관측 지표를 줄인다. 이 둘은 만든 뒤에도 더할 수 있지만 NAT 2개는 클러스터를 만들 때만 정할 수 있다.
- 예산 화면에서 주 2회(월·목) 누적액을 본다. 예상 누적액(세금 포함)은 11/11 약 70달러, 11/16 약 170달러, 11/30 약 410달러, 12/11 약 605달러다. 10% 넘게 높으면 위 순서로 줄인다.

| 단계 | 시작 조건 | 하는 일 | 승인 |
|---|---|---|---|
| 0 준비(비용 0) | 지금 | 이 폴더의 파일 PR, 자동 배포 대상 변경 PR(#342), SNS 이메일·Slack 수신 시험, 비밀값 목록 정리, 개발 서버에서 LIVE worker 메모리 측정(가능하면) | PR 병합 |
| 1 생성 | ① 0단계 파일 PR이 dev에 병합됐다 ② 경보 수신 시험이 통과했다 ③ 생성 다음 날 확인할 시간이 있다 ④ 예산 한도 안이다 | 「1단계 만드는 순서」. **이때부터 하루 약 2.6만 원** | ① 생성 |
| 2 확인 | 1단계 다음 날 | 빈 DB로 지금 main 판본을 띄운다([k8s/README.md](k8s/README.md)). DNS는 그대로 두고 `curl --resolve`로 확인한다. #276 완료 기준 증거(「완료 기준 대응」)를 남기고 EKS 배포를 1회 돌린다 | ② 전환 실행 |
| 3 전환 | ① 2단계 확인이 모두 통과했다 ② 그 시각에 main 병합을 멈출 수 있다 ③ 팀장이 오전에 1~2시간을 낼 수 있다. 1단계 뒤 2~4일 안이 기본이다 | 전날 A 기록 TTL을 60초로 낮추고 정비 예정 작업을 조회한다. 당일에는 자동 배포를 끄고 진행 중인 실행이 0인지 본 뒤, 마지막 확인 → 개발 서버 앱 정지 → DNS를 ALB로 → 확인 | ③ DNS 직전 |
| 4 개발 서버 삭제 | 전환 뒤 48시간 동안 되돌릴 일이 없었다 | 「삭제 순서」의 A | ④ 삭제 |
| 5 기능 켜기 | 기능 판본이 main에 반영될 때마다 | 큐 연결 → Google 로그인 → 내부 조회 → GitHub 연결 → 결과 수신 → LIVE 분석 순서로 하나씩 켠다(#277). 켤 때마다 그 기능의 값을 실행 파일·Secret에 더하는 PR을 낸다. GitHub 연결을 켤 때 EFS 마운트 시험(1단계 4번)도 한다 | 기능별 |
| 6 검증 | #278·#279 판본이 나왔다(#280). 복원 시험은 12월 아무 날 | 두 API 검증, 백업 복원 시험(다른 이름으로 복원해 대조만 하고 바로 지움). 12/8까지 끝내고 증거를 내보낸다 | ⑤ |

판단 지점: 12/1이 되어도 전환하지 못했으면, 남은 검증(#277 최종·#280·복원 시험)을 12/8까지 끝낼 수 있는지 보고 전환을 계속할지 팀장이 정한다.

정비 시간대: RDS 백업 매일 02:00~02:30(17:00 UTC), RDS 정비 월 03:00~03:30(일 18:00 UTC), 큐 정비 화 03:30~04:30(월 18:30 UTC). 전환·삭제를 이 시간과 겹치게 잡지 않는다.

## 1단계 만드는 순서

1. **만들기 직전 확인(비용 0):**
   - 애드온·노드 이미지 판본을 다시 조회한다. 바뀌었으면 `cluster.yaml`을 고치는 PR을 먼저 올린다. vpc-cni를 1.22.4 계열 밖으로 바꾸면 NetworkPolicy 시험을 다시 한다.
     ```bash
     aws eks describe-addon-versions --kubernetes-version 1.37 --addon-name vpc-cni --profile catchu --region ap-northeast-2 --query 'addons[0].addonVersions[?compatibilities[0].defaultVersion].addonVersion'
     aws ssm get-parameter --name /aws/service/eks/optimized-ami/1.37/amazon-linux-2023/arm64/standard/recommended/release_version --profile catchu --region ap-northeast-2 --query Parameter.Value --output text
     ```
   - 서울 일반 vCPU 할당량이 64인지 본다(평소 노드 4 vCPU, 노드 패치 때 최대 12, 개발 서버와 겹치는 동안 최대 14): `aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --profile catchu --region ap-northeast-2 --query Quota.Value`
   - 설정 형식을 확인한다(「처음 준비」의 dry-run).
2. **로그 그룹을 먼저 만든다(다음 PR).** 관측 애드온은 이 파일에 아직 넣지 않았다. 수집기가 스스로 만드는 로그 그룹은 보존 기간이 '영구'라서, 보존 14일로 미리 만든 뒤 토큰 줄 버림 설정과 함께 애드온을 설치한다. 앱을 띄우기 전에 끝낸다.
3. **클러스터:** `bash deploy/aws/scripts/check-target.sh`로 계정 '일치'를 본 뒤 `eksctl create cluster -f deploy/aws/cluster.yaml --profile catchu`(약 20분). 끝나면 「처음 준비」대로 kubeconfig를 만들고 `bash deploy/aws/scripts/check-target.sh --cluster`로 확인한다.
4. **클러스터를 만든 뒤 확인하고 기록한다.** PR이나 이슈에 옮길 때는 계정 번호를 가린다.
   - 노드 2대가 Ready이고 영역이 2a·2c인지: `kubectl --kubeconfig ~/.kube/catchu get nodes -L topology.kubernetes.io/zone`
   - CoreDNS가 영역마다 하나인지: `kubectl --kubeconfig ~/.kube/catchu -n kube-system rollout restart deploy/coredns` 뒤 `kubectl --kubeconfig ~/.kube/catchu -n kube-system get pod -l k8s-app=kube-dns -o wide`. 노드가 차례로 붙으면서 한 노드에 몰릴 수 있어 다시 띄운 뒤 본다.
   - 접근 권한이 팀장 사용자와 노드 역할뿐이고 `aws-auth`가 없는지: `aws eks list-access-entries --cluster-name catchu --profile catchu --region ap-northeast-2`, `kubectl --kubeconfig ~/.kube/catchu -n kube-system get cm aws-auth`(없어야 함)
   - 노드 역할이 앱 비밀값을 읽지 못하는지(값은 읽지 않는 모의 판정, `explicitDeny`여야 함):
     ```bash
     role=$(aws eks describe-nodegroup --cluster-name catchu --nodegroup-name app --profile catchu --region ap-northeast-2 --query nodegroup.nodeRole --output text)
     acct=$(aws sts get-caller-identity --profile catchu --query Account --output text)
     aws iam simulate-principal-policy --profile catchu --policy-source-arn "$role" --action-names ssm:GetParameter ssm:GetParametersByPath secretsmanager:GetSecretValue --resource-arns "arn:aws:ssm:ap-northeast-2:${acct}:parameter/catchu/prod/api/AUTH_JWT_SECRET" --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output text
     ```
   - 영역별 NAT 경로(#276 완료 기준 증거): 프라이빗 서브넷마다 0.0.0.0/0이 같은 영역의 NAT를 가리키는지.
     ```bash
     vpc=$(aws eks describe-cluster --name catchu --profile catchu --region ap-northeast-2 --query cluster.resourcesVpcConfig.vpcId --output text)
     aws ec2 describe-nat-gateways --profile catchu --region ap-northeast-2 --filter "Name=vpc-id,Values=${vpc}" --query 'NatGateways[].[NatGatewayId,SubnetId,State]' --output text
     # 열: 연결된 서브넷, 0.0.0.0/0의 NAT, 0.0.0.0/0의 인터넷 게이트웨이
     aws ec2 describe-route-tables --profile catchu --region ap-northeast-2 --filters "Name=vpc-id,Values=${vpc}" --query 'RouteTables[].[join(`,`, Associations[].SubnetId || `[]`), Routes[?DestinationCidrBlock==`0.0.0.0/0`].NatGatewayId | [0], Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId | [0]]' --output text
     ```
   - 노드에 실제로 붙은 보안 그룹. RDS 5432·큐 6379·EFS 2049는 이 보안 그룹에서 오는 연결만 받는다. 하나면 스크립트가 알아서 쓰고, 둘 이상이면 스크립트가 멈추므로 쓸 것을 정해 여기에 적고 `CATCHU_NODE_SG=sg-…`로 넘긴다(노드에 실제로 붙은 것이 아니면 스크립트가 멈춘다): `aws ec2 describe-instances --profile catchu --region ap-northeast-2 --filters Name=tag:eks:nodegroup-name,Values=app Name=instance-state-name,Values=running --query 'Reservations[].Instances[].NetworkInterfaces[].Groups'`
   - EFS 드라이버 Pod가 AWS 권한 없이 Running인지: `kubectl --kubeconfig ~/.kube/catchu -n kube-system get pod -l app.kubernetes.io/name=aws-efs-csi-driver`. 실제 마운트 시험은 GitHub 연결을 켤 때 한다. 그때 접근점을 거친 TLS 마운트가 되는지와, 접근점 없이 마운트하거나 TLS 없이 마운트하면 거부되는지를 함께 본다. 드라이버 권한이 모자라 안 되면 `cluster.yaml`에 적은 대로 컨트롤러 서비스 계정에만 권한을 더한다. 접근점을 거친 마운트까지 거부되면 파일 시스템 정책의 접근점 조건이 IAM 없는 마운트에 맞지 않는 것이므로(문서로 확인하지 못한 부분) 그 조건을 어떻게 할지 팀장과 정한다.
5. **DB·큐·EFS·WAF:** 각각 확인 모드로 먼저 돌려 찾은 VPC·서브넷·노드 보안 그룹을 보고, 그다음 `--apply`로 만든다. 끝에 찍히는 확인 값을 증거로 남긴다.
   ```bash
   bash deploy/aws/scripts/create-rds.sh            # 확인만
   bash deploy/aws/scripts/create-rds.sh --apply    # 만듦(파라미터 반영 5분, DB는 최대 60분 기다림)
   bash deploy/aws/scripts/create-queue.sh --apply  # 큐 비밀번호는 SSM /catchu/prod/queue/auth-token(개발 서버와 같은 값)
   bash deploy/aws/scripts/create-efs.sh --apply    # 암호화 키 SSM은 있으면 그대로 쓰고, 없으면 만든다
   bash deploy/aws/scripts/create-waf.sh --apply    # ALB에는 Ingress 주석(이름 catchu-edge)으로 붙인다(k8s/ingress.yaml)
   ```
   큐는 SNS 주제 `catchu-alerts`가 있으면 장애 조치 같은 이벤트를 그 주제로 보낸다. 없으면 알림 없이 만들고 나중에 붙인다.
6. **다음 PR에서 이어서:** ACM 인증서·Route 53, Load Balancer Controller(Helm 차트 3.6.0), 경보. Secret·ConfigMap, DB 계정(앱 계정 `lock_timeout` 3초, `idle_in_transaction_session_timeout`은 #220에서 정할 값), 앱 실행 파일과 교체는 2단계에서 [k8s/README.md](k8s/README.md)대로 한다.

## 생성이 중간에 멈췄을 때

생성 스크립트는 만들 자원이 하나라도 이미 있으면 멈추므로, 중간에 멈춘 뒤에는 그냥 다시 실행해도 진행되지 않는다. 멈춘 곳에 따라 아래처럼 한다. 명령의 `…`는 `--profile catchu --region ap-northeast-2`를 줄인 것이다.

- **DB·큐·파일 시스템을 만들기 전에 멈춤:** 앞서 만든 파라미터 그룹·서브넷 그룹·보안 그룹만 남는다. 요금이 없는 자원이다. 다시 실행하면 남은 것을 보여 주니, 그것을 지운 뒤 다시 실행한다.
  - RDS: `aws rds delete-db-subnet-group --db-subnet-group-name catchu-db …`, `aws rds delete-db-parameter-group --db-parameter-group-name catchu-pg16 …`, `aws ec2 delete-security-group --group-id <보안 그룹 ID> …`
  - 큐: `aws elasticache delete-cache-subnet-group --cache-subnet-group-name catchu-queue …`, `aws elasticache delete-cache-parameter-group --cache-parameter-group-name catchu-valkey8-noeviction …`, 보안 그룹은 위와 같다.
  - EFS: 보안 그룹만 남았으면 그것을 지운다. 파일 시스템까지 만들었으면 「삭제 순서」 B의 5번(마운트 지점 → 접근점 → 파일 시스템)대로 지운 뒤 보안 그룹을 지운다.
- **만든 뒤 기다리다 멈춤(DB 60분, 큐 40분, EFS 파일 시스템·마운트 지점 각 5분):** AWS에서는 계속 만들고 있을 수 있다. 다시 실행하지 말고 상태를 본다(`aws rds describe-db-instances --db-instance-identifier catchu-db --query 'DBInstances[0].DBInstanceStatus' …`, `aws elasticache describe-replication-groups --replication-group-id catchu-queue --query 'ReplicationGroups[0].Status' …`, `aws efs describe-mount-targets --file-system-id <fs> …`). available이 되면 그대로 쓰고, 확인 값은 그 스크립트 안 `show_evidence`의 조회를 그대로 실행해 남긴다. failed처럼 실패한 상태면 「삭제 순서」 B의 그 자원 줄(RDS는 6·8번, 큐는 7·8번, EFS는 5·8번)대로 지운 뒤 다시 실행한다.
- WAF는 웹 ACL 하나를 한 번에 만들므로 중간 상태가 없다.

## 쿠버네티스 실행 파일과 앱 교체

2단계부터 쓰는 쿠버네티스 실행 파일(namespace·NetworkPolicy·Service·Ingress·Deployment·migration 일회 Pod)과 교체 스크립트 `deploy.sh`의 내용·적용 순서·확인·종료 코드는 [k8s/README.md](k8s/README.md)에 있다. 실행 파일이 읽는 Secret·ConfigMap의 이름과 키도 거기 정했다.

## 노드 작업

- **패치 확인:** 주 1회 위 노드 이미지 공개 파라미터와 `aws eks describe-nodegroup --cluster-name catchu --nodegroup-name app --profile catchu --region ap-northeast-2 --query nodegroup.releaseVersion`을 비교한다. 새 판에 보안 공지 Important·Critical이나 containerd·kubelet 수정이 있으면 패치 시간을 잡는다. 아니면 운영 중 1회로 제한한다.
- **패치 방법:** 자동 배포를 끄고 web·api·worker를 0으로 줄여 종료를 확인한 뒤 `eksctl upgrade nodegroup --cluster catchu --name app --profile catchu`를 실행한다. 새 노드를 먼저 띄우고 옛 노드를 한 대씩 비운다. 앱 중단은 업그레이드 전체 시간이므로 처음 할 때 시작·끝 시각을 기록한다. 앱 Pod에는 중단 허용 한도(PDB)를 두지 않는다(두면 비우기가 막혀 업그레이드가 실패한다). 자세한 절차는 다음 PR.
- **비상 3대째:** `eksctl scale nodegroup --cluster catchu --name app --nodes 3 --nodes-max 3 --profile catchu`. 노드 수를 바꾸는 이 명령은 PDB를 지키지 않고 어느 노드를 끝낼지도 고를 수 없다. 그래서 2대로 되돌리기 전에 web·api·worker를 0으로 줄여 종료를 확인하고, 줄인 뒤 다시 올린다.

## 삭제 순서

명령마다 `--profile catchu`(us-east-1은 `--region us-east-1`)와 `--kubeconfig ~/.kube/catchu`를 붙인다. 아래에서 `…`는 `--profile catchu --region ap-northeast-2`를 줄인 것이다. 각 단계를 시작하기 전에 `bash deploy/aws/scripts/check-target.sh`(kubectl·helm을 쓰는 B는 `--cluster`)로 '일치'를 본다.

**A. 개발 서버(4단계, 전환 뒤 48시간 지나 승인 ④를 받은 뒤)**

1. main 자동 배포가 개발 서버를 가리키지 않는지 본다(#342).
2. Route 53 A 기록이 이미 ALB 별칭인지 본다.
3. 개발 서버를 **이름 태그**로 찾아 ID·인스턴스 프로필·보안 그룹을 적어 둔다. EKS 노드에도 `project=catchu` 태그가 붙으므로 그 태그로 고르지 않는다. 한 대뿐이고 인스턴스 프로필이 `catchu-dev-server`인지 본다.
   ```bash
   aws ec2 describe-instances --profile catchu --region ap-northeast-2 --filters Name=tag:Name,Values=catchu-dev-server Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[].Instances[].[InstanceId, IamInstanceProfile.Arn, join(`,`, SecurityGroups[].GroupId)]' --output text
   ```
   그 ID로 `aws ec2 terminate-instances --instance-ids <ID> …` → `aws ec2 wait instance-terminated --instance-ids <ID> …`. 루트 볼륨은 함께 지워진다.
4. 개발 서버의 탄력적 IP(`aws ec2 describe-addresses … --filters Name=tag:Name,Values=catchu-dev-server --query 'Addresses[].AllocationId' --output text`)를 `aws ec2 release-address --allocation-id <ID> …`로 해제하고, 3에서 적은 보안 그룹을 지운다. 종료가 끝나기 전에는 의존이 남아 실패한다.
5. IAM: 인스턴스 프로필에서 역할 `catchu-dev-server`를 빼고 → 관리형 정책 분리 → 인라인 정책(`catchu-prod-parameters-read`·`catchu-dev-deny-parameter-read`) 삭제 → 역할·인스턴스 프로필 삭제.
6. SSM 문서 `catchu-dev-deploy`, 개발 서버 배포 역할 `catchu-github-deploy`, GitHub environment `dev-server`, ECR `catchu-deploy-files`(EKS 배포가 쓰지 않으면)를 지운다(#342 결정에 따름).
7. 확인(개발 서버 자원만): 이름 태그 `catchu-dev-server` 인스턴스가 terminated뿐, 그 이름의 탄력적 IP 0, 3에서 적은 보안 그룹 없음, `aws iam get-role --role-name catchu-dev-server --profile catchu`가 NoSuchEntity, 상태 available인 볼륨 0, 자기 소유 스냅샷 0. EKS 노드와 NAT의 공인 IP는 B까지 남는 것이 정상이다. #276 완료 기준(개발 서버 삭제)의 증거다.

**B. EKS 기간 자원(제출을 확인한 뒤 지원 기한 전)**

순서가 중요하다. Load Balancer Controller가 살아 있을 때 Ingress를 지워야 ALB가 정리되고, RDS·큐·EFS·직접 만든 보안 그룹이 VPC에 남아 있으면 eksctl의 VPC 삭제가 실패한다. 지우는 요청은 바로 끝나지 않으므로 표시한 곳에서 실제로 없어질 때까지 기다린다.

1. 자동 배포를 끄고 web·api·worker를 0으로 줄인다.
2. Ingress의 주석을 `alb.ingress.kubernetes.io/load-balancer-attributes: deletion_protection.enabled=false`로 적용하고 `aws elbv2 describe-load-balancer-attributes …`에서 false인지 본다. 삭제 보호가 켜져 있으면 컨트롤러가 ALB를 지우지 못한다.
3. `kubectl --kubeconfig ~/.kube/catchu -n catchu delete ingress --all` → `aws elbv2 describe-load-balancers …`·`describe-target-groups …`에서 `k8s-` 항목과 컨트롤러가 만든 보안 그룹이 0이 될 때까지 기다린다.
4. WAF 웹 ACL `catchu-edge`(ALB에 붙어 있는 동안은 지워지지 않는다) → ACM 인증서 → Route 53의 ALB 별칭·인증서 검증 기록(호스팅 영역은 남김).
5. EFS: 마운트 지점 2개를 지우고 `aws efs describe-mount-targets --file-system-id <fs> …`가 빈 목록이 될 때까지 기다린다 → 접근점 → 파일 시스템.
6. RDS: `aws rds modify-db-instance --db-instance-identifier catchu-db --no-deletion-protection --apply-immediately …` → `aws rds delete-db-instance --db-instance-identifier catchu-db --skip-final-snapshot --delete-automated-backups …` → **`aws rds wait db-instance-deleted --db-instance-identifier catchu-db …`**(30분까지만 기다리므로, 시간이 다 됐다고 나오면 같은 명령을 다시 실행한다) → 서브넷 그룹 `catchu-db`·파라미터 그룹 `catchu-pg16`. 마지막 스냅샷을 남길지는 그때 팀장이 정한다(남기면 그만큼 요금이 계속 나간다). RDS가 관리하는 관리자 비밀번호는 인스턴스와 함께 지워진다.
7. 큐: `aws elasticache delete-replication-group --replication-group-id catchu-queue …`(마지막 스냅샷 없이) → **`aws elasticache wait replication-group-deleted --replication-group-id catchu-queue …`**(10분까지만 기다리므로, 시간이 다 됐다고 나오면 같은 명령을 다시 실행한다) → 서브넷 그룹 `catchu-queue`·파라미터 그룹 `catchu-valkey8-noeviction`.
8. 직접 만든 보안 그룹 `catchu-db`·`catchu-queue`·`catchu-efs`.
9. `helm uninstall aws-load-balancer-controller -n kube-system --kubeconfig ~/.kube/catchu`
10. `eksctl delete cluster -f deploy/aws/cluster.yaml --wait --profile catchu`(노드 그룹·애드온·Pod Identity 역할·NAT와 그 공인 IP·VPC).
11. 서울의 경보·대시보드·지표 필터·로그 데이터 보호 정책·로그 그룹·SNS 주제, us-east-1의 상태 확인·경보·SNS 주제.
12. GuardDuty 탐지기·IAM Access Analyzer, ECR 저장소(이미지가 있으면 `--force`), SSM `/catchu/*`, EKS 배포 역할·GitHub environment·OIDC 공급자(#342 결정에 따름).
13. **남은 자원 0 확인.** 태그 조회는 태그 없는 자원과 다른 리전을 놓치므로 서비스별로 조회한다. 다음 날 예산 화면에서 누적액이 멈췄는지 본다. 남는 요금은 지우지 않기로 한 Route 53 호스팅 영역(월 0.5달러)뿐이어야 한다. 아래 두 함수는 zsh·bash 모두에서 쓸 수 있다.
    ```bash
    a() { aws "$@" --profile catchu --region ap-northeast-2; }   # 서울
    u() { aws "$@" --profile catchu --region us-east-1; }        # us-east-1
    a eks list-clusters
    a ec2 describe-instances --filters Name=tag:project,Values=catchu Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[].Instances[].InstanceId'
    a elbv2 describe-load-balancers; a elbv2 describe-target-groups
    a wafv2 list-web-acls --scope REGIONAL
    a rds describe-db-instances; a rds describe-db-snapshots; a rds describe-db-instance-automated-backups
    a elasticache describe-replication-groups; a elasticache describe-snapshots
    a efs describe-file-systems
    a ec2 describe-nat-gateways --filter Name=state,Values=available; a ec2 describe-addresses
    a ec2 describe-volumes --filters Name=status,Values=available; a ec2 describe-snapshots --owner-ids self
    a ec2 describe-security-groups --query "SecurityGroups[?starts_with(GroupName, 'catchu') || starts_with(GroupName, 'k8s-') || starts_with(GroupName, 'eks')].GroupName"
    a ec2 describe-vpcs; a ec2 describe-network-interfaces; a ec2 describe-vpc-endpoints
    a cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED
    a logs describe-log-groups; a secretsmanager list-secrets; a acm list-certificates
    a ecr describe-repositories; a ssm describe-parameters --parameter-filters Key=Name,Option=BeginsWith,Values=/catchu/
    a guardduty list-detectors; a accessanalyzer list-analyzers
    a cloudwatch describe-alarms; a sns list-topics
    u cloudwatch describe-alarms; u sns list-topics
    aws route53 list-health-checks --profile catchu
    ```
    기본 VPC와 그 보안 그룹처럼 계정에 처음부터 있던 것은 남는다. `catchu`·`eksctl-catchu`·`k8s-`가 붙은 것이 없는지를 본다.

## 시험

```bash
bash deploy/aws/scripts/create-scripts.test.sh
bash deploy/aws/scripts/deploy.test.sh
bash deploy/aws/scripts/secrets.test.sh
bash deploy/aws/scripts/db-roles.test.sh   # Docker가 돌고 있어야 한다
```

**생성 스크립트(`create-scripts.test.sh`).** bash·jq·aws CLI v2가 필요하고 30초쯤 걸린다. aws·kubectl·sleep을 합성 명령으로 바꿔 네 생성 스크립트와 공통 확인을 실제로 실행한다.

- 확인하는 것: 인자 없이 실행하면 만드는 호출이 없음, `--apply`의 호출 순서와 필수 옵션(RDS Multi-AZ·저장 암호화·삭제 보호·백업 7일, 큐 복제본·TLS 필수·스냅샷 0, EFS 암호화·백업 끔·만든 접근점과 TLS만 허용하는 정책, WAF 요청 표본 끔), 계정·리전·키 환경변수·kubeconfig가 다르면 멈춤, 노드 보안 그룹 검증, 조회 실패 때 멈춤, 만들 자원이 하나라도 이미 있으면(일부만 남은 경우 포함) 아무것도 만들지 않고 멈춤, 기다리기가 한도에 닿으면 정한 횟수만큼 이어서 기다리고 그래도 안 되면 멈춤, 비밀값이 출력과 임시 파일에 남지 않음.
- 만들기 시험에서는 진짜 AWS CLI를 합성 키와 닫힌 로컬 주소(`127.0.0.1:9`)로 실행해, 옵션 이름·값 형식·입력 파일을 CLI가 받아들이는지도 본다.
- 확인하지 못하는 것: AWS 서버 쪽 검사(함께 쓸 수 없는 옵션, 이름 규칙, 권한, 할당량)와 실제로 만들어진 자원의 설정. 이것은 1단계에서 각 스크립트가 끝에 찍는 확인 값으로 본다.

나머지 세 시험은 [k8s/README.md](k8s/README.md) 「시험」에 적었다. 네 시험은 CI에 아직 넣지 않았다. 이 폴더를 바꾸면 손으로 돌린다.

## 완료 기준 대응

#276 완료 기준마다 어떤 증거를 어디서 남기는지다. 증거는 단계를 마칠 때 #276 댓글이나 해당 PR에 남기고 계정 번호는 가린다.

| #276 완료 기준 | 남길 증거 | 단계 | 이 폴더의 근거 |
|---|---|---|---|
| 서비스·사양·권한·할당량·비용·사용 기간·종료 절차를 확인하고 합의한 구성으로 자원 준비 | vCPU 할당량 조회, 생성 스크립트의 확인 값, 예산 누적액, 이 문서의 삭제 순서 | 0·1 | `cluster.yaml`, `scripts/` 전체, 「삭제 순서」 |
| API·migration만 DB 접속, worker·외부는 직접 접속 불가 | RDS 공개 접근 끔·보안 그룹(노드에서 5432만), 실제 Deployment Pod에서 한 NetworkPolicy 접속 시험 | 1·2 | `create-rds.sh`, `k8s/network-policy.yaml`(worker에는 5432가 없다) |
| worker 나가는 연결을 허용 대상·경로로 제한 | 실제 worker Pod의 허용·거부 시험 | 2 | `k8s/network-policy.yaml` |
| 앱·migration 계정 분리, 암호화·신뢰 CA·인증서·호스트명 검증 | RDS 확인 값(저장 암호화, CA `rds-ca-rsa2048-g1`), 파라미터(`rds.force_ssl=1`, TLS 1.2 이상), 계정 SQL 결과, `PGSSLMODE=verify-full` 접속 | 1·2 | `create-rds.sh`, `k8s/`(api는 `catchu_app`, migration은 `catchu_migrator`, 둘 다 `verify-full`), `db/roles.sql`(계정 SQL 결과 표), `db/rds-ca-rsa2048-g1.pem` |
| 앱 계정 `lock_timeout`·`idle_in_transaction_session_timeout` 적용, 동의 기록 직접 삭제 권한 없음 | 앱 계정 새 연결의 `SHOW` 결과, 권한 확인 SQL 결과 | 2 | `db/roles.sql`(`lock_timeout` 3초). `idle_in_transaction_session_timeout`은 #220에서 정하면 더한다(RDS 기본값 24시간). 동의 기록 삭제 권한은 다음 PR(`deploy.sh`) |
| 큐 `noeviction`, 키트 시나리오, 재시작·장애 조치 뒤 재접속 | 큐 확인 값(`maxmemory-policy noeviction`, TLS·비밀번호·스냅샷 0), #77 키트 결과 | 1·2 | `create-queue.sh` |
| ALB TLS 종료·80→443·사설 서비스 접근 제한·신뢰 프록시 대역 | `curl -sI http://catchu.dev/`가 https로 이동, TLS 1.1 접속 거부(`openssl s_client -tls1_1`), 바깥 확인(`/v1/INTERNAL/x`, `/v1/Internal/…`, `/V1/internal/x`, `/v1//internal/x`, `/v1/%69nternal/x` 모두 404), ALB 규칙 우선순위, 퍼블릭 서브넷 대역 | 2 | `create-waf.sh`·`waf/`, `k8s/ingress.yaml` |
| 관리형 DB 자동 백업·보관 기간·암호화·열람 권한 제한 | RDS 확인 값(백업 7일, 저장 암호화, 삭제 보호, 태그 스냅샷 복사), 스냅샷이 공개·공유되지 않음(`aws rds describe-db-snapshot-attributes`), AWS 권한을 가진 IAM 사용자가 팀장 한 명뿐임(`aws iam list-users`) | 1 | `create-rds.sh` |
| 비밀값·짧은 Access 토큰 수명·로그 수집/보관·토큰 가림·경보 | 노드 역할 모의 판정 `explicitDeny`, 서비스별 Secret 이름 목록(값 아님), api 실행 값 `AUTH_ACCESS_TOKEN_TTL_SECONDS=900`, 로그 그룹 보존 14일, 가짜 표식 0건, 경보 수신 | 0·1·2 | `cluster.yaml`(노드 역할 거부), `k8s/api.yaml`(Access 토큰 900초), `make-secrets.sh`(Secret 이름·키=SSM 판 번호 출력). 로그·경보는 다음 PR |
| RDS·큐 장애 조치 뒤 api·worker 재연결, 가용 영역별 NAT 경로 | 「1단계 만드는 순서」의 NAT 경로 조회, `check-target.sh` 뒤 `aws rds reboot-db-instance --db-instance-identifier catchu-db --force-failover --profile catchu --region ap-northeast-2`와 `aws elasticache test-failover --replication-group-id catchu-queue --node-group-id 0001 --profile catchu --region ap-northeast-2`, 그 뒤 api·worker 상태 | 1·2 | `cluster.yaml`(NAT 2개), `create-rds.sh`(Multi-AZ), `create-queue.sh`(복제본·자동 장애 조치) |
| EKS로 옮긴 뒤 개발 서버 삭제, 과금 자원 없음 | 「삭제 순서」 A의 7번 조회 결과 | 4 | 「삭제 순서」 |

이 폴더가 다른 이슈에 주는 것: EKS에서 API 한 실행·worker 한 실행과 교체 중 겹침 방지(#275 완료 기준 4, `k8s/`·`deploy.sh`. 실제 확인은 2단계), Google 로그인 시작 경로의 앞단 제한(#277, `create-waf.sh`. 한 주소에서 1분 동안 60번 보내 2분 안에 429가 나오는지 시험. WAF는 요청 수를 근삿값으로 세고 감지가 늦어 정확히 21번째에 막히지 않는다), 운영 개발 로그인 거부·재배포 뒤 자료 유지 확인 스크립트(#277, 다음 PR), 두 API 실행 틀(#280, 다음 PR).
