#!/usr/bin/env bash
# 로그 수집기 설정(deploy/aws/logging/fluent-bit-values.yaml) 시험(#276). 설정값의 이미지(aws-for-fluent-bit)를 Docker로 띄워
# 설정값의 수집 경로와 토큰 줄 버림 필터를 그대로 쓰고, 합성 컨테이너 로그 파일(CRI 형식)을 읽혀 무엇이 나가는지 본다.
# - 버려야 하는 줄: 토큰 꼴마다 하나씩(가짜 값). 나가면 실패다.
# - 남아야 하는 줄: 토큰 꼴과 비슷하지만 값이 아닌 줄과 보통 로그. 버려지면 실패다(필터가 모두 버려 0건이 되는 것을 막는다).
# - namespace catchu가 아닌 파일(catchu-ops·kube-system)의 줄은 나가지 않아야 한다.
# - 2단계 확인 Pod(logging/log-check-pod.yaml)가 찍는 줄도 넣는다. keep 줄은 남고 drop 줄은 버려져야 한다.
# 가짜 토큰은 저장소에 그대로 적지 않고 실행 때 이어 붙인다(비밀값 검사 도구가 실제 값으로 오인하지 않게).
# 확인하지 못하는 것: CloudWatch로 보내기(Pod Identity 권한·로그 그룹), 실제 노드의 로그 파일 이름. 이것은 README.md 「확인」대로 2단계에서 본다.
# 필요한 것: docker·ruby·jq. 이미지를 처음 받을 때 인터넷이 필요하다. 사용: bash deploy/aws/scripts/logs.test.sh   (20초쯤, 실패가 있으면 종료 코드 1)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
for tool in docker ruby jq; do
  command -v "$tool" > /dev/null || { echo "${tool}이(가) 없어 시험할 수 없다" >&2; exit 1; }
