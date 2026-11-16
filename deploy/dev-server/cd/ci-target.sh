#!/usr/bin/env bash
# 자동 배포의 배포 대상 정하기(#342). deploy-dev-server 워크플로의 plan job이 부른다.
# 저장소 변수 DEPLOY_TARGET으로 main 반영 뒤 어디까지 할지 고른다.
#   dev-server: 이미지를 검사해 ECR에 올리고 개발 서버를 교체한다.
#   eks:        이미지를 검사해 ECR에 올리고 EKS에서 교체한다(deploy/aws/cd/ci-deploy.sh).
#   none:       이미지를 검사해 ECR에 올리기까지만 한다. 서버는 바꾸지 않는다(전환하거나 손으로 교체하는 동안).
# 값이 없거나 이 밖의 값이면 아무것도 하지 않고 실패로 끝난다(이미지도 올리지 않는다).
# 값을 넣기 전에 main에 반영되거나 값을 잘못 넣었을 때 배포를 조용히 건너뛰지 않고 실행이 실패로 보이게 하려는 것이다.
# 앞뒤 공백·대소문자가 다른 값도 받지 않는다.
# 필요한 환경: DEPLOY_TARGET, GITHUB_OUTPUT, (dev-server) DEV_SERVER_INSTANCE_ID.
set -euo pipefail

target=${DEPLOY_TARGET:-}
case "$target" in
  dev-server)
    [[ "${DEV_SERVER_INSTANCE_ID:-}" =~ ^i-[0-9a-f]{8,17}$ ]] || {
      echo "::error::environment 비밀값 DEV_SERVER_INSTANCE_ID가 비었거나 형식이 틀렸다"
      exit 1
    }
    does='이미지를 올리고 개발 서버를 교체한다'
    ;;
  eks) does='이미지를 올리고 EKS에서 교체한다' ;;
  none) does='이미지만 올리고 서버는 바꾸지 않는다' ;;
  '')
    echo "::error::저장소 변수 DEPLOY_TARGET이 없다. dev-server·eks·none 가운데 하나를 넣은 뒤 main에서 수동 실행한다(deploy/dev-server/cd/README.md 「배포 대상」)"
    exit 1
    ;;
  *)
    echo "::error::저장소 변수 DEPLOY_TARGET은 dev-server·eks·none 가운데 하나여야 한다. 고친 뒤 main에서 수동 실행한다(deploy/dev-server/cd/README.md 「배포 대상」)"
    exit 1
    ;;
esac
echo "target=${target}" >> "$GITHUB_OUTPUT"
echo "배포 대상 ${target}: ${does}"
printf -- '- 배포 대상: `%s`(%s)\n' "$target" "$does" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
