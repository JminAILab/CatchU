// U4 제출 3 — 발행본 unlock 제한(POST /v1/public/links/:token/unlock의 시도·주소·동시성·빈도 제한) 시험.
//
// 10월 `test/db/public-links-unlock.test.cjs`·`public-links-unlock-policy.test.cjs`·`public-links-client-address.test.cjs`의 사례를 share_link 경로에서
// 발행본 경로로 옮긴다(보안 설계 「web 시험 유지·제거 (R-03)」 api 문단·「비밀번호 통과 (unlock)」, BR6.3, NFR1.7, scalability NFR4.13). 기대 동작은 10월
// 그대로이고 바뀌는 것은 대상(발행본 토큰)·제한 키의 링크 단위(publicationId)·공급자 위치(PublicationsModule)뿐이다. Step 19(2026-11-05)에서 확정했고,
// 세부 시험 코드는 Step 20·21 구현 뒤 Step 23에서 옮겨 썼다. 10월 세 파일은 지웠다. 기본 판정(404·400·401·200, S8·S14, 보안 이벤트)은 recipient-api 시험이 본다.
//
// 표시: [NFR-6 결정] = #416 OQ-U4-NFR-6 팀장 결정(2026-11-05, 1번 A·2번 예). 작성자(소유 회원) 비활성은 중지·만료 다음, 비밀번호 앞에 404로 판정하고, 통과한
//      요청은 작성자 비활성만을 이유로 취소하지 않고 다음 요청(unlock은 해시 직전 재판정)에서 막는다.
//
// 운영 정책값(PRODUCT_UNLOCK_POLICY, 10월 그대로): 주소 단위 실패 10회, 링크 단위 실패 30회/15분·차단 15분·동시 검사 3, 해시 동시 2·대기 20, 요청 빈도 20회/분.
// 시험은 10월 방식대로 정책값을 줄여 넣는다.
//
// 기본 판정 (10월 public-links-unlock 사례)
//   - 기대: 맞는 비밀번호 200 { grant }, 틀리면 401 LINK_PASSWORD_INVALID, 회원 JWT 없이 처리. 없는·형식 오류·중지·만료 발행본은 비밀번호와 무관하게 같은
//           404(details 없음). 비밀번호 없는 발행본은 400 INVALID_REQUEST, 본문 형식 오류는 400 VALIDATION_FAILED. 발급 길이 기준(8~64자)은 unlock에 적용하지 않고
//           저장된 scrypt 검증값과만 비교. 같은 주소에서 10번 틀리면 맞는 비밀번호도 429 LINK_UNLOCK_LIMITED이고 Retry-After는 올림한 남은 초이며 차단 중
//           요청으로 늘지 않음. 같은 발행본·주소의 동시 요청은 하나씩 검사하고 실행 중 포함 3개 초과는 검사 없이 429(Retry-After 1). 이미 차단된 발행본·주소는
//           대기열이 가득 차도 실제 남은 초로 429. 동시 요청을 몰아 보내도 비밀번호 검사는 10번을 넘지 않음. 검사 중 차단이 걸리면 늦게 성공한 요청도 429,
//           grant 없음, 차단 유지. 로그에 비밀번호·grant·토큰 없음. 비밀번호 실패·차단은 보안 이벤트 한 줄씩(10월 #222), 민감정보 제외.
//   - 실패 조건: 제한 중 grant 발급, 429 때 scrypt 계산, 400이 404보다 먼저, 로그에 민감정보.
// 링크 단위 정책 (10월 public-links-unlock-policy 사례)
//   - 기대: 여러 주소에서 차례로 30번 틀리면 발행본이 차단되고 새 주소의 맞는 비밀번호도 429. 받아 둔 grant와 다른 발행본은 영향 없음. 서로 다른 주소의 동시
//           실패도 차단 전 검사는 정확히 30번. 한 발행본에 주소 6곳이 동시에 보내면 3개만 검사하고 3개는 실패로 세지 않고 Retry-After 1로 거절. 해시 차례를
//           기다리는 동안 중지·만료되면 해시 없이 404이고 실패로 세지 않음([NFR-6 결정] 소유 회원 비활성도 같은 404). 해시 전에 발행본·소유 회원을
//           두 번(처음·해시 직전) 읽기 전용 REPEATABLE READ 트랜잭션에서 판정하고 계산 중에는 트랜잭션·잠금을 두지 않음. [NFR-6 결정] 발행본·소유 회원
//           판정은 같은 시점이라 읽은 뒤 커밋된 비활성화는 그 판정에 보이지 않고 해시 직전 새 판정에서 404. 대기 중 차단되면 맞는 비밀번호도 해시 없이 429.
//           같은 발행본·주소의 요청 빈도 20회/분 초과는 해시 없이 429이고 다른 주소·발행본은 따로 세며 창이 지나면 다시 받음. 주소 차단과 발행본 차단이 겹치면
//           Retry-After는 늦게 끝나는 쪽. 검사 중 예외는 실패로 세지 않고 해시·예약 자리를 돌려줌. 전체 자원 포화(해시 대기 20 초과)는 발행본 구분 없이 1초로
//           거절하고 풀리면 다시 받음. 요청을 대기 중 취소해도 차례가 오면 그대로 검사·기록하고 자리를 돌려주며, 실행 중 취소는 해시가 끝나야 자리를 돌려주고
//           실제 동시 해시는 2개를 넘지 않음.
//   - 실패 조건: 차단 키가 토큰이나 share_link ID(publicationId가 아님), 다른 발행본에 차단이 번짐, 대기 중 중지·만료·비활성에 해시 계산, 동시 해시 3개.
// 주소 단위 (10월 public-links-client-address 사례)
//   - 기대: 신뢰 프록시 미설정이면 X-Forwarded-For를 무시하고 직접 연결 주소로 셈. 신뢰 프록시가 연결 주소를 포함하지 않아도 무시. 신뢰 프록시 설정이면 프록시가
//           전한 주소별로 세고 앞에 꾸민 주소는 무시하고 마지막 주소로 셈. 같은 IPv6 /64는 한 칸, 다른 /64는 다른 칸, IPv4 매핑 IPv6는 같은 IPv4와 한 칸.
//           신뢰 프록시 설정값이 잘못되면 앱을 시작하지 않음(10월 기동 검사 그대로). 운영 정책 그대로(30회): 여러 주소의 실패가 발행본 전체로 30회 쌓이면 새
//           unlock을 15분 막고, 중간 성공은 누적을 지우지 않으며, 받아 둔 grant로는 계속 열람.
//   - 실패 조건: 꾸민 X-Forwarded-For로 주소 칸을 바꿈, IPv6 /64 분리, 누적이 성공으로 지워짐.
// 공급자: 제한기(UNLOCK_POLICY·UNLOCK_CONTROLS)는 PublicationsModule에만 하나다. ShareLinksModule 제거 뒤 두 벌이 생기거나 하나도 없으면 실패(app-routes 시험과 대조).
//
// 실제 AppModule·테스트 DB를 쓴다(발행본은 발행 API, U2·U3는 계약 모양 가짜). 회원·발행본·비밀번호·주소는 모두 합성이다. 주소는 문서용 예시 대역(RFC 5737·3849).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { OwnerProfileReader } = require('../../dist/member-profile/owner-profile-reader');
const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
const { RecipientAccessService } = require('../../dist/publications/recipient-access.service');
const { LINK_GRANT_KEY } = require('../../dist/share-links/link-grant');
const passwordModule = require('../../dist/share-links/link-password');
const { generateLinkToken } = require('../../dist/share-links/link-token');
const { createUnlockControls, PRODUCT_UNLOCK_POLICY, UNLOCK_CONTROLS } = require('../../dist/share-links/unlock-policy');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, consent, fakeAiRun, fakeIndexWriter, bindFakes, publishLink, recipientGet, unlockRaw,
} = require('./support.cjs');

