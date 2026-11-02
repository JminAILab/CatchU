import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalysisRequestApi } from '../src/features/analysis-request/analysis-request-api.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';
import { toClientResult } from '../src/lib/auth-api.ts';

// 공통 인증 결과 구분(#286)을 분석 요청 접수에 적용한 상태 전이 시험. 합성 응답 단위 시험이며 실제 HTTP·DB가 아니다.
// "보내지 않음"·"연장 뒤 401"은 통합 시험 전환을 켰을 때 공통 인증이 돌려주는 모양을 그대로 만든다.
const repo = (id) => ({ repositoryId: id, name: id, ownerLogin: 'octo', url: `https://github.com/octo/${id}`, allowedScopeRevision: `scope-${id}` });
const NOTICE = { noticeRevision: 'notice-v1', text: '안내' };
const status = (repositoryId) => ({
  requestId: `req-${repositoryId}`, repositoryId, consentId: 'c-1', attemptId: 'a-1',
  submittedAt: '2026-10-18T01:00:00Z', updatedAt: '2026-10-18T01:00:00Z',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false, retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [],
  ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: null, collectionLimitNotes: [],
});
const http = (code, data) => ({ kind: 'success', status: code, data });
const LOOKUP_FAILED = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
const notSent = () => toClientResult({ kind: 'not-sent', reason: 'reauth-required' });
const logoutHold = () => toClientResult({ kind: 'not-sent', reason: 'logout-hold' });
const discarded = () => toClientResult({ kind: 'discarded', sent: true });
const renewed401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'renewed' });
const notRenewed401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'not-renewed' });
const legacy401 = () => ({ kind: 'api-error', status: 401, code: 'AUTH_REQUIRED', message: 'm' });
const limited = () => ({ kind: 'api-error', status: 429, code: 'RATE_LIMITED', message: 'm', retryAfterSeconds: 2 });

function keyHolder() {
  let n = 0; let key = null;
  return { current() { key ??= `key-${n += 1}`; return key; }, reset() { key = null; } };
}

/** create가 차례로 돌려줄 결과를 받는다. attempts는 상태 객체가 전송을 시도한 기록이다("보내지 않음"은 공통 인증이 막은 시도). */
function harness(results, now = () => 0) {
  const attempts = [];
  const queue = [...results];
  const requests = createAnalysisRequestApi(async (path, request) => {
    if (path === '/analysis-notice') return http(200, NOTICE);
    const next = queue.shift()();
    attempts.push({ key: request.idempotencyKey, body: structuredClone(request.body) });
    return next;
  });
  const store = createAnalysisRequestStore({ repositories: async () => ({ kind: 'success', data: [repo('r1'), repo('r2')] }), requests, keys: keyHolder(), now });
  return { store, attempts };
}

async function ready(h) { await h.store.open(); h.store.select('r1'); }

// ── O-2: 최초 요청을 보내지 못한 경우 ────────────────────────

for (const [name, result] of [['재인증 필요', notSent], ['로그아웃 처리 중', logoutHold]]) {
  test(`최초 요청 · 보내지 않음(${name}): 결과 불명으로 잠그지 않고 선택·동의를 두며, 다시 누르면 그때 보낸다`, async () => {
    const h = harness([result, () => http(202, status('r1'))]);
    await ready(h);
    await h.store.submit();
    const s = h.store.getSnapshot();
    assert.equal(s.phase, 'editing', '입력 단계로 돌아간다(결과 불명 아님)');
    assert.equal(s.selectedId, 'r1', '선택을 잃지 않는다');
    assert.equal(s.message.text, TEXT.notSent);
    assert.equal(h.store.canResend(), false, '재전송 버튼 대상이 아니다');
    assert.equal(h.store.canSubmit(), true, '다시 누를 수 있다');
    assert.doesNotMatch(s.message.text, /접수됐는지/, '보낸 적 없는 요청에 결과 불명 안내를 붙이지 않는다');
    assert.equal(s.pendingRepositoryId, null, '재전송 대상으로 붙잡지 않는다');
    assert.equal(h.attempts.length, 1, '자동으로 다시 보내지 않는다');
    await h.store.submit();
    assert.equal(h.store.getSnapshot().message.text, TEXT.accepted, '보낸 적 없는 요청이라 재전송 확인 문구가 아니다');
    assert.equal(h.attempts.length, 2);
  });
}

