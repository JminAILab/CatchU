const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, unlink, rmdir } = require('node:fs/promises');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');

const apiDir = resolve(__dirname, '../..');
async function unusedPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function ipv6LoopbackAvailable() {
  const socket = createServer();
  try {
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.listen(0, '::1', resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (socket.listening) await new Promise((resolve) => socket.close(resolve));
  }
}

const urlOf = (address, port) => `http://${address.includes(':') ? `[${address}]` : address}:${port}`;

async function launch(t, { source = false, file = {}, environment = {}, address = '127.0.0.1' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'catchu-auth-test-'));
  const envPath = join(directory, '.env');
  const secret = randomBytes(32).toString('hex');
  const port = await unusedPort();
  let child;
  let closed;
  let output = '';
  t.after(async () => {
    try {
      if (child && child.exitCode === null && child.signalCode === null) child.kill();
      if (closed) await closed;
      if (child) {
        await assert.rejects(fetch(`${urlOf(address, port)}/health`, {
          signal: AbortSignal.timeout(1000),
        }), '검증용 프로세스 종료 후 포트가 닫혀야 한다');
      }
    } finally {
      // 이 테스트가 만든 파일과 빈 임시 폴더만 제거한다. 재귀 삭제하지 않는다.
      await unlink(envPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      await rmdir(directory);
    }
  });
  const settings = {
    AUTH_JWT_SECRET: secret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    // 다른 설정의 실패를 검사할 때도 세션의 운영용 Origin 조건은 충족한다.
    AUTH_WEB_ORIGIN: 'https://catchu.example',
    CORS_ALLOWED_ORIGINS: undefined,
    DEV_LOGIN_ENABLED: 'true',
    WORKER_CONTEXT_ENABLED: undefined,
    WORKER_CONTEXT_API_KEY: undefined,
    CATCHU_QUEUE_REDIS_URL: undefined, // 터미널의 큐 주소로 큐 연결이 켜지지 않게 한다
    CATCHU_QUEUE_PREFIX: undefined,
    NODE_ENV: 'development',
    PORT: String(port),
    BIND_HOST: undefined, // 터미널의 값이 섞이지 않게 기본은 두지 않는다
    LINK_GRANT_SECRET: undefined, // 같은 이유로 두지 않는다. development에서는 임시 키로 기동한다
    ...file,
  };
  await writeFile(envPath, Object.entries(settings)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  const env = { ...process.env };
  for (const key of Object.keys(settings)) delete env[key];
  Object.assign(env, environment);
  child = spawn(process.execPath, [
    `--env-file-if-exists=${envPath}`,
    ...(source ? ['-r', 'ts-node/register', 'src/main.ts'] : ['dist/main.js']),
  ], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => { output += data.toString(); });
  child.stderr.on('data', (data) => { output += data.toString(); });
  closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  const request = (path, options = {}) => fetch(`${urlOf(address, port)}${path}`, {
    ...options, signal: AbortSignal.timeout(1000),
  });
  return {
    request, closed, logs: () => output, secret, port,
    async ready() {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (child.exitCode !== null || child.signalCode !== null) {
          assert.fail('main 진입점이 정상 기동 전에 종료됨');
        }
        try {
          const response = await request('/health');
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { status: 'ok' });
          return;
        } catch { await delay(50); }
      }
      assert.fail('main 진입점 기동 시간 초과');
    },
  };
}

for (const source of [false, true]) {
  test(`${source ? '개발 소스' : '빌드'} main: env 파일의 인증 설정으로 기동·발급·종료`, { timeout: 15000 }, async (t) => {
    const server = await launch(t, { source });
    await server.ready();
    const response = await server.request('/v1/auth/dev-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'bootstrap-member' }),
    });
    assert.equal(response.status, 200);
    const token = await response.json();
    assert.equal(token.expiresIn, 900);
    assert.equal(typeof token.accessToken, 'string');
    assert.equal(server.logs().includes(token.accessToken), false);
    assert.equal(server.logs().includes(server.secret), false);
  });
}

test('main: 터미널 production 설정이 env 파일보다 우선하여 개발 로그인을 거부한다', { timeout: 15000 }, async (t) => {
  // production은 공유 URL 주소(#147)와 grant 서명 키(#150)가 필수라 합성 값을 함께 준다.
  const server = await launch(t, { environment: { NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: '1111111111111111111111111111111111111111111111111111111111111111' } });
  await server.ready();
  const response = await server.request('/v1/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'bootstrap-member' }),
  });
  assert.equal(response.status, 403);
});