const PASSWORD = 'synthetic-recipient-password';
const SEQUENTIAL_N = 5;
const CONCURRENT_N = 30;
const LIMIT = 10;
let server, db, restore, unbind, appControls, owner;

before(async () => {
  restore = setEnv({ ...PUBLISH_SETTINGS, TRUST_PROXY_CIDRS: undefined });
  server = await startApp(AppModule);
  db = await openTestDataSource();
  appControls = server.app.get(UNLOCK_CONTROLS, { strict: false });
});
after(async () => {
  await server?.app.close();
  await db?.destroy();
  restore?.();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  owner = null;
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
});

/** 발행 API로 발행본을 만든다. password를 주지 않으면 비밀번호 링크(PASSWORD), null이면 비밀번호 없는 링크다. */
async function issue(title, password = PASSWORD) {
  if (!owner) {
    owner = await server.login(`u4-unlock-owner-${randomUUID()}`);
    await consent(server.app, owner.memberId);
  }
  return publishLink(server, db, owner, { title, password: password ?? undefined });
}
const unlock = (token, payload, headers) => unlockRaw(server, token, payload, headers);
const read = (token, grant) => recipientGet(server, token, grant);
const expectError = (result, status, code) => {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code);
  assert.equal(result.cacheControl, 'no-store');
};
const stopPublication = (publicationId) => db.query('UPDATE publication SET stopped_at = GREATEST(now(), published_at) WHERE publication_id = $1', [publicationId]);
const expirePublication = (publicationId) => db.query(
  "UPDATE publication SET published_at = now() - interval '2161 hours', expires_at = now() - interval '1 hour' WHERE publication_id = $1", [publicationId]);
