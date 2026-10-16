require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { before, after, beforeEach, test, mock } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt, SignJWT } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken, GitHubProviderError } = require('../../dist/github-connection/github.client');
const { CredentialVault, CredentialUnavailableError } = require('../../dist/github-connection/credential-vault');
const { GITHUB_CONFIG } = require('../../dist/github-connection/github.config');
const { GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
const { ApiError } = require('../../dist/common/errors');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
let app, db, url, directory, service, client, vault, settings;
const saved = {}, logs = [];
const FAKE_TOKEN = 'FAKE_GITHUB_TOKEN_FOR_TESTS', FAKE_CODE = 'FAKE_OAUTH_CODE';
const issued = (overrides = {}) => ({ accountLogin: 'real-test-user', externalAccountReference: '12345',
  token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000), ...overrides });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-231-vault-test-'));
  settings = { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client', GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback',
    GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') };
  for (const [k, v] of Object.entries(settings)) { saved[k] = process.env[k]; process.env[k] = v; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  db = await openTestDataSource();
  service = app.get(GitHubConnectionService); client = app.get(GitHubClient); vault = app.get(CredentialVault);
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  // mkdtemp가 만든 검사 전용 디렉터리만 정리한다.
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db); logs.length = 0;
  service.authorizations.clear();
  client.exchange = async () => issued();
  client.identity = async () => ({ accountLogin: 'real-test-user', externalAccountReference: '12345' });
});
async function call(token, method, path, body) {
  const response = await fetch(url + '/v1' + path, { method, headers: {
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = { status: response.status, body: await response.json() };
  for (const secret of [FAKE_TOKEN, FAKE_CODE, settings.GITHUB_OAUTH_CLIENT_SECRET, settings.GITHUB_CREDENTIAL_ENCRYPTION_KEY]) {
    assert(!JSON.stringify(result).includes(secret)); assert(!logs.join(' ').includes(secret));
  }
  return result;
}
async function login(name = 'github-a') {
  const r = await call(null, 'POST', '/auth/dev-login', { memberId: name });
  assert.equal(r.status, 200); return { token: r.body.accessToken, memberId: decodeJwt(r.body.accessToken).sub };
}
const row = memberId => db.manager.findOneByOrFail(GitHubConnection, { memberId });
const authorize = token => call(token, 'POST', '/me/github/authorization');
async function connect(user) {
  const a = await authorize(user.token); assert.equal(a.status, 200);
  const c = await call(user.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: a.body.state });
  assert.equal(c.status, 200, JSON.stringify(c.body)); return a;
}
test('실제 API·DB 연결 저장·상태 조회 및 암호문 보관·단일 인계 함수', async () => {
  const a = await login(); await connect(a);
  const current = await row(a.memberId);
  assert.equal(current.connectionState, 'CONNECTED'); assert.equal(current.externalAccountReference, '12345');
  assert(current.credentialReference.startsWith('github-v1:'));
  assert(!JSON.stringify(current).includes(FAKE_TOKEN));
  const files = await readdir(directory);
  for (const name of files) assert(!(await readFile(join(directory, name))).includes(Buffer.from(FAKE_TOKEN)));
  const value = await service.resolveCredential(a.memberId);
  assert.equal(value.token.reveal(), FAKE_TOKEN); assert(value.expiresAt > new Date());
  assert.equal(value.accountLogin, 'real-test-user');
  const read = await call(a.token, 'GET', '/me');
  assert.deepEqual(read.body.github, { state: 'CONNECTED', accountLogin: 'real-test-user' });
});
test('인증 URL은 회원에 묶인 일회용 state·PKCE와 빈 scope를 사용', async () => {
  const a = await login(); const r = await authorize(a.token);
  const u = new URL(r.body.authorizationUrl);
  assert.equal(u.origin, 'https://github.com'); assert.equal(u.pathname, '/login/oauth/authorize');
  assert.equal(u.searchParams.get('scope'), ''); assert.equal(u.searchParams.get('state'), r.body.state);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge').length, 43);
  assert(r.body.expiresAt);
});
test('state 재사용·타인 회원의 state·새 인증으로 대체된 state 거부', async () => {
  const a = await login(), b = await login('github-b');
  const first = await authorize(a.token);
  assert.equal((await call(b.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: first.body.state })).status, 400);
  assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: first.body.state })).status, 200);
  assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: first.body.state })).status, 400);
  const old = await authorize(a.token); await authorize(a.token);
  assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: old.body.state })).status, 400);
});
test('state 만료·프로세스 재시작 후 없는 state는 다시 인증 URL 요청', async () => {
  const a = await login(); let auth = await authorize(a.token);
  service.authorizations.get(a.memberId).expiresAt = Date.now() - 1;
  assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 400);
  auth = await authorize(a.token); service.authorizations.clear();
  assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 400);
});
test('같은 state 동시 완료는 한 번만 교환하고 연결', async () => {
  const a = await login(); const auth = await authorize(a.token); let count = 0;
  client.exchange = async () => { count++; await new Promise(r => setTimeout(r, 30)); return issued(); };
  const results = await Promise.all([1, 2].map(() => call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 400]); assert.equal(count, 1);
});
test('연결 해제·반복 해제는 DISCONNECTED와 자격정보 없음', async () => {
  const a = await login(); await connect(a); const reference = (await row(a.memberId)).credentialReference;
  for (let i = 0; i < 2; i++) assert.deepEqual((await call(a.token, 'DELETE', '/me/github/connection')).body, { state: 'DISCONNECTED', accountLogin: null });
  assert.equal(await service.resolveCredential(a.memberId), null);
  await assert.rejects(vault.read(reference, a.memberId), CredentialUnavailableError);
});
test('만료 확인 GET /me는 REAUTH_REQUIRED로 전환하며 CatchU JWT는 유효', async () => {
  const a = await login(); await connect(a); const c = await row(a.memberId);
  const ref = await vault.save({ ...issued({ expiresAt: new Date(Date.now() - 1) }), memberId: a.memberId });
  await db.manager.update(GitHubConnection, { memberId: a.memberId }, { credentialReference: ref });
  await vault.remove(c.credentialReference);
  const r = await call(a.token, 'GET', '/me');
  assert.equal(r.status, 200); assert.equal(r.body.github.state, 'REAUTH_REQUIRED');
  assert.equal(await service.resolveCredential(a.memberId), null);
  assert.equal((await row(a.memberId)).credentialReference, null);
});
test('폐기·권한 확대 확인은 REAUTH_REQUIRED, 외부 장애는 제공 거부하며 CONNECTED 보존', async () => {
  const a = await login();
  for (const reason of ['revoked', 'scopeRejected', 'unavailable']) {
    await connect(a);
    client.identity = async () => { throw new GitHubProviderError(reason); };
    if (reason === 'unavailable') {
      await assert.rejects(service.resolveCredential(a.memberId), e => e.code === 'INTERNAL_ERROR');
      assert.equal((await row(a.memberId)).connectionState, 'CONNECTED');
    } else {
      assert.equal(await service.resolveCredential(a.memberId), null);
      assert.equal((await row(a.memberId)).connectionState, 'REAUTH_REQUIRED');
    }
    client.identity = async () => ({ accountLogin: 'real-test-user', externalAccountReference: '12345' });
  }
});
test('신원 불일치 인계 거부 및 재인증', async () => {
  const a = await login(); await connect(a);
  client.identity = async () => ({ accountLogin: 'other', externalAccountReference: '999' });
  assert.equal(await service.resolveCredential(a.memberId), null);
  assert.equal((await row(a.memberId)).connectionState, 'REAUTH_REQUIRED');
});
test('연결 없음·개발 대역·해제·재인증이면 실제 자격정보 반환 없음', async () => {
  const a = await login(); assert.equal(await service.resolveCredential(a.memberId), null);
  for (const state of ['DISCONNECTED', 'REAUTH_REQUIRED']) {
    await db.manager.update(GitHubConnection, { memberId: a.memberId }, { connectionState: state });
    assert.equal(await service.resolveCredential(a.memberId), null);
  }
  await db.manager.delete(GitHubConnection, { memberId: a.memberId });
  assert.equal(await service.resolveCredential(a.memberId), null);
});
test('타인 소유의 보관 참조는 오류로 거부하고 연결 상태를 임의 변경하지 않음', async () => {
  const a = await login(), b = await login('github-b'); await connect(a);
  const c = await row(a.memberId);
  await assert.rejects(vault.read(c.credentialReference, b.memberId), ApiError);
  assert.deepEqual(await row(a.memberId), c);
});

