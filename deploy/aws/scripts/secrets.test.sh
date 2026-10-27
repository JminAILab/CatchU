#!/usr/bin/env bash
# make-secrets.sh·put-parameter.sh·db-admin.sh 회귀 시험과 catchu-ops 실행 파일·루트 인증서 조건 검사(#276). 실제 클러스터·AWS에는 닿지 않는다.
# - aws·kubectl을 합성 명령으로 바꾸고, 지금 작업 폴더의 deploy/aws를 복사한 곳에서 세 스크립트를 실제로 실행한다.
#   합성 aws는 SSM·Secrets Manager 값을 파일로 흉내 내고, 합성 kubectl은 적용·만든 객체를 파일로 남긴다.
# - 비밀값은 시험마다 새로 만드는 합성 값이다. 출력·aws·kubectl·jq의 명령 인자·임시 폴더에 그 값이 없는지 본다.
# 확인하지 못하는 것: 실제 API 서버의 server-side apply·Pod 보안 검사, 실제 RDS·Secrets Manager 응답 모양, psql Pod의 실제 실행
# (psql 실행과 SQL은 db-roles.test.sh가 Docker로 본다). 이것은 2단계 실제 클러스터에서 본다.
# 필요한 것: bash·jq·ruby·openssl·shasum·aws CLI v2(입력 파일 형식 확인용). 사용: bash deploy/aws/scripts/secrets.test.sh
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
for tool in jq ruby openssl shasum; do
  command -v "$tool" > /dev/null || { echo "${tool}이(가) 없어 시험할 수 없다" >&2; exit 1; }
done
REAL_AWS=$(command -v aws) || { echo "aws CLI가 없어 시험할 수 없다" >&2; exit 1; }
REAL_JQ=$(command -v jq)
REAL_SLEEP=$(command -v sleep)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN=$WORK/bin
S=$WORK/state
OUT=$WORK/out.log
REPO=$WORK/repo
P=$REPO/deploy/aws/scripts
ACCOUNT=123456789012
pass=0
fail=0

# ---------- 지금 작업 폴더의 deploy/aws를 복사한다(바꿔 보는 시험이 원본을 건드리지 않게) ----------
mkdir -p "$REPO/deploy/aws"
cp -R "$HERE/../scripts" "$HERE/../db" "$HERE/../k8s" "$REPO/deploy/aws/"

# ---------- 합성 비밀값(시험마다 새로 만든다) ----------
JWT=$(openssl rand -hex 32)
LINK=$(openssl rand -hex 32)
APP_PW=$(openssl rand -hex 32)
MIGRATOR_PW=$(openssl rand -hex 32)
QUEUE_TOKEN=$(openssl rand -hex 32)
CONTEXT_KEY=$(openssl rand -hex 32)
GENERATION_KEY="sk-ant-synthetic-$(openssl rand -hex 24)"
ADMIN_PW="Adm1n-$(openssl rand -hex 20)"
INPUT_KEY="sk-ant-input-$(openssl rand -hex 24)"
SECRETS="$JWT $LINK $APP_PW $MIGRATOR_PW $QUEUE_TOKEN $CONTEXT_KEY $GENERATION_KEY $ADMIN_PW $INPUT_KEY"
DB_HOST=catchu-db.abcdefghijkl.ap-northeast-2.rds.amazonaws.com
QUEUE_HOST=master.catchu-queue.abc123.apn2.cache.amazonaws.com
store_default() { # 이름 Type Value 줄 → SSM 합성 저장소(JSON)
  printf '%s\n' \
    "/catchu/prod/api/AUTH_JWT_SECRET SecureString $JWT" \
    "/catchu/prod/api/LINK_GRANT_SECRET SecureString $LINK" \
    "/catchu/prod/db/catchu_app-password SecureString $APP_PW" \
    "/catchu/prod/db/catchu_migrator-password SecureString $MIGRATOR_PW" \
    "/catchu/prod/queue/auth-token SecureString $QUEUE_TOKEN" \
    "/catchu/prod/worker/WORKER_CONTEXT_API_KEY SecureString $CONTEXT_KEY" \
    "/catchu/prod/worker/CATCHU_GENERATION_API_KEY SecureString $GENERATION_KEY"
}

# ---------- 합성 aws·kubectl·jq·sleep ----------
mkdir -p "$BIN"
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
# 합성 aws. --profile·--region을 빼고 서비스·동작으로 답한다. 모든 명령 인자를 argv에 남긴다(비밀값이 섞이지 않았는지 보려고).
S=${STUB_STATE:?}
printf 'aws %s\n' "$*" >> "$S/argv"
args=() skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case $a in --profile | --region) skip=1; continue ;; esac
  args+=("$a")
done
set -- "${args[@]}"
[ "$1" = --version ] && { echo "aws-cli/2.28.11 Python/3.13.4 Darwin/27.0.0 source/arm64"; exit 0; }
printf '%s %s\n' "$1" "$2" >> "$S/aws-seen"
value_of() {
  local want=$1 prev=''
  shift
  for a in "$@"; do [ "$prev" = "$want" ] && { printf '%s' "$a"; return; }; prev=$a; done
}
if [ "$1 $2" = "${STUB_FAIL:-}" ]; then
  echo "An error occurred (AccessDenied) when calling the operation: synthetic" >&2
  exit 254