for (const [label, file, expected] of [
  ['서명 키 누락', { AUTH_JWT_SECRET: undefined }, 'AUTH_JWT_SECRET'],
  ['서명 키 공란', { AUTH_JWT_SECRET: '' }, 'AUTH_JWT_SECRET'],
  ['수명 누락', { AUTH_ACCESS_TOKEN_TTL_SECONDS: undefined }, 'AUTH_ACCESS_TOKEN_TTL_SECONDS'],
  ['잘못된 수명', { AUTH_ACCESS_TOKEN_TTL_SECONDS: '-1' }, 'AUTH_ACCESS_TOKEN_TTL_SECONDS'],
  ['DB 비밀번호 누락', { DB_PASSWORD: undefined }, 'DB_PASSWORD'],
  ['바인딩 주소 형식 오류', { BIND_HOST: 'localhost' }, 'BIND_HOST'],
  // http 주소와 공유 URL 기본값(http)은 development·test에서만 받는다(#218).
  // grant 서명 키(#150)는 합성 값을 줘서 공유 URL 주소만 실패 원인이 되게 한다.
  ['production에서 공유 URL 주소가 http', { NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'http://catchu.example',
    LINK_GRANT_SECRET: '1111111111111111111111111111111111111111111111111111111111111111' }, 'SHARE_LINK_WEB_BASE_URL'],
  ['NODE_ENV 미지정에 공유 URL 주소 없음', { NODE_ENV: undefined, SHARE_LINK_WEB_BASE_URL: undefined,
    LINK_GRANT_SECRET: '1111111111111111111111111111111111111111111111111111111111111111' }, 'SHARE_LINK_WEB_BASE_URL'],
  // grant 서명 키 임시 생성도 development·test에서만 한다(#242). 공유 URL 주소는 https로 줘서 키만 실패 원인이 되게 한다.
  ['NODE_ENV 미지정에 grant 서명 키 없음', { NODE_ENV: undefined, SHARE_LINK_WEB_BASE_URL: 'https://catchu.example' }, 'LINK_GRANT_SECRET'],
]) {
  test(`main: ${label}이면 기동하지 않고 실패 종료한다`, { timeout: 15000 }, async (t) => {
    const server = await launch(t, { file });
    assert.equal(await server.closed, 1);
    assert.ok(server.logs().includes(expected), '잘못된 설정 이름을 안내한다');
    assert.equal(server.logs().includes(server.secret), false);
  });
}

async function holdPort(t) {
  const holder = createServer();
  await new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => holder.close(resolve)));
  return holder.address().port;
}

// 앱을 만든 뒤(DB 연결 풀이 열린 뒤) 설정·포트 오류로 멈출 때도 앱을 닫고 바로 끝나야 한다.
// 닫지 않으면 DB 유휴 연결이 시한(10초)까지 프로세스를 붙잡는다(#230 리뷰).
for (const [label, settings, expected] of [
  ['production에서 CORS 허용 출처가 http', async () => ({ NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
    LINK_GRANT_SECRET: '1111111111111111111111111111111111111111111111111111111111111111',
    CORS_ALLOWED_ORIGINS: 'http://web.catchu.example' }), 'CORS_ALLOWED_ORIGINS'],
  ['포트가 이미 사용 중', async (t) => ({ PORT: String(await holdPort(t)) }), 'EADDRINUSE'],
]) {
  test(`main: 앱 생성 뒤 ${label}이면 DB 연결을 닫고 바로 실패 종료한다`, { timeout: 15000 }, async (t) => {
    const file = await settings(t);
    const started = performance.now();
    const server = await launch(t, { file });
    assert.equal(await server.closed, 1);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 5000, `종료까지 ${Math.round(elapsed)}ms 걸림: DB 유휴 연결 시한을 기다리지 않아야 한다`);
    assert.ok(server.logs().includes(expected), '실패 원인을 안내한다');
    if (file.CORS_ALLOWED_ORIGINS) {
      assert.equal(server.logs().includes(file.CORS_ALLOWED_ORIGINS), false, '허용 출처 값은 로그에 넣지 않는다');
    }
    assert.equal(server.logs().includes(server.secret), false);
  });
}

test('main: DB에 접속할 수 없으면 기동하지 않고 DB 안내와 함께 실패 종료한다', { timeout: 15000 }, async (t) => {
  const server = await launch(t, { file: { DB_PORT: String(await unusedPort()) } });
  assert.equal(await server.closed, 1);
  assert.ok(server.logs().includes('DB에 접속하지 못했습니다'), 'DB 접속 실패를 안내한다');
  assert.equal(server.logs().includes(process.env.DB_PASSWORD), false, '로그에 DB 비밀번호가 없다');
  assert.equal(server.logs().includes(server.secret), false);
});

