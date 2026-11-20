-- 앱 계정의 트랜잭션 안 유휴 상한 5분(#276, 2026-11-19 팀장 결정). db-admin.sh가 RDS 관리자로 한 트랜잭션 안에서 실행한다.
--   bash deploy/aws/scripts/db-admin.sh deploy/aws/db/idle-in-transaction.sql
-- roles.sql 뒤에 실행한다. ALTER ROLE ... SET이라 다시 실행해도 같은 값이 되고, 값을 바꿀 때도 이 파일을 고쳐 다시 실행한다.
-- 트랜잭션을 연 채 DB에 아무 문장도 보내지 않는 시간이 5분을 넘으면 PostgreSQL이 그 연결을 끊고 트랜잭션을 되돌린다.
-- 멈춘 연결이 행 잠금을 오래 쥐는 것을 막는다. 5분인 까닭은 api/docs/lock-wait-limit.md 「결정과 적용 위치」에 있다.
-- 잠금 대기 상한(lock_timeout)과 같이 앱 계정에만 걸고 migration 계정에는 걸지 않는다. 계정 설정은 새 연결부터 걸리므로 실행한 뒤 api를 다시 띄운다.
\set ON_ERROR_STOP on

ALTER ROLE catchu_app SET idle_in_transaction_session_timeout = '5min';

-- 확인(#276 완료 기준 증거).
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('catchu_app', 'catchu_migrator') ORDER BY rolname;
