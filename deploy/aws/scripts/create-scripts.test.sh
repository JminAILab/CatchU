#!/usr/bin/env bash
# deploy/aws 생성 스크립트·공통 확인 회귀 시험(#276). aws·kubectl·helm·shasum·sleep을 합성 명령으로 바꿔 스크립트를 실제로 실행한다.
# 조회는 정해 둔 값을 돌려준다. 만드는 호출은 순서와 필수 옵션을 확인하고, 만들기 시험에서는 진짜 AWS CLI를 합성 키·닫힌 로컬 주소
# (--endpoint-url http://127.0.0.1:9)로 실행해 CLI가 요청을 보내기 직전까지 가는지(옵션 이름·형식·JSON 읽기)도 본다.
# 실제 AWS에는 닿지 않는다. 서버 쪽 검사(옵션 조합·이름 규칙·권한·할당량)와 실제로 만들어진 자원의 설정은 확인하지 못한다.
# 필요한 것: bash·jq·aws CLI v2. 사용: bash deploy/aws/scripts/create-scripts.test.sh   (실패가 하나라도 있으면 종료 코드 1)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REAL_AWS=$(command -v aws) || { echo "aws CLI가 없어 시험할 수 없다" >&2; exit 1; }
command -v jq > /dev/null || { echo "jq가 없어 시험할 수 없다" >&2; exit 1; }
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN=$WORK/bin
S=$WORK/state
OUT=$WORK/out.log
NODE_SG=sg-0123456789abcdef0
pass=0
fail=0

# ---------- 합성 aws·kubectl·sleep ----------
mkdir -p "$BIN"
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
# 합성 aws. --profile을 빼고 서비스·동작을 찾아 정해 둔 값을 돌려준다. 만드는 호출은 calls에 남긴다.
S=${STUB_STATE:?}
args=() skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  [ "$a" = --profile ] && { skip=1; continue; }
  args+=("$a")
done
[ "${args[0]}" = --version ] && exec "$STUB_REAL_AWS" --version
# 기록·비교에는 --region을 뺀 인자(서비스 동작 옵션…)를 쓴다. 진짜 CLI 검사에는 --region까지 그대로 넘긴다.
svc='' op='' i=0 rest=()
while [ "$i" -lt "${#args[@]}" ]; do
  case "${args[$i]}" in
    --region) i=$((i + 2)); continue ;;
    *) if [ -z "$svc" ]; then svc=${args[$i]}; elif [ -z "$op" ]; then op=${args[$i]}; fi; rest+=("${args[$i]}") ;;
  esac
  i=$((i + 1))
done
all="${rest[*]}"
printf '%s %s\n' "$svc" "$op" >> "$S/seen"
# STUB_FAIL에 적은 호출을 실패시킨다.
if [ "$svc $op" = "${STUB_FAIL:-}" ]; then
  echo "An error occurred (AccessDenied) when calling the operation: synthetic" >&2
  exit 254
