#!/usr/bin/env bash
# 앱 Secret·ConfigMap 만들기(#276). namespace catchu에 ConfigMap catchu-db와 Secret catchu-api·catchu-migration·catchu-worker를
# SSM /catchu/prod/* 값과 RDS·큐 주소로 만든다. 이름·키·SSM 원본은 deploy/aws/k8s/README.md 「Secret과 ConfigMap」.
# 값은 화면·명령 인자·임시 파일·last-applied 주석에 남기지 않는다. SSM에서 읽은 값은 파이프로만 jq를 거쳐 kubectl apply --server-side의
# 표준 입력으로 넘긴다(server-side apply는 last-applied 주석을 만들지 않는다). 화면에는 이름·키 이름·SSM 판 번호만 찍는다.
# 다시 실행하면 같은 이름을 SSM의 지금 값으로 바꾼다. 이미 떠 있는 api·worker는 다시 띄워야 새 값을 읽는다(환경변수는 시작할 때 읽는다).
#
# 사용: bash deploy/aws/scripts/make-secrets.sh   (저장소 루트에서. 2단계 순서는 deploy/aws/k8s/README.md 「적용(2단계)」)
# 종료 코드: 0 완료
#            1 시작 전 확인이나 값 검사에서 멈춤. 아무것도 바꾸지 않았다
#            2 적용이 실패했거나 적용 뒤 확인이 어긋났다. 일부만 바뀌었을 수 있다
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"
. "$here/lib/rds.sh"

namespace=catchu
manager=catchu-secrets
queue_group=catchu-queue
# "Secret 키 SSM이름" 한 줄에 하나. CATCHU_QUEUE_REDIS_URL은 큐 비밀번호와 큐 주소로 rediss:// 주소를 만든다.
sources='catchu-api AUTH_JWT_SECRET /catchu/prod/api/AUTH_JWT_SECRET
catchu-api LINK_GRANT_SECRET /catchu/prod/api/LINK_GRANT_SECRET
catchu-api DB_PASSWORD /catchu/prod/db/catchu_app-password
catchu-migration DB_PASSWORD /catchu/prod/db/catchu_migrator-password
catchu-worker CATCHU_QUEUE_REDIS_URL /catchu/prod/queue/auth-token
catchu-worker WORKER_CONTEXT_API_KEY /catchu/prod/worker/WORKER_CONTEXT_API_KEY
catchu-worker CATCHU_GENERATION_API_KEY /catchu/prod/worker/CATCHU_GENERATION_API_KEY'

# SSM 응답 → 적용할 List. 값 형식(앱이 기동 때 거부하는 형식)과 서로 달라야 하는 값을 여기서 본다. 형식은 값 전체에 맞춘다
# (jq의 $는 마지막 줄바꿈 앞에서도 맞으므로 \A·\z로 감싼다). 멈출 때는 "확인 실패:"로 시작하는 문구만 낸다(값은 넣지 않는다).
# shellcheck disable=SC2016 # jq 변수다.
program='
def fail($msg): error("확인 실패: " + $msg);
def rule($key):
  {AUTH_JWT_SECRET: "[0-9a-fA-F]{64}", LINK_GRANT_SECRET: "[0-9a-fA-F]{64}", WORKER_CONTEXT_API_KEY: "[0-9a-fA-F]{64}",
   DB_PASSWORD: "[!-~]{16,}", CATCHU_QUEUE_REDIS_URL: "[A-Za-z0-9]{16,128}", CATCHU_GENERATION_API_KEY: "[!-~]+"}[$key]
  // fail("검사 규칙이 없는 키 " + $key);
