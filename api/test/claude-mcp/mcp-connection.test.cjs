// 연결 상태·승인·전체 해제(기능 설계 BR3.2~BR3.7·BR7.1~BR7.3, 비기능 NFR1.7, 시나리오 S6·S17·S18). 실제 AppModule·Guard·테스트 DB를 쓴다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { McpConnectionService } = require('../../dist/claude-mcp/mcp-connection.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  AUTHORIZATIONS_PATH, CLAUDE_REDIRECT_URI, DB_FAILURE_MARKER, DEV_REDIRECT_URI, WEB_ORIGIN, approve, assertNoSecrets, connectMember, exchange, failingConnection, failingOn, inDays,
  insertClient, insertCode, insertConnection, issueCode, mcpRows, pkcePair, rpc, sha256Hex, startMcpApp, swapConnection,
} = require('./support.cjs');

const CONNECTION_PATH = '/me/mcp-connection';
let server;
let db;
let member;
let clientId;
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
  member = await server.login();
  clientId = await insertClient(db);
});

// 실패 메시지에 응답 글을 싣지 않는다. 뜻밖의 200이면 그 글에 코드가 들어 있다.
function expectError(response, status, code) {
  assert.equal(response.status, status, `응답 코드 ${response.body?.code}`);
  assert.equal(response.body.code, code);
}

const disconnect = (who = member, origin = WEB_ORIGIN) => server.call('DELETE', CONNECTION_PATH, { token: who.token, origin });
const status = (who = member) => server.call('GET', CONNECTION_PATH, { token: who.token });
const codes = (memberId = member.memberId) => db.query('SELECT code_hash AS "codeHash", consented_at AS "consentedAt", redirect_uri AS "redirectUri", code_challenge AS "codeChallenge", resource FROM mcp_authorization_code WHERE member_id = $1', [memberId]);
const approvedAt = async (id = clientId) => (await db.query('SELECT approved_at AS "approvedAt" FROM mcp_client WHERE mcp_client_id = $1', [id]))[0].approvedAt;

test('S6 연결 행이 없고 consent가 없으면 409 MCP_CONSENT_REQUIRED이고 코드를 만들지 않는다', async () => {
  for (const consent of [undefined, false]) {
    expectError(await approve(server, member, { clientId, consent }), 409, 'MCP_CONSENT_REQUIRED');
  }
  assert.deepEqual(await codes(), []);
  assert.equal(await approvedAt(), null);
});

test('S6 동의와 승인: 200 JSON의 redirectTo에 code·state가 붙고(302 아님) 표에는 해시만 있으며 approved_at을 채운다', async () => {
  const { challenge } = pkcePair();
  const state = `synthetic state/${randomUUID()}&=`;
  const before = Date.now();
  const response = await approve(server, member, { clientId, state, challenge, resource: server.mcpUrl, consent: true });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(Object.keys(response.body), ['redirectTo']);
  const target = new URL(response.body.redirectTo);
  assert.equal(`${target.origin}${target.pathname}`, CLAUDE_REDIRECT_URI);
  assert.equal(target.searchParams.get('state'), state);
  const code = target.searchParams.get('code');
  assert.ok(code.length >= 43, '32바이트 난수다');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const [row] = await codes();
  assert.equal(row.codeHash, sha256Hex(code));
  assert.equal(row.codeChallenge, challenge);
  assert.equal(row.redirectUri, CLAUDE_REDIRECT_URI);
  assert.equal(row.resource, server.mcpUrl);
  assert.ok(row.consentedAt.getTime() >= before - 1000 && row.consentedAt.getTime() <= Date.now() + 1000);
  assert.notEqual(await approvedAt(), null);
  const [{ remaining }] = await db.query("SELECT extract(epoch FROM expires_at - now()) AS remaining FROM mcp_authorization_code WHERE member_id = $1", [member.memberId]);
  assert.ok(Number(remaining) > 290 && Number(remaining) <= 300, '코드는 5분이다');
});

