// 수신자 조회(#151)에 주는 소유 회원 상태·공개 프로필 공급 함수(A) 검사. 실제 테스트 DB를 쓰며 HTTP·링크 판정은 포함하지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { DatabaseModule } = require('../../dist/database/database.module');
const { OwnerProfileMissingError, OwnerProfileReader } = require('../../dist/member-profile/owner-profile-reader');
const { OwnerProfileReaderModule } = require('../../dist/member-profile/owner-profile-reader.module');
const { CredentialVault } = require('../../dist/github-connection/credential-vault');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

let db, reader;
before(async () => { db = await openTestDataSource(); reader = new OwnerProfileReader(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const PROFILE = { displayName: '공개 이름 😀', introduction: '한 줄 소개', desiredRole: 'Backend', skills: ['TypeScript', 'PostgreSQL'] };
const available = (githubAccountLogin = null, profile = PROFILE) => ({ ownerState: 'AVAILABLE', profile: { ...profile, githubAccountLogin } });

async function member({ state = 'ACTIVE', profile = PROFILE, github } = {}) {
  const memberId = randomUUID();
  await db.query('INSERT INTO member_account (member_id, identity_reference, account_state) VALUES ($1, $2, $3)',
    [memberId, 'catchu:dev-login:owner-' + memberId, state]);
  if (profile) {
    await db.query(`INSERT INTO member_profile (profile_id, member_id, display_name, introduction, desired_role, skills)
      VALUES ($1, $2, $3, $4, $5, $6)`, [randomUUID(), memberId, profile.displayName, profile.introduction, profile.desiredRole, profile.skills]);
  }
  if (github) {
    await db.query(`INSERT INTO github_connection (connection_id, member_id, external_account_reference, account_login, credential_reference, connection_state)
      VALUES ($1, $2, $3, $4, $5, $6)`, [randomUUID(), memberId, github.external ?? null, github.login ?? null, github.credential ?? null, github.state]);
  }
  return memberId;
}

async function rows(memberId) {
  const select = table => db.query(`SELECT * FROM ${table} WHERE member_id = $1`, [memberId]);
  return { account: await select('member_account'), profile: await select('member_profile'), github: await select('github_connection') };
}

/** 호출자(수신자 접근 판정)가 여는 트랜잭션 모양: REPEATABLE READ + 읽기 전용. 쓰기를 시도하면 PostgreSQL이 거부한다. */
function snapshot(work) {
  return db.transaction('REPEATABLE READ', async (manager) => {
    await manager.query('SET TRANSACTION READ ONLY');
    return work(manager);
  });
}

const lockTimeout = error => (error.driverError?.code ?? error.code) === '55P03';

test('소유자 상태: ACTIVE는 AVAILABLE, 다른 상태값은 INACTIVE, 회원 행이 없으면 NO_MEMBER(manager 유무 같음)', async () => {
  const active = await member();
  const inactive = [await member({ state: 'SUSPENDED' }), await member({ state: 'WITHDRAWN' }), await member({ state: 'active' })];
  for (const read of [id => reader.readOwnerState(id), id => snapshot(manager => reader.readOwnerState(id, manager))]) {
    assert.equal(await read(active), 'AVAILABLE');
    for (const id of inactive) assert.equal(await read(id), 'INACTIVE');
    assert.equal(await read(randomUUID()), 'NO_MEMBER');
  }
});

test('공개 프로필: 이용 가능이면 자가 입력 네 항목과 githubAccountLogin만, 비활성·회원 없음은 프로필 없이', async () => {
  const id = await member({ github: { state: 'CONNECTED', login: 'owner-login', external: '42', credential: 'github-v1:' + randomUUID() } });
  const blank = { displayName: '', introduction: '', desiredRole: '', skills: [] };
  const empty = await member({ profile: blank });
  const inactive = await member({ state: 'SUSPENDED', github: { state: 'CONNECTED', login: 'hidden-login', external: '43' } });
  for (const read of [id => reader.readPublicProfile(id), id => snapshot(manager => reader.readPublicProfile(id, manager))]) {
    // deepEqual은 키 목록까지 비교한다: 회원·프로필·연결 ID, 회원 상태 원문, 연결 상태, 자격정보 참조가 섞이면 실패한다.
    assert.deepEqual(await read(id), available('owner-login'));
    assert.deepEqual(await read(empty), available(null, blank));
    assert.deepEqual(await read(inactive), { ownerState: 'INACTIVE' });
    assert.deepEqual(await read(randomUUID()), { ownerState: 'NO_MEMBER' });
  }
});

test('githubAccountLogin: CONNECTED만 저장 계정명, REAUTH_REQUIRED(최근 계정명 남음)·DISCONNECTED·연결 기록 없음은 null', async () => {
  const cases = [
    [{ state: 'CONNECTED', login: 'connected-login', external: '42' }, 'connected-login'],
    [{ state: 'REAUTH_REQUIRED', login: 'stale-login', external: '43' }, null],
    [{ state: 'DISCONNECTED' }, null],
    [{ state: 'DISCONNECTED', login: 'leftover-login' }, null],
    [undefined, null],
  ];
  for (const [github, login] of cases) {
    const id = await member({ github });
    assert.deepEqual(await reader.readPublicProfile(id), available(login), JSON.stringify(github));
    assert.deepEqual(await snapshot(manager => reader.readPublicProfile(id, manager)), available(login), JSON.stringify(github));
  }
});

test('ACTIVE 회원의 필수 프로필 누락은 빈 프로필이 아니라 OwnerProfileMissingError, 비활성 회원은 프로필 없이 INACTIVE', async () => {
  const id = await member({ profile: null, github: { state: 'CONNECTED', login: 'owner-login', external: '42' } });
  await assert.rejects(reader.readPublicProfile(id), OwnerProfileMissingError);
  await assert.rejects(snapshot(manager => reader.readPublicProfile(id, manager)), OwnerProfileMissingError);
  // 상태 조회는 회원 행만 본다. 프로필 누락은 프로필 조회에서 드러난다.
  assert.equal(await reader.readOwnerState(id), 'AVAILABLE');
  const inactive = await member({ state: 'SUSPENDED', profile: null });
  assert.deepEqual(await reader.readPublicProfile(inactive), { ownerState: 'INACTIVE' });
});

test('DB 조회 실패는 정상 결과로 바꾸지 않고 원래 오류를 그대로 던진다(manager 유무 같음)', async () => {
  const id = await member();
  // 다른 연결이 세 테이블을 독점 잠금한 동안 잠금 대기 시간을 넘기면 PostgreSQL이 조회를 실패시킨다(55P03).
  // 조회 쪽 연결은 모두 잠금 대기 상한이 있는 별도 DataSource에서 나오므로, 구현이 어느 연결을 쓰든 시험이 멈추지 않는다.
  const timeoutDb = await openTestDataSource({ extra: { options: '-c TimeZone=UTC -c lock_timeout=200' } });
  const locker = db.createQueryRunner();
  await locker.connect();
  await locker.startTransaction();
  try {
    await locker.query('LOCK TABLE member_account, member_profile, github_connection IN ACCESS EXCLUSIVE MODE');
    const timed = new OwnerProfileReader(timeoutDb);
    await assert.rejects(timed.readOwnerState(id), lockTimeout);
    await assert.rejects(timed.readPublicProfile(id), lockTimeout);
    for (const read of [manager => timed.readOwnerState(id, manager), manager => timed.readPublicProfile(id, manager)]) {
      await assert.rejects(timeoutDb.transaction('REPEATABLE READ', read), lockTimeout);
    }
  } finally {
    await locker.rollbackTransaction();
    await locker.release();
    await timeoutDb.destroy();
  }
  assert.deepEqual(await reader.readPublicProfile(id), available());
});

test('같은 스냅샷: REPEATABLE READ에서는 앞선 조회 뒤 다른 연결이 커밋한 비활성화·프로필 변경·연결 해제·회원 삭제를 보지 않는다', async () => {
  const changed = await member({ github: { state: 'CONNECTED', login: 'before-login', external: '42' } });
  const removed = await member();
  await snapshot(async (manager) => {
    // 호출자의 앞선 조회(링크 판정 자리)가 이 트랜잭션의 스냅샷을 정한다.
    await manager.query('SELECT 1');
    await db.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [changed]);
    await db.query("UPDATE member_profile SET display_name = '바뀐 이름' WHERE member_id = $1", [changed]);
    await db.query("UPDATE github_connection SET connection_state = 'DISCONNECTED', account_login = NULL WHERE member_id = $1", [changed]);
    await db.query('DELETE FROM member_profile WHERE member_id = $1', [removed]);
    await db.query('DELETE FROM member_account WHERE member_id = $1', [removed]);
    assert.equal(await reader.readOwnerState(changed, manager), 'AVAILABLE');
    assert.deepEqual(await reader.readPublicProfile(changed, manager), available('before-login'));
    assert.equal(await reader.readOwnerState(removed, manager), 'AVAILABLE');
    assert.deepEqual(await reader.readPublicProfile(removed, manager), available());
  });
  // 트랜잭션 밖의 새 조회는 커밋된 현재 값을 읽는다.
  assert.equal(await reader.readOwnerState(changed), 'INACTIVE');
  assert.deepEqual(await reader.readPublicProfile(changed), { ownerState: 'INACTIVE' });
  assert.equal(await reader.readOwnerState(removed), 'NO_MEMBER');
});

test('manager는 활성 REPEATABLE READ·SERIALIZABLE 트랜잭션만 받는다: READ COMMITTED는 같은 트랜잭션에서도 문장마다 스냅샷이 바뀐다', async () => {
  const id = await member();
  await db.transaction('READ COMMITTED', async (manager) => {
    // 거부하는 이유: 같은 트랜잭션의 두 문장이 서로 다른 커밋 상태를 본다.
    const [{ account_state: first }] = await manager.query('SELECT account_state FROM member_account WHERE member_id = $1', [id]);
    await db.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [id]);
    const [{ account_state: second }] = await manager.query('SELECT account_state FROM member_account WHERE member_id = $1', [id]);
    assert.deepEqual([first, second], ['ACTIVE', 'SUSPENDED']);
    await assert.rejects(reader.readOwnerState(id, manager), /REPEATABLE READ or SERIALIZABLE/);
    await assert.rejects(reader.readPublicProfile(id, manager), /REPEATABLE READ or SERIALIZABLE/);
  });
  await assert.rejects(reader.readOwnerState(id, db.manager), /active transaction/);
  await assert.rejects(reader.readPublicProfile(id, db.manager), /active transaction/);
  assert.equal(await db.transaction('SERIALIZABLE', manager => reader.readOwnerState(id, manager)), 'INACTIVE');
});

test('넘겨받은 manager로만 SELECT 한 문장씩 실행하고 주입된 DataSource·새 트랜잭션·잠금·쓰기를 쓰지 않는다', async () => {
  const id = await member({ github: { state: 'CONNECTED', login: 'owner-login', external: '42' } });
  const trap = new Proxy({}, { get: (_, key) => { throw new Error(`injected DataSource used: ${String(key)}`); } });
  const isolated = new OwnerProfileReader(trap);
  await snapshot(async (manager) => {
    const statements = [];
    const query = manager.query.bind(manager);
    manager.query = (sql, parameters) => { statements.push(sql.trim()); return query(sql, parameters); };
    manager.transaction = () => { throw new Error('nested transaction'); };
    assert.equal(await isolated.readOwnerState(id, manager), 'AVAILABLE');
    assert.deepEqual(await isolated.readPublicProfile(id, manager), available('owner-login'));
    assert.deepEqual(statements.map(sql => sql.split(/\s+/)[0]), ['SHOW', 'SELECT', 'SHOW', 'SELECT']);
    for (const sql of statements.filter(sql => sql.startsWith('SELECT'))) {
      assert.doesNotMatch(sql, /\bFOR\s+(UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b|\b(INSERT|UPDATE|DELETE|LOCK)\b/i);
    }
    // 호출자의 트랜잭션을 끝내지 않는다.
    assert.equal(manager.queryRunner.isTransactionActive, true);
    await query('SELECT 1');
  });
});

test('부수효과 없음: 본인 조회의 refreshStatus가 REAUTH_REQUIRED로 바꾸는 연결도 공개 조회 뒤 저장 상태가 그대로다', async () => {
  // 보관소에 이 참조의 파일이 없다. 연결 상태를 확인하는 본인 조회라면 재연결 필요로 바꾸는 자료다(아래 대조).
  const id = await member({ github: { state: 'CONNECTED', login: 'owner-login', external: '42', credential: 'github-v1:' + randomUUID() } });
  const before = await rows(id);
  assert.equal(await reader.readOwnerState(id), 'AVAILABLE');
  assert.deepEqual(await reader.readPublicProfile(id), available('owner-login'));
  await snapshot(async (manager) => {
    assert.equal(await reader.readOwnerState(id, manager), 'AVAILABLE');
    assert.deepEqual(await reader.readPublicProfile(id, manager), available('owner-login'));
  });
  assert.deepEqual(await rows(id), before);

  const directory = await mkdtemp(join(tmpdir(), 'catchu-151-vault-test-'));
  try {
    const config = { enabled: true, clientId: 'fake-client', clientSecret: 'FAKE_SECRET', callbackUrl: 'http://localhost:3000/github/callback',
      vaultDirectory: directory, encryptionKey: randomBytes(32) };
    const client = { exchange: () => assert.fail('GitHub를 부르면 안 된다'), identity: () => assert.fail('GitHub를 부르면 안 된다') };
    await new GitHubConnectionService(db, new CredentialVault(config), client, config).refreshStatus(id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const [connection] = (await rows(id)).github;
  assert.deepEqual([connection.connection_state, connection.credential_reference, connection.account_login], ['REAUTH_REQUIRED', null, 'owner-login']);
  // 대조 뒤에도 공개 프로필은 저장 상태만 따른다.
  assert.deepEqual(await reader.readPublicProfile(id), available(null));
});

test('ownerId가 UUID가 아니면 조회 전에 TypeError이며 호출자의 트랜잭션을 깨지 않는다', async () => {
  const id = await member();
  await assert.rejects(reader.readOwnerState('not-a-uuid'), TypeError);
  await snapshot(async (manager) => {
    await assert.rejects(reader.readOwnerState('not-a-uuid', manager), TypeError);
    await assert.rejects(reader.readPublicProfile('', manager), TypeError);
    assert.equal(await reader.readOwnerState(id, manager), 'AVAILABLE');
  });
});

test('모듈: 컨트롤러·다른 모듈 없이 OwnerProfileReader만 내보내고, 앱의 DB 연결만으로 조립된다', async () => {
  assert.deepEqual(Reflect.getMetadata('design:paramtypes', OwnerProfileReader), [DataSource]);
  assert.equal(Reflect.getMetadata('imports', OwnerProfileReaderModule), undefined);
  assert.equal(Reflect.getMetadata('controllers', OwnerProfileReaderModule), undefined);
  assert.deepEqual(Reflect.getMetadata('providers', OwnerProfileReaderModule), [OwnerProfileReader]);
  assert.deepEqual(Reflect.getMetadata('exports', OwnerProfileReaderModule), [OwnerProfileReader]);
  class Host {}
  Module({ imports: [DatabaseModule, OwnerProfileReaderModule] })(Host);
  const app = await NestFactory.createApplicationContext(Host, { logger: false, abortOnError: false });
  try {
    const id = await member({ github: { state: 'CONNECTED', login: 'owner-login', external: '42' } });
    assert.deepEqual(await app.get(OwnerProfileReader).readPublicProfile(id), available('owner-login'));
  } finally {
    await app.close();
  }
});
