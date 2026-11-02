# CatchU EKS 실행 파일과 앱 교체

EKS(#276)에서 web·api·worker를 띄우는 쿠버네티스 실행 파일과 교체 스크립트 [`deploy.sh`](../scripts/deploy.sh), 앱 Secret 만들기와 DB 관리 Pod의 사용법이다. 단계·승인 지점·처음 준비(프로필·기대 계정 번호·kubeconfig)는 [../README.md](../README.md)를 따른다. 이미지와 migration·교체의 공통 규칙은 [../../README.md](../../README.md)에 있다.

**AWS 자원이 없는 지금은 적용하지 않는다.** 처음 적용은 2단계(빈 DB로 지금 main 판본을 띄워 확인)다. 앱은 모두 namespace `catchu`에, DB 관리용 psql Pod는 `catchu-ops`에 들어가고, 그 뒤에는 바뀔 때만 다시 적용한다.

## 파일

| 파일 | 적용 | 내용 |
|---|---|---|
| [`namespace.yaml`](namespace.yaml) | 손으로 | Pod 보안 검사 `restricted`(호스트 망·특권·root로 도는 Pod 거부), ALB 상태 확인을 통과해야 web·api Pod가 준비되는 연동, 기본 서비스 계정의 쿠버네티스 API 토큰 자동 탑재 끔 |
| [`network-policy.yaml`](network-policy.yaml) | 손으로 | 기본은 모두 막고 필요한 것만 연다. web은 ALB에서 3000만 받는다. api는 ALB·worker에서 3001을 받고 DB·큐와 바깥 443으로 나간다. worker는 api 3001·큐·GitHub API·Anthropic API 대역으로만 나간다(DB 없음). migration은 DB로만 나간다. 모두 DNS는 연다 |
| [`services.yaml`](services.yaml) | 손으로 | web·api의 클러스터 안 주소. 바깥으로 여는 Service는 두지 않는다 |
| [`ingress.yaml`](ingress.yaml) | 손으로 | 공개 ALB. 80은 443으로 이동(301), TLS 1.2·1.3만, `/v1/internal`은 404, `/v1`은 api, 그 밖은 web, HSTS 300초, 유휴 60초, 삭제 보호, WAF `catchu-edge` |
| [`api.yaml`](api.yaml)·[`worker.yaml`](worker.yaml)·[`web.yaml`](web.yaml) | `deploy.sh`만 | api·worker는 한 개씩 `Recreate`, web은 새 Pod를 먼저 띄우고 옛 Pod를 내린다. 모두 UID 1000·읽기 전용 루트·권한 전부 제거·`/tmp` 크기 상한, 자원 요청과 메모리 상한(worker는 실제 분석을 재기 전의 임시값) |
| [`migration-pod.yaml`](migration-pod.yaml) | `deploy.sh`만 | migration 일회 Pod 틀. controller 없이 한 번 실행하고 다시 띄우지 않으며 10분 한도가 있다 |
| [`consent-guard-pod.yaml`](consent-guard-pod.yaml) | `deploy.sh`만 | 동의 기록 삭제 권한 확인 일회 Pod 틀. migration 계정으로 붙어 앱 계정의 동의 기록 DELETE·TRUNCATE 권한을 확인·회수·재확인한다(postgres 16.15, 사용자 999·읽기 전용 루트·권한 전부 제거, TLS `verify-full`, 5분 한도). 연결 허용은 migration과 같다 |
| [`ops/namespace.yaml`](ops/namespace.yaml)·[`ops/network-policy.yaml`](ops/network-policy.yaml) | 손으로 | 관리 작업 namespace `catchu-ops`(Pod 보안 검사 `restricted`, 토큰 자동 탑재 끔)와 그 연결 허용 목록(기본 차단, DNS, psql Pod는 DB 5432만) |
| [`ops/db-admin-pod.yaml`](ops/db-admin-pod.yaml) | `db-admin.sh`만 | DB 관리용 psql 일회 Pod 틀(postgres 16.15, 사용자 999·읽기 전용 루트·권한 전부 제거, TLS `verify-full`, 5분 한도) |

Deployment 파일은 이미지·실행 수·커밋 자리를 비워 둔 틀이다. 그대로 `kubectl apply`하면 실행 수 자리가 숫자가 아니어서 거부된다. 운영 중인 판본을 덮지 않게 하려는 것이다. 이미지는 `deploy.sh`가 그때그때 넣으므로 저장소에는 digest를 적지 않는다.

## Secret과 ConfigMap

실행 파일은 아래 이름과 키를 읽는다. [`make-secrets.sh`](../scripts/make-secrets.sh)가 SSM `/catchu/prod/*` 값과 RDS·큐 주소로 만든다. web은 비밀값을 받지 않고, worker에는 DB 값을 주지 않는다.

| 이름 | 종류 | 키 ← 원본 | 쓰는 곳 |
|---|---|---|---|
| `catchu-db` | ConfigMap | `DB_HOST` ← RDS `catchu-db` 주소, `ca.pem` ← 저장소의 RDS 루트 인증서 | api·migration |
| `catchu-api` | Secret | `AUTH_JWT_SECRET` ← `/catchu/prod/api/AUTH_JWT_SECRET`, `LINK_GRANT_SECRET` ← `/catchu/prod/api/LINK_GRANT_SECRET`, `DB_PASSWORD` ← `/catchu/prod/db/catchu_app-password`(앱 계정 `catchu_app`), `CATCHU_GENERATION_API_KEY` ← `/catchu/prod/api/CATCHU_GENERATION_API_KEY`(Claude API), `CATCHU_EMBEDDING_API_KEY` ← `/catchu/prod/api/CATCHU_EMBEDDING_API_KEY`(Voyage AI) | api |
| `catchu-migration` | Secret | `DB_PASSWORD` ← `/catchu/prod/db/catchu_migrator-password`(migration 계정 `catchu_migrator`) | migration |
| `catchu-worker` | Secret | `CATCHU_QUEUE_REDIS_URL` ← `rediss://:`큐 비밀번호(`/catchu/prod/queue/auth-token`)`@`큐 주 엔드포인트`:6379`, `WORKER_CONTEXT_API_KEY` ← `/catchu/prod/worker/WORKER_CONTEXT_API_KEY`, `CATCHU_GENERATION_API_KEY` ← `/catchu/prod/worker/CATCHU_GENERATION_API_KEY` | worker |

api의 AI 키 둘(11월 생성·임베딩, #389)은 켜고 끄는 기능이 아니라 11월 기능이 늘 쓰는 값이라 미리 넣는다. SSM에는 2026-10-27에 넣었다. 꺼 둔 기능(Google 로그인·GitHub 연결·worker 요청 정보 조회·api 큐 연결)은 켤 때 그 값을 api 실행 파일과 Secret에 더하는 PR을 낸다([../README.md](../README.md) 5단계). GitHub 연결은 EFS 보관 폴더도 함께 붙인다.

**SSM에 없는 두 값.** `/catchu/prod/worker/` 두 값은 아직 SSM에 없다(2026-10-19 확인. 있는 것은 서명 키 둘·DB 계정 둘·큐 하나). 운영 모드 worker는 둘 다 없으면 뜨지 않으므로 2단계 전에 넣는다. [`put-parameter.sh`](../scripts/put-parameter.sh)는 이미 있는 이름이면 멈추고, 값을 화면·명령 인자·셸 기록에 남기지 않는다.

```bash
bash deploy/aws/scripts/put-parameter.sh --random /catchu/prod/worker/WORKER_CONTEXT_API_KEY
bash deploy/aws/scripts/put-parameter.sh --stdin /catchu/prod/worker/CATCHU_GENERATION_API_KEY   # 생성 제공자(Claude API) 콘솔에서 발급한 키를 붙여 넣는다. 화면에 찍히지 않는다
```

**만들기.** `bash deploy/aws/scripts/make-secrets.sh`(순서는 아래 「적용(2단계)」).

- 시작 전에 계정·클러스터, namespace `catchu`, RDS(available, CA `rds-ca-rsa2048-g1`), 큐(available, TLS와 비밀번호 켬), SSM 이름 아홉 개가 모두 SecureString인지 본다. 값도 앱이 시작할 때 거부하는 형식인지(서명 키·조회 키는 64자리 hex, 큐 비밀번호는 주소에 그대로 넣을 수 있는 영문·숫자. 형식은 값 전체에 맞추므로 끝에 줄바꿈이 붙어도 멈춘다), 서로 달라야 하는 값(서명 키 둘과 조회 키, 두 계정 비밀번호)이 다른지 본다. 하나라도 어긋나면 아무것도 바꾸지 않고 멈춘다(종료 코드 1).
- 값은 SSM에서 파이프로만 jq를 거쳐 `kubectl apply --server-side`의 표준 입력으로 넘긴다. 그래서 화면·명령 인자·임시 파일·`last-applied` 주석에 값이 남지 않는다. 화면에는 Secret 이름과 `키=SSM 판 번호`만 찍히고, 같은 판 번호가 Secret 주석 `catchu.io/ssm-versions`에 남는다.
- 적용 뒤 Secret의 키 목록, `last-applied` 주석이 없음, ConfigMap의 주소와 인증서를 다시 읽어 확인한다. 적용이 실패했거나 확인이 어긋나면 2(일부만 바뀌었을 수 있다)다. 원인을 고쳐 다시 실행하면 SSM의 지금 값으로 다시 맞춘다.
- 값을 보지 않고 확인하기: `k get secret -o json | jq '.items[] | {name: .metadata.name, keys: (.data | keys), annotations: .metadata.annotations}'`

**RDS 루트 인증서.** [`../db/rds-ca-rsa2048-g1.pem`](../db/rds-ca-rsa2048-g1.pem)은 서울 리전 `rds-ca-rsa2048-g1` 루트 인증서 하나다(2061-05-20까지). AWS 공식 묶음 `https://truststore.pki.rds.amazonaws.com/ap-northeast-2/ap-northeast-2-bundle.pem`(루트 3개)에서 꺼냈고, SHA-1 지문 `58fe7e8c3b1f561be7e51f69dcfc8acfbb546e02`가 `aws rds describe-certificates --certificate-identifier rds-ca-rsa2048-g1`의 `Thumbprint`와 같다(2026-10-19 확인). AWS 안내대로 신뢰 목록에는 루트만 넣는다(중간 인증서를 넣으면 서버 인증서 자동 교체 때 끊길 수 있다). 파일이 바뀌면 스크립트가 멈춘다(`scripts/lib/rds.sh`의 해시).

**값을 바꿀 때.** 값은 누출됐을 때만 바꾼다(서명 키를 바꾸면 로그인과 열람 증표가 모두 무효가 된다). 환경변수로 받은 값은 Pod가 다시 떠야 바뀌는데 `deploy.sh`는 구성이 같으면 다시 띄우지 않는다. 그래서 바꾸는 순서와 바뀐 값으로 api·worker를 다시 띄우는 일은 `deploy.sh`를 고치는 다음 PR에서 정하고, 그 전에는 `make-secrets.sh`를 값만 바꾸는 데 쓰지 않는다.

## DB 관리 Pod(db-admin.sh)

DB 계정 만들기처럼 RDS 관리자로 SQL을 실행할 때 쓴다. [`db-admin.sh`](../scripts/db-admin.sh)가 namespace `catchu-ops`에 psql 일회 Pod를 띄워 [`../db/`](../db)의 SQL 파일 하나를 한 트랜잭션으로 실행하고, 끝나면 성공·실패와 관계없이 임시 Pod·Secret·ConfigMap을 지운다(아래 「정리」).

```bash
bash deploy/aws/scripts/db-admin.sh deploy/aws/db/roles.sql
```

- **어디서:** `catchu-ops`에서만 돈다. 자동 배포 역할(#342)은 `catchu`에서 Pod를 만들 수 있어 같은 namespace의 Secret을 읽을 수 있으므로, 관리자 비밀번호는 그 역할이 닿지 않는 곳에 둔다. 배포 역할에는 `catchu-ops` 권한을 주지 않는다.
- **비밀번호:** RDS 관리자 비밀번호는 RDS가 Secrets Manager에서 관리하며 7일마다 바꾸므로 실행할 때마다 읽는다. 계정 비밀번호 둘은 SSM에서 읽는다. 셋 다 Pod와 같은 이름의 임시 Secret으로만 넘기고, 값은 파이프로만 지난다.
- **시작 전 확인(아무것도 만들지 않고 1로 멈춤):** 계정·클러스터, `catchu-ops`와 NetworkPolicy 셋, 지난 실행에서 남은 임시 자원이 없음, RDS(available, CA `rds-ca-rsa2048-g1`, 관리자 비밀번호 상태 active), 파라미터 그룹 `catchu-pg16`이 반영됐고(in-sync) `log_min_error_statement=panic`·`log_statement=none`인지(실패한 문장의 비밀번호가 DB 로그에 남지 않게), SSM 계정 비밀번호 둘.
- **Pod:** postgres 16.15 이미지(로컬 합성 DB와 같은 digest. 앱 이미지에는 psql이 없다)를 사용자 999·읽기 전용 루트·권한 전부 제거로 띄운다. psql은 psqlrc 없이, 문장을 출력에 되풀이하지 않고, 오류에서 멈추며 한 트랜잭션으로 실행한다. 오류가 나도 문장 원문은 찍지 않는다(psql 기본값은 위치 오류 때 비밀번호가 든 문장 줄을 그대로 보여 준다). TLS는 `PGSSLMODE=verify-full`과 저장소의 루트 인증서로 검증한다.
- **정리:** 세 임시 자원에 실행마다 새로 만든 표식 `catchu.io/db-admin-run`(16자리 난수)을 붙이고, 끝나면 그 표식으로 찾아 지운 뒤 없어졌는지 확인한다. 만들기 응답이 끊겨 결과를 모르는 것도 서버에 저장됐으면 지우고, 같은 이름이어도 표식이 다른 것(같은 초에 시작한 다른 실행의 것)은 건드리지 않는다. 정리한 뒤에 서버가 늦게 저장한 것은 다음 실행의 시작 전 확인이 남은 임시 자원으로 찾아 멈춘다.
- **기록:** 출력 끝의 「DB 관리 기록」(Pod 이름, 이미지 digest, SQL 파일의 SHA-256, 종료 코드, 시각, 임시 자원 지움 확인)과 psql 출력을 남긴다. 출력에는 계정 번호가 들어가지 않는다.

| 종료 코드 | 상태와 다음 행동 |
|---|---|
| 0 | SQL 성공, 임시 자원 지움 확인 |
| 1 | 시작 전 확인에서 멈췄다. 아무것도 만들지 않았다. 출력의 원인을 고친 뒤 다시 실행한다 |
| 3 | SQL 실패 또는 결과 불명. 임시 자원은 표식으로 찾아 지웠다. 실패면 한 트랜잭션이라 DB는 바뀌지 않았다. 결과 불명(시간 초과·조회 실패, Pod 만들기 응답이 끊김)이면 DB에서 결과를 확인한다 |
| 4 | 임시 자원을 지웠는지 확인하지 못했다(표식으로 조회하지 못했거나 지운 뒤에도 남았다). 관리자 비밀번호가 든 Secret이 남았을 수 있으니 출력의 명령(표식으로 지운다)으로 곧바로 지우고 없어졌는지 본다 |

**계정 SQL([`roles.sql`](../db/roles.sql)).** 2단계에서 첫 `deploy.sh` 전에 한 번 실행한다. migration 계정이 DB와 public 스키마를 소유하고 앱 계정은 자료 읽기·쓰기만 한다. RDS 관리자는 슈퍼유저가 아니어서 로컬 [`init-roles.sh`](../../local-db/init-roles.sh)와 달리 만든 역할을 관리자 자신에게 SET으로 준 뒤 소유자를 넘긴다(PostgreSQL 16 조건). 앱 계정에는 `lock_timeout` 3초를 건다(#220). pgvector 확장(`vector`)도 여기서 만든다. 신뢰 확장이 아니어서 migration 계정은 만들지 못하고 이미 있을 때 통과하는 `CREATE EXTENSION IF NOT EXISTS vector`만 부른다(#389, `api/CONVENTIONS.md`). `idle_in_transaction_session_timeout`은 #220에서 값을 정하면 SQL 파일을 더해 같은 방법으로 실행한다(그때까지 RDS 기본값). 다시 실행하면 이미 있는 계정에서 실패하고 아무것도 바뀌지 않는다. 출력의 확인 표(역할 속성·`lock_timeout`·DB와 스키마 소유자·기본 권한)를 #276 완료 기준 증거로 남긴다.

기본 권한은 migration이 새로 만드는 표마다 앱 계정에 DELETE를 준다. 그래서 `deploy.sh`가 migration 뒤마다 동의 기록(`analysis_consent`)의 직접 삭제 권한을 확인·회수·재확인한다(「앱 교체(deploy.sh)」).

## 적용(2단계)

**적용 전 확인.** NetworkPolicy(`network-policy.yaml`·`ops/network-policy.yaml`)와 api의 `TRUST_PROXY_CIDRS`에는 eksctl이 `cluster.yaml`로 정하는 대역을 적어 두었다(퍼블릭 192.168.0.0/19·192.168.32.0/19, 프라이빗 192.168.64.0/19·192.168.96.0/19). 클러스터를 만든 뒤 실제 대역과 같은지 본다. 다르면 세 파일을 고치는 PR을 먼저 낸다.

```bash
vpc=$(aws eks describe-cluster --name catchu --profile catchu --region ap-northeast-2 --query cluster.resourcesVpcConfig.vpcId --output text)
aws ec2 describe-subnets --profile catchu --region ap-northeast-2 --filters "Name=vpc-id,Values=${vpc}" --query 'Subnets[].[AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' --output text
```

**순서.** 시작 전에 `bash deploy/aws/scripts/check-target.sh --cluster`로 '일치'를 본다. 아래 `k`는 zsh·bash 모두에서 쓸 수 있는 줄임이다.

```bash
k() { kubectl --kubeconfig ~/.kube/catchu --namespace catchu "$@"; }
kubectl --kubeconfig ~/.kube/catchu apply -f deploy/aws/k8s/namespace.yaml -f deploy/aws/k8s/ops/namespace.yaml
k apply -f deploy/aws/k8s/network-policy.yaml -f deploy/aws/k8s/services.yaml
kubectl --kubeconfig ~/.kube/catchu apply -f deploy/aws/k8s/ops/network-policy.yaml
bash deploy/aws/scripts/make-secrets.sh                        # 「Secret과 ConfigMap」. worker 키 두 개를 SSM에 먼저 넣는다
bash deploy/aws/scripts/db-admin.sh deploy/aws/db/roles.sql    # 「DB 관리 Pod」. 확인 표를 증거로 남긴다
k apply -f deploy/aws/k8s/ingress.yaml   # Load Balancer Controller·catchu.dev ACM 인증서(발급 완료)·WAF가 있은 뒤
bash deploy/aws/scripts/deploy.sh --commit <main 커밋 40자>   # migration 뒤 동의 기록 삭제 권한 확인·회수까지 한다
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

- **입력은 커밋 하나다.** 이미지는 ECR 네 저장소에서 태그 `main-<커밋 앞 12자>`(main 자동 배포가 올린 태그)의 digest로 띄운다. Deployment·migration·동의 기록 확인 틀은 그 커밋의 `deploy/aws/k8s/` 파일을 git에서 읽는다. 그래서 배포할 커밋이 로컬 저장소에 있어야 하고(`git fetch origin main`), 그 커밋에 이 실행 파일이 들어 있어야 한다. 동의 기록 확인 틀이 없는 커밋(이 확인이 들어오기 전 판)은 아무것도 바꾸지 않고 2로 멈춘다. `deploy.sh` 자신은 지금 작업 폴더의 판을 쓴다.
- **같은 판본·구성이 이미 정상으로 돌면 아무것도 바꾸지 않는다.**
- **순서:** ① 시작 전 확인(계정·클러스터, 이미지 네 개, 실행 파일, 기본 차단 NetworkPolicy와 ConfigMap `catchu-db`) → ② 옛 api·worker를 0으로 줄이고 없어질 때까지 기다린 뒤 종료 코드를 본다(web은 그대로 둔다) → ③ migration 일회 Pod `catchu-migrate-<커밋 앞 12자>`를 한 번 실행한다. 같은 이미지로 이미 성공한 같은 이름의 Pod가 있으면 건너뛴다 → ④ 동의 기록 확인 Pod `catchu-consent-guard-<UTC 시각>`을 한 번 실행한다. 교체할 때마다(migration을 건너뛰었어도) 한다. 앱 계정(`catchu_app`)이 동의 기록에 DELETE·TRUNCATE 권한을 갖고 있으면 회수하고 다시 본다. 확인 대상은 실제로 쓸 수 있는 권한이라 PUBLIC이나 다른 역할에서 받은 권한도 들어가는데, 회수는 앱 계정에 직접 준 것만 지운다. 그런 권한이 있어 다시 볼 때도 남아 있으면 같은 트랜잭션의 회수까지 되돌리고 8로 멈춘다. 물려받지 않고 역할 바꾸기(`SET ROLE`)로만 쓸 수 있는 역할의 권한은 잡지 못한다(`roles.sql`은 앱 계정에 어떤 역할도 주지 않는다. 역할을 줄 일이 생기면 이 확인부터 다시 본다) → ⑤ api → worker → web 순서로 적용하고 하나씩 준비되기를 기다린 뒤, 셋이 모두 정상인지 다시 본다.
- **중단 시간:** ②부터 ⑤의 api 준비까지 api·worker가 없다. 그동안 `/v1` 요청은 ALB가 503으로 돌려준다(화면은 뜬다). 분석 중이던 작업은 worker가 실패로 남기고 처리 시한에 닫힌다([../../README.md](../../README.md) 「계획 교체」).
- **기록:** 출력 끝의 「교체 기록」(커밋, 대상 DB, 이미지 digest, 옛 실행의 종료 코드, migration Pod의 uid·종료 코드·시각, 동의 기록 확인 Pod의 uid·종료 코드와 `동의 기록 직접 삭제 권한(catchu_app): 회수 전 있음|없음, 회수 뒤 없음` 줄)을 남긴다. 이 줄이 #276 완료 기준 '동의 기록 직접 삭제 권한 없음'의 증거다. 로그를 읽지 못하면 그 줄 대신 안내가 남으므로 아래 명령으로 Pod 로그를 다시 본다. 두 Pod는 지우지 않으므로 로그는 `k logs catchu-migrate-<커밋 앞 12자>`·`k logs catchu-consent-guard-<UTC 시각>`으로 다시 볼 수 있다. 출력에는 계정 번호가 들어가지 않는다(이미지 주소 대신 digest만 찍는다).
- **되돌리기:** 이전 main 커밋으로 다시 실행한다. **이전 이미지가 지금 DB 스키마와 호환될 때만** 한다. migration은 되돌리지 않는다([../../README.md](../../README.md) 「실패 시 정지와 되돌리기」).

| 종료 코드 | 상태와 다음 행동 |
|---|---|
| 0 | 교체 완료, 또는 바꿀 것 없음 |
| 2 | 시작 전 확인에서 멈췄다. 아무것도 바꾸지 않았다. 출력의 원인(입력·계정·클러스터·이미지·실행 파일·조회 실패)을 고친 뒤 다시 실행한다. api·worker가 0으로 멈춰 있어서 멈춘 것이면 아래 `--resume` |
| 3 | 옛 api·worker의 종료를 확인하지 못했다(남은 Pod, 종료 코드를 모름, 조회·멈추기 실패). migration·새 실행은 시작하지 않았다. `k get pod -o wide`로 남은 Pod와 그 노드를 본다. 강제로 지우지 않는다 |
| 4 | migration 실패. Pod를 남겨 두었다. 그 로그와 DB의 `migrations` 표를 확인하기 전에는 다시 실행하지 않는다 |
| 5 | migration 결과 불명(만들기 요청 실패·시간 초과·조회 실패), 또는 같은 이름의 Pod가 성공 아닌 상태로 남아 있다. 실행 상태와 DB 적용 이력을 대조해 담당자가 판단하고, 확인한 뒤 그 Pod를 직접 지운다 |
| 6 | 새 실행이 준비되지 않았다. api·worker를 다시 멈추고 종료를 확인했다. `k describe pod`·`k logs`로 원인을 본다. 이때는 종료 코드를 보지 않는다. 멈춘 사유가 api 단계가 아니면 새 worker가 떴을 수 있으니, 분석 중이던 작업이 실패로 기록됐는지 큐 상태도 본다 |
| 7 | 옛 실행이 종료 유예 안에 끝나지 않아 강제 종료(137)됐다. 분석 중이던 작업이 실패로 기록되지 않았을 수 있으니 큐 상태를 본다 |
| 8 | 동의 기록 삭제 권한을 회수·확인하지 못했다(회수 뒤에도 남음, 확인 Pod 실패, 만들기 요청 실패·시간 초과·조회 실패). 새 실행은 시작하지 않았다. 출력의 psql 줄로 원인을 본다. 회수 뒤에도 남았으면 PUBLIC이나 다른 역할에서 받은 권한이고, 표가 없거나 접속하지 못해도 실패한다. 확인·회수는 다시 해도 결과가 같으므로 원인을 고친 뒤 `--resume`으로 다시 실행한다 |

3~8로 멈추면 api·worker는 0으로 멈춘 채다. 다음 실행은 이 상태를 보고 2로 멈추므로, 원인을 확인한 뒤 `--resume`을 붙여 다시 실행한다. 다만 처음 설치에서 8로 멈췄으면 Deployment가 아직 없어 다음 실행은 `--resume` 없이도 migration을 건너뛰고 확인부터 다시 한다. 그때도 원인을 먼저 확인한 뒤 다시 실행한다. 자동 배포(#342)의 다음 실행도 결과를 확인하기 전에는 덮어쓰지 않는다.

- **자동 배포(#342)에서 쓸 때 맞출 것:** 이 스크립트는 프로필 `catchu`, kubeconfig `~/.kube/catchu`, 기대 계정 번호를 전제로 한다([../README.md](../README.md) 「처음 준비」). 배포 역할에 필요한 권한은 ECR 네 저장소 조회, `eks:DescribeCluster`, namespace `catchu`의 Deployment 조회·적용과 실행 수 바꾸기, Pod 조회·감시·만들기와 로그 읽기(migration·동의 기록 확인 Pod 포함), NetworkPolicy·ConfigMap 조회다. Secret 읽기와 exec는 필요 없다. 동의 기록 확인은 표 소유자인 migration 계정으로 하므로 RDS 관리자 비밀번호와 `catchu-ops`에도 닿지 않는다.
- **확인하지 못한 것(2단계에서 본다):** 실제 API 서버의 스키마와 Pod 보안 검사 통과, 실제 노드에서 끝난 옛 실행의 종료 코드가 감시 출력에 오는지(출력 모양은 kubectl 1.37.1을 이 컴퓨터의 가짜 API에 붙여 확인했다), 실제 준비·중단 시간, 동의 기록 확인 Pod가 실제 RDS에서 migration이 만든 표의 권한을 회수하는지와 그 출력.

## 시험

```bash
bash deploy/aws/scripts/deploy.test.sh
```

bash·jq·git·ruby가 필요하고 30초쯤 걸린다. kubectl·aws·sleep을 합성 명령으로 바꾸고, 지금 작업 폴더의 `deploy.sh`·이 폴더로 만든 합성 git 저장소에서 `deploy.sh`를 실제로 실행한다. AWS·클러스터에는 닿지 않는다.

- 확인하는 것: 처음 설치와 교체의 순서(옛 api·worker 멈춤 → migration → 동의 기록 확인 → api → worker → web), 같은 판본·구성이면 아무것도 바꾸지 않음, 멈춘 상태에서 `--resume` 없이는 멈춤, 시작 전 확인이 하나라도 어긋나면 아무것도 바꾸지 않고 2, 종료 확인 실패 3(늦게 오는 종료 코드는 기다림), 강제 종료 7, migration 실패 4·결과 불명 5·같은 이름 Pod 처리, 새 실행 실패 때 api·worker를 다시 멈추고 6, 동의 기록 확인(migration을 건너뛰어도 함, 실패·만들기 실패·시간 초과면 8이고 새 실행 없음, `--resume`이면 새 확인 Pod로 다시 함, 배포할 커밋에 확인 틀이 없으면 아무것도 바꾸지 않고 2), 출력에 계정 번호가 없음.
- 실행 파일 조건: `deploy.sh`가 자리를 채운 Deployment·migration Pod·동의 기록 확인 Pod와 손으로 적용하는 파일을 Ruby(YAML→JSON)·jq로 읽는다. api·worker 한 개·`Recreate`, web 교체 방식, UID 1000·읽기 전용 루트·권한 제거·seccomp·토큰 자동 탑재 끔·호스트 망 없음, `/tmp` 크기 상한, 자원 요청과 메모리 상한(CPU 상한 없음), 이미지 digest, 비밀값은 Secret에서만, worker에 DB 값 없음, 동의 기록 확인 Pod는 migration 계정·migration 연결 허용 라벨·DB 관리 Pod와 같은 이미지이고 명령에 쿠버네티스가 바꾸는 `$(`·`$$`가 없음, Service 포트, NetworkPolicy·Ingress 규칙, 계정 번호 없음.
- 합성 kubectl의 감시 출력은 kubectl 1.37.1을 이 컴퓨터의 가짜 API에 붙여 확인한 모양을 흉내 낸다. 탭은 공백으로 바뀌고, `range` 안에서 없는 값을 만나면 첫 객체 뒤 오류로 끝난다. `deploy.sh`가 그 밖의 식을 쓰면 시험이 실패한다.
- 확인하지 못하는 것: 실제 API 서버의 스키마·승인 검사(Pod 보안 검사 포함), 노드에서의 실제 종료 코드와 준비 시간, NetworkPolicy·ALB의 실제 동작. 이것은 2단계에서 본다(「적용(2단계)」의 확인).
- CI에는 아직 넣지 않았다. 이 폴더나 `deploy.sh`를 바꾸면 손으로 돌린다.

Secret 만들기·SSM 값 넣기·DB 관리 Pod는 두 시험으로 본다.

```bash
bash deploy/aws/scripts/secrets.test.sh    # 25초쯤. bash·jq·ruby·openssl·shasum·aws CLI v2
bash deploy/aws/scripts/db-roles.test.sh   # 1분쯤. Docker가 돌고 있어야 한다
```

- `secrets.test.sh`: aws·kubectl을 합성 명령으로 바꾸고 이 폴더를 복사한 곳에서 `make-secrets.sh`·`put-parameter.sh`·`db-admin.sh`를 실제로 실행한다. 만드는 내용(Secret 키·값·판 번호 주석, 큐 주소, ConfigMap, 임시 Secret·Pod), 시작 전 확인이나 값 검사(값 끝의 줄바꿈 포함)가 하나라도 어긋나면 아무것도 바꾸지 않고 멈춤, 종료 코드, 임시 자원을 늘 지움(만들기 응답이 끊겨 서버에만 저장된 것 포함, 표식이 다른 같은 이름은 둠), 시험마다 새로 만든 합성 비밀값이 출력·aws·kubectl·jq의 명령 인자·임시 폴더에 없음, 계정 번호가 출력에 없음, `catchu-ops` 실행 파일 조건, 루트 인증서의 지문을 본다.
- `db-roles.test.sh`: RDS처럼 슈퍼유저가 아닌 관리자를 둔 PostgreSQL 16.15 컨테이너에 psql Pod 틀의 이미지·명령·환경 그대로(사용자 999·읽기 전용 루트·TLS `verify-full`) `roles.sql`을 실행하고, 각 계정으로 붙어 권한(앱 계정의 읽기·쓰기와 `lock_timeout`, 스키마 변경 거부, 다른 계정의 접속·스키마 사용 거부, 두 계정에 특별 권한 없음, 다시 실행하거나 중간 문장이 실패하면 바뀌지 않음, 인증서와 다른 이름으로 붙으면 거부, 위치 오류 때도 문장 원문을 찍지 않음, 비밀번호가 출력·DB 로그에 없음)을 본다. 이어서 동의 기록 확인 Pod 틀의 이미지·명령·환경 그대로 migration 계정으로 실행해, 권한이 있으면 회수하고 0(앱 계정의 DELETE·TRUNCATE 거부, 읽기·쓰기는 그대로), 없으면 그대로 0, PUBLIC에 준 권한처럼 회수로 없어지지 않으면 0이 아니고 앞의 회수도 되돌림, 표가 없으면 0이 아님을 본다.
- 확인하지 못하는 것: 실제 server-side apply와 Pod 보안 검사, 실제 RDS 관리자(`rds_superuser`)의 특성과 실제 Secrets Manager 응답, migration이 실제로 만든 동의 기록 표(시험은 같은 이름의 합성 표로 본다). 이것은 2단계에서 본다.
