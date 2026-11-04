// /v1/mcp 처리기(기능 설계 BR4.7·BR4.8·BR5.1·BR5.6, 비기능 설계 security-design 「/v1/mcp 요청이 지나는 순서」, NFR1.1·NFR1.2·NFR1.6·NFR1.10, 시나리오 S1·S9·S13).
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { McpOAuthProvider } = require('../../dist/claude-mcp/mcp-oauth.provider');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  DB_FAILURE_MARKER, WEB_ORIGIN, assertNoSecrets, connectMember, events, failingConnection, insertClient, insertConnection, insertToken, rpc, startMcpApp, swapConnection,
} = require('./support.cjs');

const ALLOWED_TOOLS = ['list_my_catches', 'list_my_text_materials'];
let server;
let db;
let metadataUrl;
before(async () => {
  server = await startMcpApp();
  db = await openTestDataSource();
  metadataUrl = `${server.origin}/.well-known/oauth-protected-resource/v1/mcp`;
});
after(async () => {
  await server?.close();
  await db?.destroy();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
});

const list = (token, options = {}) => server.mcp(rpc('tools/list'), { token, ...options });

function assertUnauthorized(response) {
  assert.equal(response.status, 401, response.text);
  const challenge = response.headers.get('www-authenticate');
  assert.match(challenge, /^Bearer /);
  assert.ok(challenge.includes(`resource_metadata="${metadataUrl}"`), challenge);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return challenge;
}

test('S1 토큰 없는 POST는 401이고 WWW-Authenticate에 공개 주소의 resource_metadata가 있다', async () => {
  const response = await server.mcp(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: '합성', version: '1' } }));
  assertUnauthorized(response);
  assert.equal(events(server, 'mcp_token_check_failed').length, 0);
});

test('S9 없는 토큰·만료·연결 삭제·회원 상태 실패는 상태·WWW-Authenticate·본문이 글자까지 같다', async () => {
  const unknownMember = await server.login();
  const unknown = await list(randomBytes(32).toString('base64url'));

  const expiredMember = await server.login();
  const expiredClient = await insertClient(db);
  await insertConnection(db, expiredMember.memberId, expiredClient);
  const expired = await list(await insertToken(db, expiredMember.memberId, expiredClient, { expiresAt: new Date(Date.now() - 1000) }));

  const removed = await connectMember(db, unknownMember.memberId);
  await db.query('DELETE FROM mcp_connection WHERE member_id = $1', [unknownMember.memberId]);
  const afterDisconnect = await list(removed.token);

  const inactiveMember = await server.login();
  const inactive = await connectMember(db, inactiveMember.memberId);
  await db.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [inactiveMember.memberId]);
  const notActive = await list(inactive.token);

  const results = [unknown, expired, afterDisconnect, notActive];
  const challenges = results.map(assertUnauthorized);
  assert.equal(new Set(challenges).size, 1, '이유를 구분해 알리지 않는다');
  assert.equal(new Set(results.map((result) => result.text)).size, 1);
  assert.deepEqual(events(server, 'mcp_token_check_failed'), [], '토큰 실패는 로그를 쌓지 않는다');
});

test('S9 만료 시각이 지나면 거부하고 앞이면 통과한다', async () => {
  const member = await server.login();
  const justInTime = await connectMember(db, member.memberId, { expiresAt: new Date(Date.now() + 2000) });
  assert.equal((await list(justInTime.token)).status, 200);
  await db.query("UPDATE mcp_access_token SET expires_at = now() - interval '1 millisecond' WHERE member_id = $1", [member.memberId]);
  assertUnauthorized(await list(justInTime.token));
});

test('S9 헤더 없음·형식 틀림·쿼리 토큰도 401이고 resource_metadata가 있다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assertUnauthorized(await server.mcp(rpc('tools/list')));
  assertUnauthorized(await server.mcp(rpc('tools/list'), { headers: { Authorization: `Token ${token}` } }));
  assertUnauthorized(await server.mcp(rpc('tools/list'), { headers: { Authorization: 'Bearer' } }));
  assertUnauthorized(await server.mcp(rpc('tools/list'), { query: `?access_token=${token}` }));
});

test('S9 토큰 확인 중 DB가 실패하면 401로 숨기지 않고 500과 mcp_token_check_failed를 남긴다', async (t) => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  swapConnection(t, server.app.get(McpOAuthProvider), failingConnection());
  const response = await list(token);
  assert.equal(response.status, 500, response.text);
  assert.equal(response.headers.get('www-authenticate'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(events(server, 'mcp_token_check_failed'), [{ event: 'mcp_token_check_failed', error: 'QueryFailedError' }]);
  assertNoSecrets([response.text, ...server.logs.map((log) => log.text)], { 'DB 오류 글': DB_FAILURE_MARKER, 토큰: token });
});

test('NFR1.2 회원 Access 토큰은 /v1/mcp에서 401이고 MCP 토큰은 회원 API에서 401이다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assertUnauthorized(await list(member.token));
  const memberApi = await server.call('GET', '/me', { token });
  assert.equal(memberApi.status, 401, memberApi.text);
  assert.equal(memberApi.body.code, 'AUTH_INVALID');
});

