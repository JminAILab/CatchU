#!/usr/bin/env bash
# 개발 서버 자동 배포(#313)의 서버 쪽 절차. SSM 문서 catchu-dev-deploy가 배포 파일 묶음을 /opt/catchu/deploy-src.new에 꺼낸 뒤
# 그 안의 이 파일을 root로 실행한다. 개발 서버 수동 절차(deploy/dev-server/README.md 「순서」 2·3·5단계)를 그대로 한다.
#   1) 네 이미지를 digest로 받고 arm64인지, web 공개 주소 표식이 이 서버 도메인인지 확인한다
#   2) compose.env의 이미지 값을 임시 파일에 바꿔 전달받은 digest와 같은지 확인한다. 그다음 배포 파일 폴더를 새 묶음으로 바꾸고
#      (이전 것은 deploy-src.prev-<시각>) compose.env를 한 번에 바꾼다(이전 파일은 env-backup). 2가 끝나기 전에 멈추면 아무것도 바뀌지 않는다
#   3) replace-single.sh --local-db --migrate 로 교체한다. 자동 재시도·자동 되돌리기는 하지 않는다
#   4) Caddy를 새 폴더의 Caddyfile로 다시 띄우고, 새로 만들어져 돌고 있는지 본다(인증서는 보관 볼륨에서 다시 쓴다)
#   5) 서버 안 확인: 실행 이미지가 compose.env와 같음, health, 앞단 첫 화면, 프록시 주소, 앱 계정 잠금 대기 상한
#   6) 모두 통과했으면 서버의 catchu 이미지(앱 네 개와 배포 파일 묶음) 중 지금 판본과 직전 판본만 남기고 지운다.
#      직전 판본은 교체 전 compose.env(앱)와 배포 기록의 마지막 성공 줄(묶음)로 정한다. 다른 이미지(DB·큐·Caddy)는 건드리지 않는다
#   7) /opt/catchu/deploy-history.log에 한 줄 남긴다
# 1·2에서 멈추면 서버의 실행 중 판본은 바뀌지 않는다. 출력은 환경 폴더의 비밀값을 가린다(redact.py).
# 종료 코드: 0 완료, 2 입력·준비 실패(바꾼 것 없음), 3 교체 실패(replace-single.sh의 종료 코드를 출력에 적는다),
#           4 교체 뒤 확인 실패(Caddy를 새로 띄우지 못함 포함)
set -uo pipefail

BASE=/opt/catchu
ENV_DIR=$BASE/env
SRC=$BASE/deploy-src
NEW=$BASE/deploy-src.new
HERE=$(cd "$(dirname "$0")" && pwd)

registry="" commit="" web="" api="" migration="" worker="" files=""
while [ $# -gt 0 ]; do
  case "$1" in
    --registry) registry=${2:-}; shift 2 ;;
    --commit) commit=${2:-}; shift 2 ;;
    --web) web=${2:-}; shift 2 ;;
    --api) api=${2:-}; shift 2 ;;
    --migration) migration=${2:-}; shift 2 ;;
    --worker) worker=${2:-}; shift 2 ;;
    --files) files=${2:-}; shift 2 ;;
    *) echo "알 수 없는 인자: $1"; exit 2 ;;
  esac
done

# 서버 디스크가 배포마다 쌓이는 이미지로 차지 않게, 지금 판본(keep_now)과 직전 판본(keep_prev)만 남긴다.
# 지우기 실패(컨테이너가 쓰는 중 등)는 알리기만 하고 배포 결과는 바꾸지 않는다. 지운 판본도 ECR에서 다시 받을 수 있다.
prune_images() {
  local registry=$1 keep=$2 repo digest removed=0 kept=0 failed=0
  while read -r repo digest; do
    case "$repo" in
      "$registry"/catchu-web | "$registry"/catchu-api | "$registry"/catchu-api-migration | "$registry"/catchu-worker | "$registry"/catchu-deploy-files) ;;
      *) continue ;;
    esac
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || continue
    if grep -qxF "${repo}@${digest}" <<< "$keep"; then
      kept=$((kept + 1))
    elif docker image rm "${repo}@${digest}" > /dev/null 2>&1; then
      removed=$((removed + 1))
    else
      failed=$((failed + 1))
    fi
  done < <(docker images --digests --format '{{.Repository}} {{.Digest}}' | sort -u)
  echo "이미지 정리: 남김 ${kept}, 지움 ${removed}, 지우지 못함 ${failed}"
  [ "$failed" = 0 ] || echo "주의: 지우지 못한 이미지는 다음 배포 때 다시 정리한다"
}

