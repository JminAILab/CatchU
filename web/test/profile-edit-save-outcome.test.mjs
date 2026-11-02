import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateProfile } from '../src/features/profile/profile-api.ts';
import { toClientResult } from '../src/lib/auth-api.ts';

// 프로필 수정 저장(#300)의 결과 구분(#286 후속, 담당 합의 6209853081). 공통 인증 결과는 기능 API 호환 변환으로 바꾼 값을 넣는다.
// 실제 브라우저·서버 검증이 아니다.

const profile = { displayName: '이름', introduction: '', desiredRole: '', skills: [] };
const saved = { kind: 'success', status: 200, data: profile };
const renewed401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'renewed' });
const reauth401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_REQUIRED', message: 'm', authRenewal: 'not-renewed' });
const notSent = () => toClientResult({ kind: 'not-sent', reason: 'reauth-required' });
const discarded = () => toClientResult({ kind: 'discarded', sent: true });

function fake(...responses) {
  const calls = [];
  return {
    calls,
    member: async (path, request) => {
      calls.push({ path, method: request?.method ?? 'GET' });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    },
  };
}

test('프로필 수정 저장: 연장 뒤 거부·재인증 거부·보내지 않음은 그대로 돌려주고 한 번만 보낸다(자동 재전송 없음)', async () => {
  for (const [result, expected] of [[renewed401(), 'renewed-rejected'], [reauth401(), 'reauth-rejected'], [notSent(), 'not-sent']]) {
    const api = fake(result);
    assert.equal(await updateProfile(api, profile, { isCurrent: () => true }), expected);
    assert.deepEqual(api.calls, [{ path: '/me/profile', method: 'PUT' }]);
  }
});

test('프로필 수정 저장: 반영하지 않은 응답은 세션이 그대로면 결과 불명(save-failed), 바뀌었으면 cancelled다', async () => {
  assert.equal(await updateProfile(fake(discarded()), profile, { isCurrent: () => true }), 'save-failed');
  let current = true;
  assert.equal(await updateProfile(fake(() => { current = false; return discarded(); }), profile, { isCurrent: () => current }), 'cancelled');
});

test('프로필 수정 저장 회귀: 성공·전환을 끈 401·5xx·예외·취소 처리는 그대로다', async () => {
  assert.equal(await updateProfile(fake(saved), profile, { isCurrent: () => true }), 'saved');
  assert.equal(await updateProfile(fake({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm' }), profile,
    { isCurrent: () => true }), 'save-failed');
  assert.equal(await updateProfile(fake({ kind: 'api-error', status: 503, code: 'INTERNAL_ERROR', message: 'm' }), profile, { isCurrent: () => true }), 'save-failed');
  assert.equal(await updateProfile(fake(new Error('network')), profile, { isCurrent: () => true }), 'save-failed');
  const abort = new AbortController();
  abort.abort();
  const api = fake(saved);
  assert.equal(await updateProfile(api, profile, { isCurrent: () => true, signal: abort.signal }), 'cancelled');
  assert.equal(api.calls.length, 0);
});
