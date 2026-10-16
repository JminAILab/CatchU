import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupMember } from '../src/lib/member-lookup.ts';
import { createApiClient } from '../src/lib/api-client.ts';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { decideMemberEntry, afterLoginPath } from '../src/lib/member-navigation.ts';

function client(response) {
  const tokens = createAccessTokenStore(); tokens.set('synthetic-member');
  const api = createApiClient({ baseUrl: 'http://127.0.0.1:3001', tokens, fetch: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:3001/v1/me');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-member');
    assert.equal(init.cache, 'no-store');
    return response();
  } });
  return { api, tokens };
}
for (const displayName of ['', '회원']) {
  test(`실제 API 호출 함수 연결: 이름 ${displayName || '미저장'}의 이동·반복 방지`, async () => {
    const { api } = client(() => Response.json({ profile: { displayName, introduction: '', desiredRole: '', skills: [] }, githubConnection: null }));
    const me = await lookupMember(api);
    assert.deepEqual(me, { state: 'loaded', displayName });
    assert.deepEqual(decideMemberEntry(me, '/assets'), displayName ? { action: 'allow' } : { action: 'redirect', to: '/profile/setup' });
    // 최초 입력 화면은 이름이 빈 회원만 연다(#261 리뷰). 이름이 있으면 홈으로 보낸다.
    assert.deepEqual(decideMemberEntry(me, '/profile/setup'), displayName ? { action: 'redirect', to: '/home' } : { action: 'allow' });
    assert.equal(afterLoginPath(me.displayName, '/links'), displayName ? '/links' : '/profile/setup');
  });
}
for (const data of [null, {}, { profile: null }, { profile: {} }, { profile: { displayName: 1 } }]) {
  test(`잘못된 성공 응답은 미저장이 아닌 조회 실패: ${JSON.stringify(data)}`, async () => {
    const { api } = client(() => Response.json(data));
    assert.deepEqual(decideMemberEntry(await lookupMember(api), '/home'), { action: 'retry' });
  });
}
test('네트워크·서버 실패 뒤 같은 조회를 재시도하면 정상 판단한다', async () => {
  let count = 0;
  const { api } = client(() => {
    count++;
    if (count === 1) throw new Error('synthetic offline');
    if (count === 2) return Response.json({ code: 'INTERNAL_ERROR', message: '실패' }, { status: 500 });
    return Response.json({ profile: { displayName: '' } });
  });
  assert.deepEqual(await lookupMember(api), { state: 'failed' });
  assert.deepEqual(await lookupMember(api), { state: 'failed' });
  assert.deepEqual(await lookupMember(api), { state: 'loaded', displayName: '' });
});
test('인증 실패는 기존 API 함수가 토큰을 지우고 이름 미저장으로 바꾸지 않는다', async () => {
  const { api, tokens } = client(() => Response.json({ code: 'AUTH_INVALID', message: '인증 실패' }, { status: 401 }));
  assert.deepEqual(await lookupMember(api), { state: 'failed' });
  assert.equal(tokens.get().token, null);
});
test('조회 진행 중에는 회원 화면 진입을 보류한다', async () => {
  let finish;
  const pending = lookupMember({ member: () => new Promise(resolve => { finish = resolve; }) });
  assert.deepEqual(decideMemberEntry({ state: 'loading' }, '/home'), { action: 'wait' });
  finish({ kind: 'success', status: 200, data: { profile: { displayName: '회원' } } });
  assert.deepEqual(await pending, { state: 'loaded', displayName: '회원' });
});
