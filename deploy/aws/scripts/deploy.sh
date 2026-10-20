#!/usr/bin/env bash
# EKS 앱 교체(#276). 옛 api·worker를 멈추고 종료를 확인한 뒤 migration 일회 Pod를 한 번 실행하고, 새 api → worker → web 순서로
# 띄워 확인한다. 자동 배포(#342)도 이 스크립트를 그대로 쓴다. 단계와 멈췄을 때 할 일은 deploy/aws/k8s/README.md 「앱 교체(deploy.sh)」.
#
# 사용: bash deploy/aws/scripts/deploy.sh --commit <40자 커밋> [--resume]
#   이미지: ECR 네 저장소에서 태그 main-<커밋 앞 12자>(main 자동 배포가 붙인 태그)의 digest를 찾아 digest로 띄운다.
#   실행 파일: 그 커밋의 deploy/aws/k8s/{api,worker,web}.yaml·migration-pod.yaml을 git에서 읽어 자리를 채운다.
#     namespace·NetworkPolicy·Service·Ingress는 적용하지 않는다(바뀔 때 손으로 적용한다).
#   같은 판본·구성이 이미 정상으로 돌고 있으면 아무것도 바꾸지 않는다.
#   --resume: api·worker가 0으로 멈춰 있을 때(지난 교체가 멈췄거나 손으로 멈춤) 원인을 확인한 뒤 이어서 교체할 때만 붙인다.
#
# 종료 코드(deploy/scripts/replace-single.sh와 같은 뜻):
#   0 완료, 또는 바꿀 것이 없음
#   2 시작 전 확인에서 멈춤. 아무것도 바꾸지 않았다(입력·계정·클러스터·이미지·실행 파일·조회 실패, 멈춘 상태인데 --resume 없음)
#   3 옛 api·worker의 종료를 확인하지 못함(남은 Pod, 종료 코드를 모름, 조회·멈추기 실패). migration·새 실행은 시작하지 않았다
#   4 migration 실패   5 migration 결과 불명, 또는 같은 이름의 migration Pod가 성공 아닌 상태로 남아 있음
#   6 새 실행 확인 실패. api·worker를 다시 멈추고 종료를 확인했다
#   7 옛 실행이 강제 종료(137)됐다. 분석 중이던 작업이 실패로 기록되지 않았을 수 있다
#   3~7로 멈추면 api·worker는 0으로 멈춰 있다. 원인을 확인한 뒤 --resume을 붙여 다시 실행한다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

# guard.sh의 멈춤도 이 스크립트에서는 2(아무것도 바꾸지 않음)로 끝낸다. 무언가 바꾼 뒤에는 stop을 쓴다.
catchu_die() {
  printf '멈춤: %s\n' "$*" >&2
  exit 2
}

namespace=catchu
selector='app.kubernetes.io/name in (api,worker)'
poll=3                # 상태를 다시 보는 간격(초)
stop_tries=30         # 옛 api·worker가 없어지기를 기다리는 횟수(3초 × 30 = 90초, 종료 유예 30초보다 넉넉히)
migration_tries=220   # migration이 끝나기를 기다리는 횟수(3초 × 220 = 11분, Pod 자체 한도 10분보다 길게)
rollout_timeout=360s  # 새 실행 하나가 준비되기를 기다리는 시간(worker 시작 확인 5분 포함)

commit=''
resume=0
while [ "$#" -gt 0 ]; do
  case $1 in
    --commit)
      [ "$#" -ge 2 ] || catchu_die "사용법: $0 --commit <40자 커밋> [--resume]"
      commit=$2
      shift 2
      ;;
    --resume)
      resume=1
      shift
      ;;
    *) catchu_die "사용법: $0 --commit <40자 커밋> [--resume]" ;;
  esac
done
[[ $commit =~ ^[0-9a-f]{40}$ ]] || catchu_die "--commit에는 40자 커밋(소문자 16진수)을 넣는다"
unset KUBECTL_EXTERNAL_DIFF

catchu_require_tools aws jq kubectl git
catchu_guard_aws
catchu_guard_cluster

