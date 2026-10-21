#!/usr/bin/env bash
# deploy.sh 회귀 시험과 쿠버네티스 실행 파일 조건 검사(#276). 실제 클러스터·AWS에는 닿지 않는다.
# - deploy.sh: kubectl·aws·sleep을 합성 명령으로 바꾸고, 지금 작업 폴더의 deploy.sh·guard.sh·k8s/를 담은 합성 git 저장소에서 실제로 실행한다.
#   합성 kubectl은 Deployment·Pod·migration Pod·동의 기록 확인 Pod 상태를 파일로 흉내 내고, 바꾸는 호출(scale·create·apply·rollout)을 순서대로 남긴다.
#   동의 기록 확인 Pod 안의 SQL은 여기서 보지 않는다(db-roles.test.sh가 실제 PostgreSQL에서 본다).
# - 실행 파일: deploy.sh가 자리를 채워 적용한 Deployment·migration Pod·동의 기록 확인 Pod와 손으로 적용하는 파일을 Ruby(YAML→JSON)·jq로 읽어 조건을 본다.
# 확인하지 못하는 것: 실제 API 서버의 스키마·승인 검사(Pod 보안 검사 restricted 포함), 노드에서의 실제 종료 코드와
# 준비 시간, NetworkPolicy·ALB의 실제 동작. 이것은 2단계 실제 클러스터에서 본다(deploy/aws/k8s/README.md).
# 필요한 것: bash·jq·git·ruby. 사용: bash deploy/aws/scripts/deploy.test.sh   (실패가 하나라도 있으면 종료 코드 1)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
for tool in jq git ruby shasum; do
  command -v "$tool" > /dev/null || { echo "${tool}이(가) 없어 시험할 수 없다" >&2; exit 1; }
done
REAL_SLEEP=$(command -v sleep)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN=$WORK/bin
S=$WORK/state
OUT=$WORK/out.log
REPO=$WORK/repo
ACCOUNT=123456789012
pass=0
fail=0

# ---------- 합성 저장소: 지금 작업 폴더의 파일로 커밋을 만든다 ----------
g() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }
mkdir -p "$REPO/deploy/aws/scripts/lib" "$REPO/deploy/aws/k8s"
cp "$HERE/deploy.sh" "$REPO/deploy/aws/scripts/"
cp "$HERE/lib/guard.sh" "$REPO/deploy/aws/scripts/lib/"
cp "$HERE/../k8s/"*.yaml "$REPO/deploy/aws/k8s/"
g init -q
g add -A
g commit -q -m base
C1=$(g rev-parse HEAD)
sed 's/__COMMIT__/__UNKNOWN__/' "$REPO/deploy/aws/k8s/api.yaml" > "$REPO/deploy/aws/k8s/api.yaml.new"
mv "$REPO/deploy/aws/k8s/api.yaml.new" "$REPO/deploy/aws/k8s/api.yaml"
g commit -q -am placeholder
C2=$(g rev-parse HEAD)
g checkout -q "$C1"
g rm -q deploy/aws/k8s/web.yaml
g commit -q -m no-web
C3=$(g rev-parse HEAD)
g checkout -q "$C1"
g rm -q deploy/aws/k8s/consent-guard-pod.yaml
g commit -q -m no-consent-guard
C4=$(g rev-parse HEAD)
g checkout -q "$C1"
digest_of() { printf 'sha256:%s' "$(printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1)"; }
MIG=catchu-migrate-${C1:0:12}

# ---------- 합성 aws·kubectl·sleep ----------
mkdir -p "$BIN"
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
# 합성 aws. --profile·--region을 빼고 서비스·동작으로 정해 둔 값을 돌려준다.
S=${STUB_STATE:?}
args=() skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case $a in --profile | --region) skip=1; continue ;; esac
  args+=("$a")
done
set -- "${args[@]}"
[ "$1" = --version ] && { echo "aws-cli/2.28.11 Python/3.13.4 Darwin/27.0.0 source/arm64"; exit 0; }
printf '%s %s\n' "$1" "$2" >> "$S/aws-seen"
value_of() { # 옵션 이름 → 다음 인자
  local want=$1 prev=''
  shift
  for a in "$@"; do [ "$prev" = "$want" ] && { printf '%s' "$a"; return; }; prev=$a; done
}
case "$1 $2" in
  "sts get-caller-identity") echo 123456789012 ;;
  "eks describe-cluster") echo https://SYNTHETIC.eks.example ;;
  "ecr describe-repositories") echo "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/$(value_of --repository-names "$@")" ;;
  "ecr describe-images")
    repo=$(value_of --repository-name "$@")
    printf '%s %s\n' "$repo" "$(value_of --image-ids "$@")" >> "$S/tags"
    if [ "$repo" = "${STUB_NO_IMAGE:-}" ]; then
      echo "An error occurred (ImageNotFoundException) when calling the DescribeImages operation: synthetic" >&2
      exit 254
    fi
    printf 'sha256:%s\n' "$(printf '%s' "$repo" | shasum -a 256 | cut -d' ' -f1)" ;;
  *) echo "합성 aws: 정해 두지 않은 호출 $1 $2" >&2; printf 'aws %s %s\n' "$1" "$2" >> "$S/unknown"; exit 253 ;;
esac
EOF
cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
# 합성 kubectl. --kubeconfig·--namespace를 빼고 동작을 찾아 $STUB_STATE의 상태 파일로 답한다. 바꾸는 호출은 calls에 남긴다.
S=${STUB_STATE:?}
args=()
while [ "$#" -gt 0 ]; do
  case $1 in
    --kubeconfig | --namespace) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- "${args[@]}"