fi
case "$1 $2" in
  "sts get-caller-identity") echo 123456789012 ;;
  "eks describe-cluster") echo https://SYNTHETIC.eks.example ;;
  "rds describe-db-instances")
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${STUB_RDS_STATUS:-available}" "${STUB_DB_HOST:?}" "${STUB_RDS_CA:-rds-ca-rsa2048-g1}" \
      "${STUB_RDS_ADMIN:-catchu_admin}" 'arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:rds!db-0a1b2c3d-4e5f-6789-abcd-ef0123456789-AbCdEf' \
      "${STUB_SECRET_STATUS:-active}" "${STUB_PARAMETER_GROUP:-catchu-pg16}" "${STUB_PARAMETER_STATUS:-in-sync}" ;;
  "rds describe-db-parameters") printf 'log_min_error_statement\t%s\nlog_statement\tnone\n' "${STUB_LOG_MIN:-panic}" ;;
  "elasticache describe-replication-groups")
    printf '%s\t%s\t6379\t%s\tTrue\n' "${STUB_QUEUE_STATUS:-available}" "${STUB_QUEUE_HOST:?}" "${STUB_QUEUE_TLS:-True}" ;;
  "ssm describe-parameters")
    filter=$(value_of --parameter-filters "$@")
    query=$(value_of --query "$@")
    found=$(jq -r --arg names "${filter#*Values=}" '. as $s | $names | split(",")[] | select($s[.] != null) | "\(.)\t\($s[.].Type)"' "$S/ssm.json")
    case $query in
      *length*) printf '%s\n' "$found" | awk 'NF { n++ } END { print n + 0 }' ;;
      *) [ -n "$found" ] && printf '%s\n' "$found" ;;
    esac ;;
  "ssm get-parameters")
    names=() collect=0
    for a in "$@"; do
      case $a in --names) collect=1; continue ;; --*) collect=0 ;; esac
      [ "$collect" = 1 ] && names+=("$a")
    done
    case " $* " in *" --with-decryption "*) ;; *) echo "합성 aws: 복호화 없이 읽음" >&2; exit 253 ;; esac
    jq --args '. as $s | {Parameters: [$ARGS.positional[] | select($s[.] != null) | {Name: ., Type: $s[.].Type, Value: $s[.].Value,
      Version: $s[.].Version}], InvalidParameters: [$ARGS.positional[] | select($s[.] == null)]}' "${names[@]}" < "$S/ssm.json" ;;
  "ssm put-parameter")
    file=$(value_of --cli-input-json "$@")
    file=${file#file://}
    printf 'put-parameter %s\n' "$*" >> "$S/calls"
    cp "$file" "$S/put-request.json"
    name=$(jq -r .Name "$file")
    if jq -e --arg n "$name" 'has($n)' "$S/ssm.json" > /dev/null; then
      echo "An error occurred (ParameterAlreadyExists) when calling the PutParameter operation: synthetic" >&2
      exit 254
    fi
    # 진짜 AWS CLI를 닫힌 로컬 주소로 실행해 입력 파일을 받아들이는지 본다(요청을 보내기 직전까지 가면 받아들인 것이다).
    err=$(env -i PATH=/usr/bin:/bin HOME=/nonexistent AWS_ACCESS_KEY_ID=AKIASYNTHETICSYNTHET AWS_SECRET_ACCESS_KEY=synthetic \
      AWS_MAX_ATTEMPTS=1 AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
      "$STUB_REAL_AWS" ssm put-parameter --region ap-northeast-2 --cli-input-json "file://${file}" \
      --endpoint-url http://127.0.0.1:9 --cli-connect-timeout 1 2>&1 > /dev/null)
    printf '%s' "$err" | grep -q 'Could not connect to the endpoint URL' || { echo "입력 파일 거부: $err" >&2; touch "$S/invalid"; exit 252; }
    jq --arg n "$name" --slurpfile r "$file" '.[$n] = {Type: $r[0].Type, Value: $r[0].Value, Version: 1}' "$S/ssm.json" > "$S/ssm.new"
    mv "$S/ssm.new" "$S/ssm.json"
    echo 1 ;;
  "secretsmanager get-secret-value")
    # SecretString은 JSON 글이다. 값에 줄바꿈 등이 있어도 맞는 JSON이 되게 jq로 만든다(값은 표준 입력으로만 넘긴다).
    printf '%s' "${STUB_ADMIN_PW:?}" | "$STUB_REAL_JQ" -Rsc --arg u "${STUB_SM_USER:-catchu_admin}" '{username: $u, password: .}' ;;
  *) echo "합성 aws: 정해 두지 않은 호출 $1 $2" >&2; printf 'aws %s %s\n' "$1" "$2" >> "$S/unknown"; exit 253 ;;
esac
EOF
cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
# 합성 kubectl. --kubeconfig·--namespace를 빼고 동작을 찾아 $STUB_STATE/objects의 파일로 답한다. 바꾸는 호출은 calls에 남긴다.
S=${STUB_STATE:?}
printf 'kubectl %s\n' "$*" >> "$S/argv"
args=() ns=default
while [ "$#" -gt 0 ]; do
  case $1 in
    --kubeconfig) shift 2 ;;
    --namespace) ns=$2; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- "${args[@]}"
