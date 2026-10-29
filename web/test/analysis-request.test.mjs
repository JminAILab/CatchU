import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalysisRequestApi, readNotice } from '../src/features/analysis-request/analysis-request-api.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';
import {
  createRepositoryApi, readAnalyzableRepository, readRepository,
} from '../src/features/repository-management/repository-api.ts';

// 합성 응답 단위 시험이다. 실제 HTTP·DB·접수가 아니다.
const repo = (id, revision = `scope-${id}`) => ({
  repositoryId: id, name: id, ownerLogin: 'octo', url: `https://github.com/octo/${id}`, allowedScopeRevision: revision,
});
const NOTICE = { noticeRevision: 'notice-v1', text: '첫 줄\n둘째 줄' };
const status = (repositoryId, overrides = {}) => ({
  requestId: `req-${repositoryId}`, repositoryId, consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-10-18T01:00:00Z', updatedAt: '2026-10-18T01:00:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false,
  ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: null, collectionLimitNotes: [],
  retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [], ...overrides,
});
const http = (status, data) => ({ kind: 'success', status, data });
const apiError = (status, code, details) => ({ kind: 'api-error', status, code, message: '거부', ...(details ? { details } : {}) });
const LOOKUP_FAILED = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** 키를 순서대로 만드는 대역. 어떤 키로 보냈는지 시험에서 비교한다. */
function keyHolder() {
  let n = 0;
  let key = null;
  return { current() { key ??= `key-${n += 1}`; return key; }, reset() { key = null; } };
}

/**
 * 합성 전송 대역. create는 handler가 돌려주는 값(또는 Promise)을 그대로 쓴다.
 * 모든 POST의 키·본문을 기록한다.
 */
function harness({ repositories = [repo('r1'), repo('r2')], notice = http(200, NOTICE), create = () => http(202, status('r1')) } = {}) {
  const posts = [];
  const gets = { repositories: 0, notice: 0 };
  const state = { repositories, notice, create };
  const requests = createAnalysisRequestApi(async (path, request) => {
    if (path === '/analysis-notice') { gets.notice += 1; return typeof state.notice === 'function' ? state.notice() : state.notice; }
    posts.push({ path, method: request.method, key: request.idempotencyKey, body: structuredClone(request.body) });
    return state.create(request.body, request.idempotencyKey);
  });
  const repositoryLookup = async () => {
    gets.repositories += 1;
    const value = typeof state.repositories === 'function' ? await state.repositories() : state.repositories;
    return Array.isArray(value) ? { kind: 'success', data: value } : value;
  };
  const store = createAnalysisRequestStore({ repositories: repositoryLookup, requests, keys: keyHolder() });
  const watched = [];
  store.watchStatusChanges(() => watched.push(store.getSnapshot().message?.text));
  return { store, posts, gets, state, watched };
}

async function ready(h, repositoryId = 'r1') {
  await h.store.open();
  h.store.select(repositoryId);
}

// ── 응답 해석 ─────────────────────────────────────────────

test('판본 필드: allowedScopeRevision이 비거나 문자열이 아니거나 없으면 분석 요청용 저장소로 읽지 않는다', () => {
  assert.deepEqual(readAnalyzableRepository(repo('r1', 'rev-1')), repo('r1', 'rev-1'));
  for (const revision of ['', 1, null, undefined, {}]) {
    const raw = { ...repo('r1'), allowedScopeRevision: revision };
    if (revision === undefined) delete raw.allowedScopeRevision;
    assert.equal(readAnalyzableRepository(raw), null, `revision=${JSON.stringify(revision)}`);
  }
  // #153 이름 결합용 해석은 바뀌지 않는다(판본이 없어도 이름은 읽는다).
  const withoutRevision = repo('r1');
  delete withoutRevision.allowedScopeRevision;
  assert.deepEqual(readRepository(withoutRevision), withoutRevision);
});

test('선정 목록: 항목 하나라도 판본이 잘못되면 빈 목록이 아니라 조회 실패이고, 정상이면 판본을 보존한다', async () => {
  const page = (items) => async () => http(200, { items, page: { nextCursor: null } });
  const good = createRepositoryApi(page([repo('r1', 'rev-1')]));
  assert.deepEqual(await good.analyzableRepositories(), { kind: 'success', data: [repo('r1', 'rev-1')] });
  const bad = createRepositoryApi(page([repo('r1'), { ...repo('r2'), allowedScopeRevision: 7 }]));
  assert.deepEqual(await bad.analyzableRepositories(), LOOKUP_FAILED);
  // 같은 응답이라도 #153의 이름 결합 목록은 기존대로 읽는다.
  assert.equal((await bad.repositories()).kind, 'success');
});

