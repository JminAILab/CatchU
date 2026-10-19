// #220 잠금 대기 상한 시험의 공용 지원. 운영처럼 앱 DB 계정에만 lock_timeout을 걸고(2026-10-16 합의),
// 코드의 DB 연결 설정(buildDataSourceOptions)은 바꾸지 않는다. 계정은 서버 전체에 생기므로 drop()으로 반드시 지운다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { buildDataSourceOptions } = require('../../dist/database/database.config');
const { assertTestDatabaseName } = require('./test-database.cjs');

const APP_LOCK_TIMEOUT = '3s';
const APP_LOCK_TIMEOUT_MS = 3000;
const LOCK_NOT_AVAILABLE = '55P03';
const ROLE_PREFIX = 'catchu_t220_';
const NO_ROLE_PRIVILEGE = '테스트 DB 계정에 역할 생성 권한이 없어 시험 전용 앱 계정을 만들지 못했다';
// 잠금을 쥐는 시험 연결(테스트 DB 계정)에는 계정 상한이 없다. 그 연결이 잠금을 얻으려고 기다릴 때 멈추지 않도록 그 트랜잭션에만
// 넉넉한 상한을 둔다. 이 상한은 이미 얻은 잠금을 풀지 않으며, 쥔 잠금은 release()나 cleanUpLocks()가 푼다.
const HOLDER_LOCK_TIMEOUT = '20s';
// cleanUpLocks()가 시험이 시작한 작업을 기다리는 한도. 앱 계정의 잠금 대기(3초)·시험 HTTP 요청 한도(15~20초)·
// 잠금을 얻으려는 시험 연결의 상한(20초)보다 길다.
const CLEANUP_WAIT_MS = 30000;

const quote = name => `"${name.replaceAll('"', '""')}"`;
const sleep = ms => new Promise(done => setTimeout(done, ms));

async function canCreateRoles(db) {
  const [row] = await db.query('SELECT rolsuper OR rolcreaterole AS allowed FROM pg_roles WHERE rolname = current_user');
  return row?.allowed === true;
}

async function dropRoles(db, names) {
  if (names.length === 0) return;
  // 남은 연결이 있으면 DROP ROLE이 실패하므로 시험 계정의 연결만 끊는다.
  await db.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = ANY($1::text[]) AND pid <> pg_backend_pid()',
    [names]);
  const list = names.map(quote).join(', ');
  // 이 DB의 권한과 DB 접속 권한을 거두고 계정을 지운다. 계정의 DB별 설정(pg_db_role_setting)도 함께 지워진다.
  await db.query(`DROP OWNED BY ${list}`);
  await db.query(`DROP ROLE ${list}`);
}

/**
 * 시험 전용 앱·마이그레이션 계정을 만든다. 앱 계정은 제품 앱 계정처럼 자료 읽기·쓰기만 받고,
 * `ALTER ROLE … IN DATABASE <시험 DB> SET lock_timeout`으로 이 DB 연결에만 상한이 걸린다.
 * 계정 생성 권한이 없으면 null이다. CI(CI=true)는 superuser 테스트 계정으로 돌므로 권한이 없으면 실패시킨다.
 */
async function createLockWaitRoles(db) {
  const database = db.options.database;
  assertTestDatabaseName(database);
  if (!await canCreateRoles(db)) {
    if (process.env.CI === 'true') throw new Error(`${NO_ROLE_PRIVILEGE}(CI에서는 건너뛰지 않는다)`);
    return null;
  }
  const suffix = randomBytes(4).toString('hex');
  const app = { username: `${ROLE_PREFIX}app_${suffix}`, password: randomBytes(24).toString('hex') };
  const migrator = { username: `${ROLE_PREFIX}mig_${suffix}`, password: randomBytes(24).toString('hex') };
  const [{ schema }] = await db.query('SELECT current_schema() AS schema');
  // 역할·멤버십·권한 설정을 함께 롤백한다. 중간 실패를 별도 DROP으로 복구하다 역할이 남지 않게 한다.
  await db.transaction(async manager => {
    for (const role of [app, migrator]) {
      // 비밀번호는 16진수 난수라 따옴표를 깨지 않는다. 시험 계정 밖에서는 쓰지 않는다.
      await manager.query(`CREATE ROLE ${quote(role.username)} LOGIN PASSWORD '${role.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
      // PG16의 CREATEROLE만으로는 DROP OWNED·연결 종료에 필요한 상속 권한이 생기지 않는다.
      // 실행자가 새 시험 역할만 상속한다. 앱 역할이 실행자의 권한을 받는 방향이 아니다.
      await manager.query(`GRANT ${quote(role.username)} TO CURRENT_USER WITH INHERIT TRUE, SET FALSE`);
    }
    await manager.query(`GRANT CONNECT ON DATABASE ${quote(database)} TO ${quote(app.username)}, ${quote(migrator.username)}`);
    await manager.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(app.username)}`);
    await manager.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(app.username)}`);
    await manager.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(app.username)}`);
    await manager.query(`ALTER ROLE ${quote(app.username)} IN DATABASE ${quote(database)} SET lock_timeout = '${APP_LOCK_TIMEOUT}'`);
  });
  const config = (role, overrides = {}) => ({ host: db.options.host, port: db.options.port, database,
    username: role.username, password: role.password, ...overrides });
  let dropped = false;
  return {
    database, app, migrator, config,
    /** 앱의 연결 설정(buildDataSourceOptions)으로 새 연결을 연다. */
    open: (role, overrides = {}) => new DataSource(buildDataSourceOptions(config(role, overrides))).initialize(),
    async drop() {
      if (dropped) return;
      await dropRoles(db, [app.username, migrator.username]);
      dropped = true;
    },
  };
}