call() { printf '%s\n' "$*" >> "$S/calls"; }
has() { case " ${2:-} " in *" $1 "*) return 0 ;; esac; return 1; }
store() { # JSON 객체 하나를 objects/<namespace>/<kind>-<name>.json에 둔다
  local o=$1 kind name
  kind=$(printf '%s' "$o" | jq -r .kind)
  name=$(printf '%s' "$o" | jq -r .metadata.name)
  mkdir -p "$S/objects/$ns"
  printf '%s\n' "$o" > "$S/objects/$ns/$kind-$name.json"
}
case "$*" in
  "config view"*) echo "${STUB_SERVER:-https://SYNTHETIC.eks.example}" ;;
  "version --client -o json") echo '{"clientVersion":{"gitVersion":"v1.37.1"}}' ;;
  "get namespace "*" -o name")
    has "$3" "${STUB_NO_NS:-}" && { echo "Error from server (NotFound): namespaces \"$3\" not found" >&2; exit 1; }
    echo "namespace/$3" ;;
  "get networkpolicy "*" -o name")
    has "$3" "${STUB_NO_NETPOL:-}" && { echo "Error from server (NotFound): synthetic" >&2; exit 1; }
    echo "networkpolicy.networking.k8s.io/$3" ;;
  "apply --server-side --field-manager=catchu-secrets -f - -o name")
    input=$(cat)
    [ -n "$input" ] || { echo "error: no objects passed to apply" >&2; exit 1; }
    if [ "${STUB_APPLY_FAIL:-0}" = 1 ]; then
      call "apply 실패"
      echo 'error: Apply failed with 1 conflict: conflict with "kubectl-edit" using v1: .data.DB_PASSWORD' >&2
      exit 1
    fi
    printf '%s\n' "$input" > "$S/applied.json"
    call "apply $(printf '%s' "$input" | jq -r '[.items[] | "\(.kind)/\(.metadata.name)"] | join(" ")')"
    for i in $(seq 0 $(( $(printf '%s' "$input" | jq '.items | length') - 1 ))); do
      store "$(printf '%s' "$input" | jq -c ".items[$i]")"
    done
    printf '%s' "$input" | jq -r '.items[] | "\(.kind | ascii_downcase)/\(.metadata.name)"' ;;
  "get secret catchu-api catchu-migration catchu-worker -o json")
    for n in catchu-api catchu-migration catchu-worker; do
      [ -f "$S/objects/$ns/Secret-$n.json" ] || { echo "Error from server (NotFound): secrets \"$n\" not found" >&2; exit 1; }
    done
    cat "$S/objects/$ns"/Secret-catchu-*.json | jq -s --arg extra "${STUB_EXTRA_KEY:-0}" --arg last "${STUB_LAST_APPLIED:-0}" '{kind: "List", items: map(
      if $extra == "1" and .metadata.name == "catchu-worker" then .data.DB_PASSWORD = "eA==" else . end
      | if $last == "1" then .metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"] = "{}" else . end)}' ;;
  "get configmap catchu-db -o json")
    [ -f "$S/objects/$ns/ConfigMap-catchu-db.json" ] || { echo "Error from server (NotFound): synthetic" >&2; exit 1; }
    jq --arg t "${STUB_CM_TAMPER:-0}" 'if $t == "1" then .data["ca.pem"] += "x" else . end' "$S/objects/$ns/ConfigMap-catchu-db.json" ;;
  "get pod,secret,configmap -l "*" -o name")
    # 표식 이름만 주면 그 표식이 있는 것 모두, 이름=값이면 그 값인 것만 찾는다.
    # STUB_LEFTOVER: 지난 실행이 남긴 것이 있다. STUB_GET_FAIL: 이름=값 조회(정리 뒤 확인)가 실패한다.
    key=$4 want=''
    case $key in *=*) want=${key#*=} key=${key%%=*} ;; esac
    if [ -n "$want" ] && [ "${STUB_GET_FAIL:-0}" = 1 ]; then echo "error: synthetic list failure" >&2; exit 1; fi
    if [ -z "$want" ] && [ "${STUB_LEFTOVER:-0}" = 1 ]; then echo "secret/db-admin-20261110-000000"; fi
    for k in Pod Secret ConfigMap; do
      for f in "$S/objects/$ns/$k"-*.json; do
        [ -f "$f" ] || continue
        jq -r --arg k "$key" --arg v "$want" 'select(.metadata.labels[$k] != null and ($v == "" or .metadata.labels[$k] == $v))
          | "\(.kind | ascii_downcase)/\(.metadata.name)"' "$f"
      done
    done ;;
  "create -f - -o name")
    input=$(cat)
    [ -n "$input" ] || { echo "error: no objects passed to create" >&2; exit 1; }
    o=$(printf '%s' "$input" | ruby -ryaml -rjson -e 'puts JSON.generate(YAML.load(STDIN.read))') || { echo "error: synthetic parse" >&2; exit 1; }
    kind=$(printf '%s' "$o" | jq -r .kind)
    has "$kind" "${STUB_CREATE_FAIL:-}" && { call "create $kind 실패"; echo "error: synthetic create failure" >&2; exit 1; }
    # STUB_CREATE_LOST: 서버에는 저장됐지만 응답이 끊겼다(만들기 결과를 모른다).
    if has "$kind" "${STUB_CREATE_LOST:-}"; then
      store "$o"
      call "create $kind 응답 끊김"
      echo "error: unexpected EOF" >&2
      exit 1
    fi
    # STUB_CREATE_EXISTS: 같은 이름이 이미 있다(같은 초에 시작한 다른 실행이 만든 것으로 보고 실행 표식만 다르게 둔다). 만들기는 거부한다.
    if has "$kind" "${STUB_CREATE_EXISTS:-}"; then
      store "$(printf '%s' "$o" | jq -c '.metadata.labels["catchu.io/db-admin-run"] = "ffffffffffffffff"')"
      call "create $kind 이미 있음"
      echo "Error from server (AlreadyExists): synthetic" >&2
      exit 1
    fi
    store "$o"
    call "create $kind"
    echo "$(printf '%s' "$kind" | tr 'A-Z' 'a-z')/$(printf '%s' "$o" | jq -r .metadata.name)" ;;
  "get pod "*" -o json")
    f=$S/objects/$ns/Pod-$3.json
    [ -f "$f" ] || { echo "Error from server (NotFound): synthetic" >&2; exit 1; }
    image=$(jq -r '.spec.containers[0].image' "$f")
    case ${STUB_POD:-ok} in
      ok) status='{"phase":"Succeeded","containerStatuses":[{"imageID":"IMAGE","state":{"terminated":{"exitCode":0,"reason":"Completed","startedAt":"2026-11-10T01:00:00Z","finishedAt":"2026-11-10T01:00:02Z"}}}]}' ;;
      failed) status='{"phase":"Failed","containerStatuses":[{"imageID":"IMAGE","state":{"terminated":{"exitCode":3,"reason":"Error","startedAt":"2026-11-10T01:00:00Z","finishedAt":"2026-11-10T01:00:02Z"}}}]}' ;;
      deadline) status='{"phase":"Failed","reason":"DeadlineExceeded","containerStatuses":[{"imageID":"IMAGE","state":{"terminated":{"exitCode":137,"reason":"Error","startedAt":"2026-11-10T01:00:00Z","finishedAt":"2026-11-10T01:05:00Z"}}}]}' ;;
      pending) status='{"phase":"Pending","containerStatuses":[{"imageID":"","state":{"waiting":{"reason":"ContainerCreating"}}}]}' ;;
    esac
    jq --argjson st "$status" --arg id "docker.io/library/postgres@${image##*@}" '.status = ($st | .containerStatuses[0].imageID |= (if . == "IMAGE" then $id else . end))' "$f" ;;
  "logs "*" --tail=200")
    [ "${STUB_POD:-ok}" = pending ] && { echo "Error from server (BadRequest): container is waiting to start" >&2; exit 1; }
    printf ' rolname | rolconfig\n catchu_app | {lock_timeout=3s}\n' ;;
  "delete pod,secret,configmap -l "*=*" --wait=true --timeout=90s")
    # 표식 이름=값이 맞는 것만 지우고, 지운 종류를 남긴다(다른 실행의 것을 지우지 않는지 보려고).
    key=${4%%=*} want=${4#*=}
    [ "${STUB_DELETE_FAIL:-0}" = 1 ] && { call "delete 실패"; echo "error: synthetic delete failure" >&2; exit 1; }
    gone=''
    for k in Pod Secret ConfigMap; do
      for f in "$S/objects/$ns/$k"-*.json; do
        [ -f "$f" ] || continue
        jq -e --arg k "$key" --arg v "$want" '.metadata.labels[$k] == $v' "$f" > /dev/null || continue
        rm -f "$f"
        gone="${gone} $(printf '%s' "$k" | tr 'A-Z' 'a-z')"
      done
    done
    call "delete${gone:- 없음}" ;;
  *) echo "합성 kubectl: 정해 두지 않은 호출 $*" >&2; printf 'kubectl %s\n' "$*" >> "$S/unknown"; exit 99 ;;
esac
exit 0
EOF
cat > "$BIN/jq" <<'EOF'
#!/usr/bin/env bash
# 진짜 jq를 부르되 명령 인자를 남긴다(비밀값이 인자로 넘어가지 않았는지 보려고).
printf 'jq %s\n' "$*" >> "${STUB_STATE:?}/argv"
exec "$STUB_REAL_JQ" "$@"
EOF
cat > "$BIN/sleep" <<'EOF'
#!/usr/bin/env bash
printf 'sleep %s\n' "$*" >> "${STUB_STATE:?}/sleeps"
"$STUB_REAL_SLEEP" 0.002
EOF
chmod +x "$BIN/aws" "$BIN/kubectl" "$BIN/jq" "$BIN/sleep"