test('고지: noticeRevision·text 모양을 확인하고, 403은 조회 실패로 바꾸지 않고 그대로 돌려준다', async () => {
  assert.deepEqual(readNotice(NOTICE), NOTICE);
  assert.equal(readNotice({ noticeRevision: '', text: 'x' }), null);
  assert.equal(readNotice({ noticeRevision: 'v1', text: 3 }), null);
  const forbidden = createAnalysisRequestApi(async () => apiError(403, 'INTERNAL_ERROR'));
  assert.equal((await forbidden.notice()).code, 'INTERNAL_ERROR');
  const thrown = createAnalysisRequestApi(async () => { throw new TypeError('network'); });
  assert.deepEqual(await thrown.notice(), LOOKUP_FAILED);
});

test('접수 POST: 202는 새 접수, 200은 기존 작업이고 그 밖의 2xx·계약과 다른 본문·다른 저장소 상태는 접수 여부를 모르는 결과다', async () => {
  const body = { repositoryId: 'r1', consent: { accepted: true, noticeRevision: 'n', scopeRevision: 's' } };
  const calls = [];
  const api = (result) => createAnalysisRequestApi(async (path, request) => { calls.push({ path, request }); return result; });
  assert.equal((await api(http(202, status('r1'))).create(body, 'k')).data.kind, 'accepted');
  assert.deepEqual(calls[0], { path: '/analysis-requests', request: { method: 'POST', body, idempotencyKey: 'k' } });
  assert.equal((await api(http(200, status('r1'))).create(body, 'k')).data.kind, 'existing');
  assert.deepEqual(await api(http(201, status('r1'))).create(body, 'k'), { kind: 'lookup-failed', status: 201, code: 'LOOKUP_FAILED' });
  assert.equal((await api(http(202, { ...status('r1'), processing: 'DONE' })).create(body, 'k')).kind, 'lookup-failed');
  assert.equal((await api(http(202, status('r2'))).create(body, 'k')).kind, 'lookup-failed');
});

// ── 첫 요청 흐름 ─────────────────────────────────────────

test('202: 현재 고지·고른 저장소 판본으로 동의 본문을 보내고, 접수 안내 뒤 선택을 풀며 상태 갱신을 부른다', async () => {
  const h = harness();
  await ready(h, 'r2');
  assert.equal(h.store.canSubmit(), true);
  h.state.create = (body) => http(202, status(body.repositoryId));
  await h.store.submit();
  assert.deepEqual(h.posts, [{
    path: '/analysis-requests', method: 'POST', key: 'key-1',
    body: { repositoryId: 'r2', consent: { accepted: true, noticeRevision: 'notice-v1', scopeRevision: 'scope-r2' } },
  }]);
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'editing');
  assert.equal(snapshot.selectedId, null);
  assert.equal(snapshot.message.text, TEXT.accepted);
  assert.deepEqual(h.watched, [TEXT.accepted]);
  // 확정됐으므로 다음 요청은 새 키다.
  h.store.select('r1');
  await h.store.submit();
  assert.equal(h.posts[1].key, 'key-2');
});

test('200: 같은 저장소 진행 작업은 새 요청을 만들지 않았다고 안내한다', async () => {
  const h = harness({ create: () => http(200, status('r1', { processing: 'RUNNING' })) });
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().message.text, TEXT.existing);
  assert.equal(h.store.getSnapshot().phase, 'editing');
});

