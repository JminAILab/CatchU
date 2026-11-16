#!/usr/bin/env bash
# 배포 대상 정하기(#342) 회귀 시험. ci-target.sh를 값마다 실제로 실행하고, deploy-dev-server 워크플로가 그 결과를 쓰는 자리를 본다.
# 지키려는 것: 배포 대상 값이 없거나 틀리면 실행이 실패로 끝난다(조용히 건너뛰지 않는다). none이면 이미지 올리기는 돌고 서버 교체만 건너뛴다.
#   개발 서버 교체 단계는 dev-server에서만, EKS 교체 단계는 eks에서만 돌고, AWS 역할(environment)도 대상을 따른다.
# AWS·GitHub에는 닿지 않는다. 필요한 것은 bash·awk·grep뿐이다. 워크플로 파일은 글자로 읽으므로 그 단계의 줄 모양을 바꾸면 이 시험도 고친다.
# 사용: bash deploy/dev-server/cd/ci-target.test.sh   (작업 폴더 어디서든. 실패가 하나라도 있으면 종료 코드 1)
# GitHub Actions의 images 워크플로(cd-scripts job)도 같은 명령을 쓴다.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SUT=$HERE/ci-target.sh
WORKFLOW=$HERE/../../../.github/workflows/deploy-dev-server.yml
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
pass=0
fail=0

check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "통과 $1"; else fail=$((fail + 1)); echo "실패 $1"; fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }

# ---------- ci-target.sh: 값마다 실행 ----------
INSTANCE_ID=i-0123456789abcdef0 # 합성 서버 ID. 사례에서 SERVER_ID로 바꾼다(빈 값도 된다).
run_sut() { # 값(인자가 없으면 변수 자체가 없다). 종료 코드를 찍고, 출력은 $WORK/out, 워크플로 출력은 $WORK/output에 둔다.
  : > "$WORK/output"
  if [ "$#" = 0 ]; then
    env -u DEPLOY_TARGET DEV_SERVER_INSTANCE_ID="${SERVER_ID-$INSTANCE_ID}" GITHUB_OUTPUT="$WORK/output" GITHUB_STEP_SUMMARY="$WORK/summary" bash "$SUT" > "$WORK/out" 2>&1
  else
    DEPLOY_TARGET=$1 DEV_SERVER_INSTANCE_ID="${SERVER_ID-$INSTANCE_ID}" GITHUB_OUTPUT="$WORK/output" GITHUB_STEP_SUMMARY="$WORK/summary" bash "$SUT" > "$WORK/out" 2>&1
  fi
  echo $?
}
accepted() { # 값: 종료 0이고 워크플로 출력이 target=<값> 한 줄
  local rc
  rc=$(run_sut "$1")
  [ "$rc" = 0 ] && [ "$(cat "$WORK/output")" = "target=$1" ]
  echo $?
}
refused() { # [값]: 종료 1, 워크플로 출력 없음, 오류 줄에 변수 이름
  local rc
  rc=$(run_sut "$@")
  [ "$rc" = 1 ] && [ ! -s "$WORK/output" ] && grep -q '^::error::저장소 변수 DEPLOY_TARGET' "$WORK/out"
  echo $?
}

check "dev-server: 받는다" "$(accepted dev-server)"
check "eks: 받는다" "$(accepted eks)"
check "none: 받는다" "$(accepted none)"
check "eks·none: 서버 ID가 없어도 받는다" "$( [ "$(SERVER_ID='' accepted eks)" = 0 ] && [ "$(SERVER_ID='' accepted none)" = 0 ]; echo $?)"
rc=$(SERVER_ID='' run_sut dev-server)
check "dev-server: 서버 ID가 없으면 실패로 끝나고 출력이 없다" "$( [ "$rc" = 1 ] && [ ! -s "$WORK/output" ] && grep -q '^::error::.*DEV_SERVER_INSTANCE_ID' "$WORK/out"; echo $?)"
check "변수 없음: 실패로 끝나고 출력이 없다" "$(refused)"
check "빈 값: 실패로 끝나고 출력이 없다" "$(refused '')"
check "대소문자가 다른 값: 받지 않는다" "$(refused Dev-Server)"
check "뒤에 공백이 붙은 값: 받지 않는다" "$(refused 'none ')"
check "두 줄 값: 받지 않는다" "$(refused $'dev-server\nnone')"
check "모르는 값: 받지 않는다" "$(refused true)"

