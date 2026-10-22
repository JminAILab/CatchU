import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as repositoryApi from '../src/features/repository-management/repository-api.ts';
import * as repositoryStatus from '../src/features/repository-management/repository-status.ts';

// #153 후속: 「연결된 저장소」 조회에서 선정 목록이 403 GITHUB_CONNECTION_REQUIRED를 돌려주면 /me를 한 번 다시 읽는다.
// 합성 응답 시험이다. 실제 API·DB와 화면 전이(취소·늦은 응답)는 브라우저 검사에서 따로 확인한다.

const { createRepositoryApi } = repositoryApi;
const ok = (data) => ({ kind: 'success', status: 200, data });
const apiError = (status, code) => ({ kind: 'api-error', status, code, message: 'm' });
const page = (items) => ok({ items, page: { nextCursor: null } });
const me = (state) => ok({ memberId: 'm', profile: {}, github: { state, accountLogin: 'octo' } });
const analysis = {
  requestId: 'req-1', repositoryId: 'repo-1', consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-09-30T01:00:00Z', updatedAt: '2026-09-30T01:05:00Z', requestState: 'ACCEPTED', lifecycle: 'ACTIVE',
  processing: 'SUCCEEDED', application: 'APPLIED', sourceMode: 'MOCK', eligibleCandidateCount: 1, registeredCatchIds: ['cat-1'],
  ownerResultsReady: true, retry: { allowed: false, reason: 'NOT_FAILED' }, failures: [],
};
const required = () => apiError(403, 'GITHUB_CONNECTION_REQUIRED');