test('준비 전에는 보내지 않는다: 저장소 미선택·고지 조회 실패·고지 403·목록 조회 실패', async () => {
  const none = harness();
  await none.store.open();
  assert.equal(none.store.canSubmit(), false);
  await none.store.submit();
  assert.equal(none.posts.length, 0);

  const noticeFailed = harness({ notice: apiError(500, 'INTERNAL_ERROR') });
  await ready(noticeFailed);
  assert.deepEqual(noticeFailed.store.getSnapshot().notice, { state: 'failed' });
  assert.equal(noticeFailed.store.canSubmit(), false);

  // 서버가 지금은 고지를 줄 수 없다고 판정한 403은 조회 실패와 다른 상태다(재동의를 유도하지 않는다).
  const noticeForbidden = harness({ notice: apiError(403, 'CONSENT_REQUIRED') });
  await ready(noticeForbidden);
  assert.deepEqual(noticeForbidden.store.getSnapshot().notice, { state: 'unavailable', code: 'CONSENT_REQUIRED' });
  assert.equal(noticeForbidden.store.canSubmit(), false);

  const listFailed = harness({ repositories: LOOKUP_FAILED });
  await ready(listFailed);
  assert.deepEqual(listFailed.store.getSnapshot().repositories, { state: 'failed' });
  assert.equal(listFailed.store.canSubmit(), false);

  const listForbidden = harness({ repositories: apiError(403, 'GITHUB_CONNECTION_REQUIRED') });
  await ready(listForbidden);
  assert.deepEqual(listForbidden.store.getSnapshot().repositories, { state: 'unavailable', code: 'GITHUB_CONNECTION_REQUIRED' });
  assert.equal(noticeFailed.posts.length + noticeForbidden.posts.length + listFailed.posts.length + listForbidden.posts.length, 0);
});

test('중복 클릭: 같은 틱에 두 번 눌러도 POST는 한 번이고, 요청 중에는 선택을 바꾸지 못한다', async () => {
  const pending = deferred();
  const h = harness({ create: () => pending.promise });
  await ready(h);
  const first = h.store.submit();
  const second = h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'submitting');
  assert.equal(h.store.canSubmit(), false);
  h.store.select('r2');
  assert.equal(h.store.getSnapshot().selectedId, 'r1');
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');
  pending.resolve(http(202, status('r1')));
  await Promise.all([first, second]);
  assert.equal(h.posts.length, 1);
});

// ── 응답 불명 ─────────────────────────────────────────

for (const [name, result] of [
  ['5xx', apiError(500, 'INTERNAL_ERROR')],
  ['네트워크(조회 실패)', LOOKUP_FAILED],
  ['계약과 다른 202 본문', http(202, { requestId: 'x' })],
]) {
  test(`응답 불명(${name}): 자동으로 다시 보내지 않고, [같은 요청 다시 보내기]만 같은 키·같은 본문으로 보낸다`, async () => {
    const h = harness({ create: () => result });
    await ready(h);
    await h.store.submit();
    await tick();
    assert.equal(h.posts.length, 1, '자동 재전송 없음');
    const snapshot = h.store.getSnapshot();
    assert.equal(snapshot.phase, 'unknown');
    assert.equal(snapshot.message.text, TEXT.unknown);
    assert.equal(h.store.canSubmit(), false);
    assert.equal(h.store.canResend(), true);
    assert.deepEqual(h.watched, [], '접수를 확인하지 못했으므로 상태 갱신을 부르지 않는다');

    // 이미 접수돼 있었다면 서버는 같은 키·본문에 200으로 그 요청을 돌려준다.
    h.state.create = () => http(200, status('r1'));
    await h.store.resend();
    assert.equal(h.posts.length, 2);
    assert.equal(h.posts[1].key, h.posts[0].key);
    assert.deepEqual(h.posts[1].body, h.posts[0].body);
    assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
    assert.equal(h.store.getSnapshot().phase, 'editing');
  });
}

test('응답 불명 뒤 재전송이 202면(앞선 시도가 저장되지 않았던 경우) 새 접수로 안내하고, 200이어도 앞선 시도가 만든 요청이라고 특정하지 않는다', async () => {
  const h = harness({ create: () => LOOKUP_FAILED });
  await ready(h);
  await h.store.submit();
  h.state.create = () => http(202, status('r1'));
  await h.store.resend();
  assert.equal(h.posts[1].key, h.posts[0].key);
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
  // 200 안내는 같은 키 재전송과 같은 저장소 진행 작업 반환을 모두 포함하는 사실만 말한다.
  assert.doesNotMatch(TEXT.resentExisting, /앞서 보낸|이전 시도/);
});

test('접수·거부 안내는 「연결된 저장소」의 조회 결과를 단정하지 않는다(그 조회는 따로 실패할 수 있다)', () => {
  for (const [name, text] of Object.entries(TEXT)) {
    assert.doesNotMatch(text, /연결된 저장소」에서 확인할 수 있습니다/, name);
  }
});