test('S13 tools/list는 도구 둘뿐이고 title·readOnlyHint가 있으며 입력은 cursor뿐이다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const response = await list(token);
  assert.equal(response.status, 200, response.text);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store', 'NFR1.10');
  assert.equal(response.headers.get('mcp-session-id'), null, '세션을 만들지 않는다');
  const { tools } = response.body.result;
  assert.deepEqual(tools.map((tool) => tool.name), ALLOWED_TOOLS);
  for (const tool of tools) {
    assert.ok(tool.title);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.deepEqual(Object.keys(tool.inputSchema.properties), ['cursor']);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.inputSchema.required ?? [], []);
    assert.equal(tool.outputSchema, undefined);
  }
});

test('S13 없는 도구는 MCP 오류이고 자료를 돌려주지 않는다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const response = await server.callTool(token, 'write_catch', { title: '합성' });
  assert.equal(response.status, 200, response.text);
  const { result, error } = response.body;
  assert.ok(error !== undefined || result.isError === true, response.text);
  assert.ok(response.text.includes('write_catch') && !response.text.includes('catches'));
});

test('S13 GET·DELETE는 Origin 확인 뒤 405이고 Allow: POST다. 토큰이 있어도 같다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  for (const method of ['GET', 'DELETE']) {
    for (const headers of [{}, { Authorization: `Bearer ${token}` }]) {
      const response = await server.raw('/v1/mcp', { method, headers });
      assert.equal(response.status, 405, `${method} ${response.text}`);
      assert.equal(response.headers.get('allow'), 'POST');
      assert.equal(response.headers.get('mcp-session-id'), null);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('NFR1.6 다른 Origin은 토큰 유무·메서드와 상관없이 403이고 mcp_origin_rejected를 남기며 값을 로그에 넣지 않는다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const foreign = 'https://foreign-origin.example';
  const responses = [
    await list(token, { origin: foreign }),
    await list(undefined, { origin: foreign }),
    await server.raw('/v1/mcp', { method: 'GET', headers: { Origin: foreign } }),
    await server.raw('/v1/mcp', { method: 'DELETE', headers: { Origin: foreign, Authorization: `Bearer ${token}` } }),
    await list(token, { origin: WEB_ORIGIN }), // web 출처도 공개 주소가 아니면 허용하지 않는다(시험의 공개 주소는 api 서버다)
  ];
  for (const response of responses) {
    assert.equal(response.status, 403, response.text);
    assert.equal(response.body.code, 'AUTH_ORIGIN_FORBIDDEN');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(events(server, 'mcp_origin_rejected'), responses.map(() => ({ event: 'mcp_origin_rejected' })));
  assertNoSecrets(server.logs.map((log) => log.text), { Origin: foreign });
});

test('NFR1.6 Origin이 없거나 공개 주소와 같으면 통과한다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assert.equal((await list(token)).status, 200);
  assert.equal((await list(token, { origin: server.origin })).status, 200);
  assert.equal((await server.raw('/v1/mcp', { method: 'GET', headers: { Origin: server.origin } })).status, 405);
  assert.deepEqual(events(server, 'mcp_origin_rejected'), []);
});

test('토큰을 통과한 요청의 형식 오류: Accept가 맞지 않으면 406, JSON이 아니면 415, 토큰이 없으면 먼저 401이다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assert.equal((await server.mcp(rpc('tools/list'), { token, accept: 'text/plain' })).status, 406);
  assert.equal((await server.mcp('{}', { token, contentType: 'text/plain' })).status, 415);
  assertUnauthorized(await server.mcp(rpc('tools/list'), { accept: 'text/plain' }));
});

test('본문 상한 100KB를 넘으면 앱 파서가 400 INVALID_REQUEST로 거부하고 도구를 부르지 않는다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const large = rpc('tools/call', { name: 'list_my_catches', arguments: { cursor: 'A'.repeat(110 * 1024) } });
  const response = await server.mcp(large, { token });
  assert.equal(response.status, 400, response.text.slice(0, 200));
  assert.equal(response.body.code, 'INVALID_REQUEST');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('묶음 2개는 응답도 2개이고 요청마다 새 서버라 다음 요청에 상태가 남지 않는다', async () => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const response = await server.mcp([rpc('tools/list', {}, 1), rpc('tools/call', { name: 'list_my_catches', arguments: {} }, 2)], { token });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.map((item) => item.id).sort(), [1, 2]);
  const next = await list(token);
  assert.equal(next.status, 200, next.text);
  assert.equal(next.headers.get('mcp-session-id'), null);
});
