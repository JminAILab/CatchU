import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalysisRequestApi } from '../src/features/analysis-request/analysis-request-api.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';
import { readAnalysis } from '../src/features/repository-management/repository-api.ts';

// 실패 재요청(#154)의 합성 응답 단위 시험이다. 실제 HTTP·DB·접수가 아니다.
const repo = (id, revision = `scope-${id}`) => ({
  repositoryId: id, name: id, ownerLogin: 'octo', url: `https://github.com/octo/${id}`, allowedScopeRevision: revision,
});
const NOTICE = { noticeRevision: 'notice-v1', text: '안내' };
const status = (repositoryId, overrides = {}) => ({
  requestId: `req-new-${repositoryId}`, repositoryId, consentId: 'c-2', attemptId: 'a-2',
  submittedAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T01:00:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false,
  ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: null, collectionLimitNotes: [],
  retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [], ...overrides,
});
const http = (code, data) => ({ kind: 'success', status: code, data });
const apiError = (code, errorCode) => ({ kind: 'api-error', status: code, code: errorCode, message: '거부' });
const LOOKUP_FAILED = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** 「연결된 저장소」의 최신 요청(서버 retry.allowed 그대로). */
const failed = (repositoryId, retryAllowed = true) => ({ requestId: `req-old-${repositoryId}`, repositoryId, retryAllowed });

function keyHolder() {
  let n = 0;
  let key = null;
  return { current() { key ??= `key-${n += 1}`; return key; }, reset() { key = null; } };
}

/** 합성 전송 대역. 모든 POST의 키·본문(JSON 직렬화 기준)을 기록한다. */
function harness({ repositories = [repo('r1'), repo('r2')], notice = http(200, NOTICE), create = () => http(202, status('r1')), now } = {}) {
  const posts = [];
  const gets = { notice: 0 };
  const state = { repositories, notice, create };
  const requests = createAnalysisRequestApi(async (path, request) => {
    if (path === '/analysis-notice') { gets.notice += 1; return typeof state.notice === 'function' ? state.notice() : state.notice; }
    posts.push({ key: request.idempotencyKey, json: JSON.stringify(request.body), body: JSON.parse(JSON.stringify(request.body)) });
    return state.create(request.body, request.idempotencyKey);
  });
  const store = createAnalysisRequestStore({
    repositories: async () => ({ kind: 'success', data: state.repositories }), requests, keys: keyHolder(), ...(now ? { now } : {}),
  });
  const watched = [];
  store.watchStatusChanges(() => watched.push(store.getSnapshot().message?.text));
  return { store, posts, gets, state, watched };
}

test('허용된 실패 재요청: 현재 고지·범위 판본의 새 동의와 retryOfRequestId를 새 키로 보내고, 접수 뒤 상태 갱신을 부른다', async () => {
  const h = harness();
  await h.store.open();
  // 앞선 첫 요청(키 1)이 접수돼 키를 놓은 뒤라도 재요청은 새 키를 쓴다.
  h.store.select('r2');
  h.state.create = () => http(202, status('r2'));
  await h.store.submit();
  h.state.create = () => http(202, status('r1'));
  assert.equal(h.store.canRetry(failed('r1')), true);
  await h.store.retry(failed('r1'));
  assert.equal(h.posts.length, 2);
  assert.deepEqual(h.posts[1].body, {
    repositoryId: 'r1', consent: { accepted: true, noticeRevision: 'notice-v1', scopeRevision: 'scope-r1' }, retryOfRequestId: 'req-old-r1',
  });
  assert.notEqual(h.posts[1].key, h.posts[0].key);
  // 첫 요청 본문에는 재요청 참조가 들어가지 않는다(키 자체가 없다).
  assert.equal(h.posts[0].json.includes('retryOfRequestId'), false);
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'editing');
  assert.equal(snapshot.pendingRetry, false);
  assert.equal(snapshot.message.text, TEXT.retryAccepted);
  assert.deepEqual(h.watched, [TEXT.accepted, TEXT.retryAccepted]);
});

