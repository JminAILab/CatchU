#!/usr/bin/env bash
# 단일 호스트 계획 교체·처음 설치(#275). 사람이 실행하는 수동 절차이며 자동 배포가 아니다. 절차 설명은 deploy/README.md.
#   1) 대상 이미지가 이 호스트에 있는지 확인(합성 DB 이미지는 없으면 받는다)
#   2) 유입 차단: web·api를 멈추고, worker를 멈춘다
#   3) 종료 확인: 같은 이름·같은 프로젝트의 web·api·worker가 하나라도 실행 중이거나 상태를 확인할 수 없으면 멈춘다.
#      대기 상한을 넘어 강제 종료(137)됐거나, 이전 migration 실행 컨테이너(실패·불명)가 남아 있어도 새 실행을 시작하지 않는다
#   4) (--migrate) migration을 이미지마다 정해진 이름으로 한 번 실행한다. 실패·결과 불명이면 새 실행을 시작하지 않고 멈춘다
#   5) api → worker → web 순서로 시작하고 각각 정상 확인(health)을 기다린다. 하나라도 실패하면 세 서비스를 다시 멈추고 끝낸다
# 자동 재시도·자동 되돌리기·DB 복원은 하지 않는다. 진행 중이던 요청·분석은 끝까지 마친다고 보장하지 않는다.
#
# 사용: deploy/scripts/replace-single.sh --env-file <compose.env> [--local-db] [--migrate] [--stop-timeout 초]
# 종료 코드: 0 성공, 2 사용법·사전 확인 실패, 3 종료 확인 실패, 4 migration 실패, 5 migration 결과 불명·남은 실행,
#           6 새 실행 정상 확인 실패(세 서비스를 멈춘 상태로 끝냄), 7 대기 상한을 넘어 강제 종료됨(원인 확인 뒤 다시 실행하면 이어서 진행)
set -euo pipefail

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }
env_file="" local_db=false migrate=false stop_timeout=30
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) env_file=${2:-}; shift 2 ;;
    --local-db) local_db=true; shift ;;
    --migrate) migrate=true; shift ;;
    --stop-timeout) stop_timeout=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "${env_file}" ] && [ -f "${env_file}" ] || { echo "--env-file <compose.env>가 필요합니다." >&2; exit 2; }
case "${stop_timeout}" in ''|*[!0-9]*) echo "--stop-timeout은 초 단위 정수입니다." >&2; exit 2 ;; esac

# 셸에 남은 값이 실행 묶음 파일보다 우선하지 않게 한다(compose는 셸 환경변수를 --env-file보다 먼저 쓴다).
unset COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_FILE COMPOSE_ENV_FILES
for variable in $(compgen -v | grep '^CATCHU_' || true); do unset "${variable}"; done

