import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { createApiClient } from '../src/lib/api-client.ts';
import { createIdempotencyKeyHolder } from '../src/lib/idempotency.ts';
import { createAnalysisRequestApi } from '../src/features/analysis-request/analysis-request-api.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';

// 합성 HTTP 응답을 회원 API 클라이언트부터 상태 객체까지 통과시킨다. 실제 API·DB 접수는 아니다.
const START = Date.parse('2026-10-19T00:00:00Z');
const NOTICE = { noticeRevision: 'notice-v1', text: '합성 분석 안내' };
const repository = (id) => ({
  repositoryId: id, name: id, ownerLogin: 'octo', url: `https://github.com/octo/${id}`, allowedScopeRevision: `scope-${id}`,
});
const status = (repositoryId = 'r1') => ({
  requestId: `req-${repositoryId}`, repositoryId, consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false,
  retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [],
});
const limited = (retryAfter = '2') => Response.json({ code: 'RATE_LIMITED', message: '요청 빈도 제한' }, {
  status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
});
const existing = () => Response.json(status(), { status: 200 });
const accepted = () => Response.json(status(), { status: 202 });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(t, replies = [() => limited(), existing]) {
  // Date와 타이머를 함께 진행해 만료 시 자동 재전송이 생기는 회귀도 실제 대기 없이 잡는다.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: START });
  const posts = [];
  const gets = { repositories: 0, notice: 0 };
  const responses = [...replies];
  const client = createApiClient({
    baseUrl: 'http://127.0.0.1:3001',
    tokens: createAccessTokenStore(),
    fetch: async (url, init) => {
      if (url.endsWith('/analysis-notice')) {
        gets.notice += 1;
        return Response.json(NOTICE);
      }
      assert.equal(url, 'http://127.0.0.1:3001/v1/analysis-requests');
      posts.push({
        method: init.method, key: new Headers(init.headers).get('Idempotency-Key'), body: JSON.parse(init.body),
      });
      const response = responses.shift();
      assert.ok(response, '예정하지 않은 추가 POST');
      return response();
    },
  });
  let generated = 0;
  const store = createAnalysisRequestStore({
    requests: createAnalysisRequestApi(client.member),
    repositories: async () => {
      gets.repositories += 1;
      return { kind: 'success', data: [repository('r1'), repository('r2')] };
    },
    keys: createIdempotencyKeyHolder(() => `key-${generated += 1}`),
    now: () => Date.now(),
  });
  const watched = [];
  store.watchStatusChanges(() => watched.push(store.getSnapshot().message?.text));
  t.after(() => store.dispose());
  return {
    store, posts, gets, watched,
    async advance(ms) { t.mock.timers.tick(ms); await flush(); },
  };
}

async function submit(h) {
  await h.store.open();
  h.store.select('r1');
  await h.store.submit();
}

test('429 Retry-After 2초: 즉시·1999ms 직접 재전송은 차단하고 2000ms 뒤 사용자 재전송만 같은 키·본문으로 보낸다', async (t) => {
  const h = harness(t);
  await submit(h);
  await h.store.resend();
  // 새 상태 필드보다 실제 POST 수를 먼저 검사해 수정 전 조기 전송을 재현한다.
  assert.equal(h.posts.length, 1, '429 직후 resend를 직접 호출해도 POST를 추가하지 않는다');
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.getSnapshot().retryAt, START + 2000);
  assert.equal(h.store.retryWaitSeconds(), 2);
  assert.equal(h.store.canSubmit(), false);
  assert.equal(h.store.canResend(), false);
  assert.deepEqual(h.watched, []);

  await h.advance(1999);
  assert.equal(h.store.retryWaitSeconds(), 1, '남은 1ms도 1초로 올려 표시한다');
  assert.equal(h.store.canResend(), false);
  await h.store.resend();
  assert.equal(h.posts.length, 1, '1999ms에도 POST 없음');

  await h.advance(1);
  assert.equal(h.store.retryWaitSeconds(), 0);
  assert.equal(h.store.canResend(), true);
  assert.equal(h.posts.length, 1, '만료는 자동 POST를 만들지 않는다');
  await h.store.resend();
  assert.equal(h.posts.length, 2);
  assert.deepEqual(h.posts[1], h.posts[0]);
  assert.deepEqual(h.posts[0], {
    method: 'POST', key: 'key-1',
    body: { repositoryId: 'r1', consent: { accepted: true, noticeRevision: 'notice-v1', scopeRevision: 'scope-r1' } },
  });
  assert.equal(h.store.getSnapshot().message.text, TEXT.existing, '첫 429는 앞선 접수 여부 불명으로 바꾸지 않는다');
  assert.equal(h.store.getSnapshot().retryAt, null);
  assert.equal(h.store.getSnapshot().pendingRepositoryId, null);
  assert.deepEqual(h.watched, [TEXT.existing]);
});