test('최초 요청 · 보내지 않음 뒤 입력을 바꿔 보낼 수 있고, 고지·목록 다시 읽기도 막지 않는다', async () => {
  const h = harness([notSent, () => http(202, status('r2'))]);
  await ready(h);
  await h.store.submit();
  h.store.select('r2');
  assert.equal(h.store.getSnapshot().selectedId, 'r2');
  await h.store.open();
  assert.equal(h.store.getSnapshot().repositories.state, 'ready');
  await h.store.submit();
  assert.equal(h.attempts[1].body.repositoryId, 'r2');
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
});

test('전환을 끈 기존 호출의 조회 실패(표시 없음)는 지금처럼 결과 불명으로 잠근다', async () => {
  const h = harness([() => ({ ...LOOKUP_FAILED })]);
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.getSnapshot().message.text, TEXT.unknown);
});

test('보낸 뒤 반영하지 않은 응답(discarded)은 서버에 반영됐을 수 있어 결과 불명이다', async () => {
  const h = harness([discarded]);
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'unknown');
  assert.equal(h.store.canResend(), true);
});

// ── O-1·O-2: 앞선 요청이 결과 불명인 상태 ────────────────────

// reason: 이번 시도가 처리되지 않은 이유. 앞선 불명 안내와 별도 문장으로 함께 보여야 한다.
const PRIOR_UNKNOWN = /앞서 보낸 요청이 접수됐는지 아직 확인하지 못했습니다\./;
for (const [name, result, text, reason] of [
  ['보내지 않음', notSent, () => TEXT.unknownNotSent, /이번에는 요청을 보내지 않았습니다\./],
  ['갱신 성공 뒤 401', renewed401, () => TEXT.unknownRenewed, /로그인이 연장됐지만 이번 요청은 인증 오류로 거부되었습니다\./],
  ['갱신 실패 뒤 401', notRenewed401, () => TEXT.unknownAuth, /로그인이 필요해 이번 요청은 처리되지 않았습니다\./],
  ['전환을 끈 401', legacy401, () => TEXT.unknownAuth, /로그인이 필요해 이번 요청은 처리되지 않았습니다\./],
]) {
  test(`앞선 결과 불명 → 재전송 ${name}: 앞선 불명 안내를 남기고 키·본문·재전송 수단을 유지한다`, async () => {
    const h = harness([() => ({ ...LOOKUP_FAILED }), result, () => http(200, status('r1'))]);
    await ready(h);
    await h.store.submit();
    await h.store.resend();
    const s = h.store.getSnapshot();
    assert.equal(s.phase, 'unknown', '앞선 시도를 미접수로 확정하지 않는다');
    assert.equal(s.message.text, text());
    assert.match(s.message.text, PRIOR_UNKNOWN, '앞선 결과 불명 안내를 유지한다');
    assert.match(s.message.text, reason, '이번 시도의 이유를 함께 알린다');
    assert.doesNotMatch(s.message.text, /로그인이 연장되어/, '연장을 거부 원인처럼 쓰지 않는다');
    assert.doesNotMatch(s.message.text, /접수되지 않았습니다|미접수/, '앞선 시도를 미접수로 확정하지 않는다');
    assert.notEqual(s.message.text, TEXT.auth, '최초 401 안내로 바꾸지 않는다');
    assert.equal(s.pendingRepositoryId, 'r1');
    assert.equal(h.store.canResend(), true);
    assert.equal(h.attempts.length, 2, '자동으로 다시 보내지 않는다');
    await h.store.resend();
    assert.equal(h.attempts[2].key, h.attempts[0].key, '같은 키');
    assert.deepEqual(h.attempts[2].body, h.attempts[0].body, '같은 본문(동의 판본 포함)');
    assert.equal(h.store.getSnapshot().message.text, TEXT.resentExisting);
  });
}