# ---------- 워크플로: 결과를 쓰는 자리 ----------
# awk의 글자 비교(==)는 로캘의 정렬 순서를 따라, macOS UTF-8 로캘에서는 서로 다른 한글 줄을 같다고 본다. 그래서 index와 길이로 비교한다.
step() { # 단계 이름 → 그 단계의 줄들(다음 단계 앞까지)
  awk -v name="      - name: $1" '
    index($0, name) == 1 && length($0) == length(name) { on = 1; print; next }
    on && /^      - / { exit }
    on && /^  [a-z]/ { exit }
    on { print }
  ' "$WORKFLOW"
}
only_dev_server="        if: needs.plan.outputs.target == 'dev-server'"
only_eks="        if: needs.plan.outputs.target == 'eks'"

check "워크플로: plan이 저장소 변수를 ci-target.sh에 넘긴다" "$(step '배포 대상 확인' | grep -qxF '          DEPLOY_TARGET: ${{ vars.DEPLOY_TARGET }}' && step '배포 대상 확인' | grep -qxF '        run: bash deploy/dev-server/cd/ci-target.sh'; echo $?)"
check "워크플로: 배포 대상 확인에 조건이 없다(늘 돈다)" "$(ok test "$(step '배포 대상 확인' | grep -c '^ *if:')" = 0)"
check "워크플로: plan이 정한 대상을 출력으로 낸다" "$(step '배포 대상 확인' | grep -qxF '        id: deploy_target' && grep -qxF '      target: ${{ steps.deploy_target.outputs.target }}' "$WORKFLOW"; echo $?)"
check "워크플로: 빌드·ECR 올리기에 조건이 없다(none에서도 돈다)" "$(ok test -n "$(step '빌드·ECR 올리기')" -a "$(step '빌드·ECR 올리기' | grep -c '^ *if:')" = 0)"
check "워크플로: 개발 서버 교체는 dev-server일 때만" "$(step '개발 서버 교체' | grep -qxF "$only_dev_server"; echo $?)"
check "워크플로: 바깥 확인은 dev-server일 때만" "$(step '바깥 확인' | grep -qxF "$only_dev_server"; echo $?)"
check "워크플로: kubectl 받기는 eks일 때만" "$(step 'kubectl 받기' | grep -qxF "$only_eks"; echo $?)"
check "워크플로: EKS 교체는 eks일 때만" "$(step 'EKS 교체' | grep -qxF "$only_eks" && step 'EKS 교체' | grep -qxF '        run: bash deploy/aws/cd/ci-deploy.sh'; echo $?)"
check "워크플로: 배포 대상을 보는 단계 조건은 그 넷뿐" "$(ok test "$(grep -c '^ *if:.*outputs\.target' "$WORKFLOW")" = 4)"
check "워크플로: 이미지 단계에 plan이 정한 대상을 넘긴다" "$(step '이미 올린 판본인지 확인' | grep -qxF '          DEPLOY_TARGET: ${{ steps.deploy_target.outputs.target }}' && step '빌드·ECR 올리기' | grep -qxF '          DEPLOY_TARGET: ${{ needs.plan.outputs.target }}'; echo $?)"
# AWS 역할은 environment를 따른다. eks일 때만 environment eks, 그 밖에는 dev-server여야 한다. deploy는 plan이 정한 대상을 따른다.
check "워크플로: environment는 plan·deploy 둘 다 대상을 따른다" "$( [ "$(grep -c '^      name: ' "$WORKFLOW")" = 2 ] && grep -qxF "      name: \${{ vars.DEPLOY_TARGET == 'eks' && 'eks' || 'dev-server' }}" "$WORKFLOW" && grep -qxF "      name: \${{ needs.plan.outputs.target == 'eks' && 'eks' || 'dev-server' }}" "$WORKFLOW"; echo $?)"

echo "합계 통과 ${pass} / 실패 ${fail}"
[ "$fail" = 0 ]