fi
mutating=0
case "$op" in create-* | modify-* | put-* | authorize-* | check-capacity | subscribe | publish | set-topic-attributes | request-certificate | change-resource-record-sets) mutating=1 ;; esac
if [ "$mutating" = 1 ]; then
  printf '%s\n' "$all" >> "$S/calls"
  # 비밀값을 넘긴 입력 파일이 있으면 값을 기록해 둔다(출력에 새지 않았는지 보려고).
  for a in "${args[@]}"; do
    case "$a" in file://*.json) ;; file://*) jq -r '.AuthToken // .Value // empty' "${a#file://}" >> "$S/secrets" 2> /dev/null ;; esac
  done
  if [ "${STUB_VALIDATE:-0}" = 1 ]; then
    err=$(env -i PATH=/usr/bin:/bin HOME=/nonexistent AWS_ACCESS_KEY_ID=AKIASYNTHETICSYNTHET AWS_SECRET_ACCESS_KEY=synthetic \
      AWS_MAX_ATTEMPTS=1 AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
      "$STUB_REAL_AWS" "${args[@]}" --endpoint-url http://127.0.0.1:9 --cli-connect-timeout 1 2>&1 > /dev/null)
    if printf '%s' "$err" | grep -q 'Could not connect to the endpoint URL'; then
      printf '%s %s\n' "$svc" "$op" >> "$S/valid"
    else
      printf '%s %s: %s\n' "$svc" "$op" "$(printf '%s' "$err" | tr '\n' ' ')" >> "$S/invalid"
      exit 252
    fi
  fi
fi
tab=$(printf '\t')
case "$svc $op" in
  "sts get-caller-identity") echo 123456789012 ;;
  "eks describe-cluster")
    case "$all" in
      *vpcId*) echo vpc-0123456789abcdef0 ;;
      *subnetIds*) echo "subnet-0aaaaaaaaaaaaaaaa${tab}subnet-0bbbbbbbbbbbbbbbb${tab}subnet-0cccccccccccccccc${tab}subnet-0dddddddddddddddd" ;;
      *endpoint*) echo https://SYNTHETIC.eks.example ;;
    esac ;;
  "ec2 describe-subnets") printf 'ap-northeast-2a\tsubnet-0aaaaaaaaaaaaaaaa\nap-northeast-2c\tsubnet-0cccccccccccccccc\n' ;;
  "ec2 describe-instances") echo "${STUB_NODE_SGS:-sg-0123456789abcdef0${tab}sg-0123456789abcdef0}" ;;
  "ec2 describe-security-groups") echo "${STUB_SG_ID:-None}" ;;
  "ec2 create-security-group") echo sg-0fedcba9876543210 ;;
  "ec2 authorize-security-group-ingress") echo sgr-0123456789abcdef0 ;;
  "rds describe-db-instances") case "$all" in *--filters*) echo "${STUB_DB_COUNT:-0}" ;; *) echo '{"multiAZ": true}' ;; esac ;;
  "rds describe-db-parameter-groups") echo "${STUB_RDS_PG_COUNT:-0}" ;;
  "rds describe-db-subnet-groups") echo 0 ;;
  "rds describe-db-parameters")
    printf 'log_error_verbosity\t%s\n' "${STUB_VERBOSITY:-terse}"
    printf '%s\n' log_min_error_statement=panic log_parameter_max_length_on_error=0 log_statement=none log_min_duration_statement=-1 \
      log_connections=0 rds.force_ssl=1 ssl_min_protocol_version=TLSv1.2 rds.log_retention_period=1440 | tr '=' '\t' ;;
  "rds wait" | "elasticache wait" | "acm wait")
    # STUB_WAIT_FAILS번째까지의 대기는 시간이 다 된 것처럼 실패시킨다.
    printf 'wait %s\n' "$all" >> "$S/waits"
    if [ "$(wc -l < "$S/waits" | tr -d ' ')" -le "${STUB_WAIT_FAILS:-0}" ]; then
      echo "Waiter failed: Max attempts exceeded (synthetic)" >&2
      exit 255
    fi ;;
  "elasticache describe-replication-groups") case "$all" in *length*) echo "${STUB_QUEUE_COUNT:-0}" ;; *) echo '{"multiAZ": "enabled"}' ;; esac ;;
  "elasticache describe-cache-parameter-groups" | "elasticache describe-cache-subnet-groups") echo 0 ;;
  "elasticache describe-cache-parameters") printf 'maxmemory-policy\tnoeviction\n' ;;
  "ssm describe-parameters") case "$all" in *auth-token*) echo "${STUB_TOKEN_COUNT:-1}" ;; *) echo "${STUB_KEY_COUNT:-0}" ;; esac ;;
  "ssm get-parameter") echo "${STUB_TOKEN:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}" ;;
  "sns list-topics") echo "${STUB_TOPIC:-None}" ;;
  "sns create-topic") echo arn:aws:sns:ap-northeast-2:123456789012:catchu-alerts ;;
  "sns subscribe") echo 'pending confirmation' ;;
  "sns list-subscriptions-by-topic") echo "${STUB_CONFIRMED:-1}" ;;
  "sns publish") echo 01234567-89ab-cdef-0123-456789abcdef ;;
  "sns get-topic-attributes")
    # 고친 정책이 있으면 그것을, 없으면 새 주제의 기본 정책(aws:SourceAccount 조건)을 돌려준다. STUB_TOPIC_POLICY로 바꿀 수 있다.
    if [ -s "$S/topic-policy" ]; then cat "$S/topic-policy"; exit 0; fi
    echo "${STUB_TOPIC_POLICY:-$(jq -cn '{Version: "2008-10-17", Statement: [{Sid: "__default_statement_ID", Effect: "Allow", Principal: {AWS: "*"},
      Action: ["SNS:Publish", "SNS:Subscribe"], Resource: "arn:aws:sns:ap-northeast-2:123456789012:catchu-alerts",
      Condition: {StringEquals: {"AWS:SourceAccount": "123456789012"}}}]}')}" ;;
  "sns set-topic-attributes")
    i=0
    while [ "$i" -lt "${#args[@]}" ]; do
      [ "${args[$i]}" = --attribute-value ] && printf '%s\n' "${args[$((i + 1))]}" > "$S/topic-policy"
      i=$((i + 1))
    done ;;
  "cloudwatch describe-alarms") case "$all" in *length*) echo "${STUB_ALARM_COUNT:-0}" ;; *) echo '{"MetricAlarms":[]}' ;; esac ;;
  "route53 list-hosted-zones-by-name") echo "${STUB_ZONE-/hostedzone/Z0123456789ABCDEFGHIJ}" ;;
  "route53 change-resource-record-sets") echo /change/C0123456789ABCDEFGHIJ ;;
  "acm list-certificates") echo "${STUB_CERT_COUNT:-0}" ;;
  "acm request-certificate") echo arn:aws:acm:ap-northeast-2:123456789012:certificate/01234567-89ab-cdef-0123-456789abcdef ;;
  "acm describe-certificate")
    case "$all" in
      *ResourceRecord*)
        if [ -n "${STUB_NO_RECORD:-}" ]; then echo null; else
          echo '{"Name":"_0123456789abcdef0123456789abcdef.catchu.dev.","Type":"CNAME","Value":"_fedcba9876543210fedcba9876543210.synthetic.acm-validations.aws."}'
        fi ;;
      *) echo '{"Certificate":{"CertificateArn":"arn:aws:acm:ap-northeast-2:123456789012:certificate/01234567-89ab-cdef-0123-456789abcdef","DomainName":"catchu.dev","Status":"ISSUED","Type":"AMAZON_ISSUED","KeyAlgorithm":"RSA-2048","NotAfter":"2027-05-15T23:59:59Z","RenewalEligibility":"INELIGIBLE","DomainValidationOptions":[{"DomainName":"catchu.dev","ValidationMethod":"DNS","ValidationStatus":"SUCCESS"}]}}' ;;
    esac ;;
  "eks list-pod-identity-associations") echo "${STUB_PIA_COUNT:-1}" ;;
  "logs describe-log-groups") case "$all" in *length*) echo "${STUB_LOG_GROUP_COUNT:-0}" ;; *) echo '{"logGroups":[{"logGroupName":"/catchu/eks/app","retentionInDays":14}]}' ;; esac ;;
  "elbv2 describe-target-groups") echo "${STUB_LB_ARNS:-arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/k8s-catchu-0123456789/0123456789abcdef${tab}arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/k8s-catchu-0123456789/0123456789abcdef}" ;;
  "efs describe-file-systems")
    case "$all" in
      *--creation-token*) echo "${STUB_FS:-None}" ;;
      *"{"*) echo '{"encrypted": true}' ;;
      *FileSystemArn*) echo arn:aws:elasticfilesystem:ap-northeast-2:123456789012:file-system/fs-0123456789abcdef0 ;;
      *LifeCycleState*) echo available ;;
    esac ;;
  "efs create-file-system") echo fs-0123456789abcdef0 ;;
  "efs create-access-point") echo arn:aws:elasticfilesystem:ap-northeast-2:123456789012:access-point/fsap-0123456789abcdef0 ;;
  "efs describe-mount-targets") case "$all" in *"LifeCycleState=="*) echo 2 ;; *) printf 'ap-northeast-2a\tsubnet-0aaaaaaaaaaaaaaaa\tavailable\n' ;; esac ;;
  "efs describe-access-points") printf 'fsap-0123456789abcdef0\t1000\t1000\t/github-credentials\t0700\n' ;;
  "efs describe-backup-policy") echo DISABLED ;;
  "efs describe-file-system-policy") echo '{"Statement":[{"Sid":"AllowMountViaMountTarget","Effect":"Allow","Action":["elasticfilesystem:ClientMount"]}]}' ;;
  "backup list-recovery-points-by-resource") echo 0 ;;
  "wafv2 check-capacity") echo 36 ;;
  "wafv2 list-web-acls") echo "${STUB_ACL:-None}" ;;
  "wafv2 create-web-acl") echo 0123abcd-0123-abcd-0123-0123456789ab ;;
  "wafv2 get-web-acl") echo '{"WebACL":{"Name":"catchu-edge","Capacity":36,"DefaultAction":{"Allow":{}},"VisibilityConfig":{"SampledRequestsEnabled":false},"Rules":[]}}' ;;
  *create-* | *modify-* | *put-* | *authorize-*) echo ok ;;
  *) echo "합성 aws: 정해 두지 않은 호출 $svc $op" >&2; printf '%s %s\n' "$svc" "$op" >> "$S/unknown"; exit 253 ;;
