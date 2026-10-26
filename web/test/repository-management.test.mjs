import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepositoryApi, MAX_PAGES, readAnalysis } from '../src/features/repository-management/repository-api.ts';
import {
  canShowCatches, connectedRepositories, latestByRepository, statusDetails, statusIcon,
} from '../src/features/repository-management/repository-status.ts';

const analysis = (overrides = {}) => ({
  requestId: 'req-1', repositoryId: 'repo-1', consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-09-30T01:00:00Z', updatedAt: '2026-09-30T01:05:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'SUCCEEDED', application: 'APPLIED', sourceMode: 'MOCK',
  eligibleCandidateCount: 1, registeredCatchIds: ['cat-1'], ownerResultsReady: true,
  retry: { allowed: false, reason: 'NOT_FAILED' }, failures: [], ...overrides,
});
const repo = (id, name = id, ownerLogin = 'octo') => ({ repositoryId: id, name, ownerLogin, url: `https://github.com/${ownerLogin}/${name}`, allowedScopeRevision: 'v1' });
const summary = (overrides = {}) => readAnalysis(analysis(overrides));
const ok = (data) => ({ kind: 'success', status: 200, data });

function fakeTransport(routes) {
  const calls = [];
  const transport = async (path, request) => {
    calls.push({ path, request });
    const url = new URL(path, 'https://fixture.invalid');
    const handler = routes[url.pathname];
    if (!handler) return { kind: 'api-error', status: 404, code: 'RESOURCE_UNAVAILABLE', message: '없음' };
    return handler(url.searchParams);
  };
  return { calls, api: createRepositoryApi(transport) };
}

test('GitHub 연동 상태는 GET /me의 github.state만 읽고, 모양이 다르면 조회 실패다', async () => {
  const { api } = fakeTransport({ '/me': () => ok({ memberId: 'm', profile: {}, github: { state: 'REAUTH_REQUIRED', accountLogin: 'octo' } }) });
  assert.deepEqual(await api.githubState(), { kind: 'success', data: 'REAUTH_REQUIRED' });
  const broken = fakeTransport({ '/me': () => ok({ memberId: 'm', github: { state: 'UNKNOWN' } }) });
  assert.equal((await broken.api.githubState()).kind, 'lookup-failed');
  const failed = fakeTransport({ '/me': () => ({ kind: 'api-error', status: 401, code: 'AUTH_REQUIRED', message: 'x' }) });
  assert.deepEqual(await failed.api.githubState(), { kind: 'api-error', status: 401, code: 'AUTH_REQUIRED', message: 'x' });
});

test('목록은 nextCursor를 끝까지 따라가고 limit=100으로 GET한다', async () => {
  const { api, calls } = fakeTransport({
    '/analysis-requests': (q) => (q.get('cursor') === 'p2'
      ? ok({ items: [analysis({ requestId: 'req-2' })], page: { nextCursor: null } })
      : ok({ items: [analysis()], page: { nextCursor: 'p2' } })),
  });
  const result = await api.analyses();
  assert.equal(result.kind, 'success');
  assert.deepEqual(result.data.map((item) => item.requestId), ['req-1', 'req-2']);
  assert.deepEqual(calls.map((call) => call.path), ['/analysis-requests?limit=100', '/analysis-requests?limit=100&cursor=p2']);
  assert.ok(calls.every((call) => call.request.method === 'GET'));
});