const deactivateOwner = (publicationId) => db.query(
  "UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = (SELECT member_id FROM publication WHERE publication_id = $1)", [publicationId]);
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.code, code); return true; });

/** 정책을 주입한 받은 사람 서비스. clock을 넘기면 그 시계를 쓴다. 판정·사본은 앱의 C-10 DB 구현을 그대로 쓴다. */
function service(overrides = {}, clock = () => new Date()) {
  const policy = {
    address: { ...PRODUCT_UNLOCK_POLICY.address, ...overrides.address },
    link: { ...PRODUCT_UNLOCK_POLICY.link, ...overrides.link },
    hash: { ...PRODUCT_UNLOCK_POLICY.hash, ...overrides.hash },
    rate: { ...PRODUCT_UNLOCK_POLICY.rate, ...overrides.rate },
  };
  const controls = createUnlockControls(policy);
  const access = new RecipientAccessService(server.app.get(DataSource), server.app.get(DbPublicationAccess),
    server.app.get(LINK_GRANT_KEY, { strict: false }), controls, clock);
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
  assert.equal(controls.links.inFlight, 0, '발행본 예약이 모두 풀렸다');
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
/** 앱의 OwnerProfileReader 인스턴스의 readOwnerState를 감싼다. 감싼 함수는 (ownerId, manager, original)을 받는다. */
function wrapOwnerState(t, wrapper) {
  const reader = server.app.get(OwnerProfileReader, { strict: false });
  const original = OwnerProfileReader.prototype.readOwnerState;
  reader.readOwnerState = function (ownerId, manager) { return wrapper(ownerId, manager, (...args) => original.apply(this, args)); };
  t.after(() => { delete reader.readOwnerState; });
}

// ── 기본 판정 (10월 public-links-unlock) ────────────────────────────────────────────────────────────────────────────────

test('unlock은 발급 길이 기준(8~64자)을 적용하지 않고 저장된 검증값과 비교하며, 길이를 벗어난 틀린 입력도 400이 아니라 401이다', async () => {
  const link = await issue('짧은 비밀번호 링크');
  for (const short of ['a', '1234567']) {
    await db.query('UPDATE publication SET password_protection_reference = $2 WHERE publication_id = $1', [link.publicationId, await passwordModule.hashLinkPassword(short)]);
    const ok = await unlock(link.token, { password: short });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await read(link.token, ok.body.grant)).status, 200);
  }
  for (const wrong of ['b', 'x'.repeat(65)]) expectError(await unlock(link.token, { password: wrong }), 401, 'LINK_PASSWORD_INVALID');
});

test('10번 틀리면 맞는 비밀번호도 429 LINK_UNLOCK_LIMITED이고, Retry-After는 올림한 남은 초이며 차단 중 요청으로 늘어나지 않고, 같은 주소의 다른 발행본은 막지 않는다', async () => {
  const link = await issue('차단 링크');
  const other = await issue('같은 접속지의 다른 링크');
  for (let i = 0; i < LIMIT; i++) expectError(await unlock(link.token, { password: `wrong-${i}` }), 401, 'LINK_PASSWORD_INVALID');
  const first = await unlock(link.token, { password: PASSWORD });
  expectError(first, 429, 'LINK_UNLOCK_LIMITED');
  assert.deepEqual(Object.keys(first.body).sort(), ['code', 'message']);
  assert.match(first.retryAfter, /^\d+$/);
  assert.ok(Number(first.retryAfter) >= 899 && Number(first.retryAfter) <= 900, first.retryAfter);
  expectError(await unlock(link.token, { password: '' }), 400, 'VALIDATION_FAILED');
  expectError(await unlock(link.token, { pass: PASSWORD }), 400, 'VALIDATION_FAILED');
  for (let i = 0; i < 5; i++) expectError(await unlock(link.token, { password: 'wrong-again' }), 429, 'LINK_UNLOCK_LIMITED');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const later = await unlock(link.token, { password: PASSWORD });
  expectError(later, 429, 'LINK_UNLOCK_LIMITED');
  // 보조 확인: 1초 뒤 남은 초가 줄었다. 차단 종료 시각 불변의 주 근거는 가짜 시계 단위 시험(unlock-limiter.test.cjs)이다.
  assert.ok(Number(later.retryAfter) < Number(first.retryAfter), `${later.retryAfter} < ${first.retryAfter}`);
  assert.equal((await unlock(other.token, { password: PASSWORD })).status, 200, '발행본·접속지 단위라 다른 발행본은 막지 않는다');
});