done
docker info > /dev/null 2>&1 || { echo "docker가 돌고 있지 않아 시험할 수 없다" >&2; exit 1; }
WORK=$(mktemp -d)
NAME=catchu-logs-test-$$
pass=0
fail=0
cleanup() {
  docker rm -f "$NAME" > /dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

check() { # 이름 조건(0이면 통과)
  if [ "$2" = 0 ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "실패: $1" >&2
  fi
}

# ---------- 설정값에서 이미지·수집 경로·필터를 읽는다 ----------
values=$(ruby -ryaml -rjson -e 'puts JSON.generate(YAML.safe_load(STDIN.read))' < "$ROOT/deploy/aws/logging/fluent-bit-values.yaml")
IMAGE="public.ecr.aws/aws-observability/aws-for-fluent-bit:$(jq -r .image.tag <<< "$values")"
path=$(jq -r .input.path <<< "$values")
jq -r .additionalFilters <<< "$values" > "$WORK/filters.conf"
case $path in
  /var/log/containers/*) ;;
  *) echo "수집 경로가 /var/log/containers 아래가 아니다: ${path}" >&2; exit 1 ;;
esac
check "필터가 grep 하나다" "$(grep -c '^\[FILTER\]' "$WORK/filters.conf" | grep -qx 1; echo $?)"

# ---------- 합성 로그 파일 ----------
rep() { printf "%${2}s" '' | tr ' ' "$1"; }
b43=$(rep A 43)
jwt="ey""JhbGciOiJIUzI1NiJ9.ey""JzdWIiOiJmYWtlIn0.ZmFrZQ"
drop=(
  "auth failed for token ${jwt}"
  "{\"level\":\"error\",\"token\":\"${jwt}\"}"
  "upstream sent Authorization: Bearer $(rep x 24)"
  "github said bearer $(rep y 16)"
  "clone with gh""p_$(rep x 36)"
  "oauth gh""o_$(rep x 36)"
  "pat github""_pat_$(rep x 30)"
  "anthropic sk""-ant-api03-$(rep x 20)"
  "voyage key p""a-$(rep x 40)"
  "google client GOC""SPX-$(rep x 20)"
  "GET /s/${b43} 500"
  "POST /v1/public/links/${b43}/unlock"
  "callback /v1/auth/google/callback?code=4/0A$(rep x 20)&scope=email"
  "callback /v1/auth/google/callback?scope=email&state=$(rep z 20)"
)
keep=(
  "analysis job 123 completed in 52ms"
  "access token refresh failed: expired"
  "GET /s/short 404"
  "GET /v1/public/links/${b43:0:20} 404"
  "papa-$(rep x 40) is not a key"
  "eyJ alone is not a token"
  "query ?code=abc"
  "Bearer"
)
# 확인 Pod가 찍는 줄(echo "$m …")을 그대로 가져온다.
pod_lines=()
while IFS= read -r line; do pod_lines+=("$line"); done < <(ruby -ryaml -e 'puts YAML.safe_load(STDIN.read)["spec"]["containers"][0]["command"][2]' \
  < "$ROOT/deploy/aws/logging/log-check-pod.yaml" | sed -n -E 's/^echo "\$m (.*)"$/\1/p')
check "확인 Pod 줄을 읽음(keep 1·drop 2)" "$(test "$(printf '%s\n' "${pod_lines[@]}" | grep -c '^keep:')" = 1 -a "$(printf '%s\n' "${pod_lines[@]}" | grep -c '^drop:')" = 2; echo $?)"
for line in "${pod_lines[@]}"; do
  case $line in keep:*) keep+=("pod ${line}") ;; *) drop+=("pod ${line}") ;; esac
done
mark=CATCHUMARK$$
cri() { printf '2026-10-29T00:00:00.000000000Z stdout F %s\n' "$1"; }
mkdir -p "$WORK/containers"
app="$WORK/containers/api-6d9f_catchu_api-0123456789abcdef.log"
for i in "${!drop[@]}"; do cri "${mark}-drop-${i} ${drop[$i]}" >> "$app"; done
for i in "${!keep[@]}"; do cri "${mark}-keep-${i} ${keep[$i]}" >> "$app"; done
cri "${mark}-ops psql output" > "$WORK/containers/db-admin_catchu-ops_psql-0123456789abcdef.log"
cri "${mark}-sys coredns" > "$WORK/containers/coredns-1_kube-system_coredns-0123456789abcdef.log"

# 차트의 입력 설정(README.md에 적은 차트 0.2.0 기본값)에 시험용 처음부터 읽기만 더하고, 바깥으로 보내는 대신 화면에 찍는다.
cat > "$WORK/fluent-bit.conf" << EOF
[SERVICE]
    Flush        1
    Parsers_File /fluent-bit/parsers/parsers.conf
[INPUT]
    Name              tail
    Tag               kube.*
    Path              ${path}
    multiline.parser  docker, cri
    Skip_Long_Lines   On
    Read_from_Head    On
$(cat "$WORK/filters.conf")
[OUTPUT]
    Name   stdout
    Match  *
    Format json_lines
EOF

docker run -d --name "$NAME" --platform linux/arm64 --entrypoint /fluent-bit/bin/fluent-bit \
  -v "$WORK/containers:/var/log/containers:ro" -v "$WORK/fluent-bit.conf:/fluent-bit/etc/test.conf:ro" \
  "$IMAGE" -c /fluent-bit/etc/test.conf > /dev/null || { echo "Fluent Bit을 띄우지 못했다" >&2; exit 1; }
out="$WORK/out.log"
for _ in $(seq 30); do
  sleep 1
  docker logs "$NAME" > "$out" 2>&1
  [ "$(grep -c "${mark}-keep-" "$out")" -ge "${#keep[@]}" ] && break
done
sleep 2
docker logs "$NAME" > "$out" 2>&1

check "Fluent Bit이 오류 없이 돈다" "$(grep -q -E '\[error\]|\[ warn\].*regex' "$out"; [ $? = 1 ]; echo $?)"
for i in "${!drop[@]}"; do
  check "토큰 줄이 버려진다: ${drop[$i]:0:40}…" "$(grep -q "\"${mark}-drop-${i} " "$out"; [ $? = 1 ]; echo $?)"
done
for i in "${!keep[@]}"; do
  check "보통 줄이 남는다: ${keep[$i]}" "$(grep -q "\"${mark}-keep-${i} " "$out"; echo $?)"
done
check "catchu-ops 줄은 모으지 않는다" "$(grep -q "${mark}-ops" "$out"; [ $? = 1 ]; echo $?)"
check "kube-system 줄은 모으지 않는다" "$(grep -q "${mark}-sys" "$out"; [ $? = 1 ]; echo $?)"

echo "통과 ${pass}, 실패 ${fail}"
[ "$fail" = 0 ]
