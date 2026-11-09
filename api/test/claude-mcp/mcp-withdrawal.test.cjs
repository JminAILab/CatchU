// 탈퇴와 Claude 연결(기능 설계 BR7.4, W7, 계약 C-06, 시나리오 S19). 실제 DELETE /v1/me와 실제 표로 본다.
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { WEB_ORIGIN, approve, connectMember, exchange, insertClient, insertCode, issueCode, mcpRows, pkcePair, rpc, startMcpApp } = require('./support.cjs');

let server;
let db;
let fileRoot;
before(async () => {
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u6-withdrawal-files-'));
  server = await startMcpApp({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot });
  db = await openTestDataSource();
});
after(async () => {
  await server?.close();
  await db?.destroy();
  await rm(fileRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
});

const withdraw = (member) => server.call('DELETE', '/me', { token: member.token, origin: WEB_ORIGIN });
const clientExists = async (clientId) => (await db.query('SELECT 1 FROM mcp_client WHERE mcp_client_id = $1', [clientId])).length === 1;

test('S19 탈퇴하면 그 회원의 세 표 행이 지워지고 도구 호출은 401이며 승인에 쓰인 등록은 남는다', async () => {
  const member = await server.login();
  const { clientId, token } = await connectMember(db, member.memberId);
  await insertCode(db, member.memberId, clientId);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
  const response = await withdraw(member);
  assert.equal(response.status, 204, response.text);
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 0, mcp_access_token: 0 });
  const refused = await server.mcp(rpc('tools/list'), { token });
  assert.equal(refused.status, 401);
  assert.ok(refused.headers.get('www-authenticate').includes('resource_metadata='));
  assert.equal(await clientExists(clientId), true, '등록 행은 회원을 가리키지 않아 남는다');
});

test('S19 탈퇴 전에 받은 쓰지 않은 코드는 탈퇴 뒤 교환되지 않는다', async () => {
  const member = await server.login();
  const clientId = await insertClient(db);
  const issued = await issueCode(server, member, clientId);
  assert.equal((await withdraw(member)).status, 204);
  const refused = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error, 'invalid_grant');
});

test('S19 같은 계정으로 다시 가입하면 새 회원이라 상태가 NONE이고 다시 동의해야 한다', async () => {
  const identity = 'u6-rejoin-member';
  const first = await server.login(identity);
  const { clientId } = await connectMember(db, first.memberId);
  assert.equal((await server.call('GET', '/me/mcp-connection', { token: first.token })).body.state, 'ACTIVE');
  assert.equal((await withdraw(first)).status, 204);
  const second = await server.login(identity);
  assert.notEqual(second.memberId, first.memberId);
  const state = await server.call('GET', '/me/mcp-connection', { token: second.token });
  assert.equal(state.body.state, 'NONE');
  assert.equal(state.body.expiresAt, null);
  const again = await approve(server, second, { clientId, consent: undefined });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'MCP_CONSENT_REQUIRED');
});

test('S19 두 회원 거부: 한 회원의 탈퇴는 다른 회원의 연결·토큰·코드를 지우지 않는다', async () => {
  const [leaving, staying] = [await server.login(), await server.login()];
  const shared = await insertClient(db, { approvedAt: new Date() });
  await connectMember(db, leaving.memberId, { clientId: shared });
  const { token } = await connectMember(db, staying.memberId, { clientId: shared });
  await insertCode(db, staying.memberId, shared, { challenge: pkcePair().challenge });
  const before = await mcpRows(db, staying.memberId);
  assert.equal((await withdraw(leaving)).status, 204);
  assert.deepEqual(await mcpRows(db, staying.memberId), before);
  assert.equal((await server.mcp(rpc('tools/list'), { token })).status, 200);
});

test('S19 회원 행을 바로 지워도 연쇄 삭제로 세 표에 남지 않고, 탈퇴 코드가 부르는 이름이 실제 표와 같다', async () => {
  const member = await server.login();
  const { clientId } = await connectMember(db, member.memberId);
  await insertCode(db, member.memberId, clientId);
  await db.query('DELETE FROM member_account WHERE member_id = $1', [member.memberId]);
  assert.deepEqual(await mcpRows(db, member.memberId), { mcp_connection: 0, mcp_authorization_code: 0, mcp_access_token: 0 });
  // 탈퇴 코드는 표가 없으면 건너뛰므로 이름이 어긋나면 오류 없이 토큰이 남는다(BR7.4).
  for (const table of ['mcp_connection', 'mcp_authorization_code', 'mcp_access_token']) {
    assert.equal((await db.query('SELECT to_regclass($1) IS NOT NULL AS found', [table]))[0].found, true, table);
  }
});