esac
EOF
cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  "config view"*) echo "${STUB_SERVER:-https://SYNTHETIC.eks.example}" ;;
  "-n catchu get targetgroupbindings -o json")
    # STUB_TGB가 있으면 그것을, 없으면 api·web 대상 그룹 하나씩을 돌려준다.
    if [ -n "${STUB_TGB:-}" ]; then printf '%s\n' "$STUB_TGB"; exit 0; fi
    tg=arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup
    jq -cn --arg a "$tg/k8s-catchu-api-0123456789/0123456789abcdef" --arg w "$tg/k8s-catchu-web-0123456789/fedcba9876543210" \
      '{items: [{spec: {serviceRef: {name: "api"}, targetGroupARN: $a}}, {spec: {serviceRef: {name: "web"}, targetGroupARN: $w}}]}' ;;
  "version --client -o json") echo '{"clientVersion":{"gitVersion":"v1.37.1"}}' ;;
  "--namespace kube-system get deployment aws-load-balancer-controller "*) echo "${STUB_LBC_READY:-2/2}" ;;
  "get ingressclass alb "*) echo ingress.k8s.aws/alb ;;
  "get mutatingwebhookconfiguration aws-load-balancer-webhook "*) echo "${STUB_LBC_WEBHOOKS:-mpod.elbv2.k8s.aws mtargetgroupbinding.elbv2.k8s.aws}" ;;
  "auth can-i list secrets --all-namespaces "*) echo "${STUB_LBC_SECRETS:-no}"; [ "${STUB_LBC_SECRETS:-no}" = yes ] ;;
esac
EOF
cat > "$BIN/helm" <<'EOF'
#!/usr/bin/env bash
# 합성 helm. 설치·받기는 calls에 남기고, 받기는 빈 차트 파일을 만든다.
S=${STUB_STATE:?}
printf 'helm %s\n' "$1" >> "$S/seen"
case "$1" in
  version) echo v4.3.0+gsynthetic ;;
  list) printf '%s' "${STUB_HELM_RELEASES:-}" ;;
  pull)
    [ -n "${STUB_PULL_FAIL:-}" ] && { echo "Error: synthetic pull failure" >&2; exit 1; }
    dest='' version=''
    while [ "$#" -gt 0 ]; do
      case "$1" in --destination) dest=$2; shift ;; --version) version=$2; shift ;; esac
      shift
    done
    : > "$dest/aws-load-balancer-controller-${version}.tgz" ;;
  install) printf 'helm %s\n' "$*" >> "$S/calls" ;;
  *) echo "합성 helm: 정해 두지 않은 호출 $*" >&2; echo "helm $1" >> "$S/unknown"; exit 1 ;;
esac
EOF
cat > "$BIN/shasum" <<'EOF'
#!/usr/bin/env bash
# 합성 shasum. 마지막 인자(파일)에 STUB_SHA를, 없으면 install-lb-controller.sh에 적은 해시를 돌려준다.
for f in "$@"; do :; done
printf '%s  %s\n' "${STUB_SHA:-$STUB_LBC_SHA}" "$f"
EOF
cat > "$BIN/sleep" <<'EOF'
#!/usr/bin/env bash
printf 'sleep %s\n' "$*" >> "${STUB_STATE:?}/sleeps"
EOF
chmod +x "$BIN/aws" "$BIN/kubectl" "$BIN/sleep" "$BIN/helm" "$BIN/shasum"

# ---------- 실행 도우미 ----------
reset_state() {
  rm -rf "$S" "$WORK/home" "$WORK/tmp"
  mkdir -p "$S" "$WORK/home/.kube" "$WORK/tmp"
  : > "$S/seen"; : > "$S/calls"; : > "$S/secrets"
  : > "$WORK/home/.kube/catchu"
}
run_sut() { # 스크립트 [인자…]. 합성 값을 바꿀 STUB_*·환경변수는 env로 앞에 붙인다.
  reset_state
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_SECURITY_TOKEN -u AWS_PROFILE -u AWS_REGION \
    -u AWS_DEFAULT_REGION -u KUBECONFIG -u CATCHU_NODE_SG \
    PATH="$BIN:$PATH" HOME="$WORK/home" TMPDIR="$WORK/tmp" STUB_STATE="$S" STUB_REAL_AWS="$REAL_AWS" STUB_LBC_SHA="$LBC_SHA" \
    CATCHU_EXPECTED_ACCOUNT=123456789012 "$@" > "$OUT" 2>&1
  rc=$?
}
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "통과: $1"; else fail=$((fail + 1)); echo "실패: $1"; sed 's/^/    | /' "$OUT"; fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }
ops() { awk '{ print $1, $2 }' "$S/calls" | grep -v 'wafv2 check-capacity'; }
call_of() { grep -m1 -- "^$1 " "$S/calls"; }
has_all() { # 호출 줄, 옵션…
  local line=$1 o
  shift
  for o in "$@"; do case " $line " in *" $o "*) ;; *) echo "빠진 옵션: $o" >> "$OUT"; return 1 ;; esac; done
}
has_none() {
  local line=$1 o
  shift
  for o in "$@"; do case " $line " in *" $o "*) echo "있으면 안 되는 옵션: $o" >> "$OUT"; return 1 ;; esac; done
}
clean() { # 비밀값이 출력에 없고, 알 수 없는 호출·인자 검사 실패·남은 임시 파일이 없다
  [ ! -s "$S/unknown" ] && [ ! -s "$S/invalid" ] && [ -z "$(ls -A "$WORK/tmp")" ] && ! grep -qF -f "$S/secrets" "$OUT" 2> /dev/null
}
P=$HERE
LBC_SHA=$(sed -n 's/^chart_sha256=//p' "$P/install-lb-controller.sh")

# ---------- 확인 모드: 만드는 호출이 없다 ----------
for s in rds queue efs waf; do
  run_sut bash "$P/create-$s.sh"
  check "확인 모드 $s: 종료 0, 만드는 호출 0, --apply 안내" "$(ok test "$rc" = 0 -a -z "$(ops)" -a "$(grep -c -- '--apply로 다시 실행' "$OUT")" = 1)"
done

