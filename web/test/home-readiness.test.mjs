import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubStartBlockedReason } from '../src/features/github-connection/github-connection-screen.ts';
import { createHomeApi, currentHomeLookup, startHomeLookup } from '../src/features/home/home-api.ts';
import { homeView } from '../src/features/home/home-readiness.ts';

// 홈(#155) 준비 상태 판정. 기대 결과의 근거: #155 완료 기준과 #155 합의(접수 이력 유무), 홈 흐름 초안 §5.3·§5.4·§6.2·§7.1(합성 응답).
// GitHub 연결 시작을 막는 기준은 #253 연동 화면과 같다(공통 인증 통합 시험 전환이 꺼져 있으면 막는다). 아래 시험은 따로 적지 않으면 전환을 켠 판정이다.
const me = (github) => ({ memberId: 'm-1', profile: { displayName: '수영', introduction: '', desiredRole: '', skills: [] }, github });
const ok = (data) => ({ kind: 'success', status: 200, data });
const summary = (has) => ok({ hasAcceptedAnalysisRepository: has });
const connected = ok(me({ state: 'CONNECTED', accountLogin: 'octo' }));
const BLOCKED = githubStartBlockedReason(false);

/** `GET /me`에는 `result`, `GET /me/analysis-summary`에는 `summaryResult`를 돌려주는 api.member 대역으로 홈 표시 상태를 만든다. */
async function viewFor(result, startBlockedReason = githubStartBlockedReason(true), summaryResult = summary(false)) {
  const calls = [];
  const api = createHomeApi(async (path, request) => {
    calls.push({ path, method: request.method });
    const response = path === '/me/analysis-summary' ? summaryResult : result;
    if (response instanceof Error) throw response;
    return response;
  });
  return { view: homeView(await api.status(), startBlockedReason), calls };
}

