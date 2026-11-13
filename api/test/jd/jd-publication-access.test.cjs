// U10 실제 C10 등록의 좁은 HTTP 검사. DB 전체 초기화 없이 이번에 만든 회원과 자식 행만 정리한다.
// source 모드는 읽기 전용 컨테이너에서 사용하며, 제품 main·큐·외부 AI·C11 화면을 실행하지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, test } = require('node:test');
const sourceMode = process.env.CATCHU_U10_SOURCE_TEST === 'true';
if (sourceMode) require('ts-node/register');
const load = (path) => require(`../../${sourceMode ? 'src' : 'dist'}/${path}`);
const { NestFactory } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');
const { DataSource, QueryFailedError } = require('typeorm');
const { AppModule } = load('app.module');
const { configureApp } = load('app.setup');
const { readDatabaseConfig } = load('database/database.config');
const { SessionService } = load('auth/session.service');
const { AiConsentGate, AI_NOTICE_VERSION } = load('ai-consent/ai-consent.gate');
const { AiRun } = load('ai-run/ai-run');
const { JdService } = load('jd/jd.service');
const { JD_PUBLICATION_ACCESS } = load('jd-summary/jd-summary-tokens');
const { DbPublicationAccess } = load('publications/db-publication-access');
const { Publication, PUBLICATION_TTL_HOURS } = load('publications/publication.entity');
const { PUBLICATION_ACCESS } = load('publications/publications.module');
const { PublicationIndex } = load('published-index/publication-index.entity');
const { PUBLISHED_SEARCH } = load('published-index/published-index.module');
const { OwnerProfileReader } = load('member-profile/owner-profile-reader');
const { issueLinkGrant } = load('share-links/link-grant');
const { generateLinkToken } = load('share-links/link-token');

let app, db, url, restoreEnv;
const settings = {
  NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'false',
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'), AUTH_WEB_ORIGIN: 'http://localhost:3000',
  CATCHU_QUEUE_REDIS_URL: '', CATCHU_GENERATION_API_KEY: '', CATCHU_EMBEDDING_API_KEY: '',
  GOOGLE_LOGIN_ENABLED: 'false', GITHUB_CONNECTION_ENABLED: 'false', WORKER_CONTEXT_ENABLED: 'false',
};