test('429 대기 중 모달을 다시 열거나 선택을 바꿔도 원래 deadline·키·본문을 유지한다', async (t) => {
  const h = harness(t);
  await submit(h);
  const getsBefore = { ...h.gets };
  const messageBefore = h.store.getSnapshot().message;
  await h.advance(1500);
  // 실제 조립은 모달을 닫을 때 store를 유지하고, 다시 열 때 open만 호출한다.
  await h.store.open();
  h.store.select('r2');
  assert.equal(h.store.getSnapshot().retryAt, START + 2000);
  assert.equal(h.store.getSnapshot().selectedId, 'r1');
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');
  assert.deepEqual(h.store.getSnapshot().message, messageBefore);
  assert.deepEqual(h.gets, getsBefore, '붙잡은 동의와 다른 목록·고지를 새로 읽지 않는다');
  await h.store.resend();
  assert.equal(h.posts.length, 1);

  await h.advance(500);
  await h.store.open();
  assert.equal(h.store.canResend(), true, '다시 열기로 대기를 처음부터 시작하지 않는다');
  assert.equal(h.posts.length, 1);
  await h.store.resend();
  assert.deepEqual(h.posts[1], h.posts[0]);
});

test('같은 요청이 다시 429를 받으면 새 응답 시각·Retry-After로 deadline을 갱신한다', async (t) => {
  const h = harness(t, [() => limited('2'), () => limited('3'), accepted]);
  await submit(h);
  await h.advance(2000);
  await h.store.resend();
  assert.equal(h.posts.length, 2);
  assert.equal(h.store.getSnapshot().retryAt, START + 5000);
  assert.equal(h.store.retryWaitSeconds(), 3);

  await h.advance(2999);
  await h.store.resend();
  assert.equal(h.posts.length, 2);
  await h.advance(1);
  assert.equal(h.store.canResend(), true);
  assert.equal(h.posts.length, 2, '반복 제한 만료에도 자동 전송 없음');
  await h.store.resend();
  assert.equal(h.posts.length, 3);
  assert.ok(h.posts.every((post) => post.key === h.posts[0].key));
  assert.ok(h.posts.every((post) => JSON.stringify(post.body) === JSON.stringify(h.posts[0].body)));
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
  assert.equal(h.store.getSnapshot().retryAt, null);
});

test('dispose는 429 대기 시각·붙잡은 요청을 폐기해 시간이 지나도 재전송하지 않고 다음 요청은 새 키다', async (t) => {
  const h = harness(t, [() => limited(), accepted]);
  await submit(h);
  h.store.dispose();
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().retryAt, null);
  assert.equal(h.store.getSnapshot().pendingRepositoryId, null);
  assert.equal(h.store.retryWaitSeconds(), 0);
  assert.equal(h.store.canResend(), false);
  assert.equal(h.store.getSnapshot().message, null);
  await h.advance(10_000);
  await h.store.resend();
  assert.equal(h.posts.length, 1);
  assert.deepEqual(h.watched, []);

  await submit(h);
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[1].key, 'key-2');
});

test('dispose 뒤 도착한 429 응답은 대기 시각이나 붙잡은 요청을 되살리지 않는다', async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = harness(t, [() => pending]);
  await h.store.open();
  h.store.select('r1');
  const sending = h.store.submit();
  h.store.dispose();
  resolve(limited());
  await sending;
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().retryAt, null);
  assert.equal(h.store.getSnapshot().pendingRepositoryId, null);
  assert.equal(h.store.canResend(), false);
  await h.advance(10_000);
  await h.store.resend();
  assert.equal(h.posts.length, 1);
});