call() { printf '%s\n' "$*" >> "$S/calls"; }
has() { case " ${2:-} " in *" $1 "*) return 0 ;; esac; return 1; }
deployments() { # 이름… → Deployment 목록 JSON. 시작한 뒤(apply 뒤)에는 STUB_FINAL_UNREADY, 그 전에는 STUB_UNREADY가 준비 안 됨이다.
  local n r ready items='' unready=${STUB_UNREADY:-}
  ls "$S"/applied-* > /dev/null 2>&1 && unready=${STUB_FINAL_UNREADY:-}
  for n in "$@"; do
    [ -f "$S/deploy-$n" ] || continue
    r=$(cat "$S/deploy-$n")
    ready=$r
    has "$n" "$unready" && ready=0
    items="${items}${items:+,}{\"kind\":\"Deployment\",\"metadata\":{\"name\":\"$n\",\"generation\":2},\"spec\":{\"replicas\":$r},\"status\":{\"observedGeneration\":2,\"replicas\":$r,\"readyReplicas\":$ready,\"availableReplicas\":$ready,\"updatedReplicas\":$ready}}"
  done
  printf '{"kind":"List","items":[%s]}\n' "$items"
}
pods() {
  local name state items='' st
  while IFS=$'\t' read -r name state; do
    [ -n "$name" ] || continue
    st='{"waiting":{"reason":"CrashLoopBackOff"}}'
    [ "$state" = running ] && st='{"running":{}}'
    items="${items}${items:+,}{\"metadata\":{\"name\":\"$name\"},\"status\":{\"containerStatuses\":[{\"state\":$st}]}}"
  done < "$S/pods"
  printf '{"kind":"List","items":[%s]}\n' "$items"
}
migration_pod() {
  local phase code digest terminated=''
  phase=$(cat "$S/mig-phase") code=$(cat "$S/mig-code") digest=$(cat "$S/mig-digest")
  [ -n "$code" ] && terminated=",\"state\":{\"terminated\":{\"exitCode\":$code,\"startedAt\":\"2026-11-10T01:00:00Z\",\"finishedAt\":\"2026-11-10T01:00:20Z\"}}"
  [ -z "$code" ] && [ -n "${STUB_MIG_WAITING:-}" ] && terminated=",\"state\":{\"waiting\":{\"reason\":\"$STUB_MIG_WAITING\"}}"
  printf '{"metadata":{"name":"%s","uid":"0000-uid"},"status":{"phase":"%s","containerStatuses":[{"imageID":"123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/catchu-api-migration@%s"%s}]}}\n' \
    "$(cat "$S/mig-name")" "$phase" "$digest" "$terminated"
}
guard_pod() {
  local code terminated=''
  code=$(cat "$S/guard-code")
  [ -n "$code" ] && terminated=",\"state\":{\"terminated\":{\"exitCode\":$code,\"startedAt\":\"2026-11-10T01:01:00Z\",\"finishedAt\":\"2026-11-10T01:01:02Z\"}}"
  printf '{"metadata":{"name":"%s","uid":"1111-uid"},"status":{"phase":"%s","containerStatuses":[{"imageID":"docker.io/library/postgres@sha256:%s"%s}]}}\n' \
    "$(cat "$S/guard-name")" "$(cat "$S/guard-phase")" "$(printf '1%.0s' $(seq 64))" "$terminated"
}
watch_line() { # 템플릿 이름 종료코드 → 실제 kubectl 1.37.1의 감시 출력 한 줄
  # 그 판본을 이 컴퓨터의 가짜 API에 붙여 확인한 동작을 흉내 낸다: 감시 출력은 TabWriter를 거쳐 탭이 공백(간격 3)으로 바뀐다.
  # 흉내 내지 않는 식이 남으면 실패한다(새 식을 쓰면 실제 출력을 먼저 확인하고 여기에 더한다).
  local out=$1
  out=${out//'{.metadata.name}'/$2}
  out=${out//'{.status.containerStatuses[0].state.terminated.exitCode}'/$3}
  out=${out//'{"\n"}'/$'\n'}
  out=${out//'{"\t"}'/$'\t'}
  out=${out//'{"="}'/=}
  case $out in *'{'*) echo "합성 kubectl: 흉내 내지 않는 jsonpath 식 $1" >&2; printf 'kubectl watch %s\n' "$1" >> "$S/unknown"; exit 99 ;; esac
  printf '%s' "${out//$'\t'/   }"
}
watch_pods() { # 템플릿 — 처음 Pod 목록을 찍고, 멈추기(scale) 뒤에는 STUB_EXIT의 종료 코드를 찍는다.
  [ "${STUB_WATCH_SILENT:-0}" = 1 ] && exec "$STUB_REAL_SLEEP" 20
  local name state pair
  while IFS=$'\t' read -r name state; do
    [ -n "$name" ] || continue
    # 실제 kubectl은 range … end 안에서 없는 값을 만나면 첫 객체만 찍고 다음 객체부터 템플릿 오류로 끝난다.
    case $1 in *'{range'*) printf '%s\n' "$name"; echo "error: Error executing template: not in range, nothing to end" >&2; exit 1 ;; esac
    watch_line "$1" "$name" ''
  done < "$S/pods.start"
  for _ in $(seq 400); do [ -f "$S/scaled" ] && break; "$STUB_REAL_SLEEP" 0.01; done
  # STUB_WATCH_LATE=1: 목록 조회에서 Pod가 없어진 것이 보인 뒤에야 마지막 종료 코드를 찍는다(감시 기록이 늦게 도착하는 경우).
  if [ "${STUB_WATCH_LATE:-0}" = 1 ]; then
    for _ in $(seq 400); do [ -f "$S/gone-seen" ] && break; "$STUB_REAL_SLEEP" 0.01; done
    "$STUB_REAL_SLEEP" 0.3
  fi
  for pair in ${STUB_EXIT:-}; do watch_line "$1" "${pair%%=*}" "${pair#*=}"; done
  exec "$STUB_REAL_SLEEP" 20
}
case "$*" in
  "config view"*) echo "${STUB_SERVER:-https://SYNTHETIC.eks.example}" ;;
  "version --client -o json") echo '{"clientVersion":{"gitVersion":"v1.37.1"}}' ;;
  "get networkpolicy default-deny -o name")
    [ "${STUB_NO_NETPOL:-0}" = 1 ] && { echo 'Error from server (NotFound): synthetic' >&2; exit 1; }
    echo networkpolicy.networking.k8s.io/default-deny ;;
  "get configmap catchu-db -o json")
    [ "${STUB_NO_CONFIGMAP:-0}" = 1 ] && { echo 'Error from server (NotFound): synthetic' >&2; exit 1; }
    ca='"ca.pem":"-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----\n"'
    [ "${STUB_CONFIGMAP_NO_CA:-0}" = 1 ] && ca='"other":"x"'
    printf '{"kind":"ConfigMap","metadata":{"name":"catchu-db"},"data":{"DB_HOST":"catchu-db.synthetic.ap-northeast-2.rds.amazonaws.com",%s}}\n' "$ca" ;;
  "get deployment api worker web --ignore-not-found -o json" | "get deployment api worker web -o json") deployments api worker web ;;
  "get deployment api worker --ignore-not-found -o name")
    for n in api worker; do [ -f "$S/deploy-$n" ] && echo "deployment.apps/$n"; done ;;
  "diff -f "*) [ "${STUB_DIFF:-1}" = 1 ] && echo "synthetic diff"; exit "${STUB_DIFF:-1}" ;;
  "get pod -l app.kubernetes.io/name in (api,worker) -o json") pods ;;
  "get pod -l app.kubernetes.io/name in (api,worker) --watch -o jsonpath="*) last=${*: -1}; watch_pods "${last#jsonpath=}" ;;
  "get pod -l app.kubernetes.io/name in (api,worker) -o name")
    [ -s "$S/pods" ] || touch "$S/gone-seen"
    while IFS=$'\t' read -r name _; do [ -n "$name" ] && echo "pod/$name"; done < "$S/pods" ;;
  "scale deployment.apps/"*" --replicas=0")
    # STUB_SCALE_FAIL: always 늘 실패, after-start 새 실행을 적용한 뒤에만 실패, reported 적용은 됐는데 실패 응답
    n=${2#deployment.apps/}
    if [ "${STUB_SCALE_FAIL:-}" = always ] || { [ "${STUB_SCALE_FAIL:-}" = after-start ] && [ -f "$S/applied-api.yaml" ]; }; then
      call "scale $n 실패"
      echo "error: synthetic scale failure" >&2
      exit 1
    fi
    call "scale $n 0"
    echo 0 > "$S/deploy-$n"
    touch "$S/scaled"
    if [ "${STUB_STUCK:-0}" != 1 ]; then
      grep -v "^$n-" "$S/pods" > "$S/pods.tmp"
      mv "$S/pods.tmp" "$S/pods"
    fi
    [ "${STUB_SCALE_FAIL:-}" = reported ] && { echo "error: synthetic connection reset" >&2; exit 1; } ;;
  "get pod catchu-migrate-"*" --ignore-not-found -o json") [ -f "$S/mig-phase" ] && migration_pod ;;
  "get pod catchu-migrate-"*" -o json")
    [ -f "$S/mig-phase" ] || { echo 'Error from server (NotFound): synthetic' >&2; exit 1; }
    migration_pod ;;
  "create -f "*)
    if grep -q '^    app.kubernetes.io/component: consent-guard$' "$3"; then
      # 동의 기록 확인 Pod. STUB_GUARD_RESULT: Succeeded(기본)·Failed(회수 뒤에도 권한이 남음)·Pending(끝나지 않음)
      [ "${STUB_GUARD_CREATE_FAIL:-0}" = 1 ] && { call "create consent-guard 실패"; echo "error: synthetic timeout" >&2; exit 1; }
      cp "$3" "$S/guard.yaml"
      call "create consent-guard"
      awk '/^  name: / { print $2; exit }' "$3" > "$S/guard-name"
      result=${STUB_GUARD_RESULT:-Succeeded}
      echo "$result" > "$S/guard-phase"
      case $result in Succeeded) echo 0 ;; Failed) echo 1 ;; *) echo '' ;; esac > "$S/guard-code"
      exit 0
    fi
    [ "${STUB_CREATE_FAIL:-0}" = 1 ] && { call "create 실패"; echo "error: synthetic timeout" >&2; exit 1; }
    cp "$3" "$S/created.yaml"
    call "create migration"
    awk '/^  name: / { print $2; exit }' "$3" > "$S/mig-name"
    sed -n 's/.*@\(sha256:[0-9a-f]*\).*/\1/p' "$3" > "$S/mig-digest"
    result=${STUB_MIG_RESULT:-Succeeded}
    echo "$result" > "$S/mig-phase"
    case $result in Succeeded) echo 0 ;; Failed) echo 1 ;; *) echo '' ;; esac > "$S/mig-code" ;;
  "logs catchu-migrate-"*" --tail=20") printf 'query: SELECT * FROM "migrations"\nMigration Synthetic1790500000000 has been executed successfully.\n' ;;
  "get pod catchu-consent-guard-"*" -o json")
    [ -f "$S/guard-phase" ] || { echo 'Error from server (NotFound): synthetic' >&2; exit 1; }
    guard_pod ;;
  "logs catchu-consent-guard-"*" --tail=20")
    case $(cat "$S/guard-phase") in
      Succeeded) echo 'NOTICE:  동의 기록 직접 삭제 권한(catchu_app): 회수 전 있음, 회수 뒤 없음' ;;
      Failed) echo 'ERROR:  동의 기록 직접 삭제 권한(catchu_app)이 회수 뒤에도 남아 있다(회수 전 있음). PUBLIC이나 다른 역할에서 받은 권한인지 본다' ;;
    esac ;;
  "apply -f "*)
    n=$(basename "$3" .yaml)
    has "$n" "${STUB_APPLY_FAIL:-}" && { call "apply $n 실패"; echo "error: synthetic" >&2; exit 1; }
    cp "$3" "$S/applied-$n.yaml"
    call "apply $n"
    echo 1 > "$S/deploy-$n"
    case $n in api | worker) printf '%s-new\trunning\n' "$n" >> "$S/pods" ;; esac ;;
  "rollout status deployment/"*)
    n=${3#deployment/}
    call "rollout $n"
    has "$n" "${STUB_ROLLOUT_FAIL:-}" && { echo "error: timed out waiting for the condition" >&2; exit 1; }
    exit 0 ;;
  *) echo "합성 kubectl: 정해 두지 않은 호출 $*" >&2; printf 'kubectl %s\n' "$*" >> "$S/unknown"; exit 99 ;;
