#!/usr/bin/env bash
# 단일 호스트 계획 교체·처음 설치(#275). 사람이 실행하는 수동 절차이며 자동 배포가 아니다. 절차 설명은 deploy/README.md.
#   1) 대상 이미지가 이 호스트에 있는지 확인(합성 DB 이미지는 없으면 받는다)하고, 교체 전에 실행 중인 서비스를 기록한다.
#      실행 상태를 조회하지 못하면 아무것도 멈추지 않고 끝낸다. 컨테이너가 아직 없으면(처음 설치) 실행 중이 아닌 것으로 본다
#   2) 유입 차단: web·api를 멈추고, worker를 멈춘다
#   3) 종료 확인: 같은 이름·같은 프로젝트의 web·api·worker가 하나라도 실행 중이거나 상태·종료 코드를 확인할 수 없으면 멈춘다.
#      대기 상한을 넘어 강제 종료(137)됐거나, 이전 migration 실행 컨테이너가 남아 있어도 새 실행을 시작하지 않는다.
#      세 서비스를 모두 확인한 뒤 판단하고, 3으로 멈출 때도 확인한 강제 종료와 교체 전에 실행 중이던 서비스를 함께 적는다
#   4) (--migrate) migration을 이미지마다 정해진 이름으로 한 번 실행한다. 실패·결과 불명이면 새 실행을 시작하지 않고 멈춘다.
#      성공을 확인한 뒤 실행 컨테이너를 지우지 못해도 새 실행을 시작하지 않고 멈춘다(적용은 확인됨, 컨테이너는 직접 지운다)
#   5) api → worker → web 순서로 시작하고 각각 정상 확인(health)을 기다린다. 모두 띄운 뒤 세 서비스가 지금도 healthy인지
#      다시 확인한다. 하나라도 실패하면 세 서비스를 다시 멈추고 종료를 확인한다. 다시 멈추지 못했거나 상태를 확인할 수
#      없으면 종료 확인 실패(3)로 끝낸다
# 자동 재시도·자동 되돌리기·DB 복원은 하지 않는다. 진행 중이던 요청·분석은 끝까지 마친다고 보장하지 않는다.
#
# 사용: deploy/scripts/replace-single.sh --env-file <compose.env> [--local-db] [--migrate] [--stop-timeout 초]
# 종료 코드: 0 성공, 2 사용법·사전 확인 실패(설정·이미지 조회 실패, 멈춘 뒤 합성 DB 기동·migration 준비 조회 실패 포함),
#           3 종료 확인 실패(교체 전 상태 조회 실패, 새 실행 실패 뒤 다시 멈출 때 포함),
#           4 migration 실패, 5 migration 결과 불명·남은 실행, 6 새 실행 확인 실패(세 서비스 종료까지 확인함),
#           7 대기 상한을 넘어 강제 종료됨(원인 확인 뒤 다시 실행하면 이어서 진행),
#           8 migration 성공 뒤 실행 컨테이너 정리 실패(직접 지운 뒤 compose.env를 바꾸지 않고 --migrate 없이 다시 실행하면 이어서 진행)
set -euo pipefail

# 머리말 주석(둘째 줄부터 첫 코드 줄 전까지)을 그대로 보여 준다. 머리말 줄 수가 바뀌어도 범위를 고치지 않아도 된다.
usage() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"; }
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
project=$("${compose[@]}" config | sed -n 's/^name: //p' | head -n 1) || fail 2 "compose 설정에서 프로젝트 이름을 읽지 못했습니다."
[ -n "${project}" ] || fail 2 "compose 프로젝트 이름을 읽지 못했습니다."

running_ids() { # 서비스 이름 → 같은 프로젝트에서 실행 중인 컨테이너 ID(이름을 바꾼 수동 실행도 라벨로 잡는다)
  docker ps -q --filter "label=com.docker.compose.project=${project}" --filter "label=com.docker.compose.service=$1"
}
# 판정용. 컨테이너 이름 → "absent"(없음) 또는 "<실행 중 true|false> <종료 코드>". Docker 조회가 실패하거나 답이 형식에
# 맞지 않으면 실패로 끝나므로, 부르는 쪽은 상태 불명으로 멈춘다. inspect는 없는 컨테이너와 조회 실패를 같은 코드로 끝내므로
# 있는지는 목록 조회(없으면 빈 출력으로 성공)로 먼저 가른다.
container_status() {
  local names status
  names=$(docker ps -a --filter "name=$1" --format '{{.Names}}') || return 1
  case $'\n'"${names}"$'\n' in *$'\n'"$1"$'\n'*) ;; *) echo absent; return 0 ;; esac
  status=$(docker inspect --type container -f '{{.State.Running}} {{.State.ExitCode}}' "$1") || return 1
  case "${status}" in true\ [0-9]*|false\ [0-9]*) echo "${status}" ;; *) return 1 ;; esac
}
# 기록용. inspect는 컨테이너가 없을 때와 Docker 조회 실패를 같은 코드로 끝내므로 둘을 가르지 않는다(판정에는 container_status를 쓴다).
state() { docker inspect -f '{{.Id}} {{.State.Status}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}} image={{.Image}}' "$1" 2>/dev/null || echo "확인 못 함(없거나 조회 실패)"; }

