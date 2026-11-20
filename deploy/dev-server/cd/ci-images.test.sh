#!/usr/bin/env bash
# ci-images.sh 회귀 시험(#313). aws·docker를 합성 응답으로 바꾸고, 합성 git 저장소에서 plan·push와 manifest 판정을 실제로 실행한다.
# 실제 ECR·Docker에는 닿지 않고 망도 쓰지 않는다. 필요한 것은 bash·git·python3뿐이다.
# 사용: bash deploy/dev-server/cd/ci-images.test.sh   (작업 폴더 어디서든. 실패가 하나라도 있으면 종료 코드 1)
# GitHub Actions의 images 워크플로(cd-scripts job)도 같은 명령을 쓴다.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SUT=$HERE/ci-images.sh
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN=$WORK/bin
S=$WORK/state
OUT=$WORK/out.log
REPOS="catchu-web catchu-api catchu-api-migration catchu-worker"
pass=0
fail=0

# ---------- 합성 aws·docker ----------
mkdir -p "$BIN"
cat > "$BIN/aws" <<'EOF'
#!/usr/bin/env bash
# 합성 aws: 상태 폴더(STUB_STATE)의 파일로 ECR 응답을 흉내 낸다.
S=${STUB_STATE:?}
printf 'aws %s\n' "$*" >> "$S/calls"
repo="" tag="" prev=""
for a in "$@"; do
  case "$prev" in
    --repository-name) repo=$a ;;
    --image-ids) case "$a" in imageTag=*) tag=${a#imageTag=} ;; esac ;;
  esac
  prev=$a
done
case "$1 $2" in
  "sts get-caller-identity") echo 123456789012 ;;
  "ecr get-login-password") echo synthetic-token ;;
  "ecr describe-images")
    if [ -n "${STUB_DESCRIBE_ERROR:-}" ]; then
      echo "An error occurred (AccessDeniedException) when calling the DescribeImages operation: synthetic" >&2; exit 254
    fi
    if [ -f "$S/ecr/$repo/$tag" ]; then cat "$S/ecr/$repo/$tag"; else
      echo "An error occurred (ImageNotFoundException) when calling the DescribeImages operation: synthetic" >&2; exit 254
    fi ;;
  "ecr batch-get-image")
    if [ -f "$S/manifest/$repo.json" ]; then cat "$S/manifest/$repo.json"
    else cat "$S/manifest/default-app.json"; fi ;;
  *) echo "합성 aws가 모르는 호출: $*" >&2; exit 99 ;;
esac
EOF
cat > "$BIN/docker" <<'EOF'
#!/usr/bin/env bash
# 합성 docker: 빌드·올리기를 기록하고, 올린 태그는 합성 ECR(상태 폴더)에 digest로 남긴다.
S=${STUB_STATE:?}
printf 'docker %s\n' "$*" >> "$S/calls"
last="" prev="" ref=""
for a in "$@"; do
  [ "$prev" = -t ] && ref=$a
  prev=$a
  last=$a
done
case "$1" in
  login) cat > /dev/null; echo "Login Succeeded" ;;
  logout) ;;
  build)
    echo "$ref" >> "$S/built" ;;
  image)
    case "$*" in
      *Architecture*) echo "${STUB_ARCH:-linux/arm64}" ;;
      *public-api-base-url*) echo "${STUB_WEB_LABEL:-https://catchu.dev}" ;;
      *) echo "합성 docker가 모르는 inspect: $*" >&2; exit 99 ;;
    esac ;;
  push)
    repo=${last#*/}; repo=${repo%%:*}; tag=${last##*:}
    mkdir -p "$S/ecr/$repo"
    python3 -I -c 'import hashlib, sys; print("sha256:" + hashlib.sha256(sys.argv[1].encode()).hexdigest())' "$last" > "$S/ecr/$repo/$tag" ;;
  *) echo "합성 docker가 모르는 호출: $*" >&2; exit 99 ;;
esac
EOF
chmod +x "$BIN/aws" "$BIN/docker"

