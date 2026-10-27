#!/usr/bin/env bash
# deploy/aws/db/roles.sql 시험(#276). RDS처럼 슈퍼유저가 아닌 관리자(CREATEROLE·CREATEDB, DB catchu의 소유자)를 둔 PostgreSQL 16 컨테이너에
# psql Pod 틀(k8s/ops/db-admin-pod.yaml)의 이미지·명령·환경 그대로 roles.sql을 실행하고, 각 계정으로 실제로 붙어 권한을 확인한다.
# 이어서 deploy.sh가 migration 뒤마다 띄우는 동의 기록 삭제 권한 확인 Pod 틀(k8s/consent-guard-pod.yaml)의 명령을 migration 계정으로 실행해
# 권한이 있을 때(회수 뒤 0)·없을 때(그대로 0)·회수로 없어지지 않을 때(0이 아니고 회수도 되돌림)를 본다.
# 클라이언트는 Pod처럼 사용자 999·읽기 전용 루트·권한 제거·TLS verify-full로 돈다. 비밀번호는 시험마다 새로 만드는 합성 값이다.
# 확인하지 못하는 것: RDS 관리자(rds_superuser)만의 특성, 실제 RDS 인증서·파라미터 그룹, migration이 실제로 만든 동의 기록 표
# (같은 이름의 합성 표로 본다). 이것은 2단계 실제 RDS에서 본다.
# 필요한 것: docker·openssl·jq·ruby. 사용: bash deploy/aws/scripts/db-roles.test.sh   (1분쯤, 실패가 하나라도 있으면 종료 코드 1)
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
for tool in docker openssl jq ruby; do
  command -v "$tool" > /dev/null || { echo "${tool}이(가) 없어 시험할 수 없다" >&2; exit 1; }