test('빈도 제한 기한이 지난 뒤 재전송을 보내지 못하면 같은 요청을 붙잡고 다시 보낼 수 있게 둔다', async () => {
  let clock = 0;
  const h = harness([limited, notSent, () => http(202, status('r1'))], () => clock);
  await ready(h);
  await h.store.submit();
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.canResend(), false, '기한 전에는 보내지 않는다');
  clock = 2000;
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'limited');
  assert.equal(h.store.getSnapshot().message.text, TEXT.limitedNotSent);
  assert.equal(h.store.canResend(), true);
  await h.store.resend();
  assert.equal(h.attempts[2].key, h.attempts[0].key);
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
});

// ── F2: 앞선 결과 불명이 없는 요청의 401 ────────────────────────
// 서버가 처리하지 않은 요청이므로 지금처럼 키·본문을 놓는다(다시 누르면 새 키). 선택은 두고 안내만 연장 여부에 맞춘다.
// 앞선 결과 불명이 있는 재전송은 이 예외가 아니다(위 「앞선 결과 불명 → 재전송」 시험: 같은 키·본문 유지).

test('최초 요청 · 갱신 성공 뒤 401: 키는 놓고 선택은 두며 「로그인이 연장되었습니다. 다시 눌러 주세요.」, 다시 누르면 새 키·같은 본문', async () => {
  const h = harness([renewed401, () => http(202, status('r1'))]);
  await ready(h);
  await h.store.submit();
  const s = h.store.getSnapshot();
  assert.equal(s.phase, 'editing');
  assert.equal(s.message.text, TEXT.firstRenewed);
  assert.doesNotMatch(s.message.text, /로그인이 필요합니다/, '로그인된 사용자에게 재로그인을 권하지 않는다');
  assert.doesNotMatch(s.message.text, /접수됐는지/, '결과 불명 안내를 붙이지 않는다');
  assert.equal(s.selectedId, 'r1', '선택을 둔다');
  assert.equal(s.pendingRepositoryId, null);
  assert.equal(h.store.canResend(), false, '재전송 대상이 아니다');
  assert.equal(h.store.canSubmit(), true, '다시 누를 수 있다');
  assert.equal(h.attempts.length, 1, '자동으로 다시 보내지 않는다');
  await h.store.submit();
  assert.equal(h.attempts.length, 2);
  assert.notEqual(h.attempts[1].key, h.attempts[0].key, '놓은 키 대신 새 키');
  assert.deepEqual(h.attempts[1].body, h.attempts[0].body, '선택·동의 판본이 같으면 같은 본문');
  assert.equal(h.store.getSnapshot().message.text, TEXT.accepted);
});

test('최초 요청 · 갱신 성공 뒤 401 뒤 다른 저장소를 고르면 그 저장소의 본문으로 새 키를 쓴다', async () => {
  const h = harness([renewed401, () => http(202, status('r2'))]);
  await ready(h);
  await h.store.submit();
  h.store.select('r2');
  await h.store.submit();
  assert.notEqual(h.attempts[1].key, h.attempts[0].key);
  assert.equal(h.attempts[1].body.repositoryId, 'r2');
});

for (const [name, result] of [['갱신 실패 뒤 401', notRenewed401], ['전환을 끈 401', legacy401]]) {
  test(`최초 요청 · ${name}: 기존 안내 「로그인이 필요합니다…」와 키 해제를 그대로 둔다`, async () => {
    const h = harness([result, () => http(202, status('r1'))]);
    await ready(h);
    await h.store.submit();
    assert.equal(h.store.getSnapshot().phase, 'editing');
    assert.equal(h.store.getSnapshot().message.text, TEXT.auth);
    await h.store.submit();
    assert.notEqual(h.attempts[1].key, h.attempts[0].key);
  });
}

test('앞선 불명 없는 429 뒤 재전송이 갱신 성공 뒤 401이면 같은 처리(기존 키 해제)에 안내만 연장 문구', async () => {
  let clock = 0;
  const h = harness([limited, renewed401, () => http(202, status('r1'))], () => clock);
  await ready(h);
  await h.store.submit();
  clock = 2000;
  await h.store.resend();
  assert.equal(h.store.getSnapshot().phase, 'editing');
  assert.equal(h.store.getSnapshot().message.text, TEXT.firstRenewed);
  await h.store.submit();
  assert.notEqual(h.attempts[2].key, h.attempts[0].key);
});
