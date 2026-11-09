// 12월 intent U6 시험 공용 도우미. 시험 파일이 아니다(이름이 .test.cjs로 끝나지 않아 실행기가 따로 돌리지 않는다).
// 회원·자료·토큰은 모두 합성이고 실제 Claude·외부 서비스에 연결하지 않는다. 합성 Claude는 SDK 클라이언트 흐름을 따를 뿐 실제 Claude 동작의 증거가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const auth = require('@modelcontextprotocol/sdk/client/auth.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { CLAUDE_REDIRECT_URI } = require('../../dist/claude-mcp/mcp-config');
const { sha256Hex } = require('../../dist/claude-mcp/mcp-oauth.provider');
const { AnalysisAttempt, AnalysisConsent, AnalysisRequest } = require('../../dist/member-analysis/member-analysis.entity');
const { ensureRegistration } = require('../support/registered-analysis.cjs');
const { APP_SETTINGS, WEB_ORIGIN, collectingLogger, setEnv } = require('../u2/support.cjs');

/** 개발 목록 시험에 쓰는 합성 loopback 콜백(MCP_DEV_REDIRECT_URIS). */
const DEV_REDIRECT_URI = 'http://127.0.0.1:6274/oauth/callback';
/** DB 실패 대역의 오류 글. 응답·로그에 나오면 안 된다. */
const DB_FAILURE_MARKER = 'SYNTHETIC-DB-FAILURE-DETAIL';
const AUTHORIZATIONS_PATH = '/me/mcp-connection/authorizations';
const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days) => new Date(Date.now() + days * DAY_MS);