test('응답 불명 중 모달 재열기·선택 변경·목록 갱신이 붙잡은 키·본문을 바꾸지 않는다', async () => {
  const h = harness({ create: () => apiError(503, 'INTERNAL_ERROR') });
  await ready(h, 'r1');
  await h.store.submit();
  const before = { ...h.gets };

  // 다시 열어도 목록·고지를 읽지 않고(동의한 고지와 다른 최신 고지를 보이지 않기 위해) 안내도 그대로다.
  await h.store.open();
  assert.deepEqual(h.gets, before);
  assert.equal(h.store.getSnapshot().message.text, TEXT.unknown);

  h.store.select('r2');
  assert.equal(h.store.getSnapshot().selectedId, 'r1');

  // 직접 다시 읽어 선택한 저장소가 목록에서 빠져도 붙잡은 요청은 그대로다.
  h.state.repositories = [repo('r2')];
  h.state.notice = http(200, { noticeRevision: 'notice-v2', text: '바뀐 안내' });
  await h.store.loadRepositories();
  assert.equal(h.store.getSnapshot().selectedId, 'r1');
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');

  h.state.create = () => http(202, status('r1'));
  await h.store.resend();
  assert.equal(h.posts[1].key, h.posts[0].key);
  assert.deepEqual(h.posts[1].body.consent, { accepted: true, noticeRevision: 'notice-v1', scopeRevision: 'scope-r1' });
});

test('응답 불명 뒤 재전송이 판본 거부(403 CONSENT_REQUIRED)면 그때 키를 놓고 최신 고지로 새 동의를 받는다', async () => {
  const h = harness({ create: () => LOOKUP_FAILED });
  await ready(h);
  await h.store.submit();
  h.state.notice = http(200, { noticeRevision: 'notice-v2', text: '바뀐 안내' });
  h.state.create = () => apiError(403, 'CONSENT_REQUIRED');
  await h.store.resend();
  await tick();
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().message.text, TEXT.consent);
  assert.equal(h.store.getSnapshot().notice.value.noticeRevision, 'notice-v2');
  h.state.create = () => http(202, status('r1'));
  await h.store.submit();
  assert.equal(h.posts[2].key, 'key-2');
  assert.equal(h.posts[2].body.consent.noticeRevision, 'notice-v2');
});

// ── 확정 거부 ─────────────────────────────────────────

test('403 CONSENT_REQUIRED만 판본 거부다: 고지·목록을 다시 읽고 자동으로 다시 보내지 않으며, 다시 누르면 새 키·새 판본이다', async () => {
  const h = harness({ create: () => apiError(403, 'CONSENT_REQUIRED') });
  await ready(h);
  const before = { ...h.gets };
  h.state.notice = http(200, { noticeRevision: 'notice-v2', text: '바뀐 안내' });
  h.state.repositories = [repo('r1', 'scope-r1-v2'), repo('r2')];
  await h.store.submit();
  await tick();
  assert.equal(h.posts.length, 1, '자동 재전송 없음');
  assert.deepEqual(h.gets, { repositories: before.repositories + 1, notice: before.notice + 1 });
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.message.text, TEXT.consent);
  assert.equal(snapshot.selectedId, 'r1', '목록에 남은 선택은 유지한다');
  h.state.create = () => http(202, status('r1'));
  await h.store.submit();
  assert.equal(h.posts[1].key, 'key-2');
  assert.deepEqual(h.posts[1].body.consent, { accepted: true, noticeRevision: 'notice-v2', scopeRevision: 'scope-r1-v2' });
});