# ---------- 만들기 모드: 순서·필수 옵션·진짜 CLI 인자 검사 ----------
run_sut env STUB_VALIDATE=1 bash "$P/create-rds.sh" --apply
check "RDS 만들기: 종료 0, 순서대로 6건" "$(ok test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "rds create-db-parameter-group,rds modify-db-parameter-group,rds create-db-subnet-group,ec2 create-security-group,ec2 authorize-security-group-ingress,rds create-db-instance,")"
db=$(call_of 'rds create-db-instance')
check "RDS 만들기: Multi-AZ·암호화·삭제 보호·백업 7일·공개 끔·부 판본 자동 끔·관리 비밀번호·파라미터 그룹, 가용 영역 지정 없음" \
  "$( { has_all "$db" --multi-az --storage-encrypted --deletion-protection --backup-retention-period 7 --no-publicly-accessible --no-auto-minor-version-upgrade --manage-master-user-password catchu-pg16 rds-ca-rsa2048-g1 && has_none "$db" --availability-zone --master-user-password --publicly-accessible; } > /dev/null 2>&1; echo $?)"
# 기대값에 {…,…}가 있어 명령 치환 안에 바로 쓰면 bash 3.2가 중괄호 확장을 한다. 변수에 먼저 담는다.
rule_of() { printf 'IpProtocol=tcp,FromPort=%s,ToPort=%s,UserIdGroupPairs=[{GroupId=%s,Description=catchu-nodes}]' "$1" "$1" "$2"; }
want=$(rule_of 5432 "$NODE_SG")
check "RDS 만들기: 노드 보안 그룹에서 5432만 허용" "$(ok has_all "$(call_of 'ec2 authorize-security-group-ingress')" "$want")"
check "RDS 만들기: 파라미터 그룹을 고친 뒤 5분 기다리고 DB 준비를 기다림" "$(ok test "$(cat "$S/sleeps" 2> /dev/null)" = 'sleep 300' -a -s "$S/waits")"
check "RDS 만들기: CLI 인자 검사 6건 통과, 정리" "$( { test "$(wc -l < "$S/valid" | tr -d ' ')" = 6 && clean; } > /dev/null 2>&1; echo $?)"

run_sut env STUB_VALIDATE=1 bash "$P/create-queue.sh" --apply
check "큐 만들기: 종료 0, 순서대로 6건" "$(ok test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "elasticache create-cache-parameter-group,elasticache modify-cache-parameter-group,elasticache create-cache-subnet-group,ec2 create-security-group,ec2 authorize-security-group-ingress,elasticache create-replication-group,")"
q=$(call_of 'elasticache create-replication-group')
check "큐 만들기: 복제본·자동 장애 조치·TLS 필수·저장 암호화·스냅샷 0·noeviction 그룹, 비밀번호는 파일로만" \
  "$( { has_all "$q" --num-cache-clusters 2 --automatic-failover-enabled --multi-az-enabled --transit-encryption-enabled --transit-encryption-mode required --at-rest-encryption-enabled --snapshot-retention-limit 0 --no-auto-minor-version-upgrade catchu-valkey8-noeviction --cli-input-json && has_none "$q" --auth-token; } > /dev/null 2>&1; echo $?)"
check "큐 만들기: CLI 인자 검사 6건 통과, 비밀번호 출력 0, 임시 파일 0" "$( { test "$(wc -l < "$S/valid" | tr -d ' ')" = 6 -a -s "$S/secrets" && clean; } > /dev/null 2>&1; echo $?)"

run_sut env STUB_VALIDATE=1 bash "$P/create-efs.sh" --apply
check "EFS 만들기: 종료 0, 순서대로 8건" "$(ok test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "ec2 create-security-group,ec2 authorize-security-group-ingress,efs create-file-system,efs create-mount-target,efs create-mount-target,efs create-access-point,efs put-file-system-policy,ssm put-parameter,")"
want='Path=/github-credentials,CreationInfo={OwnerUid=1000,OwnerGid=1000,Permissions=0700}'
check "EFS 만들기: 암호화·백업 끔, 접근점 UID 1000·0700" "$( { has_all "$(call_of 'efs create-file-system')" --encrypted --no-backup && has_all "$(call_of 'efs create-access-point')" Uid=1000,Gid=1000 "$want"; } > /dev/null 2>&1; echo $?)"
policy=$(call_of 'efs put-file-system-policy' | sed 's/.*--policy //; s/ --query.*//')
want='[["Allow",["elasticfilesystem:ClientMount","elasticfilesystem:ClientWrite"],{"Bool":{"elasticfilesystem:AccessedViaMountTarget":"true"},"StringEquals":{"elasticfilesystem:AccessPointArn":"arn:aws:elasticfilesystem:ap-northeast-2:123456789012:access-point/fsap-0123456789abcdef0"}}],["Deny","*",{"Bool":{"aws:SecureTransport":"false"}}]]'
check "EFS 만들기: 정책은 마운트 지점과 만든 접근점을 거친 마운트·쓰기만 허용(루트 권한 없음), TLS 아닌 접속 거부" \
  "$(ok test "$(printf '%s' "$policy" | jq -c '[.Statement[] | [.Effect, .Action, .Condition]]')" = "$want")"
check "EFS 만들기: 키는 파일로만 넘기고(--value 없음) CLI 인자 검사 8건 통과, 키 출력 0, 임시 파일 0" \
  "$( { has_all "$(call_of 'ssm put-parameter')" --cli-input-json && has_none "$(call_of 'ssm put-parameter')" --value && test "$(wc -l < "$S/valid" | tr -d ' ')" = 8 -a -s "$S/secrets" && clean; } > /dev/null 2>&1; echo $?)"

run_sut env STUB_VALIDATE=1 bash "$P/create-waf.sh" --apply
check "WAF 만들기: 종료 0, 웹 ACL 1건, 요청 표본 끔, 규칙 원문 형식, CLI 인자 검사 통과" \
  "$( { test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "wafv2 create-web-acl," && has_all "$(call_of 'wafv2 create-web-acl')" --cli-binary-format raw-in-base64-out SampledRequestsEnabled=false,CloudWatchMetricsEnabled=true,MetricName=catchu-edge && test "$(wc -l < "$S/valid" | tr -d ' ')" = 2 && clean; } > /dev/null 2>&1; echo $?)"

# ---------- 공통 확인 ----------
run_sut env AWS_ACCESS_KEY_ID=AKIASYNTHETIC bash "$P/create-waf.sh"
check "키 환경변수가 있으면 AWS를 부르기 전에 멈춤" "$(ok test "$rc" = 1 -a ! -s "$S/seen")"
run_sut env AWS_PROFILE=default bash "$P/create-waf.sh"
check "AWS_PROFILE이 다르면 멈춤" "$(ok test "$rc" = 1 -a ! -s "$S/seen")"
run_sut env AWS_REGION=us-east-1 bash "$P/create-waf.sh"
check "AWS_REGION이 다르면 멈춤" "$(ok test "$rc" = 1 -a ! -s "$S/seen")"
run_sut env CATCHU_EXPECTED_ACCOUNT= bash "$P/create-waf.sh"
check "기대 계정 번호가 없으면 멈춤" "$(ok test "$rc" = 1 -a "$(grep -c '기대 계정 번호가 없다' "$OUT")" = 1)"
for s in rds queue efs waf alert-topic alarms log-group certificate; do
  run_sut env CATCHU_EXPECTED_ACCOUNT=999999999999 CATCHU_ALERT_EMAIL=alerts.synthetic@example.com bash "$P/create-$s.sh" --apply
  check "계정이 다르면 $s: 계정 조회 말고는 AWS를 부르지 않고 멈추며 번호를 찍지 않음" \
    "$( { test "$rc" = 1 -a "$(sort -u "$S/seen")" = 'sts get-caller-identity' && test "$(grep -c -E '123456789012|999999999999' "$OUT")" = 0; } > /dev/null 2>&1; echo $?)"
