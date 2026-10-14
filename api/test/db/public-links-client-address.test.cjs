require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { LinkAccessService } = require('../../dist/share-links/link-access.service');
const { PRODUCT_UNLOCK_POLICY } = require('../../dist/share-links/unlock-policy');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #150 10/4 보안 의견: unlock 시도 제한이 어느 주소로 세는지를 실제 앱·테스트 DB로 검증한다.
// 테스트 클라이언트는 127.0.0.1로 붙고, 부하분산기가 붙였을 X-Forwarded-For는 요청 헤더로 흉내 낸다.
// 주소는 문서용 예시 대역(RFC 5737·3849), 비밀번호는 합성 값이다. 주소별 한도 10회(#150 9/29 결정)를 기준으로 본다.

const PASSWORD = 'synthetic-recipient-password';
const LIMIT = 10;
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const KEYS = [...Object.keys(ENV), 'TRUST_PROXY_CIDRS'];
const saved = {};
let db;

before(async () => {
  for (const key of KEYS) saved[key] = process.env[key];
  Object.assign(process.env, ENV);
  db = await openTestDataSource();
});
after(async () => {
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(async () => { await resetTestDatabase(db); });

/** TRUST_PROXY_CIDRS 값을 정해 앱을 띄운다. undefined면 설정을 지운다. */
async function start(t, trust) {
  if (trust === undefined) delete process.env.TRUST_PROXY_CIDRS; else process.env.TRUST_PROXY_CIDRS = trust;
  const app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const login = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'proxy-owner' }),
  });
  const { accessToken } = await login.json();
  let seq = 0;
  /** 비밀번호 링크를 새로 발급해 토큰을 돌려준다. 시나리오마다 다른 링크를 써서 서로 섞이지 않게 한다. */
  async function link() {
    const response = await fetch(`${url}/v1/share-links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': `p-${seq += 1}` },
      body: JSON.stringify({ title: `proxy-${seq}`, password: PASSWORD }),
    });
    assert.equal(response.status, 201);
    return (await response.json()).url.split('/s/')[1];
  }
  /** unlock을 부르고 상태·Retry-After·본문을 돌려준다. */
  async function unlockFull(token, password, forwardedFor) {
    const headers = { 'Content-Type': 'application/json' };
    if (forwardedFor !== undefined) headers['X-Forwarded-For'] = forwardedFor;
    const response = await fetch(`${url}/v1/public/links/${token}/unlock`, {
      method: 'POST', headers, body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json() };
  }
  /** X-Forwarded-For를 붙여(없으면 생략) unlock을 부르고 상태 코드를 돌려준다. */
  async function unlock(token, password, forwardedFor) {
    const headers = { 'Content-Type': 'application/json' };
    if (forwardedFor !== undefined) headers['X-Forwarded-For'] = forwardedFor;
    const response = await fetch(`${url}/v1/public/links/${token}/unlock`, {
      method: 'POST', headers, body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000),
    });
    await response.arrayBuffer();
    return response.status;
  }
  /** 주어진 주소들로 차례로 한 번씩 틀린다. 모두 401이어야 한다(아직 차단 전). */
  async function failFrom(token, addresses) {
    for (const address of addresses) assert.equal(await unlock(token, 'wrong-password', address), 401, String(address));
  }
  return { link, unlock, unlockFull, failFrom, access: app.get(LinkAccessService, { strict: false }) };
}

const range = (count, make) => Array.from({ length: count }, (_, index) => make(index + 1));

test('신뢰 프록시 미설정: 꾸민 X-Forwarded-For는 무시하고 직접 연결 주소 하나로 센다', async (t) => {
  const { link, unlock, failFrom } = await start(t, undefined);
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await unlock(token, PASSWORD, '198.51.100.200'), 429, '헤더를 바꿔도 같은 주소로 차단');
  assert.equal(await unlock(token, PASSWORD, undefined), 429);
});

test('신뢰 프록시가 연결 주소를 포함하지 않으면 X-Forwarded-For를 무시한다', async (t) => {
  const { link, unlock, failFrom } = await start(t, '10.0.0.0/8');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await unlock(token, PASSWORD, '198.51.100.200'), 429);
});

test('신뢰 프록시 설정: 프록시가 전한 주소별로 따로 센다', async (t) => {
  const { link, unlock, failFrom } = await start(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await unlock(token, PASSWORD, '198.51.100.200'), 200, '다른 주소는 각각 1회 실패라 차단되지 않음');

  const blocked = await link();
  await failFrom(blocked, range(LIMIT, () => '203.0.113.50'));
  assert.equal(await unlock(blocked, PASSWORD, '203.0.113.50'), 429, '같은 주소 10회 실패 뒤 맞는 비밀번호도 429');
  assert.equal(await unlock(blocked, PASSWORD, '203.0.113.51'), 200, '다른 주소는 막지 않음');
});

test('신뢰 프록시 설정: 수신자가 앞에 꾸며 넣은 주소는 무시하고 프록시가 붙인 마지막 주소로 센다', async (t) => {
  const { link, unlock, failFrom } = await start(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}, 203.0.113.60`));
  assert.equal(await unlock(token, PASSWORD, '198.51.100.250, 203.0.113.60'), 429);
  assert.equal(await unlock(token, PASSWORD, '203.0.113.60'), 429);
});

