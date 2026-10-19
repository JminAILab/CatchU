# shellcheck shell=bash
# RDS catchu-db 조회와 DB TLS에서 믿을 루트 인증서(#276). guard.sh 다음에 읽는다. make-secrets.sh·db-admin.sh가 쓴다.
#
# 루트 인증서는 서울 리전 rds-ca-rsa2048-g1(2061-05-20까지) 하나만 둔다. AWS 안내대로 신뢰 목록에는 루트만 넣고 중간 인증서는
# 넣지 않는다(서버 인증서 자동 교체 때 연결이 끊길 수 있다). 출처와 확인 방법은 deploy/aws/k8s/README.md 「Secret과 ConfigMap」.

CATCHU_DB_INSTANCE=catchu-db
CATCHU_DB_CA_ID=rds-ca-rsa2048-g1
CATCHU_DB_CA_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/db/rds-ca-rsa2048-g1.pem"
CATCHU_DB_CA_SHA256=fa8cb783d390bfc9d46bb4a6e775c2d18a30a347dda39f91c0416e6e3459effc

# 루트 인증서 파일이 저장소에 둔 그대로인지 본다(파일 SHA-256). 바꿀 때는 이 값과 README의 지문을 함께 고친다.
catchu_db_ca_check() {
  local sum
  [ -r "$CATCHU_DB_CA_FILE" ] || catchu_die "RDS 루트 인증서 파일 ${CATCHU_DB_CA_FILE}이 없다"
  sum=$(shasum -a 256 < "$CATCHU_DB_CA_FILE") || catchu_die "RDS 루트 인증서 파일의 해시를 계산하지 못했다"
  [ "${sum%% *}" = "$CATCHU_DB_CA_SHA256" ] || catchu_die "RDS 루트 인증서 파일이 저장소에 둔 것과 다르다(${CATCHU_DB_CA_FILE})"
}

# catchu-db를 조회해 아래 변수에 둔다. 사용할 수 있는 상태가 아니거나, 주소 형식·CA가 다르거나, 조회가 실패하면 멈춘다.
#   db_host 주소, db_admin_user 관리자 이름, db_admin_secret 관리자 비밀번호 Secrets Manager ARN과 그 상태(db_admin_secret_status),
#   db_parameter_group 파라미터 그룹 이름과 반영 상태(db_parameter_status)
catchu_db_instance() {
  local row status ca
  row=$(aws_catchu rds describe-db-instances --db-instance-identifier "$CATCHU_DB_INSTANCE" --query 'DBInstances[0].[DBInstanceStatus,
    Endpoint.Address, CACertificateIdentifier, MasterUsername, MasterUserSecret.SecretArn, MasterUserSecret.SecretStatus,
    DBParameterGroups[0].DBParameterGroupName, DBParameterGroups[0].ParameterApplyStatus]' --output text) ||
    catchu_die "RDS ${CATCHU_DB_INSTANCE}를 조회하지 못했다"
  read -r status db_host ca db_admin_user db_admin_secret db_admin_secret_status db_parameter_group db_parameter_status <<< "$row"
  [ "$status" = available ] || catchu_die "RDS ${CATCHU_DB_INSTANCE}의 상태가 available이 아니다(${status:-모름})"
  [[ $db_host =~ ^${CATCHU_DB_INSTANCE}\.[a-z0-9]+\.${CATCHU_REGION}\.rds\.amazonaws\.com$ ]] ||
    catchu_die "RDS ${CATCHU_DB_INSTANCE}의 주소가 예상한 형식이 아니다(${db_host:-없음})"
  [ "$ca" = "$CATCHU_DB_CA_ID" ] ||
    catchu_die "RDS ${CATCHU_DB_INSTANCE}의 CA가 ${CATCHU_DB_CA_ID}가 아니다(${ca:-모름}). 저장소의 루트 인증서로 검증할 수 없다"
}