# ---------- 실행 도우미 ----------
reset_state() { # SSM 저장소를 기본값으로 만든다. STUB_SSM_DROP=이름…·STUB_SSM_SET="이름 Type 값"으로 바꾼다.
  rm -rf "$S" "$WORK/home" "$WORK/tmp"
  mkdir -p "$S/objects" "$WORK/home/.kube" "$WORK/tmp"
  : > "$S/calls"
  : > "$S/argv"
  : > "$WORK/home/.kube/catchu"
  store_default | "$REAL_JQ" -Rn '[inputs | split(" ") | {key: .[0], value: {Type: .[1], Value: .[2], Version: 1}}] | from_entries' > "$S/ssm.json"
}
run() { # [환경 이름=값 …] 스크립트 인자… — 저장소 루트에서 실행한다. 표준 입력은 STDIN_TEXT(없으면 비어 있음).
  local envs=()
  while [ "$#" -gt 0 ]; do
    case $1 in STUB_* | CATCHU_* | AWS_* | KUBECONFIG=*) envs+=("$1"); shift ;; *) break ;; esac
  done
  local script=$1
  shift
  (
    cd "$REPO" || exit 99
    printf '%s' "${STDIN_TEXT:-}" | env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_SECURITY_TOKEN \
      -u AWS_PROFILE -u AWS_REGION -u AWS_DEFAULT_REGION -u KUBECONFIG PATH="$BIN:$PATH" HOME="$WORK/home" TMPDIR="$WORK/tmp" \
      STUB_STATE="$S" STUB_REAL_AWS="$REAL_AWS" STUB_REAL_JQ="$REAL_JQ" STUB_REAL_SLEEP="$REAL_SLEEP" STUB_DB_HOST="$DB_HOST" \
      STUB_QUEUE_HOST="$QUEUE_HOST" STUB_ADMIN_PW="$ADMIN_PW" CATCHU_EXPECTED_ACCOUNT=$ACCOUNT ${envs[@]+"${envs[@]}"} \
      bash "deploy/aws/scripts/$script" "$@"
  ) > "$OUT" 2>&1
  rc=$?
}
ssm_drop() { "$REAL_JQ" --arg n "$1" 'del(.[$n])' "$S/ssm.json" > "$S/ssm.new" && mv "$S/ssm.new" "$S/ssm.json"; }
ssm_set() { "$REAL_JQ" --arg n "$1" --arg t "$2" --arg v "$3" '.[$n] = {Type: $t, Value: $v, Version: 2}' "$S/ssm.json" > "$S/ssm.new" && mv "$S/ssm.new" "$S/ssm.json"; }
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "통과: $1"; else fail=$((fail + 1)); echo "실패: $1"; sed 's/^/    | /' "$OUT"; fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }
says() { grep -qF -- "$1" "$OUT"; }
calls() { tr '\n' ',' < "$S/calls"; }
secret_free() { # 출력·명령 인자에 합성 비밀값이 없고, 계정 번호가 출력에 없고, 임시 폴더가 비었다
  local v
  for v in $SECRETS; do
    grep -qF -- "$v" "$OUT" "$S/argv" && return 1
  done
  ! grep -q "$ACCOUNT" "$OUT" && [ -z "$(ls -A "$WORK/tmp")" ] && [ ! -s "$S/unknown" ]
}
decoded() { # 적용한 List에서 Secret 키 값을 꺼낸다(시험 비교용)
  "$REAL_JQ" -r --arg s "$1" --arg k "$2" '.items[] | select(.kind == "Secret" and .metadata.name == $s) | .data[$k] | @base64d' "$S/applied.json"
}
CA_SUM=$(shasum -a 256 < "$REPO/deploy/aws/db/rds-ca-rsa2048-g1.pem")
CA_SUM=${CA_SUM%% *}

# ---------- make-secrets.sh ----------
reset_state
run make-secrets.sh
check "make-secrets: 종료 0, server-side apply 한 번으로 ConfigMap 하나·Secret 셋" \
  "$(ok test "$rc" = 0 -a "$(calls)" = "apply ConfigMap/catchu-db Secret/catchu-api Secret/catchu-migration Secret/catchu-worker,")"
check "make-secrets: 비밀값이 출력·명령 인자·임시 파일에 없고 계정 번호도 찍지 않음" "$(ok secret_free)"
check "make-secrets: kubectl에는 표준 입력으로만 넘김(--server-side, 관리자 catchu-secrets, last-applied 주석 없음)" \
  "$( { grep -qx 'kubectl --kubeconfig .*/.kube/catchu --namespace catchu apply --server-side --field-manager=catchu-secrets -f - -o name' "$S/argv" \
    && "$REAL_JQ" -e 'all(.items[]; .metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"] == null)' "$S/applied.json"; } > /dev/null 2>&1; echo $?)"
check "make-secrets: Secret 키는 계약(k8s/README.md)과 같고 worker에는 DB 값이 없음, 모두 namespace catchu·Opaque" \
  "$(ok "$REAL_JQ" -e '[.items[] | select(.kind == "Secret") | {name: .metadata.name, keys: (.data | keys), ns: .metadata.namespace, type}]
    == [{name: "catchu-api", keys: ["AUTH_JWT_SECRET", "DB_PASSWORD", "LINK_GRANT_SECRET"], ns: "catchu", type: "Opaque"},
        {name: "catchu-migration", keys: ["DB_PASSWORD"], ns: "catchu", type: "Opaque"},
        {name: "catchu-worker", keys: ["CATCHU_GENERATION_API_KEY", "CATCHU_QUEUE_REDIS_URL", "WORKER_CONTEXT_API_KEY"], ns: "catchu", type: "Opaque"}]' "$S/applied.json")"
check "make-secrets: 값은 SSM 원본 그대로(앱·migration 계정 비밀번호가 바뀌지 않음)" \
  "$( { test "$(decoded catchu-api AUTH_JWT_SECRET)" = "$JWT" && test "$(decoded catchu-api LINK_GRANT_SECRET)" = "$LINK" \
    && test "$(decoded catchu-api DB_PASSWORD)" = "$APP_PW" && test "$(decoded catchu-migration DB_PASSWORD)" = "$MIGRATOR_PW" \
    && test "$(decoded catchu-worker WORKER_CONTEXT_API_KEY)" = "$CONTEXT_KEY" && test "$(decoded catchu-worker CATCHU_GENERATION_API_KEY)" = "$GENERATION_KEY"; } > /dev/null 2>&1; echo $?)"
check "make-secrets: 큐 주소는 rediss://, 큐 비밀번호와 큐 주 엔드포인트 6379" \
  "$(ok test "$(decoded catchu-worker CATCHU_QUEUE_REDIS_URL)" = "rediss://:${QUEUE_TOKEN}@${QUEUE_HOST}:6379")"
check "make-secrets: Secret마다 키=SSM 판 번호 주석(값 없음)" \
  "$(ok "$REAL_JQ" -e '[.items[] | select(.kind == "Secret") | .metadata.annotations["catchu.io/ssm-versions"]]
    == ["AUTH_JWT_SECRET=1,DB_PASSWORD=1,LINK_GRANT_SECRET=1", "DB_PASSWORD=1", "CATCHU_GENERATION_API_KEY=1,CATCHU_QUEUE_REDIS_URL=1,WORKER_CONTEXT_API_KEY=1"]' "$S/applied.json")"
check "make-secrets: ConfigMap catchu-db는 RDS 주소와 저장소의 루트 인증서 그대로" \
  "$( { "$REAL_JQ" -e --arg h "$DB_HOST" '.items[0] | .kind == "ConfigMap" and .metadata.name == "catchu-db" and .data.DB_HOST == $h
      and (.data | keys) == ["DB_HOST", "ca.pem"]' "$S/applied.json" \
    && test "$("$REAL_JQ" -j '.items[0].data["ca.pem"]' "$S/applied.json" | shasum -a 256 | cut -d' ' -f1)" = "$CA_SUM"; } > /dev/null 2>&1; echo $?)"
check "make-secrets: 출력은 이름·키=판 번호와 다시 띄울 안내" \
  "$( { says 'Secret catchu-worker: CATCHU_GENERATION_API_KEY=1,CATCHU_QUEUE_REDIS_URL=1,WORKER_CONTEXT_API_KEY=1' && says '다시 띄워야'; } > /dev/null 2>&1; echo $?)"
cp "$S/applied.json" "$WORK/first-applied.json"

untouched() { test "$rc" = 1 -a -z "$(calls)" -a ! -f "$S/applied.json"; }
no_decrypt() { ! grep -q '^ssm get-parameters$' "$S/aws-seen"; }
reset_state
ssm_drop /catchu/prod/worker/CATCHU_GENERATION_API_KEY
run make-secrets.sh
check "make-secrets: SSM 이름이 하나라도 없으면 값을 읽지 않고 멈춤(1), put-parameter.sh 안내" \
  "$( { untouched && no_decrypt && says '/catchu/prod/worker/CATCHU_GENERATION_API_KEY' && says 'put-parameter.sh'; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/api/LINK_GRANT_SECRET String "$LINK"
