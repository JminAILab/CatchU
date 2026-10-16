#!/usr/bin/env bash
# 자동 배포(#313)의 서버 교체 단계. 개발 서버에 SSM 문서 catchu-dev-deploy(ssm-document.yaml)를 보내고 끝날 때까지 기다린다.
# 서버에 보내는 것은 커밋과 digest 다섯 개뿐이다. 서버가 하는 일은 server-deploy.sh에 있다.
# 필요한 환경: COMMIT, WEB_DIGEST·API_DIGEST·MIGRATION_DIGEST·WORKER_DIGEST·FILES_DIGEST, DEV_SERVER_INSTANCE_ID, AWS 자격, GITHUB_RUN_ID.
set -euo pipefail

DOCUMENT=catchu-dev-deploy
WAIT_SECONDS=1500 # 문서의 실행 상한(1200초)보다 조금 길게 기다린다.

[[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::COMMIT 형식이 틀렸다"; exit 2; }
for v in WEB_DIGEST API_DIGEST MIGRATION_DIGEST WORKER_DIGEST FILES_DIGEST; do
  [[ "${!v:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::${v} 형식이 틀렸다"; exit 2; }
done
[[ "${DEV_SERVER_INSTANCE_ID:-}" =~ ^i-[0-9a-f]{8,17}$ ]] || { echo "::error::DEV_SERVER_INSTANCE_ID 형식이 틀렸다"; exit 2; }

params=$(jq -nc --arg c "$COMMIT" --arg w "$WEB_DIGEST" --arg a "$API_DIGEST" --arg m "$MIGRATION_DIGEST" --arg k "$WORKER_DIGEST" --arg f "$FILES_DIGEST" \
  '{Commit:[$c], WebDigest:[$w], ApiDigest:[$a], MigrationDigest:[$m], WorkerDigest:[$k], FilesDigest:[$f]}')
command_id=$(aws ssm send-command --document-name "$DOCUMENT" --instance-ids "$DEV_SERVER_INSTANCE_ID" \
  --parameters "$params" --timeout-seconds 600 --comment "deploy-dev-server run ${GITHUB_RUN_ID:-local}" \
  --query Command.CommandId --output text)
echo "보낸 명령 ${command_id}"

status=Pending
deadline=$((SECONDS + WAIT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 10
  # 보낸 직후에는 실행 기록이 아직 없을 수 있다(InvocationDoesNotExist). 그때는 다시 본다.
  if ! status=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$DEV_SERVER_INSTANCE_ID" --query Status --output text 2>/dev/null); then
    status=Pending
    continue
  fi
  case "$status" in Pending|InProgress|Delayed) continue ;; *) break ;; esac
done

# 서버 출력은 server-deploy.sh가 비밀값을 가린 것이다. SSM은 앞 24,000자까지만 돌려준다.
echo "::group::서버 출력"
aws ssm get-command-invocation --command-id "$command_id" --instance-id "$DEV_SERVER_INSTANCE_ID" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text || true
echo "::endgroup::"
code=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$DEV_SERVER_INSTANCE_ID" --query ResponseCode --output text 2>/dev/null || echo '?')
printf '### 서버 교체\n\n- 명령: `%s`\n- 상태: %s (종료 코드 %s)\n' "$command_id" "$status" "$code" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
case "$status" in
  Success) echo "서버 교체 완료" ;;
  Pending|InProgress|Delayed) echo "::error::${WAIT_SECONDS}초 안에 끝나지 않았다(상태 ${status}). 서버에서 계속 돌 수 있으니 서버 기록을 확인한다"; exit 1 ;;
  *) echo "::error::서버 교체 실패(상태 ${status}, 종료 코드 ${code}). 위 서버 출력과 deploy/dev-server/README.md 「자동 배포」의 실패 대응을 본다"; exit 1 ;;
esac
