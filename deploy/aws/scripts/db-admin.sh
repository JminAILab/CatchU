#!/usr/bin/env bash
# DB 관리용 psql 일회 Pod(#276, 계획 Dv1). deploy/aws/db/의 SQL 파일 하나를 RDS 관리자로 한 트랜잭션 안에서 실행한다.
# namespace catchu-ops에서만 돌린다(자동 배포 역할이 닿지 않는 곳, k8s/ops/namespace.yaml). RDS 관리자 비밀번호(Secrets Manager. 7일마다
# 바뀌므로 실행할 때마다 읽는다)와 두 계정 비밀번호(SSM)는 Pod와 같은 이름의 임시 Secret으로만 넘기고, 값은 파이프로만 지난다.
# 끝나면 성공·실패와 관계없이 이 실행이 만든 Pod·Secret·ConfigMap을 지우고 없어졌는지 확인한다. 같은 이름이 이미 있어 만들지 못한 것은
# 다른 실행의 것일 수 있어 지우지 않는다. 화면에는 SQL 출력과 기록만 찍는다.
#
# 사용: bash deploy/aws/scripts/db-admin.sh deploy/aws/db/<파일>.sql   (저장소 루트에서. 내용은 deploy/aws/k8s/README.md 「DB 관리 Pod」)
# 종료 코드: 0 SQL 성공, 임시 자원 지움 확인
#            1 시작 전 확인에서 멈춤. 아무것도 만들지 않았다
#            3 SQL 실패 또는 결과 불명(시간 초과·조회 실패). 임시 자원은 지웠다. 한 트랜잭션이라 실패했으면 DB는 바뀌지 않았다
#            4 임시 자원을 지웠는지 확인하지 못했다. 관리자 비밀번호가 든 Secret이 남았을 수 있으니 곧바로 손으로 지운다
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
. "$here/lib/guard.sh"
. "$here/lib/rds.sh"

namespace=catchu-ops
poll=3
tries=120 # Pod가 끝나기를 기다리는 횟수(3초 × 120 = 6분, Pod 자체 한도 5분보다 길게)
app_param=/catchu/prod/db/catchu_app-password
migrator_param=/catchu/prod/db/catchu_migrator-password
labels='{"app.kubernetes.io/part-of": "catchu", "catchu.io/db-admin": "once"}'

