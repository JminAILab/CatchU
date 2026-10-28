import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialSessionLookup, lookupMemberWithAuth, recordSessionLookup, viewSessionLookup,
} from '../src/lib/member-lookup.ts';
import { decideMemberEntry } from '../src/lib/member-navigation.ts';

// 공통 화면(회원 경로 가드·로그인 화면)의 회원 조회 표시(#251 A 동의). 훅(use-session-member-lookup.ts)이 쓰는
// lookupMemberWithAuth → recordSessionLookup → viewSessionLookup 경로를 그대로 따라간다.
const call = (result) => async () => result;
const NOT_SENT = { kind: 'not-sent', reason: 'reauth-required' };
const DISCARDED = { kind: 'discarded', sent: true };
const ok = (displayName) => ({ kind: 'success', status: 200, data: { profile: { displayName } } });
const key = (attempt, scope = '/home', sessionScope = 1) => ({ sessionScope, scope, attempt });
const view = (state, attempt, { callable = true, scope = '/home', sessionScope = 1 } = {}) =>
  viewSessionLookup(state, { sessionScope, scope, attempt, callable });
async function finish(state, k, result) {
  return recordSessionLookup(state, k, await lookupMemberWithAuth(call(result)));
}

for (const [name, result] of [['보내지 않음', NOT_SENT], ['이전 세션 응답', DISCARDED]]) {
  test(`${name}: 첫 조회면 실패 안내도 성공도 아니고 진행 표시도 남기지 않는다(idle)`, async () => {
    assert.deepEqual(view(initialSessionLookup, 0), { state: 'loading' }); // 보내는 중
    const state = await finish(initialSessionLookup, key(0), result);
    const me = view(state, 0);
    assert.deepEqual(me, { state: 'idle' });
    assert.notEqual(me.state, 'failed');
    assert.notEqual(me.state, 'loaded');
  });

  test(`${name}: 실패 뒤 다시 시도한 조회가 끝나면 진행 표시를 지우고 이전 실패(다시 시도 버튼)를 그대로 보인다`, async () => {
    let state = await finish(initialSessionLookup, key(0), { kind: 'api-error', status: 500, code: 'INTERNAL_ERROR', message: 'm' });
    assert.deepEqual(view(state, 0), { state: 'failed' });
    assert.deepEqual(view(state, 1), { state: 'loading' }); // 다시 시도 진행 중
    state = await finish(state, key(1), result);
    assert.deepEqual(view(state, 1), { state: 'failed' });
    assert.deepEqual(decideMemberEntry(view(state, 1), '/home'), { action: 'retry' });
  });

  test(`${name}: 불러온 화면을 다시 조회하다 끝나면 이전 결과로 화면을 유지한다`, async () => {
    let state = await finish(initialSessionLookup, key(0), ok('회원'));
    state = await finish(state, key(1), result);
    assert.deepEqual(view(state, 1), { state: 'loaded', displayName: '회원' });
  });
}

test('이전 조회의 skipped는 더 최신 조회의 진행 표시를 지우지 않는다', async () => {
  const state = await finish(initialSessionLookup, key(0), NOT_SENT);
  assert.deepEqual(view(state, 1), { state: 'loading' });
});

test('늦게 끝난 이전 조회는 더 최신 조회의 결과를 덮지 않는다', async () => {
  let state = await finish(initialSessionLookup, key(1), ok('최신'));
  for (const late of [{ kind: 'api-error', status: 500, code: 'INTERNAL_ERROR', message: 'm' }, NOT_SENT, ok('이전')]) {
    state = await finish(state, key(0), late);
    assert.deepEqual(view(state, 1), { state: 'loaded', displayName: '최신' });
  }
});

test('늦게 끝난 이전 실패는 진행 중인 최신 조회를 실패로 바꾸지 않는다', async () => {
  const state = await finish(initialSessionLookup, key(0), { kind: 'api-error', status: 500, code: 'INTERNAL_ERROR', message: 'm' });
  assert.deepEqual(view(state, 2), { state: 'loading' });
});

test('정상 성공·실제 조회 실패는 기존 판정을 유지한다', async () => {
  assert.deepEqual(view(await finish(initialSessionLookup, key(0), ok('')), 0), { state: 'loaded', displayName: '' });
  assert.deepEqual(view(await finish(initialSessionLookup, key(0), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }), 0), { state: 'failed' });
  const authFailed = { kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'not-renewed' };
  assert.deepEqual(view(await finish(initialSessionLookup, key(0), authFailed), 0), { state: 'failed' });
  const thrown = recordSessionLookup(initialSessionLookup, key(0), await lookupMemberWithAuth(async () => { throw new Error('x'); }));
  assert.deepEqual(view(thrown, 0), { state: 'failed' });
});

test('보낼 수 없는 상태(재인증 필요·로그아웃 보류)에서는 진행 표시 없이 이전 결과만 둔다', async () => {
  assert.deepEqual(view(initialSessionLookup, 0, { callable: false }), { state: 'idle' });
  const loaded = await finish(initialSessionLookup, key(0), ok('회원'));
  assert.deepEqual(view(loaded, 0, { callable: false }), { state: 'loaded', displayName: '회원' });
  assert.deepEqual(view(loaded, 1, { callable: false }), { state: 'loaded', displayName: '회원' });
});

test('다른 경로·다른 회원 화면 범위의 결과는 쓰지 않는다', async () => {
  const state = await finish(initialSessionLookup, key(0, '/home', 1), ok('회원'));
  assert.deepEqual(view(state, 0, { scope: '/assets' }), { state: 'loading' });
  assert.deepEqual(view(state, 0, { sessionScope: 2 }), { state: 'loading' });
  const skipped = await finish(initialSessionLookup, key(0, '/home', 1), NOT_SENT);
  assert.deepEqual(view(skipped, 0, { scope: '/assets' }), { state: 'loading' });
});