def labels: {"app.kubernetes.io/part-of": "catchu", "app.kubernetes.io/managed-by": "make-secrets"};
(if (.InvalidParameters // []) == [] then . else fail("SSM에 없는 이름이 있다(" + (.InvalidParameters | join(", ")) + ")") end)
| (reduce .Parameters[] as $p ({}; .[$p.Name] = $p)) as $ssm
| [$sources | split("\n")[] | split(" ") | {secret: .[0], key: .[1], ssm: .[2]}]
| map(. as $row
    | ($ssm[$row.ssm] // fail("SSM " + $row.ssm + "을 읽지 못했다")) as $p
    | if $p.Type != "SecureString" then fail("SSM " + $row.ssm + "이 SecureString이 아니다") else . end
    | if ($p.Value | test("\\A(?:" + rule($row.key) + ")\\z")) | not then fail("SSM " + $row.ssm + " 값이 " + $row.key + " 형식에 맞지 않는다") else . end
    | . + {version: $p.Version, value: (if $row.key == "CATCHU_QUEUE_REDIS_URL"
        then "rediss://:" + $p.Value + "@" + $queue_host + ":" + $queue_port else $p.Value end)})
| if ([.[] | select(.key | IN("AUTH_JWT_SECRET", "LINK_GRANT_SECRET", "WORKER_CONTEXT_API_KEY")) | .value | ascii_downcase] | unique | length) != 3
  then fail("AUTH_JWT_SECRET·LINK_GRANT_SECRET·WORKER_CONTEXT_API_KEY 가운데 같은 값이 있다") else . end
| if ([.[] | select(.key == "DB_PASSWORD") | .value] | unique | length) != 2
  then fail("앱 계정과 migration 계정의 DB 비밀번호가 같다") else . end
| {apiVersion: "v1", kind: "List", items: (
    [{apiVersion: "v1", kind: "ConfigMap", metadata: {name: "catchu-db", namespace: $namespace, labels: labels},
      data: {DB_HOST: $db_host, "ca.pem": $ca}}]
    + (group_by(.secret) | map({apiVersion: "v1", kind: "Secret", type: "Opaque",
        metadata: {name: .[0].secret, namespace: $namespace, labels: labels,
          annotations: {"catchu.io/ssm-versions": (sort_by(.key) | map("\(.key)=\(.version)") | join(","))}},
        data: (map({(.key): (.value | @base64)}) | add)})))}
'

[ "$#" = 0 ] || catchu_die "사용법: $0   (인자 없음)"
catchu_require_tools aws jq kubectl shasum
catchu_guard_aws
catchu_guard_cluster
catchu_db_ca_check

k() {
  command kubectl --kubeconfig "$CATCHU_KUBECONFIG" --namespace "$namespace" "$@"
}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
after() { # 적용을 시작한 뒤의 멈춤(종료 코드 2)
  printf '멈춤: %s\n' "$*" >&2
  catchu_info "일부만 바뀌었을 수 있다. 원인을 고친 뒤 다시 실행하면 같은 이름을 SSM의 지금 값으로 다시 맞춘다."
  exit 2
}

# ---------- 1. 시작 전 확인(아무것도 바꾸지 않음) ----------
k get namespace "$namespace" -o name > /dev/null ||
  catchu_die "namespace ${namespace}를 찾지 못했다. deploy/aws/k8s/namespace.yaml을 먼저 적용한다"
catchu_db_instance

row=$(aws_catchu elasticache describe-replication-groups --replication-group-id "$queue_group" --query 'ReplicationGroups[0].[Status,
  NodeGroups[0].PrimaryEndpoint.Address, NodeGroups[0].PrimaryEndpoint.Port, TransitEncryptionEnabled, AuthTokenEnabled]' --output text) ||
  catchu_die "큐 ${queue_group}를 조회하지 못했다"
read -r queue_status queue_host queue_port queue_tls queue_auth <<< "$row"
[ "$queue_status" = available ] || catchu_die "큐 ${queue_group}의 상태가 available이 아니다(${queue_status:-모름})"
[[ $queue_host =~ ^[a-z0-9][a-z0-9.-]*\.cache\.amazonaws\.com$ ]] ||
  catchu_die "큐 ${queue_group}의 주소가 예상한 형식이 아니다(${queue_host:-없음})"
[ "$queue_port" = 6379 ] || catchu_die "큐 ${queue_group}의 포트가 6379가 아니다(${queue_port:-모름})"
[ "$queue_tls" = True ] && [ "$queue_auth" = True ] || catchu_die "큐 ${queue_group}에 TLS와 비밀번호가 함께 켜져 있지 않다"

# SSM 이름이 모두 있고 SecureString인지 먼저 본다(값은 읽지 않는다).
names=()
while read -r _ _ name; do
  case " ${names[*]-} " in *" ${name} "*) ;; *) names+=("$name") ;; esac
done <<< "$sources"
joined=$(printf '%s,' "${names[@]}")
listed=$(aws_catchu ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=${joined%,}" \
  --query 'Parameters[].[Name, Type]' --output text) || catchu_die "SSM 이름 목록을 조회하지 못했다"
missing=''
for name in "${names[@]}"; do
  printf '%s\n' "$listed" | grep -qx "${name}"$'\t'SecureString || missing="${missing} ${name}"
done
[ -z "$missing" ] || catchu_die "SSM에 없거나 SecureString이 아닌 이름이 있다:${missing}. 새 값은 deploy/aws/scripts/put-parameter.sh로 넣는다"

# ---------- 2. 읽어서 적용(값은 파이프로만 지난다) ----------
set +e
aws_catchu ssm get-parameters --names "${names[@]}" --with-decryption --output json 2> "${tmp}/ssm.err" |
  jq -c --arg sources "$sources" --arg namespace "$namespace" --arg db_host "$db_host" --rawfile ca "$CATCHU_DB_CA_FILE" \
    --arg queue_host "$queue_host" --arg queue_port "$queue_port" "$program" 2> "${tmp}/jq.err" |
  k apply --server-side --field-manager="$manager" -f - -o name > "${tmp}/apply.out" 2> "${tmp}/apply.err"
codes=("${PIPESTATUS[@]}")
set -e
if [ "${codes[0]}" != 0 ]; then
  catchu_info "$(head -c 500 "${tmp}/ssm.err")"
  catchu_die "SSM 값을 읽지 못했다. 아무것도 바꾸지 않았다"
fi
if [ "${codes[1]}" != 0 ]; then
  # jq의 다른 오류 문구에는 입력 값이 섞일 수 있어 직접 낸 문구만 보여 준다.
  grep -o '확인 실패: .*' "${tmp}/jq.err" >&2 || catchu_info "값을 Secret으로 바꾸지 못했다(오류 원문은 값이 섞일 수 있어 찍지 않는다)"
  catchu_die "값 검사에서 멈췄다. 아무것도 바꾸지 않았다"
fi
[ "${codes[2]}" = 0 ] || after "kubectl apply가 실패했다: $(head -c 500 "${tmp}/apply.err" | tr '\n' ' ')"

# ---------- 3. 적용 뒤 확인(키 이름·주석만 본다) ----------
# shellcheck disable=SC2016 # jq 변수다.
expected=$(jq -cn --arg sources "$sources" '[$sources | split("\n")[] | split(" ") | {name: .[0], key: .[1]}]
  | group_by(.name) | map({name: .[0].name, keys: (map(.key) | sort)})')
got=$(k get secret catchu-api catchu-migration catchu-worker -o json | jq -c '[.items[] | {name: .metadata.name, type,
  keys: (.data // {} | keys), versions: (.metadata.annotations["catchu.io/ssm-versions"] // ""),
  last: (.metadata.annotations // {} | has("kubectl.kubernetes.io/last-applied-configuration"))}] | sort_by(.name)') ||
  after "만든 Secret을 다시 읽지 못했다"
jq -e --argjson want "$expected" 'map({name, keys}) == $want and all(.[]; .type == "Opaque" and .last == false
  and (.versions | split(",") | map(split("=")[0])) == .keys)' <<< "$got" > /dev/null ||
  after "Secret의 키·주석이 예상과 다르다(다른 키가 섞였거나 last-applied 주석이 있다): $(jq -c 'map({name, keys, last})' <<< "$got")"
config=$(k get configmap catchu-db -o json) || after "ConfigMap catchu-db를 다시 읽지 못했다"
[ "$(jq -r '.data.DB_HOST // ""' <<< "$config")" = "$db_host" ] || after "ConfigMap catchu-db의 DB_HOST가 RDS 주소와 다르다"
ca_sum=$(jq -j '.data["ca.pem"] // ""' <<< "$config" | shasum -a 256)
[ "${ca_sum%% *}" = "$CATCHU_DB_CA_SHA256" ] || after "ConfigMap catchu-db의 ca.pem이 저장소의 루트 인증서와 다르다"

catchu_info "적용 기록($(date -u +%Y-%m-%dT%H:%M:%SZ), 클러스터 ${CATCHU_CLUSTER}, namespace ${namespace})"
catchu_info "  ConfigMap catchu-db: DB_HOST ${db_host}, ca.pem ${CATCHU_DB_CA_ID} 서울 루트 인증서"
jq -r '.[] | "  Secret \(.name): \(.versions)  (키=SSM 판 번호)"' <<< "$got" >&2
catchu_info "이미 떠 있는 api·worker는 다시 띄워야 바뀐 값을 읽는다. 2단계 처음 만들기라면 그대로 다음 순서로 간다."