done
docker info > /dev/null 2>&1 || { echo "docker가 돌고 있지 않아 시험할 수 없다" >&2; exit 1; }
WORK=$(mktemp -d)
NET=catchu-roles-test-$$
DB=${NET}-db
OUT=$WORK/out.log
LOGS=$WORK/outputs.log
pass=0
fail=0
cleanup() {
  docker rm -f "$DB" > /dev/null 2>&1
  docker network rm "$NET" > /dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---------- psql Pod 틀에서 이미지·명령·고정 환경값을 읽는다 ----------
pod=$(ruby -ryaml -rjson -e 'puts JSON.generate(YAML.load_stream(STDIN.read).compact)' < "$ROOT/deploy/aws/k8s/ops/db-admin-pod.yaml" |
  jq -c '.[0].spec.containers[0]')
IMAGE=$(jq -r .image <<< "$pod")
cmd=()
while IFS= read -r part; do cmd+=("$part"); done < <(jq -r '.command[]' <<< "$pod")
fixed=()
while IFS= read -r pair; do fixed+=(-e "$pair"); done < <(jq -r '.env[] | select(.value != null) | "\(.name)=\(.value)"' <<< "$pod")

# ---------- 합성 CA·서버 인증서(이름 db)와 TLS만 받는 서버 ----------
mkdir -p "$WORK/tls" "$WORK/ca"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=catchu roles test CA" \
  -keyout "$WORK/tls/ca.key" -out "$WORK/tls/ca.pem" 2> /dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=db" -keyout "$WORK/tls/server.key" -out "$WORK/tls/server.csr" 2> /dev/null
printf 'subjectAltName=DNS:db\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > "$WORK/tls/server.ext"
openssl x509 -req -in "$WORK/tls/server.csr" -CA "$WORK/tls/ca.pem" -CAkey "$WORK/tls/ca.key" -CAcreateserial -days 1 \
  -extfile "$WORK/tls/server.ext" -out "$WORK/tls/server.crt" 2> /dev/null
chmod 644 "$WORK/tls/"*
cp "$WORK/tls/ca.pem" "$WORK/ca/db-ca.pem"

SUPER_PW=$(openssl rand -hex 16)
ADMIN_PW=$(openssl rand -hex 16)
APP_PW=$(openssl rand -hex 32)
MIGRATOR_PW=$(openssl rand -hex 32)
OUTSIDER_PW=$(openssl rand -hex 16)
APP_PW2=$(openssl rand -hex 32)
MIGRATOR_PW2=$(openssl rand -hex 32)

docker network create "$NET" > /dev/null || { echo "docker 망을 만들지 못했다" >&2; exit 1; }
POSTGRES_PASSWORD=$SUPER_PW docker run -d --name "$DB" --network "$NET" --network-alias db --network-alias db-other -e POSTGRES_PASSWORD \
  -v "$WORK/tls:/run/catchu/tls:ro" -v "$ROOT/deploy/local-db/start-tls.sh:/catchu/start-tls.sh:ro" \
  --entrypoint /catchu/start-tls.sh "$IMAGE" > /dev/null || { echo "DB 컨테이너를 띄우지 못했다" >&2; exit 1; }
ready=0
for _ in $(seq 120); do
  # 초기화 중의 임시 서버는 소켓만 연다. TCP가 열리면 본 서버다.
  docker exec "$DB" pg_isready -q -h 127.0.0.1 -p 5432 > /dev/null 2>&1 && { ready=1; break; }
  sleep 0.5
done
[ "$ready" = 1 ] || { echo "DB가 준비되지 않았다" >&2; docker logs "$DB" 2>&1 | tail -20 >&2; exit 1; }

# RDS와 같게: 관리자는 슈퍼유저가 아니고 DB catchu의 소유자다. 실패한 문장을 로그에 남기지 않는 설정도 catchu-pg16과 같게 둔다.
printf "CREATE ROLE catchu_admin LOGIN CREATEROLE CREATEDB PASSWORD '%s';
CREATE DATABASE catchu OWNER catchu_admin;
CREATE ROLE outsider LOGIN PASSWORD '%s';
ALTER SYSTEM SET log_min_error_statement = 'panic';
ALTER SYSTEM SET log_statement = 'none';
SELECT pg_reload_conf();\n" "$ADMIN_PW" "$OUTSIDER_PW" |
  docker exec -i "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres > /dev/null ||
  { echo "시험용 관리자·DB를 만들지 못했다" >&2; exit 1; }

# ---------- 실행 도우미 ----------
runs=0
run_pod() { # SQL 파일 [앱 비밀번호 migration 비밀번호] — Pod 틀과 같은 이미지·명령·환경·보안 설정으로 실행한다.
  # 실행마다 새 폴더를 붙인다(실제 Pod도 실행마다 새 ConfigMap이다). 같은 경로의 파일을 바꿔 쓰면 Docker Desktop의
  # 폴더 공유가 옛 파일 크기로 잘라 보여 주는 경우가 있었다.
  local files
  runs=$((runs + 1))
  files="$WORK/pod-${runs}"
  mkdir "$files"
  cp "$1" "${files}/run.sql"
  cp "$WORK/tls/ca.pem" "${files}/db-ca.pem"
  chmod 644 "${files}/"*
  PGPASSWORD=$ADMIN_PW CATCHU_APP_PASSWORD=${2:-$APP_PW} CATCHU_MIGRATOR_PASSWORD=${3:-$MIGRATOR_PW} \
    docker run --rm --network "$NET" --read-only --tmpfs /tmp --user 999:999 --cap-drop ALL --security-opt no-new-privileges \
    "${fixed[@]}" -e "PGHOST=${POD_HOST:-db}" -e PGUSER=catchu_admin -e PGPASSWORD -e CATCHU_APP_PASSWORD -e CATCHU_MIGRATOR_PASSWORD \
    -v "${files}:/run/db-admin:ro" "$IMAGE" "${cmd[@]}" > "$OUT" 2>&1
  rc=$?
  cat "$OUT" >> "$LOGS"
}
sql_as() { # 사용자 비밀번호 SQL — TLS verify-full로 붙어 실행한다. 결과는 $OUT, 종료 코드는 rc.
  printf '%s\n' "$3" | PGPASSWORD=$2 docker run --rm -i --network "$NET" --read-only --tmpfs /tmp --user 999:999 --cap-drop ALL \
    -e PGPASSWORD -e PGHOST=db -e PGDATABASE=catchu -e "PGUSER=$1" -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/db-admin/db-ca.pem \
    -e HOME=/tmp -v "$WORK/ca:/run/db-admin:ro" "$IMAGE" psql -X -q -t -A -v ON_ERROR_STOP=1 > "$OUT" 2>&1
  rc=$?
  cat "$OUT" >> "$LOGS"
}
check() { # 이름, 결과(0이면 통과)
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "통과: $1"; else fail=$((fail + 1)); echo "실패: $1"; sed 's/^/    | /' "$OUT"; fi
}
ok() { "$@" > /dev/null 2>&1; echo $?; }
says() { grep -qF -- "$1" "$OUT"; }

# ---------- 시험 ----------
check "psql Pod 틀의 이미지가 로컬 합성 DB(compose.local-db.yaml)와 같은 이미지·digest" \
  "$(ok grep -qF "image: ${IMAGE#docker.io/}" "$ROOT/deploy/compose.local-db.yaml")"

run_pod "$ROOT/deploy/aws/db/roles.sql"
check "roles.sql: 슈퍼유저 아닌 관리자로 Pod 틀 그대로(사용자 999·읽기 전용 루트·TLS verify-full·한 트랜잭션) 실행해 종료 0" "$(ok test "$rc" = 0)"
check "roles.sql 확인 출력: 앱 계정 lock_timeout 3초, DB·public 스키마 소유자가 migration 계정" \
  "$( { says '{lock_timeout=3s}' && grep -q '^ catchu *| catchu_migrator' "$OUT" && grep -q '^ public *| catchu_migrator' "$OUT"; } > /dev/null 2>&1; echo $?)"
# 같은 서버를 인증서와 다른 이름(db-other)으로 부르면 Pod 설정이 연결을 거부해야 한다(TLS가 호스트 이름까지 검증하는지).
printf '%s\n' 'SELECT 1;' > "$WORK/select1.sql"
POD_HOST=db-other run_pod "$WORK/select1.sql"
check "인증서와 다른 이름으로 붙으면 거부(Pod의 TLS verify-full이 호스트 이름까지 검증)" \
  "$( { test "$rc" != 0 && says 'does not match host name'; } > /dev/null 2>&1; echo $?)"

sql_as catchu_app "$APP_PW" 'SHOW lock_timeout;'
check "앱 계정: 새 연결의 lock_timeout이 3s" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = 3s)"
sql_as catchu_migrator "$MIGRATOR_PW" 'SHOW lock_timeout;'
check "migration 계정: lock_timeout은 기본값(0)" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = 0)"
sql_as catchu_migrator "$MIGRATOR_PW" 'CREATE TABLE t (id integer PRIMARY KEY, v text); CREATE SEQUENCE s;'
check "migration 계정: public 스키마에 표·시퀀스를 만듦" "$(ok test "$rc" = 0)"
sql_as catchu_app "$APP_PW" "INSERT INTO t VALUES (1, 'a'); UPDATE t SET v = 'b'; SELECT v FROM t; DELETE FROM t; SELECT nextval('s');"
check "앱 계정: migration 계정이 만든 새 표를 읽고 쓰고 지움, 시퀀스 사용" "$(ok test "$rc" = 0)"
sql_as catchu_app "$APP_PW" 'CREATE TABLE x (id integer);'
check "앱 계정: 스키마에 표를 만들지 못함" "$( { test "$rc" != 0 && says 'permission denied for schema public'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_app "$APP_PW" 'ALTER TABLE t ADD COLUMN w integer;'
check "앱 계정: 표 구조를 바꾸지 못함" "$( { test "$rc" != 0 && says 'must be owner of table t'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_admin "$ADMIN_PW" "SELECT has_table_privilege('catchu_app', 't', 'DELETE');"
check "기본 권한이 새 표에 DELETE를 준다(동의 기록은 migration 뒤 따로 회수해야 하는 이유)" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = t)"
sql_as outsider "$OUTSIDER_PW" 'SELECT 1;'
check "그 밖의 계정은 DB catchu에 접속하지 못함(PUBLIC 접속 권한 회수)" "$( { test "$rc" != 0 && says 'permission denied for database "catchu"'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_admin "$ADMIN_PW" "SELECT has_schema_privilege('outsider', 'public', 'USAGE');"
check "그 밖의 계정은 public 스키마도 쓰지 못함(PUBLIC 스키마 권한 회수)" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = f)"
sql_as catchu_admin "$ADMIN_PW" "SELECT bool_or(rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR NOT rolcanlogin)
  FROM pg_roles WHERE rolname IN ('catchu_app', 'catchu_migrator');"
