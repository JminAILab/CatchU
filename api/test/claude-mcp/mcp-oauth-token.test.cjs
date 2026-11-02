// 토큰 교환(기능 설계 BR4.1~BR4.6, 비기능 설계 reliability-design 「트랜잭션 경계」, 시나리오 S7·S8). 실제 AppModule과 테스트 DB를 쓴다.
// 거부는 트랜잭션을 되돌리므로 코드가 쓰지 않은 채 남는지까지 본다. /token의 SDK IP 제한(앱 하나에 15분 50회)을 넘지 않게 필요한 만큼만 부른다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { McpOAuthProvider } = require('../../dist/claude-mcp/mcp-oauth.provider');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  CLAUDE_REDIRECT_URI, DB_FAILURE_MARKER, assertNoSecrets, connectMember, events, exchange, failingConnection, failingOn, insertClient, insertCode, insertConnection, insertToken,
  issueCode, mcpRows, pageOf, pkcePair, sha256Hex, startMcpApp, swapConnection,
} = require('./support.cjs');

let server;
let db;
let member;
let clientId;
before(async () => {
  server = await startMcpApp();
  db = await openTestDataSource();
});
after(async () => {
  await server?.close();
  await db?.destroy();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  member = await server.login();
  clientId = await insertClient(db);
});

const refused = () => events(server, 'mcp_token_exchange_refused').map((entry) => entry.reason);
const codeRow = async (code) => (await db.query('SELECT used_at AS "usedAt" FROM mcp_authorization_code WHERE code_hash = $1', [sha256Hex(code)]))[0];

// 실패 메시지에 응답 글을 싣지 않는다. 뜻밖의 200이면 그 글에 토큰이 들어 있다.
function assertInvalidGrant(response) {
  assert.equal(response.status, 400, `응답 오류 ${response.body?.error}`);
  assert.equal(response.body.error, 'invalid_grant');
  assert.equal(response.body.access_token, undefined);
}

/** 거부 뒤 토큰·연결이 없고 코드가 쓰지 않은 채 남았는지 본다. */
async function assertUnchanged(code) {
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 1, mcp_access_token: 0 });
  assert.equal((await codeRow(code)).usedAt, null, '되돌려 코드는 쓰지 않은 채 남는다');
}

test('S7 정상: 응답은 access_token·token_type·expires_in뿐이고 표에는 해시만 있으며 연결은 코드의 동의 시각을 옮긴다', async () => {
  const issued = await issueCode(server, member, clientId, { resource: server.mcpUrl });
  const response = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier, resource: server.mcpUrl });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(Object.keys(response.body).sort(), ['access_token', 'expires_in', 'token_type']);
  assert.equal(response.body.token_type, 'bearer');
  assert.equal(response.body.expires_in, 604800);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const tokenRows = await db.query('SELECT token_hash AS "tokenHash", expires_at AS "expiresAt" FROM mcp_access_token WHERE member_id = $1', [member.memberId]);
  assert.equal(tokenRows.length, 1);
  assert.equal(tokenRows[0].tokenHash, sha256Hex(response.body.access_token));
  const [codeInfo] = await db.query('SELECT code_hash AS "codeHash", used_at AS "usedAt", consented_at AS "consentedAt" FROM mcp_authorization_code WHERE member_id = $1', [member.memberId]);
  assert.equal(codeInfo.codeHash, sha256Hex(issued.code));
  assert.notEqual(codeInfo.usedAt, null);
  const [connection] = await db.query('SELECT consented_at AS "consentedAt", expires_at AS "expiresAt" FROM mcp_connection WHERE member_id = $1 AND mcp_client_id = $2', [member.memberId, clientId]);
  assert.equal(connection.consentedAt.getTime(), codeInfo.consentedAt.getTime());
  assert.equal(connection.expiresAt.getTime(), tokenRows[0].expiresAt.getTime());
  const remaining = tokenRows[0].expiresAt.getTime() - Date.now();
  assert.ok(remaining > 604_700_000 && remaining <= 604_800_000, '수명은 7일이다');
  assert.deepEqual(pageOf(await server.callTool(response.body.access_token, 'list_my_catches')), { catches: [], nextCursor: null });
  assert.deepEqual(refused(), []);
});

test('S7 없는 코드는 invalid_grant이고 표가 바뀌지 않는다', async () => {
  const { verifier } = pkcePair();
  assertInvalidGrant(await exchange(server, { clientId, code: 'synthetic-unknown-code', verifier }));
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 0, mcp_access_token: 0 });
  assert.deepEqual(refused(), ['code_missing']);
});

test('S7 같은 코드를 두 번 쓰면 두 번째는 invalid_grant이고 첫 토큰은 그대로다', async () => {
  const issued = await issueCode(server, member, clientId);
  const first = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(first.status, 200, first.text);
  assertInvalidGrant(await exchange(server, { clientId, code: issued.code, verifier: issued.verifier }));
  assert.deepEqual(refused(), ['code_used']);
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 1, mcp_authorization_code: 1, mcp_access_token: 1 });
  assert.equal((await server.callTool(first.body.access_token, 'list_my_catches')).status, 200);
});

