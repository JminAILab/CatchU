require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #151 제품 앱 경로 확인: 기본 AppModule을 그대로 띄워(NestFactory.create(AppModule)) 수신자 목록·상세가 등록되고,
// 실제 A 공급 함수(OwnerProfileReader)와 #150 판정으로 응답하는지 테스트 DB에서 확인한다. 대역을 주입하지 않는다.
// 회원은 개발 로그인, 프로필은 PUT /v1/me/profile, 링크는 발급 API로 만든다. GitHub 연결 행은 합성 행이며 실제 OAuth가 아니다.
// 공개 Catch가 있는 경우의 목록·상세 조합은 recipient-http.test.cjs(격리 스키마)가 확인한다.

const PASSWORD = 'synthetic-recipient-password';
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const PROFILE = { displayName: '[합성] 제품 앱 소유자', introduction: '[합성] 소개', desiredRole: '[합성] 백엔드', skills: ['[합성] NestJS'] };
const saved = {};
const logs = [];
const secrets = new Set();
let app;
let url;
let db;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  delete process.env.TRUST_PROXY_CIDRS;
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = await openTestDataSource();
});
after(async () => {
  await app?.close();
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(async () => { await resetTestDatabase(db); });

async function json(response) {
  const text = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: JSON.parse(text), text };
}

/** 개발 로그인 회원을 만들고 프로필을 저장한다. 토큰과 회원 ID를 돌려준다. */
async function owner() {
  const login = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: `recipient-app-${randomUUID()}` }),
  });
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  secrets.add(accessToken);
  const memberId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')).sub;
  const saved = await fetch(`${url}/v1/me/profile`, {
    method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(PROFILE),
  });
  assert.equal(saved.status, 200, await saved.text());
  return { accessToken, memberId };
}