run make-secrets.sh
check "make-secrets: SecureString이 아닌 값이 있으면 멈춤" "$( { untouched && no_decrypt; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/api/AUTH_JWT_SECRET SecureString "${JWT:0:63}"
run make-secrets.sh
check "make-secrets: 서명 키가 64자리 hex가 아니면 멈춤(1, 값은 찍지 않음)" \
  "$( { untouched && says 'AUTH_JWT_SECRET 형식' && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/api/LINK_GRANT_SECRET SecureString "$(printf '%s' "$JWT" | tr 'a-f' 'A-F')"
run make-secrets.sh
check "make-secrets: 서명 키 둘이 같으면(대소문자만 달라도) 멈춤" "$( { untouched && says '같은 값'; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/db/catchu_migrator-password SecureString "$APP_PW"
run make-secrets.sh
check "make-secrets: 앱·migration 계정 비밀번호가 같으면 멈춤" "$( { untouched && says '비밀번호가 같다'; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/queue/auth-token SecureString "${QUEUE_TOKEN:0:20}#${QUEUE_TOKEN:20:20}"
run make-secrets.sh
check "make-secrets: 큐 비밀번호에 주소에 그대로 넣을 수 없는 글자가 있으면 멈춤" "$( { untouched && says 'CATCHU_QUEUE_REDIS_URL 형식' && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/worker/CATCHU_GENERATION_API_KEY SecureString "has space"
run make-secrets.sh
check "make-secrets: 생성 키에 공백이 있으면 멈춤" "$(ok untouched)"
# jq의 $는 마지막 줄바꿈 앞에서도 맞는다. 일곱 값 모두 끝에 줄바꿈 하나를 붙여 본다(복사·파일 입력으로 섞이는 경우).
while read -r n t v <&3; do
  reset_state
  ssm_set "$n" "$t" "${v}"$'\n'
  run make-secrets.sh
  check "make-secrets: 값 끝에 줄바꿈이 붙으면 적용하지 않고 멈춤(${n#/catchu/prod/})" \
    "$( { untouched && says "SSM ${n} 값이" && secret_free; } > /dev/null 2>&1; echo $?)"
done 3<<< "$(store_default)"
reset_state
run STUB_FAIL="ssm get-parameters" make-secrets.sh
check "make-secrets: SSM 값을 읽지 못하면 멈춤(1)" "$(ok untouched)"
for c in "STUB_RDS_STATUS=modifying" "STUB_RDS_CA=rds-ca-ecc384-g1" "STUB_QUEUE_STATUS=creating" "STUB_QUEUE_TLS=False" "STUB_NO_NS=catchu"; do
  reset_state
  run "$c" make-secrets.sh
  check "make-secrets: 전제가 다르면(${c}) 값을 읽지 않고 멈춤" "$( { untouched && no_decrypt; } > /dev/null 2>&1; echo $?)"
done
reset_state
run CATCHU_EXPECTED_ACCOUNT=999999999999 make-secrets.sh
check "make-secrets: 계정이 다르면 계정 조회 말고는 아무것도 하지 않음" \
  "$( { untouched && test "$(sort -u "$S/aws-seen")" = 'sts get-caller-identity' && ! grep -q -E '123456789012|999999999999' "$OUT"; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_APPLY_FAIL=1 make-secrets.sh
check "make-secrets: kubectl apply가 실패하면 2(일부만 바뀌었을 수 있음)" "$( { test "$rc" = 2 && says 'conflict' && secret_free; } > /dev/null 2>&1; echo $?)"
for c in STUB_EXTRA_KEY=1 STUB_LAST_APPLIED=1 STUB_CM_TAMPER=1; do
  reset_state
  run "$c" make-secrets.sh
  check "make-secrets: 적용 뒤 확인이 어긋나면(${c}) 2" "$( { test "$rc" = 2 && secret_free; } > /dev/null 2>&1; echo $?)"
done
reset_state
cp "$REPO/deploy/aws/db/rds-ca-rsa2048-g1.pem" "$WORK/ca.bak"
printf '\n' >> "$REPO/deploy/aws/db/rds-ca-rsa2048-g1.pem"
run make-secrets.sh
cp "$WORK/ca.bak" "$REPO/deploy/aws/db/rds-ca-rsa2048-g1.pem"
check "make-secrets: 저장소의 루트 인증서 파일이 바뀌었으면 멈춤" "$( { untouched && says '루트 인증서 파일이 저장소에 둔 것과 다르다'; } > /dev/null 2>&1; echo $?)"

# ---------- put-parameter.sh ----------
NEW=/catchu/prod/worker/NEW_KEY
reset_state
run put-parameter.sh --random "$NEW"
stored=$("$REAL_JQ" -r --arg n "$NEW" '.[$n].Value // ""' "$S/ssm.json")
SECRETS="$SECRETS $stored"
check "put-parameter --random: 64자리 hex를 SecureString으로 만듦, 덮어쓰기 옵션·값 인자 없음" \
  "$( { test "$rc" = 0 && [[ $stored =~ ^[0-9a-f]{64}$ ]] && grep -q -- '--cli-input-json file://' "$S/calls" \
    && ! grep -q -E -- '--overwrite|--value' "$S/calls" && "$REAL_JQ" -e --arg n "$NEW" '.Name == $n and .Type == "SecureString"
      and .Tags == [{Key: "project", Value: "catchu"}, {Key: "issue", Value: "276"}]' "$S/put-request.json"; } > /dev/null 2>&1; echo $?)"
check "put-parameter --random: 진짜 AWS CLI가 입력 파일을 받아들임" "$(ok test ! -e "$S/invalid")"
check "put-parameter --random: 값이 출력·명령 인자·임시 폴더에 없음" "$( { secret_free && says '만듦(판 1'; } > /dev/null 2>&1; echo $?)"
reset_state
STDIN_TEXT="${INPUT_KEY}"$'\n'"second line" run put-parameter.sh --stdin "$NEW"
check "put-parameter --stdin: 표준 입력 첫 줄을 그대로 넣고 값을 찍지 않음" \
  "$( { test "$rc" = 0 && test "$("$REAL_JQ" -r --arg n "$NEW" '.[$n].Value' "$S/ssm.json")" = "$INPUT_KEY" && secret_free; } > /dev/null 2>&1; echo $?)"
for bad in '' 'has space' "$(printf 'tab\there')"; do
  reset_state
  STDIN_TEXT=$bad run put-parameter.sh --stdin "$NEW"
  check "put-parameter --stdin: 빈 값·공백·제어 문자는 만들지 않고 멈춤('${bad}')" "$(ok test "$rc" = 1 -a -z "$(calls)")"