test('S6 이미 승인에 쓰인 등록으로 다시 승인하면 새 코드를 만들고 approved_at은 처음 값 그대로다', async () => {
  const firstApproval = new Date(Date.now() - 60_000);
  const usedClient = await insertClient(db, { approvedAt: firstApproval });
  const first = await issueCode(server, member, usedClient);
  const second = await issueCode(server, member, usedClient);
  assert.notEqual(first.code, second.code);
  assert.equal((await codes()).length, 2);
  assert.equal((await approvedAt(usedClient)).getTime(), firstApproval.getTime());
});

test('S6 재승인(EXPIRED·ACTIVE)은 동의 없이 코드를 만들고 동의 시각은 그 회원의 처음 값을 잇는다', async () => {
  const consentedAt = new Date('2026-10-01T00:00:00.000Z');
  const oldClient = await insertClient(db, { approvedAt: consentedAt });
  await insertConnection(db, member.memberId, oldClient, { consentedAt, expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await status()).body.state, 'EXPIRED');
  const response = await approve(server, member, { clientId, consent: undefined });
  assert.equal(response.status, 200, response.text);
  assert.equal((await codes())[0].consentedAt.getTime(), consentedAt.getTime(), '새 클라이언트로 등록해도 회원 단위로 동의를 잇는다');
  await insertConnection(db, member.memberId, clientId, { consentedAt: new Date('2026-10-20T00:00:00.000Z') });
  await approve(server, member, { clientId, consent: undefined });
  for (const row of await codes()) assert.equal(row.consentedAt.getTime(), consentedAt.getTime(), '행이 여럿이면 가장 이른 동의다');
});

test('S6 거절: redirectTo에 access_denied와 state만 붙고 표가 바뀌지 않는다', async () => {
  const response = await approve(server, member, { clientId, state: 'synthetic-state', decision: 'DENY', consent: true });
  assert.equal(response.status, 200, response.text);
  const target = new URL(response.body.redirectTo);
  assert.deepEqual(Object.fromEntries(target.searchParams), { error: 'access_denied', state: 'synthetic-state' });
  assert.deepEqual(await codes(), []);
  assert.equal(await approvedAt(), null);
  const withoutState = await approve(server, member, { clientId, decision: 'DENY' });
  assert.deepEqual(Object.fromEntries(new URL(withoutState.body.redirectTo).searchParams), { error: 'access_denied' });
});

test('S6 로그인이 없거나 만료된 토큰이면 401이고 코드를 만들지 않는다', async () => {
  const body = { clientId, redirectUri: CLAUDE_REDIRECT_URI, codeChallenge: pkcePair().challenge, decision: 'APPROVE', consent: true };
  expectError(await server.call('POST', AUTHORIZATIONS_PATH, { origin: WEB_ORIGIN, body }), 401, 'AUTH_REQUIRED');
  expectError(await server.call('POST', AUTHORIZATIONS_PATH, { origin: WEB_ORIGIN, body, token: 'synthetic-invalid-token' }), 401, 'AUTH_INVALID');
  assert.deepEqual(await codes(), []);
});

test('S6 클라이언트·돌아갈 주소·resource가 틀리면 승인·취소 모두 400 MCP_AUTHORIZATION_INVALID이고 코드가 그 주소로 나가지 않는다', async () => {
  const devClient = await insertClient(db, { redirectUris: [DEV_REDIRECT_URI] });
  const removedFromAllowed = 'https://claude.ai/api/mcp/old_callback';
  const staleClient = await insertClient(db, { redirectUris: [removedFromAllowed] });
  const cases = [
    { clientId: randomUUID() }, // 없는 클라이언트
    { clientId, redirectUri: 'https://evil.example/callback' }, // 등록에 없는 주소
    { clientId, redirectUri: `${CLAUDE_REDIRECT_URI}?a=1` }, // 정확히 일치하지 않음
    { clientId, redirectUri: DEV_REDIRECT_URI }, // 허용 목록에는 있지만 이 등록에 없음
    { clientId: devClient, redirectUri: 'http://127.0.0.1:9999/oauth/callback' }, // 포트만 다른 loopback
    { clientId: staleClient, redirectUri: removedFromAllowed }, // 등록에는 있지만 지금 허용 목록에 없음
    { clientId, resource: 'https://other.example/v1/mcp' }, // 다른 resource
  ];
  for (const request of cases) {
    for (const decision of ['APPROVE', 'DENY']) {
      expectError(await approve(server, member, { ...request, decision, consent: true }), 400, 'MCP_AUTHORIZATION_INVALID');
    }
  }
  assert.deepEqual(await codes(), []);
  assert.equal(await approvedAt(), null);
});

