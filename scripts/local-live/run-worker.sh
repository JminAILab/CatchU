#!/bin/bash
# worker 큐 소비자(127.0.0.1:8000/health)를 띄운다. 실제 GitHub와 Claude를 부른다. 하나만 띄운다. Ctrl+C로 끝낸다.
# 로그는 환경 폴더의 logs/에 쌓이고 화면에는 나오지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"
load_env "${LIVE_DIR}/worker.env"
load_keys "${LIVE_DIR}/secrets.env" CATCHU_GENERATION_API_KEY
cd "${REPO_ROOT}/worker"
log="${LIVE_DIR}/logs/worker-$(date +%Y%m%d-%H%M%S).log"
echo "worker를 띄운다. 로그: ${log}"
echo "확인(다른 터미널): curl -i http://127.0.0.1:8000/health"
uv run --locked python -m app.consumer --host 127.0.0.1 --port 8000 > "${log}" 2>&1
