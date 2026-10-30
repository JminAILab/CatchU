import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepositoryApi, readAnalysis } from '../src/features/repository-management/repository-api.ts';
import { createRepositoryRegistrationStore, REGISTRATION_ERRORS } from '../src/features/repository-management/repository-registration-store.ts';
import { statusDetails } from '../src/features/repository-management/repository-status.ts';
import { createAnalysisRequestStore, TEXT } from '../src/features/analysis-request/analysis-request-store.ts';
import './u7-repository-views.mjs';

const repository = { registrationId: 'registration-1', repositoryId: '123', ownerLogin: 'owner', name: 'repo', url: 'https://github.com/owner/repo', allowedScopeRevision: 'scope-1' };
const success = { kind: 'success', data: repository };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const summary = (overrides = {}) => ({ requestId: 'r', repositoryId: '123', consentId: 'c', attemptId: 'a', submittedAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z', requestState: 'ACCEPTED', lifecycle: 'CLOSED', processing: 'EMPTY', application: 'APPLIED', sourceMode: 'LIVE', eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false, retry: { allowed: false, reason: 'NOT_FAILED' }, failures: [], ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: null, collectionLimitNotes: [], ...overrides });

test('C6-1 등록은 주소 하나만 회원 API에 보내고 등록 참조가 있는 응답을 요구한다', async () => {
  const calls = [];
  const api = createRepositoryApi(async (...args) => { calls.push(args); return { kind: 'success', status: 201, data: repository }; });
  assert.deepEqual(await api.register(repository.url), success);
  assert.equal(calls[0][0], '/me/repositories');
  assert.deepEqual(calls[0][1].body, { url: repository.url });
  assert.equal(calls[0][1].method, 'POST');
  for (const data of [{ ...repository, registrationId: undefined }, { ...repository, allowedScopeRevision: '' }, null]) {
    assert.equal((await createRepositoryApi(async () => ({ kind: 'success', status: 201, data })).register(repository.url)).kind, 'lookup-failed');
  }
});

test('C6-2 등록 뒤 목록/현재 고지를 읽고 선택하지만 새 동의 전에는 분석을 보내지 않는다', async () => {
  const posts = [];
  const requests = createAnalysisRequestStore({ repositories: async () => ({ kind: 'success', data: [repository] }), requests: {
    notice: async () => ({ kind: 'success', data: { noticeRevision: 'notice-1', text: '합성 현재 안내' } }),
    create: async (...args) => { posts.push(args); return { kind: 'success', status: 202, data: summary({ lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY' }) }; },
  } });
  const registration = createRepositoryRegistrationStore(async () => success, async id => { await requests.load(); requests.select(id); });
  registration.change('  ' + repository.url + '  ');
  await registration.submit();
  assert.equal(registration.getSnapshot().phase, 'registered');
  assert.match(registration.getSnapshot().message, /새로 동의/);
  assert.equal(posts.length, 0);
  await requests.submit();
  assert.equal(posts.length, 1);
  assert.equal(posts[0][0].consent.accepted, true);
  assert.equal(posts[0][0].consent.noticeRevision, 'notice-1');
  requests.dispose(); registration.dispose();
});

test('C6-3 URL·비공개·지원 불가·확인 불가와 연결 오류는 각각 안내하며 입력을 보존한다', async () => {
  const messages = new Set();
  for (const code of Object.keys(REGISTRATION_ERRORS)) {
    const store = createRepositoryRegistrationStore(async () => ({ kind: 'api-error', status: 403, code }), async () => assert.fail('거부 뒤 선택 금지'));
    store.change(repository.url); await store.submit();
    assert.equal(store.getSnapshot().url, repository.url);
    assert.equal(store.getSnapshot().failed, true);
    assert.equal(store.getSnapshot().message, REGISTRATION_ERRORS[code]); messages.add(store.getSnapshot().message);
  }
  assert.equal(messages.size, Object.keys(REGISTRATION_ERRORS).length);
});

test('C6-4 NONE·UNKNOWN·FOUND와 수집 한계를 구별하고 잘못된 관측 조합은 조회 실패다', () => {
  assert.equal(REGISTRATION_ERRORS.REPOSITORY_PRIVATE, '비공개이거나 없는 저장소라 확인할 수 없습니다. 공개 저장소 주소인지 확인해 주세요.');
  assert.equal(REGISTRATION_ERRORS.REPOSITORY_UNVERIFIED, 'GitHub에서 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  assert.ok(statusDetails(readAnalysis(summary({ ownCommitObservation: 'NONE', observedOwnCommitCount: 0 }))).includes('확인한 범위에서 본인 기록이 없습니다. GitHub 계정에 연결되지 않은 메일로 쓴 커밋은 본인 기록으로 세지 않습니다.'));
  assert.match(statusDetails(readAnalysis(summary())).join(' '), /없다는 뜻은 아닙니다/);
  const found = summary({ ownCommitObservation: 'FOUND', observedOwnCommitCount: 4, collectionLimitNotes: ['상세 상한'] });
  assert.match(statusDetails(readAnalysis(found)).join(' '), /본인 커밋을 확인했습니다.*수집 한계/);
  for (const bad of [{ ownCommitObservation: 'NONE', observedOwnCommitCount: null }, { ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: 0 }, { ownCommitObservation: 'FOUND', observedOwnCommitCount: 0 }, { collectionLimitNotes: [''] }]) assert.equal(readAnalysis(summary(bad)), null);
});

test('C6-5 등록 응답 불명·예외는 분석 접수로 바뀌지 않으며 같은 주소 재등록을 안내한다', async () => {
  for (const register of [async () => ({ kind: 'lookup-failed' }), async () => { throw new Error('network'); }]) {
    const store = createRepositoryRegistrationStore(register, async () => assert.fail('불명 응답 뒤 선택 금지'));
    store.change(repository.url); await store.submit();
    assert.equal(store.getSnapshot().phase, 'editing');
    assert.match(store.getSnapshot().message, /같은 주소/);
  }
});

test('C6-6 중복 클릭은 한 번만 전송하고 입력 변경과 취소 뒤 늦은 응답을 차단한다', async () => {
  const waiting = deferred(); let calls = 0, selections = 0, signal;
  const store = createRepositoryRegistrationStore(async (_url, s) => { calls++; signal = s; return waiting.promise; }, async () => { selections++; });
  let notifications = 0; const unsubscribe = store.subscribe(() => { notifications++; });
  await store.submit(); assert.equal(calls, 0);
  store.change(repository.url); const task = store.submit(); await store.submit(); store.change('https://github.com/other/repo');
  assert.equal(calls, 1); assert.equal(store.getSnapshot().url, repository.url);
  unsubscribe(); store.dispose(); waiting.resolve(success); await task;
  assert.equal(signal.aborted, true); assert.equal(selections, 0); assert.equal(notifications, 2);
});

test('C6-7 하루 제한은 KST 다음 날 안내이며 남은 횟수나 자동 재전송을 표시하지 않는다', async () => {
  let calls = 0;
  const store = createAnalysisRequestStore({ repositories: async () => ({ kind: 'success', data: [repository] }), requests: {
    notice: async () => ({ kind: 'success', data: { noticeRevision: 'notice-1', text: '합성 안내' } }),
    create: async () => { calls++; return { kind: 'api-error', status: 429, code: 'DAILY_LIMIT_REACHED' }; },
  } });
  await store.load(); store.select('123'); await store.submit();
  assert.equal(calls, 1); assert.match(TEXT.dailyLimit, /한국 시간/);
  assert.equal(store.getSnapshot().message.text, TEXT.dailyLimit);
  assert.equal(store.getSnapshot().selectedId, null); store.dispose();
});

test('C6-8 새 회원의 등록 객체는 이전 요청을 재사용하지 않고 실패 후 새 주소로 다시 등록할 수 있다', async () => {
  const urls = []; let count = 0;
  const store = createRepositoryRegistrationStore(async url => { urls.push(url); return ++count === 1 ? { kind: 'api-error', code: 'UNKNOWN', status: 500 } : success; }, async () => {});
  store.change(repository.url); await store.submit(); assert.equal(store.getSnapshot().failed, true);
  store.change('https://github.com/new/repo'); await store.submit(); assert.equal(store.getSnapshot().phase, 'registered');
  assert.deepEqual(urls, [repository.url, 'https://github.com/new/repo']);
  store.dispose();
  const next = createRepositoryRegistrationStore(async () => success, async () => {});
  assert.equal(next.getSnapshot().url, ''); assert.equal(next.getSnapshot().message, null);
});

test('주소 초안은 모달 cancel에서 남고 dispose에서 버리며 주소 수정은 이전 선택을 무효화한다', async () => {
  let selected = '123';
  const waiting = deferred();
  const store = createRepositoryRegistrationStore(async () => waiting.promise, async () => { selected = 'late'; }, () => { selected = null; });
  store.change(repository.url); assert.equal(selected, null);
  const task = store.submit(); store.cancel();
  assert.equal(store.getSnapshot().url, repository.url);
  assert.equal(store.getSnapshot().phase, 'editing');
  waiting.resolve(success); await task; assert.equal(selected, null);
  store.dispose(); assert.equal(store.getSnapshot().url, '');
});