esac
exit 0
EOF
cat > "$BIN/sleep" <<'EOF'
#!/usr/bin/env bash
printf 'sleep %s\n' "$*" >> "${STUB_STATE:?}/sleeps"
case $1 in 0.5) "$STUB_REAL_SLEEP" 0.05 ;; *) "$STUB_REAL_SLEEP" 0.002 ;; esac
EOF
chmod +x "$BIN/aws" "$BIN/kubectl" "$BIN/sleep"

# ---------- 실행 도우미 ----------
reset_state() { # STUB_*=값 … : Deployment·Pod·남은 migration Pod의 처음 상태를 파일로 만든다.
  local kv n r pod state
  rm -rf "$S" "$WORK/home" "$WORK/tmp"
  mkdir -p "$S" "$WORK/home/.kube" "$WORK/tmp"
  : > "$S/calls"
  : > "$S/pods"
  : > "$WORK/home/.kube/catchu"
  for kv in "$@"; do
    case $kv in
      STUB_DEPLOYS=*) for n in ${kv#*=}; do echo "${n#*=}" > "$S/deploy-${n%%=*}"; done ;;
      STUB_PODS=*) for pod in ${kv#*=}; do printf '%s\t%s\n' "${pod%%:*}" "${pod#*:}" >> "$S/pods"; done ;;
      STUB_MIG_EXISTING=*)
        IFS=: read -r state r n <<< "${kv#*=}"
        echo "$MIG" > "$S/mig-name"
        echo "$state" > "$S/mig-phase"
        echo "$r" > "$S/mig-code"
        if [ "$n" = same ]; then digest_of catchu-api-migration > "$S/mig-digest"; else echo "$n" > "$S/mig-digest"; fi ;;
    esac
  done
  cp "$S/pods" "$S/pods.start"
}
run_sut() { # [STUB_*=값 …] deploy.sh 인자…
  local envs=()
  while [ "$#" -gt 0 ]; do
    case $1 in STUB_* | CATCHU_* | AWS_* | KUBECONFIG=*) envs+=("$1"); shift ;; *) break ;; esac
  done
  reset_state ${envs[@]+"${envs[@]}"}
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_SECURITY_TOKEN -u AWS_PROFILE -u AWS_REGION \
    -u AWS_DEFAULT_REGION -u KUBECONFIG PATH="$BIN:$PATH" HOME="$WORK/home" TMPDIR="$WORK/tmp" STUB_STATE="$S" \
    STUB_REAL_SLEEP="$REAL_SLEEP" CATCHU_EXPECTED_ACCOUNT=$ACCOUNT ${envs[@]+"${envs[@]}"} \
    bash "$REPO/deploy/aws/scripts/deploy.sh" "$@" > "$OUT" 2>&1
  rc=$?
}
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "통과: $1"; else fail=$((fail + 1)); echo "실패: $1"; sed 's/^/    | /' "$OUT"; fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }
calls() { tr '\n' ',' < "$S/calls"; }
clean() { # 알 수 없는 호출이 없고, 계정 번호가 출력에 없고, 임시 파일이 남지 않았다
  [ ! -s "$S/unknown" ] && ! grep -q "$ACCOUNT" "$OUT" && [ -z "$(ls -A "$WORK/tmp")" ]
}
says() { grep -qF -- "$1" "$OUT"; }
REPLACE="STUB_DEPLOYS=api=1 worker=1 web=1"
RUNNING="STUB_PODS=api-old:running worker-old:running"
GUARD='create consent-guard,'
START='apply api,rollout api,apply worker,rollout worker,apply web,rollout web,'