done
reset_state
run put-parameter.sh --random /catchu/prod/api/AUTH_JWT_SECRET
check "put-parameter: 이미 있는 이름은 덮어쓰지 않고 멈춤" "$( { test "$rc" = 1 -a -z "$(calls)" && says '이미 있다'; } > /dev/null 2>&1; echo $?)"
for args in "--random /catchu/dev/x/Y" "--random /catchu/prod/Y" "--value /catchu/prod/worker/Y" "--random"; do
  reset_state
  # shellcheck disable=SC2086 # 인자를 나눠 넘긴다.
  run put-parameter.sh $args
  check "put-parameter: 인자가 틀리면 AWS를 부르지 않고 멈춤(${args})" "$(ok test "$rc" = 1 -a ! -s "$S/argv")"
done

# ---------- db-admin.sh ----------
SQL=deploy/aws/db/roles.sql
SQL_SUM=$(shasum -a 256 < "$REPO/$SQL")
SQL_SUM=${SQL_SUM%% *}
ops_left() { ls "$S/objects/catchu-ops" 2> /dev/null | grep -c . ; }
reset_state
run db-admin.sh "$SQL"
first_run=$(sed -n 's/.*catchu\.io\/db-admin-run=\([0-9a-f]\{16\}\).*/\1/p' "$OUT" | head -1)
check "db-admin: 종료 0, ConfigMap → Secret → Pod 순서로 만들고 끝나면 실행 표식으로 찾아 지움" \
  "$(ok test "$rc" = 0 -a "$(calls)" = "create ConfigMap,create Secret,create Pod,delete pod secret configmap," -a "$(ops_left)" = 0)"
check "db-admin: 비밀값이 출력·명령 인자·임시 폴더에 없고 계정 번호(관리자 비밀번호 ARN)도 찍지 않음" "$(ok secret_free)"
check "db-admin: 기록에 SQL 해시·이미지 digest·종료 코드·지움 확인을 남김" \
  "$( { says "sha256 ${SQL_SUM}" && says '이미지 sha256:40d828eda66737aaacb934387a337babf1455ebd56e9bdd13fc08e211257c972' \
    && says '종료 코드 0' && says '지움 확인' && says '{lock_timeout=3s}'; } > /dev/null 2>&1; echo $?)"
reset_state
# 지우기 전의 임시 자원을 보려고 지우기만 실패시킨다(그 경우의 종료 코드도 함께 본다).
run STUB_DELETE_FAIL=1 db-admin.sh "$SQL"
name=$(ls "$S/objects/catchu-ops" | sed -n 's/^Pod-\(.*\)\.json$/\1/p')
cm=$S/objects/catchu-ops/ConfigMap-$name.json
sec=$S/objects/catchu-ops/Secret-$name.json
run_id=$("$REAL_JQ" -r '.metadata.labels["catchu.io/db-admin-run"] // ""' "$cm")
check "db-admin: 지웠는지 확인하지 못하면 4, 남은 것과 실행 표식으로 지우는 명령을 알려 줌" \
  "$( { test "$rc" = 4 && says "pod/${name} secret/${name} configmap/${name}" \
    && says "delete pod,secret,configmap -l catchu.io/db-admin-run=${run_id} 를 실행"; } > /dev/null 2>&1; echo $?)"
check "db-admin: 이름은 db-admin-<UTC 시각>, 세 임시 자원이 같은 이름·표식, 실행 표식은 실행마다 새 16자리 난수" \
  "$( { [[ $name =~ ^db-admin-[0-9]{8}-[0-9]{6}$ ]] && [[ $run_id =~ ^[0-9a-f]{16}$ ]] && [[ $first_run =~ ^[0-9a-f]{16}$ ]] \
    && test "$run_id" != "$first_run" && "$REAL_JQ" -s -e --arg r "$run_id" 'all(.[]; .metadata.labels["catchu.io/db-admin"] == "once"
    and .metadata.labels["catchu.io/db-admin-run"] == $r and .metadata.namespace == "catchu-ops")' "$cm" "$sec" "$S/objects/catchu-ops/Pod-$name.json"; } > /dev/null 2>&1; echo $?)"
check "db-admin: ConfigMap에 DB 주소·관리자 이름·SQL 원문·저장소 루트 인증서" \
  "$( { "$REAL_JQ" -e --arg h "$DB_HOST" '.data.PGHOST == $h and .data.PGUSER == "catchu_admin"
    and (.data | keys) == ["PGHOST", "PGUSER", "ca.pem", "run.sql"]' "$cm" \
    && test "$("$REAL_JQ" -j '.data["run.sql"]' "$cm" | shasum -a 256 | cut -d' ' -f1)" = "$SQL_SUM" \
    && test "$("$REAL_JQ" -j '.data["ca.pem"]' "$cm" | shasum -a 256 | cut -d' ' -f1)" = "$CA_SUM"; } > /dev/null 2>&1; echo $?)"
check "db-admin: 임시 Secret에 관리자 비밀번호(Secrets Manager)와 두 계정 비밀번호(SSM)" \
  "$(ok "$REAL_JQ" -e --arg a "$ADMIN_PW" --arg p "$APP_PW" --arg m "$MIGRATOR_PW" '.type == "Opaque"
    and (.data | map_values(@base64d)) == {PGPASSWORD: $a, CATCHU_APP_PASSWORD: $p, CATCHU_MIGRATOR_PASSWORD: $m}' "$sec")"
