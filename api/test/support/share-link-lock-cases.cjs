// #220 링크 발급이 기다리는 두 잠금(회원 발급 잠금·같은 키 잠금)의 상한 초과 시험.
// 시험 연결에 주입한 500ms(share-links-key-lock)와 앱 계정의 3초(lock-wait-limit-role)가 같은 판정을 쓴다.
// 비밀번호는 합성 값만 쓴다.
const assert = require('node:assert/strict');

const PASSWORD = 'synthetic-only-link-password';
const keyLockText = (memberId, key) => JSON.stringify(['catchu:idempotency', memberId, 'createShareLink', key]);
const issuanceLockText = memberId => `catchu:share-link-issue:${memberId}`;

/**
 * ctx: { test, timeoutMs, label, db(), login(), create(token, key, body), holdLock(text) → { release }, ready?(t) }
 * ready(t)가 false를 돌려주면 그 시험은 건너뛴다(시험 전용 계정을 만들 수 없는 환경).
 */
function defineShareLinkLockCases(ctx) {
  const { test, timeoutMs, label = '' } = ctx;
  const count = async table => Number((await ctx.db().query(`SELECT count(*) AS n FROM ${table}`))[0].n);
  const stored = async () => ({
    links: await ctx.db().query('SELECT * FROM share_link ORDER BY link_id'),
    records: await ctx.db().query('SELECT * FROM idempotency_record ORDER BY idempotency_id'),
  });
  const assertWaitedForCap = (ms, what) => {
    assert.ok(ms >= timeoutMs - 100, `${what}: 상한(${timeoutMs}ms)만큼은 기다린다(${ms}ms)`);
    assert.ok(ms < timeoutMs + 3000, `${what}: 상한 뒤 다른 시간 초과로 끝나지 않는다(${ms}ms)`);
  };
  async function blocked(text, send) {
    const held = await ctx.holdLock(text);
    const started = Date.now();
    try {
      const response = await send();
      return { response, ms: Date.now() - started };
    } finally {
      await held.release();
    }
  }

  test('회원 발급 잠금을 상한 안에 얻지 못하면 500 INTERNAL_ERROR로 끝나고 전체 롤백되며 같은 키로 다시 보낼 수 있다' + label, async t => {
    if (ctx.ready && !ctx.ready(t)) return;
    const { token, memberId } = await ctx.login();
    const { response: failed, ms } = await blocked(issuanceLockText(memberId),
      () => ctx.create(token, 'issuance-key', { title: '대기 링크', password: PASSWORD }));
    assert.equal(failed.status, 500, JSON.stringify(failed.body));
    assert.equal(failed.body.code, 'INTERNAL_ERROR');
    assert.equal(failed.cacheControl, 'no-store');
    assertWaitedForCap(ms, '회원 발급 잠금');
    // 최초 발급 실패는 링크도 멱등 기록도 남기지 않는다.
    assert.equal(await count('share_link'), 0);
    assert.equal(await count('idempotency_record'), 0);
    t.diagnostic(`회원 발급 잠금 상한 초과: ${ms}ms 뒤 500`);

    const retried = await ctx.create(token, 'issuance-key', { title: '대기 링크', password: PASSWORD });
    assert.equal(retried.status, 201, JSON.stringify(retried.body));
    assert.equal(await count('share_link'), 1);
    assert.equal(await count('idempotency_record'), 1);
  });

  test('키 잠금을 상한 안에 얻지 못하면 최초·재요청 모두 500 INTERNAL_ERROR이고 기존 기록은 그대로다' + label, async t => {
    if (ctx.ready && !ctx.ready(t)) return;
    const { token, memberId } = await ctx.login();
    const first = await blocked(keyLockText(memberId, 'key-lock'),
      () => ctx.create(token, 'key-lock', { title: '키 대기', password: PASSWORD }));
    assert.equal(first.response.status, 500, JSON.stringify(first.response.body));
    assert.equal(first.response.body.code, 'INTERNAL_ERROR');
    assertWaitedForCap(first.ms, '최초 발급의 키 잠금');
    assert.equal(await count('share_link'), 0);
    assert.equal(await count('idempotency_record'), 0);

    const created = await ctx.create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
    assert.equal(created.status, 201);
    const before = await stored();

    const replay = await blocked(keyLockText(memberId, 'key-lock'),
      () => ctx.create(token, 'key-lock', { title: '키 대기', password: PASSWORD }));
    assert.equal(replay.response.status, 500);
    assert.equal(replay.response.body.code, 'INTERNAL_ERROR');
    assert.equal(replay.response.cacheControl, 'no-store');
    assertWaitedForCap(replay.ms, '재요청의 키 잠금');
    // 기존 키 재요청 실패는 이미 발급한 링크와 멱등 기록을 한 칸도 바꾸지 않는다.
    assert.deepEqual(await stored(), before);
    t.diagnostic(`키 잠금 상한 초과: 최초 ${first.ms}ms·재요청 ${replay.ms}ms 뒤 500`);

    const replayed = await ctx.create(token, 'key-lock', { title: '키 대기', password: PASSWORD });
    assert.equal(replayed.status, 200);
    assert.equal(replayed.body.linkId, created.body.linkId);
    const wrong = await ctx.create(token, 'key-lock', { title: '키 대기', password: 'synthetic-wrong-password' });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.code, 'IDEMPOTENCY_CONFLICT');
  });
}

module.exports = { PASSWORD, defineShareLinkLockCases, issuanceLockText, keyLockText };
