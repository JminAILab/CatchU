#!/bin/bash
# 로컬 실제 분석 환경을 한 번 만든다. 이미 있는 파일과 컨테이너는 그대로 둔다.
# - 환경 폴더(기본 ~/catchu-local-live): secrets.env(내 키를 직접 적는다)·api.env·worker.env·web.env
# - DB: pgvector가 든 PostgreSQL 16 컨테이너(127.0.0.1:55432). 큐: Valkey 컨테이너(127.0.0.1:56379)
# 로컬 전용 서명 키와 DB 비밀번호는 새 난수로 만들고 화면에 내지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"

umask 077
mkdir -p "${LIVE_DIR}/logs" "${LIVE_DIR}/github-credentials" "${LIVE_DIR}/files"
chmod 700 "${LIVE_DIR}" "${LIVE_DIR}/logs" "${LIVE_DIR}/github-credentials" "${LIVE_DIR}/files"

hex() { openssl rand -hex 32; }

if [ -e "${LIVE_DIR}/secrets.env" ]; then
  echo "secrets.env가 이미 있어 그대로 둔다."
else
  {
    echo "# 내 키. 이 파일은 저장소 밖에만 두고 화면·로그·PR·대화에 붙이지 않는다."
    echo "# 어디서 받는지는 docs/CatchU_로컬통합실행.md 「키」."
    echo "# 팀장에게 받는 값 네 개(로그인·GitHub 연결)"
    echo "GOOGLE_CLIENT_ID="
    echo "GOOGLE_CLIENT_SECRET="
    echo "GITHUB_OAUTH_CLIENT_ID="
    echo "GITHUB_OAUTH_CLIENT_SECRET="
    echo "# 각자 발급하는 값 세 개. 차례로 Claude API 키, OpenAI 키(판정), Voyage 키(발행 링크의 질의응답. 비우면 합성 제공자)"
    echo "CATCHU_GENERATION_API_KEY="
    echo "CATCHU_JUDGEMENT_API_KEY="
    echo "CATCHU_EMBEDDING_API_KEY="
  } > "${LIVE_DIR}/secrets.env"
  echo "만듦: ${LIVE_DIR}/secrets.env (값 일곱 개를 직접 적는다)"
fi

if [ -e "${LIVE_DIR}/api.env" ] || [ -e "${LIVE_DIR}/worker.env" ] || [ -e "${LIVE_DIR}/web.env" ]; then
  echo "api.env·worker.env·web.env가 이미 있어 그대로 둔다."
else
  worker_key="$(hex)"
  db_password="$(openssl rand -hex 24)"
  {
    echo "NODE_ENV=development"
    echo "PORT=3001"
    echo "AUTH_JWT_SECRET=$(hex)"
    echo "AUTH_ACCESS_TOKEN_TTL_SECONDS=900"
    echo "AUTH_WEB_ORIGIN=http://localhost:3000"
    echo "CORS_ALLOWED_ORIGINS=http://localhost:3000"
    echo "LINK_GRANT_SECRET=$(hex)"
    echo "DEV_LOGIN_ENABLED=false"
    echo "DB_HOST=127.0.0.1"
    echo "DB_PORT=${LIVE_DB_PORT}"
    echo "DB_USER=catchu"
    echo "DB_PASSWORD=${db_password}"
    echo "DB_NAME=catchu"
    echo "GOOGLE_LOGIN_ENABLED=true"
    echo "GOOGLE_REDIRECT_URI=http://localhost:3000/google/callback"
    echo "GITHUB_CONNECTION_ENABLED=true"
    echo "GITHUB_OAUTH_CALLBACK_URL=http://localhost:3000/github/callback"
    echo "GITHUB_CREDENTIAL_DIRECTORY=${LIVE_DIR}/github-credentials"
    echo "GITHUB_CREDENTIAL_ENCRYPTION_KEY=$(hex)"
    echo "WORKER_CONTEXT_ENABLED=true"
    echo "WORKER_CONTEXT_API_KEY=${worker_key}"
    echo "CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:${LIVE_QUEUE_PORT}"
    echo "CATCHU_QUEUE_PREFIX=catchulive"
    echo "FILE_STORAGE_DRIVER=local"
    echo "FILE_STORAGE_LOCAL_ROOT=${LIVE_DIR}/files"
  } > "${LIVE_DIR}/api.env"
  {
    echo "NODE_ENV=development"
    echo "CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:${LIVE_QUEUE_PORT}"
    echo "CATCHU_QUEUE_PREFIX=catchulive"
    echo "CATCHU_WORKER_MOCK=false"
    echo "WORKER_CONTEXT_API_URL=http://127.0.0.1:3001"
    echo "WORKER_CONTEXT_API_KEY=${worker_key}"
    echo "PDF_FILE_ROOT=${LIVE_DIR}/files"
    echo "# 판정(AI 쪽)은 OpenAI로 켠다. 판정 키는 secrets.env의 CATCHU_JUDGEMENT_API_KEY에서 읽는다. 바꾸는 방법은 안내의 「판정」."
    echo "CATCHU_JUDGEMENT_PROVIDER=openai"
  } > "${LIVE_DIR}/worker.env"
  {
    # web(localhost)과 같은 사이트여야 로그인 유지 쿠키(SameSite=Strict)가 실린다. 127.0.0.1로 바꾸지 않는다.
    echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:3001"
    echo "NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true"
    echo "NEXT_PUBLIC_DEV_LOGIN_ENABLED=false"
  } > "${LIVE_DIR}/web.env"
  echo "만듦: ${LIVE_DIR}/api.env·worker.env·web.env (키 값은 화면에 내지 않음)"
fi

if docker inspect "${LIVE_DB}" >/dev/null 2>&1; then
  echo "컨테이너 ${LIVE_DB}가 이미 있어 그대로 둔다."
else
  db_password="$(grep -E '^DB_PASSWORD=' "${LIVE_DIR}/api.env" | cut -d= -f2-)"
  db_port="$(grep -E '^DB_PORT=' "${LIVE_DIR}/api.env" | cut -d= -f2-)"
  docker run -d --name "${LIVE_DB}" --restart unless-stopped -p "127.0.0.1:${db_port}:5432" \
    -e POSTGRES_USER=catchu -e POSTGRES_DB=catchu -e POSTGRES_PASSWORD="${db_password}" \
    pgvector/pgvector:0.8.7-pg16-trixie >/dev/null
  echo "만듦: 컨테이너 ${LIVE_DB} (127.0.0.1:${db_port})"
fi
if docker inspect "${LIVE_QUEUE}" >/dev/null 2>&1; then
  echo "컨테이너 ${LIVE_QUEUE}가 이미 있어 그대로 둔다."
else
  queue_url="$(grep -E '^CATCHU_QUEUE_REDIS_URL=' "${LIVE_DIR}/api.env" | cut -d= -f2-)"
  queue_port="${queue_url##*:}"
  docker run -d --name "${LIVE_QUEUE}" --restart unless-stopped -p "127.0.0.1:${queue_port}:6379" \
    valkey/valkey:8.1.6-alpine valkey-server --save "" --appendonly no --maxmemory-policy noeviction >/dev/null
  echo "만듦: 컨테이너 ${LIVE_QUEUE} (127.0.0.1:${queue_port})"
fi
echo "다음: ${LIVE_DIR}/secrets.env에 내 키를 적은 뒤 migrate.sh를 실행한다."
