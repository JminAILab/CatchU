// 로그와 오류 응답(비기능 설계 observability-design 「기록 항목」, NFR1.10·NFR6.2·NFR6.3, 기능 설계 BR8.1, 시나리오 S20).
// 합성 Claude(SDK 클라이언트 흐름)로 전체 흐름을 돌리고, 로그 출력과 오류 응답에서 합성 코드·토큰·해시·state·자료 글을 문자열로 찾는다.
const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const { McpMaterialReader } = require('../../dist/claude-mcp/mcp-material-reader');
const { McpOAuthProvider, sha256Hex } = require('../../dist/claude-mcp/mcp-oauth.provider');
const { McpTools } = require('../../dist/claude-mcp/mcp-tools');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  DB_FAILURE_MARKER, WEB_ORIGIN, assertNoSecrets, connectMember, connectWithSdk, events, exchange, failingConnection, insertAnalysisRequest, insertCatch, insertClient, insertTextMaterial,
  issueCode, mcpLogs, pageOf, pkcePair, rpc, sdkClient, startMcpApp, swapConnection, toolErrorOf,
} = require('./support.cjs');

const SYNTHETIC = {
  catchTitle: 'SYNTHETIC-CATCH-TITLE',
  catchBody: 'SYNTHETIC-CATCH-CONTRIBUTION',
  materialBody: 'SYNTHETIC-MATERIAL-BODY',
  queryToken: 'SYNTHETIC-QUERY-TOKEN',
  cursor: 'SYNTHETIC-CURSOR!',
  inputName: 'SYNTHETIC_INPUT_NAME',
  inputValue: 'SYNTHETIC-INPUT-VALUE',
  foreignOrigin: 'https://synthetic-foreign-origin.example',
  dbFailure: DB_FAILURE_MARKER,
};

let server;
let db;
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
});

const loggedTexts = () => server.logs.map((log) => log.text);

async function seedMaterials(memberId) {
  const request = await insertAnalysisRequest(db, memberId);
  await insertCatch(db, memberId, request, { title: SYNTHETIC.catchTitle, subjectContribution: SYNTHETIC.catchBody });
  await insertTextMaterial(db, memberId, { body: SYNTHETIC.materialBody });
}

test('S20 합성 Claude 전체 흐름: 정상 호출에는 U6 로그가 없고, 거부를 섞어도 로그·오류 응답에 코드·토큰·해시·state·자료 글이 없다', { timeout: 60000 }, async (t) => {
  const member = await server.login();
  await seedMaterials(member.memberId);
  server.logs.length = 0;

  // 합성 Claude: 찾기 → 등록 → 승인 시작 → 회원 승인 → 토큰 교환 → initialize → tools/list → tools/call. 실제 Claude 확인이 아니다.
  const connection = await connectWithSdk(server, member);
  const accessToken = connection.tokens.access_token;
  const client = await sdkClient(server, accessToken);
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ['list_my_catches', 'list_my_text_materials']);
  const catches = await client.callTool({ name: 'list_my_catches', arguments: {} });
  assert.equal(JSON.parse(catches.content[0].text).catches[0].title, SYNTHETIC.catchTitle);
  const materials = await client.callTool({ name: 'list_my_text_materials', arguments: {} });
  assert.equal(JSON.parse(materials.content[0].text).materials[0].body, SYNTHETIC.materialBody);
  assert.deepEqual(mcpLogs(server.logs), [], '정상 호출에는 U6 로그가 없다');

  const responses = [
    await server.mcp(rpc('tools/list')), // 토큰 없음
    await server.mcp(rpc('tools/list'), { query: `?access_token=${SYNTHETIC.queryToken}` }), // 쿼리의 토큰
    await server.mcp(rpc('tools/list'), { token: SYNTHETIC.queryToken }), // 없는 토큰
    await server.mcp(rpc('tools/list'), { token: accessToken, origin: SYNTHETIC.foreignOrigin }), // 다른 Origin
    await server.callTool(accessToken, 'list_my_catches', { cursor: SYNTHETIC.cursor }), // 잘못된 cursor
    await server.callTool(accessToken, 'list_my_catches', { [SYNTHETIC.inputName]: SYNTHETIC.inputValue }), // 정의하지 않은 입력
    await exchange(server, { clientId: connection.client.client_id, code: connection.code, verifier: connection.codeVerifier }), // 코드 재사용
    await exchange(server, { clientId: connection.client.client_id, code: 'SYNTHETIC-UNKNOWN-CODE', verifier: pkcePair().verifier }), // 없는 코드
  ];
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 403, 200, 200, 400, 400]);

  // 도구 응답 둘은 입력 원문을 옮기지 않았는지, 나머지는 오류 응답이다.
  const texts = [...loggedTexts(), ...responses.map((response) => response.text),
    ...responses.map((response) => response.headers.get('www-authenticate') ?? '')];
  assertNoSecrets(texts, {
    '토큰': accessToken, '토큰 해시': sha256Hex(accessToken), '코드': connection.code, '코드 해시': sha256Hex(connection.code), 'state': connection.state,
    'PKCE 검증값': connection.codeVerifier, 'PKCE challenge': connection.codeChallenge, '쿼리의 토큰': SYNTHETIC.queryToken, '없는 코드': 'SYNTHETIC-UNKNOWN-CODE',
    'cursor': SYNTHETIC.cursor, '입력 이름': SYNTHETIC.inputName, '입력 값': SYNTHETIC.inputValue, 'Origin': SYNTHETIC.foreignOrigin,
    'Catch 제목': SYNTHETIC.catchTitle, 'Catch 글': SYNTHETIC.catchBody, '자료 글': SYNTHETIC.materialBody, '회원 ID': member.memberId,
  });
});