# ---------- 처음 설치와 교체 ----------
run_sut --commit "$C1"
check "처음 설치: 종료 0, migration → api → worker → web 순서, 멈추기 없음" \
  "$(ok test "$rc" = 0 -a "$(calls)" = "create migration,${GUARD}${START}")"
check "처음 설치: migration Pod 이름은 커밋 앞 12자, 이미지는 그 커밋 태그의 digest" \
  "$( { says "migration 성공: ${MIG}" && test "$(cat "$S/mig-name")" = "$MIG" && test "$(cat "$S/mig-digest")" = "$(digest_of catchu-api-migration)"; } > /dev/null 2>&1; echo $?)"
check "처음 설치: 알 수 없는 호출·계정 번호 출력·남은 임시 파일 없음" "$(ok clean)"
check "처음 설치: 네 저장소 모두 태그 main-<커밋 앞 12자>로 찾음" \
  "$(ok test "$(awk '{ print $2 }' "$S/tags" | sort -u)" = "imageTag=main-${C1:0:12}" -a "$(awk '{ print $1 }' "$S/tags" | sort | tr '\n' ' ')" = "catchu-api catchu-api-migration catchu-web catchu-worker ")"
check "처음 설치: 기록에 클러스터·namespace·대상 DB를 남김" "$(ok says '대상: 클러스터 catchu, namespace catchu, DB catchu-db.synthetic.ap-northeast-2.rds.amazonaws.com')"
for n in api worker web; do
  want="image: ${ACCOUNT}.dkr.ecr.ap-northeast-2.amazonaws.com/catchu-${n}@$(digest_of "catchu-${n}")"
  check "적용한 ${n}: 그 커밋 태그의 digest·실행 수 1·커밋 표식, 남은 자리 없음" \
    "$( { grep -qxF "          ${want}" "$S/applied-${n}.yaml" && grep -qx '  replicas: 1' "$S/applied-${n}.yaml" \
      && grep -qF "catchu.io/source-revision: ${C1}" "$S/applied-${n}.yaml" && ! grep -q '__[A-Z]' "$S/applied-${n}.yaml"; } > /dev/null 2>&1; echo $?)"