/** 경로별 응답을 차례로 돌려주는 대역. 호출 경로·메서드·signal을 기록한다. 본문·토큰은 다루지 않는다. */
function fake(routes) {
  const calls = [];
  const transport = async (path, request) => {
    calls.push({ path: new URL(path, 'https://fixture.invalid').pathname, method: request.method, signal: request.signal });
    const handler = routes[new URL(path, 'https://fixture.invalid').pathname];
    const next = Array.isArray(handler) ? handler.shift() : handler;
    if (next === undefined) return apiError(404, 'RESOURCE_UNAVAILABLE');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  const count = (path) => calls.filter((call) => call.path === path).length;
  return { calls, count, api: createRepositoryApi(transport) };
}

test('목록 403 GITHUB_CONNECTION_REQUIRED는 /me를 한 번 다시 읽어 DISCONNECTED·REAUTH_REQUIRED·CONNECTED를 그대로 돌려준다', async () => {
  for (const state of ['DISCONNECTED', 'REAUTH_REQUIRED', 'CONNECTED']) {
    const server = fake({ '/me/repositories': required, '/analysis-requests': page([analysis]), '/me': me(state) });
    let checking = 0;
    const result = await repositoryApi.loadConnectedRepositories(server.api, undefined, () => { checking += 1; });
    assert.deepEqual(result, { kind: 'connection', github: { kind: 'success', data: state } });
    assert.equal(checking, 1, '재조회 시작을 한 번 알린다');
    assert.deepEqual([server.count('/me/repositories'), server.count('/me')], [1, 1], '목록을 다시 보내지 않고 /me도 한 번만');
    assert.ok(server.calls.every((call) => call.method === 'GET'), 'GET만 보낸다(분석 접수 POST 없음)');
  }
});

test('/me 재조회가 실패하면 연결 상태를 추정하지 않고 조회 실패 결과를 그대로 돌려준다', async () => {
  for (const meResult of [apiError(500, 'INTERNAL_ERROR'), new TypeError('network'), ok({ memberId: 'm', github: { state: 'UNKNOWN' } })]) {
    const server = fake({ '/me/repositories': required, '/analysis-requests': page([]), '/me': meResult });
    const result = await repositoryApi.loadConnectedRepositories(server.api);
    assert.equal(result.kind, 'connection');
    assert.notEqual(result.github.kind, 'success');
  }
});

test('일반 500·통신 오류·커서 오류·다른 403·분석 이력의 403은 재조회하지 않고 일반 조회 실패다', async () => {
  for (const [name, routes] of [
    ['목록 500', { '/me/repositories': apiError(500, 'INTERNAL_ERROR'), '/analysis-requests': page([]) }],
    ['목록 통신 오류', { '/me/repositories': new TypeError('network'), '/analysis-requests': page([]) }],
    ['목록 커서 오류', { '/me/repositories': apiError(400, 'VALIDATION_FAILED'), '/analysis-requests': page([]) }],
    ['목록의 다른 403', { '/me/repositories': apiError(403, 'INTERNAL_ERROR'), '/analysis-requests': page([]) }],
    ['이력의 연결 필요 403', { '/me/repositories': page([]), '/analysis-requests': required }],
    ['이력 500', { '/me/repositories': page([]), '/analysis-requests': apiError(500, 'INTERNAL_ERROR') }],
  ]) {
    const server = fake({ ...routes, '/me': me('DISCONNECTED') });
    let checking = 0;
    const listed = name.startsWith('이력') ? { listed: true } : {};
    assert.deepEqual(await repositoryApi.loadConnectedRepositories(server.api, undefined, () => { checking += 1; }), { kind: 'failed', ...listed },
      `${name}: 선정 목록을 받았을 때만 listed`);
    assert.deepEqual([server.count('/me'), checking], [0, 0], `${name}: /me를 다시 읽지 않는다`);
  }
});

test('정상 빈 목록은 조회 실패와 구분된 성공이다', async () => {
  const server = fake({ '/me/repositories': page([]), '/analysis-requests': page([]) });
  assert.deepEqual(await repositoryApi.loadConnectedRepositories(server.api), { kind: 'ready', repositories: [], analyses: [] });
  assert.equal(server.count('/me'), 0);
});

test('취소된 조회는 /me를 다시 읽지 않고, 재조회에도 같은 signal을 넘긴다', async () => {
  const abort = new AbortController();
  const server = fake({ '/me/repositories': () => { abort.abort(); return required(); }, '/analysis-requests': page([]), '/me': me('DISCONNECTED') });
  assert.deepEqual(await repositoryApi.loadConnectedRepositories(server.api, abort.signal), { kind: 'failed' });
  assert.equal(server.count('/me'), 0);

  const live = new AbortController();
  const next = fake({ '/me/repositories': required, '/analysis-requests': page([]), '/me': me('REAUTH_REQUIRED') });
  await repositoryApi.loadConnectedRepositories(next.api, live.signal);
  assert.equal(next.calls.find((call) => call.path === '/me').signal, live.signal);
});

test('재조회 결과의 화면 표시: 연결 해제·재인증 필요는 연동 안내, 다시 연결됨·확인 실패는 일반 조회 실패', () => {
  const view = repositoryStatus.connectionCheckView;
  assert.deepEqual(view({ kind: 'success', data: 'DISCONNECTED' }),
    { github: { state: 'ready', value: 'DISCONNECTED' }, connected: { state: 'failed', github: 'DISCONNECTED' } });
  assert.deepEqual(view({ kind: 'success', data: 'REAUTH_REQUIRED' }),
    { github: { state: 'ready', value: 'REAUTH_REQUIRED' }, connected: { state: 'failed', github: 'REAUTH_REQUIRED' } });
  assert.deepEqual(view({ kind: 'success', data: 'CONNECTED' }),
    { github: { state: 'ready', value: 'CONNECTED' }, connected: { state: 'failed' } });
  assert.deepEqual(view({ kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }),
    { github: { state: 'failed' }, connected: { state: 'failed' } });
  assert.deepEqual(view({ kind: 'api-error', status: 500, code: 'INTERNAL_ERROR', message: 'm' }),
    { github: { state: 'failed' }, connected: { state: 'failed' } });
});

// 미확정 요청 재진입: 재조회로 [연결 관리]가 사라져도 #154 상태 객체에 남은 요청을 확인하러 모달을 다시 열 수 있어야 한다.
// 실제 상태 객체(#154)를 합성 HTTP 응답으로 응답 불명까지 진행해 phase를 얻는다. 화면 전이는 브라우저 검사에서 확인한다.
test('보낸 요청 확인 버튼은 확인하지 못한 요청이 남고 [연결 관리]가 없을 때만 보인다', () => {
  const show = repositoryStatus.showsPendingRequestEntry;
  const ready = (value) => ({ state: 'ready', value });
  for (const phase of ['submitting', 'unknown', 'limited']) {
    for (const github of [ready('DISCONNECTED'), ready('REAUTH_REQUIRED'), { state: 'failed' }, { state: 'loading' }]) {
      assert.equal(show(github, phase), true, `${phase}·${JSON.stringify(github)}`);
    }
    assert.equal(show(ready('CONNECTED'), phase), false, '[연결 관리]가 있으면 그 버튼으로 연다');
  }
  for (const github of [ready('DISCONNECTED'), ready('REAUTH_REQUIRED'), { state: 'failed' }, ready('CONNECTED')]) {
    assert.equal(show(github, 'editing'), false, '확인할 요청이 없으면 새 요청 입구를 만들지 않는다');
  }
});

test('응답 불명 요청: 연결 해제 화면에서 다시 열어도 POST·키·본문·안내가 그대로이고, 확인되면 버튼이 사라진다', async () => {
  const { createApiClient } = await import('../src/lib/api-client.ts');
  const { createAccessTokenStore } = await import('../src/lib/access-token.ts');
  const { createIdempotencyKeyHolder } = await import('../src/lib/idempotency.ts');
  const { createAnalysisRequestApi } = await import('../src/features/analysis-request/analysis-request-api.ts');
  const { createAnalysisRequestStore } = await import('../src/features/analysis-request/analysis-request-store.ts');
  const posts = [];
  const replies = [
    () => Response.json({ code: 'INTERNAL_ERROR', message: '처리 중 오류' }, { status: 503 }),
    () => Response.json({ ...analysis, repositoryId: 'r1', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY',
      ownerResultsReady: false, registeredCatchIds: [], eligibleCandidateCount: 0, retry: { allowed: false, reason: 'IN_PROGRESS' } }, { status: 200 }),
  ];
  const client = createApiClient({
    baseUrl: 'http://127.0.0.1:3001', tokens: createAccessTokenStore(),
    fetch: async (url, init) => {
      if (url.endsWith('/analysis-notice')) return Response.json({ noticeRevision: 'notice-v1', text: '합성 안내' });
      posts.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: init.body });
      const reply = replies.shift();
      assert.ok(reply, '예정하지 않은 추가 POST');
      return reply();
    },
  });
  let generated = 0;
  const store = createAnalysisRequestStore({
    requests: createAnalysisRequestApi(client.member),
    repositories: async () => ({ kind: 'success', data: [{ repositoryId: 'r1', name: 'r1', ownerLogin: 'octo', url: 'https://github.com/octo/r1', allowedScopeRevision: 'scope-r1' }] }),
    keys: createIdempotencyKeyHolder(() => `key-${generated += 1}`),
  });
  const show = (github) => repositoryStatus.showsPendingRequestEntry(github, store.getSnapshot().phase);
  const disconnected = { state: 'ready', value: 'DISCONNECTED' };
  try {
    await store.open();
    store.select('r1');
    await store.submit();
    assert.equal(store.getSnapshot().phase, 'unknown');
    const held = store.getSnapshot();
    assert.equal(show(disconnected), true);

    await store.open(); // [보낸 분석 요청 확인]이 부르는 것과 같은 다시 열기
    assert.equal(posts.length, 1, '다시 여는 것만으로 보내지 않는다');
    assert.deepEqual(store.getSnapshot(), held, '키·본문·안내를 초기화하지 않는다');
    assert.equal(store.canSubmit(), false, '새 요청으로 우회하지 않는다');

    await store.resend();
    assert.deepEqual(posts[1], posts[0], '같은 키·같은 본문');
    assert.equal(store.getSnapshot().phase, 'editing');
    assert.equal(show(disconnected), false, '확인이 끝나면 다시 열 버튼을 보이지 않는다');
  } finally {
    store.dispose();
  }
});