k() {
  command kubectl --kubeconfig "$CATCHU_KUBECONFIG" --namespace "$namespace" "$@"
}
now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}
say() {
  printf '%s %s\n' "$(now)" "$*" >&2
}
record=''
note() { # 교체 기록에 한 줄을 남기고 화면에도 찍는다.
  record="${record}  $*"$'\n'
  say "$*"
}
stop() { # 종료 코드, 사유
  local code=$1
  shift
  say "멈춤(${code}): $*"
  printf '교체 기록(커밋 %s)\n%s' "$commit" "$record" >&2
  say "다음 행동은 deploy/aws/k8s/README.md 「앱 교체(deploy.sh)」의 종료 코드 ${code}."
  exit "$code"
}

tmp=$(mktemp -d)
watch_pid=''
cleanup() {
  if [ -n "$watch_pid" ]; then
    kill "$watch_pid" 2> /dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

# ---------- 1. 시작 전 확인(아무것도 바꾸지 않음) ----------
repo=$(git -C "$here" rev-parse --show-toplevel) || catchu_die "저장소 위치를 찾지 못했다"
git -C "$repo" cat-file -e "${commit}^{commit}" 2> /dev/null ||
  catchu_die "이 저장소에 커밋 ${commit}가 없다. git fetch origin main 뒤 다시 실행한다"

# 이미지: 태그로 digest를 찾고 그 digest로 띄운다. 저장소 주소는 ECR에서 받아 쓰고 화면에는 digest만 찍는다(계정 번호가 들어 있다).
tag="main-${commit:0:12}"
for name in web api migration worker; do
  repository=catchu-${name}
  [ "$name" = migration ] && repository=catchu-api-migration
  uri=$(aws_catchu ecr describe-repositories --repository-names "$repository" --query 'repositories[0].repositoryUri' --output text) ||
    catchu_die "ECR 저장소 ${repository}를 조회하지 못했다"
  [[ $uri =~ ^[0-9]{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com/${repository}$ ]] ||
    catchu_die "ECR 저장소 ${repository}의 주소가 예상한 형식이 아니다"
  digest=$(aws_catchu ecr describe-images --repository-name "$repository" --image-ids "imageTag=${tag}" --query 'imageDetails[0].imageDigest' --output text) ||
    catchu_die "ECR ${repository}에서 태그 ${tag}의 이미지를 찾지 못했다"
  [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] || catchu_die "ECR ${repository} 태그 ${tag}의 digest가 형식에 맞지 않는다"
  printf -v "image_${name}" '%s@%s' "$uri" "$digest"
  printf -v "digest_${name}" '%s' "$digest"
done
note "이미지 digest: web ${digest_web}, api ${digest_api}, migration ${digest_migration}, worker ${digest_worker}"

# 실행 파일: 배포할 커밋의 파일에 자리를 채운다. 채우지 않은 자리가 남으면 멈춘다.
migration_pod="catchu-migrate-${commit:0:12}"
render() { # 파일 이미지 [Pod 이름]
  local file=$1 image=$2 pod=${3:-} text
  text=$(git -C "$repo" show "${commit}:deploy/aws/k8s/${file}" 2> /dev/null) ||
    catchu_die "커밋 ${commit:0:12}에 deploy/aws/k8s/${file}가 없다"
  text=$(printf '%s\n' "$text" | sed -e "s|__IMAGE__|${image}|g" -e "s|__REPLICAS__|1|g" -e "s|__COMMIT__|${commit}|g" -e "s|__NAME__|${pod}|g")
  if printf '%s\n' "$text" | grep -q '__[A-Z][A-Z_]*__'; then
    catchu_die "deploy/aws/k8s/${file}에 채우지 않은 자리가 있다"
  fi
  printf '%s\n' "$text" > "${tmp}/${file}"
}
render api.yaml "$image_api"
render worker.yaml "$image_worker"
render web.yaml "$image_web"
render migration-pod.yaml "$image_migration" "$migration_pod"

# 기본 차단 NetworkPolicy 없이 앱을 띄우지 않는다. DB 주소·CA(ConfigMap)가 없으면 api·migration이 뜨지 못하므로 먼저 본다.
k get networkpolicy default-deny -o name > /dev/null ||
  catchu_die "namespace ${namespace}의 기본 차단 NetworkPolicy(default-deny)를 찾지 못했다. deploy/aws/k8s/README.md 「적용(2단계)」대로 먼저 적용한다"
db_config=$(k get configmap catchu-db -o json) ||
  catchu_die "ConfigMap catchu-db를 찾지 못했다. deploy/aws/k8s/README.md 「Secret과 ConfigMap」대로 먼저 만든다"
db_host=$(jq -r 'if (.data.DB_HOST // "") != "" and (.data["ca.pem"] // "") != "" then .data.DB_HOST else "" end' <<< "$db_config")
[ -n "$db_host" ] || catchu_die "ConfigMap catchu-db에 DB_HOST·ca.pem 값이 없다"
note "대상: 클러스터 ${CATCHU_CLUSTER}, namespace ${namespace}, DB ${db_host}"

deployments=$(k get deployment api worker web --ignore-not-found -o json) || catchu_die "Deployment를 조회하지 못했다"
[ -n "$deployments" ] || deployments='{"items":[]}'
items='(.items // [.])[] | select(.kind == "Deployment")'
stopped=$(jq -r "${items} | select(.metadata.name != \"web\" and .spec.replicas == 0) | .metadata.name" <<< "$deployments")
if [ -n "$stopped" ] && [ "$resume" = 0 ]; then
  catchu_die "실행 수가 0으로 멈춘 것이 있다(${stopped//$'\n'/ }). 지난 교체가 멈췄거나 손으로 멈춘 상태다. 원인을 확인한 뒤 --resume을 붙여 다시 실행한다"
fi

# 같은 판본·구성이 정상으로 돌고 있으면 바꾸지 않는다. kubectl diff: 0 같음, 1 다름, 그 밖은 비교 실패.
healthy() { # Deployment 조회 결과(JSON)에서 api·worker·web이 모두 1개 실행·준비·최신인지
  jq -e "[${items} | select(.spec.replicas == 1 and .status.readyReplicas == 1 and .status.availableReplicas == 1
    and .status.updatedReplicas == 1 and (.status.unavailableReplicas // 0) == 0
    and .status.observedGeneration == .metadata.generation) | .metadata.name] | sort == [\"api\", \"web\", \"worker\"]" > /dev/null
}
same=1
for name in api worker web; do
  if k diff -f "${tmp}/${name}.yaml" > /dev/null 2> "${tmp}/diff.err"; then
    continue
  else
    rc=$?
  fi
  [ "$rc" = 1 ] || catchu_die "${name} 실행 파일을 지금 상태와 비교하지 못했다: $(head -c 300 "${tmp}/diff.err" | tr '\n' ' ')"
  same=0
done
if [ "$same" = 1 ]; then
  if healthy <<< "$deployments"; then
    say "바꿀 것 없음: 커밋 ${commit:0:12}의 판본·구성이 이미 정상으로 돌고 있다."
    exit 0
  fi
  say "판본·구성은 같지만 정상으로 돌고 있지 않아 다시 띄운다."
fi

# ---------- 2. 옛 api·worker를 멈추고 종료를 확인한다 ----------
pods=$(k get pod -l "$selector" -o json) || catchu_die "api·worker Pod를 조회하지 못했다"
was_running=$(jq -r '.items[] | select(any(.status.containerStatuses[]?; .state.running != null)) | .metadata.name' <<< "$pods")
existing=$(jq -r "${items} | .metadata.name | select(. == \"api\" or . == \"worker\")" <<< "$deployments")

# 실행 중인 Pod의 마지막 종료 코드를 보려고 멈추기 전에 상태 기록을 켠다. 모든 Pod가 기록에 보이기 전에 멈추면 종료 순간을 놓친다.
# 기록은 Pod마다 '이름=종료 코드' 한 줄이다(끝나기 전에는 코드가 비어 있다). kubectl 1.37.1의 감시 출력에서 확인한 두 가지 때문에
# 이 모양으로 쓴다: 출력이 TabWriter를 거쳐 탭이 공백으로 바뀌므로 탭으로 나누지 않는다(Pod 이름에는 '='이 없다).
# range … end 안에서 없는 값(아직 끝나지 않은 Pod의 종료 코드)을 만나면 다음 객체부터 템플릿 오류로 감시가 끝나므로 range를 쓰지 않는다.
in_watch() { # 상태 기록에 그 Pod가 나왔는지
  awk -F'=' -v p="$1" '$1 == p { found = 1 } END { exit !found }' "${tmp}/watch"
}
exit_code() { # 상태 기록에서 그 Pod의 마지막 종료 코드
  awk -F'=' -v p="$1" '$1 == p && $2 != "" { c = $2 } END { print c }' "${tmp}/watch"
}
if [ -n "$was_running" ]; then
  command kubectl --kubeconfig "$CATCHU_KUBECONFIG" --namespace "$namespace" get pod -l "$selector" --watch \
    -o jsonpath='{.metadata.name}{"="}{.status.containerStatuses[0].state.terminated.exitCode}{"\n"}' \
    > "${tmp}/watch" 2> /dev/null &
  watch_pid=$!
  seen=0
  for _ in $(seq 20); do
    seen=1
    for pod in $was_running; do
      in_watch "$pod" || seen=0
    done
    [ "$seen" = 1 ] && break
    sleep 0.5
  done
  [ "$seen" = 1 ] || catchu_die "옛 api·worker의 상태 기록을 시작하지 못했다"
fi

wait_gone() { # api·worker Pod가 모두 없어질 때까지 기다린다. 0 없어짐, 1 시간 초과, 2 조회 실패. 남은 Pod는 left에 둔다.
  left=''
  for _ in $(seq "$stop_tries"); do
    left=$(k get pod -l "$selector" -o name 2> /dev/null) || return 2
    [ -z "$left" ] && return 0
    sleep "$poll"
  done
  return 1
}
stop_pods() { # Deployment가 있는 api·worker를 0으로 줄이고 없어지기를 기다린다. 0 확인, 1 확인 못 함(사유는 why)
  local d names failed=''
  why=''
  names=$(k get deployment api worker --ignore-not-found -o name) || {
    why='Deployment를 조회하지 못했다'
    return 1
  }
  for d in $names; do
    k scale "$d" --replicas=0 > /dev/null || failed="${failed} ${d#*/}"
  done
  if wait_gone; then
    gone=0
  else
    gone=$?
  fi
  case $gone in
    1) why="시간 안에 없어지지 않은 Pod가 있다(${left//$'\n'/ })" ;;
    2) why='Pod를 조회하지 못했다' ;;
  esac
  [ -z "$failed" ] || why="${why:+${why}. }멈추기 명령이 실패했다(${failed# })"
  [ -z "$why" ]
}