done
reset_state
mkdir -p "$WORK/home/.config/catchu" && echo 123456789012 > "$WORK/home/.config/catchu/aws-account-id"
env -u AWS_PROFILE -u CATCHU_EXPECTED_ACCOUNT PATH="$BIN:$PATH" HOME="$WORK/home" STUB_STATE="$S" STUB_REAL_AWS="$REAL_AWS" bash "$P/check-target.sh" > "$OUT" 2>&1
rc=$?
check "기대 계정 번호를 저장소 밖 파일에서 읽음" "$(ok test "$rc" = 0 -a "$(grep -c '계정 확인: 일치' "$OUT")" = 1)"
run_sut bash "$P/check-target.sh" --cluster
check "클러스터 확인: kubeconfig가 catchu 클러스터를 가리키면 통과" "$(ok test "$rc" = 0 -a "$(grep -c '클러스터 확인: 일치' "$OUT")" = 1)"
run_sut env STUB_SERVER=https://OTHER.example bash "$P/check-target.sh" --cluster
check "클러스터 확인: 다른 클러스터면 멈춤" "$(ok test "$rc" = 1)"
run_sut env KUBECONFIG=/tmp/other bash "$P/check-target.sh" --cluster
check "클러스터 확인: KUBECONFIG가 다른 파일이면 멈춤" "$(ok test "$rc" = 1)"

# ---------- 노드 보안 그룹 ----------
two="sg-0aaaaaaaaaaaaaaaa$(printf '\t')sg-0bbbbbbbbbbbbbbbb"
run_sut env STUB_NODE_SGS="$two" bash "$P/create-rds.sh" --apply
check "노드 보안 그룹이 둘이면 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_NODE_SGS="$two" CATCHU_NODE_SG=sg-0bbbbbbbbbbbbbbbb bash "$P/create-rds.sh" --apply
want=$(rule_of 5432 sg-0bbbbbbbbbbbbbbbb)
check "CATCHU_NODE_SG가 노드에 붙은 것이면 그 그룹으로 허용" "$( { test "$rc" = 0 && has_all "$(call_of 'ec2 authorize-security-group-ingress')" "$want"; } > /dev/null 2>&1; echo $?)"
run_sut env CATCHU_NODE_SG=sg-0ccccccccccccccccc bash "$P/create-rds.sh" --apply
check "CATCHU_NODE_SG가 노드에 붙지 않은 것이면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"

# ---------- 조회 실패를 '있음'·'없음'으로 보지 않음 ----------
run_sut env STUB_FAIL='rds describe-db-instances' bash "$P/create-rds.sh" --apply
check "DB 조회 실패면 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_FAIL='ssm describe-parameters' bash "$P/create-efs.sh" --apply
check "EFS 키 조회 실패면 '있음'·'없음'으로 넘기지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_FAIL='ec2 describe-security-groups' bash "$P/create-queue.sh" --apply
check "보안 그룹 조회 실패면 큐를 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_VERBOSITY=default bash "$P/create-rds.sh" --apply
check "파라미터 값이 기대와 다르면 DB를 만들지 않음" "$(ok test "$rc" = 1 -a -z "$(call_of 'rds create-db-instance')")"

# ---------- 만들 자원이 하나라도 이미 있으면 아무것도 만들지 않고 멈춤 ----------
stopped() { # 이미 있는 것으로 찍힐 이름
  test "$rc" = 1 -a -z "$(ops)" && grep -qF -- "- $1" "$OUT" && grep -q '생성이 중간에 멈췄을 때' "$OUT"
}
run_sut env STUB_DB_COUNT=1 bash "$P/create-rds.sh" --apply
check "DB가 이미 있으면 멈춤" "$(ok stopped 'DB catchu-db')"
run_sut env STUB_DB_COUNT=1 bash "$P/create-rds.sh"
check "DB가 이미 있으면 확인 모드에서도 멈춤" "$(ok stopped 'DB catchu-db')"
run_sut env STUB_RDS_PG_COUNT=1 bash "$P/create-rds.sh" --apply
check "만들다 멈춰 파라미터 그룹만 남았어도 멈추고 그것을 알려 줌" "$(ok stopped '파라미터 그룹 catchu-pg16')"
run_sut env STUB_QUEUE_COUNT=1 bash "$P/create-queue.sh" --apply
check "큐가 이미 있으면 멈춤" "$(ok stopped '복제 그룹 catchu-queue')"
run_sut env STUB_SG_ID=sg-0fedcba9876543210 bash "$P/create-queue.sh" --apply
check "보안 그룹만 남았어도 멈추고 그것을 알려 줌" "$(ok stopped '보안 그룹 catchu-queue(sg-0fedcba9876543210)')"
run_sut env STUB_FS=fs-0123456789abcdef0 bash "$P/create-efs.sh" --apply
check "EFS 파일 시스템이 이미 있으면 멈춤(키도 만들지 않음)" "$(ok stopped '파일 시스템 catchu-github-credentials(fs-0123456789abcdef0)')"
run_sut env STUB_ACL=abc123 bash "$P/create-waf.sh"
check "웹 ACL이 이미 있으면 멈춤" "$(ok stopped '웹 ACL catchu-edge(abc123)')"
run_sut env STUB_KEY_COUNT=1 bash "$P/create-efs.sh" --apply
check "EFS 암호화 키가 이미 있으면 새 파일 시스템에 그대로 씀(덮어쓰지 않음)" "$(ok test "$rc" = 0 -a -z "$(call_of 'ssm put-parameter')")"

