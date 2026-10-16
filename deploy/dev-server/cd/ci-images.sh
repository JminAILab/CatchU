#!/usr/bin/env bash
# 자동 배포(#313)의 이미지 단계. GitHub Actions arm64 러너에서 deploy-dev-server 워크플로가 부른다.
#   plan: ECR에 이 판본의 태그가 다섯 저장소에 모두 있는지 본다.
#         앱 이미지가 하나라도 없으면 build_apps=true(이미지 검사가 돈다), 배포 파일 묶음까지 하나라도 없으면 build=true.
#   push: 없는 이미지만 빌드해 올린다. 태그는 덮어쓸 수 없으므로(IMMUTABLE) 이미 있는 것은 그대로 쓴다.
#         올린 뒤 태그가 실행 이미지(출처 증명 문서가 아님)를 가리키는지 확인하고, 다섯 digest를 출력한다.
# 다섯 저장소: 앱 이미지 네 개와, 서버에 둘 배포 파일 묶음(catchu-deploy-files).
#   앱 이미지 태그는 main-<배포할 커밋 12자>. 앱 이미지·compose·교체 스크립트는 배포할 커밋(SRC_DIR)에서 만든다.
#   묶음은 배포할 커밋의 배포 파일 위에 배포 도구(deploy/dev-server/cd/)만 지금 main 판본(TOOLS_COMMIT)으로 덮는다.
#   그래서 묶음 태그는 main-<배포할 커밋 12자>-tools-<도구 커밋 12자>다. 되돌리기에서도 서버 쪽 절차는 지금 판본으로 돈다.
# 필요한 환경: TAG·TOOLS_COMMIT, (push) COMMIT·SRC_DIR·DEV_SERVER_DOMAIN, AWS 자격(워크플로가 OIDC로 받음), GITHUB_OUTPUT·GITHUB_STEP_SUMMARY.
# 이 스크립트는 배포 도구 쪽 작업 폴더(지금 main 판본)의 루트에서 실행한다.
set -euo pipefail

APP_REPOS=(catchu-web catchu-api catchu-api-migration catchu-worker)
FILES_REPO=catchu-deploy-files
# 서버 /opt/catchu/deploy-src에 둘 파일. 개발 서버 수동 절차의 「저장소의 필요한 파일」과 같다.
FILES=(deploy/compose.single.yaml deploy/compose.local-db.yaml deploy/local-db deploy/scripts/replace-single.sh deploy/dev-server)
TOOLS_PATH=deploy/dev-server/cd

: "${TAG:?TAG가 필요하다}" "${TOOLS_COMMIT:?TOOLS_COMMIT이 필요하다}"
[[ "$TAG" =~ ^main-[0-9a-f]{12}$ ]] || { echo "::error::태그 형식이 틀렸다: ${TAG}"; exit 2; }
[[ "$TOOLS_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::TOOLS_COMMIT 형식이 틀렸다"; exit 2; }
FILES_TAG="${TAG}-tools-${TOOLS_COMMIT:0:12}"

tag_of() { if [ "$1" = "$FILES_REPO" ]; then echo "$FILES_TAG"; else echo "$TAG"; fi; }

# 태그가 있으면 0, 없으면 1, 조회 자체가 실패하면 멈춘다(조회 실패를 '없음'으로 보지 않는다).
tag_exists() {
  local out
  if out=$(aws ecr describe-images --repository-name "$1" --image-ids imageTag="$(tag_of "$1")" --query 'imageDetails[0].imageDigest' --output text 2>&1); then
    return 0
  fi
  if grep -q ImageNotFoundException <<< "$out"; then
    return 1
  fi
  echo "::error::$1 조회 실패: $(head -c 300 <<< "$out")"
  exit 3
}

plan() {
  local build_apps=false build=false r
  for r in "${APP_REPOS[@]}" "$FILES_REPO"; do
    if tag_exists "$r"; then
      echo "${r}: $(tag_of "$r") 있음"
    else
      echo "${r}: $(tag_of "$r") 없음"
      build=true
      [ "$r" = "$FILES_REPO" ] || build_apps=true
    fi
  done
  printf 'build_apps=%s\nbuild=%s\n' "$build_apps" "$build" >> "$GITHUB_OUTPUT"
  echo "앱 이미지 빌드·검사 필요: ${build_apps} / 무엇이든 빌드 필요: ${build}"
}

# 태그가 가리키는 manifest가 실행 이미지인지 본다. 앱 이미지는 층이 여러 개, 배포 파일 묶음은 한 개다.
check_manifest() {
  local repo=$1 digest=$2 min_layers=$3
  aws ecr batch-get-image --repository-name "$repo" --image-ids imageDigest="$digest" \
    --accepted-media-types application/vnd.docker.distribution.manifest.v2+json application/vnd.oci.image.manifest.v1+json \
    --query 'images[0].imageManifest' --output text |
    python3 -I -c '
import json, sys
name, min_layers = sys.argv[1], int(sys.argv[2])
m = json.load(sys.stdin)
config = m["config"]["mediaType"]
layers = m["layers"]
in_toto = any("in-toto" in layer["mediaType"] for layer in layers)
ok = ("image.config" in config or "container.image" in config) and not in_toto and len(layers) >= min_layers
verdict = "실행 이미지" if ok else "이상"
print(f"{name}: 층 {len(layers)}개 -> {verdict}")
sys.exit(0 if ok else 1)
' "$repo" "$min_layers"
}

build_app() {
  local repo=$1 ref=$2 arch
  local args=(--provenance=false --sbom=false --build-arg "SOURCE_REVISION=${COMMIT}" -t "$ref")
  case "$repo" in
    catchu-web) args+=(-f web/Dockerfile --build-arg "NEXT_PUBLIC_API_BASE_URL=https://${DEV_SERVER_DOMAIN}") ;;
    catchu-api) args+=(-f api/Dockerfile) ;;
    catchu-api-migration) args+=(-f api/Dockerfile --target migration) ;;
    catchu-worker) args+=(-f worker/Dockerfile) ;;
  esac
  (cd "$SRC_DIR" && docker build -q "${args[@]}" . > /dev/null)
  arch=$(docker image inspect "$ref" --format '{{.Os}}/{{.Architecture}}')
  [ "$arch" = linux/arm64 ] || { echo "::error::${repo} 아키텍처가 ${arch}다(서버는 linux/arm64)"; exit 4; }
  if [ "$repo" = catchu-web ]; then
    local base
    base=$(docker image inspect "$ref" --format '{{index .Config.Labels "io.catchu.web.public-api-base-url"}}')
    [ "$base" = "https://${DEV_SERVER_DOMAIN}" ] || { echo "::error::web 공개 주소 표식이 ${base}다"; exit 4; }
  fi
}