async function unusedPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function readResponse(response) {
  const text = await response.text();
  let body = null;
  if (text !== '') {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  return { status: response.status, headers: response.headers, text, body };
}

/**
 * 실제 AppModule·configureApp·전역 Guard·오류 필터로 앱을 띄운다. 비어 있는 포트를 먼저 정해 PORT로 넘겨
 * 공개 주소 기본값(http://127.0.0.1:{PORT})이 이 서버를 가리키게 한다. env로 설정을 더하거나(값) 지운다(undefined).
 */
async function startMcpApp(env = {}) {
  const logs = [];
  const port = await unusedPort();
  const restore = setEnv({ ...APP_SETTINGS, CATCHU_QUEUE_REDIS_URL: undefined, MCP_DEV_PUBLIC_ORIGIN: undefined, MCP_DEV_REDIRECT_URIS: undefined,
    MCP_ACCESS_TOKEN_TTL_SECONDS: undefined, PORT: String(port), ...env });
  let app;
  try {
    app = await configureApp(await NestFactory.create(AppModule, { logger: collectingLogger(logs), abortOnError: false }));
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    await app?.close();
    restore();
    throw error;
  }
  const origin = `http://127.0.0.1:${port}`;
  const mcpUrl = `${origin}/v1/mcp`;

  /** 앱 루트 경로를 그대로 부른다(OAuth 주소). 이동은 따라가지 않는다. */
  const raw = async (path, init = {}) => readResponse(await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init }));

  /** /v1 아래를 회원 토큰으로 부른다. */
  function call(method, path, { token, body, origin: requestOrigin, headers = {} } = {}) {
    const merged = { ...headers };
    if (token) merged.Authorization = `Bearer ${token}`;
    if (requestOrigin) merged.Origin = requestOrigin;
    if (body !== undefined) merged['Content-Type'] = 'application/json';
    return raw(`/v1${path}`, { method, headers: merged, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  /** 개발 로그인으로 회원과 세션을 만든다. */
  async function login(identity = `u6-member-${randomUUID()}`) {
    const response = await call('POST', '/auth/dev-login', { body: { memberId: identity } });
    assert.equal(response.status, 200, response.text);
    const decoded = decodeJwt(response.body.accessToken);
    return { token: response.body.accessToken, memberId: decoded.sub, cookie: response.headers.get('set-cookie').split(';')[0] };
  }

  /** POST /v1/mcp. 기본 머리글은 Streamable HTTP 클라이언트가 보내는 값이다. payload가 문자열이면 그대로 보낸다. */
  function mcp(payload, { token, origin: requestOrigin, accept = 'application/json, text/event-stream', contentType = 'application/json', query = '', headers = {} } = {}) {
    const merged = { ...headers };
    if (accept) merged.Accept = accept;
    if (contentType) merged['Content-Type'] = contentType;
    if (token) merged.Authorization = `Bearer ${token}`;
    if (requestOrigin) merged.Origin = requestOrigin;
    return raw(`/v1/mcp${query}`, { method: 'POST', headers: merged, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  const callTool = (token, name, args = {}, id = 1) => mcp(rpc('tools/call', { name, arguments: args }, id), { token });

  const closeApp = async () => {
    await app.close();
    restore();
  };
  return { app, origin, mcpUrl, logs, raw, call, login, mcp, callTool, close: closeApp };
}

function rpc(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

/** 도구 정상 응답의 쪽. 도구 오류면 시험을 실패시킨다. */
function pageOf(response) {
  assert.equal(response.status, 200, response.text);
  const { result } = response.body;
  assert.ok(!result.isError, response.text);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

/** 도구 오류 응답의 { error, message }. */
function toolErrorOf(response) {
  assert.equal(response.status, 200, response.text);
  const { result } = response.body;
  assert.equal(result.isError, true, response.text);
  return JSON.parse(result.content[0].text);
}

/** 이 사건의 로그 객체들. */
const events = (server, event) => server.logs.filter((log) => log.args[0]?.event === event).map((log) => log.args[0]);

/** U6이 남긴 로그 전부(사건 이름이 mcp_로 시작). */
const mcpLogs = (logs) => logs.filter((log) => typeof log.args[0]?.event === 'string' && log.args[0].event.startsWith('mcp_'));

/** 모든 호출이 실패하는 시험용 연결. DB 실패 자리에 끼운다. */
function failingConnection(name = 'QueryFailedError') {
  const fail = async () => {
    const error = new Error(DB_FAILURE_MARKER);
    error.name = name;
    throw error;
  };
  return { query: fail, transaction: fail };
}

/** 트랜잭션 안에서 pattern에 맞는 문장만 실패하는 연결. 되돌림을 본다. */
function failingOn(real, pattern) {
  return {
    query: (...args) => real.query(...args),
    transaction: (level, run) => real.transaction(level, (manager) => run(new Proxy(manager, {
      get(target, key) {
        if (key !== 'query') return Reflect.get(target, key);
        return (sql, parameters) => {
          if (pattern.test(sql)) throw Object.assign(new Error(DB_FAILURE_MARKER), { name: 'QueryFailedError' });
          return target.query(sql, parameters);
        };
      },
    }))),
  };
}

/** target.dataSource를 replacement로 바꾸고 시험 끝에 되돌린다. */
function swapConnection(t, target, replacement) {
  const original = target.dataSource;
  target.dataSource = replacement;
  t.after(() => { target.dataSource = original; });
}

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function insertClient(db, { clientId = randomUUID(), clientName = '합성 Claude', redirectUris = [CLAUDE_REDIRECT_URI], registeredAt = new Date(), approvedAt = null } = {}) {
  await db.query('INSERT INTO mcp_client (mcp_client_id, client_name, redirect_uris, registered_at, approved_at) VALUES ($1, $2, $3, $4, $5)',
    [clientId, clientName, redirectUris, registeredAt, approvedAt]);
  return clientId;
}

async function insertConnection(db, memberId, clientId, { consentedAt = new Date(), expiresAt = inDays(7) } = {}) {
  await db.query('INSERT INTO mcp_connection (connection_id, member_id, mcp_client_id, consented_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [randomUUID(), memberId, clientId, consentedAt, expiresAt]);
}

/** 해시만 표에 넣고 합성 원문을 돌려준다. */
async function insertToken(db, memberId, clientId, { expiresAt = inDays(7) } = {}) {
  const token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO mcp_access_token (token_hash, member_id, mcp_client_id, expires_at) VALUES ($1, $2, $3, $4)',
    [sha256Hex(token), memberId, clientId, expiresAt]);
  return token;
}

/** 등록·연결·토큰을 표에 바로 넣는다. /register·/token의 IP 제한을 쓰지 않는다. */
async function connectMember(db, memberId, { clientId, expiresAt = inDays(7), approvedAt = new Date() } = {}) {
  const id = clientId ?? await insertClient(db, { approvedAt });
  await insertConnection(db, memberId, id, { expiresAt });
  return { clientId: id, token: await insertToken(db, memberId, id, { expiresAt }) };
}

async function insertCode(db, memberId, clientId, { challenge, redirectUri = CLAUDE_REDIRECT_URI, expiresAt = new Date(Date.now() + 300_000), usedAt = null, consentedAt = new Date() } = {}) {
  const code = randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO mcp_authorization_code (code_hash, member_id, mcp_client_id, code_challenge, redirect_uri, consented_at, expires_at, used_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [sha256Hex(code), memberId, clientId, challenge ?? pkcePair().challenge, redirectUri, consentedAt, expiresAt, usedAt]);
  return code;
}

/** 승인 화면이 보내는 요청과 같은 POST. */
function approve(server, member, { clientId, redirectUri = CLAUDE_REDIRECT_URI, state, challenge = pkcePair().challenge, resource, decision = 'APPROVE', consent, origin = WEB_ORIGIN, extra = {} }) {
  return server.call('POST', AUTHORIZATIONS_PATH, { token: member.token, origin,
    body: { clientId, redirectUri, state, codeChallenge: challenge, resource, decision, consent, ...extra } });
}

/** 승인해 코드 원문과 PKCE 값을 돌려준다. */
async function issueCode(server, member, clientId, { redirectUri = CLAUDE_REDIRECT_URI, consent = true, resource } = {}) {
  const pkce = pkcePair();
  const state = randomBytes(16).toString('hex');
  const response = await approve(server, member, { clientId, redirectUri, state, challenge: pkce.challenge, consent, resource });
  assert.equal(response.status, 200, response.text);
  const target = new URL(response.body.redirectTo);
  return { code: target.searchParams.get('code'), state, redirectUri, redirectTo: response.body.redirectTo, ...pkce };
}

/** POST /token을 폼으로 보낸다. 값이 undefined면 빼고 보낸다. */
function exchange(server, { clientId, code, verifier, redirectUri = CLAUDE_REDIRECT_URI, resource, grantType = 'authorization_code', extra = {} }) {
  const fields = { grant_type: grantType, client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource, ...extra };
  const form = new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== undefined));
  return server.raw('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
}

/** /authorize 쿼리를 만들어 부른다. 값이 null이면 빼고 보낸다. */
function startAuthorize(server, { clientId, redirectUri = CLAUDE_REDIRECT_URI, state = 'synthetic-state', challenge = pkcePair().challenge, method = 'S256', resource = null, responseType = 'code' }) {
  const fields = { client_id: clientId, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: method, resource, response_type: responseType };
  const query = new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== null));
  return server.raw(`/authorize?${query}`);
}

/** 합성 Claude: SDK 클라이언트 흐름으로 찾기·등록·승인 시작을 하고, 회원 승인(web과 같은 요청) 뒤 토큰 교환까지 한다. */
async function connectWithSdk(server, member, { redirectUri = CLAUDE_REDIRECT_URI, state = randomBytes(16).toString('hex'), consent = true } = {}) {
  const resourceMetadata = await auth.discoverOAuthProtectedResourceMetadata(server.mcpUrl);
  const issuer = resourceMetadata.authorization_servers[0];
  const metadata = await auth.discoverAuthorizationServerMetadata(issuer);
  const client = await auth.registerClient(issuer, { metadata, clientMetadata: {
    client_name: '합성 Claude', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'],
  } });
  const { authorizationUrl, codeVerifier } = await auth.startAuthorization(issuer, { metadata, clientInformation: client, redirectUrl: redirectUri, state, resource: new URL(server.mcpUrl) });
  const start = await fetch(authorizationUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  await start.text();
  assert.equal(start.status, 302);
  const screen = new URL(start.headers.get('location')).searchParams;
  const decision = await server.call('POST', AUTHORIZATIONS_PATH, { token: member.token, origin: WEB_ORIGIN, body: {
    clientId: screen.get('client_id'), redirectUri: screen.get('redirect_uri'), state: screen.get('state'), codeChallenge: screen.get('code_challenge'),
    resource: screen.get('resource'), decision: 'APPROVE', consent,
  } });
  assert.equal(decision.status, 200, decision.text);
  const returned = new URL(decision.body.redirectTo).searchParams;
  assert.equal(returned.get('state'), state);
  const tokens = await auth.exchangeAuthorization(issuer, { metadata, clientInformation: client, authorizationCode: returned.get('code'), codeVerifier, redirectUri, resource: new URL(server.mcpUrl) });
  return { client, tokens, state, code: returned.get('code'), codeVerifier, codeChallenge: screen.get('code_challenge') };
}

/** 합성 Claude의 도구 호출 쪽. SDK Client로 initialize부터 한다. */
async function sdkClient(server, accessToken) {
  const client = new Client({ name: '합성 Claude', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.mcpUrl), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }));
  return client;
}

/** 회원의 Catch가 매달릴 합성 분석 요청. Catch 표의 외래 키를 채울 뿐이다. */
async function insertAnalysisRequest(db, memberId) {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId, repositoryId: 'synthetic-repository', scopeRevision: 'synthetic-scope' };
  await db.transaction(async (manager) => {
    await manager.insert(AnalysisRequest, { ...context, registrationId: await ensureRegistration(manager, context), currentAttemptId: context.attemptId, submittedAt: new Date(), updatedAt: new Date() });
    await manager.insert(AnalysisConsent, { ...context, accepted: true, noticeRevision: 'fixture', consentedScope: { synthetic: true }, consentedAt: new Date() });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'MOCK' });
  });
  return context.requestId;
}