test('같은 발행본·접속지의 동시 요청은 하나씩 검사하고, 실행 중 포함 3개를 넘는 요청은 검사 없이 429(Retry-After 1)다', async () => {
  const link = await issue('동시 시도 링크');
  const results = await Promise.all(Array.from({ length: 15 }, (_, i) => unlock(link.token, { password: `wrong-${i}` })));
  const invalid = results.filter(({ status }) => status === 401);
  const busy = results.filter(({ status }) => status === 429);
  assert.equal(invalid.length + busy.length, 15);
  assert.ok(invalid.length <= 3, `검사한 요청은 실행 중 포함 동시 상한 3 이하(${invalid.length})`);
  for (const result of busy) {
    assert.equal(result.body.code, 'LINK_UNLOCK_LIMITED');
    assert.equal(result.retryAfter, '1');
  }
});

test('이미 차단된 발행본·접속지는 대기열이 가득 차 있어도 실제 남은 초로 429다(Retry-After 1로 덮어쓰지 않음)', async () => {
  const link = await issue('차단 뒤 대기열');
  const access = server.app.get(RecipientAccessService);
  const limiter = appControls.addresses;
  const client = 'blocked-queue-client';
  const key = `${link.publicationId}|${client}`;
  for (let i = 0; i < LIMIT; i++) {
    limiter.check(key, new Date());
    limiter.recordFailure(key, new Date());
  }
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const holders = Array.from({ length: 3 }, () => limiter.runExclusive(key, () => gate));
  try {
    await assert.rejects(access.unlock(link.token, { password: PASSWORD }, client), (error) => {
      assert.equal(error.code, 'LINK_UNLOCK_LIMITED');
      assert.ok(error.retryAfterSeconds >= 899, `차단 잔여 시간(${error.retryAfterSeconds})`);
      return true;
    });
  } finally {
    open();
    await Promise.all(holders);
  }
});

test('동시 요청을 몰아 보내도 비밀번호 검사는 한도(10번)를 넘지 않는다', async () => {
  const link = await issue('몰아 보내기 링크');
  let checked = 0;
  let blocked = false;
  for (let wave = 0; wave < 10 && !blocked; wave++) {
    const results = await Promise.all(Array.from({ length: 3 }, () => unlock(link.token, { password: 'wrong' })));
    checked += results.filter(({ status }) => status === 401).length;
    blocked = results.some(({ status, retryAfter }) => status === 429 && Number(retryAfter) > 1);
  }
  assert.equal(checked, LIMIT, '차단 전까지 정확히 10번만 검사한다');
  assert.equal(blocked, true);
  expectError(await unlock(link.token, { password: PASSWORD }), 429, 'LINK_UNLOCK_LIMITED');
});

test('비밀번호를 검사하는 사이 차단이 걸리면(방어적 재확인), 늦게 성공한 요청도 429이며 grant를 주지 않고 차단을 지우지 않는다', async () => {
  const link = await issue('늦은 성공 링크');
  const access = server.app.get(RecipientAccessService);
  const limiter = appControls.addresses;
  const client = 'late-success-client';
  const key = `${link.publicationId}|${client}`;
  const original = limiter.check.bind(limiter);
  let injected = false;
  limiter.check = (target, now) => {
    const result = original(target, now);
    if (!injected && target === key) {
      injected = true;
      for (let i = 0; i < LIMIT; i++) limiter.recordFailure(key, new Date());
    }
    return result;
  };
  const pending = access.unlock(link.token, { password: PASSWORD }, client);
  await assert.rejects(pending.finally(() => { limiter.check = original; }), (error) => {
    assert.equal(error.code, 'LINK_UNLOCK_LIMITED');
    assert.ok(error.retryAfterSeconds >= 899);
    return true;
  });
  assert.equal(injected, true);
  assert.equal(limiter.check(key, new Date()).blocked, true, '차단이 남아 있다');
  await assert.rejects(access.unlock(link.token, { password: PASSWORD }, client), (error) => error.code === 'LINK_UNLOCK_LIMITED');
});

test('열람 판정: 비밀번호 발행본은 그 발행본의 grant가 있어야 하고, grant로 중지·만료를 우회하지 못한다(서비스 직접 호출)', async () => {
  const link = await issue('보호 링크');
  const otherLink = await issue('다른 보호 링크');
  const open = await issue('공개 링크', null);
  const access = server.app.get(RecipientAccessService);
  const grant = (await unlock(link.token, { password: PASSWORD })).body.grant;
  const otherGrant = (await unlock(otherLink.token, { password: PASSWORD })).body.grant;

  assert.equal((await access.read(link.token, grant)).title, '보호 링크');
  assert.equal((await access.read(open.token, undefined)).title, '공개 링크', '비밀번호 없는 발행본은 grant 없이 조회');
  await rejectsCode(access.read(link.token, undefined), 'LINK_PASSWORD_REQUIRED');
  await rejectsCode(access.read(link.token, otherGrant), 'LINK_PASSWORD_REQUIRED');
  await rejectsCode(access.read(link.token, `${grant.slice(0, -2)}AA`), 'LINK_PASSWORD_REQUIRED');
  await stopPublication(link.publicationId);
  await rejectsCode(access.read(link.token, grant), 'LINK_UNAVAILABLE');
  await expirePublication(otherLink.publicationId);
  await rejectsCode(access.read(otherLink.token, otherGrant), 'LINK_UNAVAILABLE');
  await rejectsCode(access.read(generateLinkToken(), undefined), 'LINK_UNAVAILABLE');
});