// 미연결 화면의 새 요청: 연결 해제·재인증 필요가 확인됐거나 연결 필요 거부 뒤 다시 확인하는 중이면 입력 단계의 새 요청을 받지 않는다.
test('분석 요청 영역의 연결 안내: 확인된 연결 해제·재인증 필요, 거부 뒤 확인 중만. 로딩·조회 실패는 추정하지 않는다', () => {
  const notice = repositoryStatus.requestConnectionNotice;
  const ready = (value) => ({ state: 'ready', value });
  for (const connected of ['loading', 'checking', 'ready', 'failed']) {
    assert.equal(notice(ready('DISCONNECTED'), false, connected), 'DISCONNECTED');
    assert.equal(notice(ready('REAUTH_REQUIRED'), true, connected), 'REAUTH_REQUIRED');
    assert.equal(notice(ready('CONNECTED'), false, connected), undefined);
    assert.equal(notice({ state: 'failed' }, false, connected), undefined, '조회 실패를 미연결로 추정하지 않는다');
    assert.equal(notice({ state: 'loading' }, false, connected), undefined);
  }
  assert.equal(notice(ready('CONNECTED'), true, 'loading'), 'CHECKING', '연결 필요 거부 뒤 다시 확인하는 동안');
  assert.equal(notice(ready('CONNECTED'), true, 'checking'), 'CHECKING');
  assert.equal(notice(ready('CONNECTED'), true, 'ready'), undefined, '다시 확인해 목록을 받으면 서버 판정을 따른다');
  assert.equal(notice({ state: 'failed' }, true, 'failed'), undefined);
});

