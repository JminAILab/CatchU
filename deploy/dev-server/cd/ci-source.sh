#!/usr/bin/env bash
# 자동 배포(#313)의 배포할 커밋 확인·꺼내기. deploy-dev-server 워크플로가 배포 도구 쪽 작업 폴더(main 판본, 전체 이력) 루트에서 부른다.
#   check:    배포할 커밋이 main의 first-parent 커밋인지 본다. main에 반영된 판본만 받는다.
#             merge commit으로 반영된 PR 안의 중간 커밋은 main의 조상이지만, 승인된 최종 판본이 아니므로 받지 않는다.
#             도구 커밋(작업 폴더 HEAD)을 tools로 낸다.
#   checkout: check와 같은 확인을 다시 한 뒤, 배포할 커밋이 작업 폴더와 다르면 저장소 밖 worktree로 꺼내 그 위치를 dir로 낸다.
# 필요한 환경: COMMIT, GITHUB_OUTPUT, (checkout) RUNNER_TEMP·GITHUB_WORKSPACE.
set -euo pipefail

[[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::COMMIT 형식이 틀렸다"; exit 2; }
git rev-parse -q --verify origin/main > /dev/null || { echo "::error::origin/main을 읽지 못했다"; exit 2; }

# 도구 커밋도 main에 반영된 판본이어야 한다(push·main 수동 실행이면 main 최신이다).
tools=$(git rev-parse HEAD)
first_parent=$(git rev-list --first-parent origin/main)
grep -qx "$tools" <<< "$first_parent" || { echo "::error::배포 도구 커밋 ${tools}가 main에 반영된 판본이 아니다"; exit 1; }
grep -qx "$COMMIT" <<< "$first_parent" || {
  echo "::error::${COMMIT}는 main에 반영된 판본(first-parent 커밋)이 아니다. PR 안의 중간 커밋은 배포하지 않는다"
  exit 1
}
echo "tools=${tools}" >> "$GITHUB_OUTPUT"

case "${1:-}" in
  check)
    echo "배포할 커밋 ${COMMIT}: main에 반영된 판본"
    ;;
  checkout)
    if [ "$tools" = "$COMMIT" ]; then
      dir=$GITHUB_WORKSPACE
    else
      dir=$RUNNER_TEMP/src
      git worktree add --detach "$dir" "$COMMIT"
    fi
    echo "dir=${dir}" >> "$GITHUB_OUTPUT"
    printf -- '- 배포 도구 판본: `%s`\n' "$tools" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    ;;
  *) echo "사용: ci-source.sh check|checkout" >&2; exit 2 ;;
esac
