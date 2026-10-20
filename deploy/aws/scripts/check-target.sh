#!/usr/bin/env bash
# 손으로 치는 생성·변경·삭제 명령(eksctl create/delete, kubectl delete, helm uninstall, 장애 조치 시험 등) 바로 앞에 돌리는 확인(#276).
# 생성 스크립트와 같은 guard.sh로 계정·리전을, --cluster를 주면 ~/.kube/catchu가 지금 catchu 클러스터를 가리키는지도 본다.
# 사용: bash deploy/aws/scripts/check-target.sh [--cluster]   일치하면 종료 0, 아니면 멈춤 문구와 함께 1.
# 통과한 뒤에도 각 명령에는 --profile catchu(eksctl·aws)와 --kubeconfig ~/.kube/catchu(kubectl·helm)를 그대로 붙인다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

case "${1:-}" in
  --cluster)
    catchu_require_tools aws jq kubectl
    catchu_guard_aws
    catchu_guard_cluster
    ;;
  '')
    catchu_require_tools aws
    catchu_guard_aws
    ;;
  *) catchu_die "사용법: $0 [--cluster]" ;;
esac
