// OAuth 메타데이터·등록·승인 시작(기능 설계 BR1.1·BR2·BR3.1·BR4.6, 시나리오 S1·S3·S4·S5). 실제 AppModule과 테스트 DB를 쓴다.
// /register는 SDK IP 제한이 앱 하나에 시간당 20회 걸리므로(BR2.5) 등록 자체를 보는 경우에만 부르고, 21번째 시험은 새 앱에서 한다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const auth = require('@modelcontextprotocol/sdk/client/auth.js');
const { readMcpConfig } = require('../../dist/claude-mcp/mcp-config');
const { McpOAuthProvider } = require('../../dist/claude-mcp/mcp-oauth.provider');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  CLAUDE_REDIRECT_URI, DB_FAILURE_MARKER, DEV_REDIRECT_URI, WEB_ORIGIN, approve, assertNoSecrets, connectMember, events, failingConnection, insertClient, mcpRows, pkcePair,
  startAuthorize, startMcpApp, swapConnection,
} = require('./support.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

let server;
let db;
before(async () => {
  server = await startMcpApp({ MCP_DEV_REDIRECT_URIS: DEV_REDIRECT_URI });
  db = await openTestDataSource();
});
after(async () => {
  await server?.close();
  await db?.destroy();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
});

const register = (metadata) => server.raw('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
const claudeClient = (overrides = {}) => ({ client_name: '합성 Claude', redirect_uris: [CLAUDE_REDIRECT_URI], grant_types: ['authorization_code'], response_types: ['code'],
  token_endpoint_auth_method: 'none', ...overrides });
const clientRows = () => db.query('SELECT mcp_client_id AS "clientId", client_name AS "clientName", redirect_uris AS "redirectUris", approved_at AS "approvedAt" FROM mcp_client ORDER BY registered_at');

function assertRejected(response, status, error) {
  assert.equal(response.status, status, response.text);
  assert.equal(response.body.error, error, response.text);
}

test('S1 메타데이터는 공개 주소를 쓰고 S256을 알리며 /revoke는 없다', async () => {
  const resource = await auth.discoverOAuthProtectedResourceMetadata(server.mcpUrl);
  assert.equal(resource.resource, server.mcpUrl);
  assert.deepEqual(resource.authorization_servers.map((value) => new URL(value).origin), [server.origin]);
  const metadata = await auth.discoverAuthorizationServerMetadata(resource.authorization_servers[0]);
  assert.equal(new URL(metadata.issuer).origin, server.origin);
  for (const name of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
    assert.equal(new URL(metadata[name]).origin, server.origin, `${name}이 web 주소를 가리키면 안 된다`);
  }
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal(metadata.revocation_endpoint, undefined);
  assert.equal((await server.raw('/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
});

test('S3 등록: 공개 클라이언트로 저장하고 비밀값을 만들지 않는다', async () => {
  const response = await register(claudeClient());
  assert.equal(response.status, 201, response.text);
  assert.ok(response.body.client_id);
  assert.equal(response.body.client_secret, undefined);
  assert.equal(response.body.client_secret_expires_at, undefined);
  assert.equal(response.body.token_endpoint_auth_method, 'none');
  assert.deepEqual(response.body.redirect_uris, [CLAUDE_REDIRECT_URI]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await clientRows(), [{ clientId: response.body.client_id, clientName: '합성 Claude', redirectUris: [CLAUDE_REDIRECT_URI], approvedAt: null }]);
});

test('S3 client_secret_post로 요청해도 공개 클라이언트로 저장하고 응답·표에 비밀값이 없다', async () => {
  const response = await register(claudeClient({ token_endpoint_auth_method: 'client_secret_post' }));
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.token_endpoint_auth_method, 'none');
  assert.equal(response.body.client_secret, undefined);
  const columns = await db.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'mcp_client'`);
  assert.deepEqual(columns.map((column) => column.name).sort(), ['approved_at', 'client_name', 'mcp_client_id', 'redirect_uris', 'registered_at']);
});

test('S3 돌아갈 주소는 허용 목록과 정확히 일치해야 하고, 다르면 invalid_redirect_uri이며 행을 만들지 않는다', async () => {
  const lists = [
    ['https://evil.example/callback'],
    [`${CLAUDE_REDIRECT_URI}/extra`],
    [`${CLAUDE_REDIRECT_URI}?a=1`],
    [CLAUDE_REDIRECT_URI.replace('https:', 'http:')],
    [CLAUDE_REDIRECT_URI, 'https://evil.example/callback'],
    [],
  ];
  for (const redirectUris of lists) {
    assertRejected(await register(claudeClient({ redirect_uris: redirectUris })), 400, 'invalid_redirect_uri');
  }
  assert.deepEqual(await clientRows(), []);
});

test('S3 이름은 200자까지 받고 201자나 NUL 문자는 DB 오류가 아니라 invalid_client_metadata다', async () => {
  assert.equal((await register(claudeClient({ client_name: '가'.repeat(200) }))).status, 201);
  assertRejected(await register(claudeClient({ client_name: '가'.repeat(201) })), 400, 'invalid_client_metadata');
  assertRejected(await register(claudeClient({ client_name: '합성\u0000이름' })), 400, 'invalid_client_metadata');
  assert.equal((await clientRows()).length, 1);
  assert.deepEqual(events(server, 'mcp_oauth_failed'), []);
});

test('S3 개발 목록 주소는 개발에서 받고, 운영 설정의 저장 단계는 거부한다', async () => {
  assert.equal((await register(claudeClient({ redirect_uris: [DEV_REDIRECT_URI] }))).status, 201);
  const production = new McpOAuthProvider(db, readMcpConfig({ NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://catchu.example' }));
  await assert.rejects(production.clientsStore.registerClient({ client_id: randomUUID(), redirect_uris: [DEV_REDIRECT_URI] }), (error) => {
    assert.equal(error.errorCode, 'invalid_redirect_uri');
    return true;
  });
  assert.equal((await clientRows()).length, 1);
});

test('S4 등록 요청 때 승인에 쓰이지 않고 7일이 지난 등록만 지우고, 승인된 등록의 연결·토큰은 남는다', async () => {
  const member = await server.login();
  const oldUnapproved = await insertClient(db, { registeredAt: daysAgo(8) });
  const oldApproved = await insertClient(db, { registeredAt: daysAgo(8), approvedAt: daysAgo(7.5) });
  const recentUnapproved = await insertClient(db, { registeredAt: daysAgo(6) });
  await connectMember(db, member.memberId, { clientId: oldApproved });
  const response = await register(claudeClient());
  assert.equal(response.status, 201, response.text);
  const ids = (await clientRows()).map((row) => row.clientId);
  assert.ok(!ids.includes(oldUnapproved), '8일 전 미승인은 지워진다');
  assert.ok(ids.includes(oldApproved), '승인된 등록은 남는다');
  assert.ok(ids.includes(recentUnapproved), '6일 전 미승인은 남는다');
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 1, mcp_authorization_code: 0, mcp_access_token: 1 });
});

test('등록 중 DB가 실패하면 500이고 mcp_oauth_failed(register)를 남기며 원인 글을 내보내지 않는다', async (t) => {
  swapConnection(t, server.app.get(McpOAuthProvider), failingConnection());
  const response = await register(claudeClient());
  assertRejected(response, 500, 'server_error');
  assert.deepEqual(events(server, 'mcp_oauth_failed'), [{ event: 'mcp_oauth_failed', step: 'register', error: 'QueryFailedError' }]);
  assertNoSecrets([response.text, ...server.logs.map((log) => log.text)], { 'DB 오류 글': DB_FAILURE_MARKER });
});

test('S5 /authorize 정상: 승인 화면으로 302이고 값이 그대로 넘어간다', async () => {
  const clientId = await insertClient(db);
  const { challenge } = pkcePair();
  const state = `synthetic state/${randomUUID()}+=&`;
  const response = await startAuthorize(server, { clientId, state, challenge, resource: server.mcpUrl });
  assert.equal(response.status, 302, response.text);
  const target = new URL(response.headers.get('location'));
  assert.equal(target.origin + target.pathname, `${WEB_ORIGIN}/profile/claude/authorize`);
  assert.deepEqual(Object.fromEntries(target.searchParams), { client_id: clientId, redirect_uri: CLAUDE_REDIRECT_URI, state, code_challenge: challenge, resource: server.mcpUrl });
});

test('S5 state·resource가 없어도 승인 화면으로 넘어가고 그 값은 쿼리에 없다', async () => {
  const clientId = await insertClient(db);
  const { challenge } = pkcePair();
  const response = await startAuthorize(server, { clientId, challenge, state: null });
  assert.equal(response.status, 302, response.text);
  const target = new URL(response.headers.get('location'));
  assert.deepEqual(Object.fromEntries(target.searchParams), { client_id: clientId, redirect_uri: CLAUDE_REDIRECT_URI, code_challenge: challenge });
});

test('S5 없는 클라이언트와 등록에 없는 돌아갈 주소는 오류이고 그 주소로 보내지 않는다', async () => {
  for (const unknownId of [randomUUID(), '합성\u0000클라이언트']) { // NUL은 text 칸에 있을 수 없어 DB 오류가 아니라 없는 클라이언트다
    const unknown = await startAuthorize(server, { clientId: unknownId });
    assertRejected(unknown, 400, 'invalid_client');
    assert.equal(unknown.headers.get('location'), null);
  }
  assert.deepEqual(events(server, 'mcp_oauth_failed'), []);
  const clientId = await insertClient(db);
  for (const redirectUri of ['https://evil.example/callback', `${CLAUDE_REDIRECT_URI}?a=1`, 'https://claude.ai:8443/api/mcp/auth_callback']) {
    const response = await startAuthorize(server, { clientId, redirectUri });
    assertRejected(response, 400, 'invalid_request');
    assert.equal(response.headers.get('location'), null, redirectUri);
  }
});

test('S5 S256 아닌 PKCE와 다른 resource는 승인 화면으로 넘어가지 않고 확인된 주소로 오류를 돌려준다', async () => {
  const clientId = await insertClient(db);
  // SDK는 쿼리 형식이 틀리면 state를 읽기 전에 오류를 내므로 PKCE 경우에는 state가 붙지 않는다.
  const cases = [
    { overrides: { method: 'plain' }, state: null },
    { overrides: { resource: 'https://other.example/v1/mcp' }, state: 'synthetic-state' },
    { overrides: { resource: `${server.mcpUrl}/other` }, state: 'synthetic-state' },
  ];
  for (const { overrides, state } of cases) {
    const response = await startAuthorize(server, { clientId, state: 'synthetic-state', ...overrides });
    assert.equal(response.status, 302, response.text);
    const target = new URL(response.headers.get('location'));
    assert.equal(`${target.origin}${target.pathname}`, CLAUDE_REDIRECT_URI, '승인 화면이 아니라 등록·허용으로 확인된 주소다');
    assert.equal(target.searchParams.get('error'), 'invalid_request');
    assert.equal(target.searchParams.get('state'), state);
    assert.equal(target.searchParams.get('code'), null);
  }
});

test('S5 포트만 다른 loopback은 승인 화면까지 가지만 승인 요청이 400으로 거부해 코드가 나가지 않는다', async () => {
  const member = await server.login();
  const clientId = await insertClient(db, { redirectUris: [DEV_REDIRECT_URI] });
  const otherPort = 'http://127.0.0.1:9999/oauth/callback';
  const started = await startAuthorize(server, { clientId, redirectUri: otherPort });
  assert.equal(started.status, 302, started.text);
  const target = new URL(started.headers.get('location'));
  assert.equal(target.origin + target.pathname, `${WEB_ORIGIN}/profile/claude/authorize`);
  assert.equal(target.searchParams.get('redirect_uri'), otherPort);
  const rejected = await approve(server, member, { clientId, redirectUri: otherPort, consent: true });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, 'MCP_AUTHORIZATION_INVALID');
  assert.equal((await mcpRows(db, member.memberId)).mcp_authorization_code, 0);
  const allowed = await approve(server, member, { clientId, redirectUri: DEV_REDIRECT_URI, consent: true });
  assert.equal(allowed.status, 200, '정확히 일치하는 주소는 받는다');
});

test('S5 클라이언트 조회 중 DB가 실패하면 500이고 mcp_oauth_failed(client)를 남긴다', async (t) => {
  const clientId = await insertClient(db);
  swapConnection(t, server.app.get(McpOAuthProvider), failingConnection());
  const response = await startAuthorize(server, { clientId });
  assertRejected(response, 500, 'server_error');
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(events(server, 'mcp_oauth_failed'), [{ event: 'mcp_oauth_failed', step: 'client', error: 'QueryFailedError' }]);
});

test('BR2.5 한 시간에 등록 20회를 넘으면 SDK가 429로 막고 행이 늘지 않는다', { timeout: 60000 }, async () => {
  const fresh = await startMcpApp();
  try {
    const send = () => fresh.raw('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(claudeClient()) });
    for (let call = 1; call <= 20; call += 1) assert.equal((await send()).status, 201, `${call}번째`);
    const limited = await send();
    assert.equal(limited.status, 429, limited.text);
    assert.equal((await clientRows()).length, 20);
  } finally {
    await fresh.close();
  }
});
