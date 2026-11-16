#!/usr/bin/env bash
# 회원 파일(PDF 원본·발행 사본) 버킷 catchu-prod-files와, 프라이빗 서브넷이 S3에 닿는 게이트웨이 엔드포인트를 만든다(#276 1단계, #389 결정).
# 버킷: 서울, 공개 차단 4개, 기본 암호화(AES256), ACL 끔(버킷 주인 강제). 지운 파일이 이전 버전으로 남지 않게 버전 관리는 켜지 않는다.
#   미리 서명한 주소를 쓰지 않고 api가 링크 조건을 확인한 뒤 내려주므로 버킷 정책·CORS는 두지 않는다.
# 엔드포인트: 클러스터 VPC의 프라이빗 서브넷 경로표에 붙인다. 요금이 없고, 노드·Pod의 S3 연결이 NAT 대신 이 경로로 간다.
#   정책은 기본값(모두 허용)으로 둔다. 노드의 이미지 받기·패키지 저장소도 S3를 쓰므로 버킷 하나로 좁히지 않는다.
# 버킷 이름은 cluster.yaml의 api·worker 역할 정책과 k8s/api.yaml·worker.yaml에도 적혀 있다. 바꾸면 네 곳을 함께 바꾼다(deploy.test.sh가 본다).
# 인자 없이 실행하면 확인만 하고 아무것도 만들지 않는다. --apply를 주면 만든다(팀장 승인 뒤).
# 깨끗할 때 한 번 만드는 용도다. 이 계정에 같은 이름의 버킷이 있거나 VPC에 S3 엔드포인트가 이미 있으면 확인 모드에서도 멈춘다
# (만들다 멈춘 것이면 README.md 「생성이 중간에 멈췄을 때」). S3 버킷 이름은 모든 계정이 함께 쓴다. 다른 계정이 이 이름을 쓰고 있으면
# 버킷 만들기가 BucketAlreadyExists로 멈추고 그 뒤는 만들지 않는다. 그때는 이름을 바꾸는 PR을 먼저 낸다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib/guard.sh"
. "$here/lib/network.sh"

apply=0
case "${1:-}" in
  --apply) apply=1 ;;
  '') ;;
  *) catchu_die "사용법: $0 [--apply]" ;;
esac

bucket=catchu-prod-files
endpoint_name=catchu-s3
service="com.amazonaws.${CATCHU_REGION}.s3"
policy_file="$here/../k8s/network-policy.yaml"

show_evidence() {
  local endpoint=$1 cidr missing=''
  aws_catchu s3api get-public-access-block --bucket "$bucket" --query PublicAccessBlockConfiguration --output json
  aws_catchu s3api get-bucket-encryption --bucket "$bucket" \
    --query 'ServerSideEncryptionConfiguration.Rules[].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text
  aws_catchu s3api get-bucket-ownership-controls --bucket "$bucket" --query 'OwnershipControls.Rules[].ObjectOwnership' --output text
  # 켠 적이 없으면 None이 찍힌다. Enabled·Suspended면 켠 적이 있는 것이다.
  aws_catchu s3api get-bucket-versioning --bucket "$bucket" --query Status --output text
  aws_catchu ec2 describe-vpc-endpoints --vpc-endpoint-ids "$endpoint" \
    --query 'VpcEndpoints[].[VpcEndpointId, VpcEndpointType, State, join(`,`, RouteTableIds)]' --output text
  # worker는 NetworkPolicy에 적은 대역으로만 나간다. 엔드포인트가 쓰는 S3 대역이 그 목록에 없으면 worker가 PDF를 읽지 못한다.
  for cidr in $(aws_catchu ec2 describe-prefix-lists --filters "Name=prefix-list-name,Values=${service}" --query 'PrefixLists[0].Cidrs' --output text); do
    grep -qF -- "cidr: ${cidr}" "$policy_file" || missing="${missing} ${cidr}"
  done
  if [ -n "$missing" ]; then
    catchu_info "주의: k8s/network-policy.yaml의 worker 목록에 없는 S3 대역:${missing}. k8s/README.md 「worker 바깥 연결 대역 갱신」대로 고친다."
  else
    catchu_info "S3 대역: 엔드포인트가 쓰는 대역이 모두 k8s/network-policy.yaml에 있다."
  fi
}

catchu_require_tools aws jq
catchu_guard_aws

vpc=$(catchu_vpc_id)
subnets=$(catchu_private_subnets)
read -r subnet_a subnet_c <<< "$subnets"
tables=$(aws_catchu ec2 describe-route-tables --filters "Name=association.subnet-id,Values=${subnet_a},${subnet_c}" \
  --query 'RouteTables[].RouteTableId' --output text) || catchu_die "프라이빗 서브넷의 경로표를 조회하지 못했다"
tables=$(printf '%s\n' "$tables" | tr '\t ' '\n\n' | awk 'NF' | sort -u)
[ -n "$tables" ] || catchu_die "프라이빗 서브넷에 직접 연결된 경로표를 찾지 못했다"
for table in $tables; do
  [[ $table =~ ^rtb-[0-9a-f]+$ ]] || catchu_die "경로표 ID를 읽지 못했다(${table})"
done

found=()
n=$(catchu_count "버킷 ${bucket}" s3api list-buckets --query "length(Buckets[?Name=='${bucket}'])")
[ "$n" = 0 ] || found+=("버킷 ${bucket}")
n=$(catchu_count "VPC의 S3 엔드포인트" ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=${vpc}" "Name=service-name,Values=${service}" --query 'length(VpcEndpoints[?State!=`deleted`])')
[ "$n" = 0 ] || found+=("VPC ${vpc}의 S3 엔드포인트")
catchu_require_clean ${found[@]+"${found[@]}"}

catchu_info "VPC ${vpc}, 프라이빗 서브넷 ${subnet_a}(2a)·${subnet_c}(2c), 경로표 $(printf '%s' "$tables" | tr '\n' ' ')"
catchu_info "만들 것: 버킷 ${bucket}(공개 차단·기본 암호화·ACL 끔, 버전 관리 안 켬), S3 게이트웨이 엔드포인트 ${endpoint_name}(위 경로표)"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

aws_catchu s3api create-bucket --bucket "$bucket" --create-bucket-configuration "LocationConstraint=${CATCHU_REGION}" \
  --object-ownership BucketOwnerEnforced --query Location --output text > /dev/null
catchu_info "버킷 ${bucket}: 만듦"
aws_catchu s3api put-public-access-block --bucket "$bucket" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws_catchu s3api put-bucket-encryption --bucket "$bucket" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws_catchu s3api put-bucket-tagging --bucket "$bucket" --tagging 'TagSet=[{Key=project,Value=catchu},{Key=issue,Value=276}]'
catchu_info "버킷 ${bucket}: 공개 차단·기본 암호화·태그"

# shellcheck disable=SC2086 # 경로표 ID 목록을 인자 여러 개로 넘긴다
endpoint=$(aws_catchu ec2 create-vpc-endpoint --vpc-id "$vpc" --vpc-endpoint-type Gateway --service-name "$service" \
  --route-table-ids $tables \
  --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=${endpoint_name}},{Key=project,Value=catchu},{Key=issue,Value=276}]" \
  --query VpcEndpoint.VpcEndpointId --output text)
catchu_info "S3 게이트웨이 엔드포인트: 만듦(${endpoint})"

catchu_info "확인 값:"
show_evidence "$endpoint"