test('S7 같은 코드를 동시에 보내도 하나만 성공한다', async () => {
  const issued = await issueCode(server, member, clientId);
  const results = await Promise.all([1, 2].map(() => exchange(server, { clientId, code: issued.code, verifier: issued.verifier })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  assertInvalidGrant(results.find((result) => result.status === 400));
  assert.equal((await mcpRows(db, member.memberId)).mcp_access_token, 1);
});

test('S7 5분이 지난 코드는 invalid_grant이고 쓰지 않은 채 남는다', async () => {
  const pkce = pkcePair();
  const code = await insertCode(db, member.memberId, clientId, { challenge: pkce.challenge, expiresAt: new Date(Date.now() - 1000) });
  assertInvalidGrant(await exchange(server, { clientId, code, verifier: pkce.verifier }));
  await assertUnchanged(code);
  assert.deepEqual(refused(), ['code_expired']);
});

test('S7 PKCE가 틀리면 invalid_grant이고 코드를 소비하지 않아 맞는 값으로 다시 바꿀 수 있다', async () => {
  const issued = await issueCode(server, member, clientId);
  assertInvalidGrant(await exchange(server, { clientId, code: issued.code, verifier: pkcePair().verifier }));
  await assertUnchanged(issued.code);
  assert.deepEqual(refused(), [], 'SDK가 먼저 거부하므로 남길 자리가 없다');
  assert.equal((await exchange(server, { clientId, code: issued.code, verifier: issued.verifier })).status, 200);
});

test('S7 돌아갈 주소가 틀리거나 빠지면 invalid_grant이고 되돌린다', async () => {
  const issued = await issueCode(server, member, clientId);
  assertInvalidGrant(await exchange(server, { clientId, code: issued.code, verifier: issued.verifier, redirectUri: `${CLAUDE_REDIRECT_URI}/other` }));
  await assertUnchanged(issued.code);
  // 해석: 코드를 만들 때 redirect_uri가 언제나 있으므로 교환 때 빠지면 틀린 것으로 본다.
  assertInvalidGrant(await exchange(server, { clientId, code: issued.code, verifier: issued.verifier, extra: { redirect_uri: undefined } }));
  await assertUnchanged(issued.code);
  assert.deepEqual(refused(), ['redirect_uri', 'redirect_uri']);
});

test('S7 다른 클라이언트는 invalid_grant이고 되돌린다', async () => {
  const issued = await issueCode(server, member, clientId);
  const otherClient = await insertClient(db);
  assertInvalidGrant(await exchange(server, { clientId: otherClient, code: issued.code, verifier: issued.verifier }));
  await assertUnchanged(issued.code);
  assert.deepEqual(refused(), ['client']);
});

test('S7 다른 resource는 invalid_grant이고 되돌린다. resource가 없으면 검사하지 않는다', async () => {
  const issued = await issueCode(server, member, clientId);
  assertInvalidGrant(await exchange(server, { clientId, code: issued.code, verifier: issued.verifier, resource: 'https://other.example/v1/mcp' }));
  await assertUnchanged(issued.code);
  assert.deepEqual(refused(), ['resource']);
  assert.equal((await exchange(server, { clientId, code: issued.code, verifier: issued.verifier })).status, 200);
});

test('S7 refresh_token 요청은 invalid_grant, 그 밖의 grant_type은 unsupported_grant_type이고 표가 바뀌지 않는다', async () => {
  const issued = await issueCode(server, member, clientId);
  const refresh = await exchange(server, { clientId, grantType: 'refresh_token', extra: { refresh_token: 'synthetic-refresh' } });
  assertInvalidGrant(refresh);
  const other = await exchange(server, { clientId, grantType: 'client_credentials' });
  assert.equal(other.status, 400);
  assert.equal(other.body.error, 'unsupported_grant_type');
  await assertUnchanged(issued.code);
});

test('S8 같은 회원·클라이언트로 다시 승인·교환하면 이전 토큰은 401이고 새 토큰만 통과하며 동의 시각은 처음 값이다', async () => {
  const first = await issueCode(server, member, clientId);
  const firstToken = (await exchange(server, { clientId, code: first.code, verifier: first.verifier })).body.access_token;
  const [{ consentedAt }] = await db.query('SELECT consented_at AS "consentedAt" FROM mcp_connection WHERE member_id = $1', [member.memberId]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await issueCode(server, member, clientId, { consent: undefined });
  const secondToken = (await exchange(server, { clientId, code: second.code, verifier: second.verifier })).body.access_token;
  assert.equal((await server.callTool(firstToken, 'list_my_catches')).status, 401);
  assert.equal((await server.callTool(secondToken, 'list_my_catches')).status, 200);
  const rows = await mcpRows(db, member.memberId);
  assert.equal(rows.mcp_connection, 1);
  assert.equal(rows.mcp_access_token, 1);
  const [connection] = await db.query('SELECT consented_at AS "consentedAt" FROM mcp_connection WHERE member_id = $1', [member.memberId]);
  assert.equal(connection.consentedAt.getTime(), consentedAt.getTime());
});

test('S8 교환 때 그 회원의 만료된 토큰·연결·코드를 지우고 다른 회원의 행은 그대로다', async () => {
  const other = await server.login();
  const past = new Date(Date.now() - 1000);
  for (const owner of [member.memberId, other.memberId]) {
    const expiredClient = await insertClient(db, { approvedAt: new Date() });
    await insertConnection(db, owner, expiredClient, { expiresAt: past });
    await insertToken(db, owner, expiredClient, { expiresAt: past });
    await insertCode(db, owner, expiredClient, { expiresAt: past });
  }
  const liveClient = await insertClient(db, { approvedAt: new Date() });
  const liveToken = await connectMember(db, member.memberId, { clientId: liveClient });
  const otherBefore = await mcpRows(db, other.memberId);
  const issued = await issueCode(server, member, clientId);
  assert.equal((await exchange(server, { clientId, code: issued.code, verifier: issued.verifier })).status, 200);
  // 남은 행: 살아 있는 연결·토큰, 이번 연결·토큰, 이번에 쓴 코드.
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 2, mcp_authorization_code: 1, mcp_access_token: 2 });
  assert.deepEqual(await mcpRows(db, other.memberId), otherBefore);
  assert.equal((await server.callTool(liveToken.token, 'list_my_catches')).status, 200, '다른 클라이언트의 살아 있는 토큰은 건드리지 않는다');
});

test('NUL이 든 client_id는 DB 오류가 아니라 없는 클라이언트이고 mcp_oauth_failed를 남기지 않는다', async () => {
  const response = await exchange(server, { clientId: '합성\u0000클라이언트', code: 'synthetic-unknown-code', verifier: pkcePair().verifier });
  assert.equal(response.status, 400, `응답 오류 ${response.body?.error}`);
  assert.equal(response.body.error, 'invalid_client');
  assert.deepEqual(events(server, 'mcp_oauth_failed'), []);
});

test('/token의 클라이언트 조회 중 DB가 실패하면 500이고 mcp_oauth_failed(client)를 남긴다', async (t) => {
  const issued = await issueCode(server, member, clientId);
  swapConnection(t, server.app.get(McpOAuthProvider), failingConnection());
  const response = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'server_error');
  // 클라이언트 조회가 먼저 실패하므로 그 단계 이름이다. 교환 자체의 실패는 아래 시험이 본다.
  assert.deepEqual(events(server, 'mcp_oauth_failed'), [{ event: 'mcp_oauth_failed', step: 'client', error: 'QueryFailedError' }]);
  assertNoSecrets([response.text, ...server.logs.map((log) => log.text)], { 'DB 오류 글': DB_FAILURE_MARKER, 코드: issued.code });
});