done
check "처음 설치: 동의 기록 확인 Pod 이름은 catchu-consent-guard-<UTC 시각>, 커밋 표식, 남은 자리 없음" \
  "$( { grep -qE '^catchu-consent-guard-[0-9]{8}-[0-9]{6}$' "$S/guard-name" && grep -qF "catchu.io/source-revision: ${C1}" "$S/guard.yaml" \
    && ! grep -q '__[A-Z]' "$S/guard.yaml"; } > /dev/null 2>&1; echo $?)"
in_record() { awk -v s="$1" 'f && index($0, s) { found = 1 } /^교체 기록\(커밋/ { f = 1 } END { exit !found }' "$OUT"; }
check "처음 설치: 교체 기록에 동의 기록 직접 삭제 권한 결과 줄을 남김(#276 증거)" \
  "$(ok in_record '동의 기록 직접 삭제 권한(catchu_app): 회수 전 있음, 회수 뒤 없음')"
cp "$S"/applied-*.yaml "$S/created.yaml" "$WORK/"
cp "$S/guard.yaml" "$WORK/guard.yaml"

run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=143 worker-old=0" --commit "$C1"
check "교체: 옛 api·worker를 멈춘 뒤 migration, 그다음 새 실행" \
  "$(ok test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}")"
check "교체: 옛 실행의 종료 코드(143·0)를 기록에 남김" "$( { says 'api-old 종료 코드 143' && says 'worker-old 종료 코드 0' && says '교체 기록'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=143 worker-old=0" STUB_WATCH_LATE=1 --commit "$C1"
check "교체: 마지막 종료 코드가 Pod가 없어진 뒤에 늦게 와도 기다려 받음" "$(ok test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}")"

run_sut "$REPLACE" STUB_PODS="api-old:waiting worker-old:running" STUB_EXIT="worker-old=0" --commit "$C1"
check "교체: 실행 중이 아니던 Pod(재시작 대기)는 종료 코드 없이 지워지기만 확인" "$(ok test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}")"

run_sut "$REPLACE" STUB_DIFF=0 --commit "$C1"
check "같은 판본·구성이 정상으로 돌면 아무것도 바꾸지 않음" "$(ok test "$rc" = 0 -a -z "$(calls)" -a "$(grep -c '바꿀 것 없음' "$OUT")" = 1)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_DIFF=0 STUB_UNREADY=worker --commit "$C1"
check "같은 구성이어도 정상이 아니면 다시 띄움" "$(ok test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}")"

# ---------- 시작 전 확인(아무것도 바꾸지 않음, 종료 코드 2) ----------
untouched() { test "$rc" = 2 -a -z "$(calls)"; }
run_sut STUB_DEPLOYS="api=0 worker=0 web=1" --commit "$C1"
check "api·worker가 0으로 멈춰 있으면 --resume 없이는 멈춤" "$( { untouched && says '--resume'; } > /dev/null 2>&1; echo $?)"
run_sut STUB_DEPLOYS="api=0 worker=0 web=1" --commit "$C1" --resume
check "--resume이면 이어서 교체" "$(ok test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}")"
run_sut STUB_NO_NETPOL=1 --commit "$C1"
check "기본 차단 NetworkPolicy가 없으면 멈춤" "$(ok untouched)"
run_sut STUB_NO_CONFIGMAP=1 --commit "$C1"
check "ConfigMap catchu-db가 없으면 멈춤" "$(ok untouched)"
run_sut STUB_CONFIGMAP_NO_CA=1 --commit "$C1"
check "ConfigMap catchu-db에 CA 파일 값이 없으면 멈춤" "$(ok untouched)"
run_sut STUB_NO_IMAGE=catchu-worker --commit "$C1"
check "ECR에 그 커밋 태그 이미지가 하나라도 없으면 멈춤" "$( { untouched && test ! -s "$S/unknown"; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" STUB_DIFF=2 --commit "$C1"
check "지금 상태와 비교하지 못하면 멈춤" "$(ok untouched)"
run_sut "$REPLACE" "$RUNNING" STUB_WATCH_SILENT=1 --commit "$C1"
check "옛 실행의 상태 기록을 시작하지 못하면 멈추기 전에 멈춤" "$(ok untouched)"
run_sut --commit "${C1:0:12}"
check "커밋이 40자가 아니면 멈춤" "$(ok untouched)"
run_sut
check "--commit이 없으면 멈춤" "$(ok untouched)"
run_sut --commit 0123456789abcdef0123456789abcdef01234567
check "저장소에 없는 커밋이면 멈춤" "$(ok untouched)"
run_sut --commit "$C2"
check "실행 파일에 채우지 않은 자리가 있으면 멈춤" "$( { untouched && says '채우지 않은 자리'; } > /dev/null 2>&1; echo $?)"
run_sut --commit "$C3"
check "그 커밋에 실행 파일이 없으면 멈춤" "$(ok untouched)"
run_sut CATCHU_EXPECTED_ACCOUNT=999999999999 --commit "$C1"
check "계정이 다르면 계정 조회 말고는 아무것도 하지 않고 멈추며 번호를 찍지 않음" \
  "$( { untouched && test "$(sort -u "$S/aws-seen")" = 'sts get-caller-identity' && test "$(grep -c -E '123456789012|999999999999' "$OUT")" = 0; } > /dev/null 2>&1; echo $?)"
run_sut STUB_SERVER=https://OTHER.example --commit "$C1"
check "kubeconfig가 다른 클러스터를 가리키면 멈춤" "$(ok untouched)"

