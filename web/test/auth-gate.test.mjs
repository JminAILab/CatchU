import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { decideAuthGate } from '../src/lib/auth-gate.ts';
import { bindLegacyTokenSignal, createSessionScope } from '../src/lib/auth-scope.ts';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { lookupMemberWithAuth } from '../src/lib/member-lookup.ts';
import { toClientResult } from '../src/lib/auth-api.ts';

const signedInStore = () => {
  const store = createAuthStore();
  store.signedIn('t1', store.loginStarted());
  return store;
};

// ---- 가드 판정 ----

test('가드: 복원 확인 중에는 이동하지 않고, 확인 실패는 원인에 따라 [다시 확인]·[다시 로그인]만 보인다', () => {
  const store = createAuthStore();
  assert.deepEqual(decideAuthGate(store.getSnapshot(), null), { action: 'restoring' });
  let ticket = store.refreshStarted();
  store.refreshFailed(ticket, 'not-consumed');
  assert.deepEqual(decideAuthGate(store.getSnapshot(), null), { action: 'restore-unconfirmed', retry: true });
  ticket = store.refreshStarted();
  store.refreshFailed(ticket, 'outcome-unknown');
  assert.deepEqual(decideAuthGate(store.getSnapshot(), null), { action: 'restore-unconfirmed', retry: false });
});

test('가드: 세션 없음이 확정된 경우에만 로그인 화면으로 보낸다', () => {
  const store = createAuthStore();
  store.refreshFailed(store.refreshStarted(), 'session-ended');
  assert.equal(store.getSnapshot().status, 'signed-out');
  assert.deepEqual(decideAuthGate(store.getSnapshot(), null), { action: 'to-login' });
});

