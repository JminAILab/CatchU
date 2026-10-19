#!/usr/bin/env bash
# ALB 앞 AWS WAF 웹 ACL catchu-edge를 만든다(#276 1단계, 10/19 결정 4). ALB에는 Ingress 주석으로 붙인다(다음 PR).
# 규칙 두 개(../waf/rules.json):
#   block-internal-path  경로가 /v1/internal로 시작하면 404. 비교 전에 URL 디코딩·경로 정리·소문자 변환을 해 대소문자·인코딩 변형도 막는다
#                        (ALB 경로 규칙은 대소문자를 가리지만 api는 가리지 않는다).
#   google-start-per-ip  Google 로그인 시작(/v1/auth/google/authorization)을 주소당 5분 20회 넘게 보내면 429(api 오류 형식, ../waf/response-bodies.json).
# 요청 표본과 WAF 로그는 끈다. 주소에 공유 링크 토큰·로그인 code가 남기 때문이다. 지표(CloudWatch)만 켠다.
# 인자 없이 실행하면 규칙 형식과 용량만 AWS에 확인하고(자원을 만들지 않음) 끝낸다. --apply를 주면 만든다(팀장 승인 뒤).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

apply=0
case "${1:-}" in
  --apply) apply=1 ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

acl=catchu-edge
rules="file://${here}/../waf/rules.json"
bodies="file://${here}/../waf/response-bodies.json"

acl_id() {
  aws_catchu wafv2 list-web-acls --scope REGIONAL --query "WebACLs[?Name=='${acl}'] | [0].Id" --output text
}

show_evidence() {
  local id=$1 arn err
  aws_catchu wafv2 get-web-acl --scope REGIONAL --name "$acl" --id "$id" --output json | jq '.WebACL | {
    name: .Name, capacity: .Capacity, defaultAction: (.DefaultAction | keys),
    sampledRequests: .VisibilityConfig.SampledRequestsEnabled,
    rules: [.Rules[] | {name: .Name, priority: .Priority, sampledRequests: .VisibilityConfig.SampledRequestsEnabled,
      response: .Action.Block.CustomResponse.ResponseCode}]}'
  arn=$(aws_catchu wafv2 list-web-acls --scope REGIONAL --query "WebACLs[?Name=='${acl}'] | [0].ARN" --output text)
  # 로그 설정이 없다는 응답(WAFNonexistentItemException)만 '없음'으로 본다. 권한·일시 오류는 확인 실패로 멈춘다.
  if err=$(aws_catchu wafv2 get-logging-configuration --resource-arn "$arn" 2>&1 > /dev/null); then
    catchu_info "경고: WAF 로그 설정이 있다. 끄기로 했으므로 확인한다"
  elif printf '%s' "$err" | grep -q WAFNonexistentItemException; then
    catchu_info "WAF 로그 설정: 없음"
  else
    catchu_die "WAF 로그 설정을 조회하지 못했다"
  fi
}

catchu_require_tools aws jq
catchu_guard_aws

# 규칙 JSON의 문자열(SearchString)은 원문 그대로 둔다. CLI v2는 기본으로 base64를 기대하므로 형식을 지정한다.
capacity=$(aws_catchu wafv2 check-capacity --scope REGIONAL --rules "$rules" --cli-binary-format raw-in-base64-out --query Capacity --output text)
catchu_info "규칙 형식 확인: 통과(용량 ${capacity} WCU)"

id=$(acl_id)
if [ "$id" != None ]; then
  catchu_info "${acl}가 이미 있다. 다시 만들지 않는다. 확인 값:"
  show_evidence "$id"
  exit 0
fi
catchu_info "만들 것: 웹 ACL ${acl}(REGIONAL, 기본 허용, 규칙 2개, 요청 표본 끔)"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

aws_catchu wafv2 create-web-acl --name "$acl" --scope REGIONAL \
  --description 'catchu ALB: internal path 404, Google login start rate limit' \
  --default-action 'Allow={}' \
  --rules "$rules" \
  --custom-response-bodies "$bodies" \
  --visibility-config "SampledRequestsEnabled=false,CloudWatchMetricsEnabled=true,MetricName=${acl}" \
  --cli-binary-format raw-in-base64-out \
  --tags Key=project,Value=catchu Key=issue,Value=276 \
  --query 'Summary.[Name, Id]' --output text

show_evidence "$(acl_id)"