for (const [label, file, open, other] of [
  ['BIND_HOST 미설정', {}, '127.0.0.1', '::1'],
  ['BIND_HOST=::1', { BIND_HOST: '::1' }, '::1', '127.0.0.1'],
]) {
  test(`main: ${label}이면 ${open}에서만 응답한다`, { timeout: 15000 }, async (t) => {
    if (!(await ipv6LoopbackAvailable())) return t.skip('IPv6 루프백(::1)을 쓸 수 없는 환경');
    const server = await launch(t, { file, address: open });
    await server.ready();
    await assert.rejects(fetch(`${urlOf(other, server.port)}/health`, {
      signal: AbortSignal.timeout(1000),
    }), `${other}에는 열리지 않아야 한다`);
  });
}

for (const enabled of ['false', 'true']) {
  test(`main: worker 내부 조회는 명시적 활성화(${enabled})와 서비스 키에 따라 등록한다`, { timeout: 15000 }, async t => {
    const serviceKey = randomBytes(32).toString('hex');
    const server = await launch(t, { file: { WORKER_CONTEXT_ENABLED: enabled, WORKER_CONTEXT_API_KEY: serviceKey } });
    await server.ready();
    const path = '/v1/internal/analysis-attempts/00000000-0000-4000-8000-000000000001/context';
    const response = await server.request(path, { headers: { 'x-worker-key': serviceKey } });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, 'RESOURCE_UNAVAILABLE');
    if (enabled === 'true') {
      assert.deepEqual(body.details, { violations: [{ field: 'attemptId', reason: 'ATTEMPT_NOT_ACTIVE' }] });
      assert.equal((await server.request(path)).status, 401);
    } else {
      assert.equal(body.details, undefined, '비활성일 때 내부 컨트롤러를 등록하지 않는다');
      assert.equal((await server.request(path)).status, 404);
    }
    assert.equal(server.logs().includes(serviceKey), false);
  });
}

// 큐 연결(#233). 운영 모드 api는 비밀번호가 든 rediss://만 받는다. 앱을 만들기 전에 멈추고 주소를 로그에 싣지 않는다.
test('main: production에서 큐 주소가 평문 redis://이면 기동하지 않고 주소 없이 실패 종료한다', { timeout: 15000 }, async (t) => {
  const queueUrl = 'redis://:synthetic-queue-password@127.0.0.1:6379';
  const server = await launch(t, { file: { NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
    LINK_GRANT_SECRET: '1111111111111111111111111111111111111111111111111111111111111111', CATCHU_QUEUE_REDIS_URL: queueUrl } });
  assert.equal(await server.closed, 1);
  assert.ok(server.logs().includes('CATCHU_QUEUE_REDIS_URL'), '잘못된 설정 이름을 안내한다');
  assert.equal(server.logs().includes('synthetic-queue-password'), false, '큐 주소·비밀번호는 로그에 넣지 않는다');
  assert.equal(server.logs().includes(server.secret), false);
});

// 실제 큐 시험(CATCHU_TEST_REDIS_URL이 있을 때만). main이 listen 뒤 큐를 시작해 DB의 대기 시도를 요청 큐로 보내는지 본다.
test('main: 큐 주소가 있으면 listen 뒤 큐를 시작해 대기 시도를 요청 큐로 보낸다', {
  timeout: 20000, skip: process.env.CATCHU_TEST_REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 큐 시험을 건너뜀',
}, async (t) => {
  const { Queue } = require('bullmq');
  const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
  const { insertAttempt, waitFor } = require('../helpers/queue-harness.cjs');
  const prefix = `catchu-test-${randomBytes(4).toString('hex')}`;
  // 정리 함수는 등록 순서대로 돈다. launch의 정리(프로세스 종료)가 먼저 돌도록 그 뒤에 큐·DB 정리를 등록한다.
  const server = await launch(t, { file: { CATCHU_QUEUE_REDIS_URL: process.env.CATCHU_TEST_REDIS_URL, CATCHU_QUEUE_PREFIX: prefix } });
  const db = await openTestDataSource();
  const requests = new Queue('analysis-requests', { connection: { url: process.env.CATCHU_TEST_REDIS_URL }, prefix });
  t.after(async () => {
    try {
      await requests.obliterate({ force: true });
      await requests.close();
      await resetTestDatabase(db);
    } finally { await db.destroy(); }
  });
  await server.ready();
  await resetTestDatabase(db);
  const row = await insertAttempt(db);
  const job = await waitFor(() => requests.getJob(row.attemptId), 'main이 대기 시도를 요청 큐에 넣음');
  assert.equal(job.data.attemptId, row.attemptId);
  // 기록은 큐에 넣은 뒤 남고 자식 프로세스의 출력으로 늦게 도착할 수 있어, 작업이 보인 직후가 아니라 도착을 기다린다.
  await waitFor(() => server.logs().includes('ANALYSIS_REQUEST_ENQUEUED'), 'main이 보낸 기록을 남김');
});