for (const entry of ['회원 조회', '자격정보 제공']) {
  for (const fault of ['파일 누락', '키 불일치', '암호문 변조']) {
    test(`${entry}에서 ${fault} 확인 시 회원 조회 유지·REAUTH_REQUIRED·반복 미제공`, async () => {
      const a = await login(), b = await login('unaffected-member'); await connect(a); await connect(b);
      const current = await row(a.memberId), other = await row(b.memberId);
      const filename = join(directory, current.credentialReference.slice(10) + '.enc');
      const config = app.get(GITHUB_CONFIG), originalKey = config.encryptionKey;
      const { unlink, writeFile } = require('node:fs/promises');
      if (fault === '파일 누락') await unlink(filename);
      if (fault === '키 불일치') config.encryptionKey = randomBytes(32);
      if (fault === '암호문 변조') { const data = await readFile(filename); data[28] ^= 1; await writeFile(filename, data); }
      let identityCalls = 0;
      client.identity = async () => { identityCalls++; return { accountLogin: 'real-test-user', externalAccountReference: '12345' }; };
      try {
        if (entry === '회원 조회') {
          const result = await call(a.token, 'GET', '/me');
          assert.equal(result.status, 200); assert.equal(result.body.memberId, a.memberId);
        } else assert.equal(await service.resolveCredential(a.memberId), null);
        const read = await call(a.token, 'GET', '/me');
        assert.equal(read.status, 200); assert.equal(read.body.memberId, a.memberId);
        assert.deepEqual(read.body.github, { state: 'REAUTH_REQUIRED', accountLogin: 'real-test-user' });
        assert.equal((await row(a.memberId)).credentialReference, null);
        assert.equal(await service.resolveCredential(a.memberId), null);
        assert.equal(await service.resolveCredential(a.memberId), null);
        assert.equal(identityCalls, 0, '사용 불가 자격정보로 GitHub를 호출하지 않는다');
        await assert.rejects(readFile(filename), error => error.code === 'ENOENT');
      } finally { config.encryptionKey = originalKey; }
      assert.deepEqual(await row(b.memberId), other, '다른 회원의 연결은 유지한다');
      assert.equal((await call(b.token, 'GET', '/me')).body.github.state, 'CONNECTED');
      assert.equal((await service.resolveCredential(b.memberId)).token.reveal(), FAKE_TOKEN);
    });
  }
}