test('거부 뒤 다시 읽는 동안에는 보낼 수 없고, 다시 읽기가 실패하면 조회 실패로 보이며, 사용자가 다시 누르기 전에는 POST가 없다', async () => {
  for (const [code, status, reloadsNotice] of [
    ['CONSENT_REQUIRED', 403, true], ['REPOSITORY_NOT_ALLOWED', 403, false], ['VALIDATION_FAILED', 400, true],
  ]) {
    const h = harness({ create: () => apiError(status, code) });
    await ready(h);
    const list = deferred();
    const notice = deferred();
    h.state.repositories = () => list.promise;
    h.state.notice = () => notice.promise;
    await h.store.submit();
    // 안내는 다시 읽기를 시작한 시점에 보이며, 끝났다고 단정하지 않는다.
    const message = h.store.getSnapshot().message.text;
    assert.doesNotMatch(message, /다시 불러왔/, code);
    assert.deepEqual(h.store.getSnapshot().repositories, { state: 'loading' }, code);
    if (reloadsNotice) assert.deepEqual(h.store.getSnapshot().notice, { state: 'loading' }, code);
    h.store.select('r1');
    assert.equal(h.store.canSubmit(), false, `${code}: 다시 읽는 중에는 보낼 수 없다`);
    await h.store.submit();
    assert.equal(h.posts.length, 1, `${code}: 다시 읽는 중 누름은 POST를 만들지 않는다`);

    list.resolve(LOOKUP_FAILED);
    notice.resolve(apiError(500, 'INTERNAL_ERROR'));
    await tick();
    assert.deepEqual(h.store.getSnapshot().repositories, { state: 'failed' }, code);
    if (reloadsNotice) assert.deepEqual(h.store.getSnapshot().notice, { state: 'failed' }, code);
    assert.equal(h.store.canSubmit(), false, `${code}: 조회 실패면 보낼 수 없다`);
    assert.equal(h.store.getSnapshot().message.text, message, `${code}: 거부 안내는 그대로다`);
    await tick();
    assert.equal(h.posts.length, 1, `${code}: 자동 재전송 없음`);
  }
});

test('그 밖의 403은 판본 거부로 다루지 않는다: 고지를 다시 읽지 않고 코드별로 안내한다', async () => {
  const cases = [
    ['GITHUB_CONNECTION_REQUIRED', TEXT.github, 'github'],
    ['INTERNAL_ERROR', TEXT.unavailable, undefined],
    ['FORBIDDEN', TEXT.unavailable, undefined],
  ];
  for (const [code, text, action] of cases) {
    const h = harness({ create: () => apiError(403, code) });
    await ready(h);
    const before = { ...h.gets };
    await h.store.submit();
    await tick();
    const snapshot = h.store.getSnapshot();
    assert.equal(snapshot.message.text, text, code);
    assert.equal(snapshot.message.action, action, code);
    assert.equal(snapshot.phase, 'editing', code);
    assert.equal(h.gets.notice, before.notice, `${code}: 고지를 다시 읽지 않음`);
  }

  const notAllowed = harness({ create: () => apiError(403, 'REPOSITORY_NOT_ALLOWED') });
  await ready(notAllowed);
  const before = notAllowed.gets.repositories;
  notAllowed.state.repositories = [repo('r2')];
  await notAllowed.store.submit();
  await tick();
  assert.equal(notAllowed.store.getSnapshot().message.text, TEXT.notAllowed);
  assert.equal(notAllowed.store.getSnapshot().selectedId, null);
  assert.equal(notAllowed.gets.repositories, before + 1);
  assert.equal(notAllowed.gets.notice, 1);
});

test('409: 다른 저장소 진행·재분석 보류·이전 요청 있음은 접수되지 않았다고 안내하고 상태를 다시 불러온다', async () => {
  for (const [code, text] of [
    ['ANALYSIS_IN_PROGRESS', TEXT.inProgress], ['REANALYSIS_DEFERRED', TEXT.deferred], ['RETRY_NOT_ALLOWED', TEXT.previousRequest],
  ]) {
    const h = harness({ create: () => apiError(409, code, code === 'ANALYSIS_IN_PROGRESS' ? { existingRequestId: 'req-other' } : undefined) });
    await ready(h);
    await h.store.submit();
    assert.equal(h.store.getSnapshot().message.text, text, code);
    assert.deepEqual(h.watched, [text], code);
    // 확정 거부이므로 다음 요청은 새 키다.
    await h.store.submit();
    assert.equal(h.posts[1].key, 'key-2', code);
  }
});