/** 앱(DatabaseModule)이 시험 앱 계정으로 접속하도록 DB_*를 잠시 바꿔 만든다. 만든 뒤 원래 값으로 되돌린다. */
async function withAppAccount(roles, create) {
  const saved = { DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD };
  process.env.DB_USER = roles.app.username;
  process.env.DB_PASSWORD = roles.app.password;
  try { return await create(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

// 시험이 쥔 잠금 연결과 아직 끝나지 않은 작업(hold()·timed()). 대기 확인이나 검사가 실패해 시험이 release() 전에 끝나도
// 각 시험 파일의 afterEach가 cleanUpLocks()로 잠금을 풀고 작업이 끝나기를 기다려, 다음 시험의 자료 정리(TRUNCATE)와
// 연결 종료(db.destroy())가 남은 잠금에 막히지 않는다.
const holders = new Set();
const pending = new Set();
function follow(promise) {
  pending.add(promise);
  const forget = () => { pending.delete(promise); };
  promise.then(forget, forget);
  return promise;
}

/** 다른 연결이 잠금을 쥐고 있게 한다. sql은 그 트랜잭션 안에서 실행할 잠금 SQL이다. release()로 끝내고 보유 시간(ms)을 받는다. */
function hold(db, sql, params = []) {
  return follow((async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    let pid;
    try {
      await runner.startTransaction('READ COMMITTED');
      await runner.query(`SET LOCAL lock_timeout = '${HOLDER_LOCK_TIMEOUT}'`);
      pid = (await runner.query('SELECT pg_backend_pid() AS pid'))[0].pid;
      await runner.query(sql, params);
    } catch (error) {
      try { if (runner.isTransactionActive) await runner.rollbackTransaction(); } finally { await runner.release(); }
      throw error;
    }
    const acquiredAt = Date.now();
    let released;
    const held = {
      pid, acquiredAt,
      /** 롤백하고 연결을 돌려준다. 여러 번 불러도 한 번만 풀고 같은 보유 시간을 준다. */
      release() {
        released ??= (async () => {
          try { await runner.rollbackTransaction(); } finally {
            holders.delete(held);
            await runner.release();
          }
          return Date.now() - acquiredAt;
        })();
        return released;
      },
    };
    holders.add(held);
    return held;
  })());
}

/**
 * 각 시험 파일의 afterEach에서 부른다. 남은 잠금 연결을 롤백·반납하고, 시작한 작업(그 잠금을 기다리던 요청, 아직 잠금을
 * 얻는 중인 hold())이 끝나기를 기다린 뒤 그 사이 얻은 잠금도 푼다. 작업이 한도 안에 끝나지 않거나 반납이 실패하면 던진다.
 */
async function cleanUpLocks() {
  const failures = [];
  const releaseAll = async () => {
    for (const outcome of await Promise.allSettled([...holders].map(held => held.release()))) {
      if (outcome.status === 'rejected') failures.push(outcome.reason);
    }
  };
  await releaseAll();
  let timer;
  const settled = await Promise.race([
    Promise.allSettled([...pending]).then(() => true),
    new Promise(done => { timer = setTimeout(done, CLEANUP_WAIT_MS, false); }),
  ]);
  clearTimeout(timer);
  await releaseAll();
  if (!settled) failures.push(new Error(`시험이 시작한 작업 ${pending.size}건이 ${CLEANUP_WAIT_MS}ms 안에 끝나지 않았다`));
  if (failures.length > 0) throw new AggregateError(failures, '시험이 쥔 잠금이나 시작한 작업을 정리하지 못했다');
}
const holdAdvisory = (db, text) => hold(db, 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [text]);
const holdRow = (db, table, column, value) =>
  hold(db, `SELECT 1 FROM ${quote(table)} WHERE ${quote(column)} = $1 FOR UPDATE`, [value]);

/** holder가 쥔 잠금 때문에 기다리는 연결이 생길 때까지 본다. 잠금 대기를 확인한 뒤에 다음 동작을 한다. */
async function waitUntilBlocked(db, holderPid, label = '잠금 대기', timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const rows = await db.query('SELECT pid FROM pg_stat_activity WHERE $1::integer = ANY(pg_blocking_pids(pid))', [holderPid]);
    if (rows.length > 0) return rows[0].pid;
    await sleep(5);
  }
  return assert.fail(`${label}: ${holderPid}에 막힌 연결이 ${timeoutMs}ms 안에 생기지 않았다`);
}

/** 잠금을 기다리는 연결이 count개 이상 생길 때까지 본다. except의 연결(먼저 막아 둔 작업 등)은 세지 않는다. */
async function waitUntilWaiting(db, count, except = [], label = '잠금 대기', timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [{ n }] = await db.query(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0 AND pid <> ALL($1::integer[])',
      [except]);
    if (n >= count) return n;
    await sleep(5);
  }
  return assert.fail(`${label}: 잠금을 기다리는 연결이 ${timeoutMs}ms 안에 ${count}개가 되지 않았다`);
}