test('S6 두 회원 거부: 정의하지 않은 필드와 틀린 형식은 400 VALIDATION_FAILED이고 회원을 본문으로 바꿀 수 없다', async () => {
  const other = await server.login();
  const invalid = [
    { extra: { memberId: other.memberId } },
    { extra: { clientName: '합성 이름' } },
    { extra: { decision: 'MAYBE' } },
    { extra: { consent: 'yes' } },
    { extra: { state: null } },
    { extra: { resource: 1 } },
    { extra: { codeChallenge: '' } },
    { extra: { clientId: '' } },
    { extra: { redirectUri: 7 } },
    // NUL은 text 칸의 DB 오류가 되므로 500이 아니라 형식 오류다. resource는 fragment를 빼고 비교하므로 NUL이 fragment에 있으면 저장까지 간다.
    { extra: { clientId: '합성\u0000클라이언트' } },
    { extra: { codeChallenge: '합성\u0000챌린지' } },
    { extra: { resource: `${server.mcpUrl}#합성\u0000` } },
  ];
  for (const request of invalid) {
    expectError(await approve(server, member, { clientId, consent: true, ...request }), 400, 'VALIDATION_FAILED');
  }
  expectError(await server.call('POST', `${AUTHORIZATIONS_PATH}?memberId=${other.memberId}`, { token: member.token, origin: WEB_ORIGIN,
    body: { clientId, redirectUri: CLAUDE_REDIRECT_URI, codeChallenge: 'x', decision: 'APPROVE', consent: true } }), 400, 'VALIDATION_FAILED');
  assert.deepEqual(await codes(), []);
  assert.deepEqual(await codes(other.memberId), []);
});

test('BR3.7 확인 뒤 정리로 등록 행이 지워졌으면 MCP_AUTHORIZATION_INVALID이고 코드가 남지 않는다', async (t) => {
  const service = server.app.get(McpConnectionService);
  const original = service.existingConsent;
  // 다시 확인과 트랜잭션 사이에 정리가 끝난 경우를 만든다.
  service.existingConsent = async (memberId) => {
    await db.query('DELETE FROM mcp_client WHERE mcp_client_id = $1', [clientId]);
    return original.call(service, memberId);
  };
  t.after(() => { service.existingConsent = original; });
  expectError(await approve(server, member, { clientId, consent: true }), 400, 'MCP_AUTHORIZATION_INVALID');
  assert.deepEqual(await codes(), []);
});

test('BR3.7 코드 쓰기가 실패하면 트랜잭션이 되돌아가 approved_at도 코드도 남지 않고 500이다', async (t) => {
  const service = server.app.get(McpConnectionService);
  swapConnection(t, service, failingOn(service.dataSource, /INSERT INTO mcp_authorization_code/));
  const response = await approve(server, member, { clientId, consent: true });
  expectError(response, 500, 'INTERNAL_ERROR');
  assert.equal(await approvedAt(), null);
  assert.deepEqual(await codes(), []);
  assertNoSecrets([response.text, ...server.logs.map((log) => log.text)], { 'DB 오류 글': DB_FAILURE_MARKER });
});

test('S17 전체 해제: 204이고 반복해도 같으며 토큰은 401, 그 회원의 연결·토큰·쓰지 않은 코드가 없다', async () => {
  const issued = await issueCode(server, member, clientId);
  const { token } = await connectMember(db, member.memberId);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
  const first = await disconnect();
  assert.equal(first.status, 204, first.text);
  assert.equal(first.text, '');
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 0, mcp_access_token: 0 });
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 401);
  assert.equal((await disconnect()).status, 204, '반복해도 같다');
  const refused = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, 'invalid_grant', '쓰지 않은 코드는 교환되지 않는다');
  assert.equal((await status()).body.state, 'NONE');
  expectError(await approve(server, member, { clientId, consent: undefined }), 409, 'MCP_CONSENT_REQUIRED');
});