# ---------- 옛 실행의 종료 확인(3·7) ----------
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=143 worker-old=137" --commit "$C1"
check "옛 worker가 강제 종료(137)됐으면 7, migration·새 실행 없음" "$(ok test "$rc" = 7 -a "$(calls)" = "scale api 0,scale worker 0,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=143" --commit "$C1"
check "종료 코드를 모르는 Pod가 있으면 3" "$( { test "$rc" = 3 -a "$(calls)" = "scale api 0,scale worker 0," && says 'worker-old'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=137" --commit "$C1"
check "종료 코드를 모르는 Pod와 강제 종료가 겹치면 3이고 137도 적음" "$( { test "$rc" = 3 && says '강제 종료(137)된 Pod도'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_STUCK=1 --commit "$C1"
check "옛 Pod가 시간 안에 없어지지 않으면 3(강제로 지우지 않음)" "$( { test "$rc" = 3 -a "$(calls)" = "scale api 0,scale worker 0," && test "$(grep -c '^sleep 3$' "$S/sleeps")" = 30; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_SCALE_FAIL=always --commit "$C1"
check "멈추기 명령이 실패하면 3" "$(ok test "$rc" = 3 -a "$(calls)" = "scale api 실패,scale worker 실패,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_SCALE_FAIL=reported --commit "$C1"
check "멈추기 명령이 실패로 끝났으면 Pod가 없어졌어도 3" "$( { test "$rc" = 3 -a "$(calls)" = "scale api 0,scale worker 0," && says '멈추기 명령이 실패했다'; } > /dev/null 2>&1; echo $?)"

# ---------- migration(4·5) ----------
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_MIG_RESULT=Failed --commit "$C1"
check "migration 실패면 4, Pod를 지우지 않고 새 실행 없음, 로그를 보여 줌" \
  "$( { test "$rc" = 4 -a "$(calls)" = "scale api 0,scale worker 0,create migration," && says 'executed successfully'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_CREATE_FAIL=1 --commit "$C1"
check "migration Pod를 만드는 요청이 실패하면 5(결과 불명), 새 실행 없음" "$(ok test "$rc" = 5 -a "$(calls)" = "scale api 0,scale worker 0,create 실패,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_MIG_RESULT=Pending STUB_MIG_WAITING=CreateContainerConfigError --commit "$C1"
check "migration이 시간 안에 끝나지 않으면 5, 대기 이유를 알려 줌" "$( { test "$rc" = 5 -a "$(calls)" = "scale api 0,scale worker 0,create migration," && test "$(grep -c '^sleep 3$' "$S/sleeps")" = 220 && says '대기 이유 CreateContainerConfigError'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_MIG_EXISTING=Succeeded:0:same --commit "$C1"
check "같은 이름 migration Pod가 같은 이미지로 성공해 있으면 다시 만들지 않고 진행" \
  "$( { test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,${GUARD}${START}" && says '다시 실행하지 않는다'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_MIG_EXISTING=Failed:1:same --commit "$C1"
check "같은 이름 migration Pod가 실패 상태로 남아 있으면 5, 다시 만들지 않음" "$(ok test "$rc" = 5 -a "$(calls)" = "scale api 0,scale worker 0,")"
other=sha256:$(printf '0%.0s' $(seq 64))
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_MIG_EXISTING="Succeeded:0:${other}" --commit "$C1"
check "같은 이름 migration Pod가 다른 이미지로 성공해 있으면 5" "$(ok test "$rc" = 5 -a "$(calls)" = "scale api 0,scale worker 0,")"

# ---------- 동의 기록 삭제 권한 확인(8) ----------
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_GUARD_RESULT=Failed --commit "$C1"
check "동의 기록 삭제 권한이 회수 뒤에도 남으면(확인 Pod 실패) 8, 새 실행 없음, psql 출력을 보여 줌" \
  "$( { test "$rc" = 8 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}" && says '회수 뒤에도 남아 있다'; } > /dev/null 2>&1; echo $?)"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_GUARD_CREATE_FAIL=1 --commit "$C1"
check "동의 기록 확인 Pod를 만드는 요청이 실패하면 8, 새 실행 없음" \
  "$( { test "$rc" = 8 -a "$(calls)" = "scale api 0,scale worker 0,create migration,create consent-guard 실패," && grep -qE '멈춤\(8\): .*만드는 요청이 실패했다' "$OUT"; } > /dev/null 2>&1; echo $?)"
run_sut STUB_GUARD_RESULT=Pending --commit "$C1"
check "동의 기록 확인이 시간 안에 끝나지 않으면 8, 새 실행 없음" \
  "$(ok test "$rc" = 8 -a "$(calls)" = "create migration,${GUARD}" -a "$(grep -c '^sleep 3$' "$S/sleeps")" = 120)"
run_sut STUB_DEPLOYS="api=0 worker=0 web=1" STUB_MIG_EXISTING=Succeeded:0:same --commit "$C1" --resume
check "8로 멈춘 뒤 --resume: migration은 건너뛰고 새 확인 Pod로 다시 확인한 뒤 새 실행" \
  "$( { test "$rc" = 0 -a "$(calls)" = "scale api 0,scale worker 0,${GUARD}${START}" && says '동의 기록 삭제 권한 확인 성공'; } > /dev/null 2>&1; echo $?)"
run_sut --commit "$C4"
check "배포할 커밋에 확인 Pod 틀이 없으면(작업 폴더에 있어도) 아무것도 바꾸지 않고 멈춤" \
  "$( { untouched && says 'consent-guard-pod.yaml'; } > /dev/null 2>&1; echo $?)"

# ---------- 새 실행 확인(6, 다시 멈추기 실패는 3) ----------
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_ROLLOUT_FAIL=api --commit "$C1"
check "새 api가 준비되지 않으면 api·worker를 다시 멈추고 6, worker·web은 띄우지 않음" \
  "$(ok test "$rc" = 6 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}apply api,rollout api,scale api 0,scale worker 0,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_ROLLOUT_FAIL=web --commit "$C1"