test('400은 고지·목록을 다시 읽고, 401은 첫 시도면 키를 놓지만 앞선 시도가 응답 불명이면 붙잡은 요청을 유지한다', async () => {
  const invalid = harness({ create: () => apiError(400, 'VALIDATION_FAILED') });
  await ready(invalid);
  await invalid.store.submit();
  await tick();
  assert.equal(invalid.store.getSnapshot().message.text, TEXT.invalid);
  assert.equal(invalid.gets.notice, 2);

  const auth = harness({ create: () => apiError(401, 'AUTH_REQUIRED') });
  await ready(auth);
  await auth.store.submit();
  assert.equal(auth.store.getSnapshot().phase, 'editing');
  assert.equal(auth.store.getSnapshot().message.text, TEXT.auth);
  await auth.store.submit();
  assert.equal(auth.posts[1].key, 'key-2');

  const unknownThenAuth = harness({ create: () => LOOKUP_FAILED });
  await ready(unknownThenAuth);
  await unknownThenAuth.store.submit();
  unknownThenAuth.state.create = () => apiError(401, 'AUTH_INVALID');
  await unknownThenAuth.store.resend();
  assert.equal(unknownThenAuth.store.getSnapshot().phase, 'unknown');
  assert.equal(unknownThenAuth.store.canResend(), true);
  unknownThenAuth.state.create = () => http(200, status('r1'));
  await unknownThenAuth.store.resend();
  assert.equal(unknownThenAuth.posts[2].key, unknownThenAuth.posts[0].key);
  assert.equal(unknownThenAuth.store.getSnapshot().message.text, TEXT.resentExisting);
});

// ── 늦은 응답·분리 ─────────────────────────────────────────

test('늦은 응답: 먼저 시작한 목록·고지 조회가 늦게 끝나도 최신 결과를 덮지 않는다', async () => {
  const slowList = deferred();
  const slowNotice = deferred();
  let listCall = 0;
  let noticeCall = 0;
  const h = harness({
    repositories: () => (++listCall === 1 ? slowList.promise : [repo('fresh')]),
    notice: () => (++noticeCall === 1 ? slowNotice.promise : http(200, { noticeRevision: 'fresh', text: '최신' })),
  });
  const first = h.store.open();
  await h.store.load();
  slowList.resolve([repo('stale')]);
  slowNotice.resolve(http(200, { noticeRevision: 'stale', text: '이전' }));
  await first;
  const snapshot = h.store.getSnapshot();
  assert.deepEqual(snapshot.repositories.value.map((item) => item.repositoryId), ['fresh']);
  assert.equal(snapshot.notice.value.noticeRevision, 'fresh');
});

test('입력 중 다시 읽은 목록에서 고른 저장소가 빠지면 선택을 풀고, 남아 있으면 유지한다', async () => {
  const h = harness();
  await ready(h, 'r2');
  await h.store.loadRepositories();
  assert.equal(h.store.getSnapshot().selectedId, 'r2');
  h.state.repositories = [repo('r1')];
  await h.store.loadRepositories();
  assert.equal(h.store.getSnapshot().selectedId, null);
  h.store.select('r2');
  assert.equal(h.store.getSnapshot().selectedId, null, '목록에 없는 저장소는 고를 수 없다');
});

test('접수 성공과 상태 조회 실패는 분리된다: 상태 갱신 함수가 실패해도 접수 안내와 키 확정은 그대로다', async () => {
  const h = harness();
  h.store.watchStatusChanges(() => { throw new Error('상태 조회 실패'); });
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
  assert.equal(h.posts.length, 1, '상태 조회 실패로 다시 접수하지 않는다');
  await h.store.submit();
  assert.equal(h.posts.length, 1, '선택이 풀려 같은 요청을 다시 보내지 않는다');
});

test('모달을 다시 열면 입력 중의 지난 안내를 지우고 목록·고지를 다시 읽는다. 닫힌 동안 끝난 응답도 반영돼 있다', async () => {
  const pending = deferred();
  const h = harness({ create: () => pending.promise });
  await ready(h);
  const sending = h.store.submit();
  // 모달을 닫아도 상태 객체는 남아 있고 POST를 취소하지 않는다.
  pending.resolve(http(202, status('r1')));
  await sending;
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
  const before = { ...h.gets };
  await h.store.open();
  assert.equal(h.store.getSnapshot().message, null);
  assert.deepEqual(h.gets, { repositories: before.repositories + 1, notice: before.notice + 1 });
});

test('dispose 뒤 도착한 접수 응답은 버리고 처음 상태로 돌아간다(회원 변경·화면 이동)', async () => {
  const pending = deferred();
  const h = harness({ create: () => pending.promise });
  await ready(h);
  const sending = h.store.submit();
  h.store.dispose();
  pending.resolve(http(202, status('r1')));
  await sending;
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.phase, 'editing');
  assert.equal(snapshot.message, null);
  assert.deepEqual(snapshot.repositories, { state: 'loading' });
  assert.deepEqual(h.watched, []);
});
