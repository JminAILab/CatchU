#!/usr/bin/env bash
# ElastiCache Valkey 8.1 큐(주 2a + 복제본 2c, 자동 장애 조치)와 파라미터 그룹·서브넷 그룹·보안 그룹을 만든다(#276 1단계).
# 인자 없이 실행하면 확인만 하고 아무것도 만들지 않는다. --apply를 주면 만든다. 비용이 생기므로 팀장 승인 뒤에만 --apply.
# 저장 암호화는 복제 그룹을 만들 때만 켤 수 있고, 전송 암호화는 CLI 기본값이 꺼짐이라 모두 명시한다. 스냅샷은 두지 않는다
# (복원하면 오래된 작업이 다시 처리될 수 있다). 메모리가 차면 지우지 않고 쓰기를 거부하도록 noeviction 파라미터 그룹을 붙인다.
# 큐 비밀번호(AUTH)는 SSM /catchu/prod/queue/auth-token(개발 서버와 같은 값)을 --apply 때만 읽는다. 명령 인자에 넣지 않고
# 권한 0600 임시 파일로 넘긴 뒤 지우며, 화면에 찍지 않는다.
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

group=catchu-queue
parameter_group=catchu-valkey8-noeviction
subnet_group=catchu-queue
sg_name=catchu-queue
token_parameter=/catchu/prod/queue/auth-token
alert_topic=catchu-alerts
tags=(Key=project,Value=catchu Key=issue,Value=276)

show_evidence() {
  # #276 완료 기준(noeviction, 장애 조치 뒤 재접속 시험의 전제)의 증거. 비밀번호는 고르지 않는다.
  aws_catchu elasticache describe-replication-groups --replication-group-id "$group" --query 'ReplicationGroups[0].{
    status: Status, clusterMode: ClusterMode, multiAZ: MultiAZ, automaticFailover: AutomaticFailover,
    transitEncryption: TransitEncryptionEnabled, transitEncryptionMode: TransitEncryptionMode, atRestEncryption: AtRestEncryptionEnabled,
    authToken: AuthTokenEnabled, snapshotRetention: SnapshotRetentionLimit, autoMinorVersionUpgrade: AutoMinorVersionUpgrade,
    primaryEndpoint: NodeGroups[0].PrimaryEndpoint.Address,
    members: NodeGroups[0].NodeGroupMembers[].[CacheClusterId, PreferredAvailabilityZone, CurrentRole]}' --output json
  aws_catchu elasticache describe-cache-parameters --cache-parameter-group-name "$parameter_group" --source user \
    --query 'Parameters[].[ParameterName, ParameterValue]' --output text
}

catchu_require_tools aws jq
catchu_guard_aws

existing=$(catchu_count "복제 그룹 ${group}" elasticache describe-replication-groups \
  --query "length(ReplicationGroups[?ReplicationGroupId=='${group}'])")
if [ "$existing" != 0 ]; then
  # 앞선 실행이 만드는 중에 끊겼을 수 있으므로 쓸 수 있게 될 때까지 기다린다.
  catchu_info "${group}가 이미 있다. 다시 만들지 않고 쓸 수 있게 될 때까지 기다린 뒤 확인 값을 찍는다."
  aws_catchu elasticache wait replication-group-available --replication-group-id "$group"
  show_evidence
  exit 0
fi

vpc=$(catchu_vpc_id)
subnets=$(catchu_private_subnets)
read -r subnet_a subnet_c <<< "$subnets"
node_sg=$(catchu_node_sg)
n=$(catchu_count "SSM ${token_parameter}" ssm describe-parameters --parameter-filters "Key=Name,Values=${token_parameter}" --query 'length(Parameters)')
[ "$n" = 1 ] || catchu_die "SSM ${token_parameter}가 없다"
topic=$(aws_catchu sns list-topics --query "Topics[?ends_with(TopicArn, ':${alert_topic}')] | [0].TopicArn" --output text)
[ "$topic" = None ] && topic=''
catchu_info "VPC ${vpc}, 프라이빗 서브넷 ${subnet_a}(2a)·${subnet_c}(2c), 노드 보안 그룹 ${node_sg}, 큐 비밀번호 SSM 있음"
if [ -n "$topic" ]; then
  catchu_info "큐 이벤트(장애 조치 등)는 SNS 주제 ${alert_topic}로 보낸다"