test('로그에 비밀번호·grant·링크 토큰을 남기지 않는다', async () => {
  const link = await issue('로그 링크');
  await unlock(link.token, { password: 'wrong-password-for-log' });
  const grant = (await unlock(link.token, { password: PASSWORD })).body.grant;
  const text = server.logs.map((line) => line.text).join('\n');
  for (const secret of [PASSWORD, 'wrong-password-for-log', grant, link.token]) assert.equal(text.includes(secret), false);
});

// ── 링크 단위 정책 (10월 public-links-unlock-policy) ──────────────────────────────────────────────────────────────────────

test(`[N=${SEQUENTIAL_N}] 여러 주소에서 차례로 N번 틀리면 발행본이 차단되고, 새 주소의 맞는 비밀번호도 429다. 받아 둔 grant와 다른 발행본은 영향이 없다`, async () => {
  const N = SEQUENTIAL_N;
  const { access, controls } = service({ link: { maxFailures: N } });
  const link = await issue('누적 차단');
  const other = await issue('다른 링크');
  assert.equal(await attempt(access, link.token, PASSWORD, '4:192.0.2.250'), 'ok');
  const grant = (await access.unlock(link.token, { password: PASSWORD }, '4:192.0.2.251')).grant;
  for (let i = 0; i < N; i++) assert.equal(await attempt(access, link.token, 'wrong', `4:198.51.100.${i}`), 'invalid', `${i + 1}번째`);
  const blocked = await attempt(access, link.token, PASSWORD, '4:203.0.113.1');
  assert.ok(blocked.limited >= 899 && blocked.limited <= 900, JSON.stringify(blocked));
  assert.equal((await access.read(link.token, grant)).title, '누적 차단', '받아 둔 grant로는 계속 열람');
  assert.equal(await attempt(access, other.token, PASSWORD, '4:203.0.113.1'), 'ok', '다른 발행본은 막지 않음');
  idle(controls);
});

test(`[N=${CONCURRENT_N}] 서로 다른 주소에서 동시에 몰아 보내도, 모두 틀리면 차단 전 검사는 정확히 N번이다`, async () => {
  const N = CONCURRENT_N;
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

test('동시 검사 상한: 한 발행본에 서로 다른 주소 6곳이 동시에 보내면 3개만 검사하고 3개는 실패로 세지 않고 1초로 거절한다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('동시 검사 상한');
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => attempt(access, link.token, 'wrong', `4:198.51.100.${i}`)));
  assert.equal(results.filter((result) => result === 'invalid').length, 3);
  assert.deepEqual(results.filter((result) => result !== 'invalid'), [{ limited: 1 }, { limited: 1 }, { limited: 1 }]);
  for (let i = 0; i < 16; i++) await attempt(access, link.token, 'wrong', `4:192.0.2.${i}`);
  assert.equal(controls.links.blockedFor(link.publicationId, new Date()), null, '19번까지 차단 전');
  await attempt(access, link.token, 'wrong', '4:192.0.2.100');
  assert.notEqual(controls.links.blockedFor(link.publicationId, new Date()), null, '20번째에 차단');
  idle(controls);
});

test('해시 차례를 기다리는 동안 발행본이 중지·만료되거나 [NFR-6 결정] 작성자가 비활성이 되면 해시를 계산하지 않고 404이며, 실패로 세지 않는다', async () => {
  for (const change of ['stop', 'expire', 'deactivate']) {
    await resetTestDatabase(db);
    owner = null;
    const { access, controls } = service({ link: { maxFailures: 20 } });
    const link = await issue(`대기 중 ${change}`);
    const held = holdHashSlots(controls, 2);
    const pending = attempt(access, link.token, 'wrong', '4:198.51.100.1');
    await waitFor(() => controls.hashes.stats.waiting === 1);
    if (change === 'stop') await stopPublication(link.publicationId);
    else if (change === 'expire') await expirePublication(link.publicationId);
    else await deactivateOwner(link.publicationId);
    await held.release();
    assert.deepEqual(await pending, { code: 'LINK_UNAVAILABLE' }, change);
    assert.equal(controls.links.size, 0, '발행본 실패로 세지 않았다');
    assert.equal(controls.addresses.blockedFor(`${link.publicationId}|4:198.51.100.1`, new Date()), null);
    idle(controls);
  }
});

