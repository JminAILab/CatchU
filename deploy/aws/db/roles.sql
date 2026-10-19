-- catchu RDS 계정과 권한(#276, 계획 D3). db-admin.sh가 RDS 관리자(catchu_admin)로 한 트랜잭션 안에서 한 번 실행한다.
--   bash deploy/aws/scripts/db-admin.sh deploy/aws/db/roles.sql
-- migration 계정(catchu_migrator)이 DB와 public 스키마를 소유하고, 앱 계정(catchu_app)은 자료 읽기·쓰기만 한다.
-- 권한은 로컬 deploy/local-db/init-roles.sh와 같고 다음이 다르다.
--   1) RDS 관리자는 슈퍼유저가 아니다. PostgreSQL 16은 소유자를 넘기려면 새 소유자 역할로 SET ROLE 할 수 있어야 하므로,
--      관리자가 만든 역할(만든 역할에는 ADMIN 권한이 있다)을 자신에게 SET으로 준 뒤 넘긴다. 스키마는 그 역할로 바꿔서 넘긴다.
--   2) 앱 계정에 잠금 대기 상한 3초(#220 합의). 트랜잭션 안 유휴 상한은 #220에서 값을 정하면 따로 SQL 파일을 더해 같은 방법으로
--      실행한다(그때까지는 RDS 기본값).
-- 동의 기록(analysis_consent)의 삭제 권한 회수는 migration이 그 표를 만든 뒤에 한다(deploy/aws/k8s/README.md 「적용(2단계)」).
-- 비밀번호는 Pod 환경변수에서 \getenv로 읽는다. 문장이 실패해도 DB 로그에 남지 않는다(파라미터 그룹 catchu-pg16의
-- log_min_error_statement=panic, db-admin.sh가 실행 전에 확인한다). 다시 실행하면 CREATE ROLE에서 실패하고 아무것도 바뀌지 않는다.
\set ON_ERROR_STOP on
\set VERBOSITY terse
\set SHOW_CONTEXT never
\getenv migrator_password CATCHU_MIGRATOR_PASSWORD
\getenv app_password CATCHU_APP_PASSWORD

CREATE ROLE catchu_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE catchu_app LOGIN PASSWORD :'app_password';
GRANT catchu_migrator TO CURRENT_USER WITH SET TRUE;
ALTER DATABASE catchu OWNER TO catchu_migrator;
REVOKE ALL ON DATABASE catchu FROM PUBLIC;
GRANT CONNECT ON DATABASE catchu TO catchu_app;

SET ROLE catchu_migrator;
ALTER SCHEMA public OWNER TO catchu_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO catchu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE catchu_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO catchu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE catchu_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO catchu_app;
RESET ROLE;

ALTER ROLE catchu_app SET lock_timeout = '3s';

-- 확인(#276 완료 기준 증거). 비밀번호는 고르지 않는다.
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolconfig
  FROM pg_roles WHERE rolname IN ('catchu_app', 'catchu_migrator') ORDER BY rolname;
SELECT datname, pg_get_userbyid(datdba) AS owner, datacl FROM pg_database WHERE datname = current_database();
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl FROM pg_namespace WHERE nspname = 'public';
SELECT pg_get_userbyid(defaclrole) AS for_role, defaclobjtype, defaclacl FROM pg_default_acl ORDER BY defaclobjtype;