# ---------- 합성 저장소: 배포할 커밋(TARGET)과 그 뒤 도구만 바뀐 커밋(TOOLS) ----------
REPO=$WORK/repo
g() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }
git -c init.defaultBranch=main init -q "$REPO"
mkdir -p "$REPO/deploy/dev-server/cd"
echo "# target tools" > "$REPO/deploy/dev-server/cd/tools.txt"
echo "target" > "$REPO/README.md"
g add -A && g commit -q -m target
TARGET=$(g rev-parse HEAD)
echo "# current tools" > "$REPO/deploy/dev-server/cd/tools.txt"
g commit -q -am tools
TOOLS=$(g rev-parse HEAD)
SRC=$WORK/src
g worktree add -q --detach "$SRC" "$TARGET"
TAG="main-${TARGET:0:12}"

manifest() { # 설정 mediaType, 층 mediaType…
  python3 -I -c '
import json, sys
config, layers = sys.argv[1], sys.argv[2:]
print(json.dumps({"schemaVersion": 2, "config": {"mediaType": config, "digest": "sha256:" + "0" * 64, "size": 1},
                  "layers": [{"mediaType": m, "digest": "sha256:" + "1" * 64, "size": 1} for m in layers]}))
' "$@"
}
DOCKER_CONFIG_TYPE=application/vnd.docker.container.image.v1+json
DOCKER_LAYER=application/vnd.docker.image.rootfs.diff.tar.gzip
OCI_CONFIG_TYPE=application/vnd.oci.image.config.v1+json
OCI_LAYER=application/vnd.oci.image.layer.v1.tar+gzip
IN_TOTO_LAYER=application/vnd.in-toto+json

reset_state() {
  rm -rf "$S"
  mkdir -p "$S/ecr" "$S/manifest"
  : > "$S/calls"
  : > "$S/built"
  : > "$S/output"
  : > "$S/summary"
  manifest "$DOCKER_CONFIG_TYPE" "$DOCKER_LAYER" "$DOCKER_LAYER" "$DOCKER_LAYER" > "$S/manifest/default-app.json"
}
# 이미 올라가 있는 태그를 합성 ECR에 넣는다. 인자: 저장소…(없으면 네 개 모두)
seed() {
  local r t
  # shellcheck disable=SC2086 # 저장소 이름 목록을 낱말로 나눈다
  [ $# -gt 0 ] || set -- $REPOS
  for r in "$@"; do
    t=$TAG
    mkdir -p "$S/ecr/$r"
    python3 -I -c 'import hashlib, sys; print("sha256:" + hashlib.sha256(sys.argv[1].encode()).hexdigest())' "seed-$r" > "$S/ecr/$r/$t"
  done
}
run_sut() { # 단계(plan|push). 합성 응답을 바꿀 값(STUB_*)과 배포 대상(DEPLOY_TARGET, 기본 eks)은 호출 앞에 붙인다.
  (cd "$REPO" && env PATH="$BIN:$PATH" STUB_STATE="$S" TAG="$TAG" TOOLS_COMMIT="$TOOLS" COMMIT="$TARGET" SRC_DIR="$SRC" \
    DEV_SERVER_DOMAIN=catchu.dev DEPLOY_TARGET="${DEPLOY_TARGET-eks}" AWS_REGION=ap-northeast-2 GITHUB_OUTPUT="$S/output" GITHUB_STEP_SUMMARY="$S/summary" \
    bash "$SUT" "$1") > "$OUT" 2>&1
  echo $?
}
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then
    pass=$((pass + 1)); echo "통과 $1"
  else
    fail=$((fail + 1)); echo "실패 $1"; sed 's/^/    /' "$OUT" | tail -15
  fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }
no_python_error() { ! grep -qE 'SyntaxError|Traceback' "$OUT"; }
output_has() { grep -qx "$1" "$S/output"; }
digest_of() { cat "$S/ecr/$1/$2" 2> /dev/null; }
key_of() { case "$1" in catchu-web) echo web ;; catchu-api) echo api ;; catchu-api-migration) echo migration ;; catchu-worker) echo worker ;; esac; }