test('가드: 재인증 필요는 화면을 유지하고 안내 자리를 연다', () => {
  const store = signedInStore();
  store.refreshFailed(store.refreshStarted(), 'outcome-unknown');
  assert.equal(store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(decideAuthGate(store.getSnapshot(), store.getSnapshot().generation), { action: 'show', reauth: true });
});

test('가드: 이 화면 세션의 로그아웃 done만 비로그인 홈으로, 비로그인으로 열린 화면·새 로그인 시작 뒤 done은 그렇지 않다', () => {
  const store = signedInStore();
  const shown = store.getSnapshot().generation;
  store.logoutSettled('done', store.logoutStarted());
  assert.deepEqual(decideAuthGate(store.getSnapshot(), shown), { action: 'to-landing' });
  assert.deepEqual(decideAuthGate(store.getSnapshot(), null), { action: 'to-login' }); // 비로그인으로 열린 가드
  assert.deepEqual(decideAuthGate(store.getSnapshot(), shown - 1), { action: 'to-login' }); // 다른 세션 화면

  const other = signedInStore();
  const t = other.logoutStarted();
  other.loginStarted();
  other.logoutSettled('done', t);
  assert.deepEqual(decideAuthGate(other.getSnapshot(), other.getSnapshot().generation), { action: 'show', reauth: true });
});

test('가드: 로그아웃 failed·unknown·진행 중은 화면을 유지한다', () => {
  for (const result of ['failed', 'unknown']) {
    const store = signedInStore();
    const t = store.logoutStarted();
    assert.deepEqual(decideAuthGate(store.getSnapshot(), store.getSnapshot().generation), { action: 'show', reauth: false });
    store.logoutSettled(result, t);
    assert.deepEqual(decideAuthGate(store.getSnapshot(), store.getSnapshot().generation), { action: 'show', reauth: false }, result);
  }
});

// ---- 회원 화면 범위 ----

test('범위: 복원 성공에서 열리고, 같은 세션 갱신·재인증 필요·로그아웃 진행/불명에는 바뀌지 않는다', () => {
  const store = createAuthStore();
  const scope = createSessionScope(store);
  assert.equal(scope.getSnapshot(), null);
  store.refreshSucceeded('a1', store.refreshStarted());
  const opened = scope.getSnapshot();
  assert.notEqual(opened, null);
  assert.equal(scope.lastGeneration(), store.getSnapshot().generation);
  store.refreshSucceeded('a2', store.refreshStarted()); // 같은 세션 갱신
  assert.equal(scope.getSnapshot(), opened);
  const t = store.logoutStarted();
  assert.equal(scope.getSnapshot(), opened);
  store.logoutSettled('unknown', t);
  assert.equal(scope.getSnapshot(), opened);
});

test('범위: 재인증 필요에도 유지되고, 새 로그인·회원 전환에는 새 번호, 로그아웃 완료에는 null이며 마지막 세대는 남는다', () => {
  const store = signedInStore();
  const scope = createSessionScope(store);
  const first = scope.getSnapshot();
  store.refreshFailed(store.refreshStarted(), 'session-ended');
  assert.equal(store.getSnapshot().status, 'reauth-required');
  assert.equal(scope.getSnapshot(), first);
  store.signedIn('t2', store.loginStarted());
  const second = scope.getSnapshot();
  assert.notEqual(second, first);
  const generation = store.getSnapshot().generation;
  store.logoutSettled('done', store.logoutStarted());
  assert.equal(scope.getSnapshot(), null);
  assert.equal(scope.lastGeneration(), generation);
});

test('범위: 로그인 표식 불일치 감지(세대 증가)에는 화면 범위를 바꾸지 않는다(감지 뒤 정책 미지정)', () => {
  const store = signedInStore();
  const scope = createSessionScope(store);
  const opened = scope.getSnapshot();
  const generation = store.getSnapshot().generation;
  store.invalidateByLoginMarker();
  assert.equal(store.getSnapshot().generation, generation + 1);
  assert.equal(scope.getSnapshot(), opened);
  store.signedIn('t2', store.loginStarted()); // 이 탭의 새 로그인
  assert.notEqual(scope.getSnapshot(), opened);
});

test('기존 토큰 신호 호환: 실제 토큰 대신 범위 표시값을 넣어 같은 세션 갱신에는 바뀌지 않고, 로그아웃 완료면 logout으로 비운다', () => {
  const store = createAuthStore();
  const scope = createSessionScope(store);
  const tokens = createAccessTokenStore();
  let changes = 0;
  tokens.subscribe(() => { changes += 1; });
  bindLegacyTokenSignal(store, scope, tokens);
  assert.deepEqual(tokens.get(), { token: null, ended: null });
  store.refreshSucceeded('secret-access-1', store.refreshStarted());
  const value = tokens.get().token;
  assert.match(value, /^member-scope-\d+$/);
  assert.equal(value.includes('secret'), false);
  store.refreshSucceeded('secret-access-2', store.refreshStarted());
  assert.equal(tokens.get().token, value);
  assert.equal(changes, 1);
  store.logoutSettled('done', store.logoutStarted());
  assert.deepEqual(tokens.get(), { token: null, ended: 'logout' });

  const failed = createAuthStore();
  const failedTokens = createAccessTokenStore();
  bindLegacyTokenSignal(failed, createSessionScope(failed), failedTokens);
  failed.refreshSucceeded('x', failed.refreshStarted());
  failed.logoutSettled('done', failed.logoutStarted());
  failed.signedIn('y', failed.loginStarted());
  failed.refreshFailed(failed.refreshStarted(), 'session-ended'); // 재인증 필요: 화면 유지
  assert.notEqual(failedTokens.get().token, null);
});

// ---- 회원 조회·호환 변환 ----

test('회원 조회: 보내지 않음·이전 세션 응답은 skipped(조회 실패로 보이지 않음), 성공·실패는 기존 판정', async () => {
  const call = (result) => async () => result;
  assert.deepEqual(await lookupMemberWithAuth(call({ kind: 'not-sent', reason: 'reauth-required' })), { state: 'skipped' });
  assert.deepEqual(await lookupMemberWithAuth(call({ kind: 'discarded', sent: true })), { state: 'skipped' });
  assert.deepEqual(await lookupMemberWithAuth(call({ kind: 'success', status: 200, data: { profile: { displayName: '' } } })),
    { state: 'loaded', displayName: '' });
  assert.deepEqual(await lookupMemberWithAuth(call({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'not-renewed' })),
    { state: 'failed' });
  assert.deepEqual(await lookupMemberWithAuth(async () => { throw new Error('x'); }), { state: 'failed' });
});

test('기능별 API 호환 변환: 보내지 않음·이전 세션 응답은 조회 실패, 그 밖의 결과는 그대로', () => {
  const failed = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
  assert.deepEqual(toClientResult({ kind: 'not-sent', reason: 'logout-hold' }), failed);
  assert.deepEqual(toClientResult({ kind: 'discarded', sent: true }), failed);
  const ok = { kind: 'success', status: 200, data: { a: 1 } };
  assert.equal(toClientResult(ok), ok);
});
