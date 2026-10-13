#!/bin/sh
# 로컬 합성 DB 시작(#275, 검증·재현 전용). 인증서를 postgres 소유로 복사하고 TLS 연결만 받는다.
# hostssl 줄만 두므로 평문 TCP 연결은 pg_hba에서 거부된다. 컨테이너 안 소켓 연결(초기화 스크립트·상태 확인)만 trust다.
set -eu

dir=/var/lib/postgresql/catchu-tls
install -d -o postgres -g postgres -m 0700 "$dir"
install -o postgres -g postgres -m 0600 /run/catchu/tls/server.key "$dir/server.key"
install -o postgres -g postgres -m 0644 /run/catchu/tls/server.crt "$dir/server.crt"
cat > "$dir/pg_hba.conf" <<'EOF'
local   all  all                trust
hostssl all  all  0.0.0.0/0     scram-sha-256
hostssl all  all  ::/0          scram-sha-256
EOF
chown postgres:postgres "$dir/pg_hba.conf"

exec docker-entrypoint.sh postgres \
  -c ssl=on \
  -c ssl_min_protocol_version=TLSv1.2 \
  -c "ssl_cert_file=$dir/server.crt" \
  -c "ssl_key_file=$dir/server.key" \
  -c "hba_file=$dir/pg_hba.conf"