test('unlock은 비밀번호 계산 전에 발행본·소유 회원을 두 번(처음·해시 직전) 읽기 전용 REPEATABLE READ 트랜잭션에서 판정하고, 계산 중에는 그 트랜잭션·잠금을 두지 않는다', async (t) => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('해시 중 트랜잭션');
  const judged = [];
  wrapOwnerState(t, async (ownerId, manager, original) => {
    const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
    const [{ transaction_read_only: readOnly }] = await manager.query('SHOW transaction_read_only');
    judged.push({ isolation, readOnly, active: manager.queryRunner?.isTransactionActive === true });
    return original(ownerId, manager);
  });
  const originalHash = passwordModule.verifyLinkPassword;
  const during = [];
  passwordModule.verifyLinkPassword = async (...args) => {
    const [row] = await db.query(`SELECT
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
         AND state LIKE 'idle in transaction%') AS "idleInTransaction",
      (SELECT count(*)::int FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
         WHERE c.relname IN ('publication', 'member_account') AND l.pid <> pg_backend_pid()) AS "tableLocks"`);
    during.push(row);
    return originalHash(...args);
  };
  t.after(() => { passwordModule.verifyLinkPassword = originalHash; });

  assert.equal(await attempt(access, link.token, PASSWORD, '4:198.51.100.30'), 'ok');
  assert.equal(await attempt(access, link.token, 'wrong', '4:198.51.100.31'), 'invalid');
  assert.deepEqual(judged, Array(4).fill({ isolation: 'repeatable read', readOnly: 'on', active: true }), '요청마다 처음·해시 직전 두 번');
  assert.deepEqual(during, [{ idleInTransaction: 0, tableLocks: 0 }, { idleInTransaction: 0, tableLocks: 0 }]);
  idle(controls);
});

test('[NFR-6 결정] unlock의 발행본·소유 회원 판정은 같은 시점이다: 발행본을 읽은 뒤 커밋된 비활성화는 그 판정에 보이지 않고, 해시 직전 새 판정에서 404로 반영된다', async (t) => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('판정 시점');
  const seen = [];
  wrapOwnerState(t, async (ownerId, manager, original) => {
    if (seen.length === 0) await db.query("UPDATE member_account SET account_state = 'SUSPENDED' WHERE member_id = $1", [ownerId]);
    const state = await original(ownerId, manager);
    seen.push(state);
    return state;
  });
  const originalHash = passwordModule.verifyLinkPassword;
  let hashed = 0;
  passwordModule.verifyLinkPassword = async (...args) => { hashed += 1; return originalHash(...args); };
  t.after(() => { passwordModule.verifyLinkPassword = originalHash; });

  assert.deepEqual(await attempt(access, link.token, PASSWORD, '4:198.51.100.40'), { code: 'LINK_UNAVAILABLE' });
  assert.deepEqual(seen, ['AVAILABLE', 'INACTIVE'], '첫 판정은 발행본 조회 시점의 ACTIVE, 해시 직전 새 판정은 비활성');
  assert.equal(hashed, 0, '해시를 계산하지 않았다');
  assert.equal(controls.links.size, 0, '실패로 세지 않았다');
  idle(controls);
});

test('해시 차례를 기다리는 동안 차단되면 맞는 비밀번호도 해시 없이 429이고 grant를 주지 않는다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('대기 중 차단');
  const address = '4:198.51.100.7';
  const key = `${link.publicationId}|${address}`;
  const held = holdHashSlots(controls, 2);
  const pending = attempt(access, link.token, PASSWORD, address);
  await waitFor(() => controls.hashes.stats.waiting === 1);
  for (let i = 0; i < LIMIT; i++) controls.addresses.recordFailure(key, new Date());
  await held.release();
  const result = await pending;
  assert.ok(result.limited >= 899, JSON.stringify(result));
  assert.notEqual(controls.addresses.blockedFor(key, new Date()), null, '차단이 남아 있다');
  idle(controls);
});

test('같은 발행본·주소의 요청 빈도 상한(#219)을 넘으면 맞는 비밀번호도 해시 없이 429이고, 다른 주소·다른 발행본은 따로 세며 창이 지나면 다시 받는다', async (t) => {
  let now = Date.now();
  const { access, controls } = service({ rate: { maxRequests: 3 } }, () => new Date(now));
  const link = await issue('빈도 링크');
  const other = await issue('빈도 다른 링크');
  const address = '4:198.51.100.20';
  const original = passwordModule.verifyLinkPassword;
  let hashed = 0;
  passwordModule.verifyLinkPassword = async (...args) => { hashed += 1; return original(...args); };
  t.after(() => { passwordModule.verifyLinkPassword = original; });

  for (let i = 0; i < 3; i++) {
    assert.equal(await attempt(access, link.token, PASSWORD, address), 'ok');
    now += 1000;
  }
  assert.equal(hashed, 3);
  assert.deepEqual(await attempt(access, link.token, PASSWORD, address), { limited: 57 }, '첫 요청이 창(1분)을 벗어날 때까지');
  assert.deepEqual(await attempt(access, link.token, 'wrong', address), { limited: 57 }, '틀린 비밀번호도 같고, 실패로 세지 않는다');
  assert.equal(hashed, 3, '빈도 상한으로 거부한 요청은 해시를 계산하지 않는다');
  assert.equal(await attempt(access, link.token, PASSWORD, '4:198.51.100.21'), 'ok', '다른 주소는 따로 센다');
  assert.equal(await attempt(access, other.token, PASSWORD, address), 'ok', '같은 주소라도 다른 발행본은 따로 센다');
  assert.equal(controls.links.blockedFor(link.publicationId, new Date(now)), null);

  now += 57 * 1000;
  assert.equal(await attempt(access, link.token, PASSWORD, address), 'ok', '창이 지나면 다시 받는다');
  idle(controls);
});

