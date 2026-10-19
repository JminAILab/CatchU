#!/usr/bin/env bash
# RDS PostgreSQL 16(Multi-AZ)과 파라미터 그룹·서브넷 그룹·보안 그룹을 만든다(#276 1단계, README.md 「1단계 만드는 순서」).
# 인자 없이 실행하면 확인만 하고 아무것도 만들지 않는다. --apply를 주면 만든다. 비용이 생기므로 팀장 승인 뒤에만 --apply.
# CLI 기본값이 계획과 반대인 값(저장 암호화 꺼짐·삭제 보호 꺼짐·백업 1일·부 판본 자동 올리기 켜짐)은 모두 명시한다.
# 저장 암호화는 만든 뒤 켤 수 없다. 관리자 비밀번호는 RDS가 Secrets Manager에 만들어 관리하며, 이 스크립트는 비밀값을 읽거나 찍지 않는다.
# 앱·migration 계정과 앱 계정 시간 상한은 DB를 만든 뒤 별도 SQL로 만든다(다음 PR).
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

db=catchu-db
parameter_group=catchu-pg16
subnet_group=catchu-db
sg_name=catchu-db
tags=(Key=project,Value=catchu Key=issue,Value=276)

# 로그에 키 값·실패 문장·바인드 값이 남지 않게 한다. 기본값과 같은 값도 증거로 남기려고 적는다. 모두 즉시 적용되는 값이다.
parameters=(
  log_error_verbosity=terse
  log_min_error_statement=panic
  log_parameter_max_length_on_error=0
  log_statement=none
  log_min_duration_statement=-1
  log_connections=0
  rds.force_ssl=1
  ssl_min_protocol_version=TLSv1.2
  rds.log_retention_period=1440
)

show_evidence() {
  # #276 완료 기준(자동 백업·보관 기간·암호화, 가용 영역 장애 대비)의 증거. 비밀값이 든 칸은 고르지 않는다.
  aws_catchu rds describe-db-instances --db-instance-identifier "$db" --query 'DBInstances[0].{
    status: DBInstanceStatus, engine: EngineVersion, multiAZ: MultiAZ, az: AvailabilityZone, secondaryAZ: SecondaryAvailabilityZone,
    encrypted: StorageEncrypted, deletionProtection: DeletionProtection, backupRetention: BackupRetentionPeriod,
    backupWindow: PreferredBackupWindow, maintenanceWindow: PreferredMaintenanceWindow, publiclyAccessible: PubliclyAccessible,
    autoMinorVersionUpgrade: AutoMinorVersionUpgrade, parameterGroup: DBParameterGroups[0].DBParameterGroupName,
    caCertificate: CACertificateIdentifier, databaseInsights: DatabaseInsightsMode, performanceInsights: PerformanceInsightsEnabled,
    maxAllocatedStorage: MaxAllocatedStorage, endpoint: Endpoint.Address}' --output json
  aws_catchu rds describe-db-parameters --db-parameter-group-name "$parameter_group" --source user \
    --query 'Parameters[].[ParameterName, ParameterValue]' --output text
}

catchu_require_tools aws jq
catchu_guard_aws

existing=$(aws_catchu rds describe-db-instances --filters "Name=db-instance-id,Values=${db}" --query 'length(DBInstances)' --output text)
if [ "$existing" != 0 ]; then
  catchu_info "${db}가 이미 있다. 다시 만들지 않는다. 확인 값:"
  show_evidence
  exit 0
fi

vpc=$(catchu_vpc_id)
subnets=$(catchu_private_subnets)
read -r subnet_a subnet_c <<< "$subnets"
node_sg=$(catchu_node_sg)
catchu_info "VPC ${vpc}, 프라이빗 서브넷 ${subnet_a}(2a)·${subnet_c}(2c), 노드 보안 그룹 ${node_sg}"
catchu_info "만들 것: 파라미터 그룹 ${parameter_group}, 서브넷 그룹 ${subnet_group}, 보안 그룹 ${sg_name}(노드에서 5432만), DB ${db}(db.t4g.micro, PostgreSQL 16.15, Multi-AZ, gp3 20GB)"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

if [ "$(aws_catchu rds describe-db-parameter-groups --query "length(DBParameterGroups[?DBParameterGroupName=='${parameter_group}'])" --output text)" = 0 ]; then
  aws_catchu rds create-db-parameter-group --db-parameter-group-name "$parameter_group" --db-parameter-group-family postgres16 \
    --description 'catchu PostgreSQL 16: no values in error logs' --tags "${tags[@]}" \
    --query 'DBParameterGroup.DBParameterGroupName' --output text
fi
parameter_args=()
for pair in "${parameters[@]}"; do
  parameter_args+=("ParameterName=${pair%%=*},ParameterValue=${pair#*=},ApplyMethod=immediate")
done
aws_catchu rds modify-db-parameter-group --db-parameter-group-name "$parameter_group" --parameters "${parameter_args[@]}" --output text

if [ "$(aws_catchu rds describe-db-subnet-groups --query "length(DBSubnetGroups[?DBSubnetGroupName=='${subnet_group}'])" --output text)" = 0 ]; then
  aws_catchu rds create-db-subnet-group --db-subnet-group-name "$subnet_group" \
    --db-subnet-group-description 'catchu private subnets 2a 2c' --subnet-ids "$subnet_a" "$subnet_c" --tags "${tags[@]}" \
    --query 'DBSubnetGroup.DBSubnetGroupName' --output text
fi

sg=$(catchu_ensure_sg "$sg_name" 'catchu RDS: 5432 from nodes only' 5432 "$vpc" "$node_sg")

# 백업 창 17:00 UTC = 02:00 KST, 정비 창 일 18:00 UTC = 월 03:00 KST. Multi-AZ에서는 가용 영역을 지정하지 않는다(대기 서버는 다른 영역).
aws_catchu rds create-db-instance \
  --db-instance-identifier "$db" \
  --engine postgres --engine-version 16.15 \
  --db-instance-class db.t4g.micro \
  --multi-az \
  --storage-type gp3 --allocated-storage 20 --max-allocated-storage 40 \
  --storage-encrypted \
  --db-subnet-group-name "$subnet_group" \
  --vpc-security-group-ids "$sg" \
  --no-publicly-accessible \
  --db-name catchu \
  --master-username catchu_admin \
  --manage-master-user-password \
  --db-parameter-group-name "$parameter_group" \
  --ca-certificate-identifier rds-ca-rsa2048-g1 \
  --backup-retention-period 7 \
  --preferred-backup-window 17:00-17:30 \
  --preferred-maintenance-window sun:18:00-sun:18:30 \
  --copy-tags-to-snapshot \
  --deletion-protection \
  --database-insights-mode standard \
  --enable-performance-insights --performance-insights-retention-period 7 \
  --no-auto-minor-version-upgrade \
  --tags "${tags[@]}" \
  --query 'DBInstance.[DBInstanceIdentifier, DBInstanceStatus]' --output text

catchu_info "${db}가 쓸 수 있게 될 때까지 기다린다(보통 15~30분)."
aws_catchu rds wait db-instance-available --db-instance-identifier "$db"
show_evidence
