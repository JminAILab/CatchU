#!/usr/bin/env bash
# GitHub 토큰 보관 폴더용 EFS(가용 영역 2곳에 마운트 지점)와 접근점·파일 시스템 정책·보안 그룹을 만들고,
# 짝이 되는 암호화 키 SSM /catchu/prod/api/GITHUB_CREDENTIAL_ENCRYPTION_KEY가 없으면 만든다(#276 1단계).
# 인자 없이 실행하면 확인만 하고 아무것도 만들지 않는다. --apply를 주면 만든다. 비용이 생기므로 팀장 승인 뒤에만 --apply.
# CLI로 만들면 저장 암호화가 꺼진 채 만들어지고 나중에 켤 수 없어 --encrypted를 명시한다. 토큰이 8시간짜리라 백업은 끈다.
# api 이미지(UID 1000)가 쓰도록 접근점이 사용자 번호 1000과 시작 폴더 /github-credentials(0700)를 고정한다.
# 깨끗할 때 한 번 만드는 용도다. 파일 시스템(생성 토큰 catchu-github-credentials)이나 보안 그룹 catchu-efs가 이미 있으면
# 확인 모드에서도 아무것도 만들지 않고 멈춘다(만들다 멈춘 것이면 README.md 「생성이 중간에 멈췄을 때」).
# 파일 시스템을 늘 새로 만들므로 키는 이미 있으면 그대로 쓰고(덮어쓰지 않음), 없으면 만든다. 어느 쪽이든 풀지 못하게 되는
# 옛 자격정보가 없다. 키 값은 찍지 않는다.
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

name=catchu-github-credentials
sg_name=catchu-efs
key_parameter=/catchu/prod/api/GITHUB_CREDENTIAL_ENCRYPTION_KEY
tags=(Key=Name,Value=${name} Key=project,Value=catchu Key=issue,Value=276)

# 0 또는 1. 조회가 실패하면 멈춘다(실패를 '이미 있음'으로 보면 키 없이 끝난다).
key_count() {
  catchu_count "SSM ${key_parameter}" ssm describe-parameters --parameter-filters "Key=Name,Values=${key_parameter}" --query 'length(Parameters)'
}

show_evidence() {
  local fs=$1 arn points keys
  aws_catchu efs describe-file-systems --file-system-id "$fs" --query 'FileSystems[0].{
    id: FileSystemId, state: LifeCycleState, encrypted: Encrypted, performance: PerformanceMode, throughput: ThroughputMode,
    zone: AvailabilityZoneName}' --output json
  aws_catchu efs describe-backup-policy --file-system-id "$fs" --query 'BackupPolicy.Status' --output text
  aws_catchu efs describe-mount-targets --file-system-id "$fs" \
    --query 'MountTargets[].[AvailabilityZoneName, SubnetId, LifeCycleState]' --output text
  aws_catchu efs describe-access-points --file-system-id "$fs" \
    --query 'AccessPoints[].[AccessPointId, PosixUser.Uid, PosixUser.Gid, RootDirectory.Path, RootDirectory.CreationInfo.Permissions]' --output text
  aws_catchu efs describe-file-system-policy --file-system-id "$fs" --query Policy --output text | jq -c '[.Statement[] | {Sid, Effect, Action}]'
  arn=$(aws_catchu efs describe-file-systems --file-system-id "$fs" --query 'FileSystems[0].FileSystemArn' --output text)
  points=$(catchu_count 'AWS Backup 복구 지점' backup list-recovery-points-by-resource --resource-arn "$arn" --query 'length(RecoveryPoints)')
  keys=$(key_count)
  printf 'AWS Backup 복구 지점: %s개\n암호화 키 SSM: %s개\n' "$points" "$keys"
}

catchu_require_tools aws jq openssl
catchu_guard_aws

vpc=$(catchu_vpc_id)
subnets=$(catchu_private_subnets)
read -r subnet_a subnet_c <<< "$subnets"
node_sg=$(catchu_node_sg)

found=()
fs=$(aws_catchu efs describe-file-systems --creation-token "$name" --query 'FileSystems[0].FileSystemId' --output text)
[ "$fs" = None ] || found+=("파일 시스템 ${name}(${fs})")
sg_id=$(catchu_sg_id "$sg_name" "$vpc")
[ -z "$sg_id" ] || found+=("보안 그룹 ${sg_name}(${sg_id})")
catchu_require_clean ${found[@]+"${found[@]}"}

keys=$(key_count)
catchu_info "VPC ${vpc}, 프라이빗 서브넷 ${subnet_a}(2a)·${subnet_c}(2c), 노드 보안 그룹 ${node_sg}"
catchu_info "암호화 키 SSM: ${keys}개(있으면 그대로 쓰고, 없으면 만든다)"
catchu_info "만들 것: 보안 그룹 ${sg_name}(노드에서 2049만), 파일 시스템(암호화·백업 끔·Elastic), 마운트 지점 2a·2c, 접근점(UID 1000·0700), 접근점과 TLS만 허용하는 정책"
if [ "$apply" != 1 ]; then
  catchu_info "확인만 했다. 만들려면 팀장 승인 뒤 --apply로 다시 실행한다."
  exit 0