# 1) 사전 확인. 앱 이미지는 미리 빌드하거나 받아 둔다. 합성 DB 이미지(digest 고정)는 없으면 받는다.
db_image=""
if [ "${local_db}" = true ]; then
  db_image=$("${compose[@]}" config --images db) || fail 2 "compose 설정에서 합성 DB 이미지를 읽지 못했습니다."
fi
images=$("${compose[@]}" --profile migration config --images) || fail 2 "compose 설정에서 이미지 목록을 읽지 못했습니다."
for image in ${images}; do
  # inspect는 이미지가 없을 때와 Docker 조회 실패를 같은 코드로 끝낸다. 어느 쪽이든 아무것도 멈추기 전에 2로 끝낸다.
  docker image inspect "${image}" >/dev/null 2>&1 && continue
  if [ -n "${db_image}" ] && [ "${image}" = "${db_image}" ]; then
    docker pull -q "${image}" >/dev/null || fail 2 "합성 DB 이미지를 받지 못했습니다: ${image}"
    log "합성 DB 이미지를 받았습니다: ${image}"
  else
    fail 2 "이 호스트에 이미지가 없거나 Docker에서 확인하지 못했습니다: ${image} (먼저 빌드하거나 받아 두고, Docker가 응답하는지 확인합니다)"
  fi
done
log "대상 이미지:"
for image in ${images}; do
  # 이미지 ID는 교체 기록에 남기는 값이므로, 조회하지 못하면 빈 값으로 적고 넘어가지 않고 아무것도 멈추기 전에 끝낸다.
  image_id=$(docker image inspect -f '{{.Id}}' "${image}") || fail 2 "Docker에서 이미지 ID를 확인하지 못했습니다: ${image}"
  log "  ${image} -> ${image_id}"
done
# 교체 전에 실행 중인 서비스는 3)에서 강제 종료 여부를 본다. 실행 중이었는지 조회하지 못하면 그 판정을 할 수 없으므로
# 아무것도 멈추지 않고 끝낸다(기존 실행은 그대로 둔다).
was_running=""
for service in web api worker; do
  status=$(container_status "${project}-${service}") \
    || fail 3 "Docker에서 교체 전 ${service} 실행 상태를 확인하지 못했습니다. 강제 종료 여부를 판정할 수 없으므로 아무것도 멈추지 않고 끝냅니다."
  if [ "${status}" = absent ]; then
    log "교체 전 ${service}: 컨테이너 없음"
    continue
  fi
  log "교체 전 ${service}: $(state "${project}-${service}")"
  case "${status}" in true\ *) was_running="${was_running} ${service}" ;; esac
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

# 3) 종료 확인. 세 서비스를 모두 확인한 뒤 판단한다. 실행이 남았거나 상태·종료 코드를 조회하지 못하면 멈춘다(3).
# 교체 전에 실행 중이던 서비스가 강제 종료(137)됐으면 정상 교체로 보지 않는다(7). 3으로 멈출 때도 이미 확인한 강제 종료와
# 교체 전에 실행 중이던 서비스를 함께 적는다. 다시 실행하면 멈춘 서비스는 강제 종료 판정에서 빠지므로 운영자가 확인할 대상이다.
# 컨테이너가 없는 서비스(처음 설치)는 멈춘 것으로 본다.
forced="" absent_now="" left="" unknown="" vanished=""
for service in web api worker; do
  if ! ids=$(running_ids "${service}"); then
    unknown="${unknown} ${service}"
    continue
  fi
  if [ -n "${ids}" ]; then
    left="${left} ${service}(${ids//$'\n'/ })"
    continue
  fi
  if ! status=$(container_status "${project}-${service}"); then
    unknown="${unknown} ${service}"
    continue
  fi
  case "${status}" in
    true\ *) left="${left} ${service}(${project}-${service})"; continue ;;
    absent) absent_now="${absent_now} ${service}" ;;
  esac
  case " ${was_running} " in
    *" ${service} "*)
      case "${status}" in
        "false 137") forced="${forced} ${service}" ;;
        absent) vanished="${vanished} ${service}" ;;
      esac ;;
  esac
