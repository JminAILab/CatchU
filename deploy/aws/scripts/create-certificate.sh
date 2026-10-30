#!/usr/bin/env bash
# catchu.dev의 ACM 공개 인증서를 DNS 검증으로 받는다(#276 0단계, 비용 0). ALB(k8s/ingress.yaml)가 https에 쓴다.
# ALB에 붙여 쓰는 공개 인증서는 요금이 없고, 검증 기록이 남아 있는 동안 ACM이 만료 전에 갱신한다. 비밀 키는 ACM 밖으로 꺼낼 수 없다.
# Ingress는 ARN 대신 이름(catchu.dev)으로 인증서를 찾는다. ALB와 같은 서울 리전에 받는다.
# 순서: 인증서 요청 → ACM이 준 검증용 CNAME을 Route 53 공개 호스팅 영역 catchu.dev에 넣음 → 발급될 때까지 기다림(보통 몇 분, 최대 40분).
# 검증 기록은 UPSERT로 넣는다. 이름·값은 ACM이 계정과 도메인으로 정하므로, 앞선 시도에서 남은 같은 기록은 그대로 덮어 쓰면 된다.
# 개발 서버로 가는 A 기록은 건드리지 않는다. catchu.dev를 ALB로 바꾸는 것은 3단계(전환)다.
# 인자 없이 실행하면 확인만 한다. 깨끗할 때 한 번 만드는 용도라 catchu.dev 인증서가 상태와 관계없이 하나라도 있으면 멈춘다.
# 요청 뒤 검증 기록을 넣기 전에 멈췄으면 aws acm delete-certificate --certificate-arn <ARN> --profile catchu --region ap-northeast-2로
# 지우고 다시 실행한다(ARN은 aws acm list-certificates로 찾는다). 기다리다 멈췄으면 다시 실행하지 말고 상태를 본다(멈출 때 찍는 명령).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"

mode=check
case "${1:-}" in
  --apply) mode=apply ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

domain=catchu.dev
# list-certificates는 키 종류를 적지 않으면 RSA_2048만 돌려준다. 이미 있는지는 모든 키 종류로 본다.
key_types=RSA_1024,RSA_2048,RSA_3072,RSA_4096,EC_prime256v1,EC_secp384r1,EC_secp521r1

catchu_require_tools aws jq
catchu_guard_aws

zone=$(aws_catchu route53 list-hosted-zones-by-name --dns-name "$domain" \
  --query "HostedZones[?Name=='${domain}.' && Config.PrivateZone==\`false\`].Id" --output text) ||
  catchu_die "Route 53 호스팅 영역 조회에 실패했다"
[[ $zone =~ ^/hostedzone/Z[A-Z0-9]+$ ]] || catchu_die "공개 호스팅 영역 ${domain}이 하나가 아니다(${zone:-없음})"

n=$(catchu_count "인증서 ${domain}" acm list-certificates --includes "keyTypes=${key_types}" \
  --certificate-statuses PENDING_VALIDATION ISSUED INACTIVE EXPIRED VALIDATION_TIMED_OUT REVOKED FAILED \
  --query "length(CertificateSummaryList[?DomainName=='${domain}'])")
found=()
[ "$n" = 0 ] || found+=("인증서 ${domain}(${n}개)")
catchu_require_clean ${found[@]+"${found[@]}"}

catchu_info "만들 것: ACM 인증서 ${domain}(RSA 2048, DNS 검증), 호스팅 영역 ${domain}의 검증용 CNAME"
if [ "$mode" != apply ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

arn=$(aws_catchu acm request-certificate --domain-name "$domain" --validation-method DNS --key-algorithm RSA_2048 \
  --tags Key=project,Value=catchu Key=issue,Value=276 --query CertificateArn --output text)
catchu_info "인증서 ${domain}: 요청함(검증 대기)"

# 요청 직후에는 검증 기록이 아직 없을 수 있어 3초 간격으로 10번까지 본다.
record=null
for _ in $(seq 10); do
  record=$(aws_catchu acm describe-certificate --certificate-arn "$arn" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json)
  [ "$record" != null ] && break
  sleep 3
done
name=$(printf '%s' "$record" | jq -r 'if type == "object" and .Type == "CNAME" then .Name else empty end')
value=$(printf '%s' "$record" | jq -r 'if type == "object" and .Type == "CNAME" then .Value else empty end')
[ -n "$name" ] && [ -n "$value" ] ||
  catchu_die "ACM이 검증 기록을 주지 않았다. 인증서를 지우고 다시 실행한다(머리말)"

change=$(jq -cn --arg n "$name" --arg v "$value" '{Comment: "ACM DNS validation for catchu.dev (#276)",
  Changes: [{Action: "UPSERT", ResourceRecordSet: {Name: $n, Type: "CNAME", TTL: 300, ResourceRecords: [{Value: $v}]}}]}')
aws_catchu route53 change-resource-record-sets --hosted-zone-id "$zone" --change-batch "$change" > /dev/null
catchu_info "검증 기록(CNAME): 넣음"

# acm 대기 명령은 60초 간격으로 40번(40분) 본다.
catchu_wait 1 acm wait certificate-validated --certificate-arn "$arn" ||
  catchu_die "40분 안에 발급되지 않았다. 다시 실행하지 말고 aws acm list-certificates --profile catchu --region ap-northeast-2로 상태를 본다"

catchu_info "확인 값:"
aws_catchu acm describe-certificate --certificate-arn "$arn" --output json |
  jq '.Certificate | {DomainName, Status, Type, KeyAlgorithm, NotAfter, RenewalEligibility,
    Validation: [.DomainValidationOptions[] | {ValidationMethod, ValidationStatus}]}'