test('연결 해제 확인 뒤 다시 읽은 #154 상태 객체는 남은 선택으로 새 본문을 만들지 않고, 다시 연결되면 새 목록에서 고른 뒤에만 보낸다', async () => {
  const { createAnalysisRequestApi } = await import('../src/features/analysis-request/analysis-request-api.ts');
  const { createAnalysisRequestStore } = await import('../src/features/analysis-request/analysis-request-store.ts');
  const { createIdempotencyKeyHolder } = await import('../src/lib/idempotency.ts');
  let linked = true;
  const posts = [];
  const transport = async (path, request) => {
    if (path === '/analysis-notice') return ok({ noticeRevision: 'notice-v1', text: '합성 안내' });
    posts.push(request.idempotencyKey);
    return linked ? { kind: 'success', status: 202, data: { ...analysis, repositoryId: 'r1' } } : apiError(403, 'GITHUB_CONNECTION_REQUIRED');
  };
  let generated = 0;
  const store = createAnalysisRequestStore({
    requests: createAnalysisRequestApi(transport),
    repositories: async () => linked
      ? { kind: 'success', data: [{ repositoryId: 'r1', name: 'r1', ownerLogin: 'octo', url: 'https://github.com/octo/r1', allowedScopeRevision: 'scope-r1' }] }
      : apiError(403, 'GITHUB_CONNECTION_REQUIRED'),
    keys: createIdempotencyKeyHolder(() => `key-${generated += 1}`),
  });
  try {
    await store.open();
    store.select('r1');
    assert.equal(store.canSubmit(), true);
    linked = false;
    await store.load(); // 조립이 연결 해제를 확인하면 부르는 다시 읽기
    assert.equal(store.getSnapshot().repositories.state, 'unavailable');
    assert.equal(store.canSubmit(), false, '남은 선택으로 새 본문을 만들지 않는다');
    await store.submit();
    assert.equal(posts.length, 0, '직접 submit을 불러도 보내지 않는다');

    linked = true;
    await store.load(); // 다시 연결이 확인되면 목록·고지를 다시 읽는다
    assert.equal(store.getSnapshot().repositories.state, 'ready');
    assert.equal(posts.length, 0, '다시 읽기만으로 보내지 않는다');
    store.select('r1');
    await store.submit();
    assert.equal(posts.length, 1);
  } finally {
    store.dispose();
  }
});
