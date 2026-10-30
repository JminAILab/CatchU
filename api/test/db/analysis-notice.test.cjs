require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SessionService } = require('../../dist/auth/session.service');
const { GoogleLoginService } = require('../../dist/google-login/google-login.service');
const { AnalysisNoticeService, REAL_NOTICE, SYNTHETIC_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { GitHubConnection, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { DEV_LOGIN_IDENTITY_PREFIX, GOOGLE_IDENTITY_PREFIX, MemberKindService, memberKindOf } = require('../../dist/member-analysis/member-kind');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { bindSyntheticDailyLimit } = require('../support/synthetic-daily-limit.cjs');

// #424 본문 확정 v2(2026-10-30 팀장, #322에서 네 줄만 변경)의 SHA-256. 반영 PR에서 팀장 승인을 받는다.
const CONFIRMED_NOTICE_SHA256 = '8da5543d1caa356fb819961a5882b7ebe614e68ee8fad3fd044b3ea921d2e2e3';
const GOOGLE = { GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret', GOOGLE_REDIRECT_URI: 'http://localhost:3000/google/callback' };
const UNSUPPORTED = ['catchu:github:1234567', 'test:unsupported-origin', 'CATCHU:GOOGLE:upper-case', GOOGLE_IDENTITY_PREFIX, DEV_LOGIN_IDENTITY_PREFIX];
let db;
before(async () => { db = await openTestDataSource(); });
beforeEach(async () => { await resetTestDatabase(db); });
after(async () => { await db?.destroy(); });

async function start(t, overrides = {}) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CORS_ALLOWED_ORIGINS: undefined, ...overrides };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(settings)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  let app;
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(k =>
    [k, (...args) => logs.push(args.map(String).join(' '))]));
  t.after(async () => { try { await app?.close(); } finally {
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  } });
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  bindSyntheticDailyLimit(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const call = (path, options) => fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  const login = async id => {
    const r = await call('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: id }) });
    assert.equal(r.status, 200);
    const { accessToken } = await r.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  return { app, call, login, logs, notices: app.get(AnalysisNoticeService), members: app.get(MemberKindService) };
}
/** 로그인 경로 없이 회원·세션을 만든다. 개발 로그인이 꺼진 환경에서도 인증 뒤의 고지 선택을 검사한다. */
async function member(s, identityReference) {
  const account = Object.assign(new MemberAccount(), { identityReference, accountState: 'ACTIVE' });
  const issued = await db.transaction(async manager => {
    await manager.insert(MemberAccount, account);
    return s.app.get(SessionService).create(manager, account.memberId);
  });
  return { token: issued.access.accessToken, memberId: account.memberId };
}
/** #231 실제 연결의 행 모양(숫자 계정 참조·보관 참조)으로 연결 상태를 만든다. 'none'은 행 없음이다. */
async function connect(memberId, state) {
  if (state === 'none') return;
  const values = { CONNECTED: ['1234567', 'real-login', 'github-v1:' + randomUUID()], DISCONNECTED: [null, null, null],
    REAUTH_REQUIRED: ['1234567', 'real-login', null] }[state];
  const [externalAccountReference, accountLogin, credentialReference] = values;
  const existing = await db.manager.findOneBy(GitHubConnection, { memberId });
  if (existing) await db.manager.update(GitHubConnection, { memberId },
    { externalAccountReference, accountLogin, credentialReference, connectionState: state });
  else await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(),
    { memberId, externalAccountReference, accountLogin, credentialReference, connectionState: state }));
}
const notice = (s, user) => s.call('/v1/analysis-notice', { headers: { Authorization: 'Bearer ' + user.token } });
async function expectNotice(r, expected) {
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { noticeRevision: expected.noticeRevision, text: expected.text });
}
async function error(r, status, code) {
  assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json(); assert.equal(body.code, code);
  return body;
}
const post = (s, user, noticeRevision) => s.call('/v1/analysis-requests', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token, 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ repositoryId: SYNTHETIC_REPOSITORY.repositoryId,
    consent: { accepted: true, noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision } }) });
async function counts() {
  const [row] = await db.query('SELECT (SELECT count(*)::int FROM analysis_request) requests, (SELECT count(*)::int FROM analysis_consent) consents, (SELECT count(*)::int FROM analysis_attempt) attempts, (SELECT count(*)::int FROM idempotency_record) keys');
  return row;
}

