#!/bin/sh
# 로컬 합성 DB 초기화(#275, 처음 한 번). migration 계정이 스키마를 소유하고, 앱 계정은 자료 읽기·쓰기만 한다.
# 운영 DB의 계정·권한(동의 기록 삭제 제한, 시간 상한 포함)은 #276에서 정한다. 이 파일을 운영 권한의 근거로 쓰지 않는다.
# 비밀번호는 명령 인자가 아니라 환경변수에서 읽는다(psql \getenv).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv migrator_password CATCHU_MIGRATOR_PASSWORD
\getenv app_password CATCHU_APP_PASSWORD
\getenv db_name POSTGRES_DB
CREATE ROLE catchu_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE catchu_app LOGIN PASSWORD :'app_password';
ALTER DATABASE :"db_name" OWNER TO catchu_migrator;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO catchu_app;
ALTER SCHEMA public OWNER TO catchu_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO catchu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE catchu_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO catchu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE catchu_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO catchu_app;
SQL
