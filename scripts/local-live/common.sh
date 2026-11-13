# 로컬 실제 분석 실행 도구의 공통 부분. 다른 스크립트가 불러 쓴다. 사용법은 docs/CatchU_로컬통합실행.md 「실제 분석까지 띄우기」.
# 환경 폴더(저장소 밖)에 내 키와 실행 값, GitHub 접근 정보 암호문, PDF 파일, 로그를 둔다.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIVE_DIR="${CATCHU_LOCAL_LIVE_DIR:-${HOME}/catchu-local-live}"
LIVE_DB="${CATCHU_LOCAL_LIVE_DB_NAME:-catchu-live-db}"
LIVE_QUEUE="${CATCHU_LOCAL_LIVE_QUEUE_NAME:-catchu-live-queue}"
LIVE_DB_PORT="${CATCHU_LOCAL_LIVE_DB_PORT:-55432}"
LIVE_QUEUE_PORT="${CATCHU_LOCAL_LIVE_QUEUE_PORT:-56379}"
export REPO_ROOT LIVE_DIR LIVE_DB LIVE_QUEUE LIVE_DB_PORT LIVE_QUEUE_PORT

# KEY=VALUE 줄만 읽어 내보낸다. 파일 내용을 셸 명령으로 실행하지 않는다.
load_env() {
  local line
  [ -f "$1" ] || { echo "파일이 없다: $1 (먼저 setup.sh를 실행한다)" >&2; return 1; }
  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    case "${line}" in ''|'#'*) continue ;; esac
    export "${line%%=*}=${line#*=}"
  done < "$1"
}

# 파일에서 지정한 키만 읽어 내보낸다. 값이 비어 있으면 멈춘다(값은 출력하지 않는다).
load_keys() {
  local file="$1" key line
  shift
  [ -f "${file}" ] || { echo "파일이 없다: ${file} (먼저 setup.sh를 실행한다)" >&2; return 1; }
  for key in "$@"; do
    line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
    line="${line%$'\r'}"
    if [ -z "${line#*=}" ]; then
      echo "${key} 값이 비어 있다: ${file}" >&2
      return 1
    fi
    export "${key}=${line#*=}"
  done
}

# 파일에서 지정한 키를 읽어, 값이 있을 때만 내보낸다(값은 출력하지 않는다).
load_optional_keys() {
  local file="$1" key line
  shift
  [ -f "${file}" ] || { echo "파일이 없다: ${file} (먼저 setup.sh를 실행한다)" >&2; return 1; }
  for key in "$@"; do
    line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
    line="${line%$'\r'}"
    [ -n "${line#*=}" ] && export "${key}=${line#*=}"
  done
  return 0
}