test('S17 쓴 코드 행은 남고(다시 토큰으로 바꿀 수 없다) 쓰지 않은 코드만 지운다', async () => {
  const pkce = pkcePair();
  const used = await insertCode(db, member.memberId, clientId, { challenge: pkce.challenge, usedAt: new Date() });
  await insertCode(db, member.memberId, clientId);
  assert.equal((await disconnect()).status, 204);
  const rows = await codes();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].codeHash, sha256Hex(used));
  const refused = await exchange(server, { clientId, code: used, verifier: pkce.verifier });
  assert.equal(refused.body.error, 'invalid_grant');
});

test('S17 두 회원 거부: B의 해제는 A의 연결·토큰·코드를 바꾸지 않고 A의 토큰은 그대로 통과한다', async () => {
  const other = await server.login();
  const { token } = await connectMember(db, member.memberId);
  await insertCode(db, member.memberId, clientId);
  const before = await mcpRows(db, member.memberId);
  const otherConnection = await connectMember(db, other.memberId);
  assert.equal((await disconnect(other)).status, 204);
  assert.deepEqual(await mcpRows(db, member.memberId), before);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
  assert.equal((await server.mcp(rpc('tools/list'), { token: otherConnection.token })).status, 401);
});

test('S17 겹침: 교환이 코드 행을 잡고 멈춘 동안 해제를 보내도 끝나면 토큰·연결이 남지 않는다', { timeout: 30000 }, async () => {
  const issued = await issueCode(server, member, clientId);
  // 다른 연결이 회원 행을 FOR UPDATE로 잡아 실제 교환을 연결 쓰기(외래 키 확인)에서 멈춘다.
  const holder = db.createQueryRunner();
  await holder.connect();
  await holder.startTransaction();
  try {
    await holder.query('SELECT member_id FROM member_account WHERE member_id = $1 FOR UPDATE', [member.memberId]);
    const pendingExchange = exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
    await waitForBlocked(1);
    const pendingDisconnect = disconnect();
    await waitForBlocked(2);
    await holder.commitTransaction();
    const [exchanged, disconnected] = await Promise.all([pendingExchange, pendingDisconnect]);
    assert.equal(exchanged.status, 200, exchanged.text);
    assert.equal(disconnected.status, 204, disconnected.text);
    const rows = await mcpRows(db, member.memberId);
    assert.equal(rows.mcp_access_token, 0, '토큰이 남지 않는다');
    assert.equal(rows.mcp_connection, 0, '연결이 남지 않는다');
    assert.equal(rows.mcp_authorization_code, 1, '쓴 코드 행은 남는다');
    assert.equal((await server.mcp(rpc('tools/list'), { token: exchanged.body.access_token })).status, 401);
  } finally {
    if (holder.isTransactionActive) await holder.rollbackTransaction();
    await holder.release();
  }
});

test('S17 겹침의 반대 순서: 해제가 먼저 끝나면 교환은 코드를 찾지 못해 invalid_grant이고 토큰이 생기지 않는다', async () => {
  const issued = await issueCode(server, member, clientId);
  assert.equal((await disconnect()).status, 204);
  const refused = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(refused.body.error, 'invalid_grant');
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 0, mcp_access_token: 0 });
});

test('BR7.2 해제 중 DB가 실패하면 500이고 트랜잭션이 되돌아가 행이 그대로다', async (t) => {
  const { token } = await connectMember(db, member.memberId);
  await insertCode(db, member.memberId, clientId);
  const before = await mcpRows(db, member.memberId);
  const service = server.app.get(McpConnectionService);
  swapConnection(t, service, failingOn(service.dataSource, /DELETE FROM mcp_connection/));
  expectError(await disconnect(), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await mcpRows(db, member.memberId), before);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200, '실패하면 토큰이 그대로라 해제됐다고 보이면 안 된다');
});