done
for service in web api worker; do
  case " ${absent_now} " in
    *" ${service} "*) log "종료 확인 ${service}: 컨테이너 없음" ;;
    *) log "종료 확인 ${service}: $(state "${project}-${service}")" ;;
  esac
done
if [ -n "${left}${unknown}${vanished}" ]; then
  fail 3 "종료를 확인하지 못해 새 실행을 시작하지 않습니다.${left:+ 실행이 남아 있습니다:${left}.}${unknown:+ Docker에서 실행 상태·종료 코드를 확인하지 못했습니다:${unknown}.}${vanished:+ 교체 전에 실행 중이던 컨테이너가 없어져 종료 코드를 확인하지 못했습니다:${vanished}.}${forced:+ 대기 상한을 넘어 강제 종료(137)된 서비스도 있습니다:${forced}.} 교체 전 실행 중:${was_running:- 없음}."
fi
if [ -n "${forced}" ]; then
  fail 7 "${forced# }가 대기 상한 안에 끝나지 않아 강제 종료됐습니다. 정상 교체로 보지 않습니다. 로그로 원인을 확인한 뒤 다시 실행합니다."
fi
# 성공한 migration 실행은 4)에서 지우므로, 남은 실행 컨테이너는 실패·결과 불명이거나 성공했지만 지우지 못한(8) 실행이다.
# 어느 쪽인지 여기서 다시 판정하지 않고 멈춘다(되돌리기 경로도 막는다).
leftover=$(docker ps -a --filter "label=com.docker.compose.project=${project}" --filter "label=com.docker.compose.service=migration" --format '{{.Names}} {{.Status}}') \
  || fail 3 "Docker에서 이전 migration 실행 상태를 확인하지 못했습니다."
if [ -n "${leftover}" ]; then
  fail 5 "이전 migration 실행이 남아 있습니다(${leftover//$'\n'/, }). 앞선 교체가 8(migration 성공·정리 실패)로 끝났고 그 기록의 실행 이름·종료 코드 0과 같으며 compose.env를 바꾸지 않았다면, 직접 지운 뒤 --migrate 없이 다시 실행합니다. 그 밖에는 로그와 DB 적용 이력을 확인하고 직접 지운 뒤 다시 실행합니다."
fi

# 4) migration: 이미지마다 정해진 이름으로 한 번만 실행한다.
# 실행 전 준비 조회(이미지 이름·ID, 같은 이름 실행)가 실패하면 서비스는 멈춘 채 migration을 시작하지 않고 2로 끝낸다.
if [ "${local_db}" = true ]; then
  "${compose[@]}" up -d --wait --wait-timeout 120 db || fail 2 "합성 DB가 정상 확인에 실패했습니다. web·api·worker는 멈춘 상태이고 migration·새 실행은 시작하지 않았습니다."
