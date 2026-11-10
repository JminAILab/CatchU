# catchu.dev 전환(3단계)

catchu.dev를 개발 서버(EC2 한 대, 앞단 Caddy)에서 EKS의 ALB로 옮기는 절차다([#276](https://github.com/JminAILab/CatchU/issues/276) 3단계). 시작 조건과 승인 지점은 [README.md](README.md) 「단계와 시작 조건」을 따른다. 개발 서버 자료는 옮기지 않는다(10/6 결정). 개발 서버는 앱만 멈춘 채 두었다가 4단계에서 지운다(README 「삭제 순서」 A).

명령은 팀장이 직접 친다. **승인 ③은 DNS를 바꾸기 직전이다.** 개발 서버 앱을 멈춘 때부터 DNS가 바뀔 때까지 catchu.dev는 502를 돌려준다. 보통 3분 안팎이다(Route 53 반영이 대개 60초 안이고 기록 TTL이 60초다).

| 때 | 할 일 | 여기서 멈추면 |
|---|---|---|
| 전날 | 정비 예정 조회 → A 기록 TTL 60초 → 팀에 알림 | 할 것 없음. TTL은 60초로 둬도 된다 |
| 당일 1·2 | 자동 배포 끄기 → 마지막 확인 | 자동 배포를 다시 켠다(「되돌리기」 ③) |
| 당일 3 | 개발 서버 앱 정지 | 「되돌리기」 ①·③ |
| 당일 4·5 | 승인 ③ → DNS를 ALB로 → 확인 | 「되돌리기」 ①·②·③ |
| 그 뒤 48시간 | 되돌릴 일이 없으면 4단계 | 위와 같다. 4단계에서 개발 서버를 지우면 되돌릴 수 없다 |

## 셸 준비

저장소 루트의 zsh나 bash에서 그날 처음 한 번 붙여 넣고, 아래 이 컴퓨터의 명령은 모두 같은 창에서 친다. 프로필·kubeconfig는 README 「처음 준비」를 전제로 한다. 첫 줄은 zsh가 줄 끝의 `# 설명`을 명령 인자로 읽지 않게 한다(대화형 zsh는 기본으로 꺼져 있다). `a`·`k`는 README·[k8s/README.md](k8s/README.md)와 같은 줄임이다.

```bash
[ -n "${ZSH_VERSION:-}" ] && setopt interactivecomments
a() { aws "$@" --profile catchu --region ap-northeast-2; }
k() { kubectl --kubeconfig ~/.kube/catchu --namespace catchu "$@"; }
zone=$(a route53 list-hosted-zones-by-name --dns-name catchu.dev --query "HostedZones[?Name=='catchu.dev.' && Config.PrivateZone==\`false\`].Id" --output text); echo "$zone"
ip=$(a ec2 describe-addresses --filters Name=tag:Name,Values=catchu-dev-server --query 'Addresses[].PublicIp' --output text); echo "$ip"
ns=$(dig +short NS catchu.dev | head -n 1)
dns_rec() { a route53 list-resource-record-sets --hosted-zone-id "$zone" --query "ResourceRecordSets[?Name=='catchu.dev.' && Type=='A']" --output json; }
dns_batch() { jq -cn --argjson cur "$(dns_rec)" --argjson new "$1" '{Comment: "catchu.dev A (#276)", Changes: ([$cur[] | {Action: "DELETE", ResourceRecordSet: .}] + [{Action: "CREATE", ResourceRecordSet: $new}])}'; }
dns_send() { change_id=$(a route53 change-resource-record-sets --hosted-zone-id "$zone" --change-batch "$1" --query ChangeInfo.Id --output text) || return 1; echo "$change_id"; a route53 wait resource-record-sets-changed --id "$change_id" && echo INSYNC; }
to_dev=$(jq -cn --arg ip "$ip" '{Name: "catchu.dev.", Type: "A", TTL: 60, ResourceRecords: [{Value: $ip}]}')
edge_check() {
  local o=()
  [ -n "${1:-}" ] && o=(--connect-to "catchu.dev:443:${1}:443" --connect-to "catchu.dev:80:${1}:80")
  curl -s -o /dev/null --max-time 10 -w '첫 화면 %{http_code}\n' "${o[@]}" https://catchu.dev/
  curl -s -o /dev/null --max-time 10 -w 'http 이동 %{http_code} %{redirect_url}\n' "${o[@]}" 'http://catchu.dev/a?b=1'
  curl -s -o /dev/null --max-time 10 -w '로그인 없는 api %{http_code}\n' "${o[@]}" https://catchu.dev/v1/me
  curl -s -o /dev/null --max-time 10 -w '내부 경로 %{http_code}\n' "${o[@]}" https://catchu.dev/v1/internal/x
  curl -s -I --max-time 10 "${o[@]}" https://catchu.dev/ | tr -d '\r' | grep -i -E '^(strict-transport-security|via):'
}
```

- `zone`은 `/hostedzone/Z…` 하나, `ip`는 개발 서버 탄력적 IP 하나여야 한다. 아니면 멈춘다.
- `dns_batch`는 지금 A 기록을 그대로 지우고(DELETE) 인자의 새 기록을 만드는(CREATE) 변경 묶음을 만든다. Route 53은 한 묶음을 모두 하거나 하나도 하지 않는다([API 안내](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html) 「Change Batches and Transactional Changes」). 그래서 묶음을 만든 뒤 기록이 바뀌었으면 아무것도 바뀌지 않고 `InvalidChangeBatch`로 실패한다. 그때는 `dns_rec`으로 다시 보고 묶음을 새로 만든다.
- `dns_send`는 묶음을 보내고 바뀐 ID를 찍은 뒤(`$change_id`에도 남는다), 모든 Route 53 이름 서버에 반영될 때까지(`INSYNC`) 기다린다. 30초마다 보며 보통 1분 안에 끝난다.
- `edge_check`는 개발 서버 자동 배포의 바깥 확인([../dev-server/cd/ci-check.sh](../dev-server/cd/ci-check.sh))과 같은 다섯 가지를 찍는다. 인자로 ALB 이름이나 IP를 주면 DNS와 관계없이 그곳에 붙는다(TLS 이름과 Host는 catchu.dev 그대로다). `000`은 연결이나 인증서 확인이 실패했다는 뜻이다(받은 인증서가 catchu.dev 것이 아니어도 그렇다).

| 줄 | EKS(ALB) | 개발 서버(Caddy) |
|---|---|---|
| 첫 화면 | 200 | 200. 앱을 멈추면 502 |
| http 이동 | 301 `https://catchu.dev:443/a?b=1`(ALB는 `:443`을 붙인다) | 308 `https://catchu.dev/a?b=1` |
| 로그인 없는 api | 401 | 401 |
| 내부 경로 | 404 | 404 |
| 머리글 | `strict-transport-security: max-age=300` 한 줄 | 같은 줄과 `via: 1.1 Caddy` |

## 전날

1. **시작 조건:** README 3단계의 ①~③. ①은 #276 댓글에 남긴 2단계 증거로 본다.
2. **정비 예정 작업:** 전환 시각은 README 「단계와 시작 조건」의 정비 시간대(모두 새벽)와 겹치지 않게 잡는다. 그 밖에 AWS가 잡아 둔 작업을 본다. 빈 목록이거나 시각이 전환과 겹치지 않으면 된다. 겹치면 전환 날을 옮긴다. 콘솔 AWS Health Dashboard의 예정된 변경도 본다.
   ```bash
   a rds describe-pending-maintenance-actions --query 'PendingMaintenanceActions[].[ResourceIdentifier, PendingMaintenanceActionDetails[].[Action, CurrentApplyDate]]'
   a elasticache describe-update-actions --replication-group-ids catchu-queue --update-action-status not-applied waiting-to-start scheduling scheduled in-progress --query 'UpdateActions[].[ServiceUpdateName, UpdateActionStatus, ServiceUpdateRecommendedApplyByDate]'
   a ec2 describe-instance-status --include-all-instances --query 'InstanceStatuses[?Events].[InstanceId, Events[].[Code, NotBefore]]'   # 개발 서버와 EKS 노드
   ```
3. **A 기록 TTL을 60초로:** 값(IP)은 그대로 두고 TTL만 바꾼다. 지금 TTL(11/10 조회 300초)이 지나면 공용 DNS도 60초로 받는다. 전환을 미뤄도 되돌리지 않는다.
   ```bash
   bash deploy/aws/scripts/check-target.sh
   dns_rec                                       # A 기록 하나. 값이 $ip와 같아야 한다
   b=$(dns_batch "$to_dev"); echo "$b" | jq .   # DELETE는 지금 기록, CREATE는 같은 IP·TTL 60
   ```
   묶음이 맞으면 보낸다.
   ```bash
   dns_send "$b"
   dig +noall +answer catchu.dev @"$ns"          # TTL 60
   ```
4. **팀에 알림:** 전환 시각과 그동안 main 병합을 멈춘다는 것, 전환 뒤에는 개발 서버의 가입·자료가 보이지 않는다는 것.

## 당일

### 1. 자동 배포 끄기

```bash
gh workflow disable deploy-dev-server
gh api repos/JminAILab/CatchU/actions/workflows/deploy-dev-server.yml --jq .state   # disabled_manually
gh run list --workflow deploy-dev-server.yml --limit 20 --json databaseId,status,headSha --jq '.[] | select(.status != "completed")'   # 빈 출력
a ssm list-commands --filters key=DocumentName,value=catchu-dev-deploy key=Status,value=InProgress --query 'Commands[].CommandId' --output text   # 빈 출력
```

끄기는 이미 시작한 실행을 멈추지 않는다. 남은 실행이 있으면 취소하지 말고 끝날 때까지 기다린 뒤 결과를 본다(교체 중에 끊으면 앱이 멈춘 채 남을 수 있다). GitHub 쪽 실행이 시간 초과로 끝나도 서버에서는 계속 돌 수 있어 SSM 명령도 본다. [#342](https://github.com/JminAILab/CatchU/issues/342)의 배포 대상 값이 생겼으면 끄는 대신 그 값을 `none`으로 둔다.

### 2. 마지막 확인

개발 서버 셸을 연다. 콘솔 EC2에서 `catchu-dev-server`를 골라 연결 → Session Manager로 열고 `sudo -i`로 root가 된다(CLI의 `aws ssm start-session`은 Session Manager 플러그인을 따로 깔아야 한다). 3·「되돌리기」 ①도 이 셸에서 한다. 마지막으로 성공한 배포의 커밋과 켜 둔 기능을 본다.

```bash
grep ' result=0$' /opt/catchu/deploy-history.log | tail -n 1 | grep -o 'commit=[0-9a-f]*'
grep -E '^[A-Z_]+_ENABLED=' /opt/catchu/env/api.env
```

이 컴퓨터에서 EKS를 본다.

```bash
bash deploy/aws/scripts/check-target.sh --cluster
alb=$(k get ingress catchu -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'); echo "$alb"
albarn=$(a elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='${alb}'].LoadBalancerArn" --output text)
albzone=$(a elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='${alb}'].CanonicalHostedZoneId" --output text); echo "$albzone"
to_alb=$(jq -cn --arg z "$albzone" --arg n "$alb" '{Name: "catchu.dev.", Type: "A", AliasTarget: {HostedZoneId: $z, DNSName: $n, EvaluateTargetHealth: false}}')
k get deploy -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,WANT:.spec.replicas,COMMIT:.spec.template.metadata.annotations.catchu\.io/source-revision'
k get pod
k get deploy api -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' | grep _ENABLED
edge_check "$alb"
a wafv2 get-web-acl-for-resource --resource-arn "$albarn" --query WebACL.Name --output text   # catchu-edge
a cloudwatch describe-alarms --state-value ALARM --query 'MetricAlarms[].AlarmName' --output text   # 빈 출력
```

- 세 Deployment의 READY가 WANT와 같고 COMMIT이 개발 서버의 마지막 배포 커밋과 같다. 다르면 `git fetch origin main` 뒤 `bash deploy/aws/scripts/deploy.sh --commit <그 커밋>`으로 맞추고 이 확인을 다시 한다. 그 판본의 이미지는 개발 서버 자동 배포가 ECR에 올려 두었다.
- Pod가 모두 Running이고 RESTARTS가 늘지 않는다.
- 개발 서버에서 `true`인 기능이 EKS api에도 `true`다. 값이 없으면 꺼진 것이다. EKS에서 꺼진 기능은 전환 뒤 catchu.dev에서 멈춘다. 예를 들어 Google 로그인이 꺼져 있으면 로그인할 방법이 없다. 그대로 갈지 여기서 정하고, 가면 팀에 알린다.
- `edge_check "$alb"`가 위 표의 EKS 칸과 같다. WAF는 `catchu-edge`, 울리는 경보는 없다.

하나라도 어긋나면 고친 뒤 이 확인을 다시 하거나, 그날은 멈추고 자동 배포를 다시 켠다.

### 3. 개발 서버 앱 정지

개발 서버 root 셸에서 web·api·worker만 멈춘다. DB·큐와 앞단 Caddy는 그대로 둔다(되돌릴 때 앱만 다시 띄운다).

```bash
cd /opt/catchu/deploy-src
docker compose --env-file /opt/catchu/env/compose.env -f deploy/compose.single.yaml -f deploy/compose.local-db.yaml stop -t 30 web api worker
docker ps -a --filter label=com.docker.compose.project=catchu-dev --format '{{.Names}} {{.Status}}'
```

web·api·worker는 `Exited`이고 종료 코드가 137이 아니다(137은 30초 안에 끝나지 않아 강제로 끝낸 것이니 `docker logs`로 원인을 본다). db·queue는 `Up`이다. 이 컴퓨터에서 `edge_check`의 첫 화면이 502이고 `via: 1.1 Caddy`가 보인다(DNS는 아직 개발 서버다). 멈춘 컨테이너는 서버를 다시 켜도 저절로 뜨지 않는다.

### 4. 승인 ③ → DNS를 ALB로

```bash
bash deploy/aws/scripts/check-target.sh
b=$(dns_batch "$to_alb"); echo "$b" | jq .   # DELETE는 개발 서버 IP·TTL 60, CREATE는 ALB 별칭
```

묶음을 보고 **승인 ③**을 받은 뒤 보낸다.

```bash
dns_send "$b"; date                           # 바뀐 ID와 시각을 적는다
```

바뀐 ID를 찍기 전에 실패했으면 아무것도 바뀌지 않았다. 출력의 원인을 보고 묶음을 다시 만든다. ID를 찍은 뒤 기다리다 멈췄으면 바뀐 것이니 `a route53 get-change --id "$change_id" --query ChangeInfo.Status --output text`로 INSYNC를 본다. 오래 걸리면 「되돌리기」 ①로 개발 서버 앱부터 다시 띄운다.

### 5. 확인

```bash
dns_rec                                                            # ALB 별칭 하나
dig +short catchu.dev @"$ns"; dig +short "$alb"                    # 같은 IP
dig +short catchu.dev @1.1.1.1; dig +short catchu.dev @8.8.8.8     # 1분쯤 안에 위와 같아진다
edge_check                                                         # EKS 칸. via: 1.1 Caddy가 없어야 한다
```

- 이 컴퓨터가 옛 주소를 붙들고 있으면 `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`로 비운다.
- 브라우저 새 비공개 창과 휴대전화 데이터망으로 첫 화면을 연다.
- 30분쯤 뒤 경보를 다시 본다(2의 마지막 명령).
- #276 댓글에 시각(앱 정지·DNS 요청·INSYNC), 바뀐 ID, `edge_check` 결과를 남긴다. ALB 이름에는 계정 번호가 없지만 ARN에는 있으니 ARN은 남기지 않는다.

확인이 실패하면 원인을 본다. 그날 잡은 시간 안에 고치지 못하면 되돌린다.

## 전환 뒤

- 개발 서버 자동 배포는 다시 켜지 않는다. 켜면 main 반영 때 개발 서버에 배포하고, 바깥 확인은 EKS를 보게 된다.
- 끈 동안 main에 반영된 판본은 ECR에 이미지가 올라가지 않아 그대로는 EKS에도 배포할 수 없다(`deploy.sh`는 자동 배포가 올린 이미지를 쓴다). EKS 자동 배포는 #342다.
- 48시간 동안 되돌릴 일이 없으면 4단계로 간다(README 「삭제 순서」 A).

## 되돌리기

- **언제까지:** 4단계에서 개발 서버를 지우기 전까지다. 「삭제 순서」 A의 3에서 서버를 끝내면 DB와 Caddy 인증서가 함께 없어진다. 그 뒤 EKS 문제는 EKS 안에서 고친다(k8s/README.md 「앱 교체(deploy.sh)」의 되돌리기).
- **언제:** 당일 5의 확인이 실패하고 그날 잡은 시간 안에 고치지 못할 때, 전환 뒤 48시간 안에 EKS 쪽 문제로 서비스가 멈추고 바로 고치지 못할 때.
- **자료:** 두 DB는 따로다. 되돌리면 전환 뒤 EKS에 쌓인 자료는 개발 서버에 없고, 개발 서버는 앱을 멈춘 때의 자료로 다시 뜬다. EKS 자료는 RDS에 남는다.
- **인증서:** 개발 서버의 Let's Encrypt 인증서는 2027-01-13에 끝난다(11/10 조회). DNS가 ALB를 가리키는 동안 Caddy는 갱신하지 못하지만, 갱신은 만료 30일쯤 전부터라 되돌리기 기간에는 문제가 없다.

**① 개발 서버 앱 다시 띄우기(개발 서버 root 셸)**

```bash
cd /opt/catchu/deploy-src
deploy/scripts/replace-single.sh --env-file /opt/catchu/env/compose.env --local-db
```

`compose.env`를 바꾸지 않았으므로 멈춘 판본 그대로 api → worker → web 순서로 띄우고 정상 확인까지 한다. migration은 이미 적용돼 있어 `--migrate`를 붙이지 않는다. 종료 코드가 0이 아니면 [../README.md](../README.md) 「계획 교체」의 표대로 한다. 이 컴퓨터에서 `edge_check "$ip"`가 위 표의 개발 서버 칸과 같은지 본다(DNS와 관계없이 이 IP로 붙는다).

**② DNS를 개발 서버로**

```bash
bash deploy/aws/scripts/check-target.sh
b=$(dns_batch "$to_dev"); echo "$b" | jq .   # DELETE는 ALB 별칭, CREATE는 개발 서버 IP·TTL 60
```

묶음이 맞으면 보낸다.

```bash
dns_send "$b"
edge_check                                    # 1분쯤 뒤 개발 서버 칸
```

**③ 자동 배포 다시 켜기:** `gh workflow enable deploy-dev-server`. 그다음 main push부터 돈다. 끈 사이 main에 반영된 판본이 있으면 Actions에서 `deploy-dev-server`를 main으로 수동 실행한다([../dev-server/cd/README.md](../dev-server/cd/README.md) 「되돌리기」).

EKS는 그대로 둔다. 다시 전환할 때는 당일 1부터 한다(TTL은 60초 그대로다).