test('정상 0건은 빈 배열 성공이고, 계약과 다른 항목·같은 커서 반복·페이지 초과는 빈 목록이 아니라 조회 실패다', async () => {
  const empty = fakeTransport({ '/me/repositories': () => ok({ items: [], page: { nextCursor: null } }) });
  assert.deepEqual(await empty.api.repositories(), { kind: 'success', data: [] });

  const badItem = fakeTransport({ '/analysis-requests': () => ok({ items: [analysis({ processing: 'DONE' })], page: { nextCursor: null } }) });
  assert.equal((await badItem.api.analyses()).kind, 'lookup-failed');

  const loop = fakeTransport({ '/me/repositories': () => ok({ items: [], page: { nextCursor: 'same' } }) });
  assert.equal((await loop.api.repositories()).kind, 'lookup-failed');

  let n = 0;
  const endless = fakeTransport({ '/me/repositories': () => ok({ items: [], page: { nextCursor: `p${n += 1}` } }) });
  assert.equal((await endless.api.repositories()).kind, 'lookup-failed');
  assert.equal(endless.calls.length, MAX_PAGES);

  // MAX_PAGES번째 페이지에서 끝나면 정상이다(넘을 때만 조회 실패).
  let m = 0;
  const lastAllowed = fakeTransport({ '/me/repositories': () => ok({ items: [], page: { nextCursor: (m += 1) < MAX_PAGES ? `p${m}` : null } }) });
  assert.equal((await lastAllowed.api.repositories()).kind, 'success');
  assert.equal(lastAllowed.calls.length, MAX_PAGES);

  const thrown = createRepositoryApi(async () => { throw new TypeError('network'); });
  assert.deepEqual(await thrown.analyses(), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
});

test('저장소별 최신 요청은 submittedAt이 늦은 것, 같으면 updatedAt이 늦은 것, 둘 다 같으면 먼저 받은 것이다', () => {
  const items = [
    summary({ requestId: 'old', submittedAt: '2026-09-29T00:00:00Z' }),
    summary({ requestId: 'new', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z' }),
    summary({ requestId: 'new-updated', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T02:00:00Z' }),
    summary({ requestId: 'other', repositoryId: 'repo-2' }),
    summary({ requestId: 'tie-first', repositoryId: 'repo-3', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T01:00:00Z' }),
    summary({ requestId: 'tie-second', repositoryId: 'repo-3', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T01:00:00Z' }),
  ];
  const latest = latestByRepository(items);
  assert.equal(latest.get('repo-1').requestId, 'new-updated');
  assert.equal(latest.get('repo-2').requestId, 'other');
  assert.equal(latest.get('repo-3').requestId, 'tie-first');
});

test('연결된 저장소는 분석 이력이 있는 저장소이며, 이름은 선정 목록과 식별자로 합치고 없으면 null이다', () => {
  const connected = connectedRepositories(
    [repo('repo-1', 'api'), repo('repo-3', 'never-requested')],
    [summary({ repositoryId: 'repo-1', submittedAt: '2026-09-29T00:00:00Z' }), summary({ repositoryId: 'repo-9', submittedAt: '2026-09-30T00:00:00Z' })],
  );
  assert.deepEqual(connected.map((item) => [item.repositoryId, item.displayName]), [['repo-9', null], ['repo-1', 'octo/api']]);
});

test('상태 아이콘: 처리 중·실행 불명·반영 전은 분석 중, 반영 뒤 성공/부분 실패, FAILED는 반영 상태와 무관하게 실패', () => {
  const cases = [
    ['QUEUED', 'NOT_READY', 'analyzing'], ['RUNNING', 'NOT_READY', 'analyzing'], ['UNCERTAIN', 'PENDING', 'analyzing'],
    ['SUCCEEDED', 'PENDING', 'analyzing'], ['EMPTY', 'APPLYING', 'analyzing'], ['PARTIAL_FAILED', 'APPLY_FAILED', 'analyzing'],
    ['SUCCEEDED', 'RECOVERING', 'analyzing'],
    ['SUCCEEDED', 'APPLIED', 'success'], ['EMPTY', 'APPLIED', 'success'], ['PARTIAL_FAILED', 'APPLIED', 'partial'],
    ['FAILED', 'NOT_READY', 'failed'], ['FAILED', 'APPLY_FAILED', 'failed'], ['FAILED', 'APPLIED', 'failed'],
  ];
  for (const [processing, application, icon] of cases) assert.equal(statusIcon({ processing, application }), icon, `${processing}/${application}`);
});

test('Catch 보기는 ownerResultsReady이고 등록 Catch가 있을 때만', () => {
  assert.equal(canShowCatches({ ownerResultsReady: true, registeredCatchIds: ['c'] }), true);
  assert.equal(canShowCatches({ ownerResultsReady: true, registeredCatchIds: [] }), false);
  assert.equal(canShowCatches({ ownerResultsReady: false, registeredCatchIds: ['c'] }), false);
});

test('설명 문구: 성공 0건·실행 불명·반영 실패·복구·실패 반영·부분 실패를 구분하고 재요청은 retry.allowed만 따른다', () => {
  assert.deepEqual(statusDetails(summary({ processing: 'EMPTY', registeredCatchIds: [] })), ['분석을 마쳤습니다. 검토할 Catch가 없습니다.']);
  assert.deepEqual(statusDetails(summary()), ['분석을 마쳤습니다. Catch 1개가 준비되었습니다.']);
  assert.match(statusDetails(summary({ processing: 'UNCERTAIN', application: 'NOT_READY' }))[0], /아직 확인되지 않았습니다.*실패로 정해진 것은 아니/);
  const applyFailed = statusDetails(summary({ application: 'APPLY_FAILED', ownerResultsReady: false }));
  assert.match(applyFailed[0], /반영하지 못했습니다.*분석 실패와는 다른/);
  assert.equal(applyFailed.some((line) => /다시 요청/.test(line)), false, '반영 실패를 재요청 가능으로 쓰지 않는다');
  assert.match(statusDetails(summary({ application: 'RECOVERING' }))[0], /복구하고 있습니다/);

  const failed = statusDetails(summary({ processing: 'FAILED', application: 'APPLY_FAILED', registeredCatchIds: [], ownerResultsReady: false,
    retry: { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' }, failures: [{ stage: 'COLLECTION', code: 'X', message: '저장소를 읽지 못했습니다.' }] }));
  assert.deepEqual(failed, ['분석에 실패했습니다.', '실패 결과를 서비스에 반영하지 못했습니다.', '실패한 부분: 저장소를 읽지 못했습니다.', '새로 동의하고 다시 요청할 수 있습니다.']);
  assert.equal(statusDetails(summary({ processing: 'FAILED', application: 'NOT_READY', registeredCatchIds: [], ownerResultsReady: false })).length, 1,
    'FAILED·NOT_READY는 반영 설명을 붙이지 않는다(E 확인 대기)');

  const partial = statusDetails(summary({ processing: 'PARTIAL_FAILED', failures: [{ stage: 'DRAFT', code: 'Y', message: '설명 초안 생성 실패' }] }));
  assert.deepEqual(partial, ['일부 결과만 제공되었습니다. 준비된 Catch 1개를 볼 수 있습니다.', '실패한 부분: 설명 초안 생성 실패']);
});

// #288 닫힌 반영 실패. 응답은 모두 합성이며, 서버가 처리 시한으로 실제 닫은 요청을 읽은 결과가 아니다.
const APPLICATION_DEADLINE = { stage: 'APPLICATION', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 결과를 반영하지 못했습니다.' };
const CLOSED_TEXT = '결과를 서비스에 반영하지 못하고 요청이 종료되었습니다. 분석 실패와는 다른 상태입니다.';
const DEADLINE_TEXT = '종료 사유: 정해진 처리 시간 안에 결과를 반영하지 못했습니다.';
const RETRY_TEXT = '새로 동의하고 다시 요청할 수 있습니다.';
const closedApplyFailed = (overrides = {}) => summary({
  lifecycle: 'CLOSED', application: 'APPLY_FAILED', registeredCatchIds: [], ownerResultsReady: false,
  retry: { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' }, ...overrides,
});

test('응답의 lifecycle과 실패 항목의 stage·code를 읽고, lifecycle 값이 허용 목록 밖이거나 실패 항목의 필수 필드(stage·code·message)가 없거나 문자열이 아니면 빈 목록이 아니라 조회 실패다', async () => {
  assert.equal(summary({ lifecycle: 'CLOSED' }).lifecycle, 'CLOSED');
  assert.deepEqual(summary({ failures: [APPLICATION_DEADLINE] }).failures, [APPLICATION_DEADLINE]);
  for (const broken of [{ lifecycle: undefined }, { lifecycle: 'DONE' }, { lifecycle: null },
    { failures: [{ code: 'X', message: 'm' }] }, { failures: [{ stage: 'DRAFT', message: 'm' }] }, { failures: [{ stage: 'DRAFT', code: 1, message: 'm' }] }]) {
    assert.equal(readAnalysis(analysis(broken)), null, JSON.stringify(broken));
  }
  const { api } = fakeTransport({ '/analysis-requests': () => ok({ items: [analysis({ lifecycle: 'DONE' })], page: { nextCursor: null } }) });
  assert.deepEqual(await api.analyses(), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
});

test('닫힌(CLOSED) 반영 실패는 처리 결과와 관계없이 실패 아이콘이고, 닫히기 전(ACTIVE)과 반영 완료는 기존 아이콘을 유지한다', () => {
  const cases = [
    ['CLOSED', 'SUCCEEDED', 'APPLY_FAILED', 'failed'], ['CLOSED', 'PARTIAL_FAILED', 'APPLY_FAILED', 'failed'],
    ['CLOSED', 'EMPTY', 'APPLY_FAILED', 'failed'], ['CLOSED', 'SUCCEEDED', 'PENDING', 'failed'], ['CLOSED', 'FAILED', 'APPLY_FAILED', 'failed'],
    ['ACTIVE', 'SUCCEEDED', 'APPLY_FAILED', 'analyzing'], ['ACTIVE', 'PARTIAL_FAILED', 'APPLY_FAILED', 'analyzing'], ['ACTIVE', 'SUCCEEDED', 'PENDING', 'analyzing'],
    ['CLOSED', 'SUCCEEDED', 'APPLIED', 'success'], ['CLOSED', 'EMPTY', 'APPLIED', 'success'], ['CLOSED', 'PARTIAL_FAILED', 'APPLIED', 'partial'],
    ['CLOSED', 'FAILED', 'APPLIED', 'failed'],
  ];
  for (const [lifecycle, processing, application, icon] of cases) {
    assert.equal(statusIcon({ lifecycle, processing, application }), icon, `${lifecycle}/${processing}/${application}`);
  }
});

test('성공 결과가 반영 대기 중 처리 시한으로 닫히면 반영 실패 안내 아래 종료 사유를 보이고, 재요청 안내는 retry.allowed만 따른다', () => {
  assert.deepEqual(statusDetails(closedApplyFailed({ failures: [APPLICATION_DEADLINE] })), [CLOSED_TEXT, DEADLINE_TEXT, RETRY_TEXT]);
  // 서버가 재요청을 허용하지 않으면(예: 다른 요청이 진행 중) 같은 닫힌 반영 실패라도 안내하지 않는다. reason으로 다시 계산하지 않는다.
  assert.deepEqual(statusDetails(closedApplyFailed({ failures: [APPLICATION_DEADLINE], retry: { allowed: false, reason: 'FAILURE_WITHOUT_RESULTS' } })),
    [CLOSED_TEXT, DEADLINE_TEXT]);
  assert.deepEqual(statusDetails(closedApplyFailed({ processing: 'EMPTY', failures: [APPLICATION_DEADLINE], retry: { allowed: false, reason: 'IN_PROGRESS' } })),
    [CLOSED_TEXT, DEADLINE_TEXT]);
});

test('부분 실패 결과도 같은 안내·종료 사유를 쓰고, 원래 있던 수집·생성 실패나 전달 단계 시한 초과를 종료 사유로 쓰지 않는다', () => {
  const draft = { stage: 'DRAFT', code: 'DRAFT_FAILED', message: '설명 초안 생성 실패' };
  assert.deepEqual(statusDetails(closedApplyFailed({ processing: 'PARTIAL_FAILED', failures: [draft, APPLICATION_DEADLINE] })),
    [CLOSED_TEXT, DEADLINE_TEXT, '실패한 부분: 설명 초안 생성 실패', RETRY_TEXT]);
  // 같은 code라도 반영 단계가 아니면 종료 사유가 아니다.
  const dispatch = { stage: 'DISPATCH', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 분석을 마치지 못했습니다.' };
  assert.deepEqual(statusDetails(closedApplyFailed({ processing: 'PARTIAL_FAILED', failures: [draft, dispatch] })),
    [CLOSED_TEXT, '실패한 부분: 설명 초안 생성 실패', '실패한 부분: 정해진 시간 안에 분석을 마치지 못했습니다.', RETRY_TEXT]);
});

test('업무 거부 등 다른 반영 실패로 닫히면 종료 사유 없이 반영 실패 안내만 보인다', () => {
  const rejected = { stage: 'APPLICATION', code: 'CANDIDATE_REJECTED', message: '결과 반영에 실패했습니다.' };
  assert.deepEqual(statusDetails(closedApplyFailed({ failures: [rejected] })), [CLOSED_TEXT, RETRY_TEXT]);
  assert.deepEqual(statusDetails(closedApplyFailed({ failures: [] })), [CLOSED_TEXT, RETRY_TEXT]);
  // 부분 실패는 기존 규칙대로 실패 항목을 나열한다. 반영 단계 항목도 목록에 남지만 종료 사유 문장은 만들지 않는다.
  const partial = statusDetails(closedApplyFailed({ processing: 'PARTIAL_FAILED', failures: [rejected] }));
  assert.deepEqual(partial, [CLOSED_TEXT, '실패한 부분: 결과 반영에 실패했습니다.', RETRY_TEXT]);
  assert.equal(partial.includes(DEADLINE_TEXT), false);
});

test('닫히기 전(ACTIVE) 반영 실패는 분석 중 아이콘과 기존 반영 실패 문구를 유지하고 종료 사유를 만들지 않는다', () => {
  const active = summary({ application: 'APPLY_FAILED', ownerResultsReady: false, failures: [APPLICATION_DEADLINE] });
  assert.equal(statusIcon(active), 'analyzing');
  assert.deepEqual(statusDetails(active), ['분석은 끝났지만 결과를 서비스에 반영하지 못했습니다. 분석 실패와는 다른 상태입니다.']);
});

test('처리 실패(FAILED) 결과가 반영 대기 중 시한으로 닫히면 처리 실패 문구에 종료 사유를 덧붙이고 시한 항목을 실패한 부분에 다시 넣지 않는다', () => {
  const collection = { stage: 'COLLECTION', code: 'X', message: '저장소를 읽지 못했습니다.' };
  assert.deepEqual(statusDetails(closedApplyFailed({ processing: 'FAILED', failures: [collection, APPLICATION_DEADLINE] })),
    ['분석에 실패했습니다.', '실패 결과를 서비스에 반영하지 못했습니다.', DEADLINE_TEXT, '실패한 부분: 저장소를 읽지 못했습니다.', RETRY_TEXT]);
});