let keySeq = 0;
async function issue({ accessToken }, password) {
  keySeq += 1;
  const title = `[합성] 제품 앱 링크 ${keySeq}`;
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': `recipient-app-${keySeq}` },
    body: JSON.stringify(password === undefined ? { title } : { title, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const token = body.url.split('/s/')[1];
  secrets.add(token);
  return { linkId: body.linkId, token, title };
}

/** 수신자 요청. Authorization을 붙이지 않는다. */
const get = (path, grant) => fetch(url + path, { headers: grant === undefined ? {} : { 'X-Link-Grant': grant } }).then(json);
const unlock = (token, password = PASSWORD) => fetch(`${url}/v1/public/links/${token}/unlock`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
}).then(json);
const fails = (response, status, code) => {
  assert.equal(response.status, status, response.text);
  assert.equal(response.body.code, code);
  assert.equal(response.body.details, undefined);
};
const github = (memberId, state, login) => db.query(`INSERT INTO github_connection
  (connection_id, member_id, external_account_reference, account_login, credential_reference, connection_state)
  VALUES ($1, $2, $3, $4, NULL, $5)
  ON CONFLICT (member_id) DO UPDATE SET account_login = EXCLUDED.account_login, connection_state = EXCLUDED.connection_state`,
[randomUUID(), memberId, login ? '42' : null, login, state]);

test('제품 앱: 회원 JWT 없이 목록·상세·unlock이 실제 공급 함수로 응답하고, GitHub 연결 상태별 계정명을 계약대로 준다', async () => {
  const member = await owner();
  const open = await issue(member);
  const locked = await issue(member, PASSWORD);

  // 개발 로그인은 합성 GitHub 연결 행을 함께 만든다. 그 저장 상태 그대로 계약 규칙(CONNECTED만 저장 계정명)을 적용한 값이어야 한다.
  const [stored] = await db.query('SELECT connection_state AS state, account_login AS login FROM github_connection WHERE member_id = $1', [member.memberId]);
  const expectedLogin = stored?.state === 'CONNECTED' ? stored.login : null;
  const empty = await get(`/v1/public/links/${open.token}`);
  assert.equal(empty.status, 200, empty.text);
  assert.deepEqual(empty.body, {
    profile: { ...PROFILE, fieldSource: 'SELF_REPORTED', githubAccountLogin: expectedLogin }, catches: [], page: { nextCursor: null },
  });
  for (const leaked of [member.memberId, open.linkId, open.title]) assert.ok(!empty.text.includes(leaked));

  await github(member.memberId, 'CONNECTED', 'synthetic-app-login');
  assert.equal((await get(`/v1/public/links/${open.token}`)).body.profile.githubAccountLogin, 'synthetic-app-login');
  await github(member.memberId, 'REAUTH_REQUIRED', 'synthetic-app-login');
  const reauth = await get(`/v1/public/links/${open.token}`);
  assert.equal(reauth.body.profile.githubAccountLogin, null, '재인증 필요는 계정명이 남아 있어도 null');
  assert.ok(!reauth.text.includes('synthetic-app-login') && !reauth.text.includes('REAUTH_REQUIRED'));
  await github(member.memberId, 'DISCONNECTED', null);
  assert.equal((await get(`/v1/public/links/${open.token}`)).body.profile.githubAccountLogin, null);
  await db.query('DELETE FROM github_connection WHERE member_id = $1', [member.memberId]);
  assert.equal((await get(`/v1/public/links/${open.token}`)).body.profile.githubAccountLogin, null, '연결 기록 없음도 null');

  fails(await get(`/v1/public/links/${open.token}/catches/${randomUUID()}`), 404, 'RESOURCE_UNAVAILABLE');
  fails(await get(`/v1/public/links/${open.token}/catches/not-a-catch-id`), 404, 'RESOURCE_UNAVAILABLE');
  fails(await unlock(open.token), 400, 'INVALID_REQUEST');

  fails(await get(`/v1/public/links/${locked.token}`), 401, 'LINK_PASSWORD_REQUIRED');
  fails(await get(`/v1/public/links/${locked.token}/catches/${randomUUID()}`), 401, 'LINK_PASSWORD_REQUIRED');
  const unlocked = await unlock(locked.token);
  assert.equal(unlocked.status, 200, unlocked.text);
  secrets.add(unlocked.body.grant);
  assert.equal((await get(`/v1/public/links/${locked.token}`, unlocked.body.grant)).status, 200);
  fails(await get(`/v1/public/links/${open.token}/catches/${randomUUID()}`, unlocked.body.grant), 404, 'RESOURCE_UNAVAILABLE');
});

test('제품 앱: 소유 회원이 비활성이면 unlock·목록·상세 모두 404(비밀번호 없는 링크 unlock도 400보다 먼저)이고, 다시 활성이면 다음 요청부터 열린다', async () => {
  const member = await owner();
  const open = await issue(member);
  const locked = await issue(member, PASSWORD);
  const { body: { grant } } = await unlock(locked.token);
  secrets.add(grant);

  await db.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [member.memberId]);
  fails(await unlock(open.token), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(locked.token), 404, 'LINK_UNAVAILABLE');
  fails(await get(`/v1/public/links/${open.token}`), 404, 'LINK_UNAVAILABLE');
  fails(await get(`/v1/public/links/${locked.token}`, grant), 404, 'LINK_UNAVAILABLE');
  fails(await get(`/v1/public/links/${locked.token}/catches/${randomUUID()}`, grant), 404, 'LINK_UNAVAILABLE');
  fails(await get(`/v1/public/links/${open.token}/catches/${randomUUID()}`), 404, 'LINK_UNAVAILABLE');

  await db.query("UPDATE member_account SET account_state = 'ACTIVE' WHERE member_id = $1", [member.memberId]);
  assert.equal((await get(`/v1/public/links/${locked.token}`, grant)).status, 200);
  fails(await unlock(open.token), 400, 'INVALID_REQUEST');
});

test('제품 앱: 필수 프로필 행이 없는 이용 가능한 소유자의 목록은 500이고, 로그에 링크 토큰·grant·회원 토큰·비밀번호가 없다', async () => {
  const member = await owner();
  const open = await issue(member);
  await db.query('DELETE FROM member_profile WHERE member_id = $1', [member.memberId]);
  const failed = await get(`/v1/public/links/${open.token}`);
  assert.equal(failed.status, 500, failed.text);
  assert.deepEqual(failed.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  assert.ok(logs.some((line) => line.includes('/v1/public/links/') && line.includes('→ 500 INTERNAL_ERROR')), '500 처리 로그가 수집되지 않음');
  const joined = logs.join('\n');
  for (const secret of [...secrets, PASSWORD]) assert.ok(!joined.includes(secret), '로그에 비밀값이 포함됨');
});
