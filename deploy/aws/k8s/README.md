# CatchU EKS 실행 파일과 앱 교체

EKS(#276)에서 web·api·worker를 띄우는 쿠버네티스 실행 파일과 교체 스크립트 [`deploy.sh`](../scripts/deploy.sh)의 사용법이다. 단계·승인 지점·처음 준비(프로필·기대 계정 번호·kubeconfig)는 [../README.md](../README.md)를 따른다. 이미지와 migration·교체의 공통 규칙은 [../../README.md](../../README.md)에 있다.

**AWS 자원이 없는 지금은 적용하지 않는다.** 처음 적용은 2단계(빈 DB로 지금 main 판본을 띄워 확인)다. 모두 namespace `catchu`에 들어가고, 그 뒤에는 바뀔 때만 다시 적용한다.

## 파일

| 파일 | 적용 | 내용 |
|---|---|---|
| [`namespace.yaml`](namespace.yaml) | 손으로 | Pod 보안 검사 `restricted`(호스트 망·특권·root로 도는 Pod 거부), ALB 상태 확인을 통과해야 web·api Pod가 준비되는 연동, 기본 서비스 계정의 쿠버네티스 API 토큰 자동 탑재 끔 |
| [`network-policy.yaml`](network-policy.yaml) | 손으로 | 기본은 모두 막고 필요한 것만 연다. web은 ALB에서 3000만 받는다. api는 ALB·worker에서 3001을 받고 DB·큐와 바깥 443으로 나간다. worker는 api 3001·큐·GitHub API·Anthropic API 대역으로만 나간다(DB 없음). migration은 DB로만 나간다. 모두 DNS는 연다 |
| [`services.yaml`](services.yaml) | 손으로 | web·api의 클러스터 안 주소. 바깥으로 여는 Service는 두지 않는다 |
| [`ingress.yaml`](ingress.yaml) | 손으로 | 공개 ALB. 80은 443으로 이동(301), TLS 1.2·1.3만, `/v1/internal`은 404, `/v1`은 api, 그 밖은 web, HSTS 300초, 유휴 60초, 삭제 보호, WAF `catchu-edge` |
| [`api.yaml`](api.yaml)·[`worker.yaml`](worker.yaml)·[`web.yaml`](web.yaml) | `deploy.sh`만 | api·worker는 한 개씩 `Recreate`, web은 새 Pod를 먼저 띄우고 옛 Pod를 내린다. 모두 UID 1000·읽기 전용 루트·권한 전부 제거·`/tmp` 크기 상한, 자원 요청과 메모리 상한(worker는 실제 분석을 재기 전의 임시값) |
| [`migration-pod.yaml`](migration-pod.yaml) | `deploy.sh`만 | migration 일회 Pod 틀. controller 없이 한 번 실행하고 다시 띄우지 않으며 10분 한도가 있다 |

Deployment 파일은 이미지·실행 수·커밋 자리를 비워 둔 틀이다. 그대로 `kubectl apply`하면 실행 수 자리가 숫자가 아니어서 거부된다. 운영 중인 판본을 덮지 않게 하려는 것이다. 이미지는 `deploy.sh`가 그때그때 넣으므로 저장소에는 digest를 적지 않는다.

## Secret과 ConfigMap

실행 파일은 아래 이름과 키를 읽는다. 값은 SSM `/catchu/prod/*`에서 만들고 저장소·화면에 남기지 않는다. 만드는 스크립트는 다음 PR이다. web은 비밀값을 받지 않고, worker에는 DB 값을 주지 않는다.

| 이름 | 종류 | 키 | 쓰는 곳 |
|---|---|---|---|
| `catchu-db` | ConfigMap | `DB_HOST`(RDS 주소), `ca.pem`(RDS CA 묶음) | api·migration |
| `catchu-api` | Secret | `AUTH_JWT_SECRET`, `LINK_GRANT_SECRET`, `DB_PASSWORD`(앱 계정 `catchu_app`) | api |
| `catchu-migration` | Secret | `DB_PASSWORD`(migration 계정 `catchu_migrator`) | migration |
| `catchu-worker` | Secret | `CATCHU_QUEUE_REDIS_URL`(`rediss://`, 비밀번호 포함), `WORKER_CONTEXT_API_KEY`, `CATCHU_GENERATION_API_KEY` | worker |

꺼 둔 기능(Google 로그인·GitHub 연결·worker 요청 정보 조회·api 큐 연결)은 켤 때 그 값을 api 실행 파일과 Secret에 더하는 PR을 낸다([../README.md](../README.md) 5단계). GitHub 연결은 EFS 보관 폴더도 함께 붙인다.

## 적용(2단계)

**적용 전 확인.** NetworkPolicy와 api의 `TRUST_PROXY_CIDRS`에는 eksctl이 `cluster.yaml`로 정하는 대역을 적어 두었다(퍼블릭 192.168.0.0/19·192.168.32.0/19, 프라이빗 192.168.64.0/19·192.168.96.0/19). 클러스터를 만든 뒤 실제 대역과 같은지 본다. 다르면 두 파일을 고치는 PR을 먼저 낸다.

```bash
vpc=$(aws eks describe-cluster --name catchu --profile catchu --region ap-northeast-2 --query cluster.resourcesVpcConfig.vpcId --output text)
aws ec2 describe-subnets --profile catchu --region ap-northeast-2 --filters "Name=vpc-id,Values=${vpc}" --query 'Subnets[].[AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' --output text
```

**순서.** 시작 전에 `bash deploy/aws/scripts/check-target.sh --cluster`로 '일치'를 본다. 아래 `k`는 zsh·bash 모두에서 쓸 수 있는 줄임이다.

```bash
k() { kubectl --kubeconfig ~/.kube/catchu --namespace catchu "$@"; }
kubectl --kubeconfig ~/.kube/catchu apply -f deploy/aws/k8s/namespace.yaml
k apply -f deploy/aws/k8s/network-policy.yaml -f deploy/aws/k8s/services.yaml
# Secret·ConfigMap 만들기(다음 PR)
k apply -f deploy/aws/k8s/ingress.yaml   # Load Balancer Controller·catchu.dev ACM 인증서(발급 완료)·WAF가 있은 뒤
bash deploy/aws/scripts/deploy.sh --commit <main 커밋 40자>
```

손으로 적용하는 파일을 바꿀 때도 그 파일만 같은 명령으로 다시 적용하고, 그동안은 자동 배포를 꺼 둔다. Ingress를 지웠다 다시 만들면 ALB 주소가 바뀌어 Route 53 별칭을 다시 맞춰야 하므로 지우지 않는다(지우는 것은 [../README.md](../README.md) 「삭제 순서」 B뿐이다).

**확인(완료 기준 2·3의 증거).** 직접 만든 시험 Pod가 아니라 실제 Deployment Pod에서 본다. controller 없이 만든 Pod에는 NetworkPolicy가 믿을 만하게 걸리지 않을 수 있어서다.

- worker: GitHub API·Anthropic API 443은 연결되고, 그 밖의 바깥 주소와 RDS 5432는 막힌다. 예: `k exec deploy/worker -- /app/worker/.venv/bin/python -c "import socket; socket.create_connection(('example.com', 443), 5)"`가 시간 초과로 실패해야 한다.
- web: RDS 5432·큐 6379가 막힌다.
- Pod 보안 검사: 호스트 망 Pod가 거부된다. `k run psa-test --image=registry.k8s.io/pause:3.10 --dry-run=server --overrides='{"spec":{"hostNetwork":true}}'`
- kubelet의 상태 확인이 NetworkPolicy에 막히지 않는다(세 Deployment가 준비 상태가 되면 된다).

**한계.** NetworkPolicy는 새 Pod가 뜬 직후 몇 초 동안 걸리지 않는다(VPC CNI 기본 모드, #276 계획에서 받아들인 한계). 노드·호스트 망 Pod·다른 namespace의 Pod는 이 정책 밖이다. 그래서 worker의 DB 차단은 세 겹으로 둔다: NetworkPolicy, worker에 DB 비밀번호를 주지 않음, DB의 TLS와 계정.

## worker 바깥 연결 대역 갱신

GitHub API 대역은 GitHub가 바꿀 수 있다. worker 수집이 시간 초과로 막히면 다시 받아 [`network-policy.yaml`](network-policy.yaml)의 worker 목록과 비교한다.

```bash
curl -fsS https://api.github.com/meta | jq -r '.api[] | select(contains(":") | not)' | sort -u
```

다르면 목록을 고치는 PR을 내고, 병합 뒤 그 파일만 다시 적용한 다음 worker Pod에서 api.github.com 443 연결을 확인한다.

## 앱 교체(deploy.sh)

```bash
bash deploy/aws/scripts/check-target.sh --cluster
bash deploy/aws/scripts/deploy.sh --commit <main 커밋 40자>
```

- **입력은 커밋 하나다.** 이미지는 ECR 네 저장소에서 태그 `main-<커밋 앞 12자>`(main 자동 배포가 올린 태그)의 digest로 띄운다. Deployment·migration 틀은 그 커밋의 `deploy/aws/k8s/` 파일을 git에서 읽는다. 그래서 배포할 커밋이 로컬 저장소에 있어야 하고(`git fetch origin main`), 그 커밋에 이 실행 파일이 들어 있어야 한다. `deploy.sh` 자신은 지금 작업 폴더의 판을 쓴다.
- **같은 판본·구성이 이미 정상으로 돌면 아무것도 바꾸지 않는다.**
- **순서:** ① 시작 전 확인(계정·클러스터, 이미지 네 개, 실행 파일, 기본 차단 NetworkPolicy와 ConfigMap `catchu-db`) → ② 옛 api·worker를 0으로 줄이고 없어질 때까지 기다린 뒤 종료 코드를 본다(web은 그대로 둔다) → ③ migration 일회 Pod `catchu-migrate-<커밋 앞 12자>`를 한 번 실행한다. 같은 이미지로 이미 성공한 같은 이름의 Pod가 있으면 건너뛴다 → ④ api → worker → web 순서로 적용하고 하나씩 준비되기를 기다린 뒤, 셋이 모두 정상인지 다시 본다.
- **중단 시간:** ②부터 ④의 api 준비까지 api·worker가 없다. 그동안 `/v1` 요청은 ALB가 503으로 돌려준다(화면은 뜬다). 분석 중이던 작업은 worker가 실패로 남기고 처리 시한에 닫힌다([../../README.md](../../README.md) 「계획 교체」).
- **기록:** 출력 끝의 「교체 기록」(커밋, 대상 DB, 이미지 digest, 옛 실행의 종료 코드, migration Pod의 uid·종료 코드·시각)을 남긴다. migration Pod는 지우지 않으므로 전체 로그는 `k logs catchu-migrate-<커밋 앞 12자>`로 다시 볼 수 있다. 출력에는 계정 번호가 들어가지 않는다(이미지 주소 대신 digest만 찍는다).
- **되돌리기:** 이전 main 커밋으로 다시 실행한다. **이전 이미지가 지금 DB 스키마와 호환될 때만** 한다. migration은 되돌리지 않는다([../../README.md](../../README.md) 「실패 시 정지와 되돌리기」).

| 종료 코드 | 상태와 다음 행동 |
|---|---|
| 0 | 교체 완료, 또는 바꿀 것 없음 |
| 2 | 시작 전 확인에서 멈췄다. 아무것도 바꾸지 않았다. 출력의 원인(입력·계정·클러스터·이미지·실행 파일·조회 실패)을 고친 뒤 다시 실행한다. api·worker가 0으로 멈춰 있어서 멈춘 것이면 아래 `--resume` |
| 3 | 옛 api·worker의 종료를 확인하지 못했다(남은 Pod, 종료 코드를 모름, 조회·멈추기 실패). migration·새 실행은 시작하지 않았다. `k get pod -o wide`로 남은 Pod와 그 노드를 본다. 강제로 지우지 않는다 |
| 4 | migration 실패. Pod를 남겨 두었다. 그 로그와 DB의 `migrations` 표를 확인하기 전에는 다시 실행하지 않는다 |
| 5 | migration 결과 불명(만들기 요청 실패·시간 초과·조회 실패), 또는 같은 이름의 Pod가 성공 아닌 상태로 남아 있다. 실행 상태와 DB 적용 이력을 대조해 담당자가 판단하고, 확인한 뒤 그 Pod를 직접 지운다 |
| 6 | 새 실행이 준비되지 않았다. api·worker를 다시 멈추고 종료를 확인했다. `k describe pod`·`k logs`로 원인을 본다 |
| 7 | 옛 실행이 종료 유예 안에 끝나지 않아 강제 종료(137)됐다. 분석 중이던 작업이 실패로 기록되지 않았을 수 있으니 큐 상태를 본다 |

3~7로 멈추면 api·worker는 0으로 멈춘 채다. 다음 실행은 이 상태를 보고 2로 멈추므로, 원인을 확인한 뒤 `--resume`을 붙여 다시 실행한다. 자동 배포(#342)의 다음 실행도 결과를 확인하기 전에는 덮어쓰지 않는다.

- **자동 배포(#342)에서 쓸 때 맞출 것:** 이 스크립트는 프로필 `catchu`, kubeconfig `~/.kube/catchu`, 기대 계정 번호를 전제로 한다([../README.md](../README.md) 「처음 준비」). 배포 역할에 필요한 권한은 ECR 네 저장소 조회, `eks:DescribeCluster`, namespace `catchu`의 Deployment 조회·적용과 실행 수 바꾸기, Pod 조회·감시·만들기와 로그 읽기, NetworkPolicy·ConfigMap 조회다. Secret 읽기와 exec는 필요 없다.
- **확인하지 못한 것(2단계에서 본다):** 실제 API 서버의 스키마와 Pod 보안 검사 통과, 실제 노드에서 끝난 옛 실행의 종료 코드가 감시 출력에 오는지(출력 모양은 kubectl 1.37.1을 이 컴퓨터의 가짜 API에 붙여 확인했다), 실제 준비·중단 시간.

## 시험

```bash
bash deploy/aws/scripts/deploy.test.sh
```

bash·jq·git·ruby가 필요하고 30초쯤 걸린다. kubectl·aws·sleep을 합성 명령으로 바꾸고, 지금 작업 폴더의 `deploy.sh`·이 폴더로 만든 합성 git 저장소에서 `deploy.sh`를 실제로 실행한다. AWS·클러스터에는 닿지 않는다.

- 확인하는 것: 처음 설치와 교체의 순서(옛 api·worker 멈춤 → migration → api → worker → web), 같은 판본·구성이면 아무것도 바꾸지 않음, 멈춘 상태에서 `--resume` 없이는 멈춤, 시작 전 확인이 하나라도 어긋나면 아무것도 바꾸지 않고 2, 종료 확인 실패 3(늦게 오는 종료 코드는 기다림), 강제 종료 7, migration 실패 4·결과 불명 5·같은 이름 Pod 처리, 새 실행 실패 때 api·worker를 다시 멈추고 6, 출력에 계정 번호가 없음.
- 실행 파일 조건: `deploy.sh`가 자리를 채운 Deployment·migration Pod와 손으로 적용하는 파일을 Ruby(YAML→JSON)·jq로 읽는다. api·worker 한 개·`Recreate`, web 교체 방식, UID 1000·읽기 전용 루트·권한 제거·seccomp·토큰 자동 탑재 끔·호스트 망 없음, `/tmp` 크기 상한, 자원 요청과 메모리 상한(CPU 상한 없음), 이미지 digest, 비밀값은 Secret에서만, worker에 DB 값 없음, Service 포트, NetworkPolicy·Ingress 규칙, 계정 번호 없음.
- 합성 kubectl의 감시 출력은 kubectl 1.37.1을 이 컴퓨터의 가짜 API에 붙여 확인한 모양을 흉내 낸다. 탭은 공백으로 바뀌고, `range` 안에서 없는 값을 만나면 첫 객체 뒤 오류로 끝난다. `deploy.sh`가 그 밖의 식을 쓰면 시험이 실패한다.
- 확인하지 못하는 것: 실제 API 서버의 스키마·승인 검사(Pod 보안 검사 포함), 노드에서의 실제 종료 코드와 준비 시간, NetworkPolicy·ALB의 실제 동작. 이것은 2단계에서 본다(「적용(2단계)」의 확인).
- CI에는 아직 넣지 않았다. 이 폴더나 `deploy.sh`를 바꾸면 손으로 돌린다.
