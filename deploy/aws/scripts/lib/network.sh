# shellcheck shell=bash
# eksctl이 만든 VPC·프라이빗 서브넷·노드 보안 그룹을 찾고, DB·큐·EFS용 보안 그룹을 새로 만든다(#276 1단계).
# guard.sh를 먼저 읽고 catchu_guard_aws를 마친 뒤에 쓴다.

catchu_count_lines() {
  printf '%s\n' "$1" | awk 'NF { n++ } END { print n + 0 }'
}

# 클러스터가 쓰는 VPC ID.
catchu_vpc_id() {
  local vpc
  vpc=$(aws_catchu eks describe-cluster --name "$CATCHU_CLUSTER" --query cluster.resourcesVpcConfig.vpcId --output text) ||
    catchu_die "${CATCHU_CLUSTER} 클러스터가 없다. cluster.yaml로 만든 뒤 실행한다(README.md 「1단계 만드는 순서」)"
  [[ $vpc =~ ^vpc-[0-9a-f]+$ ]] || catchu_die "VPC ID를 읽지 못했다(${vpc})"
  printf '%s\n' "$vpc"
}

# 클러스터 서브넷 중 공인 IP를 붙이지 않는 프라이빗 서브넷 두 개를 "2a 2c" 순서로 한 줄에 찍는다.
catchu_private_subnets() {
  local ids rows a c
  ids=$(aws_catchu eks describe-cluster --name "$CATCHU_CLUSTER" --query 'cluster.resourcesVpcConfig.subnetIds' --output text) ||
    catchu_die "클러스터 서브넷을 읽지 못했다"
  # shellcheck disable=SC2086 # 서브넷 ID 목록을 인자 여러 개로 넘긴다
  rows=$(aws_catchu ec2 describe-subnets --subnet-ids $ids \
    --query 'Subnets[?MapPublicIpOnLaunch==`false`].[AvailabilityZone,SubnetId]' --output text) ||
    catchu_die "서브넷을 조회하지 못했다"
  a=$(printf '%s\n' "$rows" | awk '$1 == "ap-northeast-2a" { print $2 }')
  c=$(printf '%s\n' "$rows" | awk '$1 == "ap-northeast-2c" { print $2 }')
  if [ "$(catchu_count_lines "$rows")" -ne 2 ] || [ -z "$a" ] || [ -z "$c" ]; then
    catchu_die "프라이빗 서브넷이 2a·2c에 하나씩이 아니다: $(printf '%s' "$rows" | tr '\t\n' ': ')"
  fi
  printf '%s %s\n' "$a" "$c"
}

# app 노드 그룹 노드에 실제로 붙은 보안 그룹. Pod 연결도 이 보안 그룹으로 판정된다(t 계열은 Pod 보안 그룹을 쓸 수 없다).
# 하나면 그것을 쓴다. 둘 이상이면 고르지 않고 멈춘다. 그때는 README.md 「1단계 만드는 순서」대로 하나를 정해 CATCHU_NODE_SG로 넘기며,
# 넘긴 값도 실제 노드에 붙은 것 가운데 하나여야 한다(다른 그룹에 DB·큐·EFS를 열지 않기 위해서다).
catchu_node_sg() {
  local sgs n
  sgs=$(aws_catchu ec2 describe-instances \
    --filters "Name=tag:eks:cluster-name,Values=${CATCHU_CLUSTER}" "Name=tag:eks:nodegroup-name,Values=app" "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].NetworkInterfaces[].Groups[].GroupId' --output text) ||
    catchu_die "노드를 조회하지 못했다"
  sgs=$(printf '%s\n' "$sgs" | tr '\t ' '\n\n' | awk 'NF' | sort -u)
  n=$(catchu_count_lines "$sgs")
  [ "$n" -gt 0 ] || catchu_die "실행 중인 app 노드가 없다"
  if [ -n "${CATCHU_NODE_SG:-}" ]; then
    printf '%s\n' "$sgs" | grep -qx -- "$CATCHU_NODE_SG" ||
      catchu_die "CATCHU_NODE_SG(${CATCHU_NODE_SG})가 app 노드에 붙은 보안 그룹이 아니다($(printf '%s' "$sgs" | tr '\n' ' '))"
    printf '%s\n' "$CATCHU_NODE_SG"
    return
  fi
  if [ "$n" -ne 1 ]; then
    catchu_die "노드에 붙은 보안 그룹이 하나가 아니다(${n}개: $(printf '%s' "$sgs" | tr '\n' ' ')). 쓸 것을 정해 CATCHU_NODE_SG로 넘긴다"
  fi
  printf '%s\n' "$sgs"
}

# 이름이 같은 보안 그룹 ID. 없으면 빈 줄. 생성 스크립트가 맨 앞에서 이미 있는 자원을 찾을 때 쓴다.
catchu_sg_id() {
  local name=$1 vpc=$2 id
  id=$(aws_catchu ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${vpc}" "Name=group-name,Values=${name}" \
    --query 'SecurityGroups[0].GroupId' --output text) || catchu_die "보안 그룹 ${name}를 조회하지 못했다"
  [ "$id" = None ] && id=''
  printf '%s\n' "$id"
}

# 노드 보안 그룹에서 오는 TCP <포트>만 받는 보안 그룹을 새로 만든다. 같은 이름이 없는지는 부르는 쪽이 먼저 확인한다.
catchu_create_sg() {
  local name=$1 description=$2 port=$3 vpc=$4 node_sg=$5 id
  id=$(aws_catchu ec2 create-security-group --group-name "$name" --description "$description" --vpc-id "$vpc" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${name}},{Key=project,Value=catchu},{Key=issue,Value=276}]" \
    --query GroupId --output text) || catchu_die "보안 그룹 ${name}를 만들지 못했다"
  catchu_info "보안 그룹 ${name}: 만듦(${id})"
  aws_catchu ec2 authorize-security-group-ingress --group-id "$id" \
    --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},UserIdGroupPairs=[{GroupId=${node_sg},Description=catchu-nodes}]" \
    --tag-specifications "ResourceType=security-group-rule,Tags=[{Key=project,Value=catchu},{Key=issue,Value=276}]" \
    --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text >/dev/null ||
    catchu_die "보안 그룹 ${name}에 ${port} 규칙을 넣지 못했다"
  catchu_info "보안 그룹 ${name}: 노드 보안 그룹에서 TCP ${port} 허용"
  printf '%s\n' "$id"
}
