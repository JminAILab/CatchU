#!/bin/bash
# DB 테이블을 만든다(이주). 처음 한 번, 그리고 새 이주가 든 브랜치를 받았을 때 다시 돌린다. 자료를 지우지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"
docker start "${LIVE_DB}" "${LIVE_QUEUE}" >/dev/null
ready=0
for _ in $(seq 1 30); do
  if docker exec "${LIVE_DB}" pg_isready -U catchu -d catchu -q; then ready=1; break; fi
  sleep 1
done
[ "${ready}" = 1 ] || { echo "DB가 30초 안에 준비되지 않았다: docker logs ${LIVE_DB}" >&2; exit 1; }
load_env "${LIVE_DIR}/api.env"
cd "${REPO_ROOT}/api"
npm run build --silent
node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js | tail -n 3
echo "이주 끝"