# ---------- 기다리기 ----------
run_sut env STUB_WAIT_FAILS=1 bash "$P/create-rds.sh" --apply
check "DB 대기가 한 번 시간이 다 돼도 이어서 기다려 끝남(최대 2번)" "$(ok test "$rc" = 0 -a "$(wc -l < "$S/waits" | tr -d ' ')" = 2 -a "$(grep -c multiAZ "$OUT")" = 1)"
run_sut env STUB_WAIT_FAILS=2 bash "$P/create-rds.sh" --apply
check "DB 대기가 2번 모두 끝나면 다시 실행하지 말라고 하고 멈춤" "$(ok test "$rc" = 1 -a "$(wc -l < "$S/waits" | tr -d ' ')" = 2 -a "$(grep -c '다시 실행하지 말고' "$OUT")" = 1)"
run_sut env STUB_WAIT_FAILS=3 bash "$P/create-queue.sh" --apply
check "큐 대기는 최대 4번까지 이어서 기다림" "$(ok test "$rc" = 0 -a "$(wc -l < "$S/waits" | tr -d ' ')" = 4)"
run_sut env STUB_WAIT_FAILS=4 bash "$P/create-queue.sh" --apply
check "큐 대기가 4번 모두 끝나면 멈춤" "$(ok test "$rc" = 1 -a "$(wc -l < "$S/waits" | tr -d ' ')" = 4)"

# ---------- 큐 비밀번호 ----------
run_sut env STUB_TOKEN='short"tok' bash "$P/create-queue.sh" --apply
check "큐 비밀번호가 글자 규칙에 맞지 않으면 큐를 만들지 않고 값을 찍지 않음" "$(ok test "$rc" = 1 -a -z "$(call_of 'elasticache create-replication-group')" -a "$(grep -c 'short' "$OUT")" = 0 -a -z "$(ls -A "$WORK/tmp")")"
run_sut env STUB_TOKEN_COUNT=0 bash "$P/create-queue.sh"
check "큐 비밀번호 SSM이 없으면 멈춤" "$(ok test "$rc" = 1)"
run_sut env STUB_TOPIC=arn:aws:sns:ap-northeast-2:123456789012:catchu-alerts bash "$P/create-queue.sh" --apply
check "알림 주제가 있으면 큐 이벤트를 그 주제로 보냄" "$( { test "$rc" = 0 && has_all "$(call_of 'elasticache create-replication-group')" --notification-topic-arn; } > /dev/null 2>&1; echo $?)"

# ---------- 경보 받는 주제(create-alert-topic.sh) ----------
MAIL=alerts.synthetic@example.com
TOPIC=arn:aws:sns:ap-northeast-2:123456789012:catchu-alerts
run_sut env CATCHU_ALERT_EMAIL=$MAIL bash "$P/create-alert-topic.sh"
check "주제 확인 모드: 종료 0, 만드는 호출 0, --apply 안내" "$(ok test "$rc" = 0 -a -z "$(ops)" -a "$(grep -c -- '--apply로 다시 실행' "$OUT")" = 1)"
run_sut env STUB_VALIDATE=1 CATCHU_ALERT_EMAIL=$MAIL bash "$P/create-alert-topic.sh" --apply
check "주제 만들기: 주제·정책·이메일 구독 순서, CLI 인자 검사 3건 통과, 화면에 주소 원문 없음(가린 주소만)" \
  "$( { test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "sns create-topic,sns set-topic-attributes,sns subscribe," -a "$(wc -l < "$S/valid" | tr -d ' ')" = 3 && has_all "$(call_of 'sns subscribe')" --protocol email "$MAIL" && ! grep -qF "$MAIL" "$OUT" && grep -qF 'a***@example.com' "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
want='[["__default_statement_ID","AWS:SourceAccount"],["AllowSourceOwnerPublish","AWS:SourceOwner"]]'
check "주제 정책: 기본 문장은 두고, 이 계정 소유의 Publish 허용 문장(주제 ARN·계정 번호로 묶음)을 덧붙이며 계정 번호를 찍지 않음" \
  "$( { test "$(jq -c '[.Statement[] | [.Sid, (.Condition.StringEquals | keys[0])]]' "$S/topic-policy")" = "$want" &&
    test "$(jq -c '.Statement[1] | [.Principal.AWS, .Action, .Resource, .Condition.StringEquals["AWS:SourceOwner"]]' "$S/topic-policy")" = "[\"*\",\"SNS:Publish\",\"$TOPIC\",\"123456789012\"]" &&
    ! grep -q 123456789012 "$OUT"; } > /dev/null 2>&1; echo $?)"
run_sut bash "$P/create-alert-topic.sh" --apply
check "주제: 받을 주소가 없으면 AWS를 부르기 전에 멈춤" "$(ok test "$rc" = 1 -a ! -s "$S/seen")"
run_sut env CATCHU_ALERT_EMAIL='a b@example' bash "$P/create-alert-topic.sh" --apply
check "주제: 주소 형식이 아니면 멈춤" "$(ok test "$rc" = 1 -a ! -s "$S/seen")"
run_sut env STUB_TOPIC=$TOPIC CATCHU_ALERT_EMAIL=$MAIL bash "$P/create-alert-topic.sh" --apply
check "주제가 이미 있으면 멈춤" "$(ok stopped 'SNS 주제 catchu-alerts')"
# 주제 정책: 기본 문장과 --apply가 덧붙인 문장이 모두 있는 상태
good_policy=$(jq -cn --arg t "$TOPIC" '{Statement: [{Sid: "__default_statement_ID", Effect: "Allow", Principal: {AWS: "*"}, Action: ["SNS:Publish"], Resource: $t,
  Condition: {StringEquals: {"AWS:SourceAccount": "123456789012"}}}, {Sid: "AllowSourceOwnerPublish", Effect: "Allow", Principal: {AWS: "*"},
  Action: "SNS:Publish", Resource: $t, Condition: {StringEquals: {"AWS:SourceOwner": "123456789012"}}}]}')
run_sut env STUB_VALIDATE=1 STUB_TOPIC=$TOPIC STUB_TOPIC_POLICY="$good_policy" bash "$P/create-alert-topic.sh" --test
check "수신 시험: 확인된 구독이 있으면 시험 메시지 1통(주소 없이 실행), CLI 인자 검사 통과" \
  "$(ok test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "sns publish," -a "$(wc -l < "$S/valid" | tr -d ' ')" = 1)"
run_sut env STUB_TOPIC=$TOPIC bash "$P/create-alert-topic.sh" --test
check "수신 시험: 주제 정책에 ElastiCache용 발행 허용이 없으면(기본 정책만) 보내지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)" -a "$(grep -c 'AllowSourceOwnerPublish 문장이 없어' "$OUT")" = 1)"
run_sut env STUB_TOPIC=$TOPIC STUB_TOPIC_POLICY="$good_policy" STUB_CONFIRMED=0 bash "$P/create-alert-topic.sh" --test
check "수신 시험: 확인된 구독이 없으면 보내지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut bash "$P/create-alert-topic.sh" --test
check "수신 시험: 주제가 없으면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"