/** 성공·실패와 걸린 시간을 함께 돌려준다. 실패를 삼키지 않고 값으로 넘겨 시험에서 판정한다. 끝나기 전에는 정리 대상이다. */
function timed(work) {
  return follow((async () => {
    const started = Date.now();
    try {
      const value = await work();
      return { ok: true, value, ms: Date.now() - started };
    } catch (error) {
      return { ok: false, error, ms: Date.now() - started };
    }
  })());
}

const driverCode = error => error?.driverError?.code ?? error?.code;

/** 강제 상한 초과: 상한만큼 기다렸고, 상한 뒤 오래 끌지 않았다(다른 시간 초과로 끝나지 않았다). */
function assertCapWait(ms, label) {
  assert.ok(ms >= APP_LOCK_TIMEOUT_MS - 100, `${label}: 상한(${APP_LOCK_TIMEOUT_MS}ms)만큼 기다리지 않았다(${ms}ms)`);
  assert.ok(ms < APP_LOCK_TIMEOUT_MS + 3000, `${label}: 상한 뒤에도 오래 걸렸다(${ms}ms)`);
}

/**
 * 같은 행을 다른 요청 뒤에서 기다린 경우. lock_timeout은 잠금 획득 시도마다 따로 걸리고, 행 잠금은 앞선 대기자가 쥔
 * 튜플 잠금과 행을 쥔 트랜잭션을 차례로 기다린다. 앞 요청이 포기한 직후 튜플 잠금을 얻으면 다시 상한만큼 기다릴 수 있다.
 */
function assertQueuedCapWait(ms, label) {
  assert.ok(ms >= APP_LOCK_TIMEOUT_MS - 100, `${label}: 상한(${APP_LOCK_TIMEOUT_MS}ms)만큼 기다리지 않았다(${ms}ms)`);
  assert.ok(ms < 2 * APP_LOCK_TIMEOUT_MS + 1000, `${label}: 상한 두 번보다 오래 걸렸다(${ms}ms)`);
}

/** 시험 기록용 요약. 측정값은 이 환경의 한 번 실행이며 부하 기준이 아니다. */
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = p => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  return { n: sorted.length, min: sorted[0], median: pick(0.5), max: sorted[sorted.length - 1] };
}

module.exports = {
  APP_LOCK_TIMEOUT, APP_LOCK_TIMEOUT_MS, LOCK_NOT_AVAILABLE, NO_ROLE_PRIVILEGE, ROLE_PREFIX,
  assertCapWait, assertQueuedCapWait, canCreateRoles, cleanUpLocks, createLockWaitRoles, driverCode, hold, holdAdvisory, holdRow,
  sleep, summarize, timed, waitUntilBlocked, waitUntilWaiting, withAppAccount,
};