deploy_dir=$(cd "$(dirname "$0")/.." && pwd -P)
repo_root=$(cd "${deploy_dir}/.." && pwd -P)
# 실값 env 파일이 저장소(빌드 맥락·Git) 안에 놓이지 않게 환경 폴더 위치를 확인한다.
# compose는 상대 경로를 deploy/ 기준으로 풀므로 절대 경로만 받는다(따옴표는 벗긴다).
env_dir=$(sed -n 's/^CATCHU_ENV_DIR=//p' "${env_file}" | tail -n 1)
env_dir=${env_dir#\"}; env_dir=${env_dir%\"}; env_dir=${env_dir#\'}; env_dir=${env_dir%\'}
case "${env_dir}" in
  /*) case "${env_dir}" in *'$'*) echo "CATCHU_ENV_DIR에는 변수 없이 절대 경로를 적습니다." >&2; exit 2 ;; esac ;;
  *) echo "CATCHU_ENV_DIR은 절대 경로로 적습니다." >&2; exit 2 ;;
esac
if [ ! -d "${env_dir}" ]; then echo "실행 묶음의 CATCHU_ENV_DIR 폴더가 없습니다: ${env_dir}" >&2; exit 2; fi
env_dir=$(cd "${env_dir}" && pwd -P)
case "${env_dir}/" in "${repo_root}/"*) echo "환경 폴더는 저장소 밖에 둡니다: ${env_dir}" >&2; exit 2 ;; esac
compose=(docker compose --env-file "${env_file}" -f "${deploy_dir}/compose.single.yaml")
if [ "${local_db}" = true ]; then compose+=(-f "${deploy_dir}/compose.local-db.yaml"); fi

log() { printf '[replace %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { local code=$1; shift; log "중단: $*"; exit "${code}"; }

"${compose[@]}" --profile migration config --quiet || fail 2 "compose 설정을 읽지 못했습니다."
project=$("${compose[@]}" config | sed -n 's/^name: //p' | head -n 1)
[ -n "${project}" ] || fail 2 "compose 프로젝트 이름을 읽지 못했습니다."

running_ids() { # 서비스 이름 → 같은 프로젝트에서 실행 중인 컨테이너 ID(이름을 바꾼 수동 실행도 라벨로 잡는다)
  docker ps -q --filter "label=com.docker.compose.project=${project}" --filter "label=com.docker.compose.service=$1"
}
state() { docker inspect -f '{{.Id}} {{.State.Status}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}} image={{.Image}}' "$1" 2>/dev/null || echo "없음"; }

# 1) 사전 확인. 앱 이미지는 미리 빌드하거나 받아 둔다. 합성 DB 이미지(digest 고정)는 없으면 받는다.
db_image=""
if [ "${local_db}" = true ]; then db_image=$("${compose[@]}" config --images db); fi
images=$("${compose[@]}" --profile migration config --images)
for image in ${images}; do
  docker image inspect "${image}" >/dev/null 2>&1 && continue
  if [ -n "${db_image}" ] && [ "${image}" = "${db_image}" ]; then
    docker pull -q "${image}" >/dev/null || fail 2 "합성 DB 이미지를 받지 못했습니다: ${image}"
    log "합성 DB 이미지를 받았습니다: ${image}"
  else
    fail 2 "이 호스트에 이미지가 없습니다: ${image} (먼저 빌드하거나 받아 둡니다)"
  fi
done
log "대상 이미지:"
for image in ${images}; do log "  ${image} -> $(docker image inspect -f '{{.Id}}' "${image}")"; done
was_running=""
for service in web api worker; do
  log "교체 전 ${service}: $(state "${project}-${service}")"
  if [ "$(docker inspect -f '{{.State.Running}}' "${project}-${service}" 2>/dev/null || echo false)" = true ]; then
    was_running="${was_running} ${service}"
  fi
done

# 2) 유입 차단과 중지. compose 밖에서 같은 라벨로 띄운 실행이 남으면 3)에서 멈춘다.
stop_started=$(date +%s)
log "web·api 중지(유입 차단), 이어서 worker 중지. 대기 상한 ${stop_timeout}초(넘으면 Docker가 강제 종료한다)"
# 하나의 중지 명령이 실패해도(Docker 오류 등) 나머지 서비스도 멈추도록 모두 시도하고, 실제 상태는 3)에서 확인한다.
stop_failed=""
for service in web api worker; do
  "${compose[@]}" stop -t "${stop_timeout}" "${service}" || stop_failed="${stop_failed} ${service}"
done
if [ -n "${stop_failed}" ]; then log "중지 명령이 실패했습니다:${stop_failed}. 종료 확인으로 실제 상태를 봅니다."; fi

# 3) 종료 확인
for service in web api worker; do
  ids=$(running_ids "${service}") \
    || fail 3 "Docker에서 ${service} 실행 상태를 확인하지 못했습니다. 종료를 확인하기 전에는 새 실행을 시작하지 않습니다."
  if [ -n "${ids}" ]; then
    fail 3 "${service} 실행이 남아 있습니다(${ids//$'\n'/ }). 종료를 확인하기 전에는 새 실행을 시작하지 않습니다."
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "${project}-${service}" 2>/dev/null || echo false)" = true ]; then
    fail 3 "${project}-${service}가 아직 실행 중입니다."
  fi
done
for service in web api worker; do log "종료 확인 ${service}: $(state "${project}-${service}")"; done
for service in ${was_running}; do
  if [ "$(docker inspect -f '{{.State.ExitCode}}' "${project}-${service}" 2>/dev/null)" = 137 ]; then
    fail 7 "${service}가 대기 상한 안에 끝나지 않아 강제 종료됐습니다. 정상 교체로 보지 않습니다. 로그로 원인을 확인한 뒤 다시 실행합니다."
  fi
done
# 성공한 migration 실행은 4)에서 지우므로, 남은 실행 컨테이너는 실패했거나 결과가 불분명한 실행이다(되돌리기 경로도 막는다).
leftover=$(docker ps -a --filter "label=com.docker.compose.project=${project}" --filter "label=com.docker.compose.service=migration" --format '{{.Names}} {{.Status}}') \
  || fail 3 "Docker에서 이전 migration 실행 상태를 확인하지 못했습니다."
if [ -n "${leftover}" ]; then
  fail 5 "이전 migration 실행이 남아 있습니다(${leftover//$'\n'/, }). 로그와 DB 적용 이력을 확인하고 직접 지운 뒤 다시 실행합니다."
fi

# 4) migration: 이미지마다 정해진 이름으로 한 번만 실행한다.
if [ "${local_db}" = true ]; then
  "${compose[@]}" up -d --wait --wait-timeout 120 db || fail 2 "합성 DB가 정상 확인에 실패했습니다."
fi
if [ "${migrate}" = true ]; then
  migration_image=$("${compose[@]}" --profile migration config --images migration)
  migration_id=$(docker image inspect -f '{{.Id}}' "${migration_image}")
  migration_id=${migration_id#sha256:}
  run_name="${project}-migration-${migration_id:0:12}"
  if docker inspect "${run_name}" >/dev/null 2>&1; then fail 5 "같은 이름의 migration 실행(${run_name})이 이미 있습니다."; fi
  log "migration 실행: ${run_name}"
  set +e
  "${compose[@]}" --profile migration run -T --no-deps --name "${run_name}" migration
  run_code=$?
  set -e
  recorded=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "${run_name}" 2>/dev/null || echo "없음")
  log "migration 결과: run=${run_code} 컨테이너=${recorded}"
  log "migration 기록: $(state "${run_name}")"
  if [ "${recorded}" = "exited 0" ] && [ "${run_code}" -eq 0 ]; then
    # 성공을 확인하고 기록을 남긴 뒤에만 지운다. 실패·불명이면 확인용으로 남긴다.
    docker rm "${run_name}" >/dev/null
    log "migration 성공. 실행 컨테이너를 지웠습니다: ${run_name}"
  elif [ "${recorded#exited }" != "${recorded}" ] && [ "${recorded}" != "exited 0" ]; then
    fail 4 "migration 실패(${recorded}). 컨테이너 ${run_name}과 DB 적용 이력을 확인하기 전에는 다시 실행하거나 새 실행을 시작하지 않습니다."
  else
    fail 5 "migration 결과가 불분명합니다(${recorded}). 실행 상태와 DB 적용 이력을 확인한 뒤 담당자가 판단합니다."
  fi
fi

# 5) 새 실행: api → worker → web. 이미지가 바뀐 서비스는 기존(멈춘) 컨테이너를 지우고 새로 만든다.
# 하나라도 정상 확인에 실패하면 이미 시작한 서비스까지 다시 멈춰, 반쯤 열린 상태로 두지 않는다.
fail_started() {
  local message=$1
  log "새 실행 실패: ${message} 세 서비스를 다시 멈춥니다."
  "${compose[@]}" stop -t "${stop_timeout}" web api worker || true
  for service in web api worker; do log "멈춘 뒤 ${service}: $(state "${project}-${service}")"; done
  for service in web api worker; do
    if [ -n "$(running_ids "${service}")" ]; then fail 3 "${message} ${service}가 멈추지 않았습니다. 직접 확인합니다."; fi
  done
  fail 6 "${message} 원인 확인: docker logs <컨테이너 이름>"
}
for service in api worker web; do
  log "${service} 시작"
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 "${service}" \
    || fail_started "${service}가 정상 확인에 실패했습니다."
done
stop_ended=$(date +%s)
for service in api worker web; do
  count=$(running_ids "${service}" | grep -c . || true)
  [ "${count}" = 1 ] || fail_started "${service} 실행 수가 1이 아닙니다(${count})."
  log "교체 후 ${service}: $(state "${project}-${service}")"
done
log "완료. 중지 시작부터 web 정상 확인까지 $((stop_ended - stop_started))초"