fi

sg=$(catchu_create_sg "$sg_name" 'catchu EFS: 2049 from nodes only' 2049 "$vpc" "$node_sg")

fs=$(aws_catchu efs create-file-system --creation-token "$name" --encrypted --no-backup \
  --performance-mode generalPurpose --throughput-mode elastic --tags "${tags[@]}" \
  --query FileSystemId --output text)
catchu_info "파일 시스템: 만듦(${fs})"
for _ in $(seq 60); do
  state=$(aws_catchu efs describe-file-systems --file-system-id "$fs" --query 'FileSystems[0].LifeCycleState' --output text)
  [ "$state" = available ] && break
  sleep 5
done
[ "$state" = available ] || catchu_die "파일 시스템 ${fs}가 5분 안에 available이 되지 않았다(${state})"

for subnet in "$subnet_a" "$subnet_c"; do
  aws_catchu efs create-mount-target --file-system-id "$fs" --subnet-id "$subnet" --security-groups "$sg" \
    --query '[MountTargetId, AvailabilityZoneName]' --output text
done

access_point=$(aws_catchu efs create-access-point --file-system-id "$fs" --client-token "$name" \
  --posix-user Uid=1000,Gid=1000 \
  --root-directory 'Path=/github-credentials,CreationInfo={OwnerUid=1000,OwnerGid=1000,Permissions=0700}' \
  --tags "${tags[@]}" --query AccessPointArn --output text)
catchu_info "접근점: 만듦(${access_point##*/})"

# 마운트 지점과 위 접근점을 거친 접속만 붙이고 쓰게 하고(루트 권한 없음), TLS가 아닌 접속은 모두 거부한다.
# 접근점 조건이 없으면 노드에서 닿는 클라이언트가 접근점 없이 파일 시스템 맨 위를 마운트할 수 있다.
# 거부만 두면 기본 허용 정책이 꺼져 마운트가 모두 막히므로 허용 문장을 함께 둔다.
# IAM 없이(익명으로) 마운트할 때도 접근점 조건이 적용되는지는 문서로 확인하지 못했다. GitHub 연결을 켤 때 마운트 시험으로 본다(README.md).
arn=$(aws_catchu efs describe-file-systems --file-system-id "$fs" --query 'FileSystems[0].FileSystemArn' --output text)
policy=$(jq -cn --arg arn "$arn" --arg ap "$access_point" '{
  Version: "2012-10-17",
  Statement: [
    {Sid: "AllowMountViaMountTarget", Effect: "Allow", Principal: {AWS: "*"},
     Action: ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"], Resource: $arn,
     Condition: {Bool: {"elasticfilesystem:AccessedViaMountTarget": "true"}, StringEquals: {"elasticfilesystem:AccessPointArn": $ap}}},
    {Sid: "DenyInsecureTransport", Effect: "Deny", Principal: {AWS: "*"}, Action: "*", Resource: $arn,
     Condition: {Bool: {"aws:SecureTransport": "false"}}}
  ]}')
aws_catchu efs put-file-system-policy --file-system-id "$fs" --policy "$policy" --query FileSystemId --output text

if [ "$keys" = 0 ]; then
  umask 077
  key_file=$(mktemp)
  trap 'rm -f "$key_file"' EXIT
  # 32바이트 난수의 64자리 hex(api/docs/environment.md). 값은 파이프와 0600 임시 파일로만 넘긴다.
  openssl rand -hex 32 | jq -Rn --arg name "$key_parameter" '{
    Name: $name, Type: "SecureString", Value: input,
    Description: "api GitHub credential encryption key (pairs with EFS catchu-github-credentials)",
    Tags: [{Key: "project", Value: "catchu"}, {Key: "issue", Value: "276"}]}' > "$key_file"
  aws_catchu ssm put-parameter --cli-input-json "file://${key_file}" --query Version --output text > /dev/null
  rm -f "$key_file"
  catchu_info "암호화 키: 만듦(값은 찍지 않음)"
else
  catchu_info "암호화 키: 이미 있음(그대로 씀)"
fi

# 마운트 지점은 만든 뒤 몇 분 걸려 available이 된다. 두 곳 모두 준비될 때까지 기다린다.
for _ in $(seq 60); do
  n=$(catchu_count '준비된 마운트 지점' efs describe-mount-targets --file-system-id "$fs" --query "length(MountTargets[?LifeCycleState=='available'])")
  [ "$n" = 2 ] && break
  sleep 5
done
[ "$n" = 2 ] || catchu_die "마운트 지점 두 곳이 5분 안에 available이 되지 않았다(${n}곳)"

show_evidence "$fs"