before(async () => {
  const config = readDatabaseConfig();
  assert.ok(config.database.endsWith('_test'), '전용 _test DB에서만 실행한다');
  if (sourceMode) assert.equal(config.database, 'catchu_u10_test', 'source 검사는 기존 U10 test DB만 사용한다');
  const saved = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  restoreEnv = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await configureApp(app);
  db = app.get(DataSource);
  assert.equal(db.options.synchronize, false);
  assert.equal(db.options.migrationsRun, false);
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
after(async () => {
  try { await app?.close(); } finally { restoreEnv?.(); }
});

/** UUID를 INSERT 전에 기록한다. 생성 도중 실패해도 이번 identity와 맞는 행만 정리한다. */
async function fixture(t) {
  const ownedMembers = new Map();
  const identityPrefix = `u10-c10-${randomUUID()}`;
  t.after(async () => {
    for (const [id, identity] of ownedMembers) {
      await db.query('DELETE FROM member_account WHERE member_id=$1 AND identity_reference=$2', [id, identity]);
    }
    if (ownedMembers.size) {
      const [remaining] = await db.query('SELECT count(*)::int AS n FROM member_account WHERE member_id = ANY($1::uuid[])',
        [[...ownedMembers.keys()]]);
      assert.equal(remaining.n, 0, '이번 합성 회원만 정리됐는지 확인한다');
    }
  });
  async function member() {
    const memberId = randomUUID();
    const identity = `${identityPrefix}:${memberId}`;
    ownedMembers.set(memberId, identity);
    await db.query("INSERT INTO member_account (member_id,identity_reference,account_state) VALUES ($1,$2,'ACTIVE')", [memberId, identity]);
    // 시험 자료의 실제 세션·서명 토큰을 만든다. HTTP에서는 제품 Guard를 그대로 거친다.
    const session = await db.transaction((manager) => app.get(SessionService).create(manager, memberId));
    return { memberId, token: session.access.accessToken };
  }
  const recipient = await member();
  const owner = await member();
  const now = new Date();
  const publication = db.manager.create(Publication, {
    publicationId: randomUUID(), memberId: owner.memberId, title: 'U10 C10 합성 발행본',
    linkTokenReference: generateLinkToken(),
    // C10의 비밀번호 보호 여부만 필요하다. unlock API·비밀번호 검증 경로는 이 검사의 대상이 아니다.
    passwordProtectionReference: 'synthetic-c10-password-reference',
    publishedAt: now, expiresAt: new Date(now.getTime() + PUBLICATION_TTL_HOURS * 3_600_000), stoppedAt: null,
  });
  await db.manager.insert(Publication, publication);
  await db.manager.insert(PublicationIndex, { publicationId: publication.publicationId, status: 'DONE', deadlineAt: now, updatedAt: now });
  const jd = await app.get(JdService).create(recipient.memberId, { title: 'U10 C10 합성 JD', body: ' Docker 경험\n- 협업 경험' });
  await app.get(AiConsentGate).record(recipient.memberId, AI_NOTICE_VERSION, now);
  const grant = issueLinkGrant(Buffer.from(settings.LINK_GRANT_SECRET, 'hex'), publication.publicationId, publication.expiresAt, now);
  return { recipient, owner, publication, jd, grant, member };
}

async function request(h, method, suffix = '', options = {}) {
  const token = Object.hasOwn(options, 'token') ? options.token : h.recipient.token;
  const grant = Object.hasOwn(options, 'grant') ? options.grant : h.grant;
  const body = method === 'POST' ? (options.body ?? { jdId: h.jd.jdId }) : undefined;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (grant) headers['X-Link-Grant'] = grant;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${url}/v1/public/links/${h.publication.linkTokenReference}/jd-summaries${suffix}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body.code, code);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
async function counts(h) {
  const [row] = await db.query(`SELECT
    (SELECT count(*)::int FROM jd_summary_run WHERE member_id=$1) AS runs,
    (SELECT count(input_copy)::int FROM jd_summary_run WHERE member_id=$1) AS copies,
    (SELECT count(*)::int FROM jd_summary_result r JOIN jd_summary_run x ON x.run_id=r.run_id WHERE x.member_id=$1) AS results,
    (SELECT coalesce(sum(count),0)::int FROM daily_execution_count WHERE member_id=$1) AS charges`, [h.recipient.memberId]);
  return row;
}
async function denyAll(h, runId, options = {}) {
  expectError(await request(h, 'POST', '', options), 404, 'LINK_UNAVAILABLE');
  expectError(await request(h, 'GET', '', options), 404, 'LINK_UNAVAILABLE');
  expectError(await request(h, 'GET', `/${runId}`, options), 404, 'LINK_UNAVAILABLE');
}
async function changeAccess(h, kind) {
  if (kind === 'stop') {
    await db.manager.update(Publication, { publicationId: h.publication.publicationId }, { stoppedAt: new Date() });
  } else if (kind === 'expire') {
    const expired = new Date(Date.now() - 1000);
    await db.manager.update(Publication, { publicationId: h.publication.publicationId }, {
      publishedAt: new Date(expired.getTime() - PUBLICATION_TTL_HOURS * 3_600_000), expiresAt: expired,
    });
  } else {
    await db.query("UPDATE member_account SET account_state='INACTIVE' WHERE member_id=$1", [h.owner.memberId]);
  }
}

test('실제 AppModule은 C10·JD 처리기를 한 번 조립하고 서명 grant로 접수·목록·상세를 연결한다', async (t) => {
  const access = app.get(JD_PUBLICATION_ACCESS);
  assert.ok(access instanceof DbPublicationAccess);
  assert.equal(access, app.get(PUBLICATION_ACCESS));
  assert.equal(app.get(AiRun).registeredKinds().filter((kind) => kind === 'JD_SUMMARY').length, 1);
  // 기존 합성 통합 검사도 이 AppModule 하나를 사용한다. 두 번째 동적 JD 모듈 등록은 필요 없다.
  const h = await fixture(t);
  assert.equal(h.publication.linkTokenReference.length, 43);
  const accepted = await request(h, 'POST');
  assert.equal(accepted.status, 202);
  const list = await request(h, 'GET');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((item) => item.runId), [accepted.body.runId]);
  const detail = await request(h, 'GET', `/${accepted.body.runId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.status, 'PENDING', '큐 미설정의 접수 성공을 처리 완료로 바꾸지 않는다');
  assert.deepEqual(detail.body.requirements.map((row) => row.jdLine), [' Docker 경험', '- 협업 경험']);
  for (const response of [accepted, list, detail]) assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await counts(h), { runs: 1, copies: 1, results: 2, charges: 1 });
});

test('실제 Guard의 회원 401과 C10의 링크 401을 구분하고 Bearer와 grant를 모두 요구한다', async (t) => {
  const h = await fixture(t);
  const accepted = await request(h, 'POST');
  assert.equal(accepted.status, 202);
  for (const [method, suffix] of [['POST', ''], ['GET', ''], ['GET', `/${accepted.body.runId}`]]) {
    expectError(await request(h, method, suffix, { token: null, grant: null }), 401, 'AUTH_REQUIRED');
    expectError(await request(h, method, suffix, { token: 'invalid-member-token' }), 401, 'AUTH_INVALID');
    expectError(await request(h, method, suffix, { grant: null }), 401, 'LINK_PASSWORD_REQUIRED');
    expectError(await request(h, method, suffix, { grant: 'invalid-grant' }), 401, 'LINK_PASSWORD_REQUIRED');
  }
  assert.deepEqual(await counts(h), { runs: 1, copies: 1, results: 2, charges: 1 });
});

test('실제 C10 통과 뒤에도 실행 회원·JD 소유·발행본 조건을 함께 유지한다', async (t) => {
  const h = await fixture(t), other = await h.member();
  const accepted = await request(h, 'POST');
  assert.equal(accepted.status, 202);
  const list = await request(h, 'GET', '', { token: other.token });
  assert.equal(list.status, 200); assert.deepEqual(list.body.items, []);
  expectError(await request(h, 'POST', '', { token: other.token }), 404, 'RESOURCE_UNAVAILABLE');
  expectError(await request(h, 'GET', `/${accepted.body.runId}`, { token: other.token }), 404, 'RESOURCE_UNAVAILABLE');
  const differentPublication = await fixture(t);
  expectError(await request(differentPublication, 'GET', `/${accepted.body.runId}`, { token: h.recipient.token }), 404, 'RESOURCE_UNAVAILABLE');
});

test('매 요청 실제 C10은 중지·만료·비활성 작성자를 grant 확인보다 먼저 404로 차단한다', async (t) => {
  for (const kind of ['stop', 'expire', 'inactive']) {
    const h = await fixture(t);
    const accepted = await request(h, 'POST');
    assert.equal(accepted.status, 202);
    await changeAccess(h, kind);
    await denyAll(h, accepted.body.runId, { grant: null });
    assert.deepEqual(await counts(h), { runs: 1, copies: 1, results: 2, charges: 1 });
  }
});

test('실제 C10 판정 뒤 발행본 삭제는 정확한 FK 23503의 404와 접수·차감 롤백으로 연결된다', async (t) => {
  const h = await fixture(t), search = app.get(PUBLISHED_SEARCH);
  const originalState = search.getIndexState.bind(search);
  t.mock.method(search, 'getIndexState', async (...args) => {
    const state = await originalState(...args);
    await db.manager.delete(Publication, { publicationId: h.publication.publicationId });
    return state;
  });
  const failures = [], originalTransaction = db.transaction.bind(db);
  t.mock.method(db, 'transaction', async (...args) => {
    try { return await originalTransaction(...args); } catch (error) {
      if (error instanceof QueryFailedError) failures.push({ code: error.driverError.code, constraint: error.driverError.constraint });
      throw error;
    }
  });
  let enqueueCalls = 0;
  t.mock.method(app.get(AiRun), 'enqueueAfterCommit', async () => { enqueueCalls++; return 'ENQUEUE_FAILED'; });
  expectError(await request(h, 'POST'), 404, 'LINK_UNAVAILABLE');
  assert.deepEqual(failures, [{ code: '23503', constraint: 'fk_jd_summary_run_publication_id' }]);
  assert.deepEqual(await counts(h), { runs: 0, copies: 0, results: 0, charges: 0 });
  assert.equal(enqueueCalls, 0);
  assert.equal((await app.get(JdService).detail(h.recipient.memberId, h.jd.jdId)).body, h.jd.body);
});

for (const [kind, label] of [['stop', '중지'], ['expire', '만료'], ['inactive', '작성자 비활성']]) {
  test(`실제 C10 판정 뒤 ${label}는 현재 접수·차감을 허용하고 다음 요청부터 차단한다`, async (t) => {
    const h = await fixture(t), search = app.get(PUBLISHED_SEARCH);
    const originalState = search.getIndexState.bind(search);
    t.mock.method(search, 'getIndexState', async (...args) => {
      const state = await originalState(...args);
      await changeAccess(h, kind);
      return state;
    });
    const accepted = await request(h, 'POST');
    assert.equal(accepted.status, 202);
    await denyAll(h, accepted.body.runId);
    assert.deepEqual(await counts(h), { runs: 1, copies: 1, results: 2, charges: 1 });
  });
}

test('회원 행 부재만 OwnerProfileReader 대역으로 주입하면 실제 C10의 오류는 고정 500으로 전달된다', async (t) => {
  const h = await fixture(t), owners = app.get(OwnerProfileReader);
  const originalRead = owners.readOwnerState.bind(owners);
  // 정상 FK 아래에서는 발행본만 남고 회원 행이 사라질 수 없다. FK를 끄거나 기존 자료를 훼손하지 않는다.
  t.mock.method(owners, 'readOwnerState', async (id, manager) => id === h.owner.memberId ? 'NO_MEMBER' : originalRead(id, manager));
  for (const [method, suffix] of [['POST', ''], ['GET', ''], ['GET', `/${randomUUID()}`]]) {
    const response = await request(h, method, suffix, { grant: null });
    expectError(response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(Object.keys(response.body).sort(), ['code', 'message']);
    const body = JSON.stringify(response.body);
    assert.equal(body.includes(h.owner.memberId), false);
    assert.equal(body.includes(h.publication.linkTokenReference), false);
    assert.equal(body.includes('PublicationOwnerMissing'), false);
  }
  assert.deepEqual(await counts(h), { runs: 0, copies: 0, results: 0, charges: 0 });
});
