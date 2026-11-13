#!/bin/bash
# api(127.0.0.1:3001)를 띄운다. Ctrl+C로 끝낸다. 로그는 환경 폴더의 logs/에 쌓이고 화면에는 나오지 않는다.
# 임베딩 키(Voyage)는 secrets.env에 있을 때만 쓴다. 없으면 개발 모드의 합성 제공자로 뜨며 Voyage로 자료를 보내지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"
# 셸에 남아 있던 임베딩 키는 버린다. 임베딩 키는 환경 폴더의 파일에 넣은 경우에만 쓴다.
unset CATCHU_EMBEDDING_API_KEY
load_env "${LIVE_DIR}/api.env"
load_keys "${LIVE_DIR}/secrets.env" GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET CATCHU_GENERATION_API_KEY
load_optional_keys "${LIVE_DIR}/secrets.env" CATCHU_EMBEDDING_API_KEY
if [ -n "${CATCHU_EMBEDDING_API_KEY:-}" ]; then echo "임베딩: Voyage"; else echo "임베딩: 합성 제공자(발행 링크의 질의응답 결과는 믿을 수 없다)"; fi
start_containers "${DB_PORT}"
cd "${REPO_ROOT}/api"
npm run build --silent
log="${LIVE_DIR}/logs/api-$(date +%Y%m%d-%H%M%S).log"
echo "api를 띄운다. 로그: ${log}"
echo "확인(다른 터미널): curl -i http://127.0.0.1:3001/health"
node dist/main.js > "${log}" 2>&1