# 배포할 커밋의 배포 파일에 배포 도구만 지금 판본으로 덮은 묶음 이미지.
# 저장소 밖 임시 폴더를 빌드 맥락으로 쓰므로 저장소의 .dockerignore와 상관없다.
build_files() {
  local ref=$1 ctx
  ctx=$(mktemp -d)
  mkdir -p "$ctx/deploy-src"
  git -C "$SRC_DIR" archive "$COMMIT" -- "${FILES[@]}" | tar -x -C "$ctx/deploy-src"
  rm -rf "${ctx:?}/deploy-src/${TOOLS_PATH}"
  git archive "$TOOLS_COMMIT" -- "$TOOLS_PATH" | tar -x -C "$ctx/deploy-src"
  [ -x "$ctx/deploy-src/deploy/scripts/replace-single.sh" ] || { echo "::error::이 커밋에는 교체 스크립트가 없어 배포할 수 없다"; exit 4; }
  printf 'FROM scratch\nLABEL io.catchu.source-revision="%s" io.catchu.deploy-tools-revision="%s"\nCOPY deploy-src /deploy-src\n' \
    "$COMMIT" "$TOOLS_COMMIT" > "$ctx/Dockerfile"
  docker build -q --provenance=false --sbom=false -t "$ref" "$ctx" > /dev/null
  echo "배포 파일 $(find "$ctx/deploy-src" -type f | wc -l)개 묶음(도구 ${TOOLS_COMMIT:0:12})"
  rm -rf "$ctx"
}

push() {
  : "${COMMIT:?COMMIT이 필요하다}" "${SRC_DIR:?SRC_DIR이 필요하다}" "${DEV_SERVER_DOMAIN:?DEV_SERVER_DOMAIN이 필요하다}"
  [ "$(git rev-parse HEAD)" = "$TOOLS_COMMIT" ] || { echo "::error::배포 도구 작업 폴더가 ${TOOLS_COMMIT}가 아니다"; exit 2; }
  [ "$(git -C "$SRC_DIR" rev-parse HEAD)" = "$COMMIT" ] || { echo "::error::소스 작업 폴더가 ${COMMIT}가 아니다"; exit 2; }
  [ -z "$(git -C "$SRC_DIR" status --porcelain)" ] || { echo "::error::소스 작업 폴더에 바뀐 파일이 있다"; exit 2; }
  local acct r ref digest min key state
  acct=$(aws sts get-caller-identity --query Account --output text)
  reg="${acct}.dkr.ecr.${AWS_REGION}.amazonaws.com" # 함수가 끝난 뒤 EXIT trap에서도 쓰므로 전역
  aws ecr get-login-password | docker login --username AWS --password-stdin "$reg" > /dev/null
  trap 'docker logout "$reg" > /dev/null 2>&1 || true' EXIT
  printf '### 이미지\n\n| 저장소 | 태그 | 상태 | digest |\n|---|---|---|---|\n' >> "$GITHUB_STEP_SUMMARY"
  for r in "${APP_REPOS[@]}" "$FILES_REPO"; do
    ref="${reg}/${r}:$(tag_of "$r")"
    if tag_exists "$r"; then
      state="이미 있음"
    else
      if [ "$r" = "$FILES_REPO" ]; then build_files "$ref"; else build_app "$r" "$ref"; fi
      docker push -q "$ref" > /dev/null
      state="새로 올림"
    fi
    digest=$(aws ecr describe-images --repository-name "$r" --image-ids imageTag="$(tag_of "$r")" --query 'imageDetails[0].imageDigest' --output text)
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::${r} digest를 읽지 못했다"; exit 3; }
    min=2; [ "$r" = "$FILES_REPO" ] && min=1
    check_manifest "$r" "$digest" "$min"
    case "$r" in
      catchu-web) key=web ;; catchu-api) key=api ;; catchu-api-migration) key=migration ;;
      catchu-worker) key=worker ;; "$FILES_REPO") key=files ;;
    esac
    echo "${key}=${digest}" >> "$GITHUB_OUTPUT"
    echo "${r}: ${state} ${digest:0:19}…"
    printf '| %s | `%s` | %s | `%s` |\n' "$r" "$(tag_of "$r")" "$state" "${digest:0:19}…" >> "$GITHUB_STEP_SUMMARY"
  done
}

case "${1:-}" in
  plan) plan ;;
  push) push ;;
  *) echo "사용: ci-images.sh plan|push" >&2; exit 2 ;;
esac