check "앱·migration 계정은 로그인만 하고 특별 권한(슈퍼유저·역할·DB 만들기·복제·행 보안 우회)이 없음" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = f)"
sql_as catchu_admin "$ADMIN_PW" 'SET ROLE catchu_migrator; SELECT current_user;'
check "관리자: 회수 뒤에도 접속하고 migration 계정으로 SET ROLE 할 수 있음" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = catchu_migrator)"

run_pod "$ROOT/deploy/aws/db/roles.sql" "$APP_PW2" "$MIGRATOR_PW2"
check "다시 실행하면 CREATE ROLE에서 실패" "$( { test "$rc" != 0 && says 'already exists'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_app "$APP_PW" 'SELECT 1;'
check "다시 실행이 실패해도 아무것도 바뀌지 않음(앱 계정 비밀번호 그대로)" "$(ok test "$rc" = 0)"
printf '%s\n' 'CREATE ROLE catchu_rollback_probe NOLOGIN;' 'SELECT 1 / 0;' > "$WORK/partial.sql"
run_pod "$WORK/partial.sql"
partial_rc=$rc
sql_as catchu_admin "$ADMIN_PW" "SELECT count(*) FROM pg_roles WHERE rolname = 'catchu_rollback_probe';"
check "중간 문장이 실패하면 앞 문장도 되돌림(Pod 명령의 한 트랜잭션)" "$(ok test "$partial_rc" != 0 -a "$rc" = 0 -a "$(cat "$OUT")" = 0)"
# psql 기본값은 위치 오류 때 문장 줄(비밀번호 포함)을 그대로 보여 준다. Pod 명령의 VERBOSITY terse가 SQL 파일과 관계없이 막는지 본다.
printf '%s\n' '\getenv app_password CATCHU_APP_PASSWORD' "ALTER ROLE catchu_app PASSWORD :'app_password' BOGUS;" > "$WORK/positional.sql"
run_pod "$WORK/positional.sql" "$APP_PW2"
check "SQL 파일이 VERBOSITY를 켜지 않아도 위치 오류 때 비밀번호가 든 문장을 되풀이하지 않음(Pod 명령)" \
  "$( { test "$rc" != 0 && says 'at character' && ! grep -qF "$APP_PW2" "$OUT"; } > /dev/null 2>&1; echo $?)"

