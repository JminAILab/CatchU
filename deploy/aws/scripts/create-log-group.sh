#!/usr/bin/env bash
# 앱 로그를 받을 CloudWatch 로그 그룹 /catchu/eks/app을 보존 14일로 만든다(#276 1단계 2번, 클러스터보다 먼저).
# 수집기(aws-for-fluent-bit, ../logging/)는 그룹을 만들지 않고 이 그룹에 쓰기만 한다. 수집기가 그룹을 스스로 만들면 보존이 '영구'가 되기 때문이다.
# 그룹은 비어 있으면 요금이 없다. 암호화는 CloudWatch Logs 기본 암호화를 쓴다.
# 인자 없이 실행하면 확인만 한다. --apply를 주면 만들고 보존 기간을 건 뒤 확인 값을 찍는다.
# 깨끗할 때 한 번 만드는 용도다. 그룹이 이미 있으면 확인 모드에서도 아무것도 만들지 않고 멈춘다. 보존 기간을 걸기 전에 멈췄으면
# aws logs delete-log-group --log-group-name /catchu/eks/app --profile catchu --region ap-northeast-2로 지운 뒤 다시 실행한다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

mode=check
case "${1:-}" in
  --apply) mode=apply ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

group=/catchu/eks/app
retention=14

catchu_require_tools aws jq
catchu_guard_aws

n=$(catchu_count "로그 그룹 ${group}" logs describe-log-groups --log-group-name-prefix "$group" \
  --query "length(logGroups[?logGroupName=='${group}'])")
found=()
[ "$n" = 0 ] || found+=("로그 그룹 ${group}")
catchu_require_clean ${found[@]+"${found[@]}"}

catchu_info "만들 것: 로그 그룹 ${group}(보존 ${retention}일)"
if [ "$mode" != apply ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

aws_catchu logs create-log-group --log-group-name "$group" --tags project=catchu,issue=276
catchu_info "로그 그룹 ${group}: 만듦"
aws_catchu logs put-retention-policy --log-group-name "$group" --retention-in-days "$retention"
catchu_info "보존 기간: ${retention}일"

catchu_info "확인 값:"
aws_catchu logs describe-log-groups --log-group-name-prefix "$group" --output json |
  jq --arg g "$group" '[.logGroups[] | select(.logGroupName == $g) | {logGroupName, retentionInDays, kmsKeyId}]'