async function insertCatch(db, ownerId, requestId, { catchId = randomUUID(), title = '[합성] Catch', visibility = 'PRIVATE', workFacts = ['[합성] 사실'], subjectContribution = '[합성] 기여',
  authorDescription = null, draftContent = null, mismatch = false } = {}) {
  await db.query(`INSERT INTO catch_asset (catch_id, title, owner_id, source_request_id, source_result_id, source_candidate_id, work_identity, work_facts, subject_contribution,
      draft_status, draft_content, reflection_status, reflection_questions, registration_assessment, mismatch, visibility, source_mode, author_description, author_description_updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'NOT_GENERATED', ARRAY[]::text[], '{}'::jsonb, $12, $13, 'MOCK', $14, $15)`,
  [catchId, title, ownerId, requestId, `result-${catchId}`, `candidate-${catchId}`, `identity-${catchId}`, workFacts, subjectContribution,
    draftContent === null ? 'NOT_GENERATED' : 'GENERATED', draftContent, mismatch, visibility, authorDescription, authorDescription === null ? null : new Date()]);
  return catchId;
}

async function insertEvidence(db, catchId, position, sourceUrl) {
  await db.query(`INSERT INTO catch_evidence (catch_evidence_id, catch_id, position, source_evidence_id, source_url, source_revision, represented_facts, contribution_scope, coverage_limits)
    VALUES ($1, $2, $3, $4, $5, 'synthetic-revision', ARRAY['[합성] 근거 사실'], '[합성] 범위', ARRAY[]::text[])`,
  [randomUUID(), catchId, position, `evidence-${position}`, sourceUrl]);
}