test('실제 고지는 #424 확정 v2 문구·문단·줄바꿈 그대로이고 합성 판본과 구분된다', () => {
  assert.equal(createHash('sha256').update(REAL_NOTICE.text, 'utf8').digest('hex'), CONFIRMED_NOTICE_SHA256);
  const lines = REAL_NOTICE.text.split('\n');
  // v1의 네 줄만 교체하므로 전체 줄 수와 문단 구분 수는 유지한다.
  assert.equal(lines.length, 30); assert.equal(lines.filter(line => line === '').length, 6);
  assert.equal(lines[0], '[CatchU 저장소 분석 안내]'); assert.ok(!REAL_NOTICE.text.includes('\r'));
  assert.equal(REAL_NOTICE.noticeRevision, 'catchu-real-analysis-notice-v2');
  assert.notEqual(REAL_NOTICE.noticeRevision, SYNTHETIC_NOTICE.noticeRevision);
  assert.ok(Object.isFrozen(REAL_NOTICE));
});
test('회원 구분은 생성 출처로만 하고 미지원 출처를 실제 회원으로 보지 않는다', () => {
  assert.equal(memberKindOf(GOOGLE_IDENTITY_PREFIX + 'sub-1'), 'REAL');
  assert.equal(memberKindOf(DEV_LOGIN_IDENTITY_PREFIX + 'dev-1'), 'DEVELOPMENT');
  // 개발 로그인 문자열에 Google 형식을 넣어도 개발 회원이다.
  assert.equal(memberKindOf(DEV_LOGIN_IDENTITY_PREFIX + GOOGLE_IDENTITY_PREFIX + 'sub-1'), 'DEVELOPMENT');
  for (const reference of [...UNSUPPORTED, '', ' catchu:google:sub-1', 'catchu:googlex:sub-1', 'catchu:mock-github:x', 'google:sub-1']) {
    assert.equal(memberKindOf(reference), null, reference);
  }
});
test('Google 로그인으로 만든 실제 회원은 GitHub 연결 있음·없음·해제·재인증 필요 모두 실제 고지를 받는다', async t => {
  const s = await start(t, GOOGLE);
  const google = s.app.get(GoogleLoginService);
  google.provider = { exchange: async () => ({ subject: 'notice-322-' + randomUUID(), name: null }) };
  for (const state of ['none', 'CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED']) {
    const started = google.start();
    const login = await google.login({ state: new URL(started.authorizationUrl).searchParams.get('state'),
      loginAttemptToken: started.loginAttemptToken, code: 'synthetic-code' });
    const user = { token: login.access.accessToken, memberId: decodeJwt(login.access.accessToken).sub };
    assert.ok((await db.manager.findOneByOrFail(MemberAccount, { memberId: user.memberId })).identityReference.startsWith(GOOGLE_IDENTITY_PREFIX));
    await connect(user.memberId, state);
    await expectNotice(await notice(s, user), REAL_NOTICE);
  }
});
for (const [label, overrides] of [['개발 로그인 켬', {}], ['DEV_LOGIN_ENABLED=false', { DEV_LOGIN_ENABLED: 'false' }],
  ['NODE_ENV=production', { NODE_ENV: 'production' }], ['NODE_ENV 없음', { NODE_ENV: undefined }], ['NODE_ENV=preview', { NODE_ENV: 'preview' }]]) {
  test('실제 회원 고지는 개발 로그인 설정과 관계없고 개발 회원·미지원 출처의 차단은 유지된다: ' + label, async t => {
    const s = await start(t, overrides);
    for (const state of ['none', 'CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED']) {
      const user = await member(s, GOOGLE_IDENTITY_PREFIX + state + '-' + randomUUID());
      await connect(user.memberId, state);
      await expectNotice(await notice(s, user), REAL_NOTICE);
    }
    const developer = await member(s, DEV_LOGIN_IDENTITY_PREFIX + 'env-' + randomUUID());
    if (Object.keys(overrides).length === 0) await expectNotice(await notice(s, developer), SYNTHETIC_NOTICE);
    else await error(await notice(s, developer), 403, 'INTERNAL_ERROR');
    for (const reference of UNSUPPORTED) await error(await notice(s, await member(s, reference)), 403, 'INTERNAL_ERROR');
  });
}
test('개발 회원은 합성 연결·연결 없음·해제·재인증 필요·실제 GitHub 연결 모두 합성 고지를 받는다', async t => {
  const s = await start(t);
  for (const state of ['synthetic', 'none', 'DISCONNECTED', 'REAUTH_REQUIRED', 'real']) {
    const user = await s.login('notice-322-' + state);
    if (state === 'none') await db.manager.delete(GitHubConnection, { memberId: user.memberId });
    else if (state === 'DISCONNECTED') await connect(user.memberId, state);
    else if (state === 'REAUTH_REQUIRED') await db.manager.update(GitHubConnection, { memberId: user.memberId }, { connectionState: state });
    else if (state === 'real') await connect(user.memberId, 'CONNECTED');
    await expectNotice(await notice(s, user), SYNTHETIC_NOTICE);
  }
});
test('개발 회원 접수는 합성 판정을 유지하고 실제 회원은 합성 저장소로 접수하지 않는다', async t => {
  const s = await start(t);
  // 실제 회원은 #323 실제 접수 경로로 간다. 이 시험 서버는 GitHub 연동이 꺼져 있어 남은 연결 행으로 접수하지 않는다.
  // 연동을 켠 서버의 합성 저장소 거부(REPOSITORY_NOT_ALLOWED)는 analysis-intake-real.test.cjs가 본다.
  const real = await member(s, GOOGLE_IDENTITY_PREFIX + 'intake-' + randomUUID());
  await connect(real.memberId, 'CONNECTED');
  await error(await post(s, real, REAL_NOTICE.noticeRevision), 403, 'GITHUB_CONNECTION_REQUIRED');
  const developer = await s.login('intake-322');
  await error(await post(s, developer, REAL_NOTICE.noticeRevision), 403, 'CONSENT_REQUIRED');
  // 개발 회원에 실제 GitHub 연결이 섞이면 고지는 합성이지만 접수는 기존처럼 합성 연결이 아니라서 거부한다.
  const mixed = await s.login('intake-322-mixed');
  await connect(mixed.memberId, 'CONNECTED');
  await error(await post(s, mixed, SYNTHETIC_NOTICE.noticeRevision), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await counts(), { requests: 0, consents: 0, attempts: 0, keys: 0 });
  const accepted = await post(s, developer, SYNTHETIC_NOTICE.noticeRevision);
  assert.equal(accepted.status, 202); assert.equal((await accepted.json()).sourceMode, 'MOCK');
});
test('실제 고지 판본이 없으면 합성 고지로 대신하지 않고 403 CONSENT_REQUIRED', async t => {
  const s = await start(t);
  s.notices.realNotice = null;
  const real = await member(s, GOOGLE_IDENTITY_PREFIX + 'absent-' + randomUUID());
  const body = await error(await notice(s, real), 403, 'CONSENT_REQUIRED');
  assert.deepEqual(Object.keys(body).sort(), ['code', 'message']);
  // 개발 회원의 합성 고지는 실제 판본 유무와 관계없다.
  await expectNotice(await notice(s, await s.login('absent-322')), SYNTHETIC_NOTICE);
});
test('회원 자료 조회 장애는 고지나 403으로 대신하지 않고 500 INTERNAL_ERROR', async t => {
  const s = await start(t);
  const real = await member(s, GOOGLE_IDENTITY_PREFIX + 'failure-' + randomUUID());
  const developer = await s.login('failure-322');
  s.members.read = async () => { throw new Error('synthetic-secret-member-read'); };
  for (const user of [real, developer]) {
    const body = await error(await notice(s, user), 500, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(body).includes('synthetic-secret-member-read'));
  }
  assert.ok(!s.logs.some(line => line.includes('synthetic-secret-member-read')));
});
test('MemberKindService는 활성 회원만 구분하고 트랜잭션 안에서는 회원 행을 읽기 잠금한다', async () => {
  const service = new MemberKindService(db);
  const ids = {};
  for (const [name, identityReference, accountState] of [['real', GOOGLE_IDENTITY_PREFIX + 'svc', 'ACTIVE'],
    ['developer', DEV_LOGIN_IDENTITY_PREFIX + 'svc', 'ACTIVE'], ['inactive', GOOGLE_IDENTITY_PREFIX + 'svc-inactive', 'SUSPENDED'],
    ['unsupported', 'test:unsupported-origin', 'ACTIVE']]) {
    const account = Object.assign(new MemberAccount(), { identityReference, accountState });
    await db.manager.insert(MemberAccount, account); ids[name] = account.memberId;
  }
  assert.equal(await service.read(ids.real), 'REAL');
  assert.equal(await service.read(ids.developer), 'DEVELOPMENT');
  for (const id of [ids.inactive, ids.unsupported, randomUUID()]) assert.equal(await service.read(id), null);
  await assert.rejects(service.read(ids.real, db.manager), /requires a transaction/);
  const other = await openTestDataSource();
  try {
    await db.transaction(async manager => {
      assert.equal(await service.read(ids.real, manager), 'REAL');
      // 판정한 트랜잭션이 끝나기 전에는 다른 연결이 회원 상태를 바꾸지 못한다.
      await assert.rejects(other.transaction(async locked => {
        await locked.query("SET LOCAL lock_timeout = '300ms'");
        await locked.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [ids.real]);
      }), error => (error.driverError?.code ?? error.code) === '55P03');
    });
  } finally { await other.destroy(); }
  assert.equal(await service.read(ids.real), 'REAL');
});