# ---------- 동의 기록 삭제 권한 확인 Pod(k8s/consent-guard-pod.yaml) ----------
# deploy.sh가 migration 뒤마다 띄우는 Pod다. 틀의 이미지·명령(SQL 포함)·고정 환경값을 그대로 쓰고, ConfigMap catchu-db(DB 주소·CA)와
# Secret catchu-migration(비밀번호) 자리는 이 시험의 값으로 채운다. 동의 기록 표는 실제 migration 대신 같은 이름의 합성 표로 만든다.
guard=$(ruby -ryaml -rjson -e 'puts JSON.generate(YAML.load_stream(STDIN.read).compact)' < "$ROOT/deploy/aws/k8s/consent-guard-pod.yaml" |
  jq -c '.[0].spec.containers[0]')
GUARD_IMAGE=$(jq -r .image <<< "$guard")
guard_cmd=()
while IFS= read -r -d '' part; do guard_cmd+=("$part"); done < <(jq -j '.command[] | ., "\u0000"' <<< "$guard")
guard_fixed=()
while IFS= read -r pair; do guard_fixed+=(-e "$pair"); done < <(jq -r '.env[] | select(.value != null) | "\(.name)=\(.value)"' <<< "$guard")
run_guard() { # Pod 틀과 같은 이미지·명령·환경·보안 설정으로 migration 계정이 실행한다. 결과는 $OUT, 종료 코드는 rc.
  PGPASSWORD=$MIGRATOR_PW docker run --rm --network "$NET" --read-only --tmpfs /tmp --user 999:999 --cap-drop ALL --security-opt no-new-privileges \
    "${guard_fixed[@]}" -e "PGHOST=${POD_HOST:-db}" -e PGPASSWORD -v "$WORK/ca:/run/catchu:ro" "$GUARD_IMAGE" "${guard_cmd[@]}" > "$OUT" 2>&1
  rc=$?
  cat "$OUT" >> "$LOGS"
}
app_privileges() { # 앱 계정이 동의 기록에 실제로 쓸 수 있는 권한(SELECT·INSERT·UPDATE·DELETE·TRUNCATE 순서로 true/false)
  sql_as catchu_admin "$ADMIN_PW" "SELECT string_agg(has_table_privilege('catchu_app', 'public.analysis_consent', p)::text, ',' ORDER BY n)
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) WITH ORDINALITY AS x(p, n);"
}
check "확인 Pod 틀: DB 관리 Pod 틀과 같은 postgres digest, 명령은 psql 한 번(SQL 포함 ${#guard_cmd[@]}개 인자)" \
  "$(ok test "$GUARD_IMAGE" = "$IMAGE" -a "${guard_cmd[0]}" = psql)"

