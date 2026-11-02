import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeProfileSetup, saveProfile, saveProfileDetailed, unprocessedSaveMessages } from '../src/features/profile/profile-api.ts';
import { toClientResult } from '../src/lib/auth-api.ts';

// 프로필 저장 결과 구분(#286 후속, 담당 합의 6209853081). 기존 `saveProfile` 계약과 최초 입력 저장 완료 함수의 회귀를 함께 본다.
// 공통 인증 결과는 기능 API 호환 변환(`toClientResult`)으로 바꾼 값을 넣는다. 실제 브라우저·서버 검증이 아니다.

const profile = { displayName: ' 이름 ', introduction: '소개', desiredRole: '직무', skills: ['TS'] };
const saved = { kind: 'success', status: 200, data: { displayName: '이름', introduction: '소개', desiredRole: '직무', skills: ['TS'] } };
const me = { kind: 'success', status: 200, data: { profile: saved.data } };
const notSent = () => toClientResult({ kind: 'not-sent', reason: 'logout-hold' });
const discarded = () => toClientResult({ kind: 'discarded', sent: true });
const renewed401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_REQUIRED', message: 'm', authRenewal: 'renewed' });
/** 갱신하지 못해 재인증이 필요해진 401. 서버가 인증 단계에서 거부해 저장되지 않았다. */
const reauth401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'not-renewed' });

/** 호출을 기록하고 큐의 응답을 차례로 돌려주는 api.member 대역. */
function fake(...responses) {
  const calls = [];
  return {
    calls,
    member: async (path, request) => {
      calls.push({ path, method: request?.method ?? 'GET', body: request?.body });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
      return typeof next === 'function' ? next() : next;
    },
  };
}

test('saveProfileDetailed: 성공·연장 뒤 거부·재인증 거부·보내지 않음·반영하지 않음을 나누고, 그 밖은 기존과 같은 저장 실패다', async () => {
  const cases = [
    [saved, 'saved'],
    [renewed401(), 'renewed-rejected'],
    [reauth401(), 'reauth-rejected'],
    [notSent(), 'not-sent'],
    [discarded(), 'discarded'],
    [{ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm' }, 'save-failed'],
    [{ kind: 'api-error', status: 400, code: 'VALIDATION_FAILED', message: 'm' }, 'save-failed'],
    [{ kind: 'api-error', status: 503, code: 'INTERNAL_ERROR', message: 'm' }, 'save-failed'],
    [{ kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }, 'save-failed'],
    [{ kind: 'success', status: 200, data: { ...saved.data, displayName: '' } }, 'save-failed'],
  ];
  for (const [result, expected] of cases) {
    const api = fake(result);
    assert.equal(await saveProfileDetailed(api, profile), expected, expected);
    assert.deepEqual(api.calls, [{ path: '/me/profile', method: 'PUT', body: { displayName: '이름', introduction: '소개', desiredRole: '직무', skills: ['TS'] } }],
      '요청 본문·경로는 그대로이고 한 번만 보낸다');
  }
});

test('saveProfile 호출 계약 유지: 성공일 때만 true이고, 새 구분 결과도 모두 false다', async () => {
  assert.equal(await saveProfile(fake(saved), profile), true);
  for (const result of [renewed401(), reauth401(), notSent(), discarded(), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }]) {
    assert.equal(await saveProfile(fake(result), profile), false);
  }
  await assert.rejects(saveProfile(fake(new Error('network')), profile), '예외는 기존처럼 호출부로 전달한다');
});

test('최초 입력 저장 완료: 연장 뒤 거부·재인증 거부·보내지 않음은 그대로 돌려주고 저장 표시·재조회·자동 재전송을 하지 않는다', async () => {
  for (const [result, expected] of [[renewed401(), 'renewed-rejected'], [reauth401(), 'reauth-rejected'], [notSent(), 'not-sent']]) {
    const api = fake(result);
    let onSaved = 0;
    const outcome = await completeProfileSetup(api, profile, { alreadySaved: false, onSaved: () => { onSaved += 1; }, isCurrent: () => true });
    assert.equal(outcome, expected);
    assert.equal(onSaved, 0);
    assert.deepEqual(api.calls.map((call) => call.method), ['PUT']);
  }
});

test('최초 입력 저장 완료: 반영하지 않은 응답은 세션이 그대로면 결과 불명(save-failed), 바뀌었으면 cancelled다', async () => {
  assert.equal(await completeProfileSetup(fake(discarded()), profile, { alreadySaved: false, onSaved: () => {}, isCurrent: () => true }), 'save-failed');
  let current = true;
  const api = fake(() => { current = false; return discarded(); });
  assert.equal(await completeProfileSetup(api, profile, { alreadySaved: false, onSaved: () => {}, isCurrent: () => current }), 'cancelled',
    '이전 회원의 결과를 새 화면에 보이지 않는다');
});

test('최초 입력 저장 완료 회귀: 정상 저장은 재조회 뒤 ready, 저장 실패·예외·재조회 실패 처리는 그대로다', async () => {
  let onSaved = 0;
  const ok = fake(saved, me);
  assert.equal(await completeProfileSetup(ok, profile, { alreadySaved: false, onSaved: () => { onSaved += 1; }, isCurrent: () => true }), 'ready');
  assert.equal(onSaved, 1);
  assert.deepEqual(ok.calls.map((call) => call.method), ['PUT', 'GET']);
  assert.equal(await completeProfileSetup(fake({ kind: 'api-error', status: 500, code: 'INTERNAL_ERROR', message: 'm' }), profile,
    { alreadySaved: false, onSaved: () => {}, isCurrent: () => true }), 'save-failed');
  assert.equal(await completeProfileSetup(fake(new Error('network')), profile, { alreadySaved: false, onSaved: () => {}, isCurrent: () => true }), 'save-failed');
  assert.equal(await completeProfileSetup(fake(saved, notSent()), profile, { alreadySaved: false, onSaved: () => {}, isCurrent: () => true }), 'refresh-failed',
    '저장 뒤 보내지 않은 재조회는 기존 조회 처리(재조회 실패)다');
  const retry = fake(me);
  assert.equal(await completeProfileSetup(retry, profile, { alreadySaved: true, onSaved: () => {}, isCurrent: () => true }), 'ready');
  assert.deepEqual(retry.calls.map((call) => call.method), ['GET'], '저장 뒤에는 조회만 다시 한다');
});

test('처리되지 않은 저장의 안내: 이번 결과만 알리고, 앞선 저장의 결과 불명 안내는 지우지 않는다(수정·최초 입력 공통)', () => {
  const earlier = '앞선 저장 요청의 결과는 아직 확인하지 못했습니다.';
  const cases = [
    ['renewed-rejected', '로그인이 연장되었습니다. 다시 눌러 주세요.'],
    ['reauth-rejected', '로그인이 필요해 저장하지 않았습니다. 입력은 그대로 두었습니다.'],
    ['not-sent', '지금은 요청을 보내지 않았습니다. 입력은 그대로 두었습니다.'],
  ];
  for (const [outcome, text] of cases) {
    assert.deepEqual(unprocessedSaveMessages(outcome, false), [text], outcome);
    assert.deepEqual(unprocessedSaveMessages(outcome, true), [text, earlier], `${outcome}: 이번 401·미전송으로 앞선 결과 불명을 확정하지 않는다`);
  }
  for (const text of cases.map(([, value]) => value)) {
    assert.doesNotMatch(text, /확인하지 못했습니다/, '처리되지 않은 저장을 결과 불명으로 안내하지 않는다');
  }
});