test('주소 차단과 발행본 차단이 겹치면 Retry-After는 늦게 끝나는 쪽이다', async () => {
  let now = Date.now();
  const { access, controls } = service({ link: { maxFailures: 20 } }, () => new Date(now));
  const link = await issue('겹친 차단');
  const address = '4:198.51.100.8';
  for (let i = 0; i < LIMIT; i++) await attempt(access, link.token, 'wrong', address); // 주소 차단(15분)
  now += 5 * 60 * 1000;
  for (let i = 0; i < 10; i++) await attempt(access, link.token, 'wrong', `4:192.0.2.${i}`); // 발행본 누적 20 → 차단(5분 뒤부터 15분)
  now += 60 * 1000;
  assert.deepEqual(await attempt(access, link.token, PASSWORD, address), { limited: 14 * 60 }, '주소 9분·발행본 14분 중 14분');
  idle(controls);
});

test('비밀번호 검사 중 예외가 나도 실패로 세지 않고 해시·예약 자리를 모두 돌려준다', async () => {
  const { access, controls } = service({ link: { maxFailures: 20 } });
  const link = await issue('깨진 검증값');
  await db.query("UPDATE publication SET password_protection_reference = 'scrypt$1$broken' WHERE publication_id = $1", [link.publicationId]);
  const result = await attempt(access, link.token, PASSWORD, '4:198.51.100.9');
  assert.equal(typeof result.code, 'string', JSON.stringify(result));
  assert.notEqual(result.code, 'LINK_PASSWORD_INVALID');
  assert.equal(controls.links.size, 0, '발행본 실패로 세지 않았다');
  idle(controls);
});

test('전체 자원 포화는 발행본 구분 없이 걸려 다른 발행본의 unlock도 1초로 거절하고, 풀리면 다시 받는다', async () => {
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
  return fetch(`${server.url}/v1/public/links/${token}/unlock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal,
  }).then(async (response) => { await response.arrayBuffer(); return response.status; }, (error) => error.name);
}

test('HTTP 요청을 해시 차례 대기 중에 취소하면, 서버는 차례가 왔을 때 그대로 검사·기록하고 자리를 돌려준다', async (t) => {
  const probe = instrumentHash(t);
  probe.open();
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

// ── 주소 단위 (10월 public-links-client-address) ─────────────────────────────────────────────────────────────────────────

/** TRUST_PROXY_CIDRS 값을 정해 앱을 따로 띄운다. undefined면 설정을 지운다. 시나리오마다 새 발행본을 써서 서로 섞이지 않게 한다. */
async function startWithProxy(t, trust) {
  const restoreEnv = setEnv({ TRUST_PROXY_CIDRS: trust });
  const proxied = await startApp(AppModule);
  t.after(async () => { try { await proxied.app.close(); } finally { restoreEnv(); } });
  const unbindFakes = bindFakes(proxied.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
  t.after(unbindFakes);
  const member = await proxied.login(`u4-proxy-owner-${randomUUID()}`);
  await consent(proxied.app, member.memberId);
  const link = async () => (await publishLink(proxied, db, member, { password: PASSWORD })).token;
  async function unlockFull(token, password, forwardedFor) {
    const headers = forwardedFor === undefined ? {} : { 'X-Forwarded-For': forwardedFor };
    return unlockRaw(proxied, token, { password }, headers);
  }
  const unlockStatus = async (token, password, forwardedFor) => (await unlockFull(token, password, forwardedFor)).status;
  async function failFrom(token, addresses) {
    for (const address of addresses) assert.equal(await unlockStatus(token, 'wrong-password', address), 401, String(address));
  }
  return { link, unlock: unlockStatus, unlockFull, failFrom, access: proxied.app.get(RecipientAccessService) };
}
const range = (count, make) => Array.from({ length: count }, (_, index) => make(index + 1));

test('신뢰 프록시 미설정: 꾸민 X-Forwarded-For는 무시하고 직접 연결 주소 하나로 센다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, undefined);
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await send(token, PASSWORD, '198.51.100.200'), 429, '헤더를 바꿔도 같은 주소로 차단');
  assert.equal(await send(token, PASSWORD, undefined), 429);
});

test('신뢰 프록시가 연결 주소를 포함하지 않으면 X-Forwarded-For를 무시한다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, '10.0.0.0/8');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await send(token, PASSWORD, '198.51.100.200'), 429);
});

test('신뢰 프록시 설정: 프록시가 전한 주소별로 따로 센다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}`));
  assert.equal(await send(token, PASSWORD, '198.51.100.200'), 200, '다른 주소는 각각 1회 실패라 차단되지 않음');

  const blocked = await link();
  await failFrom(blocked, range(LIMIT, () => '203.0.113.50'));
  assert.equal(await send(blocked, PASSWORD, '203.0.113.50'), 429, '같은 주소 10회 실패 뒤 맞는 비밀번호도 429');
  assert.equal(await send(blocked, PASSWORD, '203.0.113.51'), 200, '다른 주소는 막지 않음');
});

