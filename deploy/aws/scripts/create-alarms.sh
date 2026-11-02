#!/usr/bin/env bash
# CloudWatch 경보 4개를 만든다(#276 2단계, 2026-10-29 MVP 결정). 경보와 회복(OK)을 SNS 주제 catchu-alerts(create-alert-topic.sh)로 보낸다.
#   catchu-api-no-target    api 대상 그룹의 정상 대상(HealthyHostCount) 최솟값 < 1, 1분씩 5번 연속. 값이 없어도 경보다(대상 그룹이 바뀌거나 사라짐).
#                           api는 한 Pod·Recreate라 배포 중 5분 넘게 내려가 있으면 이 경보가 울린다.
#   catchu-web-no-target    web 대상 그룹, 위와 같다.
#   catchu-alb-target-5xx   ALB가 받은 앱 5xx 응답(HTTPCode_Target_5XX_Count) 합계 ≥ 10, 5분. 요청이 없으면 값이 없으므로 정상으로 본다.
#                           api /health는 DB·큐를 보지 않아, DB가 멈췄을 때는 정상 대상 경보 대신 이 경보로 드러난다.
#   catchu-db-free-storage  RDS catchu-db의 남은 저장 공간 최솟값 < 2GiB, 5분씩 3번 연속. 저장 공간 자동 증가(최대 40GiB)가 따라가지 못할 때다.
# worker·큐·노드 메모리 장애는 잡지 못한다(MVP 결정에서 받아들인 한계).
# Ingress로 ALB가 생긴 뒤(2단계, 앱을 띄운 뒤) 실행한다. 대상 그룹은 Load Balancer Controller가 서비스마다 만든 TargetGroupBinding에서 찾는다.
# 인자 없이 실행하면 확인만 한다. --apply를 주면 만든다(팀장 승인 뒤). 경보는 개당 월 0.1달러다.
# 깨끗할 때 한 번 만드는 용도다. 이 이름의 경보가 하나라도 있으면 확인 모드에서도 아무것도 만들지 않고 멈춘다.
# 중간에 멈췄거나 Ingress를 다시 만들어 대상 그룹이 바뀌었으면 경보 4개를 지우고 다시 실행한다:
#   aws cloudwatch delete-alarms --alarm-names catchu-api-no-target catchu-web-no-target catchu-alb-target-5xx catchu-db-free-storage \
#     --profile catchu --region ap-northeast-2
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

apply=0
case "${1:-}" in
  --apply) apply=1 ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

topic_name=catchu-alerts
db=catchu-db
alarms=(catchu-api-no-target catchu-web-no-target catchu-alb-target-5xx catchu-db-free-storage)

# 서비스 이름 → 그 서비스의 대상 그룹 ARN. 하나가 아니면 멈춘다.
target_group_of() {
  local arns n
  arns=$(command kubectl -n catchu get targetgroupbindings -o json |
    jq -r --arg s "$1" '.items[] | select(.spec.serviceRef.name == $s) | .spec.targetGroupARN') ||
    catchu_die "TargetGroupBinding 조회에 실패했다"
  n=$(printf '%s\n' "$arns" | awk 'NF { n++ } END { print n + 0 }')
  [ "$n" = 1 ] || catchu_die "${1} 서비스의 TargetGroupBinding이 하나가 아니다(${n}개). Ingress가 적용됐는지 본다"
  printf '%s\n' "$arns"
}

show_evidence() {
  aws_catchu cloudwatch describe-alarms --alarm-names "${alarms[@]}" --output json | jq '[.MetricAlarms[] | {
    name: .AlarmName, metric: .MetricName, statistic: .Statistic, comparison: .ComparisonOperator, threshold: .Threshold,
    period: .Period, evaluationPeriods: .EvaluationPeriods, missingData: .TreatMissingData, state: .StateValue,
    alarmActions: (.AlarmActions | length), okActions: (.OKActions | length)}]'
}

catchu_require_tools aws jq kubectl
catchu_guard_aws
catchu_guard_cluster

topic=$(aws_catchu sns list-topics --query "Topics[?ends_with(TopicArn, ':${topic_name}')] | [0].TopicArn" --output text) ||
  catchu_die "SNS 주제 조회에 실패했다"