for (const code of ['EACCES', 'EIO', undefined]) {
  test(`파일 읽기 장애 ${code ?? '알 수 없는 오류'}는 500·CONNECTED 보존`, async () => {
    const a = await login(); await connect(a); const original = await row(a.memberId);
    const reading = mock.method(require('node:fs/promises'), 'lstat', async () => {
      throw Object.assign(new Error('private-vault-read-marker'), { code });
    });
    try {
      const result = await call(a.token, 'GET', '/me');
      assert.equal(result.status, 500); assert.equal(result.body.code, 'INTERNAL_ERROR');
      await assert.rejects(service.resolveCredential(a.memberId), error => error.code === 'INTERNAL_ERROR');
      assert.deepEqual(await row(a.memberId), original);
      assert(!logs.join(' ').includes('private-vault-read-marker'));
    } finally { reading.mock.restore(); }
    assert.equal((await call(a.token, 'GET', '/me')).body.github.state, 'CONNECTED');
  });
}

test('사용 불가 연결의 DB 상태 전환 실패는 500이며 CONNECTED를 임의로 바꾸지 않음', async () => {
  const a = await login(); await connect(a); const original = await row(a.memberId);
  await vault.remove(original.credentialReference);
  await db.query(`CREATE FUNCTION github_read_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'private-invalidation-marker'; END; $$ LANGUAGE plpgsql`);
  await db.query('CREATE TRIGGER github_read_fail BEFORE UPDATE ON github_connection FOR EACH ROW EXECUTE FUNCTION github_read_fail()');
  try {
    const result = await call(a.token, 'GET', '/me');
    assert.equal(result.status, 500); assert.equal(result.body.code, 'INTERNAL_ERROR');
    await assert.rejects(service.resolveCredential(a.memberId));
    assert.deepEqual(await row(a.memberId), original);
    assert(!logs.join(' ').includes('private-invalidation-marker'));
  } finally { await db.query('DROP TRIGGER github_read_fail ON github_connection'); await db.query('DROP FUNCTION github_read_fail()'); }
  assert.equal((await call(a.token, 'GET', '/me')).body.github.state, 'REAUTH_REQUIRED');
});