else
  catchu_info "SNS 주제 ${alert_topic}가 없어 큐 이벤트 알림 없이 만든다. 나중에 modify-replication-group --notification-topic-arn으로 붙일 수 있다"
fi
catchu_info "만들 것: 파라미터 그룹 ${parameter_group}, 서브넷 그룹 ${subnet_group}, 보안 그룹 ${sg_name}(노드에서 6379만), 복제 그룹 ${group}(cache.t4g.micro 2대, 2a 주·2c 복제본)"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

n=$(catchu_count "파라미터 그룹 ${parameter_group}" elasticache describe-cache-parameter-groups \
  --query "length(CacheParameterGroups[?CacheParameterGroupName=='${parameter_group}'])")
if [ "$n" = 0 ]; then
  aws_catchu elasticache create-cache-parameter-group --cache-parameter-group-name "$parameter_group" \
    --cache-parameter-group-family valkey8 --description 'catchu queue: noeviction' --tags "${tags[@]}" \
    --query 'CacheParameterGroup.CacheParameterGroupName' --output text
fi
aws_catchu elasticache modify-cache-parameter-group --cache-parameter-group-name "$parameter_group" \
  --parameter-name-values ParameterName=maxmemory-policy,ParameterValue=noeviction --output text

n=$(catchu_count "서브넷 그룹 ${subnet_group}" elasticache describe-cache-subnet-groups \
  --query "length(CacheSubnetGroups[?CacheSubnetGroupName=='${subnet_group}'])")
if [ "$n" = 0 ]; then
  aws_catchu elasticache create-cache-subnet-group --cache-subnet-group-name "$subnet_group" \
    --cache-subnet-group-description 'catchu private subnets 2a 2c' --subnet-ids "$subnet_a" "$subnet_c" --tags "${tags[@]}" \
    --query 'CacheSubnetGroup.CacheSubnetGroupName' --output text
fi

sg=$(catchu_ensure_sg "$sg_name" 'catchu queue: 6379 from nodes only' 6379 "$vpc" "$node_sg")

umask 077
token_file=$(mktemp)
trap 'rm -f "$token_file"' EXIT
aws_catchu ssm get-parameter --name "$token_parameter" --with-decryption --query Parameter.Value --output text |
  jq -Rn '{AuthToken: input}' > "$token_file"
# AUTH 글자 규칙: 16~128자, 특수문자는 ! & # $ ^ < > - 만. 값은 찍지 않고 맞는지만 본다.
jq -e '.AuthToken | test("^[A-Za-z0-9!&#$^<>-]{16,128}$")' "$token_file" > /dev/null ||
  catchu_die "SSM ${token_parameter} 값이 ElastiCache AUTH 글자 규칙에 맞지 않는다(값은 찍지 않음)"

# 정비 창 월 18:30 UTC = 화 03:30 KST(최소 60분).
notification=()
[ -n "$topic" ] && notification=(--notification-topic-arn "$topic")
aws_catchu elasticache create-replication-group \
  --cli-input-json "file://${token_file}" \
  --replication-group-id "$group" \
  --replication-group-description 'catchu analysis queue' \
  --engine valkey --engine-version 8.1 \
  --cache-node-type cache.t4g.micro \
  --cluster-mode disabled \
  --num-cache-clusters 2 \
  --preferred-cache-cluster-azs ap-northeast-2a ap-northeast-2c \
  --automatic-failover-enabled --multi-az-enabled \
  --cache-parameter-group-name "$parameter_group" \
  --cache-subnet-group-name "$subnet_group" \
  --security-group-ids "$sg" \
  --transit-encryption-enabled --transit-encryption-mode required \
  --at-rest-encryption-enabled \
  --snapshot-retention-limit 0 \
  --preferred-maintenance-window mon:18:30-mon:19:30 \
  --no-auto-minor-version-upgrade \
  ${notification[@]+"${notification[@]}"} \
  --tags "${tags[@]}" \
  --query 'ReplicationGroup.[ReplicationGroupId, Status]' --output text
rm -f "$token_file"

catchu_info "${group}가 쓸 수 있게 될 때까지 기다린다(보통 10~20분)."
aws_catchu elasticache wait replication-group-available --replication-group-id "$group"
show_evidence