# 관리자 비밀번호(SecretString JSON)와 SSM 응답 → 임시 Secret. 멈출 때는 "확인 실패:"로 시작하는 문구만 낸다(값은 넣지 않는다).
# shellcheck disable=SC2016 # jq 변수다.
program='
def fail($msg): error("확인 실패: " + $msg);
if length != 2 then fail("관리자 비밀번호와 계정 비밀번호를 모두 읽지 못했다") else . end
| .[0] as $admin | .[1] as $ssm
| if ($admin | type) != "object" or ($admin.username // "") != $user
  then fail("Secrets Manager의 관리자 이름이 RDS 관리자와 다르다") else . end
| if ($admin.password // "" | test("^[!-~]+$")) | not then fail("관리자 비밀번호가 비었거나 형식이 다르다") else . end
| if ($ssm.InvalidParameters // []) != [] then fail("SSM에 없는 이름이 있다(" + ($ssm.InvalidParameters | join(", ")) + ")") else . end
| (reduce $ssm.Parameters[] as $p ({}; .[$p.Name] = $p.Value)) as $v
| if ($v[$app] // "" | test("^[!-~]{16,}$")) and ($v[$migrator] // "" | test("^[!-~]{16,}$")) | not
  then fail("계정 비밀번호가 없거나 형식이 다르다") else . end
| {apiVersion: "v1", kind: "Secret", type: "Opaque", metadata: {name: $name, namespace: $namespace, labels: $labels},
   data: {PGPASSWORD: ($admin.password | @base64), CATCHU_APP_PASSWORD: ($v[$app] | @base64),
     CATCHU_MIGRATOR_PASSWORD: ($v[$migrator] | @base64)}}
'

[ "$#" = 1 ] || catchu_die "사용법: $0 deploy/aws/db/<파일>.sql"
repo=$(cd "$here/../../.." && pwd -P)
dir=$(cd "$(dirname "$1")" 2> /dev/null && pwd -P) || catchu_die "SQL 파일을 찾지 못했다($1)"
sql="${dir}/$(basename "$1")"
case $sql in "${repo}"/deploy/aws/db/*.sql) ;; *) catchu_die "SQL 파일은 deploy/aws/db/ 아래의 .sql이어야 한다($1)" ;; esac
[ -f "$sql" ] && [ -r "$sql" ] || catchu_die "SQL 파일을 읽지 못했다($1)"
[ "$(wc -c < "$sql")" -lt 65536 ] || catchu_die "SQL 파일이 64KB를 넘는다($1)"
sql_sum=$(shasum -a 256 < "$sql")
sql_sum=${sql_sum%% *}
template="${repo}/deploy/aws/k8s/ops/db-admin-pod.yaml"
[ -r "$template" ] || catchu_die "psql Pod 틀 ${template}가 없다"

catchu_require_tools aws jq kubectl shasum
catchu_guard_aws
catchu_guard_cluster
catchu_db_ca_check

ko() {
  command kubectl --kubeconfig "$CATCHU_KUBECONFIG" --namespace "$namespace" "$@"
}
say() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# ---------- 1. 시작 전 확인(아무것도 만들지 않음) ----------
ko get namespace "$namespace" -o name > /dev/null ||
  catchu_die "namespace ${namespace}를 찾지 못했다. deploy/aws/k8s/ops/namespace.yaml을 먼저 적용한다"
for policy in default-deny allow-dns db-admin; do
  ko get networkpolicy "$policy" -o name > /dev/null ||
    catchu_die "namespace ${namespace}의 NetworkPolicy ${policy}를 찾지 못했다. deploy/aws/k8s/ops/network-policy.yaml을 먼저 적용한다"
done
left=$(ko get pod,secret,configmap -l catchu.io/db-admin -o name) || catchu_die "지난 실행의 임시 자원을 조회하지 못했다"
[ -z "$left" ] ||
  catchu_die "지난 실행의 임시 자원이 남아 있다(${left//$'\n'/ }). 무엇이 남았는지 확인한 뒤 kubectl --kubeconfig ~/.kube/catchu -n ${namespace} delete로 지우고 다시 실행한다"

catchu_db_instance
[[ $db_admin_user =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || catchu_die "RDS 관리자 이름이 예상한 형식이 아니다(${db_admin_user:-없음})"
# ARN에는 계정 번호가 들어 있어 찍지 않는다.
[[ $db_admin_secret =~ ^arn:aws:secretsmanager:${CATCHU_REGION}:[0-9]{12}:secret:rds![A-Za-z0-9-]+$ ]] ||
  catchu_die "RDS 관리자 비밀번호가 RDS 관리 Secrets Manager 값이 아니다(--manage-master-user-password로 만든 DB인지 본다)"
[ "$db_admin_secret_status" = active ] ||
  catchu_die "RDS 관리자 비밀번호의 상태가 active가 아니다(${db_admin_secret_status:-모름}). 교체 중이면 끝난 뒤 다시 실행한다"
[ "$db_parameter_group" = catchu-pg16 ] && [ "$db_parameter_status" = in-sync ] ||
  catchu_die "RDS 파라미터 그룹이 catchu-pg16이고 반영된 상태(in-sync)가 아니다(${db_parameter_group:-모름}, ${db_parameter_status:-모름})"
# 비밀번호가 든 문장이 실패해도 DB 로그에 남지 않는 설정(create-rds.sh)이 그대로인지 본다.
params=$(aws_catchu rds describe-db-parameters --db-parameter-group-name catchu-pg16 --source user \
  --query 'Parameters[?ParameterName==`log_min_error_statement` || ParameterName==`log_statement`].[ParameterName, ParameterValue]' \
  --output text) || catchu_die "파라미터 그룹 catchu-pg16을 조회하지 못했다"
printf '%s\n' "$params" | grep -qx $'log_min_error_statement\tpanic' && printf '%s\n' "$params" | grep -qx $'log_statement\tnone' ||
  catchu_die "파라미터 그룹 catchu-pg16에 log_min_error_statement=panic·log_statement=none이 없다. 실패한 문장의 비밀번호가 DB 로그에 남을 수 있어 멈춘다"
n=$(catchu_count "SSM 계정 비밀번호" ssm describe-parameters \
  --parameter-filters "Key=Name,Option=Equals,Values=${app_param},${migrator_param}" --query 'length(Parameters)')
[ "$n" = 2 ] || catchu_die "SSM ${app_param}·${migrator_param}가 모두 있지 않다"

name="db-admin-$(date -u +%Y%m%d-%H%M%S)"
pod_text=$(sed "s|__NAME__|${name}|g" "$template")
if printf '%s\n' "$pod_text" | grep -q '__[A-Z][A-Z_]*__'; then
  catchu_die "psql Pod 틀에 채우지 않은 자리가 있다"
fi

# ---------- 2. 임시 ConfigMap·Secret·Pod를 만들고 끝나기를 기다린다 ----------
tmp=$(mktemp -d)
created=0
made=() # 이 실행이 실제로 만든 것(종류/이름)만 적는다. 정리는 이것만 지운다(같은 이름이 이미 있어 만들지 못한 것은 건드리지 않는다).
record=''
note() { # 기록에 한 줄을 남기고 화면에도 찍는다.
  record="${record}  $*"$'\n'
  say "$*"
}
cleanup() { # 성공·실패와 관계없이 이 실행이 만든 임시 자원을 지우고 없어졌는지 확인한다. 만들기 시작한 뒤의 멈춤은 모두 3(지움 확인 실패는 4)이다.
  local rc=$? remaining=''
  rm -rf "$tmp"
  if [ "$created" = 1 ]; then
    [ "$rc" = 0 ] || rc=3
    if [ "${#made[@]}" = 0 ]; then
      note "이 실행이 만든 임시 자원은 없다"
    else
      ko delete "${made[@]}" --ignore-not-found --wait=true --timeout=90s > /dev/null 2>&1 || true
      if remaining=$(ko get "${made[@]}" --ignore-not-found -o name 2> /dev/null) && [ -z "$remaining" ]; then
        note "이 실행이 만든 임시 자원(${made[*]}): 지움 확인"
      else
        note "임시 자원을 지웠는지 확인하지 못했다(${remaining:-조회 실패}). 곧바로 kubectl --kubeconfig ~/.kube/catchu -n ${namespace} delete ${made[*]} 를 실행하고 없어졌는지 본다"
        rc=4
      fi
    fi
    printf 'DB 관리 기록(SQL %s)\n%s' "${sql#"${repo}"/}" "$record" >&2
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
finish() { # 종료 코드, 사유(임시 자원은 cleanup이 지운다)
  say "멈춤($1): $2"
  exit "$1"
}

created=1
note "대상: 클러스터 ${CATCHU_CLUSTER}, namespace ${namespace}, DB ${db_host}(관리자 ${db_admin_user}), SQL ${sql#"${repo}"/}(sha256 ${sql_sum})"
# shellcheck disable=SC2016 # jq 변수다.
jq -n --arg name "$name" --arg namespace "$namespace" --argjson labels "$labels" --arg host "$db_host" --arg user "$db_admin_user" \
  --rawfile sql "$sql" --rawfile ca "$CATCHU_DB_CA_FILE" '{apiVersion: "v1", kind: "ConfigMap",
  metadata: {name: $name, namespace: $namespace, labels: $labels}, data: {PGHOST: $host, PGUSER: $user, "run.sql": $sql, "ca.pem": $ca}}' |
  ko create -f - -o name > /dev/null 2> "${tmp}/create.err" ||
  finish 3 "ConfigMap ${name}를 만들지 못했다(같은 이름이 이미 있었다면 그대로 둔다): $(head -c 300 "${tmp}/create.err" | tr '\n' ' ')"
made+=("configmap/${name}")

set +e
{
  aws_catchu secretsmanager get-secret-value --secret-id "$db_admin_secret" --query SecretString --output text || exit 1
  aws_catchu ssm get-parameters --names "$app_param" "$migrator_param" --with-decryption --output json || exit 1
} 2> "${tmp}/read.err" |
  jq -cs --arg name "$name" --arg namespace "$namespace" --argjson labels "$labels" --arg user "$db_admin_user" \
    --arg app "$app_param" --arg migrator "$migrator_param" "$program" 2> "${tmp}/jq.err" |
  ko create -f - -o name > /dev/null 2> "${tmp}/create.err"
codes=("${PIPESTATUS[@]}")
set -e
if [ "${codes[0]}" != 0 ]; then
  finish 3 "관리자 비밀번호나 계정 비밀번호를 읽지 못했다: $(head -c 300 "${tmp}/read.err" | tr '\n' ' ')"
fi
if [ "${codes[1]}" != 0 ]; then
  # jq의 다른 오류 문구에는 입력 값이 섞일 수 있어 직접 낸 문구만 보여 준다.
  grep -o '확인 실패: .*' "${tmp}/jq.err" >&2 || say "임시 Secret을 만들지 못했다(오류 원문은 값이 섞일 수 있어 찍지 않는다)"
  finish 3 "값 검사에서 멈췄다"
fi
[ "${codes[2]}" = 0 ] ||
  finish 3 "임시 Secret ${name}를 만들지 못했다(같은 이름이 이미 있었다면 그대로 둔다): $(head -c 300 "${tmp}/create.err" | tr '\n' ' ')"
made+=("secret/${name}")

printf '%s\n' "$pod_text" | ko create -f - -o name > /dev/null 2> "${tmp}/create.err" ||
  finish 3 "psql Pod ${name}를 만들지 못했다(같은 이름이 이미 있었다면 그대로 둔다): $(head -c 300 "${tmp}/create.err" | tr '\n' ' ')"
made+=("pod/${name}")
note "psql Pod 시작: ${name}"

phase=''
state=''
for _ in $(seq "$tries"); do
  state=$(ko get pod "$name" -o json) || finish 3 "psql Pod ${name}의 상태를 조회하지 못했다. SQL이 적용됐는지 DB에서 확인한다"
  phase=$(jq -r '.status.phase // ""' <<< "$state")
  case $phase in Succeeded | Failed) break ;; esac
  sleep "$poll"
done
read -r code digest started finished reason <<< "$(jq -r '.status.containerStatuses[0] as $c | [
  ($c.state.terminated.exitCode // "-" | tostring), ($c.imageID // "" | split("@") | last // "" | if . == "" then "-" else . end),
  ($c.state.terminated.startedAt // "-"), ($c.state.terminated.finishedAt // "-"),
  (.status.reason // $c.state.terminated.reason // $c.state.waiting.reason // "-")] | join(" ")' <<< "$state")"
if logs=$(ko logs "$name" --tail=200 2> /dev/null); then
  printf '%s\n' "$logs" | sed 's/^/    | /' >&2
else
  say "psql 출력을 읽지 못했다(kubectl logs ${name})"
fi
note "결과: 상태 ${phase:-모름}, 종료 코드 ${code}, 이미지 ${digest}, 시작 ${started}, 끝 ${finished}, 사유 ${reason}"
case "${phase}:${code}" in
  Succeeded:0) note "SQL 성공" ;;
  Failed:*) finish 3 "SQL 실패(종료 코드 ${code}, 사유 ${reason}). 한 트랜잭션이라 DB는 바뀌지 않았다. 위 출력으로 원인을 본다" ;;
  *) finish 3 "psql Pod가 시간 안에 끝나지 않았다(상태 ${phase:-모름}, 사유 ${reason}). Pod를 지우면 진행 중이던 트랜잭션은 되돌려진다. SQL이 적용됐는지 DB에서 확인한다" ;;
esac