check "db-admin: Pod는 틀의 자리를 모두 채웠고 같은 이름의 ConfigMap·Secret을 읽음" \
  "$(ok "$REAL_JQ" -e --arg n "$name" '.metadata.name == $n and ([.. | strings | select(test("__[A-Z]"))] | length) == 0
    and ([.spec.containers[0].env[].valueFrom // empty | (.configMapKeyRef.name // .secretKeyRef.name)] | unique) == [$n]
    and .spec.volumes[1].configMap.name == $n' "$S/objects/catchu-ops/Pod-$name.json")"

reset_state
run STUB_POD=failed db-admin.sh "$SQL"
check "db-admin: SQL이 실패하면 3, 출력을 보여 주고 임시 자원은 지움" \
  "$( { test "$rc" = 3 -a "$(ops_left)" = 0 && says '종료 코드 3' && says '지움 확인' && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_POD=deadline db-admin.sh "$SQL"
check "db-admin: Pod 한도(5분)를 넘겨 끝나면 3, 사유 DeadlineExceeded" "$( { test "$rc" = 3 -a "$(ops_left)" = 0 && says 'DeadlineExceeded'; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_POD=pending db-admin.sh "$SQL"
check "db-admin: 시간 안에 끝나지 않으면 3(결과 불명), 정해 둔 횟수만큼 기다린 뒤 지움" \
  "$( { test "$rc" = 3 -a "$(ops_left)" = 0 -a "$(grep -c '^sleep 3$' "$S/sleeps")" = 120 && says 'DB에서 확인'; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_FAIL="secretsmanager get-secret-value" db-admin.sh "$SQL"
check "db-admin: 관리자 비밀번호를 읽지 못하면 Secret·Pod 없이 3, 만든 ConfigMap은 지움" \
  "$(ok test "$rc" = 3 -a "$(calls)" = "create ConfigMap,delete configmap," -a "$(ops_left)" = 0)"
reset_state
run STUB_SM_USER=someone db-admin.sh "$SQL"
check "db-admin: Secrets Manager의 관리자 이름이 RDS와 다르면 3, Secret을 만들지 않음" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap,delete configmap," && says '관리자 이름'; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_CREATE_FAIL=Pod db-admin.sh "$SQL"
check "db-admin: Pod를 만들지 못하면(예: Pod 보안 검사 거부) 3, Secret·ConfigMap은 지움" \
  "$(ok test "$rc" = 3 -a "$(calls)" = "create ConfigMap,create Secret,create Pod 실패,delete secret configmap," -a "$(ops_left)" = 0)"
# 만들기 응답이 끊겼지만 서버에는 저장된 경우. 만들었다고 확인하지 못한 것도 실행 표식으로 찾아 지워야 한다.
for c in "ConfigMap:create ConfigMap 응답 끊김,delete configmap," "Secret:create ConfigMap,create Secret 응답 끊김,delete secret configmap," \
  "Pod:create ConfigMap,create Secret,create Pod 응답 끊김,delete pod secret configmap,"; do
  reset_state
  run STUB_CREATE_LOST="${c%%:*}" db-admin.sh "$SQL"
  check "db-admin: ${c%%:*} 만들기 응답이 끊겨도(서버에는 저장됨) 실행 표식으로 찾아 지우고 3" \
    "$( { test "$rc" = 3 -a "$(calls)" = "${c#*:}" -a "$(ops_left)" = 0 && says '지움 확인' && secret_free; } > /dev/null 2>&1; echo $?)"
done
check "db-admin: Pod 만들기 결과를 모르면 SQL이 실행됐을 수 있어 DB에서 확인하라고 알림" "$(ok says '응답만 끊겼다면 SQL이 실행됐을 수 있으니 DB에서 확인')"
reset_state
run STUB_CREATE_LOST=Secret STUB_DELETE_FAIL=1 db-admin.sh "$SQL"
name=$(ls "$S/objects/catchu-ops" | sed -n 's/^Secret-\(.*\)\.json$/\1/p')
check "db-admin: 응답이 끊긴 Secret을 지우지 못하면 4, 남은 대상과 실행 표식으로 지우는 명령을 알려 줌" \
  "$( { test "$rc" = 4 && test -n "$name" && says "secret/${name} configmap/${name})" && says 'delete pod,secret,configmap -l catchu.io/db-admin-run=' \
    && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_GET_FAIL=1 db-admin.sh "$SQL"
check "db-admin: 지운 뒤 실행 표식으로 조회하지 못하면 4(조회 실패), 관리자 비밀번호 Secret 이름을 알려 줌" \
  "$( { test "$rc" = 4 && says '확인하지 못했다(조회 실패)' && says 'Secret(이름 db-admin-' && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
ssm_set /catchu/prod/db/catchu_app-password SecureString "${APP_PW}"$'\n'
run db-admin.sh "$SQL"
check "db-admin: 계정 비밀번호 끝에 줄바꿈이 붙으면 Secret을 만들지 않고 3" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap,delete configmap," && says '계정 비밀번호가 없거나 형식이 다르다' && secret_free; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_ADMIN_PW="${ADMIN_PW}"$'\n' db-admin.sh "$SQL"
check "db-admin: 관리자 비밀번호 끝에 줄바꿈이 붙으면 Secret을 만들지 않고 3" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap,delete configmap," && says '관리자 비밀번호가 비었거나 형식이 다르다' && secret_free; } > /dev/null 2>&1; echo $?)"
only_left() { # 남은 임시 자원이 그 종류 하나뿐이다(같은 이름으로 이미 있던 것. 실행 표식이 다른 다른 실행의 것으로 본다)
  test "$(ops_left)" = 1 && ls "$S/objects/catchu-ops" | grep -q "^$1-db-admin-"
}
reset_state
run STUB_CREATE_EXISTS=ConfigMap db-admin.sh "$SQL"
check "db-admin: 같은 이름의 ConfigMap이 이미 있으면 3, 실행 표식이 달라 지우지 않음" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap 이미 있음,delete 없음," && only_left ConfigMap && says '남은 것 없음'; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_CREATE_EXISTS=Secret db-admin.sh "$SQL"
check "db-admin: 같은 이름의 Secret이 이미 있으면 3, 이 실행의 ConfigMap만 지움" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap,create Secret 이미 있음,delete configmap," && only_left Secret; } > /dev/null 2>&1; echo $?)"
reset_state
run STUB_CREATE_EXISTS=Pod db-admin.sh "$SQL"
check "db-admin: 같은 이름의 Pod가 이미 있으면 3, 이 실행의 ConfigMap·Secret만 지우고 그 Pod는 둠" \
  "$( { test "$rc" = 3 -a "$(calls)" = "create ConfigMap,create Secret,create Pod 이미 있음,delete secret configmap," && only_left Pod; } > /dev/null 2>&1; echo $?)"
no_create() { test "$rc" = 1 -a -z "$(calls)"; }
for c in STUB_LEFTOVER=1 STUB_NO_NS=catchu-ops STUB_NO_NETPOL=db-admin STUB_PARAMETER_STATUS=pending-reboot \
  STUB_PARAMETER_GROUP=default.postgres16 STUB_LOG_MIN=error STUB_SECRET_STATUS=rotating STUB_RDS_STATUS=backing-up; do
  reset_state
  run "$c" db-admin.sh "$SQL"
  check "db-admin: 전제가 다르면(${c}) 아무것도 만들지 않고 멈춤(1)" "$( { no_create && ! grep -q '^secretsmanager' "$S/aws-seen" && ! grep -q "$ACCOUNT" "$OUT"; } > /dev/null 2>&1; echo $?)"
done
reset_state
ssm_drop /catchu/prod/db/catchu_app-password
run db-admin.sh "$SQL"
check "db-admin: 계정 비밀번호 SSM이 없으면 멈춤(1)" "$(ok no_create)"
cp "$REPO/$SQL" "$REPO/deploy/aws/roles-copy.sql"
for arg in deploy/aws/roles-copy.sql deploy/aws/db/rds-ca-rsa2048-g1.pem deploy/aws/db/none.sql /etc/hosts; do
  reset_state
  run db-admin.sh "$arg"
  check "db-admin: SQL 파일이 deploy/aws/db/의 .sql이 아니면 AWS를 부르지 않고 멈춤(${arg})" "$(ok test "$rc" = 1 -a ! -s "$S/argv")"
done
reset_state
run CATCHU_EXPECTED_ACCOUNT=999999999999 db-admin.sh "$SQL"
check "db-admin: 계정이 다르면 아무것도 하지 않음" "$( { no_create && test "$(sort -u "$S/aws-seen")" = 'sts get-caller-identity'; } > /dev/null 2>&1; echo $?)"

# ---------- catchu-ops 실행 파일·루트 인증서·SQL 조건 ----------
json() { ruby -ryaml -rjson -e 'puts JSON.generate(YAML.load_stream(STDIN.read).compact)' < "$1"; }
OPS=$HERE/../k8s/ops
q() { # 파일 jq식 — 결과가 true여야 통과
  : > "$OUT"
  json "$1" | "$REAL_JQ" -e "$2" > /dev/null 2>> "$OUT"
}
check "catchu-ops namespace: Pod 보안 검사 restricted, 기본 서비스 계정 토큰 자동 탑재 끔" \
  "$(ok q "$OPS/namespace.yaml" '.[0].metadata.name == "catchu-ops" and .[0].metadata.labels["pod-security.kubernetes.io/enforce"] == "restricted"
    and .[1].metadata.namespace == "catchu-ops" and .[1].automountServiceAccountToken == false')"
mig=$(json "$HERE/../k8s/network-policy.yaml" | "$REAL_JQ" -c '[.[] | select(.metadata.name == "migration") | .spec.egress[0].to[].ipBlock.cidr]')
check "catchu-ops NetworkPolicy: 기본 차단·DNS, psql Pod는 catchu의 migration과 같은 대역 5432로만 나감" \
  "$(ok q "$OPS/network-policy.yaml" "(map({(.metadata.name): .}) | add) as \$p | all(.[]; .metadata.namespace == \"catchu-ops\")
    and (\$p[\"default-deny\"].spec | .podSelector == {} and (.policyTypes | sort) == [\"Egress\", \"Ingress\"])
    and (\$p[\"allow-dns\"].spec.egress[0].ports | map(.port) | unique) == [53]
    and \$p[\"db-admin\"].spec.podSelector.matchLabels == {\"app.kubernetes.io/name\": \"db-admin\"}
    and (\$p[\"db-admin\"].spec.policyTypes | sort) == [\"Egress\", \"Ingress\"] and (\$p[\"db-admin\"].spec.ingress // []) == []
    and [\$p[\"db-admin\"].spec.egress[].ports[].port] == [5432] and [\$p[\"db-admin\"].spec.egress[].to[].ipBlock.cidr] == ${mig}")"
POD='.[0].spec'
check "psql Pod 틀: controller 없음·다시 띄우지 않음·시간 한도, NetworkPolicy가 고르는 표식" \
  "$(ok q "$OPS/db-admin-pod.yaml" '.[0] | .kind == "Pod" and .metadata.namespace == "catchu-ops" and .spec.restartPolicy == "Never"
    and .spec.activeDeadlineSeconds > 0 and .metadata.labels["app.kubernetes.io/name"] == "db-admin" and .metadata.labels["catchu.io/db-admin"] == "once"')"
check "psql Pod 틀: root 아님(postgres 999)·seccomp·토큰 자동 탑재 끔·호스트 망 없음, 권한 상승 금지·읽기 전용 루트·권한 전부 제거" \
  "$(ok q "$OPS/db-admin-pod.yaml" "${POD} | .securityContext.runAsNonRoot == true and .securityContext.runAsUser == 999
    and .securityContext.seccompProfile.type == \"RuntimeDefault\" and .automountServiceAccountToken == false and .enableServiceLinks == false
    and (.hostNetwork // false) == false and (.containers | length) == 1 and (.containers[0].securityContext
    | .allowPrivilegeEscalation == false and .readOnlyRootFilesystem == true and .capabilities.drop == [\"ALL\"])
    and all(.volumes[]; has(\"emptyDir\") or has(\"configMap\")) and any(.volumes[]; .emptyDir.sizeLimit != null)")"
check "psql Pod 틀: 이미지는 digest로 고정했고 로컬 합성 DB(compose.local-db.yaml)와 같음, CPU 상한 없음" \
  "$( { q "$OPS/db-admin-pod.yaml" "${POD}.containers[0] | (.image | test(\"@sha256:[0-9a-f]{64}$\")) and .resources.requests.memory != null
    and .resources.limits.memory != null and .resources.limits.cpu == null" \
    && grep -qF "image: $(json "$OPS/db-admin-pod.yaml" | "$REAL_JQ" -r '.[0].spec.containers[0].image | ltrimstr("docker.io/")')" "$HERE/../../compose.local-db.yaml"; } > /dev/null 2>&1; echo $?)"
check "psql Pod 틀: psqlrc 없이 한 트랜잭션·오류 때 멈춤, 오류 때도 문장 원문을 찍지 않음, 문장 되풀이 옵션 없음" \
  "$(ok q "$OPS/db-admin-pod.yaml" "${POD}.containers[0].command as \$c | \$c[0] == \"psql\" and (\$c | index(\"--no-psqlrc\")) != null
    and (\$c | index(\"--single-transaction\")) != null and (\$c | index(\"ON_ERROR_STOP=1\")) != null
    and (\$c | index(\"VERBOSITY=terse\")) != null and ([\$c[] | select(test(\"^-(a|e|-echo)\"))] | length) == 0")"
# bash 3.2는 $( ) 안 큰따옴표의 {a, b}도 펼치므로 jq식을 작은따옴표 변수로 둔다.
tls_rule='(.containers[0].env | map({(.name): (.value // "ref")}) | add) as $e
  | $e.PGSSLMODE == "verify-full" and $e.HOME == "/tmp" and $e.PSQL_HISTORY == "/dev/null"
  and (.volumes[] | select(.name == "files") | .configMap.items | map({(.key): .path}) | add) == {"run.sql": "run.sql", "ca.pem": "db-ca.pem"}
  and $e.PGSSLROOTCERT == ((.containers[0].volumeMounts[] | select(.name == "files") | .mountPath) + "/db-ca.pem")
  and ([.containers[0].env[] | select(.name | test("PASSWORD")) | (.value == null and .valueFrom.secretKeyRef != null)] | all)'
check "psql Pod 틀: TLS verify-full, 루트 인증서는 ConfigMap의 ca.pem, 비밀번호는 Secret에서만" \
  "$(ok q "$OPS/db-admin-pod.yaml" "${POD} | ${tls_rule}")"
CA=$HERE/../db/rds-ca-rsa2048-g1.pem
: > "$OUT"
check "루트 인증서: 서울 RSA2048 G1 루트 하나, 스스로 서명, 2061년까지, RDS API의 rds-ca-rsa2048-g1 지문(SHA-1)과 같음" \
  "$( { test "$(grep -c 'BEGIN CERTIFICATE' "$CA")" = 1 \
    && openssl x509 -in "$CA" -noout -subject | grep -q 'CN *= *Amazon RDS ap-northeast-2 Root CA RSA2048 G1' \
    && openssl verify -CAfile "$CA" "$CA" && openssl x509 -in "$CA" -noout -enddate | grep -q '2061 GMT' \
    && test "$(openssl x509 -in "$CA" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')" = 58fe7e8c3b1f561be7e51f69dcfc8acfbb546e02; } > /dev/null 2>&1; echo $?)"
check "루트 인증서: 파일 해시가 lib/rds.sh의 값과 같음" "$(ok grep -q "^CATCHU_DB_CA_SHA256=${CA_SUM}$" "$HERE/lib/rds.sh")"
check "roles.sql: 비밀번호는 환경변수에서만 읽고(\\getenv) SQL에 글자로 적지 않음, 잠금 대기 상한은 앱 계정에만" \
  "$( { grep -q '^\\getenv app_password CATCHU_APP_PASSWORD$' "$HERE/../db/roles.sql" && ! grep -q -i "password '" "$HERE/../db/roles.sql" \
    && test "$(grep -c 'lock_timeout' "$HERE/../db/roles.sql")" = 1 && grep -q "^ALTER ROLE catchu_app SET lock_timeout = '3s';$" "$HERE/../db/roles.sql"; } > /dev/null 2>&1; echo $?)"
check "새 실행 파일·SQL에 계정 번호(12자리 숫자)가 없음" "$(ok test "$(cat "$OPS"/*.yaml "$HERE/../db/roles.sql" | grep -c -E '[0-9]{12}')" = 0)"

echo
echo "통과 $pass, 실패 $fail"
[ "$fail" = 0 ]