# ---------- 경보(create-alarms.sh) ----------
ready=(STUB_TOPIC=$TOPIC STUB_DB_COUNT=1)
run_sut env "${ready[@]}" bash "$P/create-alarms.sh"
check "경보 확인 모드: 종료 0, 만드는 호출 0, --apply 안내" "$(ok test "$rc" = 0 -a -z "$(ops)" -a "$(grep -c -- '--apply로 다시 실행' "$OUT")" = 1)"
run_sut env STUB_VALIDATE=1 "${ready[@]}" bash "$P/create-alarms.sh" --apply
check "경보 만들기: 종료 0, 4건, CLI 인자 검사 4건 통과" \
  "$(ok test "$rc" = 0 -a "$(ops | sort -u)" = 'cloudwatch put-metric-alarm' -a "$(wc -l < "$S/calls" | tr -d ' ')" = 4 -a "$(wc -l < "$S/valid" | tr -d ' ')" = 4)"
alarm_of() { grep -m1 -- "--alarm-name $1 " "$S/calls"; }
lb=Name=LoadBalancer,Value=app/k8s-catchu-0123456789/0123456789abcdef
a=$(alarm_of catchu-api-no-target)
w=$(alarm_of catchu-web-no-target)
check "경보: 정상 대상 0은 api·web 각자의 대상 그룹과 ALB 차원, 최솟값 1 미만 5분, 값 없으면 경보" \
  "$( { has_all "$a" Name=TargetGroup,Value=targetgroup/k8s-catchu-api-0123456789/0123456789abcdef "$lb" HealthyHostCount Minimum LessThanThreshold breaching && has_all "$w" Name=TargetGroup,Value=targetgroup/k8s-catchu-web-0123456789/fedcba9876543210 "$lb" && test "$(printf '%s' "$a" | sed -E 's/.*--evaluation-periods ([0-9]+).*/\1/')" = 5; } > /dev/null 2>&1; echo $?)"
x=$(alarm_of catchu-alb-target-5xx)
d=$(alarm_of catchu-db-free-storage)
check "경보: 5xx는 ALB 차원 합계 10 이상·값 없으면 정상, 저장 공간은 catchu-db 2GiB 미만" \
  "$( { has_all "$x" HTTPCode_Target_5XX_Count "$lb" Sum GreaterThanOrEqualToThreshold notBreaching && has_none "$x" Name=TargetGroup,Value=targetgroup/k8s-catchu-api-0123456789/0123456789abcdef && has_all "$d" FreeStorageSpace Name=DBInstanceIdentifier,Value=catchu-db 2147483648 LessThanThreshold; } > /dev/null 2>&1; echo $?)"
check "경보: 모두 경보·회복을 catchu-alerts로 보냄" \
  "$(ok test "$(grep -c -- "--alarm-actions $TOPIC --ok-actions $TOPIC" "$S/calls")" = 4)"
run_sut env STUB_DB_COUNT=1 bash "$P/create-alarms.sh" --apply
check "경보: 주제가 없으면 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env "${ready[@]}" STUB_CONFIRMED=0 bash "$P/create-alarms.sh" --apply
check "경보: 확인된 이메일 구독이 없으면 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_TOPIC=$TOPIC bash "$P/create-alarms.sh" --apply
check "경보: RDS가 없으면 만들지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env "${ready[@]}" STUB_TGB='{"items":[]}' bash "$P/create-alarms.sh" --apply
check "경보: 대상 그룹을 찾지 못하면(Ingress 전) 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)" -a "$(grep -c 'TargetGroupBinding이 하나가 아니다' "$OUT")" = 1)"
two_lb="arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/a/1$(printf '\t')arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/b/2"
run_sut env "${ready[@]}" STUB_LB_ARNS="$two_lb" bash "$P/create-alarms.sh" --apply
check "경보: api·web 대상 그룹이 서로 다른 ALB면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env "${ready[@]}" STUB_FAIL='cloudwatch describe-alarms' bash "$P/create-alarms.sh" --apply
check "경보: 경보 조회 실패면 '없음'으로 넘기지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env "${ready[@]}" STUB_ALARM_COUNT=2 bash "$P/create-alarms.sh"
check "경보가 하나라도 있으면 확인 모드에서도 멈춤" "$(ok stopped '이 스크립트가 만드는 이름의 경보 2개')"
run_sut env "${ready[@]}" STUB_SERVER=https://OTHER.example bash "$P/create-alarms.sh" --apply
check "경보: kubectl이 다른 클러스터를 가리키면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"

# ---------- 로그 그룹(create-log-group.sh) ----------
run_sut bash "$P/create-log-group.sh"
check "로그 그룹 확인 모드: 종료 0, 만드는 호출 0, --apply 안내" "$(ok test "$rc" = 0 -a -z "$(ops)" -a "$(grep -c -- '--apply로 다시 실행' "$OUT")" = 1)"
run_sut env STUB_VALIDATE=1 bash "$P/create-log-group.sh" --apply
check "로그 그룹 만들기: 그룹 → 보존 기간 순서, CLI 인자 검사 2건 통과, 확인 값에 보존 14일" \
  "$( { test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "logs create-log-group,logs put-retention-policy," -a "$(wc -l < "$S/valid" | tr -d ' ')" = 2 && grep -q '"retentionInDays": 14' "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
check "로그 그룹: 이름 /catchu/eks/app, 보존 14일, 태그" \
  "$( { has_all "$(call_of 'logs create-log-group')" --log-group-name /catchu/eks/app project=catchu,issue=276 && has_all "$(call_of 'logs put-retention-policy')" --log-group-name /catchu/eks/app --retention-in-days 14; } > /dev/null 2>&1; echo $?)"
run_sut env STUB_LOG_GROUP_COUNT=1 bash "$P/create-log-group.sh"
check "로그 그룹이 이미 있으면 확인 모드에서도 멈춤" "$(ok stopped '로그 그룹 /catchu/eks/app')"
run_sut env STUB_FAIL='logs describe-log-groups' bash "$P/create-log-group.sh" --apply
check "로그 그룹 조회 실패면 '없음'으로 넘기지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"

# ---------- 인증서(create-certificate.sh) ----------
CERT_ARN=arn:aws:acm:ap-northeast-2:123456789012:certificate/01234567-89ab-cdef-0123-456789abcdef
run_sut bash "$P/create-certificate.sh"
check "인증서 확인 모드: 종료 0, 만드는 호출 0, --apply 안내" "$(ok test "$rc" = 0 -a -z "$(ops)" -a "$(grep -c -- '--apply로 다시 실행' "$OUT")" = 1)"
run_sut env STUB_VALIDATE=1 bash "$P/create-certificate.sh" --apply
check "인증서 만들기: 요청 → 검증 기록 순서, CLI 인자 검사 2건 통과, 발급을 기다림, 계정 번호·ARN을 찍지 않음" \
  "$( { test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "acm request-certificate,route53 change-resource-record-sets," -a "$(wc -l < "$S/valid" | tr -d ' ')" = 2 -a -s "$S/waits" && grep -q '"Status": "ISSUED"' "$OUT" && ! grep -q 123456789012 "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
