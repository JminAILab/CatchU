import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepositoryApi } from '../src/features/repository-management/repository-api.ts';
import { homeView } from '../src/features/home/home-readiness.ts';

// 홈(#155) 준비 상태 판정. 기대 결과의 근거: #155 완료 기준, 홈 흐름 초안 §5.3·§5.4·§6.2(합성 응답).
const me = (github) => ({ memberId: 'm-1', profile: { displayName: '수영', introduction: '', desiredRole: '', skills: [] }, github });
const ok = (data) => ({ kind: 'success', status: 200, data });

async function viewFor(result) {
  const calls = [];
  const api = createRepositoryApi(async (path, request) => {
    calls.push({ path, method: request.method });
    if (result instanceof Error) throw result;
    return result;
  });
  return { view: homeView(await api.githubState()), calls };
}

test('조회 중에는 연결 안내를 보이지 않는다', () => {
  assert.deepEqual(homeView({ state: 'loading' }), { kind: 'loading' });
});

test('GitHub 미연동이 정상 조회되면 미연결 상태와 GitHub 연결 단계를 보이고, GitHub 연동 화면(#253)으로 보낸다', async () => {
  const { view, calls } = await viewFor(ok(me({ state: 'DISCONNECTED', accountLogin: null })));
  assert.deepEqual(calls, [{ path: '/me', method: 'GET' }]);
  assert.equal(view.kind, 'guide');
  assert.equal(view.status, 'GitHub 미연결');
  assert.equal(view.step, 'github');
  assert.deepEqual(view.action, { kind: 'link', label: '프로필에서 GitHub 연결', href: '/profile/github' });
});

test('재연동 필요는 미연동과 상태·제목·설명·버튼을 구분하고, 같은 GitHub 연동 화면으로 보낸다', async () => {
  const { view } = await viewFor(ok(me({ state: 'REAUTH_REQUIRED', accountLogin: 'octo' })));
  const disconnected = (await viewFor(ok(me({ state: 'DISCONNECTED', accountLogin: null })))).view;
  assert.equal(view.kind, 'guide');
  assert.equal(view.status, 'GitHub 재연결 필요');
  assert.equal(view.step, 'github');
  for (const key of ['status', 'title', 'description']) assert.notEqual(view[key], disconnected[key], key);
  assert.notEqual(view.action.label, disconnected.action.label);
  assert.deepEqual(view.action, { kind: 'link', label: 'GitHub 다시 연결', href: '/profile/github' });
});

test('GitHub 연결됨은 저장소 연결 여부를 단정하지 않고 내 자산의 저장소 연결 관리로 보낸다', async () => {
  const { view } = await viewFor(ok(me({ state: 'CONNECTED', accountLogin: 'octo' })));
  assert.equal(view.kind, 'guide');
  assert.equal(view.status, 'GitHub 연결됨');
  assert.equal(view.step, null, '연결된 repo 유무를 받지 않으므로 레포 연결 단계를 표시하지 않는다');
  assert.deepEqual(view.action, { kind: 'link', label: '내 자산에서 저장소 연결 관리', href: '/assets' });
});

test('조회 실패와 계약과 다른 응답은 미연동으로 바꾸지 않고 조회 실패로 보인다', async () => {
  const failures = [
    { kind: 'lookup-failed', status: 500, code: 'LOOKUP_FAILED' },
    { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' },
    { kind: 'api-error', status: 403, code: 'FORBIDDEN', message: '거부' },
    new Error('network'),
    ok(me(undefined)),
    ok(me(null)),
    ok(me({ state: 'UNKNOWN', accountLogin: null })),
    ok(me({ accountLogin: null })),
    ok(null),
  ];
  for (const result of failures) {
    const { view } = await viewFor(result);
    assert.deepEqual(view, { kind: 'failed' }, JSON.stringify(result instanceof Error ? result.message : result));
  }
});

test("연동 상태 안내에는 미연결로 오해될 '연결 전' 표기를 쓰지 않는다", async () => {
  for (const state of ['DISCONNECTED', 'REAUTH_REQUIRED', 'CONNECTED']) {
    const { view } = await viewFor(ok(me({ state, accountLogin: state === 'DISCONNECTED' ? null : 'octo' })));
    assert.ok(!JSON.stringify(view).includes('연결 전'), state);
  }
});
