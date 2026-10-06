require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { LinkAccessService } = require('../../dist/share-links/link-access.service');
const { LINK_GRANT_KEY } = require('../../dist/share-links/link-grant');
const passwordModule = require('../../dist/share-links/link-password');
const { createUnlockControls, PRODUCT_UNLOCK_POLICY, UNLOCK_CONTROLS } = require('../../dist/share-links/unlock-policy');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #150 10/4 보안 의견 2·3: 링크 전체 제한·동시 요청·해시 직전 재확인·자원 해제를 실제 DB와 실제 해시로 검증한다.
// 링크 전체 상한은 운영값 30과 후보 20·50을 주입한 서비스를 직접 만들어 쓴다(운영 정책값은 바꾸지 않는다).
// 주소 인자는 client-address.ts가 만든 주소 단위 문자열을 흉내 낸 합성 값이다.

const PASSWORD = 'synthetic-recipient-password';
const CANDIDATES = [20, 30, 50];
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '300',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const saved = {};
let app;
let url;
let db;
let appControls;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  delete process.env.TRUST_PROXY_CIDRS;
  app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  appControls = app.get(UNLOCK_CONTROLS, { strict: false });
  db = await openTestDataSource();
});
after(async () => {
  await app?.close();
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
let ownerToken;
beforeEach(async () => { await resetTestDatabase(db); ownerToken = undefined; });

let keySeq = 0;
/** 발급 API로 비밀번호 링크를 만든다. 한 테스트에 5개까지(회원당 유효 링크 한도). */
async function issue(title) {
  if (!ownerToken) {
    const login = await fetch(`${url}/v1/auth/dev-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'policy-owner' }),
    });
    ownerToken = (await login.json()).accessToken;
  }
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pol-${keySeq += 1}` },
    body: JSON.stringify({ title, password: PASSWORD }),
  });
  const link = await response.json();
  assert.equal(response.status, 201, JSON.stringify(link));
  return { linkId: link.linkId, token: link.url.split('/s/')[1] };
}

/** 정책을 주입한 서비스. clock을 넘기면 그 시계를 쓴다. */
function service(overrides = {}, clock = () => new Date()) {
  const policy = {
    address: { ...PRODUCT_UNLOCK_POLICY.address, ...overrides.address },
    link: { ...PRODUCT_UNLOCK_POLICY.link, ...overrides.link },
    hash: { ...PRODUCT_UNLOCK_POLICY.hash, ...overrides.hash },
  };
  const controls = createUnlockControls(policy);
  const access = new LinkAccessService(app.get(DataSource), app.get(LINK_GRANT_KEY, { strict: false }), controls, clock);
  return { access, controls };
}
/** unlock 결과를 상태로 바꾼다: 'ok' | 'invalid' | { limited: 남은 초 } | { code } */
async function attempt(access, token, password, address) {
  try {
    await access.unlock(token, { password }, address);
    return 'ok';
  } catch (error) {
    if (error.code === 'LINK_PASSWORD_INVALID') return 'invalid';
    if (error.code === 'LINK_UNLOCK_LIMITED') return { limited: error.retryAfterSeconds };
    return { code: error.code ?? error.message };
  }
}
const idle = (controls) => {
  assert.deepEqual(controls.hashes.stats, { active: 0, running: 0, waiting: 0 }, '해시 자원이 모두 풀렸다');
  assert.equal(controls.links.inFlight, 0, '링크 예약이 모두 풀렸다');
};
const waitFor = async (condition) => {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), '조건을 기다리다 시간 초과');
};
function holdHashSlots(controls, count) {
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const tickets = Array.from({ length: count }, () => controls.hashes.enter());
  const holders = tickets.map((ticket) => ticket.runHash(() => gate));
  return { release: async () => { open(); await Promise.all(holders); tickets.forEach((ticket) => ticket.leave()); } };
}

for (const N of CANDIDATES) {
  test(`[N=${N}] 여러 주소에서 차례로 N번 틀리면 링크가 차단되고, 새 주소의 맞는 비밀번호도 429다. 받아 둔 grant와 다른 링크는 영향이 없다`, async () => {
    const { access, controls } = service({ link: { maxFailures: N } });
    const link = await issue('누적 차단');
    const other = await issue('다른 링크');
    assert.equal(await attempt(access, link.token, PASSWORD, '4:192.0.2.250'), 'ok');
    const grant = (await access.unlock(link.token, { password: PASSWORD }, '4:192.0.2.251')).grant;
    for (let i = 0; i < N; i++) assert.equal(await attempt(access, link.token, 'wrong', `4:198.51.100.${i}`), 'invalid', `${i + 1}번째`);
    const blocked = await attempt(access, link.token, PASSWORD, '4:203.0.113.1');
    assert.ok(blocked.limited >= 899 && blocked.limited <= 900, JSON.stringify(blocked));
    assert.equal((await access.assertReadable(link.token, grant)).linkId, link.linkId, '받아 둔 grant로는 계속 열람');
    assert.equal(await attempt(access, other.token, PASSWORD, '4:203.0.113.1'), 'ok', '다른 링크는 막지 않음');
    idle(controls);
  });

  test(`[N=${N}] 서로 다른 주소에서 동시에 몰아 보내도, 모두 틀리면 차단 전 검사는 정확히 N번이다`, async () => {
    const { access, controls } = service({ link: { maxFailures: N } });
    const link = await issue('동시 누적');
    let checked = 0;
    let busy = 0;
    let blocked = false;
    let next = 0;
    for (let wave = 0; wave < N && !blocked; wave++) {
      const results = await Promise.all(Array.from({ length: 5 }, () => attempt(access, link.token, 'wrong', `4:198.51.100.${next++ % 250}`)));
      for (const result of results) {
        if (result === 'invalid') checked += 1;
        else if (result.limited === 1) busy += 1;
        else if (result.limited > 1) blocked = true;
        else assert.fail(JSON.stringify(result));
      }
    }
    assert.equal(checked, N);
    assert.ok(busy > 0, '검사 중 상한을 넘는 요청은 1초로 거절됐다');
    if (!blocked) blocked = (await attempt(access, link.token, PASSWORD, '4:203.0.113.9')).limited > 1;
    assert.equal(blocked, true);
    idle(controls);
  });
}