test('완료 결과와 기존 Catch에 관계없이 서버가 허용한 재분석은 현재 고지·최신 요청 참조로만 보낸다', async () => {
  for (const processing of ['SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED', 'UNCERTAIN']) {
    const h = harness({ notice: http(200, { noticeRevision: 'catchu-real-analysis-notice-v2', text: '확정 고지 합성 대역' }) });
    await h.store.open();
    const target = readAnalysis(status('r1', { requestId: 'latest', lifecycle: 'CLOSED', processing,
      application: 'APPLIED', registeredCatchIds: ['existing-catch'], ownerResultsReady: true,
      retry: { allowed: true, reason: 'ANALYSIS_FINISHED' } }));
    assert.equal(h.store.canRetry(target), true, processing);
    assert.equal(h.posts.length, 0, '허용 응답만으로 자동 접수하지 않는다');
    await h.store.retry(target);
    assert.deepEqual(h.posts[0].body, { repositoryId: 'r1', retryOfRequestId: 'latest',
      consent: { accepted: true, noticeRevision: 'catchu-real-analysis-notice-v2', scopeRevision: 'scope-r1' } });
    assert.deepEqual(target.registeredCatchIds, ['existing-catch']);
  }
});

test('서버가 retry.allowed=false로 준 요청·목록에 없는 저장소·고지 미준비면 재요청 본문을 만들지 않고 POST하지 않는다', async () => {
  const h = harness({ notice: LOOKUP_FAILED });
  await h.store.open();
  assert.equal(h.store.canRetry(failed('r1')), false, '고지 조회 실패');
  await h.store.retry(failed('r1'));
  h.state.notice = http(200, NOTICE);
  await h.store.loadNotice();
  assert.equal(h.store.canRetry(failed('r1', false)), false, 'retry.allowed=false');
  await h.store.retry(failed('r1', false));
  assert.equal(h.store.canRetry(failed('gone')), false, '선정 목록에 없음');
  await h.store.retry(failed('gone'));
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.canRetry(failed('r1')), true);
});

test('재요청 중 중복 클릭과 다른 요청은 막고, 첫 요청이 응답 불명으로 남아 있으면 재요청을 받지 않는다', async () => {
  let release;
  const h = harness({ create: () => new Promise((resolve) => { release = resolve; }) });
  await h.store.open();
  const first = h.store.retry(failed('r1'));
  void h.store.retry(failed('r1'));
  h.store.select('r2');
  void h.store.submit();
  assert.equal(h.posts.length, 1);
  assert.equal(h.store.getSnapshot().phase, 'submitting');
  assert.equal(h.store.getSnapshot().pendingRetry, true);
  assert.equal(h.store.canRetry(failed('r2')), false);
  release(http(202, status('r1')));
  await first;

  // 첫 요청이 응답 불명이면 그 키·본문을 붙잡고 재요청을 받지 않는다.
  h.state.create = () => LOOKUP_FAILED;
  h.store.select('r2');
  await h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.canRetry(failed('r1')), false);
  await h.store.retry(failed('r1'));
  assert.equal(h.posts.length, 2);
});

test('재요청 응답 불명: 같은 키·같은 본문(retryOfRequestId 포함)만 사용자가 다시 보내고, 새 키로 자동 재요청하지 않는다', async () => {
  const h = harness({ create: () => apiError(503, 'INTERNAL_ERROR') });
  await h.store.open();
  await h.store.retry(failed('r1'));
  await tick();
  let snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'unknown');
  assert.equal(snapshot.pendingRetry, true);
  assert.equal(snapshot.pendingRepositoryId, 'r1');
  assert.equal(snapshot.message.text, TEXT.unknown);
  assert.equal(h.posts.length, 1, '자동 재전송 없음');
  assert.deepEqual(h.watched, [], '응답 불명은 접수 결과가 아니라 상태 갱신을 부르지 않는다');

  h.state.create = () => LOOKUP_FAILED;
  await h.store.resend();
  h.state.create = () => http(200, status('r1'));
  await h.store.resend();
  assert.equal(h.posts.length, 3);
  assert.deepEqual(new Set(h.posts.map((post) => post.key)), new Set(['key-1']));
  assert.equal(new Set(h.posts.map((post) => post.json)).size, 1);
  assert.equal(h.posts[0].body.retryOfRequestId, 'req-old-r1');
  snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'editing');
  assert.equal(snapshot.message.text, TEXT.resentExisting);
  assert.deepEqual(h.watched, [TEXT.resentExisting]);
});

