const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { issueShareLink, MAX_VALID_SHARE_LINKS } = require('../../dist/share-links/share-link-issuance.js');
const { generateLinkToken } = require('../../dist/share-links/link-token.js');
const { hashLinkPassword } = require('../../dist/share-links/link-password.js');

// #147: 발급 판정의 실제 DB 검증. share_link는 마이그레이션(npm test가 먼저 적용)으로 만들어진 테이블이고,
// 소유자는 member_account의 실제 행이다(회원 외래 키).

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-29T05:00:00.000Z');
let dataSource;
let defaultOwner;

before(async () => {
  dataSource = await openTestDataSource({ poolSize: 20 });
});
after(async () => {
  await dataSource.destroy();
});

/** 링크 소유자가 될 회원 행을 만든다. 개발 로그인 없이 합성 식별값만 쓴다. */
async function owner() {
  const memberId = randomUUID();
  await dataSource.query(
    "INSERT INTO member_account (member_id, identity_reference, account_state) VALUES ($1, $2, 'ACTIVE')",
    [memberId, `synthetic-share-link-test:${memberId}`]);
  return memberId;
}
beforeEach(async () => {
  await resetTestDatabase(dataSource);
  defaultOwner = await owner();
});

const command = (overrides) => ({
  ownerId: defaultOwner, title: '합성 링크', linkToken: generateLinkToken(), passwordVerifier: null, ...overrides,
});
// 발급 시각은 잠금을 얻은 뒤 clock으로 정해진다. 테스트는 clock으로 시각을 고정·이동한다.
const fixedClock = (date) => () => date;
const issue = ({ issuedAt = NOW, ...overrides } = {}) =>
  dataSource.transaction((manager) => issueShareLink(manager, command(overrides), fixedClock(issuedAt)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 제한 시간 안에 끝나지 않으면 실패시킨다. 잠금 대기가 잘못 걸려도 테스트가 멈추지 않게 한다.
const within = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: ${ms}ms 안에 끝나지 않음`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
const rows = (ownerId) => dataSource.query(
  'SELECT title, stopped_at, expires_at FROM share_link WHERE owner_id = $1 ORDER BY issued_at, title', [ownerId]);
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code);
  assert.equal(error.getStatus(), 409);
  return true;
});

test('마이그레이션의 share_link가 DB 물리 규약·ERD 제약과 회원·멱등 기록 외래 키를 가진다', async () => {
  const constraints = await dataSource.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid IN ('share_link'::regclass, 'idempotency_record'::regclass) ORDER BY conname`);
  const def = Object.fromEntries(constraints.map(({ conname, def }) => [conname, def]));
  assert.equal(def.pk_share_link, 'PRIMARY KEY (link_id)');
  assert.equal(def.uq_share_link_link_token_reference, 'UNIQUE (link_token_reference)');
  assert.equal(def.uq_share_link_link_id_owner_id, 'UNIQUE (link_id, owner_id)');
  assert.equal(def.fk_share_link_owner_id, 'FOREIGN KEY (owner_id) REFERENCES member_account(member_id) ON DELETE CASCADE');
  assert.equal(def.fk_idempotency_record_link_id_member_id,
    'FOREIGN KEY (link_id, member_id) REFERENCES share_link(link_id, owner_id) ON DELETE CASCADE');
  const checks = constraints.filter(({ conname }) => conname.startsWith('ck_share_link_')).map(({ def: d }) => d);
  assert.ok(checks.some((d) => d.includes('char_length(title) >= 1')));
  assert.ok(checks.some((d) => d.includes("expires_at = (issued_at + '720:00:00'::interval)")));
  assert.ok(checks.some((d) => d.includes('stopped_at IS NULL') && d.includes('stopped_at >= issued_at')));
  const columns = await dataSource.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'share_link' ORDER BY ordinal_position`);
  assert.deepEqual(columns.map(({ column_name, data_type, is_nullable }) => `${column_name} ${data_type} ${is_nullable}`), [
    'link_id uuid NO', 'owner_id uuid NO', 'title text NO', 'link_token_reference text NO',
    'password_protection_reference text YES', 'issued_at timestamp with time zone NO',
    'expires_at timestamp with time zone NO', 'stopped_at timestamp with time zone YES',
  ]);
  const [{ n }] = await dataSource.query(
    "SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'share_link' AND indexname = 'ix_share_link_owner_id'");
  assert.equal(n, 1);
});

test('회원 행이 없는 소유자로는 발급하지 않는다(회원 외래 키)', async () => {
  await assert.rejects(issue({ ownerId: randomUUID() }), /fk_share_link_owner_id/);
  assert.equal(Number((await dataSource.query('SELECT count(*) AS n FROM share_link'))[0].n), 0);
});

test('멱등 기록은 있는 링크와 그 소유자만 가리킬 수 있다', async () => {
  const link = await issue();
  const other = await owner();
  const record = (memberId, linkId) => dataSource.query(
    `INSERT INTO idempotency_record (idempotency_id, member_id, operation, key, request_fingerprint, link_id, response_reference)
     VALUES (gen_random_uuid(), $1, 'createShareLink', 'k', repeat('a', 64), $2, $3)`, [memberId, linkId, linkId]);
  await assert.rejects(record(defaultOwner, randomUUID()), /fk_idempotency_record_link_id_member_id/);
  await assert.rejects(record(other, link.linkId), /fk_idempotency_record_link_id_member_id/);
  await record(defaultOwner, link.linkId);
});

test('공개 Catch 없이도 발급되고, 만료는 발급 시각부터 정확히 720시간 뒤다', async () => {
  const verifier = await hashLinkPassword('synthetic-only-password');
  const input = command({ passwordVerifier: verifier });
  const link = await dataSource.transaction((manager) => issueShareLink(manager, input, fixedClock(NOW)));
  const [saved] = await dataSource.query('SELECT * FROM share_link WHERE link_id = $1', [link.linkId]);
  assert.equal(saved.owner_id, input.ownerId);
  assert.equal(saved.title, input.title);
  assert.equal(saved.link_token_reference, input.linkToken);
  assert.equal(saved.password_protection_reference, verifier);
  assert.equal(saved.stopped_at, null);
  assert.equal(saved.issued_at.getTime(), NOW.getTime());
  assert.equal(saved.expires_at.getTime() - saved.issued_at.getTime(), 720 * HOUR);
  assert.equal(JSON.stringify(saved).includes('synthetic-only-password'), false);
});

test('유효 링크와 같은 제목은 LINK_TITLE_CONFLICT이며 새 행을 만들지 않는다', async () => {
  const ownerId = await owner();
  await issue({ ownerId, title: '같은 제목' });
  await rejectsWith(issue({ ownerId, title: '같은 제목' }), 'LINK_TITLE_CONFLICT');
  assert.equal((await rows(ownerId)).length, 1);
});

test(`유효 링크가 ${MAX_VALID_SHARE_LINKS}개면 LINK_LIMIT_REACHED`, async () => {
  const ownerId = await owner();
  for (let i = 1; i <= MAX_VALID_SHARE_LINKS; i++) await issue({ ownerId, title: `링크 ${i}` });
  await rejectsWith(issue({ ownerId, title: '여섯 번째' }), 'LINK_LIMIT_REACHED');
  assert.equal((await rows(ownerId)).length, MAX_VALID_SHARE_LINKS);
});

test('제목 중복과 한도 초과가 겹치면 제목 중복을 먼저 돌려준다(#23 9/28 결정)', async () => {
  const ownerId = await owner();
  for (let i = 1; i <= MAX_VALID_SHARE_LINKS; i++) await issue({ ownerId, title: `링크 ${i}` });
  await rejectsWith(issue({ ownerId, title: '링크 3' }), 'LINK_TITLE_CONFLICT');
});

test('중단한 링크는 제목 비교와 개수에서 빠진다', async () => {
  const ownerId = await owner();
  for (let i = 1; i <= MAX_VALID_SHARE_LINKS; i++) await issue({ ownerId, title: `링크 ${i}` });
  await dataSource.query(`UPDATE share_link SET stopped_at = issued_at + interval '1 hour'
    WHERE owner_id = $1 AND title = '링크 1'`, [ownerId]);
  await issue({ ownerId, title: '링크 1' });
  const titles = (await rows(ownerId)).map(({ title }) => title);
  assert.equal(titles.filter((title) => title === '링크 1').length, 2);
});

test('만료한 링크는 제목 비교와 개수에서 빠지고, 만료 시각과 같은 순간은 만료로 본다', async () => {
  const ownerId = await owner();
  const now = NOW;
  const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * HOUR);
  // 준비: 각 발급 시각 기준으로는 모두 한도 안이다.
  for (let i = 1; i <= 3; i++) await issue({ ownerId, title: `오래된 ${i}`, issuedAt: at(800) }); // now 기준 80시간 전 만료
  await issue({ ownerId, title: '경계 링크', issuedAt: at(720) }); // now가 정확히 만료 시각
  await issue({ ownerId, title: '유효 링크', issuedAt: at(719) }); // now에도 유효

  // now 기준 유효 링크는 '유효 링크' 하나뿐이다.
  await issue({ ownerId, title: '경계 링크', issuedAt: now });
  await rejectsWith(issue({ ownerId, title: '유효 링크', issuedAt: now }), 'LINK_TITLE_CONFLICT');
  for (let i = 1; i <= 3; i++) await issue({ ownerId, title: `새 링크 ${i}`, issuedAt: now });
  // 유효 5개(유효 링크·경계 링크(새)·새 링크 3개), 만료 4개는 개수에서 빠진다.
  await rejectsWith(issue({ ownerId, title: '여섯 번째', issuedAt: now }), 'LINK_LIMIT_REACHED');
  assert.equal((await rows(ownerId)).length, 9);
});

test('제목 유일·한도는 회원별이다', async () => {
  const a = await owner();
  const b = await owner();
  for (let i = 1; i <= MAX_VALID_SHARE_LINKS; i++) await issue({ ownerId: a, title: `링크 ${i}` });
  await issue({ ownerId: b, title: '링크 1' });
  assert.equal((await rows(b)).length, 1);
});

test('같은 회원이 서로 다른 제목으로 동시에 10번 발급해도 5개만 만들어진다', async () => {
  const ownerId = await owner();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => issue({ ownerId, title: `동시 ${i}` })));
  const ok = results.filter(({ status }) => status === 'fulfilled').length;
  const limited = results.filter(({ status, reason }) => status === 'rejected' && reason.code === 'LINK_LIMIT_REACHED').length;
  assert.equal(ok, MAX_VALID_SHARE_LINKS);
  assert.equal(limited, 10 - MAX_VALID_SHARE_LINKS);
  assert.equal((await rows(ownerId)).length, MAX_VALID_SHARE_LINKS);
});

test('같은 회원이 같은 제목으로 동시에 8번 발급해도 1개만 만들어진다', async () => {
  const ownerId = await owner();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => issue({ ownerId, title: '동시 같은 제목' })));
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.ok(results.filter(({ status }) => status === 'rejected').every(({ reason }) => reason.code === 'LINK_TITLE_CONFLICT'));
  assert.equal((await rows(ownerId)).length, 1);
});

test('같은 회원의 발급은 앞 트랜잭션이 끝날 때까지 기다리고, 다른 회원은 기다리지 않는다', async () => {
  const a = await owner();
  const b = await owner();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let holding;
  const held = new Promise((resolve) => { holding = resolve; });
  const first = dataSource.transaction(async (manager) => {
    await issueShareLink(manager, command({ ownerId: a, title: '먼저' }), fixedClock(NOW));
    holding();
    await gate;
  });
  let sameOwner;
  let otherOwner;
  let sameOwnerDone = false;
  try {
    // 첫 발급이 실패하면 held를 기다리지 않고 바로 실패한다.
    await within(Promise.race([held, first]), 5000, '첫 트랜잭션의 잠금 획득');
    sameOwner = issue({ ownerId: a, title: '나중' }).then(() => { sameOwnerDone = true; });
    // 제한 시간이 지나도 원래 DB 작업은 취소되지 않으므로 변수에 담아 finally에서 함께 정리한다.
    otherOwner = issue({ ownerId: b, title: '다른 회원' });
    await within(otherOwner, 2000, '다른 회원의 발급(대기하면 안 됨)');
    await sleep(300);
    assert.equal(sameOwnerDone, false, '같은 회원의 두 번째 발급은 첫 트랜잭션이 끝날 때까지 기다린다');
  } finally {
    // 중간에 실패해도 잠금을 풀고 시작한 트랜잭션을 모두 끝낸다. 남겨 두면 다음 테스트의 초기화가 멈춘다.
    release();
    await within(Promise.allSettled([first, sameOwner, otherOwner].filter(Boolean)), 5000, '트랜잭션 정리');
  }
  await first;
  await sameOwner;
  assert.deepEqual((await rows(a)).map(({ title }) => title).sort(), ['나중', '먼저']);
});

test('잠금을 기다리는 사이 만료된 링크는 잠금을 얻은 시각 기준으로 빠진다', async () => {
  const ownerId = await owner();
  // NOW+1초에 만료되는 링크와 유효 링크 3개 → NOW 기준 유효 4개
  await issue({ ownerId, title: '곧 만료', issuedAt: new Date(NOW.getTime() - 720 * HOUR + 1000) });
  for (let i = 1; i <= 3; i++) await issue({ ownerId, title: `유효 ${i}` });

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let holding;
  const held = new Promise((resolve) => { holding = resolve; });
  // 첫 트랜잭션: NOW에 다섯 번째 링크를 발급하고 잠금을 쥔 채 기다린다(이 시각에는 '곧 만료'도 유효라 5개).
  const first = dataSource.transaction(async (manager) => {
    await issueShareLink(manager, command({ ownerId, title: '먼저' }), fixedClock(NOW));
    holding();
    await gate;
  });

  let current = NOW;
  let second;
  let secondDone = false;
  try {
    await within(Promise.race([held, first]), 5000, '첫 트랜잭션의 잠금 획득');
    // 두 번째 발급은 NOW에 시작해 잠금을 기다린다. 요청 시각 기준이면 '곧 만료'와 제목이 겹치고 한도도 찼다.
    second = dataSource.transaction((manager) =>
      issueShareLink(manager, command({ ownerId, title: '곧 만료' }), () => current))
      .finally(() => { secondDone = true; });
    await sleep(300);
    assert.equal(secondDone, false, '두 번째 발급은 잠금을 기다려야 한다');
    current = new Date(NOW.getTime() + 2000); // 기다리는 동안 '곧 만료'가 만료된다
  } finally {
    release();
    await within(Promise.allSettled([first, second].filter(Boolean)), 5000, '트랜잭션 정리');
  }
  await first;
  const link = await second;
  assert.equal(link.issuedAt.getTime(), NOW.getTime() + 2000, '발급 시각은 잠금을 얻은 뒤의 시각이다');
  assert.equal(link.expiresAt.getTime() - link.issuedAt.getTime(), 720 * HOUR);
  assert.equal((await rows(ownerId)).filter(({ title }) => title === '곧 만료').length, 2);
});

test('호출하는 쪽 트랜잭션이 실패하면 발급한 링크도 함께 롤백된다', async () => {
  const ownerId = await owner();
  await assert.rejects(dataSource.transaction(async (manager) => {
    await issueShareLink(manager, command({ ownerId }), fixedClock(NOW));
    throw new Error('synthetic-later-failure');
  }), /synthetic-later-failure/);
  assert.equal((await rows(ownerId)).length, 0);
});

test('트랜잭션 밖이나 READ COMMITTED가 아닌 격리 수준에서는 발급하지 않는다', async () => {
  await assert.rejects(issueShareLink(dataSource.manager, command(), fixedClock(NOW)), /inside a transaction/);
  await assert.rejects(
    dataSource.transaction('REPEATABLE READ', (manager) => issueShareLink(manager, command(), fixedClock(NOW))),
    /READ COMMITTED/);
  assert.equal(Number((await dataSource.query('SELECT count(*) AS n FROM share_link'))[0].n), 0);
});

test('검증을 거치지 않은 명령은 저장하지 않는다', async () => {
  for (const overrides of [
    { ownerId: 'not-a-uuid' }, { ownerId: randomUUID().toUpperCase() }, { title: '' }, { title: ' 앞뒤 공백 ' },
    { linkToken: 'short' }, { passwordVerifier: 123 }, { issuedAt: new Date(NaN) }, { issuedAt: '2026-09-29' },
  ]) {
    await assert.rejects(issue(overrides), TypeError, JSON.stringify(overrides));
  }
  assert.equal(Number((await dataSource.query('SELECT count(*) AS n FROM share_link'))[0].n), 0);
});

test('DB 제약이 만료 계산과 중단 시각의 어긋남을 막는다', async () => {
  const link = await issue();
  await assert.rejects(dataSource.query(
    "UPDATE share_link SET expires_at = expires_at + interval '1 second' WHERE link_id = $1", [link.linkId]));
  await assert.rejects(dataSource.query(
    "UPDATE share_link SET stopped_at = issued_at - interval '1 second' WHERE link_id = $1", [link.linkId]));
  await assert.rejects(dataSource.query(
    'INSERT INTO share_link SELECT gen_random_uuid(), owner_id, title, link_token_reference, NULL, issued_at, expires_at, NULL FROM share_link WHERE link_id = $1',
    [link.linkId]), /uq_share_link_link_token_reference/);
});