test('동시 검사 상한: 한 링크에 서로 다른 주소 6곳이 동시에 보내면 3개만 검사하고 3개는 실패로 세지 않고 1초로 거절한다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('동시 검사 상한');
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => attempt(access, link.token, 'wrong', `4:198.51.100.${i}`)));
  assert.equal(results.filter((result) => result === 'invalid').length, 3);
  assert.deepEqual(results.filter((result) => result !== 'invalid'), [{ limited: 1 }, { limited: 1 }, { limited: 1 }]);
  // 거절한 3개는 세지 않았다: 17번 더 틀리면(3 + 17 = 20) 그때 차단된다.
  for (let i = 0; i < 16; i++) await attempt(access, link.token, 'wrong', `4:192.0.2.${i}`);
  assert.equal(controls.links.blockedFor(link.linkId, new Date()), null, '19번까지 차단 전');
  await attempt(access, link.token, 'wrong', '4:192.0.2.100');
  assert.notEqual(controls.links.blockedFor(link.linkId, new Date()), null, '20번째에 차단');
  idle(controls);
});

test('해시 차례를 기다리는 동안 링크가 중단·만료되면 해시를 계산하지 않고 404이며, 실패로 세지 않는다', async () => {
  for (const change of ['stop', 'expire']) {
    await resetTestDatabase(db);
    ownerToken = undefined;
    const { access, controls } = service({ link: { maxFailures: 20 } });
    const link = await issue(`대기 중 ${change}`);
    const held = holdHashSlots(controls, 2);
    const pending = attempt(access, link.token, 'wrong', '4:198.51.100.1');
    await waitFor(() => controls.hashes.stats.waiting === 1);
    if (change === 'stop') await db.query('UPDATE share_link SET stopped_at = now() WHERE link_id = $1', [link.linkId]);
    else await db.query("UPDATE share_link SET issued_at = now() - interval '721 hours', expires_at = now() - interval '1 hour' WHERE link_id = $1", [link.linkId]);
    await held.release();
    assert.deepEqual(await pending, { code: 'LINK_UNAVAILABLE' }, change);
    assert.equal(controls.links.size, 0, '링크 실패로 세지 않았다');
    assert.equal(controls.addresses.blockedFor(`${link.linkId}|4:198.51.100.1`, new Date()), null);
    idle(controls);
  }
});

test('해시 차례를 기다리는 동안 차단되면 맞는 비밀번호도 해시 없이 429이고 grant를 주지 않는다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('대기 중 차단');
  const address = '4:198.51.100.7';
  const key = `${link.linkId}|${address}`;
  const held = holdHashSlots(controls, 2);
  const pending = attempt(access, link.token, PASSWORD, address);
  await waitFor(() => controls.hashes.stats.waiting === 1);
  for (let i = 0; i < 10; i++) controls.addresses.recordFailure(key, new Date()); // 같은 주소의 차단을 직접 건다
  await held.release();
  const result = await pending;
  assert.ok(result.limited >= 899, JSON.stringify(result));
  assert.notEqual(controls.addresses.blockedFor(key, new Date()), null, '차단이 남아 있다');
  idle(controls);
});

test('주소 차단과 링크 차단이 겹치면 Retry-After는 늦게 끝나는 쪽이다', async () => {
  let now = Date.now();
  const { access, controls } = service({ link: { maxFailures: 20 } }, () => new Date(now));
  const link = await issue('겹친 차단');
  const address = '4:198.51.100.8';
  for (let i = 0; i < 10; i++) await attempt(access, link.token, 'wrong', address); // 주소 차단(15분)
  now += 5 * 60 * 1000;
  for (let i = 0; i < 10; i++) await attempt(access, link.token, 'wrong', `4:192.0.2.${i}`); // 링크 누적 20 → 링크 차단(5분 뒤부터 15분)
  now += 60 * 1000;
  assert.deepEqual(await attempt(access, link.token, PASSWORD, address), { limited: 14 * 60 }, '주소 9분·링크 14분 중 14분');
  idle(controls);
});

