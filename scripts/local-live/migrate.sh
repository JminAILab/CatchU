#!/bin/bash
# DB 테이블을 만든다(이주). 처음 한 번, 그리고 새 이주가 든 브랜치를 받았을 때 다시 돌린다. 자료를 지우지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"
load_env "${LIVE_DIR}/api.env"
start_containers "${DB_PORT}"
cd "${REPO_ROOT}/api"
npm run build --silent || { echo "api 빌드가 실패했다: (cd api && npm run build)로 오류를 본다" >&2; exit 1; }
# 실패하면 끝의 열다섯 줄을 보여 준다(조용히 끝나지 않게). 이주 출력에는 키가 없다.
if out="$(node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js 2>&1)"; then
  printf '%s\n' "${out}" | tail -n 3
  echo "이주 끝"
else
  printf '%s\n' "${out}" | tail -n 15 >&2
  echo "이주가 실패했다. 위 오류를 보고, 방금 컴퓨터를 켰다면 잠시 뒤 다시 돌린다." >&2
  exit 1
fi
