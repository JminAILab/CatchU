#!/bin/bash
# api(127.0.0.1:3001)를 띄운다. Ctrl+C로 끝낸다. 로그는 환경 폴더의 logs/에 쌓이고 화면에는 나오지 않는다.
# 임베딩 키는 넣지 않는다(개발 모드의 합성 제공자로 뜨며 Voyage로 자료를 보내지 않는다).
set -euo pipefail
. "$(dirname "$0")/common.sh"
load_env "${LIVE_DIR}/api.env"
load_keys "${LIVE_DIR}/secrets.env" GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET CATCHU_GENERATION_API_KEY
docker start "${LIVE_DB}" "${LIVE_QUEUE}" >/dev/null
cd "${REPO_ROOT}/api"
npm run build --silent
log="${LIVE_DIR}/logs/api-$(date +%Y%m%d-%H%M%S).log"
echo "api를 띄운다. 로그: ${log}"
echo "확인(다른 터미널): curl -i http://127.0.0.1:3001/health"
node dist/main.js > "${log}" 2>&1
