require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  APP_LOCK_TIMEOUT, LOCK_NOT_AVAILABLE, assertCapWait, createLockWaitRoles, driverCode, holdAdvisory, timed,
} = require('../support/lock-wait-limit.cjs');

const quote = value => `"${value.replaceAll('"', '""')}"`;
const BOOTSTRAP_REQUIRED = '일반 CREATEROLE 계정 회귀 시험의 준비에는 superuser 테스트 DB 계정이 필요하다';
let admin, bootstrapAllowed;

before(async () => {
  admin = await openTestDataSource();
  [{ allowed: bootstrapAllowed }] = await admin.query('SELECT rolsuper AS allowed FROM pg_roles WHERE rolname = current_user');
  if (!bootstrapAllowed && process.env.CI === 'true') throw new Error(`${BOOTSTRAP_REQUIRED}(CI에서는 건너뛰지 않는다)`);
});
after(async () => { await admin?.destroy(); });
beforeEach(async () => { if (bootstrapAllowed) await resetTestDatabase(admin); });

// superuser는 격리 스키마·일반 계정을 준비하고 실패한 시험을 정리하는 데만 쓴다.
// 검사 대상 helper의 생성·잠금 대기·삭제는 NOSUPERUSER CREATEROLE NOINHERIT 계정으로 실행한다.
async function withCreator(t, exercise) {
  if (!bootstrapAllowed) { t.skip(BOOTSTRAP_REQUIRED); return; }
  const suffix = randomBytes(6).toString('hex');
  const username = `catchu_t220_creator_${suffix}`, schema = `catchu_t220_cleanup_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const database = admin.options.database;
  let db;
  const names = new Set();
  try {
    await admin.query(`CREATE ROLE ${quote(username)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION`);
    await admin.query(`GRANT CONNECT ON DATABASE ${quote(database)} TO ${quote(username)} WITH GRANT OPTION`);
    await admin.query(`CREATE SCHEMA ${quote(schema)} AUTHORIZATION ${quote(username)}`);
    await admin.query(`ALTER ROLE ${quote(username)} IN DATABASE ${quote(database)} SET search_path = ${quote(schema)}`);
    db = await openTestDataSource({ username, password, entities: [], migrations: [] });
    assert.deepEqual(await db.query(`SELECT r.rolsuper, r.rolcreaterole, r.rolinherit, current_schema() AS schema
      FROM pg_roles r WHERE rolname = current_user`),
    [{ rolsuper: false, rolcreaterole: true, rolinherit: false, schema }]);
    await exercise({ db, username, names });
  } finally {
    try { if (db?.isInitialized) await db.destroy(); } finally {
      // 실패한 이전 구현도 다음 시험을 오염시키지 않게, 이 fixture가 만든 이름만 관리자 연결로 정리한다.
      const known = [...names, username];
      const existing = await admin.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])', [known]);
      if (existing.length) {
        const present = existing.map(row => row.rolname);
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = ANY($1::text[]) AND pid <> pg_backend_pid()', [present]);
        await admin.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
        await admin.query(`DROP OWNED BY ${present.map(quote).join(', ')}`);
        await admin.query(`DROP ROLE ${present.map(quote).join(', ')}`);
      }
    }
  }
}

async function roleOids(names) {
  return (await admin.query('SELECT oid::int AS oid FROM pg_roles WHERE rolname = ANY($1::text[])', [names])).map(row => row.oid);
}
async function assertRemoved(names, oids) {
  assert.deepEqual(await roleOids(names), [], '시험 역할이 남지 않는다');
  const [{ settings, memberships }] = await admin.query(`SELECT
    (SELECT count(*)::int FROM pg_db_role_setting WHERE setrole = ANY($1::oid[])) AS settings,
    (SELECT count(*)::int FROM pg_auth_members WHERE roleid = ANY($1::oid[]) OR member = ANY($1::oid[])) AS memberships`, [oids]);
  assert.deepEqual({ settings, memberships }, { settings: 0, memberships: 0 });
}
async function assertConnectionsClosed(names) {
  const deadline = Date.now() + 3000;
  let n;
  do {
    [{ n }] = await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = ANY($1::text[])', [names]);
    if (n === 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.equal(n, 0, '삭제한 시험 역할의 연결이 남지 않는다');
}

// helper의 SQL을 다시 구현하지 않는다. 지정 단계에서 실제 DB 오류를 한 번 내고 나머지는 원래 QueryRunner로 실행한다.
// DataSource.query와 transaction의 manager.query 모두 거치므로 생성/삭제 경로를 같은 방식으로 시험한다.
function failOneQuery(t, db, pattern, names, afterStatement = false) {
  const createRunner = db.createQueryRunner.bind(db);
  let failures = 0, createdOids = [], settingCount = 0;
  const factory = t.mock.method(db, 'createQueryRunner', (...args) => {
    const runner = createRunner(...args), query = runner.query.bind(runner);
    t.mock.method(runner, 'query', async (sql, ...params) => {
      const created = typeof sql === 'string' && /^CREATE ROLE "([^"]+)"/.exec(sql);
      if (created) names.add(created[1]);
      if (failures === 0 && typeof sql === 'string' && pattern.test(sql)) {
        failures += 1;
        if (afterStatement) {
          await query(sql, ...params);
          createdOids = (await query('SELECT oid::int AS oid FROM pg_roles WHERE rolname = ANY($1::text[])', [[...names]])).map(row => row.oid);
          [{ n: settingCount }] = await query('SELECT count(*)::int AS n FROM pg_db_role_setting WHERE setrole = ANY($1::oid[])', [createdOids]);
        }
        return query('SELECT 1 / 0');
      }
      return query(sql, ...params);
    });
    return runner;
  });
  return { failures: () => failures, createdOids: () => createdOids, settingCount: () => settingCount, restore: () => factory.mock.restore() };
}

function remember(roles, names) {
  assert.ok(roles, 'CREATEROLE 계정은 helper가 지원하는 계정이다');
  names.add(roles.app.username); names.add(roles.migrator.username);
  return [roles.app.username, roles.migrator.username];
}

test('NOINHERIT 일반 CREATEROLE 계정도 앱 상한·잔여 연결·역할과 설정을 끝까지 정리한다', { timeout: 30000 }, async t => {
  await withCreator(t, async ({ db, username, names }) => {
    const roles = await createLockWaitRoles(db);
    const roleNames = remember(roles, names), oids = await roleOids(roleNames);
    assert.equal(oids.length, 2);
    const [{ oid: creatorOid }] = await admin.query('SELECT oid::int AS oid FROM pg_roles WHERE rolname = $1', [username]);
    // PG16은 grantor마다 멤버십 행이 생길 수 있다. 행 수가 아니라 실제 상속·SET ROLE 권한과 방향을 본다.
    const privileges = await admin.query(`SELECT r.oid::int AS roleid,
      pg_has_role($1::oid, r.oid, 'USAGE') AS inherited,
      pg_has_role($1::oid, r.oid, 'SET') AS can_set,
      pg_has_role(r.oid, $1::oid, 'MEMBER') AS inherits_creator
      FROM pg_roles r WHERE r.oid = ANY($2::oid[]) ORDER BY r.oid`, [creatorOid, oids]);
    assert.deepEqual(privileges, [...oids].sort((a, b) => a - b).map(roleid => ({
      roleid, inherited: true, can_set: false, inherits_creator: false,
    })), '생성자가 시험 역할만 상속하고, 역할 전환이나 앱·마이그레이션 역할로의 생성자 권한 전파는 허용하지 않는다');
    let app, migrator;
    try {
      app = await roles.open(roles.app);
      migrator = await roles.open(roles.migrator);
      assert.equal((await app.query('SHOW lock_timeout'))[0].lock_timeout, APP_LOCK_TIMEOUT);
      assert.equal((await migrator.query('SHOW lock_timeout'))[0].lock_timeout, '0');
      const lock = `cleanup-lock-${username}`;
      const held = await holdAdvisory(db, lock);
      try {
        const waited = await timed(() => app.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]));
        assert.equal(waited.ok, false);
        assert.equal(driverCode(waited.error), LOCK_NOT_AVAILABLE);
        assertCapWait(waited.ms, '일반 CREATEROLE 계정이 만든 앱 연결');
      } finally { await held.release(); }
      const [{ n }] = await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = ANY($1::text[])', [roleNames]);
      assert.ok(n >= 2, '앱·마이그레이션 풀을 닫기 전에 helper가 잔여 연결을 정리한다');
      await roles.drop();
      await assertConnectionsClosed(roleNames);
      await assertRemoved(roleNames, oids);
      await roles.drop();
    } finally {
      await Promise.all([app, migrator].filter(source => source?.isInitialized).map(source => source.destroy()));
    }
  });
});

test('역할 삭제의 DB 오류 뒤 같은 drop을 다시 호출하면 남은 역할과 설정을 지운다', async t => {
  await withCreator(t, async ({ db, names }) => {
    const roles = await createLockWaitRoles(db);
    const roleNames = remember(roles, names), oids = await roleOids(roleNames);
    const fault = failOneQuery(t, db, /^DROP ROLE\b/, names);
    try {
      await assert.rejects(roles.drop(), error => driverCode(error) === '22012');
      assert.equal(fault.failures(), 1);
      assert.equal((await roleOids(roleNames)).length, 2, '첫 삭제 실패가 실제 역할 삭제 전에 일어났다');
      await roles.drop();
      await assertRemoved(roleNames, oids);
    } finally { fault.restore(); }
  });
});

test('역할 생성 뒤 설정 저장이 실패하면 생성 트랜잭션이 역할·멤버십·설정을 롤백한다', async t => {
  await withCreator(t, async ({ db, username, names }) => {
    const [{ oid: creatorOid }] = await admin.query('SELECT oid::int AS oid FROM pg_roles WHERE rolname = $1', [username]);
    const before = await admin.query('SELECT roleid, member FROM pg_auth_members WHERE member = $1 ORDER BY roleid', [creatorOid]);
    const fault = failOneQuery(t, db, /^ALTER ROLE\b.*\bSET lock_timeout\b/, names, true);
    try {
      await assert.rejects(createLockWaitRoles(db), error => driverCode(error) === '22012');
      assert.equal(fault.failures(), 1);
      assert.equal(names.size, 2, '앱·마이그레이션 역할을 실제로 만든 뒤 실패시켰다');
      assert.equal(fault.createdOids().length, 2);
      assert.equal(fault.settingCount(), 1, '실제 앱 계정 설정까지 저장한 뒤 같은 트랜잭션을 실패시켰다');
      await assertRemoved([...names], fault.createdOids());
      assert.deepEqual(await admin.query('SELECT roleid, member FROM pg_auth_members WHERE member = $1 ORDER BY roleid', [creatorOid]), before);
      // 실패 뒤에도 같은 일반 계정에서 새 역할 생성·정리가 가능하다.
      const retried = await createLockWaitRoles(db);
      const roleNames = remember(retried, names), oids = await roleOids(roleNames);
      await retried.drop();
      await assertRemoved(roleNames, oids);
    } finally { fault.restore(); }
  });
});



