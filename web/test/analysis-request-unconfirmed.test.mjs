import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalysisRequestApi } from '../src/features/analysis-request/analysis-request-api.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';
import { toClientResult } from '../src/lib/auth-api.ts';
import { createUnsavedRegistry } from '../src/lib/unsaved-changes.ts';

/**
 * O-3 미확정 요청 판정(`holdsUnconfirmedRequest`, D 결정 10/21의 확인 대상 표)과 공통 등록 수단(#286) 연결.
 * 합성 응답 단위 시험이며 실제 HTTP·DB·확인 창이 아니다. 확인 창·문구는 #287 확인 흐름이 맡는다.
 */
const REQUEST = 'unconfirmed-analysis-request';
const repo = (id) => ({ repositoryId: id, name: id, ownerLogin: 'octo', url: `https://github.com/octo/${id}`, allowedScopeRevision: `scope-${id}` });
const NOTICE = { noticeRevision: 'notice-v1', text: '안내' };
const status = (repositoryId) => ({
  requestId: `req-${repositoryId}`, repositoryId, consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-10-21T01:00:00Z', updatedAt: '2026-10-21T01:00:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false, retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [],
});
const http = (code, data) => ({ kind: 'success', status: code, data });
const apiError = (code, errorCode) => ({ kind: 'api-error', status: code, code: errorCode, message: 'm' });
const LOOKUP_FAILED = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
const notSent = () => toClientResult({ kind: 'not-sent', reason: 'reauth-required' });
const discarded = () => toClientResult({ kind: 'discarded', sent: true });
const renewed401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'renewed' });
const legacy401 = () => apiError(401, 'AUTH_REQUIRED');
const limited = () => ({ kind: 'api-error', status: 429, code: 'RATE_LIMITED', message: 'm', retryAfterSeconds: 2 });

function keyHolder() {
  let n = 0; let key = null;
  return { current() { key ??= `key-${n += 1}`; return key; }, reset() { key = null; } };
}

/** create가 차례로 돌려줄 결과. 함수 대신 'hold'를 넣으면 응답을 붙잡아 요청 중 상태를 본다. */
function harness(results) {
  let clock = 0;
  const attempts = [];
  const queue = [...results];
  const held = [];
  const requests = createAnalysisRequestApi(async (path, request) => {
    if (path === '/analysis-notice') return http(200, NOTICE);
    attempts.push({ key: request.idempotencyKey, body: structuredClone(request.body) });
    const next = queue.shift();
    if (next === 'hold') return new Promise((resolve) => held.push(resolve));
    return next();
  });
  const store = createAnalysisRequestStore({
    repositories: async () => ({ kind: 'success', data: [repo('r1'), repo('r2')] }), requests, keys: keyHolder(), now: () => clock,
  });
  return { store, attempts, held, wait(ms) { clock += ms; } };
}

async function ready(h) { await h.store.open(); h.store.select('r1'); }
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('입력 단계: 열기 전·선택 뒤·아직 안 보냄은 대상이 아니다', async () => {
  const h = harness([]);
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
  await ready(h);
  assert.equal(h.store.getSnapshot().selectedId, 'r1');
  assert.equal(h.store.holdsUnconfirmedRequest(), false, '저장소 선택만으로는 대상이 아니다');
});

test('요청 중(응답 대기)은 대상이고, 202 접수로 확정되면 대상이 아니다', async () => {
  const h = harness(['hold']);
  await ready(h);
  const sending = h.store.submit();
  await tick();
  assert.equal(h.store.getSnapshot().phase, 'submitting');
  assert.equal(h.store.holdsUnconfirmedRequest(), true);
  h.held[0](http(202, status('r1')));
  await sending;
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
});

for (const [name, result] of [['조회 실패', () => LOOKUP_FAILED], ['5xx', () => apiError(503, 'UNAVAILABLE')], ['보낸 뒤 반영 안 함', discarded]]) {
  test(`응답 불명(${name})은 대상이고, 키·본문·안내를 그대로 두며 자동으로 다시 보내지 않는다`, async () => {
    const h = harness([result]);
    await ready(h);
    await h.store.submit();
    const s = h.store.getSnapshot();
    assert.equal(s.phase, 'unknown');
    assert.equal(s.message.text, TEXT.unknown);
    assert.equal(h.store.holdsUnconfirmedRequest(), true);
    await tick();
    assert.equal(h.attempts.length, 1, '판정은 요청을 보내지 않는다');
    assert.equal(h.store.canResend(), true);
  });
}

