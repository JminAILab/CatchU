// U2 탈퇴 DELETE /v1/me(계약 C-06, 기능 설계 W7·W8·BR7.1~BR7.6, 시나리오 S24~S27, 비기능 NFR1.1·NFR1.2·NFR5.1·NFR5.5·NFR6.7).
// 실제 AppModule·Guard·테스트 DB를 쓴다. 파일 저장 두 값과 GitHub 자격정보 폴더는 시험 안의 임시 폴더다.
// U4 publication·U6 mcp_* 표는 통합 브랜치에 아직 없어 C-07·C-15 모양의 시험용 표를 시험 안에서 만들고 지운다.
// 두 Unit을 합친 뒤에는 실제 표로 이 시험을 다시 돌리는 것이 U2 완료 조건이다(기능 설계 가정 4).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdtemp, rm, unlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { AppModule } = require('../../dist/app.module');
const { WithdrawalService } = require('../../dist/withdrawal/withdrawal.service');
const { FILE_STORAGE, StorageUnavailable, materialKey } = require('../../dist/file-storage/file-storage');
const { UnavailableFileStorage } = require('../../dist/file-storage/local-file-storage');
const { CredentialVault } = require('../../dist/github-connection/credential-vault');
const { GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { GoogleLoginService } = require('../../dist/google-login/google-login.service');
const { HttpGoogleProvider } = require('../../dist/google-login/google-provider');
const { GOOGLE_CONFIG } = require('../../dist/google-login/google.config');
const { APP_SETTINGS, WEB_ORIGIN, setEnv, startApp, expectError } = require('./support.cjs');

// 실제 표가 이미 있으면(U4·U6를 합친 뒤) 만들지도 지우지도 않는다. 그때는 아래 자료 넣기가 실제 표 모양과 달라 실패하므로,
// 실제 표 모양으로 이 시험을 고쳐 다시 돌린다(U2 완료 조건). 시험이 실제 마이그레이션 표를 지우는 일은 없다.
const PROBE_TABLES = ['publication', 'mcp_connection', 'mcp_authorization_code', 'mcp_access_token'];
const PROBE_SQL = {
  publication: `CREATE TABLE publication (publication_id uuid PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES member_account(member_id) ON DELETE CASCADE,
    published_at timestamptz NOT NULL, stopped_at timestamptz NULL CHECK (stopped_at IS NULL OR stopped_at >= published_at))`,
  mcp_connection: 'CREATE TABLE mcp_connection (connection_id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member_account(member_id) ON DELETE CASCADE)',
  mcp_authorization_code: 'CREATE TABLE mcp_authorization_code (code_id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member_account(member_id) ON DELETE CASCADE)',
  mcp_access_token: 'CREATE TABLE mcp_access_token (token_id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member_account(member_id) ON DELETE CASCADE)',
};
let createdProbes = [];
async function createProbes() {
  createdProbes = [];
  for (const table of PROBE_TABLES) {
    if ((await db.query('SELECT to_regclass($1) IS NOT NULL AS exists', [table]))[0].exists) continue;
    await db.query(PROBE_SQL[table]);
    createdProbes.push(table);
  }
}
async function dropProbes() {
  for (const table of [...createdProbes].reverse()) await db.query(`DROP TABLE ${table}`);
  createdProbes = [];
}

let server, db, restore, fileRoot, vaultRoot, service, vault, storage, google;
const exchanges = new Map();
before(async () => {
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u2-withdrawal-files-'));
  vaultRoot = await mkdtemp(join(tmpdir(), 'catchu-u2-withdrawal-vault-'));
  restore = setEnv({ ...APP_SETTINGS, FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot,
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'synthetic-client', GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback', GITHUB_CREDENTIAL_DIRECTORY: vaultRoot,
    GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'google-secret-marker',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/google/callback' });
  server = await startApp(AppModule);
  db = await openTestDataSource();
  await createProbes();
  service = server.app.get(WithdrawalService);
  vault = server.app.get(CredentialVault);
  storage = server.app.get(FILE_STORAGE);
  google = await fakeGoogle();
});
after(async () => {
  if (db) await dropProbes();
  await server?.app.close();
  await db?.destroy();
  restore?.();
  await rm(fileRoot, { recursive: true, force: true });
  await rm(vaultRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  service.files = storage;
  service.vault = vault;
});

/** Google 제공자를 합성 응답으로 바꾼다(실제 Google을 부르지 않는다). */
async function fakeGoogle() {
  const login = server.app.get(GoogleLoginService);
  const config = server.app.get(GOOGLE_CONFIG);
  const key = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(key.publicKey), kid: 'test-key', use: 'sig', alg: 'RS256' };
  login.provider = new HttpGoogleProvider(config, async (target, init) => {
    if (String(target).endsWith('/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    const fixture = exchanges.get(init.body.get('code'));
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ iss: 'https://accounts.google.com', aud: config.clientId, sub: fixture.sub, iat: now, exp: now + 300,
      nonce: fixture.nonce, name: '합성 이름' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key.privateKey);
    return new Response(JSON.stringify({ id_token: token, access_token: 'synthetic-google-access' }));
  });
  return async (sub) => {
    const start = await server.call('POST', '/auth/google/authorization', { body: {} });
    const address = new URL(start.body.authorizationUrl);
    const code = randomBytes(20).toString('hex');
    exchanges.set(code, { sub, nonce: address.searchParams.get('nonce') });
    const done = await server.call('POST', '/auth/google/login', { body: { state: address.searchParams.get('state'),
      loginAttemptToken: start.body.loginAttemptToken, code } });
    assert.equal(done.status, 200, done.text);
    return done.body.accessToken;
  };
}

/** 탈퇴할 회원의 자료를 모두 만든다: 세션 둘, 발행 링크(진행 중·이미 중지), MCP 세 표, 회원 파일, GitHub 자격정보 파일, U2 표. */
async function memberWithData(identity = `u2-withdraw-${randomUUID()}`) {
  const first = await server.login(identity);
  const second = await server.login(identity); // 다른 기기 세션
  const { memberId } = first;
  const publishedAt = new Date(Date.now() - 60_000);
  const stoppedBefore = new Date(Date.now() - 30_000);
  await db.query('INSERT INTO publication VALUES ($1, $2, $3, NULL), ($4, $2, $3, $5)', [randomUUID(), memberId, publishedAt, randomUUID(), stoppedBefore]);
  for (const table of ['mcp_connection', 'mcp_authorization_code', 'mcp_access_token']) {
    await db.query(`INSERT INTO ${table} VALUES ($1, $2)`, [randomUUID(), memberId]);
  }
  await storage.put(materialKey(memberId, randomUUID()), Buffer.from('합성 PDF'), 'application/pdf');
  const reference = await vault.save({ memberId, accountLogin: 'synthetic-login', externalAccountReference: '42',
    expiresAt: new Date(Date.now() + 3_600_000), token: new GitHubAccessToken('gho_synthetic_token') });
  await db.query('UPDATE github_connection SET credential_reference = $2 WHERE member_id = $1', [memberId, reference]);
  await db.query("INSERT INTO daily_execution_count VALUES ($1, '2026-11-02', 3)", [memberId]);
  await db.query("INSERT INTO ai_consent VALUES ($1, $2, '2026-11-v1', now())", [randomUUID(), memberId]);
  return { memberId, tokens: [first.token, second.token], credentialFile: join(vaultRoot, `${reference.slice(10)}.enc`), stoppedBefore };
}

const count = async (table, memberId) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE member_id = $1`, [memberId]))[0].n;
const MEMBER_TABLES = ['member_account', 'member_profile', 'github_connection', 'auth_session', 'publication', 'mcp_connection',
  'mcp_authorization_code', 'mcp_access_token', 'daily_execution_count', 'ai_consent'];
async function rowsOf(memberId) {
  return Object.fromEntries(await Promise.all(MEMBER_TABLES.map(async (table) => [table, await count(table, memberId)])));
}
const withdraw = (token, origin = WEB_ORIGIN) => server.call('DELETE', '/me', { token, origin });
const failures = () => server.logs.filter((log) => log.args[0]?.event === 'withdrawal_failed').map((log) => log.args[0]);

test('S24 정상 탈퇴는 204와 Refresh 쿠키 제거, 그 회원의 행·파일·자격정보 파일이 모두 지워지고 다른 회원 자료는 남는다', async () => {
  const leaving = await memberWithData();
  const staying = await memberWithData();
  const stayingBefore = await rowsOf(staying.memberId);
  const response = await withdraw(leaving.tokens[0]);
  assert.equal(response.status, 204, response.text);
  assert.match(response.headers.get('set-cookie'), /^catchu_refresh=; Path=\/v1\/auth; HttpOnly; SameSite=Strict; Max-Age=0/);
  assert.deepEqual(Object.values(await rowsOf(leaving.memberId)), MEMBER_TABLES.map(() => 0));
  assert.equal(existsSync(join(fileRoot, 'members', leaving.memberId)), false);
  assert.equal(existsSync(leaving.credentialFile), false);
  assert.deepEqual(await rowsOf(staying.memberId), stayingBefore);
  assert.equal(existsSync(join(fileRoot, 'members', staying.memberId)), true);
  assert.equal(existsSync(staying.credentialFile), true);
  assert.equal(failures().length, 0);
});

test('S25 2단계(파일 삭제)가 실패하면 500 WITHDRAWAL_FAILED이고, 세션·발행 링크·MCP는 막힌 채 회원 행과 파일은 남는다', async () => {
  const member = await memberWithData();
  service.files = { deletePrefix: async () => { throw new StorageUnavailable('IO_FAILED'); } };
  const response = await withdraw(member.tokens[0]);
  expectError(response, 500, 'WITHDRAWAL_FAILED');
  assert.equal(response.body.message, '탈퇴를 끝내지 못했습니다. 팀에 알려 주세요');
  assert.equal(response.headers.get('set-cookie'), null);
  const rows = await rowsOf(member.memberId);
  assert.equal(rows.member_account, 1, '회원 행은 남는다');
  assert.deepEqual([rows.mcp_connection, rows.mcp_authorization_code, rows.mcp_access_token], [0, 0, 0]);
  const links = await db.query('SELECT stopped_at FROM publication WHERE member_id = $1 ORDER BY stopped_at', [member.memberId]);
  assert.ok(links.every((link) => link.stopped_at !== null), '모든 발행 링크가 중지됐다');
  assert.equal(links[0].stopped_at.getTime(), member.stoppedBefore.getTime(), '이미 중지된 링크의 시각은 바꾸지 않는다');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth_session WHERE member_id = $1 AND revoked_at IS NULL', [member.memberId]))[0].n, 0);
  for (const token of member.tokens) expectError(await server.call('GET', '/me', { token }), 401, 'AUTH_INVALID');
  assert.equal(existsSync(join(fileRoot, 'members', member.memberId)), true);
  assert.equal(existsSync(member.credentialFile), true, '3단계는 하지 않았다');
  assert.deepEqual(failures().map((log) => [log.step, log.error]), [[2, 'StorageUnavailable']]);
  assert.ok(!server.logs.some((log) => log.text.includes(member.memberId) || log.text.includes(fileRoot)), '로그에 회원 ID·파일 경로가 없다');
});

test('3단계 실패 뒤 다시 로그인해 탈퇴를 다시 요청하면, 이미 지운 파일·자격정보 때문에 막히지 않고 성공한다', async () => {
  const identity = `u2-retry-${randomUUID()}`;
  const member = await memberWithData(identity);
  service.vault = { remove: async () => { throw new Error('vault down'); } };
  expectError(await withdraw(member.tokens[0]), 500, 'WITHDRAWAL_FAILED');
  assert.deepEqual(failures().map((log) => log.step), [3]);
  assert.equal(existsSync(join(fileRoot, 'members', member.memberId)), false, '2단계는 끝났다');
  // 자격정보 파일도 따로 지워진 상태에서(2·3단계 대상 없음) 다시 요청한다.
  await unlink(member.credentialFile);
  service.vault = vault;
  const again = await server.login(identity);
  assert.equal(again.memberId, member.memberId);
  assert.equal((await withdraw(again.token)).status, 204);
  assert.equal(await count('member_account', member.memberId), 0);
});

test('S26 탈퇴 뒤 그 회원의 Access 토큰은 모든 기기에서 401이다', async () => {
  const member = await memberWithData();
  assert.equal((await withdraw(member.tokens[1])).status, 204);
  for (const token of member.tokens) {
    expectError(await server.call('GET', '/me', { token }), 401, 'AUTH_INVALID');
    expectError(await server.call('GET', '/ai-consent', { token }), 401, 'AUTH_INVALID');
  }
});

test('S27 탈퇴한 Google 계정으로 다시 로그인하면 새 memberId의 빈 계정으로 시작한다', async () => {
  const firstToken = await google('google-sub-withdraw');
  const first = (await server.call('GET', '/me', { token: firstToken })).body;
  await db.query("INSERT INTO ai_consent VALUES ($1, $2, '2026-11-v1', now())", [randomUUID(), first.memberId]);
  await server.call('PUT', '/me/profile', { token: firstToken, body: { displayName: '이전 이름', introduction: '', desiredRole: '', skills: [] } });
  assert.equal((await withdraw(firstToken)).status, 204);
  const secondToken = await google('google-sub-withdraw');
  const second = (await server.call('GET', '/me', { token: secondToken })).body;
  assert.notEqual(second.memberId, first.memberId);
  assert.equal(second.profile.displayName, '');
  assert.deepEqual((await server.call('GET', '/ai-consent', { token: secondToken })).body.consented, false, '동의도 새로 받는다');
});

test('인증 없음은 401, 허용 출처가 아니면 403, 본문·쿼리가 있으면 400이고 아무것도 지우지 않는다', async () => {
  const member = await memberWithData();
  const before = await rowsOf(member.memberId);
  expectError(await server.call('DELETE', '/me', { origin: WEB_ORIGIN }), 401, 'AUTH_REQUIRED');
  expectError(await withdraw(member.tokens[0], 'https://evil.example'), 403, 'AUTH_ORIGIN_FORBIDDEN');
  expectError(await withdraw(member.tokens[0], null), 403, 'AUTH_ORIGIN_FORBIDDEN');
  expectError(await server.call('DELETE', '/me', { token: member.tokens[0], origin: WEB_ORIGIN, body: { memberId: member.memberId } }),
    400, 'VALIDATION_FAILED');
  expectError(await server.call('DELETE', `/me?memberId=${member.memberId}`, { token: member.tokens[0], origin: WEB_ORIGIN }), 400, 'VALIDATION_FAILED');
  assert.deepEqual(await rowsOf(member.memberId), before);
  assert.equal(existsSync(member.credentialFile), true);
});

test('파일 저장 설정이 없으면 2단계에서 실패하고(성공으로 응답하지 않음) 1단계 차단은 남는다', async () => {
  const member = await memberWithData();
  service.files = new UnavailableFileStorage();
  expectError(await withdraw(member.tokens[0]), 500, 'WITHDRAWAL_FAILED');
  assert.deepEqual(failures().map((log) => [log.step, log.error]), [[2, 'StorageUnavailable']]);
  assert.equal(await count('member_account', member.memberId), 1);
  assert.equal(await count('mcp_access_token', member.memberId), 0);
});

test('U4·U6 표가 아직 없으면 1단계는 세션만 막고 건너뛰며 탈퇴는 끝난다(자격정보 파일이 없어도 성공)', async (t) => {
  if (createdProbes.length !== PROBE_TABLES.length) {
    t.skip('U4·U6 실제 표가 있어 "표 없음" 경우를 만들 수 없다');
    return;
  }
  await dropProbes();
  t.after(createProbes);
  const member = await server.login();
  await storage.put(materialKey(member.memberId, randomUUID()), Buffer.from('x'), 'application/pdf');
  assert.equal((await withdraw(member.token)).status, 204);
  assert.equal(await count('member_account', member.memberId), 0);
  assert.equal(existsSync(join(fileRoot, 'members', member.memberId)), false);
  assert.equal(failures().length, 0);
});