test('재요청 409 RETRY_NOT_ALLOWED·404·REANALYSIS_DEFERRED·ANALYSIS_IN_PROGRESS: 키를 놓고 안내하며 「연결된 저장소」를 다시 읽게 한다', async () => {
  const cases = [
    [apiError(409, 'RETRY_NOT_ALLOWED'), TEXT.retryNotAllowed],
    [apiError(404, 'RESOURCE_UNAVAILABLE'), TEXT.retryMissing],
    [apiError(409, 'REANALYSIS_DEFERRED'), TEXT.deferred],
    [apiError(409, 'ANALYSIS_IN_PROGRESS'), TEXT.inProgress],
  ];
  for (const [response, text] of cases) {
    const h = harness({ create: () => response });
    await h.store.open();
    await h.store.retry(failed('r1'));
    const snapshot = h.store.getSnapshot();
    assert.equal(snapshot.phase, 'editing', response.code);
    assert.equal(snapshot.pendingRetry, false);
    assert.equal(snapshot.message.text, text, response.code);
    assert.deepEqual(h.watched, [text], response.code);
    // 다음 재요청은 사용자가 다시 누를 때 새 키로만 보낸다.
    await h.store.retry(failed('r1'));
    assert.deepEqual(h.posts.map((post) => post.key), ['key-1', 'key-2'], response.code);
  }
});

test('첫 요청의 409 RETRY_NOT_ALLOWED는 기존 안내(이전 요청 때문에 받지 않음)를 쓰고 재요청 안내로 바꾸지 않는다', async () => {
  const h = harness({ create: () => apiError(409, 'RETRY_NOT_ALLOWED') });
  await h.store.open();
  h.store.select('r1');
  await h.store.submit();
  assert.equal(h.store.getSnapshot().message.text, TEXT.previousRequest);
  assert.equal(h.posts[0].body.retryOfRequestId, undefined);
});

test('재요청 403 CONSENT_REQUIRED: 고지를 다시 읽고 자동으로 보내지 않으며, 다시 누르면 새 판본 동의를 새 키로 보낸다', async () => {
  const h = harness({ create: () => apiError(403, 'CONSENT_REQUIRED') });
  await h.store.open();
  await h.store.retry(failed('r1'));
  h.state.notice = http(200, { noticeRevision: 'notice-v2', text: '바뀐 안내' });
  h.state.repositories = [repo('r1', 'scope-r1-v2'), repo('r2')];
  await h.store.load();
  await tick();
  assert.equal(h.posts.length, 1, '자동 재전송 없음');
  assert.equal(h.store.getSnapshot().message.text, TEXT.consent);
  h.state.create = () => http(202, status('r1'));
  await h.store.retry(failed('r1'));
  assert.equal(h.posts.length, 2);
  assert.notEqual(h.posts[1].key, h.posts[0].key);
  assert.deepEqual(h.posts[1].body.consent, { accepted: true, noticeRevision: 'notice-v2', scopeRevision: 'scope-r1-v2' });
  assert.equal(h.posts[1].body.retryOfRequestId, 'req-old-r1');
});

test('재요청 429는 같은 키·본문을 붙잡고, 401(앞선 불명 없음)은 키를 놓고 로그인 안내만 한다', async () => {
  const limited = harness({ create: () => apiError(429, 'RATE_LIMITED') });
  await limited.store.open();
  await limited.store.retry(failed('r1'));
  assert.equal(limited.store.getSnapshot().phase, 'limited');
  assert.equal(limited.store.getSnapshot().pendingRetry, true);
  limited.state.create = () => http(202, status('r1'));
  await limited.store.resend();
  assert.deepEqual(limited.posts.map((post) => post.key), ['key-1', 'key-1']);
  assert.equal(limited.posts[0].json, limited.posts[1].json);
  assert.equal(limited.store.getSnapshot().message.text, TEXT.retryAccepted);

  const auth = harness({ create: () => apiError(401, 'AUTH_REQUIRED') });
  await auth.store.open();
  await auth.store.retry(failed('r1'));
  assert.equal(auth.store.getSnapshot().phase, 'editing');
  assert.equal(auth.store.getSnapshot().pendingRetry, false);
  assert.equal(auth.store.getSnapshot().message.text, TEXT.auth);
  await auth.store.retry(failed('r1'));
  assert.deepEqual(auth.posts.map((post) => post.key), ['key-1', 'key-2']);
});

