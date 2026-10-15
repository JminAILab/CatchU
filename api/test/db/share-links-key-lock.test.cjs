require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #220: 같은 키로 다시 보낸 링크 발급의 비밀번호 해시 비교는 키 잠금과 DB 트랜잭션을 놓은 뒤에 한다.
// 잠금 대기 상한은 아직 합의되지 않아 제품 설정을 바꾸지 않는다. 이 시험은 상한이 걸린 연결(시험 전용 -c lock_timeout)에서
// 잠금을 얻지 못한 요청의 500·전체 롤백·같은 키 재시도가 지금 코드로 성립하는지만 확인한다.
// 비밀번호·토큰은 합성 값만 쓴다.

const PASSWORD = 'synthetic-only-link-password';
const LOCK_TIMEOUT_MS = 500;
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example/app',
};
const saved = {};
let app;
let url;
let db;
let restoreConfig;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  // 시험 전용: 앱이 쓰는 연결에만 lock_timeout을 건다. 제품 설정은 바꾸지 않는다.
  const config = require('../../dist/database/database.config');
  const original = config.buildDataSourceOptions;
  config.buildDataSourceOptions = (databaseConfig) => {
    const options = original(databaseConfig);
    return { ...options, extra: { ...options.extra, options: `${options.extra.options} -c lock_timeout=${LOCK_TIMEOUT_MS}ms` } };
  };
  restoreConfig = () => { config.buildDataSourceOptions = original; };
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../dist/app.module');
  const { configureApp } = require('../../dist/app.setup');
  const quiet = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) => [level, () => {}]));
  app = await configureApp(await NestFactory.create(AppModule, { logger: quiet, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = await openTestDataSource();
});
after(async () => {
  await app?.close();
  await db?.destroy();
  restoreConfig?.();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(() => resetTestDatabase(db));

async function login() {
  const response = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'key-lock-member' }),
  });
  assert.equal(response.status, 200);
  const token = (await response.json()).accessToken;
  const memberId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
  return { token, memberId };
}
async function create(token, key, body) {
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
const count = async (table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`))[0].n);

/**
 * 비밀번호 비교를 감싸 호출 수·동시 실행 수·그 순간 서버에 남은 잠금과 열린 트랜잭션을 잰다.
 * `during`은 비교가 진행되는 동안(키 잠금·연결을 놓은 뒤) 실행할 동작이다.
 */
function instrumentVerify(t, delayMs = 0, during = null) {
  const passwordModule = require('../../dist/share-links/link-password');
  const original = passwordModule.verifyLinkPassword;
  const probe = { calls: 0, active: 0, peak: 0, locksHeld: [], openTransactions: [] };
  passwordModule.verifyLinkPassword = async (...args) => {
    probe.calls += 1;
    probe.active += 1;
    probe.peak = Math.max(probe.peak, probe.active);
    try {
      const [{ locks }] = await db.query("SELECT count(*)::int AS locks FROM pg_locks WHERE locktype = 'advisory' AND granted");
      const [{ open }] = await db.query(
        `SELECT count(*)::int AS open FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`);
      probe.locksHeld.push(locks);
      probe.openTransactions.push(open);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (during) await during();
      return await original(...args);
    } finally {
      probe.active -= 1;
    }
  };
  t.after(() => { passwordModule.verifyLinkPassword = original; });
  return probe;
}

/** 다른 연결이 트랜잭션 advisory lock을 쥐고 있게 한다. release()로 롤백해 놓는다. */
async function holdLock(text) {
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [text]);
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await runner.rollbackTransaction();
      await runner.release();
    },
  };
}
const keyLockText = (memberId, key) => JSON.stringify(['catchu:idempotency', memberId, 'createShareLink', key]);
const issuanceLockText = (memberId) => `catchu:share-link-issue:${memberId}`;

test('같은 키 재요청의 비밀번호 비교는 잠금과 열린 트랜잭션을 놓은 뒤에 하고 판정은 그대로다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'replay-key', { title: '재요청 링크', password: PASSWORD });
  assert.equal(first.status, 201);
  const probe = instrumentVerify(t);

  const same = await create(token, 'replay-key', { title: '재요청 링크', password: PASSWORD });
  assert.equal(same.status, 200);
  assert.equal(same.body.linkId, first.body.linkId);
  assert.equal(probe.calls, 1);

  const wrong = await create(token, 'replay-key', { title: '재요청 링크', password: `${PASSWORD}-x` });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(wrong.cacheControl, 'no-store');
  assert.equal(probe.calls, 2);

  assert.deepEqual(probe.locksHeld, [0, 0], '비교하는 동안 advisory lock을 쥐지 않는다');
  assert.deepEqual(probe.openTransactions, [0, 0], '비교하는 동안 열린 트랜잭션이 없다');

  const otherTitle = await create(token, 'replay-key', { title: '다른 제목', password: PASSWORD });
  assert.equal(otherTitle.status, 409);
  assert.equal(probe.calls, 2, '본문 지문이 다르면 해시를 계산하지 않는다');
  const noPassword = await create(token, 'replay-key', { title: '재요청 링크' });
  assert.equal(noPassword.status, 409);
  assert.equal(probe.calls, 2, '비밀번호 설정 여부가 다르면 해시를 계산하지 않는다');

  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('비밀번호 없는 링크의 같은 키 재요청은 해시 없이 200이고 비밀번호를 더한 요청은 409다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'plain-key', { title: '공개 링크' });
  assert.equal(first.status, 201);
  const probe = instrumentVerify(t);
  const same = await create(token, 'plain-key', { title: '공개 링크' });
  assert.equal(same.status, 200);
  assert.equal(same.body.linkId, first.body.linkId);
  const withPassword = await create(token, 'plain-key', { title: '공개 링크', password: PASSWORD });
  assert.equal(withPassword.status, 409);
  assert.equal(probe.calls, 0);
});

test('같은 키의 동시 재요청은 비밀번호 비교를 서로 기다리지 않고, 틀린 비밀번호만 409이며 링크는 하나다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'burst-key', { title: '몰린 링크', password: PASSWORD });
  assert.equal(first.status, 201);
  const probe = instrumentVerify(t, 250);

  const burst = await Promise.all([
    ...Array.from({ length: 4 }, () => create(token, 'burst-key', { title: '몰린 링크', password: PASSWORD })),
    create(token, 'burst-key', { title: '몰린 링크', password: 'synthetic-wrong-password' }),
  ]);
  assert.deepEqual(burst.map((r) => r.status), [200, 200, 200, 200, 409]);
  for (const r of burst.slice(0, 4)) assert.equal(r.body.linkId, first.body.linkId);
  assert.equal(burst[4].body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(probe.calls, 5);
  assert.ok(probe.peak >= 2, `비교가 키 잠금 안에서 차례로 실행됐다(동시 최대 ${probe.peak})`);
  // 다른 요청의 트랜잭션이 잠금을 쥐는 것은 정상이므로 여기서는 잠금 수가 아니라 비교가 동시에 진행됐는지(peak)로 확인한다.
  // 이 요청 자신이 잠금을 놓았는지는 위 단건 시험(잠금 0·열린 트랜잭션 0)이 보증한다.
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('같은 키·같은 본문의 최초 동시 요청은 링크 하나와 멱등 기록 하나만 만든다', async () => {
  const { token } = await login();
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    create(token, 'first-burst', { title: '동시 최초', password: PASSWORD })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 201]);
  assert.equal(new Set(results.map((r) => r.body.linkId)).size, 1);
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('회원 발급 잠금을 상한 안에 얻지 못하면 500 INTERNAL_ERROR로 끝나고 전체 롤백되며 같은 키로 다시 보낼 수 있다', async () => {
  const { token, memberId } = await login();
  const held = await holdLock(issuanceLockText(memberId));
  let failed;
  const started = Date.now();
  try {
    failed = await create(token, 'issuance-key', { title: '대기 링크', password: PASSWORD });
  } finally {
    await held.release();
  }
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.equal(failed.body.code, 'INTERNAL_ERROR');
  assert.equal(failed.cacheControl, 'no-store');
  assert.ok(Date.now() - started >= LOCK_TIMEOUT_MS - 100, '상한만큼은 기다린다');
  assert.equal(await count('share_link'), 0);
  assert.equal(await count('idempotency_record'), 0);

  const retried = await create(token, 'issuance-key', { title: '대기 링크', password: PASSWORD });
  assert.equal(retried.status, 201, JSON.stringify(retried.body));
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('키 잠금을 상한 안에 얻지 못하면 최초·재요청 모두 500 INTERNAL_ERROR이고 기존 기록은 그대로다', async () => {
  const { token, memberId } = await login();
  const held = await holdLock(keyLockText(memberId, 'key-lock'));
  let failed;
  try {
    failed = await create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
  } finally {
    await held.release();
  }
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.equal(failed.body.code, 'INTERNAL_ERROR');
  assert.equal(await count('share_link'), 0);
  assert.equal(await count('idempotency_record'), 0);

  const created = await create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
  assert.equal(created.status, 201);

  const again = await holdLock(keyLockText(memberId, 'key-lock'));
  let replayFailed;
  try {
    replayFailed = await create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
  } finally {
    await again.release();
  }
  assert.equal(replayFailed.status, 500);
  assert.equal(replayFailed.body.code, 'INTERNAL_ERROR');
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);

  const replayed = await create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.linkId, created.body.linkId);
  const wrong = await create(token, 'key-lock', { title: '키 대기', password: 'synthetic-wrong-password' });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, 'IDEMPOTENCY_CONFLICT');
});

// 비밀번호 비교가 끝난 뒤의 응답은 비교 전에 만든 응답이 아니라 그 시점의 링크 상태여야 한다(PR #302 Codex P2).

async function stopLink(token, linkId) {
  const response = await fetch(`${url}/v1/share-links/${linkId}/stop`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}

test('비교하는 동안 링크가 중단되면 같은 키 재요청은 STOPPED를 돌려준다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'stop-key', { title: '중단될 링크', password: PASSWORD });
  assert.equal(first.status, 201);
  assert.equal(first.body.state, 'ACTIVE');
  let stopped;
  const probe = instrumentVerify(t, 0, async () => {
    // 비교 중에는 키 잠금·연결을 놓고 있으므로 실제 중단 API가 끝까지 완료된다.
    stopped = await stopLink(token, first.body.linkId);
  });
  const replay = await create(token, 'stop-key', { title: '중단될 링크', password: PASSWORD });
  assert.equal(probe.calls, 1);
  assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
  assert.equal(stopped.body.state, 'STOPPED');
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.linkId, first.body.linkId);
  assert.equal(replay.body.state, 'STOPPED');
  assert.equal(replay.body.stoppedAt, stopped.body.stoppedAt);
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('비교하는 동안 만료 시각을 지나면 같은 키 재요청은 EXPIRED를 돌려준다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'expire-key', { title: '만료될 링크', password: PASSWORD });
  assert.equal(first.status, 201);
  const { ShareLinksService } = require('../../dist/share-links/share-links.service');
  const service = app.get(ShareLinksService);
  const realClock = service.clock;
  t.after(() => { service.clock = realClock; });
  const expiresAt = new Date(first.body.expiresAt).getTime();
  instrumentVerify(t, 0, async () => {
    // 비교가 시작된 뒤 주입한 시계가 만료 시각을 넘긴다. 비교 전에 만든 응답은 ACTIVE였다.
    service.clock = () => new Date(expiresAt + 1000);
  });
  const replay = await create(token, 'expire-key', { title: '만료될 링크', password: PASSWORD });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.linkId, first.body.linkId);
  assert.equal(replay.body.state, 'EXPIRED');
  assert.equal(replay.body.stoppedAt, null);
});

test('비교 뒤 링크를 다시 읽지 못하면 낡은 성공 응답 대신 500 INTERNAL_ERROR다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'gone-key', { title: '사라질 링크', password: PASSWORD });
  assert.equal(first.status, 201);
  instrumentVerify(t, 0, async () => {
    await db.query('DELETE FROM idempotency_record');
    await db.query('DELETE FROM share_link');
  });
  const replay = await create(token, 'gone-key', { title: '사라질 링크', password: PASSWORD });
  assert.equal(replay.status, 500, JSON.stringify(replay.body));
  assert.equal(replay.body.code, 'INTERNAL_ERROR');
  assert.equal(replay.cacheControl, 'no-store');
});

test('비밀번호가 다르면 링크를 다시 읽지 않고 기존 409를 유지한다', async (t) => {
  const { token } = await login();
  const first = await create(token, 'wrong-key', { title: '다른 비밀번호', password: PASSWORD });
  assert.equal(first.status, 201);
  // 다시 읽었다면 링크가 없어 500이 된다. 409이면 추가 조회를 하지 않은 것이다.
  instrumentVerify(t, 0, async () => {
    await db.query('DELETE FROM idempotency_record');
    await db.query('DELETE FROM share_link');
  });
  const replay = await create(token, 'wrong-key', { title: '다른 비밀번호', password: `${PASSWORD}-x` });
  assert.equal(replay.status, 409, JSON.stringify(replay.body));
  assert.equal(replay.body.code, 'IDEMPOTENCY_CONFLICT');
});