test('신뢰 프록시 설정: 받은 사람이 앞에 꾸며 넣은 주소는 무시하고 프록시가 붙인 마지막 주소로 센다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `198.51.100.${n}, 203.0.113.60`));
  assert.equal(await send(token, PASSWORD, '198.51.100.250, 203.0.113.60'), 429);
  assert.equal(await send(token, PASSWORD, '203.0.113.60'), 429);
});

test('신뢰 프록시 설정: 같은 IPv6 /64는 한 칸, 다른 /64는 다른 칸이다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => `2001:db8:1:2::${n.toString(16)}`));
  assert.equal(await send(token, PASSWORD, '2001:db8:1:2:ffff:ffff:ffff:ffff'), 429, '같은 /64의 다른 주소');
  assert.equal(await send(token, PASSWORD, '2001:db8:1:3::1'), 200, '다른 /64');
});

test('신뢰 프록시 설정: IPv4 매핑 IPv6와 같은 IPv4는 한 칸이다', async (t) => {
  const { link, unlock: send, failFrom } = await startWithProxy(t, '127.0.0.1');
  const token = await link();
  await failFrom(token, range(LIMIT, (n) => (n % 2 === 0 ? '::ffff:203.0.113.70' : '::ffff:cb00:7146')));
  assert.equal(await send(token, PASSWORD, '203.0.113.70'), 429);
  assert.equal(await send(token, PASSWORD, '203.0.113.71'), 200);
});

test('신뢰 프록시 설정값이 잘못되면 앱을 시작하지 않는다', async (t) => {
  for (const value of ['true', '0.0.0.0/0', 'loopback']) {
    const restoreEnv = setEnv({ TRUST_PROXY_CIDRS: value });
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      await assert.rejects(configureApp(app), /TRUST_PROXY_CIDRS/, value);
    } finally {
      await app.close();
      restoreEnv();
    }
  }
  t.diagnostic('TRUST_PROXY_CIDRS 기동 검사는 10월 trust-proxy 그대로다');
});

test('운영 정책 그대로(N=30): 여러 주소의 실패가 발행본 전체로 30회 쌓이면 새 unlock을 15분 막고, 중간 성공은 누적을 지우지 않으며, 받아 둔 grant로는 계속 열람한다', async (t) => {
  assert.equal(PRODUCT_UNLOCK_POLICY.link.maxFailures, 30);
  const { link, unlock: send, unlockFull, failFrom, access } = await startWithProxy(t, '127.0.0.1');
  const token = await link();
  const other = await link();
  const before = await unlockFull(token, PASSWORD, '192.0.2.250');
  assert.equal(before.status, 200);
  const { grant } = before.body;

  await failFrom(token, range(29, (n) => `198.51.100.${n}`)); // 주소마다 1회라 주소별 한도(10)에는 닿지 않는다
  assert.equal(await send(token, PASSWORD, '192.0.2.251'), 200, '29회까지는 차단 전, 성공해도 발행본 누적은 남는다');
  assert.equal(await send(token, 'wrong-password', '198.51.100.30'), 401, '30번째 실패');

  const blocked = await unlockFull(token, PASSWORD, '203.0.113.200');
  assert.equal(blocked.status, 429, '새 주소의 맞는 비밀번호도 거부');
  assert.equal(blocked.body.code, 'LINK_UNLOCK_LIMITED');
  assert.ok(Number(blocked.retryAfter) >= 899 && Number(blocked.retryAfter) <= 900, blocked.retryAfter);
  await assert.doesNotReject(access.read(token, grant), '받아 둔 grant로는 계속 열람');
  assert.equal(await send(other, PASSWORD, '203.0.113.200'), 200, '다른 발행본은 막지 않음');
});