test('트랜잭션 안에서 토큰 쓰기가 실패하면 모두 되돌려 코드가 남고 mcp_oauth_failed(token)를 남긴다', async (t) => {
  const issued = await issueCode(server, member, clientId);
  const provider = server.app.get(McpOAuthProvider);
  swapConnection(t, provider, failingOn(provider.dataSource, /INSERT INTO mcp_access_token/));
  const response = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(response.status, 500);
  await assertUnchanged(issued.code);
  assert.deepEqual(events(server, 'mcp_oauth_failed'), [{ event: 'mcp_oauth_failed', step: 'token', error: 'QueryFailedError' }]);
});

test('코드 challenge 읽기 중 DB가 실패하면 500이고 mcp_oauth_failed(token)를 남긴다', async (t) => {
  const issued = await issueCode(server, member, clientId);
  const provider = server.app.get(McpOAuthProvider);
  const real = provider.dataSource;
  swapConnection(t, provider, { query: (sql, parameters) => {
    if (/code_challenge/.test(sql)) throw Object.assign(new Error(DB_FAILURE_MARKER), { name: 'QueryFailedError' });
    return real.query(sql, parameters);
  }, transaction: failingConnection().transaction });
  const response = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(response.status, 500);
  assert.deepEqual(events(server, 'mcp_oauth_failed'), [{ event: 'mcp_oauth_failed', step: 'token', error: 'QueryFailedError' }]);
});

test('토큰 수명 설정을 줄이면 연결과 토큰 행, expires_in이 같은 값을 따른다', { timeout: 30000 }, async () => {
  const short = await startMcpApp({ MCP_ACCESS_TOKEN_TTL_SECONDS: '60' });
  try {
    const owner = await short.login();
    const shortClient = await insertClient(db, { clientId: randomUUID() });
    const issued = await issueCode(short, owner, shortClient);
    const response = await exchange(short, { clientId: shortClient, code: issued.code, verifier: issued.verifier });
    assert.equal(response.body.expires_in, 60);
    const [row] = await db.query('SELECT expires_at AS "expiresAt" FROM mcp_access_token WHERE member_id = $1', [owner.memberId]);
    const remaining = row.expiresAt.getTime() - Date.now();
    assert.ok(remaining > 0 && remaining <= 60_000);
  } finally {
    await short.close();
  }
});