check "새 web이 준비되지 않아도 api·worker를 다시 멈추고 6" \
  "$(ok test "$rc" = 6 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}scale api 0,scale worker 0,")"
run_sut STUB_APPLY_FAIL=worker --commit "$C1"
check "처음 설치에서 worker 적용이 실패하면 띄운 api를 다시 멈추고 6" \
  "$(ok test "$rc" = 6 -a "$(calls)" = "create migration,${GUARD}apply api,rollout api,apply worker 실패,scale api 0,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_FINAL_UNREADY=worker --commit "$C1"
check "마지막 확인에서 하나라도 준비 상태가 아니면 6" "$(ok test "$rc" = 6 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}${START}scale api 0,scale worker 0,")"
run_sut "$REPLACE" "$RUNNING" STUB_EXIT="api-old=0 worker-old=0" STUB_ROLLOUT_FAIL=api STUB_SCALE_FAIL=after-start --commit "$C1"
check "새 실행 실패 뒤 다시 멈추기도 실패하면 3" "$(ok test "$rc" = 3 -a "$(calls)" = "scale api 0,scale worker 0,create migration,${GUARD}apply api,rollout api,scale api 실패,scale worker 실패,")"

# ---------- 쿠버네티스 실행 파일 조건 ----------
# 처음 설치 시험에서 deploy.sh가 자리를 채워 적용한 파일(api·worker·web·migration)과, 손으로 적용하는 파일을 읽는다.
json() { ruby -ryaml -rjson -e 'puts JSON.generate(YAML.load_stream(STDIN.read).compact)' < "$1"; }
K8S=$HERE/../k8s
q() { # 파일 jq식 — 결과가 true여야 통과
  : > "$OUT"
  json "$1" | jq -e "$2" > /dev/null 2>> "$OUT"
}
POD='(if .kind == "Pod" then .spec else .spec.template.spec end)'
for f in api worker web created guard; do
  file=$WORK/$f.yaml
  uid=1000
  case $f in created) ;; guard) uid=999 ;; *) file=$WORK/applied-$f.yaml ;; esac
  check "실행 파일 ${f}: root 아님(UID ${uid})·seccomp·토큰 자동 탑재 끔·Service 환경변수 끔·호스트 망 없음" \
    "$(ok q "$file" ".[0] | ${POD} | .securityContext.runAsNonRoot == true and .securityContext.runAsUser == ${uid}
      and .securityContext.seccompProfile.type == \"RuntimeDefault\" and .automountServiceAccountToken == false
      and .enableServiceLinks == false and (.hostNetwork // false) == false and (.hostPID // false) == false and (.hostIPC // false) == false")"
  check "실행 파일 ${f}: 권한 상승 금지·읽기 전용 루트·권한 전부 제거, /tmp는 크기 상한 있는 빈 볼륨" \
    "$(ok q "$file" ".[0] | ${POD} | (.containers | length) == 1 and (.containers[0].securityContext
      | .allowPrivilegeEscalation == false and .readOnlyRootFilesystem == true and .capabilities.drop == [\"ALL\"])
      and ([.containers[0].volumeMounts[] | select(.mountPath == \"/tmp\") | .name] as \$t
        | any(.volumes[]; .name == \$t[0] and .emptyDir.sizeLimit != null))
      and all(.volumes[]; has(\"emptyDir\") or has(\"configMap\"))")"
  check "실행 파일 ${f}: CPU·메모리 요청과 메모리 상한이 있고 CPU 상한은 없음, 이미지는 digest" \
    "$(ok q "$file" ".[0] | ${POD} | .containers[0] | .resources.requests.cpu != null and .resources.requests.memory != null
      and .resources.limits.memory != null and .resources.limits.cpu == null and (.image | test(\"@sha256:[0-9a-f]{64}$\"))")"
  check "실행 파일 ${f}: 비밀값 이름의 환경변수는 Secret에서만 받음" \
    "$(ok q "$file" "[.[0] | ${POD} | .containers[0].env[] | select(.name | test(\"SECRET|PASSWORD|_KEY$|REDIS_URL\"))
      | (.value == null and .valueFrom.secretKeyRef.name != null)] | all")"
done
check "api·worker: 한 개 실행·Recreate, 자동 확장 없음" \
  "$(ok test "$(for f in api worker; do json "$WORK/applied-$f.yaml" | jq -r '.[0] | "\(.spec.replicas) \(.spec.strategy.type)"'; done | sort -u)" = '1 Recreate')"
check "web: 한 개 실행, 옛 web을 둔 채 새 web을 먼저 띄움" \
  "$(ok q "$WORK/applied-web.yaml" '.[0].spec | .replicas == 1 and .strategy.type == "RollingUpdate" and .strategy.rollingUpdate.maxUnavailable == 0')"
check "api: 운영 모드·DB TLS 검증·Access 15분·같은 출처, 개발 로그인·CORS 값 없음, 앱 계정" \
  "$(ok q "$WORK/applied-api.yaml" '.[0].spec.template.spec.containers[0].env | map({(.name): (.value // "ref")}) | add
      | .NODE_ENV == "production" and .PGSSLMODE == "verify-full" and .NODE_TLS_REJECT_UNAUTHORIZED == "1"
      and .AUTH_ACCESS_TOKEN_TTL_SECONDS == "900" and .AUTH_WEB_ORIGIN == "https://catchu.dev" and .DB_USER == "catchu_app"
      and .CORS_ALLOWED_ORIGINS == null and .DEV_LOGIN_ENABLED == null')"
check "worker: 운영 모드, DB 값 없음, 클러스터 안 api 주소, 종료 유예 30초 이상, 생존 확인 없음" \
  "$(ok q "$WORK/applied-worker.yaml" '.[0].spec.template.spec | .terminationGracePeriodSeconds >= 30 and .containers[0].livenessProbe == null
      and (.containers[0].env | map({(.name): (.value // "ref")}) | add | .NODE_ENV == "production"
      and .WORKER_CONTEXT_API_URL == "http://api.catchu.svc.cluster.local:3001" and (keys | map(select(startswith("DB_"))) | length) == 0)')"
check "migration Pod: controller 없음·다시 띄우지 않음·시간 한도, migration 계정" \
  "$(ok q "$WORK/created.yaml" '.[0] | .kind == "Pod" and .metadata.ownerReferences == null and .spec.restartPolicy == "Never"
      and .spec.activeDeadlineSeconds > 0 and .metadata.labels["app.kubernetes.io/name"] == "migration"
      and any(.spec.containers[0].env[]; .name == "DB_USER" and .value == "catchu_migrator")')"
ADMIN_IMAGE=$(json "$K8S/ops/db-admin-pod.yaml" | jq -r '.[0].spec.containers[0].image')
check "동의 기록 확인 Pod: controller 없음·다시 띄우지 않음·시간 한도, migration 계정·Secret·연결 허용 라벨, TLS 검증, DB 관리 Pod와 같은 이미지" \
  "$(ok q "$WORK/guard.yaml" ".[0] | .kind == \"Pod\" and .metadata.namespace == \"catchu\" and .metadata.ownerReferences == null
      and .spec.restartPolicy == \"Never\" and .spec.activeDeadlineSeconds > 0 and .metadata.labels[\"app.kubernetes.io/name\"] == \"migration\"
      and .spec.containers[0].image == \"${ADMIN_IMAGE}\"
      and (.spec.containers[0].env | map({(.name): (.value // .valueFrom.secretKeyRef.name // .valueFrom.configMapKeyRef.name)}) | add
        | .PGUSER == \"catchu_migrator\" and .PGPASSWORD == \"catchu-migration\" and .PGHOST == \"catchu-db\" and .PGSSLMODE == \"verify-full\")")"
check "동의 기록 확인 Pod: 한 트랜잭션·오류에서 멈춤·문장 되풀이 없음, 쿠버네티스가 바꾸는 \$(·\$\$가 명령에 없음" \
  "$(ok q "$WORK/guard.yaml" '.[0].spec.containers[0] | .args == null and (.command | index("--single-transaction") != null
      and index("ON_ERROR_STOP=1") != null and index("VERBOSITY=terse") != null and index("--echo-all") == null
      and all(.[]; (contains("$(") or contains("$$")) | not))')"
check "Deployment 원본은 자리표시 그대로라 손으로 apply하면 거부됨(실행 수가 숫자가 아님)" \
  "$(ok test "$(cat "$K8S/api.yaml" "$K8S/worker.yaml" "$K8S/web.yaml" | grep -c '^  replicas: __REPLICAS__$')" = 3)"
check "namespace: Pod 보안 검사 restricted, 기본 서비스 계정 토큰 자동 탑재 끔" \
  "$(ok q "$K8S/namespace.yaml" '(.[0].metadata.labels["pod-security.kubernetes.io/enforce"] == "restricted") and (.[1].automountServiceAccountToken == false)')"
check "Service: ClusterIP만, Service 포트와 컨테이너 포트가 같음" \
  "$(ok q "$K8S/services.yaml" 'all(.[]; .spec.type == "ClusterIP" and all(.spec.ports[]; .port == .targetPort))
      and (map({(.metadata.name): .spec.ports[0].port}) | add) == {"web": 3000, "api": 3001}')"
check "NetworkPolicy: 기본 차단(들어오고 나감)과 DNS, worker·web은 DB 5432로 못 나감, migration은 5432만" \
  "$(ok q "$K8S/network-policy.yaml" '(map({(.metadata.name): .}) | add) as $p
      | ($p["default-deny"].spec | .podSelector == {} and (.policyTypes | sort) == ["Egress", "Ingress"])
      and ($p["allow-dns"].spec.egress[0].ports | map(.port) | unique) == [53]
      and ([$p.worker.spec.egress[].ports[].port] | index(5432) == null)
      and ($p.web.spec.policyTypes == ["Ingress"])
      and ([$p.migration.spec.egress[].ports[].port] | unique) == [5432]
      and all(.[]; .metadata.namespace == "catchu")')"
check "NetworkPolicy: worker 바깥 443은 GitHub API 대역 24개와 Anthropic 대역만" \
  "$(ok q "$K8S/network-policy.yaml" '[.[] | select(.metadata.name == "worker") | .spec.egress[] | select(.ports[0].port == 443) | .to[].ipBlock.cidr]
      | length == 25 and index("160.79.104.0/23") != null and all(.[]; test("^[0-9.]+/[0-9]+$") and . != "0.0.0.0/0")')"
check "Ingress: /v1/internal 404가 /v1·/보다 먼저, 공개 ALB·TLS 1.2·1.3 정책·WAF 이름·HSTS 300초" \
  "$(ok q "$K8S/ingress.yaml" '.[0] | (.spec.rules[0].http.paths | map(.path)) == ["/v1/internal", "/v1", "/"]
      and .spec.rules[0].http.paths[0].backend.service.name == "internal-not-found"
      and (.metadata.annotations | .["alb.ingress.kubernetes.io/scheme"] == "internet-facing"
      and .["alb.ingress.kubernetes.io/ssl-policy"] == "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
      and .["alb.ingress.kubernetes.io/wafv2-acl-name"] == "catchu-edge"
      and (.["alb.ingress.kubernetes.io/listener-attributes.HTTPS-443"] | endswith("header_value=max-age=300"))
      and (.["alb.ingress.kubernetes.io/actions.internal-not-found"] | fromjson | .fixedResponseConfig.statusCode == "404"))')"
check "실행 파일에 계정 번호(12자리 숫자)가 없음" "$(ok test "$(cat "$K8S"/*.yaml | grep -c -E '[0-9]{12}')" = 0)"

echo
echo "통과 $pass, 실패 $fail"
[ "$fail" = 0 ]