test('응답 불명 뒤 429(앞선 결과 불명이 남은 빈도 제한)는 대상이고, 재전송이 보내지 않음이어도 대상이다', async () => {
  const h = harness([() => LOOKUP_FAILED, limited, notSent]);
  await ready(h);
  await h.store.submit();
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.getSnapshot().message.text, TEXT.limitedUncertain);
  assert.equal(h.store.holdsUnconfirmedRequest(), true);
  h.wait(2000);
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.getSnapshot().message.text, TEXT.unknownNotSent);
  assert.equal(h.store.holdsUnconfirmedRequest(), true);
  assert.deepEqual(h.attempts.map((a) => a.key), ['key-1', 'key-1', 'key-1'], '같은 키를 유지한다');
});

test('앞선 결과 불명이 없는 429와 그 뒤 재전송 보내지 않음은 대상이 아니다(서버가 처리하지 않은 시도뿐)', async () => {
  const h = harness([limited, notSent]);
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
  h.wait(2000);
  await h.store.resend();
  assert.equal(h.store.getSnapshot().message.text, TEXT.limitedNotSent);
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
});

for (const [name, result, text] of [
  ['최초 보내지 않음(O-2)', notSent, TEXT.notSent],
  ['연장 뒤 401(F2)', renewed401, TEXT.firstRenewed],
  ['전환 끔 401', legacy401, TEXT.auth],
  ['서버 거부 4xx', () => apiError(403, 'REPOSITORY_NOT_ALLOWED'), TEXT.notAllowed],
]) {
  test(`${name}: 접수된 요청이 없거나 확정돼 대상이 아니다`, async () => {
    const h = harness([result]);
    await ready(h);
    await h.store.submit();
    assert.equal(h.store.getSnapshot().phase, 'editing');
    assert.equal(h.store.getSnapshot().message.text, text);
    assert.equal(h.store.holdsUnconfirmedRequest(), false);
  });
}

test('응답 불명 뒤 같은 요청 다시 보내기로 200 확인되면 대상이 아니다', async () => {
  const h = harness([() => LOOKUP_FAILED, () => http(200, status('r1'))]);
  await ready(h);
  await h.store.submit();
  await h.store.resend();
  assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
});

test('모달을 다시 열어도(open) 응답 불명 요청 정보와 판정이 남는다', async () => {
  const h = harness([() => LOOKUP_FAILED]);
  await ready(h);
  await h.store.submit();
  await h.store.open();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.getSnapshot().pendingRepositoryId, 'r1');
  assert.equal(h.store.holdsUnconfirmedRequest(), true);
});

test('상태를 버리면(dispose: 화면 해제·회원 변경) 대상이 아니다', async () => {
  const h = harness([() => LOOKUP_FAILED]);
  await ready(h);
  await h.store.submit();
  h.store.dispose();
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
});

test('공통 등록 연결: 한 번 등록한 판정이 확인 시점의 상태를 읽고, 해제하면 사유가 사라진다', async () => {
  const registry = createUnsavedRegistry();
  const h = harness([() => LOOKUP_FAILED, () => http(200, status('r1'))]);
  // 화면(RepositoryManagement)과 같은 등록 방식이다.
  const off = registry.register(() => h.store.holdsUnconfirmedRequest(), REQUEST);
  await ready(h);
  assert.deepEqual(registry.activeReasons(), []);
  await h.store.submit();
  assert.deepEqual(registry.activeReasons(), [REQUEST]);
  assert.equal(registry.hasUnsaved(), false, '저장하지 않은 입력으로 세지 않는다');
  const offInput = registry.register(() => true);
  assert.deepEqual(registry.activeReasons(), ['unsaved-input', REQUEST]);
  offInput();
  await h.store.resend();
  assert.deepEqual(registry.activeReasons(), []);
  off();
  assert.deepEqual(registry.activeReasons(), []);
});

test('실패 재요청도 같은 판정이다: 보내지 않음은 대상이 아니고, 응답 불명은 대상이다', async () => {
  const target = { requestId: 'req-r1', repositoryId: 'r1', retryAllowed: true };
  const h = harness([notSent, () => LOOKUP_FAILED]);
  await h.store.open();
  await h.store.retry(target);
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().pendingRetry, false);
  assert.equal(h.store.getSnapshot().message.text, TEXT.notSent);
  assert.equal(h.store.holdsUnconfirmedRequest(), false);
  await h.store.retry(target);
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.getSnapshot().pendingRetry, true);
  assert.equal(h.store.holdsUnconfirmedRequest(), true);
  assert.equal(h.attempts[1].body.retryOfRequestId, 'req-r1');
  assert.notEqual(h.attempts[0].key, h.attempts[1].key, '보내지 않은 시도의 키는 놓고 새 키로 보낸다');
});