test('비밀번호 검사 중 예외가 나도 실패로 세지 않고 해시·예약 자리를 모두 돌려준다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('깨진 검증값');
  await db.query("UPDATE share_link SET password_protection_reference = 'scrypt$1$broken' WHERE link_id = $1", [link.linkId]);
  const result = await attempt(access, link.token, PASSWORD, '4:198.51.100.9');
  assert.equal(typeof result.code, 'string', JSON.stringify(result));
  assert.notEqual(result.code, 'LINK_PASSWORD_INVALID');
  assert.equal(controls.links.size, 0, '링크 실패로 세지 않았다');
  idle(controls);
});

test('전체 자원 포화는 링크 구분 없이 걸려 다른 링크의 unlock도 1초로 거절하고, 풀리면 다시 받는다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 }, hash: { maxRunning: 1, maxWaiting: 1 } });
  const busyLink = await issue('몰린 링크');
  const otherLink = await issue('다른 링크');
  const held = holdHashSlots(controls, 1);
  const waiting = attempt(access, busyLink.token, 'wrong', '4:198.51.100.10');
  await waitFor(() => controls.hashes.stats.waiting === 1);
  assert.deepEqual(await attempt(access, otherLink.token, PASSWORD, '4:203.0.113.10'), { limited: 1 });
  await held.release();
  assert.equal(await waiting, 'invalid');
  assert.equal(await attempt(access, otherLink.token, PASSWORD, '4:203.0.113.10'), 'ok');
  idle(controls);
});

/** 비밀번호 검사(해시)를 감싸 실제 동시 실행 수를 재고, gate가 열릴 때까지 실행 중 상태로 붙잡는다. */
function instrumentHash(t) {
  const original = passwordModule.verifyLinkPassword;
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const probe = { calls: 0, active: 0, peak: 0, open: () => open() };
  passwordModule.verifyLinkPassword = async (...args) => {
    probe.calls += 1;
    probe.active += 1;
    probe.peak = Math.max(probe.peak, probe.active);
    try {
      await gate;
      return await original(...args);
    } finally {
      probe.active -= 1;
    }
  };
  t.after(() => { open(); passwordModule.verifyLinkPassword = original; });
  return probe;
}
function unlockOverHttp(token, password, signal) {
  return fetch(`${url}/v1/public/links/${token}/unlock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal,
  }).then(async (response) => { await response.arrayBuffer(); return response.status; }, (error) => error.name);
}

test('HTTP 요청을 해시 차례 대기 중에 취소하면, 서버는 차례가 왔을 때 그대로 검사·기록하고 자리를 돌려준다', async (t) => {
  const probe = instrumentHash(t);
  probe.open(); // 이 시험은 해시를 붙잡지 않는다
  const link = await issue('대기 중 취소');
  const held = holdHashSlots(appControls, 2);
  const controller = new AbortController();
  const request = unlockOverHttp(link.token, 'wrong', controller.signal);
  await waitFor(() => appControls.hashes.stats.waiting === 1);
  controller.abort();
  assert.equal(await request, 'AbortError');
  assert.equal(probe.calls, 0, '취소한 시점에는 아직 해시를 시작하지 않았다');
  await held.release();
  await waitFor(() => appControls.hashes.stats.active === 0);
  assert.equal(probe.calls, 1, '연결이 끊겨도 차례가 오면 서버는 검사한다(틀린 비밀번호는 실패로 센다)');
  idle(appControls);
  assert.equal(await unlockOverHttp(link.token, PASSWORD), 200);
  idle(appControls);
});

test('HTTP 요청을 해시 실행 중에 취소해도 해시가 끝나기 전에는 실행 자리를 돌려주지 않고, 새 요청이 와도 실제 동시 해시는 2개를 넘지 않는다', async (t) => {
  const probe = instrumentHash(t);
  const first = await issue('실행 중 취소 1');
  const second = await issue('실행 중 취소 2');
  const third = await issue('실행 중 취소 3');
  const controller = new AbortController();
  const canceled = unlockOverHttp(first.token, 'wrong', controller.signal);
  const running = unlockOverHttp(second.token, 'wrong');
  await waitFor(() => probe.active === 2 && appControls.hashes.stats.running === 2);

  controller.abort();
  assert.equal(await canceled, 'AbortError');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(probe.active, 2, '취소한 요청의 해시가 아직 실행 중이다');
  assert.equal(appControls.hashes.stats.running, 2, '해시가 끝나기 전에는 실행 자리를 돌려주지 않는다');

  const late = unlockOverHttp(third.token, 'wrong');
  await waitFor(() => appControls.hashes.stats.waiting === 1);
  assert.equal(probe.active, 2, '새 요청은 해시를 시작하지 않고 기다린다');

  probe.open();
  assert.equal(await running, 401);
  assert.equal(await late, 401);
  await waitFor(() => appControls.hashes.stats.active === 0);
  assert.equal(probe.calls, 3);
  assert.equal(probe.peak, 2, '실제 동시 해시는 2개를 넘지 않았다');
  idle(appControls);
});