check "인증서: catchu.dev·DNS 검증·RSA 2048·태그" \
  "$(ok has_all "$(call_of 'acm request-certificate')" --domain-name catchu.dev --validation-method DNS --key-algorithm RSA_2048 Key=project,Value=catchu Key=issue,Value=276)"
batch=$(call_of 'route53 change-resource-record-sets' | sed 's/.*--change-batch //')
want='["UPSERT","CNAME","_0123456789abcdef0123456789abcdef.catchu.dev.","_fedcba9876543210fedcba9876543210.synthetic.acm-validations.aws."]'
check "인증서: ACM이 준 CNAME 하나를 catchu.dev 공개 영역에 UPSERT(A 기록은 건드리지 않음)" \
  "$( { has_all "$(call_of 'route53 change-resource-record-sets')" --hosted-zone-id /hostedzone/Z0123456789ABCDEFGHIJ && test "$(printf '%s' "$batch" | jq -c '[.Changes[0] | .Action, .ResourceRecordSet.Type, .ResourceRecordSet.Name, .ResourceRecordSet.ResourceRecords[0].Value]')" = "$want" && test "$(printf '%s' "$batch" | jq '.Changes | length')" = 1; } > /dev/null 2>&1; echo $?)"
check "인증서: 발급 대기는 이 인증서 하나" "$(ok grep -q -- "--certificate-arn $CERT_ARN" "$S/waits")"
run_sut env STUB_CERT_COUNT=1 bash "$P/create-certificate.sh"
check "catchu.dev 인증서가 이미 있으면 확인 모드에서도 멈춤" "$(ok stopped '인증서 catchu.dev(1개)')"
run_sut env STUB_ZONE= bash "$P/create-certificate.sh" --apply
check "인증서: 공개 호스팅 영역이 없으면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_ZONE="/hostedzone/ZAAAAAAAAAAAAAAAAAAAA$(printf '\t')/hostedzone/ZBBBBBBBBBBBBBBBBBBBB" bash "$P/create-certificate.sh" --apply
check "인증서: 같은 이름의 공개 호스팅 영역이 둘이면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_FAIL='acm list-certificates' bash "$P/create-certificate.sh" --apply
check "인증서 조회 실패면 '없음'으로 넘기지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_NO_RECORD=1 bash "$P/create-certificate.sh" --apply
check "인증서: ACM이 검증 기록을 주지 않으면 10번 본 뒤 DNS를 바꾸지 않고 멈춤" \
  "$(ok test "$rc" = 1 -a "$(ops | tr '\n' ',')" = "acm request-certificate," -a "$(wc -l < "$S/sleeps" | tr -d ' ')" = 10)"
run_sut env STUB_WAIT_FAILS=1 bash "$P/create-certificate.sh" --apply
check "인증서: 40분 안에 발급되지 않으면 다시 실행하지 말라고 하고 멈춤" "$(ok test "$rc" = 1 -a "$(grep -c '다시 실행하지 말고' "$OUT")" = 1)"

# ---------- Load Balancer Controller(install-lb-controller.sh) ----------
run_sut bash "$P/install-lb-controller.sh"
check "컨트롤러 확인 모드: 종료 0, 차트를 받아 해시를 보고 설치하지 않음, 임시 파일 0" \
  "$( { test "$rc" = 0 -a -z "$(ops)" && grep -q '해시 일치' "$OUT" && grep -q -- '--apply로 다시 실행' "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
run_sut bash "$P/install-lb-controller.sh" --apply
inst=$(call_of 'helm install')
check "컨트롤러 설치: helm 설치 1건, 받은 3.6.2 차트로 kube-system에 준비될 때까지 기다림, 확인 값 통과, 임시 파일 0" \
  "$( { test "$rc" = 0 -a "$(ops | tr '\n' ',')" = "helm install," && printf '%s' "$inst" | grep -qE ' install aws-load-balancer-controller [^ ]*/aws-load-balancer-controller-3\.6\.2\.tgz ' && has_all "$inst" --namespace kube-system --wait --timeout 5m && grep -q '"canListSecrets": "no"' "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
check "컨트롤러 설정: 클러스터·리전·VPC·Pod Identity 서비스 계정, Service 가로채기 웹훅 끔" \
  "$(ok has_all "$inst" clusterName=catchu region=ap-northeast-2 vpcId=vpc-0123456789abcdef0 serviceAccount.name=aws-load-balancer-controller enableServiceMutatorWebhook=false)"
run_sut env STUB_SHA=0000000000000000000000000000000000000000000000000000000000000000 bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: 차트 해시가 다르면 설치하지 않고 멈춤, 임시 파일 0" "$( { test "$rc" = 1 -a -z "$(ops)" && grep -q '해시가 기록과 다르다' "$OUT" && clean; } > /dev/null 2>&1; echo $?)"
run_sut env STUB_PULL_FAIL=1 bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: 차트를 받지 못하면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_HELM_RELEASES=aws-load-balancer-controller bash "$P/install-lb-controller.sh"
check "컨트롤러가 이미 설치돼 있으면 확인 모드에서도 멈춤" "$(ok stopped 'helm 설치 aws-load-balancer-controller(kube-system)')"
run_sut env STUB_PIA_COUNT=0 bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: Pod Identity 연결이 없으면 설치하지 않고 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_SERVER=https://OTHER.example bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: kubectl이 다른 클러스터를 가리키면 멈춤" "$(ok test "$rc" = 1 -a -z "$(ops)")"
run_sut env STUB_LBC_READY=1/2 bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: 설치 뒤 Pod 2개가 준비되지 않으면 실패로 끝남" "$(ok test "$rc" = 1)"
run_sut env STUB_LBC_WEBHOOKS='mpod.elbv2.k8s.aws mservice.elbv2.k8s.aws' bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: Service 가로채기 웹훅이 남아 있으면 실패로 끝남" "$(ok test "$rc" = 1)"
run_sut env STUB_LBC_SECRETS=yes bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: Secret 목록을 읽을 수 있으면 실패로 끝남" "$(ok test "$rc" = 1)"
run_sut env CATCHU_EXPECTED_ACCOUNT=999999999999 bash "$P/install-lb-controller.sh" --apply
check "컨트롤러: 계정이 다르면 계정 조회 말고는 AWS·helm을 부르지 않고 멈춤" \
  "$(ok test "$rc" = 1 -a "$(grep -v '^helm version' "$S/seen" | sort -u)" = 'sts get-caller-identity')"

echo
echo "통과 $pass, 실패 $fail"
[ "$fail" = 0 ]