test('신뢰 프록시 설정: 같은 IPv6 /64는 한 칸, 다른 /64는 다른 칸이다', async (t) => {
  const { link, unlock, failFrom } = await start(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `2001:db8:1:2::${n.toString(16)}`));
  assert.equal(await unlock(token, PASSWORD, '2001:db8:1:2:ffff:ffff:ffff:ffff'), 429, '같은 /64의 다른 주소');
  assert.equal(await unlock(token, PASSWORD, '2001:db8:1:3::1'), 200, '다른 /64');
});

test('신뢰 프록시 설정: IPv4 매핑 IPv6와 같은 IPv4는 한 칸이다', async (t) => {
  const { link, unlock, failFrom } = await start(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => (n % 2 === 0 ? '::ffff:203.0.113.70' : '::ffff:cb00:7146')));
  assert.equal(await unlock(token, PASSWORD, '203.0.113.70'), 429);
  assert.equal(await unlock(token, PASSWORD, '203.0.113.71'), 200);
});

test('신뢰 프록시 설정값이 잘못되면 앱을 시작하지 않는다', async () => {
  for (const value of ['true', '0.0.0.0/0', 'loopback']) {
    process.env.TRUST_PROXY_CIDRS = value;
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await assert.rejects(configureApp(app), /TRUST_PROXY_CIDRS/, value);
    } finally {
      await app.close();
    }
  }
  delete process.env.TRUST_PROXY_CIDRS;
});

test('운영 정책 그대로(N=30): 여러 주소의 실패가 링크 전체로 30회 쌓이면 새 unlock을 15분 막고, 중간 성공은 누적을 지우지 않으며, 받아 둔 grant로는 계속 열람한다', async (t) => {
  assert.equal(PRODUCT_UNLOCK_POLICY.link.maxFailures, 30);
  const { link, unlock, unlockFull, failFrom, access } = await start(t, '127.0.0.1');
  const token = await link();
  const other = await link();
  const before = await unlockFull(token, PASSWORD, '192.0.2.250');
  assert.equal(before.status, 200);
  const { grant } = before.body;

  await failFrom(token, range(29, (n) => `198.51.100.${n}`)); // 주소마다 1회라 주소별 한도(10)에는 닿지 않는다
  assert.equal(await unlock(token, PASSWORD, '192.0.2.251'), 200, '29회까지는 차단 전, 성공해도 링크 누적은 남는다');
  assert.equal(await unlock(token, 'wrong-password', '198.51.100.30'), 401, '30번째 실패');

  const blocked = await unlockFull(token, PASSWORD, '203.0.113.200');
  assert.equal(blocked.status, 429, '새 주소의 맞는 비밀번호도 거부');
  assert.equal(blocked.body.code, 'LINK_UNLOCK_LIMITED');
  assert.ok(Number(blocked.retryAfter) >= 899 && Number(blocked.retryAfter) <= 900, blocked.retryAfter);
  await assert.doesNotReject(access.assertReadable(token, grant), '받아 둔 grant로는 계속 열람');
  assert.equal(await unlock(other, PASSWORD, '203.0.113.200'), 200, '다른 링크는 막지 않음');
});
