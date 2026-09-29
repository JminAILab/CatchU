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

async function launch(t, { source = false, file = {}, environment = {} } = {}) {
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
        await assert.rejects(fetch(`http://127.0.0.1:${port}/health`, {
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
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
    DEV_LOGIN_ENABLED: 'true',
    NODE_ENV: 'development',
    PORT: String(port),
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
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...options, signal: AbortSignal.timeout(1000),
  });
  return {
    request, closed, logs: () => output, secret,
    async ready() {
      // 소스 실행은 ts-node가 DB 엔티티와 기능 모듈까지 컴파일한다. 제품 기동 SLA 검사가 아니다.
      const deadline = Date.now() + (source ? 10000 : 5000);
      while (Date.now() < deadline) {
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
    assert.equal(token.expiresIn, 60);
    assert.equal(typeof token.accessToken, 'string');
    assert.equal(server.logs().includes(token.accessToken), false);
    assert.equal(server.logs().includes(server.secret), false);
  });
}

test('main: 터미널 production 설정이 env 파일보다 우선하여 개발 로그인을 거부한다', { timeout: 15000 }, async (t) => {
  const server = await launch(t, { environment: { NODE_ENV: 'production' } });
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
]) {
  test(`main: ${label}이면 기동하지 않고 실패 종료한다`, { timeout: 15000 }, async (t) => {
    const server = await launch(t, { file });
    assert.equal(await server.closed, 1);
    assert.ok(server.logs().includes(expected), '잘못된 설정 이름을 안내한다');
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