for (const [name, header] of [['헤더 없음', null], ['잘못된 헤더', 'not-seconds']]) {
  test(`429 ${name}: 회원 API 경계를 지나도 대기 시간을 추정하지 않고 명시적 재전송만 허용한다`, async (t) => {
    // 모든 헤더 형식의 해석은 api-client.test.mjs가 맡는다. 여기서는 상태 객체까지의 연결만 확인한다.
    const h = harness(t, [() => limited(header), accepted]);
    await submit(h);
    assert.equal(h.store.getSnapshot().phase, 'limited');
    assert.equal(h.store.getSnapshot().retryAt, null);
    assert.equal(h.store.retryWaitSeconds(), 0);
    assert.equal(h.store.canResend(), true);
    assert.doesNotMatch(h.store.getSnapshot().message.text, /\d+\s*초/, '서버가 주지 않은 남은 초를 만들지 않는다');
    await h.advance(60_000);
    assert.equal(h.posts.length, 1, '대기 시간을 알 수 없어도 자동 전송 없음');
    await h.store.resend();
    assert.equal(h.posts.length, 2);
    assert.deepEqual(h.posts[1], h.posts[0]);
  });
}

test('응답 불명→429→200에서도 앞선 접수 여부 불명과 같은 키·본문을 보존해 기존 접수 확인으로 안내한다', async (t) => {
  const h = harness(t, [() => { throw new TypeError('synthetic network failure'); }, () => limited(), existing]);
  await submit(h);
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.getSnapshot().message.text, TEXT.limitedUncertain);
  assert.equal(h.store.getSnapshot().retryAt, START + 2000);
  await h.store.resend();
  assert.equal(h.posts.length, 2, '앞선 응답이 불명이어도 429 대기는 우회하지 않는다');
  await h.advance(2000);
  assert.equal(h.posts.length, 2);
  await h.store.resend();
  assert.equal(h.posts.length, 3);
  assert.deepEqual(h.posts[1], h.posts[0]);
  assert.deepEqual(h.posts[2], h.posts[0]);
  assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
  assert.deepEqual(h.watched, [TEXT.resentExisting]);
});

test('429 뒤 잘못된 200도 응답 불명으로 남겨 정상 재응답 전까지 같은 키·본문을 보존한다', async (t) => {
  const malformed = status();
  delete malformed.consentId;
  const closed = { ...status(), lifecycle: 'CLOSED', processing: 'EMPTY', application: 'APPLIED', retry: { allowed: false, reason: 'REANALYSIS_DEFERRED' } };
  const h = harness(t, [() => limited(), () => Response.json(malformed), () => Response.json(closed)]);
  await submit(h);
  const initialGets = { ...h.gets };
  await h.store.open();
  await h.advance(2000);
  assert.equal(h.posts.length, 1, '대기 만료·모달 재열기는 POST를 만들지 않는다');
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.getSnapshot().message.text, TEXT.unknown);
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');
  assert.deepEqual(h.watched, [], '잘못된 응답은 접수 안내·상태 갱신을 만들지 않는다');

  await h.store.open();
  h.store.select('r2');
  await h.advance(10_000);
  assert.equal(h.posts.length, 2, '응답 불명 중 모달 재열기·대기는 자동 POST를 만들지 않는다');
  assert.equal(h.store.getSnapshot().selectedId, 'r1');
  assert.deepEqual(h.gets, initialGets, '원래 동의 본문을 유지하며 고지·목록도 다시 읽지 않는다');
  await h.store.resend();
  assert.equal(h.posts.length, 3);
  assert.deepEqual(h.posts[1], h.posts[0]);
  assert.deepEqual(h.posts[2], h.posts[0]);
  assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().pendingRepositoryId, null);
  assert.deepEqual(h.watched, [TEXT.resentExisting], '정상 응답에서만 상태 갱신을 한 번 알린다');
});