test('S20 사건별 칸은 관측 설계 표와 같고 수준도 같다', async (t) => {
  const member = await server.login();
  const { token, clientId } = await connectMember(db, member.memberId);

  // mcp_origin_rejected(warn, 칸 없음)
  await server.mcp(rpc('tools/list'), { token, origin: SYNTHETIC.foreignOrigin });
  // mcp_token_exchange_refused(warn, reason)
  await exchange(server, { clientId, code: 'SYNTHETIC-UNKNOWN-CODE', verifier: pkcePair().verifier });
  // mcp_rate_limited(warn, tool). 빈도 집계만 바꿔 끼운다.
  const tools = server.app.get(McpTools);
  const limiter = tools.limiter;
  tools.limiter = { allow: async () => false };
  t.after(() => { tools.limiter = limiter; });
  assert.equal(toolErrorOf(await server.callTool(token, 'list_my_catches')).error, 'RATE_LIMITED');
  tools.limiter = limiter;
  // mcp_tool_failed(error, tool·error)
  const reader = server.app.get(McpMaterialReader);
  swapConnection(t, reader, failingConnection());
  await server.callTool(token, 'list_my_text_materials');
  // mcp_token_check_failed(error, error)
  const provider = server.app.get(McpOAuthProvider);
  const realProvider = provider.dataSource;
  provider.dataSource = failingConnection();
  t.after(() => { provider.dataSource = realProvider; });
  await server.mcp(rpc('tools/list'), { token });
  // mcp_oauth_failed(error, step·error)
  await server.raw('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) });
  provider.dataSource = realProvider;

  const seen = mcpLogs(server.logs).map((log) => [log.level, log.args[0]]);
  assert.deepEqual(seen, [
    ['warn', { event: 'mcp_origin_rejected' }],
    ['warn', { event: 'mcp_token_exchange_refused', reason: 'code_missing' }],
    ['warn', { event: 'mcp_rate_limited', tool: 'list_my_catches' }],
    ['error', { event: 'mcp_tool_failed', tool: 'list_my_text_materials', error: 'QueryFailedError' }],
    ['error', { event: 'mcp_token_check_failed', error: 'QueryFailedError' }],
    ['error', { event: 'mcp_oauth_failed', step: 'register', error: 'QueryFailedError' }],
  ]);
  assertNoSecrets(loggedTexts(), { 'DB 오류 글': SYNTHETIC.dbFailure, '토큰': token, '회원 ID': member.memberId, 'Origin': SYNTHETIC.foreignOrigin });
});

test('S20 오류 이름은 형식을 확인한 값만 남긴다', async (t) => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  swapConnection(t, server.app.get(McpMaterialReader), failingConnection('bad name; SYNTHETIC-UNSAFE-NAME'));
  await server.callTool(token, 'list_my_catches');
  assert.deepEqual(events(server, 'mcp_tool_failed'), [{ event: 'mcp_tool_failed', tool: 'list_my_catches', error: 'Error' }]);
  assertNoSecrets(loggedTexts(), { '오류 이름': 'SYNTHETIC-UNSAFE-NAME' });
});

test('S20 승인·토큰 발급이 끝나도 코드·토큰이 로그에 남지 않고, 승인 응답 밖으로 코드가 나가지 않는다', async () => {
  const member = await server.login();
  const clientId = await insertClient(db);
  const issued = await issueCode(server, member, clientId);
  const exchanged = await exchange(server, { clientId, code: issued.code, verifier: issued.verifier });
  assert.equal(exchanged.status, 200, exchanged.text);
  const accessToken = exchanged.body.access_token;
  pageOf(await server.callTool(accessToken, 'list_my_catches'));
  assert.deepEqual(mcpLogs(server.logs), []);
  assertNoSecrets(loggedTexts(), { 코드: issued.code, 토큰: accessToken, state: issued.state });
  const status = await server.call('GET', '/me/mcp-connection', { token: member.token });
  assertNoSecrets([status.text], { 코드: issued.code, 토큰: accessToken, '코드 해시': sha256Hex(issued.code), '토큰 해시': sha256Hex(accessToken) });
  assert.ok(status.text.includes('"state":"ACTIVE"'), status.text);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  // 웹 출처 요청의 응답도 같은 값이다.
  assert.equal((await server.call('GET', '/me/mcp-connection', { token: member.token, origin: WEB_ORIGIN })).text, status.text);
});

test('전송을 닫다 실패하면 프로세스를 멈추지 않고 mcp_transport_close_failed에 오류 이름만 남긴다', async (t) => {
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const tools = server.app.get(McpTools);
  const forMember = tools.forMember;
  tools.forMember = (memberId) => {
    const pair = forMember.call(tools, memberId);
    const close = pair.transport.close.bind(pair.transport);
    pair.transport.close = async () => {
      await close();
      throw Object.assign(new Error(DB_FAILURE_MARKER), { name: 'SyntheticCloseError' });
    };
    return pair;
  };
  t.after(() => { tools.forMember = forMember; });
  const response = await server.mcp(rpc('tools/list'), { token });
  assert.equal(response.status, 200, response.text);
  const started = Date.now();
  while (events(server, 'mcp_transport_close_failed').length === 0 && Date.now() - started < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(events(server, 'mcp_transport_close_failed'), [{ event: 'mcp_transport_close_failed', error: 'SyntheticCloseError' }]);
  assert.equal(server.logs.find((log) => log.args[0]?.event === 'mcp_transport_close_failed').level, 'error');
  assertNoSecrets(loggedTexts(), { '오류 글': DB_FAILURE_MARKER });
});