for (const entry of ['회원 조회', '자격정보 제공']) {
  test(`${entry}의 늦은 파일 누락 판단이 재연결한 새 자격정보를 폐기하지 않음`, async () => {
    const a = await login(); await connect(a); const old = await row(a.memberId);
    const originalRead = vault.read;
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    vault.read = async (reference, memberId) => {
      if (reference !== old.credentialReference) return originalRead.call(vault, reference, memberId);
      entered(); await new Promise(resolve => { release = resolve; });
      throw new CredentialUnavailableError();
    };
    try {
      const pending = entry === '회원 조회' ? call(a.token, 'GET', '/me') : service.resolveCredential(a.memberId);
      await started; await connect(a); release();
      if (entry === '회원 조회') assert.equal((await pending).status, 200);
      else assert.equal(await pending, null);
      const current = await row(a.memberId);
      assert.equal(current.connectionState, 'CONNECTED'); assert.notEqual(current.credentialReference, old.credentialReference);
      assert.equal((await service.resolveCredential(a.memberId)).token.reveal(), FAKE_TOKEN);
    } finally { vault.read = originalRead; }
  });
}

test('사용 불가 연결도 유효하지 않은 CatchU 토큰의 회원 조회를 허용하지 않음', async () => {
  const a = await login(); await connect(a); const original = await row(a.memberId);
  await vault.remove(original.credentialReference);
  assert.equal((await call(null, 'GET', '/me')).status, 401);
  assert.equal((await call('invalid-token', 'GET', '/me')).status, 401);
  assert.deepEqual(await row(a.memberId), original);
});
test('외부 교환 실패·유효 만료 없는 응답은 기존 연결 보존', async () => {
  const a = await login(); await connect(a); const original = await row(a.memberId);
  for (const reason of ['invalidResponse', 'scopeRejected', 'unavailable']) {
    const auth = await authorize(a.token);
    client.exchange = async () => { throw new GitHubProviderError(reason); };
    assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, reason === 'unavailable' ? 500 : 400);
    assert.deepEqual(await row(a.memberId), original);
  }
});
test('보관·DB 저장 실패는 기존 연결 보존하고 성공으로 응답하지 않음', async () => {
  const a = await login(); await connect(a); const original = await row(a.memberId);
  const save = vault.save;
  vault.save = async () => { throw new ApiError('INTERNAL_ERROR'); };
  try {
    const auth = await authorize(a.token);
    assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 500);
  } finally { vault.save = save; }
  await db.query(`CREATE FUNCTION github_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test storage failure'; END; $$ LANGUAGE plpgsql`);
  await db.query('CREATE TRIGGER github_test_fail BEFORE UPDATE ON github_connection FOR EACH ROW EXECUTE FUNCTION github_test_fail()');
  try {
    const auth = await authorize(a.token); const files = (await readdir(directory)).length;
    assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 500);
    assert.equal((await readdir(directory)).length, files);
    assert.deepEqual(await row(a.memberId), original);
  } finally { await db.query('DROP TRIGGER github_test_fail ON github_connection'); await db.query('DROP FUNCTION github_test_fail()'); }
});
test('최종 커밋 실패도 기존 연결·보관 토큰 보존, 새 암호문 정리', async () => {
  const a = await login(); await connect(a); const original = await row(a.memberId);
  await db.query(`CREATE FUNCTION github_test_commit_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test commit failure'; END; $$ LANGUAGE plpgsql`);
  await db.query('CREATE CONSTRAINT TRIGGER github_test_commit_fail AFTER UPDATE ON github_connection DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION github_test_commit_fail()');
  try {
    const auth = await authorize(a.token); const files = (await readdir(directory)).length;
    assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 500);
    assert.deepEqual(await row(a.memberId), original); assert.equal((await readdir(directory)).length, files);
    assert.equal((await vault.read(original.credentialReference, a.memberId)).token.reveal(), FAKE_TOKEN);
  } finally {
    await db.query('DROP TRIGGER github_test_commit_fail ON github_connection'); await db.query('DROP FUNCTION github_test_commit_fail()');
  }
});
test('실제 HTTP 흐름에서도 교환 응답 만료 누락·잘못된 값은 저장 없이 거부', async () => {
  const a = await login(); const original = await row(a.memberId);
  const realFetch = global.fetch;
  client.exchange = GitHubClient.prototype.exchange.bind(client);
  try {
    for (const expiry of [undefined, '3600', 0, -2, 1.1]) {
      global.fetch = async (address, options) => address === 'https://github.com/login/oauth/access_token'
        ? new Response(JSON.stringify({ access_token: FAKE_TOKEN, refresh_token: 'FAKE_REFRESH', token_type: 'bearer', scope: '', expires_in: expiry }))
        : realFetch(address, options);
      const auth = await authorize(a.token);
      assert.equal((await call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state })).status, 400);
      assert.deepEqual(await row(a.memberId), original);
    }
  } finally { global.fetch = realFetch; }
});
test('실제 OAuth·user 전송 코드와 API·DB 결합: 대역 발급 응답의 권한·만료 확인', async () => {
  const a = await login(); const realFetch = global.fetch, expiresIn = 4137;
  client.exchange = GitHubClient.prototype.exchange.bind(client);
  client.identity = GitHubClient.prototype.identity.bind(client);
  const started = Date.now();
  global.fetch = async (address, options) => {
    if (address === 'https://github.com/login/oauth/access_token') return new Response(JSON.stringify({
      access_token: FAKE_TOKEN, refresh_token: 'FAKE_REFRESH', token_type: 'bearer', scope: '', expires_in: expiresIn }));
    if (address === 'https://api.github.com/user') return new Response(JSON.stringify({ id: 12345, login: 'real-test-user' }),
      { headers: { 'x-oauth-scopes': '' } });
    return realFetch(address, options);
  };
  try {
    await connect(a); const value = await service.resolveCredential(a.memberId);
    assert(value.expiresAt.getTime() >= started + expiresIn * 1000);
    assert(value.expiresAt.getTime() <= Date.now() + expiresIn * 1000);
    assert(!JSON.stringify(value).includes('FAKE_REFRESH'));
    for (const name of await readdir(directory)) assert(!(await readFile(join(directory, name))).includes(Buffer.from('FAKE_REFRESH')));
  } finally { global.fetch = realFetch; }
});
test('연동 기능 기본 비활성 및 만료 인계 중단은 CatchU 세션 거부와 별개', async () => {
  const a = await login(); const config = app.get(GITHUB_CONFIG);
  config.enabled = false;
  try {
    assert.equal((await authorize(a.token)).status, 403);
    assert.equal(await service.resolveCredential(a.memberId), null);
    assert.equal((await call(a.token, 'GET', '/me')).status, 200);
  } finally { config.enabled = true; }
});
test('조회 중 해제하면 먼저 조회한 토큰을 인계하지 않음', async () => {
  const a = await login(); await connect(a);
  let unblock, entered; const entering = new Promise(r => { entered = r; });
  client.identity = async () => { entered(); await new Promise(r => { unblock = r; }); return { accountLogin: 'real-test-user', externalAccountReference: '12345' }; };
  const pending = service.resolveCredential(a.memberId); await entering;
  assert.equal((await call(a.token, 'DELETE', '/me/github/connection')).status, 200); unblock();
  assert.equal(await pending, null);
});
test('OAuth 응답 대기 중 해제하면 늦은 응답이 다시 연결하지 않음', async () => {
  const a = await login(); const auth = await authorize(a.token);
  let unblock, entered; const entering = new Promise(r => { entered = r; });
  client.exchange = async () => { entered(); await new Promise(r => { unblock = r; }); return issued(); };
  const pending = call(a.token, 'POST', '/me/github/connection', { code: FAKE_CODE, state: auth.body.state });
  await entering; await call(a.token, 'DELETE', '/me/github/connection'); unblock();
  assert.equal((await pending).status, 400); assert.equal((await row(a.memberId)).connectionState, 'DISCONNECTED');
});
test('보호된 모든 연결 경로는 토큰 없이 401', async () => {
  for (const [method, path] of [['POST', '/me/github/authorization'], ['POST', '/me/github/connection'], ['DELETE', '/me/github/connection']]) {
    assert.equal((await call(null, method, path)).status, 401);
  }
});
test('입력 추가 필드·다른 회원 입력·잘못된 code/state·쿼리는 400 공통 검증', async () => {
  const a = await login();
  for (const body of [{}, { code: FAKE_CODE, state: 'x' }, { code: '', state: 'a'.repeat(64) },
    { code: FAKE_CODE, state: 'a'.repeat(64), memberId: randomUUID() }, [], 'text']) {
    const r = await call(a.token, 'POST', '/me/github/connection', body);
    assert.equal(r.status, 400);
    // 최상위 원시 JSON은 공통 parser가 먼저 거부한다. 기능 검증과 구분한다.
    if (typeof body === 'string') assert.equal(r.body.code, 'INVALID_REQUEST');
    else { assert.equal(r.body.code, 'VALIDATION_FAILED'); assert(r.body.details.violations.length); }
  }
  for (const [method, path, body] of [['POST', '/me/github/authorization?memberId=x', {}], ['POST', '/me/github/authorization', { token: 'fake' }],
    ['DELETE', '/me/github/connection', { memberId: randomUUID() }]]) {
    assert.equal((await call(a.token, method, path, body)).body.code, 'VALIDATION_FAILED');
  }
});
test('없는·비활성 회원은 공통 세션 Guard에서 401, GitHub 서비스에서 404로 거부', async () => {
  const { MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
  const a = await login(); await db.manager.update(MemberAccount, { memberId: a.memberId }, { accountState: 'INACTIVE' });
  assert.equal((await authorize(a.token)).status, 401);
  await assert.rejects(service.authorize(a.memberId), { code: 'RESOURCE_UNAVAILABLE' });
  const now = Math.floor(Date.now() / 1000);
  const missingMemberId = randomUUID();
  const token = await new SignJWT({ sub: missingMemberId, iss: 'catchu-api', aud: 'catchu-member-api', iat: now, exp: now + 900 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
  assert.equal((await authorize(token)).status, 401);
  await assert.rejects(service.authorize(missingMemberId), { code: 'RESOURCE_UNAVAILABLE' });
});