fi
if [ "${migrate}" = true ]; then
  not_started="web·api·worker는 멈춘 상태이고 migration은 시작하지 않았습니다."
  migration_image=$("${compose[@]}" --profile migration config --images migration) \
    || fail 2 "compose 설정에서 migration 이미지를 읽지 못했습니다. ${not_started}"
  migration_id=$(docker image inspect -f '{{.Id}}' "${migration_image}") \
    || fail 2 "Docker에서 migration 이미지(${migration_image})를 확인하지 못했습니다. ${not_started}"
  migration_id=${migration_id#sha256:}
  run_name="${project}-migration-${migration_id:0:12}"
  status=$(container_status "${run_name}") \
    || fail 2 "Docker에서 같은 이름의 migration 실행(${run_name})이 있는지 확인하지 못했습니다. ${not_started}"
  [ "${status}" = absent ] || fail 5 "같은 이름의 migration 실행(${run_name})이 이미 있습니다."
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
    log "migration 성공: ${run_name}"
    # 지우지 못해도 적용은 확인된 상태다. 실패(4)·결과 불명(5)과 나눠 8로 멈추고, 다시 실행하거나 강제로 지우지 않는다.
    docker rm "${run_name}" >/dev/null \
      || fail 8 "migration은 성공했지만 실행 컨테이너(${run_name})를 지우지 못했습니다. web·api·worker는 멈춘 상태입니다. 이 컨테이너가 exited 0인지 확인하고 직접 지운 뒤, compose.env를 바꾸지 않고 --migrate 없이 다시 실행합니다. 지우지 않고 다시 실행하면 남은 실행으로 보고 5로 멈춥니다."
    log "실행 컨테이너를 지웠습니다: ${run_name}"
  elif [ "${recorded#exited }" != "${recorded}" ] && [ "${recorded}" != "exited 0" ]; then
    fail 4 "migration 실패(${recorded}). 컨테이너 ${run_name}과 DB 적용 이력을 확인하기 전에는 다시 실행하거나 새 실행을 시작하지 않습니다."
  else
    fail 5 "migration 결과가 불분명합니다(${recorded}). 실행 상태와 DB 적용 이력을 확인한 뒤 담당자가 판단합니다."
  fi
fi

# 5) 새 실행: api → worker → web. 이미지가 바뀐 서비스는 기존(멈춘) 컨테이너를 지우고 새로 만든다.
# 하나라도 정상 확인에 실패하면 이미 시작한 서비스까지 다시 멈춰, 반쯤 열린 상태로 두지 않는다.
# 세 서비스의 종료를 조회로 확인한 경우에만 6으로 끝낸다. 실행이 남았거나 조회가 실패하면 멈췄다고 보지 않고 3으로 끝낸다.
fail_started() {
  # `||`의 마지막 명령으로 불리므로 이 안에서도 set -e가 켜져 있다. 실패할 수 있는 명령은 모두 `||`나 if로 받아
  # 3·6 판정까지 가게 한다(받지 않으면 정의되지 않은 코드 1로 끝난다).
  local message=$1 service ids unknown="" left=""
  log "새 실행 실패: ${message} 세 서비스를 다시 멈춥니다."
  for service in web api worker; do
    "${compose[@]}" stop -t "${stop_timeout}" "${service}" || log "중지 명령이 실패했습니다: ${service}"
  done
  for service in web api worker; do log "멈춘 뒤 ${service}: $(state "${project}-${service}")"; done
  for service in web api worker; do
    if ! ids=$(running_ids "${service}"); then
      unknown="${unknown} ${service}"
    elif [ -n "${ids}" ]; then
      left="${left} ${service}"
    fi
  done
  # 조회 실패와 남은 실행이 함께 있으면 둘 다 적는다.
  [ -z "${unknown}${left}" ] || fail 3 "${message}${unknown:+ Docker에서${unknown} 실행 상태를 확인하지 못했습니다. 멈췄다고 보지 않습니다.}${left:+${left} 실행이 남아 있습니다.} 직접 확인합니다."
  fail 6 "${message} 세 서비스의 종료를 확인했습니다. 원인 확인: docker logs <컨테이너 이름>"
}
for service in api worker web; do
  log "${service} 시작"
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 "${service}" \
    || fail_started "${service}가 정상 확인에 실패했습니다."
done
stop_ended=$(date +%s)
# 완료 전에 세 서비스를 다시 본다. 앞 서비스는 각자 정상 확인을 통과했어도 뒤 서비스를 띄우는 동안 다시 시작되는 중이거나
# (restart: unless-stopped) 비정상일 수 있으므로, 실행 수와 함께 지금의 health가 healthy인지 세 서비스 모두 본 뒤 판단한다.
# 지금 시점의 health만 보므로, 그 사이 다시 시작됐다가 이미 healthy로 돌아온 경우는 잡지 못한다.
not_healthy="" health_unknown=""
for service in api worker web; do
  ids=$(running_ids "${service}") || fail_started "Docker에서 ${service} 실행 상태를 확인하지 못했습니다."
  count=$(printf '%s\n' "${ids}" | grep -c . || true)
  [ "${count}" = 1 ] || fail_started "${service} 실행 수가 1이 아닙니다(${count})."
  if ! health=$(docker inspect --type container -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${ids}"); then
    health_unknown="${health_unknown} ${service}"
  elif [ "${health}" != healthy ]; then
    not_healthy="${not_healthy} ${service}(${health})"
  fi
  log "교체 후 ${service}: $(state "${project}-${service}")"
done
[ -z "${not_healthy}${health_unknown}" ] \
  || fail_started "완료 확인 실패.${not_healthy:+ 정상(healthy)이 아닌 서비스:${not_healthy}.}${health_unknown:+ Docker에서 health를 확인하지 못한 서비스:${health_unknown}.}"
log "완료. 중지 시작부터 web 정상 확인까지 $((stop_ended - stop_started))초"