async function insertTextMaterial(db, memberId, { id = randomUUID(), title = '[합성] 자료', body = '[합성] 본문', createdAt = new Date(), updatedAt = createdAt } = {}) {
  await db.query('INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, memberId, title, body, createdAt, updatedAt]);
  return id;
}

const count = async (db, table, memberId) =>
  (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE member_id = $1`, [memberId]))[0].n;

/** 회원의 MCP 표 행 수. */
async function mcpRows(db, memberId) {
  return {
    mcp_connection: await count(db, 'mcp_connection', memberId),
    mcp_authorization_code: await count(db, 'mcp_authorization_code', memberId),
    mcp_access_token: await count(db, 'mcp_access_token', memberId),
  };
}

/** 합성 값이 글들에 들어 있지 않음을 본다. 실패 메시지에 값을 싣지 않는다. */
function assertNoSecrets(texts, secrets) {
  for (const [name, value] of Object.entries(secrets)) {
    for (const text of texts) assert.equal(text.includes(value), false, `${name}이(가) 출력에 있다`);
  }
}

module.exports = {
  WEB_ORIGIN, CLAUDE_REDIRECT_URI, DEV_REDIRECT_URI, DB_FAILURE_MARKER, AUTHORIZATIONS_PATH, inDays, unusedPort, startMcpApp, rpc, pageOf, toolErrorOf, events, mcpLogs,
  failingConnection, failingOn, swapConnection, pkcePair, sha256Hex, insertClient, insertConnection, insertToken, connectMember, insertCode, approve, issueCode, exchange, startAuthorize,
  connectWithSdk, sdkClient, insertAnalysisRequest, insertCatch, insertEvidence, insertTextMaterial, count, mcpRows, assertNoSecrets,
};