if [ -n "$existing$was_running" ]; then
  running_list=${was_running//$'\n'/ }
  note "옛 api·worker 멈춤 시작(실행 중이던 Pod: ${running_list:-없음})"
fi
stop_pods && stopped_ok=1 || stopped_ok=0
if [ -n "$watch_pid" ]; then
  # Pod가 없어진 것을 본 뒤에도 상태 기록이 마지막 종료 코드를 늦게 받을 수 있어 10초까지 기다린다.
  if [ "$stopped_ok" = 1 ]; then
    for _ in $(seq 20); do
      seen=1
      for pod in $was_running; do
        [ -n "$(exit_code "$pod")" ] || seen=0
      done
      [ "$seen" = 1 ] && break
      sleep 0.5
    done
  fi
  kill "$watch_pid" 2> /dev/null || true
  wait "$watch_pid" 2> /dev/null || true
  watch_pid=''
fi
[ "$stopped_ok" = 1 ] || stop 3 "옛 api·worker의 종료를 확인하지 못했다: ${why}. 새 실행은 시작하지 않았다"

forced=''
unknown=''
for pod in $was_running; do
  code=$(exit_code "$pod")
  case $code in
    '') unknown="${unknown} ${pod}" ;;
    137) forced="${forced} ${pod}" ;;
  esac
  note "옛 실행 종료: ${pod} 종료 코드 ${code:-모름}"
