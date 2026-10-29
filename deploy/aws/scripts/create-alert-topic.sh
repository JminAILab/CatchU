#!/usr/bin/env bash
# 경보를 받을 SNS 주제 catchu-alerts와 팀장 이메일 구독을 만든다(#276 0단계, 2026-10-29 MVP 결정: 이메일 하나로 받는다).
# 비용이 들지 않아 EKS보다 먼저 만들고 수신 시험을 한다. 큐(create-queue.sh)는 이 주제가 있으면 장애 조치 같은 이벤트를 여기로 보낸다.
# 받는 주소는 저장소에 적지 않고 환경변수 CATCHU_ALERT_EMAIL로 받는다. 화면에는 가린 주소만 찍는다.
# 인자 없이 실행하면 확인만 한다. --apply를 주면 주제와 구독을 만들고 확인 메일이 간다. 48시간 안에 링크를 누르지 않으면 SNS가 구독을 지운다.
# --test는 확인된 이메일 구독이 있는지 보고 시험 메시지 한 통을 보낸다(README.md 「단계와 시작 조건」의 수신 시험).
# 깨끗할 때 한 번 만드는 용도다. 주제가 이미 있으면 확인 모드에서도 아무것도 만들지 않고 멈춘다. 구독 전에 멈췄거나 48시간이 지나
# 구독이 지워졌으면 aws sns delete-topic --topic-arn <주제 ARN> --profile catchu --region ap-northeast-2로 지운 뒤 다시 실행한다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

mode=check
case "${1:-}" in
  --apply) mode=apply ;;
  --test) mode=test ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply | --test]" ;;
esac

topic_name=catchu-alerts

if [ "$mode" != test ]; then
  email=${CATCHU_ALERT_EMAIL:-}
  [[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] ||
    catchu_die "CATCHU_ALERT_EMAIL에 받을 이메일 주소 하나를 넣는다(저장소에 적지 않는다)"
  masked="${email:0:1}***@${email#*@}"
fi

catchu_require_tools aws jq
catchu_guard_aws

topic=$(aws_catchu sns list-topics --query "Topics[?ends_with(TopicArn, ':${topic_name}')] | [0].TopicArn" --output text) ||
  catchu_die "SNS 주제 조회에 실패했다"
[ "$topic" = None ] && topic=''

if [ "$mode" = test ]; then
  [ -n "$topic" ] || catchu_die "SNS 주제 ${topic_name}가 없다. --apply로 먼저 만든다"
  n=$(catchu_count "주제 ${topic_name}의 확인된 이메일 구독" sns list-subscriptions-by-topic --topic-arn "$topic" \
    --query "length(Subscriptions[?Protocol=='email' && SubscriptionArn!='PendingConfirmation'])")
  [ "$n" -gt 0 ] || catchu_die "확인된 이메일 구독이 없다. 확인 메일의 링크를 눌렀는지 본다(48시간이 지났으면 주제를 지우고 다시 만든다)"
  id=$(aws_catchu sns publish --topic-arn "$topic" --subject 'CatchU alert receive test' \
    --message 'catchu-alerts receive test (#276 stage 0). No action needed.' --query MessageId --output text)
  catchu_info "시험 메시지를 보냈다(${id}). 메일이 오면 #276에 받은 시각만 남긴다"
  exit 0
fi

found=()
[ -z "$topic" ] || found+=("SNS 주제 ${topic_name}")
catchu_require_clean ${found[@]+"${found[@]}"}

catchu_info "만들 것: SNS 주제 ${topic_name}(암호화 없음), 이메일 구독 ${masked}"
if [ "$mode" != apply ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

topic=$(aws_catchu sns create-topic --name "$topic_name" --tags Key=project,Value=catchu Key=issue,Value=276 \
  --query TopicArn --output text)
catchu_info "SNS 주제 ${topic_name}: 만듦"
aws_catchu sns subscribe --topic-arn "$topic" --protocol email --notification-endpoint "$email" > /dev/null
catchu_info "이메일 구독 ${masked}: 확인 메일을 보냈다. 48시간 안에 링크를 누른 뒤 --test로 수신 시험을 한다"