run_guard
check "확인 Pod: 동의 기록 표가 없으면(migration이 만들지 않음) 0이 아님" "$( { test "$rc" != 0 && says 'does not exist'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_migrator "$MIGRATOR_PW" 'CREATE TABLE analysis_consent (consent_id integer PRIMARY KEY, accepted boolean NOT NULL);'
app_privileges
check "준비: migration 계정이 만든 동의 기록 표에 앱 계정이 기본 권한으로 DELETE를 받음(TRUNCATE는 없음)" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = true,true,true,true,false)"

run_guard
check "확인 Pod: 권한이 있으면 회수하고 0, 결과 줄 '회수 전 있음, 회수 뒤 없음'" \
  "$( { test "$rc" = 0 && says '동의 기록 직접 삭제 권한(catchu_app): 회수 전 있음, 회수 뒤 없음'; } > /dev/null 2>&1; echo $?)"
app_privileges
check "회수 뒤: 앱 계정은 동의 기록을 읽고 쓰는 권한은 그대로, DELETE·TRUNCATE는 없음" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = true,true,true,false,false)"
sql_as catchu_app "$APP_PW" 'INSERT INTO analysis_consent VALUES (1, true); SELECT count(*) FROM analysis_consent;'
check "회수 뒤: 앱 계정이 동의 기록을 남기고 읽음" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = 1)"
sql_as catchu_app "$APP_PW" 'DELETE FROM analysis_consent;'
check "회수 뒤: 앱 계정이 동의 기록을 DELETE하지 못함" "$( { test "$rc" != 0 && says 'permission denied for table analysis_consent'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_app "$APP_PW" 'TRUNCATE analysis_consent;'
check "회수 뒤: 앱 계정이 동의 기록을 TRUNCATE하지 못함" "$( { test "$rc" != 0 && says 'permission denied for table analysis_consent'; } > /dev/null 2>&1; echo $?)"