# ---------- plan ----------
reset_state; seed; rc=$(run_sut plan)
check "plan: 네 태그가 모두 있으면 빌드하지 않음" "$(ok test "$rc" = 0 -a "$(cat "$S/output")" = "$(printf 'build_apps=false\nbuild=false')")"

reset_state; seed catchu-web catchu-api catchu-worker; rc=$(run_sut plan)
check "plan: 앱 이미지가 하나라도 없으면 검사·빌드" "$(ok test "$rc" = 0 -a "$(cat "$S/output")" = "$(printf 'build_apps=true\nbuild=true')")"

reset_state; seed; rc=$(STUB_DESCRIBE_ERROR=1 run_sut plan)
check "plan: 조회 실패를 '없음'으로 보지 않고 멈춤(3)" "$(ok test "$rc" = 3 -a ! -s "$S/output")"

# ---------- push: 이미 올린 태그 다시 쓰기 ----------
reset_state; seed
manifest "$OCI_CONFIG_TYPE" "$OCI_LAYER" "$OCI_LAYER" > "$S/manifest/catchu-api.json"
rc=$(run_sut push)
check "push 재사용: 정상 Docker·OCI manifest 통과(종료 0)" "$(ok test "$rc" = 0)"
check "push 재사용: Python 문법 오류·예외 없음" "$(ok no_python_error)"
all=0
for key_repo in web:catchu-web api:catchu-api migration:catchu-api-migration worker:catchu-worker; do
  r=${key_repo#*:}
  output_has "${key_repo%%:*}=$(digest_of "$r" "$TAG")" || all=1
done
check "push 재사용: digest 네 개를 출력" "$all"
check "push 재사용: 빌드·올리기 없음" "$(ok test -z "$(grep -E '^docker (build|push)' "$S/calls")")"
check "push 재사용: 판정 줄(Docker 층 3개·OCI 층 2개)" "$(grep -q 'catchu-web: 층 3개 -> 실행 이미지' "$OUT" && grep -q 'catchu-api: 층 2개 -> 실행 이미지' "$OUT"; echo $?)"
check "push 재사용: ECR 로그아웃" "$(ok grep -q '^docker logout' "$S/calls")"

# ---------- push: manifest 거부 ----------
reject_case() { # 이름, 저장소, 설정 mediaType, 층…
  local name=$1 repo=$2
  shift 2
  reset_state; seed
  manifest "$@" > "$S/manifest/$repo.json"
  rc=$(run_sut push)
  check "$name" "$(ok test "$rc" != 0)"
  check "$name: 판정으로 거부(문법 오류 아님)" "$(grep -q "${repo}: 층 .*-> 이상" "$OUT" && no_python_error; echo $?)"
  check "$name: 거부한 저장소의 digest를 내지 않음" "$(ok test -z "$(grep -E "^$(key_of "$repo")=" "$S/output")")"
}
reject_case "거부: in-toto 증명 문서" catchu-api "$OCI_CONFIG_TYPE" "$IN_TOTO_LAYER" "$IN_TOTO_LAYER"
reject_case "거부: 앱 이미지 층 1개(최소 2)" catchu-worker "$DOCKER_CONFIG_TYPE" "$DOCKER_LAYER"
reject_case "거부: 이미지 설정이 아닌 문서" catchu-web application/vnd.oci.empty.v1+json "$OCI_LAYER" "$OCI_LAYER"

# ---------- push: 새로 빌드해 올리기 ----------
reset_state; rc=$(run_sut push)
check "push 새로: 종료 0" "$(ok test "$rc" = 0)"
check "push 새로: Python 문법 오류·예외 없음" "$(ok no_python_error)"
check "push 새로: 네 개 빌드·올리기" "$(ok test "$(wc -l < "$S/built" | tr -d ' ')" = 4 -a "$(grep -c '^docker push' "$S/calls")" = 4)"
all=0
for key_repo in web:catchu-web api:catchu-api migration:catchu-api-migration worker:catchu-worker; do
  r=${key_repo#*:}
  output_has "${key_repo%%:*}=$(digest_of "$r" "$TAG")" || all=1
done
check "push 새로: 올린 digest 네 개를 출력" "$all"
check "push 새로: web 빌드 입력(공개 주소·인증 연결·판본)" "$(grep -E '^docker build' "$S/calls" | grep 'web/Dockerfile' | grep "NEXT_PUBLIC_API_BASE_URL=https://catchu.dev" | grep -q "NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true" && grep -E '^docker build' "$S/calls" | grep -q "SOURCE_REVISION=${TARGET}"; echo $?)"
check "push 새로: 출처 증명 끔" "$(ok test "$(grep -E '^docker build' "$S/calls" | grep -c -- '--provenance=false --sbom=false')" = 4)"

reset_state; rc=$(STUB_ARCH=linux/amd64 run_sut push)
check "push 새로: arm64가 아니면 올리지 않고 멈춤(4)" "$(ok test "$rc" = 4 -a "$(grep -c '^docker push' "$S/calls")" = 0)"
reset_state; rc=$(STUB_WEB_LABEL=http://127.0.0.1:3001 run_sut push)
check "push 새로: web 공개 주소가 다르면 올리지 않고 멈춤(4)" "$(ok test "$rc" = 4 -a "$(grep -c '^docker push' "$S/calls")" = 0)"
reset_state; seed; touch "$SRC/untracked-file"; rc=$(run_sut push); rm -f "$SRC/untracked-file"
check "push: 소스 작업 폴더에 바뀐 파일이 있으면 멈춤(2)" "$(ok test "$rc" = 2)"

# ---------- 배포 대상 eks·none: 앱 이미지 네 개만, 지운 배포 파일 묶음(catchu-deploy-files)에는 닿지 않음(#342) ----------
APPS="catchu-web catchu-api catchu-api-migration catchu-worker"
files_untouched() { ! grep -q 'catchu-deploy-files' "$S/calls" && ! grep -q '^files=' "$S/output"; }
for target in eks none; do
  # shellcheck disable=SC2086 # 저장소 이름 목록을 낱말로 나눈다
  reset_state; seed $APPS; rc=$(DEPLOY_TARGET=$target run_sut plan)
  check "plan(${target}): 앱 태그 네 개가 있으면 빌드하지 않고 묶음 저장소는 조회하지 않음" "$( [ "$rc" = 0 ] && [ "$(cat "$S/output")" = "$(printf 'build_apps=false\nbuild=false')" ] && files_untouched; echo $?)"
  reset_state; rc=$(DEPLOY_TARGET=$target run_sut push)
  check "push(${target}): 앱 이미지 네 개만 빌드·올리기" "$(ok test "$rc" = 0 -a "$(wc -l < "$S/built" | tr -d ' ')" = 4 -a "$(grep -c '^docker push' "$S/calls")" = 4)"
  all=0
  for r in $APPS; do output_has "$(key_of "$r")=$(digest_of "$r" "$TAG")" || all=1; done
  check "push(${target}): 앱 digest 네 개를 출력하고 묶음에는 닿지 않음" "$( [ "$all" = 0 ] && files_untouched; echo $?)"
done
reset_state; rc=$(DEPLOY_TARGET='' run_sut plan)
check "배포 대상이 없으면 조회 전에 멈춤(2)" "$(ok test "$rc" = 2 -a ! -s "$S/calls")"
reset_state; rc=$(DEPLOY_TARGET=dev-server run_sut plan)
check "지운 배포 대상(dev-server)이면 조회 전에 멈춤(2)" "$(ok test "$rc" = 2 -a ! -s "$S/calls")"
reset_state; rc=$(DEPLOY_TARGET=prod run_sut push)
check "모르는 배포 대상이면 조회 전에 멈춤(2)" "$(ok test "$rc" = 2 -a ! -s "$S/calls")"

echo "합계 통과 ${pass} / 실패 ${fail}"
[ "$fail" = 0 ]
