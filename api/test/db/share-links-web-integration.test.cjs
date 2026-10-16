require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { verifyLinkPassword } = require('../../dist/share-links/link-password');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// 실제 web 상태/HTTP 해석 + 실제 Nest HTTP/PostgreSQL. React/브라우저 검증은 별도다.
let app, db, url, createStore, createApi, createClient, createTokens;
const saved = {};
before(async () => {
  const env = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true',
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    SHARE_LINK_WEB_BASE_URL: 'http://127.0.0.1:3000' };
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value; }
  db = await openTestDataSource();
  app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  ({ createShareLinksStore: createStore } = await import('../../../web/src/features/share-links/share-links-store.ts'));
  ({ createShareLinkApi: createApi } = await import('../../../web/src/features/share-links/share-link-api.ts'));
  ({ createApiClient: createClient } = await import('../../../web/src/lib/api-client.ts'));
  ({ createAccessTokenStore: createTokens } = await import('../../../web/src/lib/access-token.ts'));
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(() => resetTestDatabase(db));
const counts = async () => (await db.query(`SELECT
  (SELECT count(*)::int FROM share_link) AS links,
  (SELECT count(*)::int FROM idempotency_record) AS records`))[0];

async function setup({ drop = false } = {}) {
  const login = await fetch(`${url}/v1/auth/dev-login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: randomUUID() }) });
  assert.equal(login.status, 200);
  const tokens = createTokens(); tokens.set((await login.json()).accessToken);
  const calls = [];
  const client = createClient({ baseUrl: url, nodeEnv: 'test', tokens, fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (init?.method === 'POST' && String(input).endsWith('/share-links')) {
      const data = await response.clone().json();
      calls.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: init.body,
        status: response.status, code: data.code, retry: Number(response.headers.get('retry-after')),
        cache: response.headers.get('cache-control'), linkId: data.linkId });
      if (drop && response.status === 201) {
        drop = false;
        await response.arrayBuffer();
        // 서버 커밋 후 201 헤더는 받았지만 JSON 본문이 잘린 경로를 재현한다.
        // 실제 소켓 절단/React 화면은 수동 중계 도구로 별도 확인한다.
        return new Response('{"linkId":', { status: 201, headers: response.headers });
      }
    }
    return response;
  } });
  const store = createStore(createApi(client.member));
  await store.load(); store.openForm();
  return { store, calls, client };
}

for (const lost of [false, true]) {
  test(`${lost ? '응답 유실' : '최초 429'} 뒤 실제 Retry-After 대기·같은 키/본문·DB 단일 발급`, { timeout: 90000 }, async () => {
    const { store, calls, client } = await setup({ drop: lost });
    // 400도 빈도에 포함된다. 시계/limiter를 교체하지 않고 실제 1분 정책을 쓴다.
    for (let i = 0; i < (lost ? 9 : 10); i++) {
      const result = await client.member('/share-links', { method: 'POST', idempotencyKey: randomUUID(), body: { title: '' } });
      assert.equal(result.status, 400);
    }
    calls.length = 0;
    store.setTitle('통합 재전송'); store.setUsePassword(true); store.setPassword('synthetic-149');
    await store.submit();
    if (lost) { assert.equal(store.getSnapshot().form.phase, 'unknown'); await store.resend(); }
    assert.equal(store.getSnapshot().form.phase, 'limited');
    const limited = calls.at(-1);
    assert.equal(limited.status, 429); assert.equal(limited.code, 'RATE_LIMITED'); assert.equal(limited.cache, 'no-store');
    assert.ok(Number.isInteger(limited.retry) && limited.retry >= 1 && limited.retry <= 60);
    const expected = { links: lost ? 1 : 0, records: lost ? 1 : 0 };
    assert.deepEqual(await counts(), expected);
    const n = calls.length;
    store.setTitle('변경 시도'); store.setPassword('changed-password');
    await store.resend(); await store.submit();
    assert.equal(calls.length, n);
    assert.equal(store.canResend(), false);
    assert.equal(store.canSubmit(), false);
    if (lost) {
      const retryAt = store.getSnapshot().form.retryAt;
      store.closeForm(); store.openForm();
      assert.equal(store.getSnapshot().form.phase, 'limited');
      assert.equal(store.getSnapshot().form.retryAt, retryAt);
      assert.equal(store.canResend(), false);
      assert.equal(store.canSubmit(), false);
      await store.resend(); await store.submit();
      assert.equal(calls.length, n, '목록 왕복 뒤 대기 중 POST 없음');
    }
    await delay(limited.retry * 1000 + 100);
    assert.equal(calls.length, n, '대기 뒤 자동 전송 없음');
    assert.equal(store.canResend(), true);
    await store.resend();
    assert.equal(store.getSnapshot().form.phase, 'issued');
    assert.equal(calls.at(-1).status, lost ? 200 : 201);
    assert.ok(calls.every(c => c.key === calls[0].key && c.body === calls[0].body), '키/본문 보존');
    if (lost) assert.equal(calls.at(-1).linkId, calls[0].linkId);
    assert.deepEqual(await counts(), { links: 1, records: 1 });
    assert.equal(store.getSnapshot().form.password, '');
    store.dispose();
  });
}

test('최초 429 뒤 폼을 닫고 새로 작성해도 대기하며 만료 후 새 키로 발급', { timeout: 90000 }, async () => {
  const { store, calls, client } = await setup();
  try {
    for (let i = 0; i < 10; i++) {
      const result = await client.member('/share-links', { method: 'POST', idempotencyKey: randomUUID(), body: { title: '' } });
      assert.equal(result.status, 400);
    }
    calls.length = 0;
    store.setTitle('최초 요청');
    await store.submit();
    assert.equal(calls[0].status, 429);
    const retryAt = store.getSnapshot().form.retryAt;
    assert.ok(store.retryWaitSeconds() > 0);
    store.closeForm(); store.openForm();
    assert.equal(store.getSnapshot().form.phase, 'editing');
    assert.equal(store.getSnapshot().form.retryAt, retryAt);
    store.setTitle('수정한 새 요청');
    store.setUsePassword(true); store.setPassword('synthetic-149');
    assert.equal(store.canSubmit(), false);
    assert.equal(store.canResend(), false);
    await store.submit(); await store.resend();
    assert.equal(calls.length, 1, '새 작성 상태에서도 대기 중 POST 없음');
    assert.deepEqual(await counts(), { links: 0, records: 0 });
    await delay(calls[0].retry * 1000 + 100);
    assert.equal(store.retryWaitSeconds(), 0);
    assert.equal(store.canSubmit(), true);
    assert.equal(calls.length, 1, '대기 만료만으로 발급하지 않음');
    await store.submit();
    assert.equal(calls[1].status, 201);
    assert.notEqual(calls[1].key, calls[0].key);
    assert.notEqual(calls[1].body, calls[0].body);
    assert.equal(store.getSnapshot().form.phase, 'issued');
    assert.deepEqual(await counts(), { links: 1, records: 1 });
  } finally { store.dispose(); }
});

test('제목 51→50·비밀번호 7→8/65→64 수정과 비밀번호 생략을 web→HTTP→DB로 확인', async () => {
  for (const [bad, good, field] of [
    [{ title: '가'.repeat(51) }, { title: '가'.repeat(50) }, 'title'],
    [{ title: '8자', password: 'p'.repeat(7) }, { title: '8자', password: 'p'.repeat(8) }, 'password'],
    [{ title: '64자', password: 'p'.repeat(65) }, { title: '64자', password: 'p'.repeat(64) }, 'password'],
  ]) {
    const { store, calls } = await setup();
    store.setTitle(bad.title); store.setUsePassword(bad.password !== undefined);
    if (bad.password) store.setPassword(bad.password);
    const initial = await counts();
    await store.submit();
    assert.equal(calls[0].status, 400);
    assert.equal(calls[0].code, 'VALIDATION_FAILED');
    assert.ok(store.getSnapshot().form.fieldErrors[field]);
    assert.deepEqual(await counts(), initial);
    store.setTitle(good.title); if (good.password) store.setPassword(good.password);
    await store.submit();
    assert.equal(calls[1].status, 201);
    assert.notEqual(calls[0].key, calls[1].key, '확정된 400 뒤 수정은 새 키');
    const [row] = await db.query('SELECT char_length(title)::int AS length, password_protection_reference IS NOT NULL AS protected FROM share_link WHERE link_id = $1', [calls[1].linkId]);
    assert.equal(row.length, [...good.title].length); assert.equal(row.protected, good.password !== undefined);
    if (good.password) {
      const [stored] = await db.query('SELECT password_protection_reference AS verifier FROM share_link WHERE link_id = $1', [calls[1].linkId]);
      assert.equal(await verifyLinkPassword(good.password, stored.verifier), true, '수정한 비밀번호로 검증');
      assert.equal(await verifyLinkPassword(bad.password, stored.verifier), false, '거부됐던 비밀번호는 저장되지 않음');
    }
    assert.equal(Object.hasOwn(JSON.parse(calls[1].body), 'password'), good.password !== undefined);
    assert.deepEqual(await counts(), { links: initial.links + 1, records: initial.records + 1 });
    store.dispose();
  }
});