test('S18 상태: 행 없음은 NONE, 만료 전은 ACTIVE, 모두 만료는 EXPIRED, 일부만 만료는 ACTIVE이고 mcpUrl은 공개 주소다', async () => {
  const expected = { mcpUrl: server.mcpUrl };
  assert.deepEqual((await status()).body, { state: 'NONE', expiresAt: null, ...expected });

  const past = new Date('2026-10-01T00:00:00.000Z');
  const expiredClient = await insertClient(db, { approvedAt: past });
  await insertConnection(db, member.memberId, expiredClient, { expiresAt: past });
  assert.deepEqual((await status()).body, { state: 'EXPIRED', expiresAt: past.toISOString(), ...expected });

  const future = inDays(3);
  const liveClient = await insertClient(db, { approvedAt: past });
  await insertConnection(db, member.memberId, liveClient, { expiresAt: future });
  assert.deepEqual((await status()).body, { state: 'ACTIVE', expiresAt: future.toISOString(), ...expected }, '일부만 만료면 가장 늦은 만료');

  await db.query('DELETE FROM mcp_connection WHERE mcp_client_id = $1', [expiredClient]);
  assert.deepEqual((await status()).body, { state: 'ACTIVE', expiresAt: future.toISOString(), ...expected });
  const other = await server.login();
  assert.equal((await status(other)).body.state, 'NONE', '다른 회원의 행은 보지 않는다');
});

test('S18 조회는 로그인이 필요하고 입력을 받지 않으며 출처를 보지 않는다', async () => {
  expectError(await server.call('GET', CONNECTION_PATH), 401, 'AUTH_REQUIRED');
  expectError(await server.call('GET', `${CONNECTION_PATH}?memberId=${randomUUID()}`, { token: member.token }), 400, 'VALIDATION_FAILED');
  const foreign = await server.call('GET', CONNECTION_PATH, { token: member.token, origin: 'https://foreign-origin.example' });
  assert.equal(foreign.status, 200, foreign.text);
  assert.equal(foreign.headers.get('cache-control'), 'no-store');
});

test('S18 웹 로그아웃은 연결을 끊지 않아 도구가 통과한다', async () => {
  const { token } = await connectMember(db, member.memberId);
  const before = await mcpRows(db, member.memberId);
  const logout = await server.raw('/v1/auth/logout', { method: 'POST', headers: { Origin: WEB_ORIGIN, Cookie: member.cookie } });
  assert.equal(logout.status, 204, logout.text);
  expectError(await status(), 401, 'AUTH_INVALID');
  assert.deepEqual(await mcpRows(db, member.memberId), before);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
});

test('NFR1.7 승인·해제는 허용 출처가 아니면 403이고 행이 바뀌지 않는다', async () => {
  const { token } = await connectMember(db, member.memberId);
  await insertCode(db, member.memberId, clientId);
  const before = await mcpRows(db, member.memberId);
  for (const origin of ['https://foreign-origin.example', null]) {
    expectError(await approve(server, member, { clientId, consent: true, origin }), 403, 'AUTH_ORIGIN_FORBIDDEN');
    expectError(await approve(server, member, { clientId, decision: 'DENY', origin }), 403, 'AUTH_ORIGIN_FORBIDDEN');
    expectError(await server.call('DELETE', CONNECTION_PATH, { token: member.token, origin }), 403, 'AUTH_ORIGIN_FORBIDDEN');
  }
  assert.deepEqual(await mcpRows(db, member.memberId), before);
  assert.equal(await approvedAt(), null);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
});

test('해제는 본문·쿼리를 받지 않는다. 조회·승인·해제의 DB 실패는 500 INTERNAL_ERROR다', async (t) => {
  expectError(await server.call('DELETE', CONNECTION_PATH, { token: member.token, origin: WEB_ORIGIN, body: { all: true } }), 400, 'VALIDATION_FAILED');
  expectError(await server.call('DELETE', `${CONNECTION_PATH}?all=1`, { token: member.token, origin: WEB_ORIGIN }), 400, 'VALIDATION_FAILED');
  swapConnection(t, server.app.get(McpConnectionService), failingConnection());
  expectError(await status(), 500, 'INTERNAL_ERROR');
  expectError(await approve(server, member, { clientId, consent: true }), 500, 'INTERNAL_ERROR');
  expectError(await disconnect(), 500, 'INTERNAL_ERROR');
});

/** 잠금을 기다리는 시험 DB 연결이 count개 이상이 될 때까지 기다린다. */
async function waitForBlocked(count) {
  const started = Date.now();
  for (;;) {
    const [{ waiting }] = await db.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
    if (waiting >= count) return;
    assert.ok(Date.now() - started < 10000, `잠금 대기 ${count}개를 기다리다 시간이 지났다(지금 ${waiting}개)`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
