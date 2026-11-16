#!/bin/bash
# worker 큐 소비자(127.0.0.1:8000/health)를 띄운다. 실제 GitHub와 Claude, 판정이 켜져 있으면 OpenAI를 부른다. 하나만 띄운다. Ctrl+C로 끝낸다.
# 로그는 환경 폴더의 logs/에 쌓이고 화면에는 나오지 않는다.
set -euo pipefail
. "$(dirname "$0")/common.sh"
# 셸에 남아 있던 판정 설정은 버린다. 판정은 worker.env에서 켠 경우에만 돈다.
unset CATCHU_JUDGEMENT_PROVIDER CATCHU_JUDGEMENT_API_KEY
load_env "${LIVE_DIR}/worker.env"
load_keys "${LIVE_DIR}/secrets.env" CATCHU_GENERATION_API_KEY
# 판정을 OpenAI로 켰으면 판정 키가 있어야 한다. 키가 없으면 판정이 조용히 꺼지므로 여기서 멈춘다.
if [ "${CATCHU_JUDGEMENT_PROVIDER:-}" = "openai" ]; then
  load_keys "${LIVE_DIR}/secrets.env" CATCHU_JUDGEMENT_API_KEY
fi
echo "판정: ${CATCHU_JUDGEMENT_PROVIDER:-꺼짐}"
cd "${REPO_ROOT}/worker"
log="${LIVE_DIR}/logs/worker-$(date +%Y%m%d-%H%M%S).log"
echo "worker를 띄운다. 로그: ${log}"
echo "확인(다른 터미널): curl -i http://127.0.0.1:8000/health"
uv run --locked python -m app.consumer --host 127.0.0.1 --port 8000 > "${log}" 2>&1