test('조회 중에는 연결 안내를 보이지 않는다', () => {
  for (const reason of [null, BLOCKED]) assert.deepEqual(homeView({ state: 'loading' }, reason), { kind: 'loading' });
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

test('미연결·재연결 필요에서는 접수 이력 유무를 읽지 않는다(이 값은 GitHub 연결 상태에서만 쓴다)', async () => {
  for (const state of ['DISCONNECTED', 'REAUTH_REQUIRED']) {
    for (const summaryResult of [summary(true), new Error('network')]) {
      const { view, calls } = await viewFor(ok(me({ state, accountLogin: state === 'DISCONNECTED' ? null : 'octo' })), undefined, summaryResult);
      assert.deepEqual(calls, [{ path: '/me', method: 'GET' }], state);
      assert.equal(view.readiness, 'github', state);
    }
  }
});

test('GitHub 연결됨 + 접수 이력 없음(false)은 레포 연결 단계를 보이고 내 자산으로 보낸다', async () => {
  const { view, calls } = await viewFor(connected, undefined, summary(false));
  assert.deepEqual(calls, [{ path: '/me', method: 'GET' }, { path: '/me/analysis-summary', method: 'GET' }], '연결됨일 때만 쿼리 없이 이어서 읽는다');
  assert.equal(view.kind, 'guide');
  assert.equal(view.readiness, 'repository');
  assert.equal(view.status, 'GitHub 연결됨');
  assert.equal(view.step, 'repository', '현재 단계는 레포 연결이다(초안 §5.4)');
  assert.deepEqual(view.action, { kind: 'link', label: '내 자산에서 레포 연결', href: '/assets' });
});

test('GitHub 연결됨 + 접수 이력 있음(true)은 준비 완료로 단계 표시 없이 내 자산으로 보내고, 분석 완료·분석 가능으로 안내하지 않는다', async () => {
  const { view } = await viewFor(connected, undefined, summary(true));
  const before = (await viewFor(connected, undefined, summary(false))).view;
  assert.equal(view.kind, 'guide');
  assert.equal(view.readiness, 'ready');
  assert.equal(view.step, null);
  assert.deepEqual(view.action, { kind: 'link', label: '내 자산으로 가기', href: '/assets' });
  assert.equal(view.title, '분석 요청 내역은 내 자산의 저장소 연결 관리에서 확인해 보세요', '문구는 #155 제안, 위치는 #438 리뷰 반영');
  assert.doesNotMatch(view.title, /[.。]$/, '다른 단계 제목처럼 마침표 없이 끝낸다');
  assert.equal(view.description, null, '제목 한 줄만 둔다');
  for (const key of ['status', 'title']) assert.notEqual(view[key], before[key], key);
  assert.doesNotMatch(view.title, /완료|분석할 수 있|분석 가능/, '이력 있음은 분석 완료나 지금 분석 가능을 뜻하지 않는다');
});

test('GitHub 연결됨에서 접수 이력 유무만 조회하지 못해도 이력 없음(레포 연결 단계)으로 바꾸지 않고 조회 실패로 보인다', async () => {
  const failures = [
    { kind: 'lookup-failed', status: 500, code: 'INTERNAL_ERROR' },
    { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' },
    { kind: 'api-error', status: 400, code: 'VALIDATION_FAILED', message: '거부' },
    new Error('network'),
    ok({}),
    ok(null),
    ok([]),
    ok({ hasAcceptedAnalysisRepository: 'false' }),
    ok({ hasAcceptedAnalysisRepository: 0 }),
    ok({ hasAcceptedAnalysisRepository: null }),
  ];
  for (const result of failures) {
    const { view } = await viewFor(connected, undefined, result);
    assert.deepEqual(view, { kind: 'failed' }, JSON.stringify(result instanceof Error ? result.message : result));
  }
});

test('GitHub 연결 시작을 막은 환경(통합 시험 전환 꺼짐)에서는 미연결·재연결 필요 버튼을 누를 수 없게 두고 연동 화면과 같은 이유를 보인다. 상태 안내와 연결됨의 이동은 그대로다', async () => {
  for (const [state, label] of [['DISCONNECTED', '프로필에서 GitHub 연결'], ['REAUTH_REQUIRED', 'GitHub 다시 연결']]) {
    const result = ok(me({ state, accountLogin: state === 'DISCONNECTED' ? null : 'octo' }));
    const on = (await viewFor(result)).view;
    const { view, calls } = await viewFor(result, BLOCKED);
    assert.deepEqual(calls, [{ path: '/me', method: 'GET' }], '연결 상태 조회는 그대로 한다');
    assert.deepEqual(view.action, { kind: 'unavailable', label, reason: BLOCKED });
    assert.deepEqual({ ...view, action: null }, { ...on, action: null }, '상태 이름·단계·문구는 전환과 관계없다');
  }
  for (const has of [false, true]) {
    assert.deepEqual((await viewFor(connected, BLOCKED, summary(has))).view, (await viewFor(connected, undefined, summary(has))).view, `연결됨 ${has}`);
  }
  assert.deepEqual((await viewFor(new Error('network'), BLOCKED)).view, { kind: 'failed' });
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
    for (const reason of [null, BLOCKED]) {
      for (const has of [false, true]) {
        const { view } = await viewFor(ok(me({ state, accountLogin: state === 'DISCONNECTED' ? null : 'octo' })), reason, summary(has));
        assert.ok(!JSON.stringify(view).includes('연결 전'), `${state} ${has}`);
      }
    }
  }
});

// ---- 늦은 응답·오래된 응답(#155 보완) ----
// `useHomeReadiness`의 effect가 하는 일(세션·재조회 번호마다 조회 시작, 세션 변경·재조회·화면 이탈 때 정리)을 같은 함수로 재현한다.
// React 렌더링·실제 브라우저가 아닌 대역 시험이다.

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const READY = { kind: 'success', data: { github: 'CONNECTED', hasAcceptedAnalysisRepository: true } };
const EMPTY = { kind: 'success', data: { github: 'CONNECTED', hasAcceptedAnalysisRepository: false } };

/** 응답을 직접 풀어 주는 조회 대역. 받은 중단 신호도 남긴다. */
function controlledLoads() {
  const pending = [];
  return {
    pending,
    load: (signal) => { const d = deferred(); pending.push({ ...d, signal }); return d.promise; },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('회원 전환: 이전 회원 세션의 늦은 응답은 새 회원 홈에 반영하지 않는다(정리 전후 모두)', async () => {
  const memberA = { token: 'a' }; const memberB = { token: 'b' };
  for (const cleanedUp of [true, false]) {
    let current = memberA;
    const delivered = [];
    const { pending, load } = controlledLoads();
    const stopA = startHomeLookup(load, { session: memberA, attempt: 0 }, (s) => current === s, (r) => delivered.push(r));
    current = memberB;
    if (cleanedUp) stopA();
    startHomeLookup(load, { session: memberB, attempt: 0 }, (s) => current === s, (r) => delivered.push(r));
    pending[1].resolve(EMPTY);
    pending[0].resolve(READY);
    await flush();
    assert.deepEqual(delivered.map((r) => r.session), [memberB], `정리 ${cleanedUp}: 이전 회원 응답을 버린다`);
    assert.deepEqual(currentHomeLookup({ session: memberA, attempt: 0, lookup: READY }, memberB, 0), { state: 'loading' }, '이전 회원 결과는 그리지 않는다');
    assert.deepEqual(currentHomeLookup(delivered[0], memberB, 0), EMPTY);
  }
});

test('로그아웃: 진행 중이던 조회의 늦은 응답을 반영하지 않는다', async () => {
  const member = { token: 'a' }; const signedOut = { token: null };
  let current = member;
  const delivered = [];
  const { pending, load } = controlledLoads();
  const stop = startHomeLookup(load, { session: member, attempt: 0 }, (s) => current === s, (r) => delivered.push(r));
  current = signedOut;
  stop();
  assert.equal(pending[0].signal.aborted, true, '진행 중인 조회를 중단한다');
  pending[0].resolve(READY);
  await flush();
  assert.deepEqual(delivered, []);
  assert.deepEqual(currentHomeLookup({ session: member, attempt: 0, lookup: READY }, signedOut, 0), { state: 'loading' });
});

test('화면 이탈: 같은 세션이어도 정리 뒤 도착한 응답은 반영하지 않는다', async () => {
  const member = { token: 'a' };
  const delivered = [];
  const { pending, load } = controlledLoads();
  const stop = startHomeLookup(load, { session: member, attempt: 0 }, () => true, (r) => delivered.push(r));
  stop();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve(READY);
  await flush();
  assert.deepEqual(delivered, []);
});

test('재조회: 이전 조회가 나중에 도착해도 새 조회 결과를 덮지 않고, 이전 번호의 결과는 그리지 않는다', async () => {
  const member = { token: 'a' };
  const delivered = [];
  const { pending, load } = controlledLoads();
  const stop0 = startHomeLookup(load, { session: member, attempt: 0 }, () => true, (r) => delivered.push(r));
  stop0(); // [다시 불러오기]로 재조회 번호가 바뀌어 이전 effect가 정리된다.
  startHomeLookup(load, { session: member, attempt: 1 }, () => true, (r) => delivered.push(r));
  pending[1].resolve(READY);
  await flush();
  pending[0].resolve({ kind: 'lookup-failed', status: 500, code: 'INTERNAL_ERROR' });
  await flush();
  assert.deepEqual(delivered.map((r) => r.attempt), [1]);
  assert.deepEqual(currentHomeLookup({ session: member, attempt: 0, lookup: EMPTY }, member, 1), { state: 'loading' }, '재조회 전 결과는 그리지 않는다');
  assert.deepEqual(currentHomeLookup(delivered[0], member, 1), READY);
});

test('연결 상태를 읽는 사이 중단되면 접수 이력 조회를 보내지 않는다', async () => {
  const calls = [];
  const me = deferred();
  const api = createHomeApi(async (path) => { calls.push(path); return path === '/me' ? me.promise : summary(true); });
  const abort = new AbortController();
  const result = api.status(abort.signal);
  abort.abort();
  me.resolve(connected);
  assert.notEqual((await result).kind, 'success');
  assert.deepEqual(calls, ['/me']);
});