test('재요청 429 Retry-After: 대기 중에는 다시 보내지 않고, 대기가 끝난 뒤 사용자가 누를 때만 같은 키·본문(retryOfRequestId 포함)으로 보낸다', async () => {
  let clock = 1_000_000;
  const h = harness({ create: () => ({ ...apiError(429, 'RATE_LIMITED'), retryAfterSeconds: 3 }), now: () => clock });
  await h.store.open();
  await h.store.retry(failed('r1'));
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.getSnapshot().pendingRetry, true);
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');
  assert.equal(h.store.retryWaitSeconds(), 3);

  // 대기 중: 다시 보내기·새 재요청 모두 보내지 않는다. 시간이 지나도 스스로 보내지 않는다.
  assert.equal(h.store.canResend(), false);
  await h.store.resend();
  await h.store.retry(failed('r1'));
  clock += 2_999;
  await tick();
  assert.equal(h.store.retryWaitSeconds(), 1);
  assert.equal(h.store.canResend(), false);
  await h.store.resend();
  assert.equal(h.posts.length, 1, '대기 중 전송 없음');
  assert.deepEqual(h.watched, []);

  // 대기 끝: 사용자가 누르면 같은 키·같은 본문으로만 보낸다.
  clock += 1;
  assert.equal(h.store.retryWaitSeconds(), 0);
  assert.equal(h.store.canResend(), true);
  assert.equal(h.posts.length, 1, '대기가 끝나도 자동 전송 없음');
  h.state.create = () => http(202, status('r1'));
  await h.store.resend();
  assert.deepEqual(h.posts.map((post) => post.key), ['key-1', 'key-1']);
  assert.equal(h.posts[1].json, h.posts[0].json);
  assert.equal(h.posts[1].body.retryOfRequestId, 'req-old-r1');
  assert.equal(h.store.getSnapshot().message.text, TEXT.retryAccepted);
});

test('재요청 응답 불명 → 같은 요청 재전송 → 401: 키·본문·retryOfRequestId와 결과 불명을 유지하고, 새 키로 보내거나 미접수로 확정하지 않는다', async () => {
  const h = harness({ create: () => LOOKUP_FAILED });
  await h.store.open();
  await h.store.retry(failed('r1'));
  assert.equal(h.store.getSnapshot().phase, 'unknown');

  h.state.create = () => apiError(401, 'AUTH_REQUIRED');
  await h.store.resend();
  const snapshot = h.store.getSnapshot();
  assert.deepEqual(h.posts.map((post) => post.key), ['key-1', 'key-1']);
  assert.equal(h.posts[1].json, h.posts[0].json);
  assert.equal(h.posts[1].body.retryOfRequestId, 'req-old-r1');
  assert.equal(snapshot.phase, 'unknown', '앞선 시도의 결과는 여전히 모른다');
  assert.equal(snapshot.pendingRetry, true);
  assert.equal(snapshot.pendingRepositoryId, 'r1');
  assert.equal(snapshot.message.text, TEXT.auth);
  assert.deepEqual(h.watched, [], '미접수 안내·목록 다시 읽기로 넘어가지 않는다');

  // 새 재요청은 받지 않는다. 같은 상태 객체를 유지한 채 성공 응답 대역으로 바꾸면 기존 키·본문으로 재전송한다.
  // 실제 로그인 이동·복원은 검사하지 않는다.
  await h.store.retry(failed('r1'));
  assert.equal(h.posts.length, 2, '새 키 자동 전송 없음');
  assert.equal(h.store.canResend(), true);
  h.state.create = () => http(200, status('r1'));
  await h.store.resend();
  assert.deepEqual(h.posts.map((post) => post.key), ['key-1', 'key-1', 'key-1']);
  assert.equal(h.posts[2].json, h.posts[0].json);
  assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
});

test('화면을 떠나면(dispose) 재요청 표시와 붙잡은 키·본문을 버리고, 늦은 응답은 반영하지 않는다', async () => {
  let release;
  const h = harness({ create: () => new Promise((resolve) => { release = resolve; }) });
  await h.store.open();
  const pending = h.store.retry(failed('r1'));
  h.store.dispose();
  release(http(202, status('r1')));
  await pending;
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'editing');
  assert.equal(snapshot.pendingRetry, false);
  assert.equal(snapshot.message, null);
  assert.deepEqual(h.watched, []);
});