[ "$topic" != None ] || catchu_die "SNS 주제 ${topic_name}가 없다. create-alert-topic.sh로 먼저 만든다"
n=$(catchu_count "주제 ${topic_name}의 확인된 이메일 구독" sns list-subscriptions-by-topic --topic-arn "$topic" \
  --query "length(Subscriptions[?Protocol=='email' && SubscriptionArn!='PendingConfirmation'])")
[ "$n" -gt 0 ] || catchu_die "주제 ${topic_name}에 확인된 이메일 구독이 없다. 받을 곳 없이 경보를 만들지 않는다"
n=$(catchu_count "DB ${db}" rds describe-db-instances --filters "Name=db-instance-id,Values=${db}" --query 'length(DBInstances)')
[ "$n" = 1 ] || catchu_die "RDS ${db}가 없다"

api_tg=$(target_group_of api)
web_tg=$(target_group_of web)
lbs=$(aws_catchu elbv2 describe-target-groups --target-group-arns "$api_tg" "$web_tg" \
  --query 'TargetGroups[].LoadBalancerArns[]' --output text) || catchu_die "대상 그룹 조회에 실패했다"
lbs=$(printf '%s\n' "$lbs" | tr '\t ' '\n\n' | awk 'NF' | sort -u)
[ "$(printf '%s\n' "$lbs" | awk 'NF { n++ } END { print n + 0 }')" = 1 ] ||
  catchu_die "api·web 대상 그룹이 ALB 하나에 붙어 있지 않다($(printf '%s' "$lbs" | tr '\n' ' '))"
# 지표 차원 값: 대상 그룹은 ARN의 targetgroup/… 부분, ALB는 loadbalancer/ 뒤의 app/… 부분이다.
lb_dim=${lbs#*:loadbalancer/}
api_dim=${api_tg##*:}
web_dim=${web_tg##*:}

n=$(catchu_count "경보" cloudwatch describe-alarms --alarm-names "${alarms[@]}" --query 'length(MetricAlarms)')
found=()
[ "$n" = 0 ] || found+=("이 스크립트가 만드는 이름의 경보 ${n}개")
catchu_require_clean ${found[@]+"${found[@]}"}

catchu_info "ALB ${lb_dim}, api ${api_dim}, web ${web_dim}, DB ${db}, 주제 ${topic_name}(확인된 이메일 구독 있음)"
catchu_info "만들 것: 경보 ${alarms[*]}"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

alarm() { # 이름 설명 나머지 put-metric-alarm 인자…
  local name=$1 description=$2
  shift 2
  aws_catchu cloudwatch put-metric-alarm --alarm-name "$name" --alarm-description "$description" \
    --alarm-actions "$topic" --ok-actions "$topic" --tags Key=project,Value=catchu Key=issue,Value=276 "$@"
  catchu_info "경보 ${name}: 만듦"
}
no_target() { # 이름 서비스 대상그룹차원
  alarm "$1" "catchu $2: no healthy target for 5 minutes" \
    --namespace AWS/ApplicationELB --metric-name HealthyHostCount \
    --dimensions "Name=TargetGroup,Value=$3" "Name=LoadBalancer,Value=${lb_dim}" \
    --statistic Minimum --period 60 --evaluation-periods 5 --datapoints-to-alarm 5 \
    --threshold 1 --comparison-operator LessThanThreshold --treat-missing-data breaching
}
no_target catchu-api-no-target api "$api_dim"
no_target catchu-web-no-target web "$web_dim"
alarm catchu-alb-target-5xx 'catchu ALB: 10 or more 5xx responses from targets in 5 minutes' \
  --namespace AWS/ApplicationELB --metric-name HTTPCode_Target_5XX_Count \
  --dimensions "Name=LoadBalancer,Value=${lb_dim}" \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 10 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching
alarm catchu-db-free-storage 'catchu RDS: free storage below 2 GiB for 15 minutes' \
  --namespace AWS/RDS --metric-name FreeStorageSpace \
  --dimensions "Name=DBInstanceIdentifier,Value=${db}" \
  --statistic Minimum --period 300 --evaluation-periods 3 --datapoints-to-alarm 3 \
  --threshold 2147483648 --comparison-operator LessThanThreshold --treat-missing-data breaching
show_evidence
