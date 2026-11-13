#!/bin/bash
# web(http://localhost:3000)을 개발 모드로 띄운다. Ctrl+C로 끝낸다.
# 브라우저는 반드시 http://localhost:3000으로 연다(127.0.0.1:3000은 로그인 콜백 주소와 맞지 않는다).
set -euo pipefail
. "$(dirname "$0")/common.sh"
load_env "${LIVE_DIR}/web.env"
cd "${REPO_ROOT}/web"
log="${LIVE_DIR}/logs/web-$(date +%Y%m%d-%H%M%S).log"
echo "web을 띄운다. 로그: ${log}"
echo "브라우저: http://localhost:3000/login"
npm run dev > "${log}" 2>&1