done
[ -z "$unknown" ] || stop 3 "종료 코드를 확인하지 못한 Pod가 있다(${unknown# })${forced:+. 강제 종료(137)된 Pod도 있다(${forced# })}"
[ -z "$forced" ] || stop 7 "대기 상한 안에 끝나지 않아 강제 종료(137)된 Pod가 있다(${forced# })"
[ -z "$existing$was_running" ] || note "옛 api·worker 종료 확인"

# ---------- 3. migration 일회 Pod(같은 이름은 다시 만들지 않는다) ----------
pod_state() { # Pod JSON → "상태 종료코드 digest uid 시작 끝 대기이유"
  jq -r '[.status.phase // "-", (.status.containerStatuses[0].state.terminated.exitCode // "-" | tostring),
    (.status.containerStatuses[0].imageID // "" | split("@") | last // "" | if . == "" then "-" else . end),
    .metadata.uid // "-", .status.containerStatuses[0].state.terminated.startedAt // "-",
    .status.containerStatuses[0].state.terminated.finishedAt // "-", .status.containerStatuses[0].state.waiting.reason // "-"] | join(" ")'
}
show_logs() {
  local logs
  if logs=$(k logs "$migration_pod" --tail=20 2> /dev/null); then
    printf '%s\n' "$logs" | sed 's/^/    | /' >&2
  else
    say "migration 로그를 읽지 못했다(kubectl logs ${migration_pod})"
  fi
}

found=$(k get pod "$migration_pod" --ignore-not-found -o json) ||
  stop 5 "migration Pod ${migration_pod}를 조회하지 못했다. 새 실행은 시작하지 않았다"
if [ -n "$found" ]; then
  read -r phase code digest uid started finished waiting <<< "$(pod_state <<< "$found")"
  if [ "$phase" = Succeeded ] && [ "$code" = 0 ] && [ "$digest" = "$digest_migration" ]; then
    note "migration: ${migration_pod}가 같은 이미지로 이미 성공했다(uid ${uid}, 끝 ${finished}). 다시 실행하지 않는다"
  else
    stop 5 "같은 이름의 migration Pod ${migration_pod}가 남아 있다(상태 ${phase}, 종료 코드 ${code}, 이미지 ${digest}). 로그와 DB 적용 이력을 확인하고 직접 지운 뒤 --resume으로 다시 실행한다"
  fi
else
  k create -f "${tmp}/migration-pod.yaml" > /dev/null ||
    stop 5 "migration Pod ${migration_pod}를 만드는 요청이 실패했다. 만들어졌는지 모르므로 kubectl get pod ${migration_pod}로 확인한다"
  note "migration 시작: ${migration_pod}"
  phase=''
  for _ in $(seq "$migration_tries"); do
    state=$(k get pod "$migration_pod" -o json) || stop 5 "migration Pod ${migration_pod}의 상태를 조회하지 못했다"
    read -r phase code digest uid started finished waiting <<< "$(pod_state <<< "$state")"
    case $phase in Succeeded | Failed) break ;; esac
    sleep "$poll"
  done
  case $phase in
    Succeeded)
      note "migration 성공: ${migration_pod}(uid ${uid}, 종료 코드 ${code}, 이미지 ${digest}, 시작 ${started}, 끝 ${finished})"
      show_logs
      ;;
    Failed)
      show_logs
      stop 4 "migration 실패: ${migration_pod}(종료 코드 ${code}). Pod를 남겨 두었다. 로그와 DB 적용 이력을 확인하기 전에는 다시 실행하지 않는다"
      ;;
    *) stop 5 "migration Pod ${migration_pod}가 시간 안에 끝나지 않았다(상태 ${phase:-모름}, 대기 이유 ${waiting:--}). Secret·ConfigMap·이미지가 없으면 대기에 머문다. 실행 상태와 DB 적용 이력을 확인한다" ;;
  esac
fi

# ---------- 4. 새 api → worker → web을 띄우고 확인한다 ----------
start_failed() { # 사유
  say "새 실행 확인 실패: $*. api·worker를 다시 멈춘다"
  if stop_pods; then
    stop 6 "$*. api·worker를 다시 멈추고 종료를 확인했다"
  fi
  stop 3 "$*. 그 뒤 api·worker를 다시 멈추지 못했다: ${why}"
}
for name in api worker web; do
  k apply -f "${tmp}/${name}.yaml" > /dev/null || start_failed "${name} 실행 파일을 적용하지 못했다"
  k rollout status "deployment/${name}" --timeout="$rollout_timeout" > /dev/null ||
    start_failed "${name}이(가) ${rollout_timeout} 안에 준비되지 않았다"
  note "${name} 준비"
done
final=$(k get deployment api worker web -o json) || start_failed "세 서비스의 상태를 조회하지 못했다"
healthy <<< "$final" || start_failed "세 서비스가 모두 1개 실행·준비 상태가 아니다"

note "교체 완료"
printf '교체 기록(커밋 %s)\n%s' "$commit" "$record" >&2