main() {
  local d
  [[ "$registry" =~ ^[0-9]{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com$ ]] || { echo "멈춤: 레지스트리 형식"; return 2; }
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "멈춤: 커밋 형식"; return 2; }
  for d in "$web" "$api" "$migration" "$worker" "$files"; do
    [[ "$d" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "멈춤: digest 형식"; return 2; }
  done
  [ "$HERE" = "$NEW/deploy/dev-server/cd" ] || { echo "멈춤: ${NEW}에서 꺼낸 묶음으로만 실행한다"; return 2; }
  [ -x "$NEW/deploy/scripts/replace-single.sh" ] && [ -f "$NEW/deploy/dev-server/Caddyfile" ] || { echo "멈춤: 묶음에 필요한 파일이 없다"; return 2; }
  local envf=$ENV_DIR/compose.env domain
  grep -q '^CATCHU_ENV_DIR=/' "$envf" || { echo "멈춤: compose.env에 CATCHU_ENV_DIR가 없다"; return 2; }
  domain=$(sed -n 's/^CATCHU_DOMAIN=//p' "$envf")
  [ -n "$domain" ] || { echo "멈춤: compose.env에 CATCHU_DOMAIN이 없다"; return 2; }
  echo "판본 ${commit} / $(date -u +%FT%TZ)"

  echo "== 1. 이미지 받기(digest 고정)"
  local var repo ref arch
  local -a pairs=("CATCHU_WEB_IMAGE catchu-web $web" "CATCHU_API_IMAGE catchu-api $api"
    "CATCHU_MIGRATION_IMAGE catchu-api-migration $migration" "CATCHU_WORKER_IMAGE catchu-worker $worker")
  local p
  for p in "${pairs[@]}"; do
    read -r var repo d <<< "$p"
    ref="${registry}/${repo}@${d}"
    docker pull -q "$ref" > /dev/null 2>&1 || { echo "멈춤: ${repo} 받기 실패"; return 2; }
    arch=$(docker image inspect "$ref" --format '{{.Os}}/{{.Architecture}}')
    [ "$arch" = linux/arm64 ] || { echo "멈춤: ${repo} 아키텍처 ${arch}"; return 2; }
    echo "받음 ${repo} ${d:0:19}… ${arch}"
  done
  local base
  base=$(docker image inspect "${registry}/catchu-web@${web}" --format '{{index .Config.Labels "io.catchu.web.public-api-base-url"}}')
  [ "$base" = "https://${domain}" ] || { echo "멈춤: web 공개 주소 표식이 ${base}다(기대 https://${domain})"; return 2; }

  echo "== 2. 배포 파일·compose.env 바꾸기"
  local stamp prev started tmpenv=""
  started=$(date -u +%s)
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  prev=$SRC.prev-$stamp
  # compose.env는 같은 폴더의 임시 파일에서 먼저 바꾸고, 네 값이 전달받은 digest와 정확히 같은지 확인한 뒤 한 번에 옮긴다.
  # 갱신이 실패하면(쓰기 거부·디스크 가득 참 등) 옛 값으로 교체해 성공으로 끝나지 않도록 여기서 멈춘다.
  { install -d -m 700 "$BASE/env-backup" && cp -p "$envf" "$BASE/env-backup/compose.env.$stamp"; } || { echo "멈춤: compose.env를 보관하지 못했다"; return 2; }
  { tmpenv=$(mktemp "$ENV_DIR/.compose.env.XXXXXX") && cp -p "$envf" "$tmpenv"; } || { echo "멈춤: compose.env 임시 파일을 만들지 못했다"; rm -f "$tmpenv"; return 2; }
  for p in "${pairs[@]}"; do
    read -r var repo d <<< "$p"
    if grep -q "^${var}=" "$tmpenv"; then
      sed -i "s#^${var}=.*#${var}=${registry}/${repo}@${d}#" "$tmpenv"
    else
      echo "${var}=${registry}/${repo}@${d}" >> "$tmpenv"
    fi || { echo "멈춤: ${var} 값을 바꾸지 못했다"; rm -f "$tmpenv"; return 2; }
    if [ "$(grep -c "^${var}=" "$tmpenv")" != 1 ] || ! grep -qxF "${var}=${registry}/${repo}@${d}" "$tmpenv"; then
      echo "멈춤: ${var} 값이 전달받은 digest와 다르거나 여러 줄이다"; rm -f "$tmpenv"; return 2
    fi
  done
  mv "$SRC" "$prev" || { echo "멈춤: 배포 파일 폴더를 옮기지 못했다"; rm -f "$tmpenv"; return 2; }
  if ! mv "$NEW" "$SRC"; then
    mv "$prev" "$SRC" || echo "주의: 이전 배포 파일 폴더가 ${prev}에 남았다. ${SRC}로 되돌려 놓는다"
    echo "멈춤: 새 배포 파일 폴더를 놓지 못했다"; rm -f "$tmpenv"
    return 2
  fi
  if ! mv -f "$tmpenv" "$envf"; then
    { mv "$SRC" "$NEW" && mv "$prev" "$SRC"; } || echo "주의: 배포 파일 폴더를 되돌리지 못했다. ${prev}를 ${SRC}로 되돌려 놓는다"
    echo "멈춤: compose.env를 바꾸지 못했다"; rm -f "$tmpenv"
    return 2
  fi
  echo "배포 파일 바뀐 것:"
  (cd "$SRC" && find deploy -type f | sort | while read -r f; do cmp -s "$f" "$prev/$f" 2>/dev/null || echo "  $f"; done)

  echo "== 3. 앱 교체(--local-db --migrate)"
  cd "$SRC" || return 3
  local out rc
  out=$(deploy/scripts/replace-single.sh --env-file "$envf" --local-db --migrate 2>&1)
  rc=$?
  # migration 출력이 길어 판정 줄만 남긴다. 전체가 필요하면 서버에서 같은 명령을 다시 본다.
  grep -E '^\[replace|^Migration .* executed|No migrations' <<< "$out" | tail -30
  echo "replace-single 종료 코드 ${rc}"

  echo "== 4. 앞단 다시 띄우기"
  # 폴더를 바꿨으므로 이미 뜬 Caddy는 옛 폴더의 Caddyfile을 붙들고 있다. 앱 교체 결과와 상관없이 새 폴더로 다시 붙인다.
  local cout crc caddy_ok=true running created
  cout=$(docker compose --env-file "$envf" -f deploy/dev-server/compose.caddy.yaml up -d --force-recreate 2>&1)
  crc=$?
  tail -3 <<< "$cout"
  # 명령이 실패해도 옛 Caddy가 그대로 돌면 바깥 확인은 통과할 수 있으므로, 이번 배포 중에 새로 만들어져 돌고 있는지 본다.
  read -r running created <<< "$(docker inspect catchu-dev-caddy --format '{{.State.Running}} {{.Created}}' 2>/dev/null)"
  if [ "$crc" -ne 0 ]; then
    echo "실패 Caddy 다시 띄우기 종료 코드 ${crc}"; caddy_ok=false
  elif [ "$running" != true ] || [ "$(date -u -d "$created" +%s 2>/dev/null || echo 0)" -lt "$started" ]; then
    echo "실패 Caddy가 새로 만들어져 돌고 있지 않다(실행 ${running:-?}, 생성 ${created:-?})"; caddy_ok=false
  else
    echo "통과 Caddy 새 설정으로 다시 띄움"
  fi
  # 이전 폴더는 방금 것 하나만 남긴다(되돌리기는 이전 커밋 재배포로 하므로 폴더는 확인용이다).
  ls -d "$SRC".prev-* 2>/dev/null | sort | head -n -1 | xargs -r rm -rf

  local result=0
  if [ "$rc" -ne 0 ]; then
    result=3
  else
    [ "$caddy_ok" = true ] || result=4
    echo "== 5. 서버 안 확인"
    local c name want got code gw cidr lock
    # compose.env가 아니라 전달받은 digest와 대조한다.
    for c in "api $api" "worker $worker" "web $web"; do
      read -r name d <<< "$c"
      want="${registry}/catchu-${name}@${d}"
      got=$(docker inspect "catchu-dev-${name}" --format '{{.Config.Image}}' 2>/dev/null)
      if [ "$want" = "$got" ]; then echo "통과 ${name} 실행 이미지"; else echo "실패 ${name} 실행 이미지가 전달받은 digest와 다르다"; result=4; fi
    done
    for p in 3000/ 3001/health 8000/health; do
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${p}")
      if [ "$code" = 200 ]; then echo "통과 127.0.0.1:${p}"; else echo "실패 127.0.0.1:${p} ${code}"; result=4; fi
    done
    code=000
    for _ in $(seq 1 30); do
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 --resolve "${domain}:443:127.0.0.1" "https://${domain}/")
      [ "$code" = 200 ] && break
      sleep 1
    done
    if [ "$code" = 200 ]; then echo "통과 앞단 첫 화면"; else echo "실패 앞단 첫 화면 ${code}"; result=4; fi
    gw=$(docker network inspect catchu-dev_default -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null)
    cidr=$(sed -n 's/^TRUST_PROXY_CIDRS=//p' "$ENV_DIR/api.env")
    if [ -n "$gw" ] && [ "$cidr" = "${gw}/32" ]; then echo "통과 신뢰 프록시 주소"; else echo "실패 TRUST_PROXY_CIDRS(${cidr})가 앱 망 게이트웨이(${gw}/32)와 다르다"; result=4; fi
    lock=$(docker exec catchu-dev-db psql -U catchu_app -d catchu -tAc 'show lock_timeout' 2>&1)
    if [ "$lock" = 3s ]; then echo "통과 앱 계정 잠금 대기 상한 3s"; else echo "실패 앱 계정 잠금 대기 상한 ${lock}"; result=4; fi
  fi

  if [ "$result" = 0 ]; then
    echo "== 6. 이전 이미지 정리"
    local keep prev_files
    keep=$(printf '%s\n' "${registry}/catchu-web@${web}" "${registry}/catchu-api@${api}" "${registry}/catchu-api-migration@${migration}" \
      "${registry}/catchu-worker@${worker}" "${registry}/catchu-deploy-files@${files}")
    # 직전 판본: 교체 전 compose.env의 앱 이미지 네 개와, 배포 기록의 마지막 성공 줄의 묶음
    keep+=$'\n'$(grep -E '^CATCHU_(WEB|API|MIGRATION|WORKER)_IMAGE=' "$BASE/env-backup/compose.env.$stamp" | cut -d= -f2-)
    prev_files=$(grep ' result=0$' "$BASE/deploy-history.log" 2>/dev/null | tail -1 | sed -n 's/.* files=\(sha256:[0-9a-f]*\) .*/\1/p')
    [ -n "$prev_files" ] && keep+=$'\n'"${registry}/catchu-deploy-files@${prev_files}"
    prune_images "$registry" "$keep"
  fi

  echo "$(date -u +%FT%TZ) commit=${commit} web=${web} api=${api} migration=${migration} worker=${worker} files=${files} replace=${rc} result=${result}" >> "$BASE/deploy-history.log"
  echo "결과 ${result} (기록 ${BASE}/deploy-history.log)"
  return "$result"
}

# main이 이 폴더를 deploy-src로 옮기므로 가림 스크립트는 먼저 임시 파일로 복사해 쓴다.
redact=$(mktemp)
trap 'rm -f "$redact"' EXIT
cp "$HERE/redact.py" "$redact" || { echo "멈춤: redact.py가 없다"; exit 2; }
main 2>&1 | python3 -I "$redact" "$ENV_DIR"
exit "${PIPESTATUS[0]}"
