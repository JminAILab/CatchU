#!/usr/bin/env bash
# 로컬 검증·재현용 합성 환경 폴더를 만든다(#275). 저장소 밖 빈 폴더에만 쓰고, 기존 파일은 덮어쓰지 않는다.
# 만드는 것: 합성 비밀값(무작위)·DB 계정·시험용 사설 CA와 DB 서버 인증서, compose 실행 묶음(compose.env).
# 운영 비밀값·운영 CA를 만들지 않는다. 운영 값은 배포 환경의 비밀 관리에서 주입한다(deploy/README.md).
#
# 사용: deploy/scripts/make-local-env.sh <저장소 밖 새 폴더>
# 이미지·포트·이름은 환경변수로 바꿀 수 있다: CATCHU_WEB_IMAGE·CATCHU_API_IMAGE·CATCHU_MIGRATION_IMAGE·CATCHU_WORKER_IMAGE,
# CATCHU_WEB_PORT·CATCHU_API_PORT·CATCHU_WORKER_PORT, CATCHU_SINGLE_NAME.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "사용: $0 <저장소 밖 새 폴더>" >&2
  exit 2
fi
command -v openssl >/dev/null || { echo "openssl이 필요합니다." >&2; exit 2; }

repo_root=$(cd "$(dirname "$0")/../.." && pwd -P)
mkdir -p "$1"
dir=$(cd "$1" && pwd -P)
case "${dir}/" in
  "${repo_root}/"*) echo "환경 폴더는 저장소 밖에 둡니다: ${dir}" >&2; exit 2 ;;
esac
if [ -n "$(ls -A "${dir}")" ]; then
  echo "빈 폴더가 아닙니다. 기존 파일을 덮어쓰지 않습니다: ${dir}" >&2
  exit 2
fi

umask 077
chmod 700 "${dir}"
mkdir "${dir}/tls"
hex32() { openssl rand -hex 32; }

# 시험용 사설 CA와 DB 서버 인증서(이름 db). CA 개인키는 서명 뒤 지운다. 30일 뒤 만료된다(deploy/README.md 「처음 실행」).
tls="${dir}/tls"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=catchu local synthetic CA" \
  -keyout "${tls}/ca.key" -out "${tls}/ca.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=db" \
  -keyout "${tls}/server.key" -out "${tls}/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:db\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > "${tls}/server.ext"
openssl x509 -req -in "${tls}/server.csr" -CA "${tls}/ca.pem" -CAkey "${tls}/ca.key" -CAcreateserial \
  -days 30 -extfile "${tls}/server.ext" -out "${tls}/server.crt" 2>/dev/null
rm -f "${tls}/ca.key" "${tls}/ca.srl" "${tls}/server.csr" "${tls}/server.ext"
# CA·서버 인증서는 공개 정보라 UID 1000으로 도는 api·migration 컨테이너가 읽게 연다. 서버 개인키는 0600으로 두고,
# 합성 DB 컨테이너가 root로 읽어 postgres 소유로 다시 복사한다(local-db/start-tls.sh).
chmod 644 "${tls}/server.crt" "${tls}/ca.pem"

migrator_password=$(hex32)
app_password=$(hex32)

cat > "${dir}/db.env" <<EOF
# 로컬 합성 DB 전용(compose.local-db.yaml). 운영 DB에 쓰지 않는다.
POSTGRES_DB=catchu
POSTGRES_PASSWORD=$(hex32)
CATCHU_MIGRATOR_PASSWORD=${migrator_password}
CATCHU_APP_PASSWORD=${app_password}
EOF

cat > "${dir}/migration.env" <<EOF
# migration 전용 계정. 앱 계정과 다르다.
DB_HOST=db
DB_PORT=5432
DB_NAME=catchu
DB_USER=catchu_migrator
DB_PASSWORD=${migrator_password}
EOF

cat > "${dir}/api.env" <<EOF
# 합성 값. 운영은 배포 환경의 비밀 관리에서 같은 이름으로 주입하고 재배포 때 새로 만들지 않는다.
AUTH_JWT_SECRET=$(hex32)
LINK_GRANT_SECRET=$(hex32)
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
# production은 https만 받는다. 로컬 검증용 합성 주소다(이 주소로 공유 링크를 열 수 없다).
SHARE_LINK_WEB_BASE_URL=https://catchu-single.invalid
CORS_ALLOWED_ORIGINS=
TRUST_PROXY_CIDRS=
DB_HOST=db
DB_PORT=5432
DB_NAME=catchu
DB_USER=catchu_app
DB_PASSWORD=${app_password}
EOF

cat > "${dir}/compose.env" <<EOF
# docker compose --env-file 로 읽는 실행 묶음(비밀값 없음). 교체할 때 이미지 값만 바꾼다.
CATCHU_SINGLE_NAME=${CATCHU_SINGLE_NAME:-catchu-single}
CATCHU_ENV_DIR=${dir}
CATCHU_DB_CA_FILE=${tls}/ca.pem
CATCHU_WEB_IMAGE=${CATCHU_WEB_IMAGE:-catchu-web:local}
CATCHU_API_IMAGE=${CATCHU_API_IMAGE:-catchu-api:local}
CATCHU_MIGRATION_IMAGE=${CATCHU_MIGRATION_IMAGE:-catchu-api-migration:local}
CATCHU_WORKER_IMAGE=${CATCHU_WORKER_IMAGE:-catchu-worker:local}
CATCHU_WEB_PORT=${CATCHU_WEB_PORT:-3000}
CATCHU_API_PORT=${CATCHU_API_PORT:-3001}
CATCHU_WORKER_PORT=${CATCHU_WORKER_PORT:-8000}
EOF

echo "합성 환경을 만들었습니다: ${dir}"
echo "다음: deploy/scripts/replace-single.sh --env-file ${dir}/compose.env --local-db --migrate"
