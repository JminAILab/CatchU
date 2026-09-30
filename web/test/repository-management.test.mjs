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

  const thrown = createRepositoryApi(async () => { throw new TypeError('network'); });
  assert.deepEqual(await thrown.analyses(), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
});

test('저장소별 최신 요청은 submittedAt이 늦은 것, 같으면 updatedAt이 늦은 것이다', () => {
  const items = [
    summary({ requestId: 'old', submittedAt: '2026-09-29T00:00:00Z' }),
    summary({ requestId: 'new', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z' }),
    summary({ requestId: 'new-updated', submittedAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T02:00:00Z' }),
    summary({ requestId: 'other', repositoryId: 'repo-2' }),
  ];
  const latest = latestByRepository(items);
  assert.equal(latest.get('repo-1').requestId, 'new-updated');
  assert.equal(latest.get('repo-2').requestId, 'other');
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