run_guard
check "확인 Pod: 권한이 없으면 바꾸지 않고 0, 결과 줄 '회수 전 없음, 회수 뒤 없음'" \
  "$( { test "$rc" = 0 && says '동의 기록 직접 삭제 권한(catchu_app): 회수 전 없음, 회수 뒤 없음'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_migrator "$MIGRATOR_PW" 'GRANT TRUNCATE ON analysis_consent TO catchu_app;'
run_guard
guard_rc=$rc
guard_out=$(cat "$OUT")
app_privileges
check "확인 Pod: 앱 계정에 직접 준 TRUNCATE도 직접 삭제 권한으로 보고 회수" \
  "$( { test "$guard_rc" = 0 -a "$(cat "$OUT")" = true,true,true,false,false && grep -qF '회수 전 있음, 회수 뒤 없음' <<< "$guard_out"; } > /dev/null 2>&1; echo $?)"

# 회수로 없어지지 않는 권한: PUBLIC에 준 DELETE는 앱 계정에서 회수해도 남는다. 앱 계정에 직접 준 DELETE도 함께 두어 되돌림을 본다.
sql_as catchu_migrator "$MIGRATOR_PW" 'GRANT DELETE ON analysis_consent TO catchu_app; GRANT DELETE ON analysis_consent TO PUBLIC;'
run_guard
check "확인 Pod: 회수 뒤에도 권한이 남으면(PUBLIC에 준 DELETE) 0이 아니고 남았다고 알림" \
  "$( { test "$rc" != 0 && says '회수 뒤에도 남아 있다(회수 전 있음)'; } > /dev/null 2>&1; echo $?)"
sql_as catchu_admin "$ADMIN_PW" "SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a
  WHERE c.oid = 'public.analysis_consent'::regclass AND a.grantee = 'catchu_app'::regrole AND a.privilege_type = 'DELETE';"
check "확인 Pod: 실패하면 한 트랜잭션이라 앞의 회수(앱 계정에 직접 준 DELETE)도 되돌림" "$(ok test "$rc" = 0 -a "$(cat "$OUT")" = 1)"
sql_as catchu_migrator "$MIGRATOR_PW" 'REVOKE DELETE ON analysis_consent FROM PUBLIC;'
run_guard
check "원인(PUBLIC 권한)을 고친 뒤 다시 실행하면 회수하고 0" \
  "$( { test "$rc" = 0 && says '회수 전 있음, 회수 뒤 없음'; } > /dev/null 2>&1; echo $?)"
POD_HOST=db-other run_guard
check "확인 Pod: 인증서와 다른 이름으로 붙으면 거부(TLS verify-full이 호스트 이름까지 검증)" \
  "$( { test "$rc" != 0 && says 'does not match host name'; } > /dev/null 2>&1; echo $?)"

docker logs "$DB" > "$WORK/server.log" 2>&1
leaked=0
for pw in "$ADMIN_PW" "$APP_PW" "$MIGRATOR_PW" "$APP_PW2" "$MIGRATOR_PW2" "$OUTSIDER_PW"; do
  grep -qF "$pw" "$LOGS" "$WORK/server.log" && leaked=1
done
: > "$OUT"
check "비밀번호가 psql 출력과 DB 로그에 남지 않음(실패한 다시 실행·동의 기록 확인 Pod 포함)" "$(ok test "$leaked" = 0)"

echo
echo "통과 $pass, 실패 $fail"
[ "$fail" = 0 ]
