const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { readWorkerContextAuthConfig, requireWorkerContextKey } = require('../dist/auth/worker-context-auth');
const { WorkerContextModule } = require('../dist/worker-context/worker-context.module');

const key = () => randomBytes(32).toString('hex');
const rejectsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test('내부 조회는 명시적 활성화와 별도 난수 키만 허용하며 기본 키가 없다', () => {
  for (const NODE_ENV of [undefined, '', 'development', 'test', 'production', 'staging']) {
    assert.deepEqual(readWorkerContextAuthConfig({ NODE_ENV }), { enabled: false });
    for (const WORKER_CONTEXT_API_KEY of [undefined, '', 'short', 'x'.repeat(64), ' '.repeat(64)]) {
      assert.throws(() => readWorkerContextAuthConfig({ NODE_ENV, WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY }),
        /WORKER_CONTEXT_API_KEY/);
    }
    const secret = key();
    const config = readWorkerContextAuthConfig({ NODE_ENV, WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: secret });
    assert.equal(config.enabled, true);
    requireWorkerContextKey(config, { 'x-worker-key': secret });
  }
  for (const enabled of ['TRUE', '1', 'yes', ' true ']) {
    assert.throws(() => readWorkerContextAuthConfig({ WORKER_CONTEXT_ENABLED: enabled }), /WORKER_CONTEXT_ENABLED/);
  }
  for (const setting of ['AUTH_JWT_SECRET', 'LINK_GRANT_SECRET', 'GITHUB_CREDENTIAL_ENCRYPTION_KEY']) {
    const secret = key();
    assert.throws(() => readWorkerContextAuthConfig({ WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: secret,
      [setting]: secret.toUpperCase() }), /independent/);
  }
});

test('서비스 인증은 누락·오류·중복 키·회원 Bearer 혼용을 거부한다', () => {
  const secret = key();
  const config = readWorkerContextAuthConfig({ WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: secret });
  rejectsCode(() => requireWorkerContextKey({ enabled: false }, { 'x-worker-key': secret }), 'RESOURCE_UNAVAILABLE');
  rejectsCode(() => requireWorkerContextKey(config, {}), 'AUTH_REQUIRED');
  for (const supplied of ['', 'Bearer ' + secret, key(), [secret, secret], secret + ', ' + secret]) {
    rejectsCode(() => requireWorkerContextKey(config, { 'x-worker-key': supplied }), 'AUTH_INVALID');
  }
  rejectsCode(() => requireWorkerContextKey(config, { authorization: 'Bearer member-jwt', 'x-worker-key': secret }), 'AUTH_INVALID');
});

test('선정 공급자가 없는 모듈은 조립을 거부한다', () => {
  for (const options of [undefined, {}, { selectionSource: {} }]) {
    assert.throws(() => WorkerContextModule.register(options), /requires a repository selection source/);
  }
});

for (const [name, badKey] of [['누락', undefined], ['잘못된 값', 'DO_NOT_LOG_INVALID_SERVICE_KEY']]) {
  test(`실제 staging main은 서비스 키 ${name} 시 안전한 설정 오류로 기동 실패`, { timeout: 20000 }, async t => {
    const { spawn } = require('node:child_process');
    const { resolve } = require('node:path');
    const env = { ...process.env, AUTH_JWT_SECRET: key(), AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
      NODE_ENV: 'staging', SHARE_LINK_WEB_BASE_URL: 'https://synthetic.example', LINK_GRANT_SECRET: key(),
      GOOGLE_LOGIN_ENABLED: 'false', GITHUB_CONNECTION_ENABLED: 'false', WORKER_CONTEXT_ENABLED: 'true',
      BIND_HOST: '127.0.0.1', PORT: '3001', CORS_ALLOWED_ORIGINS: '', TRUST_PROXY_CIDRS: '' };
    if (badKey === undefined) delete env.WORKER_CONTEXT_API_KEY; else env.WORKER_CONTEXT_API_KEY = badKey;
    const child = spawn(process.execPath, ['dist/main.js'], { cwd: resolve(__dirname, '..'), env,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
    let output = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 1); assert(output.includes('WORKER_CONTEXT_API_KEY'));
    assert(!output.includes(env.AUTH_JWT_SECRET)); assert(!output.includes(env.LINK_GRANT_SECRET));
    if (badKey) assert(!output.includes(badKey));
  });
}
