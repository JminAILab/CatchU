require('reflect-metadata');
// #123 공개 선택·링크 수신자 열람의 화면 통합 검사.
// 실제 web 상태·호출 코드(저장소 연결 관리·내 자산·공유 링크·수신자)를 실제 Nest HTTP·PostgreSQL에 붙인다.
// 로그인은 개발용 로그인, 분석 결과는 #103 공용 합성 결과를 실제 접수 요청에 개발 주입으로 넣는다(intake-app.cjs).
// 실제 Google 로그인·실제 분석(worker·GitHub)·React 화면 그리기는 이 검사 범위가 아니다(화면은 수동 확인으로 따로 본다).
// 시험 이름의 [실제 HTTP·DB]는 응답을 바꾸지 않은 사례, [실패 대역]은 응답 실패를 시험에서 주입한 사례다.
// [실패 대역]만으로 통과한 동작은 실제 연결 통과로 세지 않는다. 만료는 링크 발급·만료 시각을 DB에서 과거로 옮겨 만든다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { startIntakeApp } = require('../helpers/intake-app.cjs');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');

const FIXTURES = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const read = file => JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8'));
const WEB_BASE = 'http://127.0.0.1:3000';
const REPOSITORY_ID = SYNTHETIC_REPOSITORY.repositoryId;
// 계약 common.yaml의 수신자 응답 필드. 이 밖의 필드(본인용 질문·내부 요청/결과/후보/근거 식별자 등)는 나가면 안 된다.
const COLLECTION_KEYS = ['catches', 'page', 'profile'];
const PUBLIC_CATCH_KEYS = ['catchId', 'draft', 'evidence', 'subjectContribution', 'title', 'workFacts'];
const PUBLIC_EVIDENCE_KEYS = ['contributionScope', 'coverageLimits', 'representedFacts', 'sourceRevision', 'sourceUrl'];
const PUBLIC_PROFILE_KEYS = ['desiredRole', 'displayName', 'fieldSource', 'githubAccountLogin', 'introduction', 'skills'];

let db, web;
before(async () => {
  db = await openTestDataSource();
  const load = file => import(`../../../web/src/${file}`);
  const modules = await Promise.all(['lib/api-client.ts', 'lib/access-token.ts',
    'features/repository-management/repository-api.ts', 'features/repository-management/repository-status.ts',
    'features/assets/catch-api.ts', 'features/assets/assets-store.ts', 'features/share-links/share-link-api.ts',
    'features/recipient/recipient-api.ts', 'features/recipient/recipient-store.ts', 'features/recipient/recipient-grants.ts'].map(load));
  web = Object.assign({}, ...modules);
});
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

async function start(t) {
  const s = await startIntakeApp(db, { settings: { SHARE_LINK_WEB_BASE_URL: WEB_BASE } });
  t.after(() => s.close());
  return s;
}

/**
 * 개발용 로그인한 회원의 web 호출 도구. 화면과 같은 조립(`createXxxApi(api.member)`)을 쓴다.
 * `fail`에 함수를 넣으면 그 요청에 실패 대역을 돌려준다('network'면 통신 실패, 'server'면 500). 모든 요청은 `calls`에 남긴다.
 */
async function member(s, label) {
  const user = await s.login('screen-' + label);
  const tokens = web.createAccessTokenStore();
  tokens.set(user.token);
  const m = { user, calls: [], fail: null };
  const client = web.createApiClient({ baseUrl: s.base, nodeEnv: 'test', tokens, fetch: async (input, init = {}) => {
    const url = new URL(String(input));
    m.calls.push({ method: init.method ?? 'GET', path: url.pathname });
    const mode = m.fail?.(url, init);
    if (mode === 'network') throw new TypeError('fetch failed');
    if (mode === 'server') return Response.json({ code: 'INTERNAL_ERROR', message: '서버 오류' }, { status: 500 });
    return fetch(input, init);
  } });
  Object.assign(m, { client, repositories: web.createRepositoryApi(client.member),
    catches: web.createCatchApi(client.member), links: web.createShareLinkApi(client.member) });
  m.assets = () => web.createAssetsStore(m.catches);
  return m;
}

/** 실제 접수 API로 요청을 만들고 #103 합성 결과를 개발 주입한다. 등록된 Catch ID를 돌려준다. */
async function analyzed(s, m, file, change) {
  const intake = await s.submit(m.user);
  const template = read(`results/${file}.json`);
  change?.(template);
  const result = await s.inject(m.user, intake.status.requestId, 'Result', template, 'screen-' + file);
  assert.equal(result.status, 201, result.text);
  assert.equal(result.body.receipt.disposition, 'ACCEPTED');
  return { requestId: intake.status.requestId, catchIds: result.body.application?.registeredCatchIds ?? [] };
}
// #103 two-candidates-same-work의 둘째 후보 작업 식별만 시험 안에서 바꿔, 한 결과에서 Catch 두 개를 만든다.
const twoWorks = template => { template.candidates[1].workIdentity += '-other'; };

/** 화면의 상세 열기 → 저장 순서로 확인·공개·숨김을 보낸다. 저장 결과를 돌려준다. */
async function save(store, catchId, change) {
  await store.openDetail(catchId);
  assert.equal(store.getSnapshot().detailState, 'ready');
  await store.update(change);
  return store.getSnapshot();
}
const publish = async (store, catchId) => {
  assert.equal((await save(store, catchId, { kind: 'confirmation' })).mutation.status, 'success');
  assert.equal((await save(store, catchId, { kind: 'visibility', visibility: 'PUBLIC' })).mutation.status, 'success');
};

async function issue(m, title, password) {
  const result = await m.links.create(password === undefined ? { title } : { title, password }, randomUUID());
  assert.equal(result.kind, 'success', JSON.stringify(result));
  assert.equal(result.status, 201);
  return result.data;
}
const tokenOf = url => new URL(url).pathname.split('/').pop();
const visibilityOf = catchId => db.query('SELECT visibility FROM catch_asset WHERE catch_id = $1', [catchId]).then(r => r[0].visibility);
// 화면은 계약 시각만 보며 시각을 바꿀 수 없으므로, 만료는 발급·만료 시각을 함께 과거로 옮겨 만든다(DB 제약 유지).
const expire = linkId => db.query(`UPDATE share_link SET issued_at = issued_at - interval '721 hours',
  expires_at = expires_at - interval '721 hours' WHERE link_id = $1`, [linkId]);

/**
 * 비로그인 수신자의 web 호출 도구. 받은 원본 응답과 요청 헤더를 `raw`에 남기고, grant는 이 수신자만의 저장소에 둔다.
 * `fail`은 회원 도구와 같은 실패 대역이다.
 */
function recipient(s, url) {
  const token = tokenOf(url);
  const raw = [];
  const r = { token, raw, fail: null };
  const client = web.createApiClient({ baseUrl: s.base, nodeEnv: 'test', tokens: web.createAccessTokenStore(),
    fetch: async (input, init = {}) => {
      const mode = r.fail?.(new URL(String(input)), init);
      if (mode === 'network') throw new TypeError('fetch failed');
      if (mode === 'server') return Response.json({ code: 'INTERNAL_ERROR', message: '서버 오류' }, { status: 500 });
      const response = await fetch(input, init);
      raw.push({ method: init.method ?? 'GET', path: new URL(String(input)).pathname, headers: new Headers(init.headers),
        status: response.status, cache: response.headers.get('cache-control'), text: await response.clone().text() });
      return response;
    } });
  const storage = new Map();
  const grants = web.createGrantStore(() => ({ getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }));
  const api = web.createRecipientApi(client.recipient);
  Object.assign(r, { storage, grants, api,
    list: () => web.createRecipientCollectionStore({ api, grants, token }),
    detail: catchId => web.createRecipientCatchStore({ api, grants, token, catchId }) });
  r.view = async store => { await store.load(); return store.getSnapshot(); };
  return r;
}

test('[실제 HTTP·DB] 실제 상태 응답의 ownerResultsReady·등록 Catch로만 결과에 들어가고, 처음 Catch는 비공개다', async t => {
  const s = await start(t);
  const owner = await member(s, 'entry-owner');
  const before = await web.loadConnectedRepositories(owner.repositories);
  assert.equal(before.kind, 'ready');
  assert.deepEqual(before.analyses, []);

  const intake = await s.submit(owner.user);
  const queued = await web.loadConnectedRepositories(owner.repositories);
  const [waiting] = queued.analyses;
  assert.deepEqual([waiting.requestId, waiting.ownerResultsReady, waiting.registeredCatchIds], [intake.status.requestId, false, []]);
  assert.equal(web.canShowCatches(waiting), false, '분석 대기 중에는 Catch 보기를 열지 않는다');

  const template = read('results/two-candidates-same-work.json');
  twoWorks(template);
  const applied = await s.inject(owner.user, intake.status.requestId, 'Result', template, 'screen-entry');
  assert.equal(applied.status, 201, applied.text);
  const catchIds = [...applied.body.application.registeredCatchIds].sort();
  assert.equal(catchIds.length, 2);
  const ready = await web.loadConnectedRepositories(owner.repositories);
  const [latest] = ready.analyses;
  assert.deepEqual([latest.ownerResultsReady, [...latest.registeredCatchIds].sort()], [true, catchIds]);
  assert.equal(web.canShowCatches(latest), true);

  // [이 저장소 Catch 보기] → 그 저장소로 거른 내 자산 목록. 등록된 Catch가 모두 비공개로 보인다.
  const assets = owner.assets();
  await assets.refresh(latest.repositoryId);
  const list = assets.getSnapshot();
  assert.equal(list.listState, 'ready');
  assert.deepEqual(list.items.map(item => item.catchId).sort(), catchIds);
  assert.deepEqual(list.items.map(item => item.visibility), ['PRIVATE', 'PRIVATE']);
  // 상세에서 근거·기여를 읽을 수 있다.
  await assets.openDetail(catchIds[0]);
  const { detail } = assets.getSnapshot();
  assert.ok(detail.evidence.length > 0 && detail.evidence.every(e => e.sourceUrl && e.representedFacts.length > 0));
  assert.ok(detail.workFacts.length > 0 && detail.subjectContribution.length > 0);
  assert.deepEqual([detail.confirmation.workFactsConfirmed, detail.confirmation.contributionConfirmed, detail.visibility],
    [false, false, 'PRIVATE']);

  // 후보 없는 정상 완료(#103 empty)는 결과 진입을 열지 않고, 목록은 조회 실패가 아닌 정상 0건이다.
  const empty = await member(s, 'entry-empty');
  await analyzed(s, empty, 'empty');
  const [none] = (await web.loadConnectedRepositories(empty.repositories)).analyses;
  assert.deepEqual([none.processing, none.ownerResultsReady, none.registeredCatchIds], ['EMPTY', false, []]);
  assert.equal(web.canShowCatches(none), false);
  const emptyAssets = empty.assets();
  await emptyAssets.refresh(REPOSITORY_ID);
  assert.deepEqual([emptyAssets.getSnapshot().listState, emptyAssets.getSnapshot().items], ['ready', []]);
});

test('[실제 HTTP·DB] 확인·불일치 표시만으로는 공개되지 않고, 별도 공개한 Catch만 수신자에게 보이며, 숨기면 다음 요청부터 막힌다', async t => {
  const s = await start(t);
  const owner = await member(s, 'publish-owner');
  const { catchIds } = await analyzed(s, owner, 'two-candidates-same-work', twoWorks);
  const [shown, kept] = catchIds;
  const link = await issue(owner, '공개 확인 링크');
  const r = recipient(s, link.url);

  // 공개 0건은 정상 빈 목록이다(조회 실패·링크 불가가 아니다).
  const empty = await r.view(r.list());
  assert.deepEqual([empty.view, empty.catches], ['ready', []]);

  const assets = owner.assets();
  await assets.refresh(REPOSITORY_ID);
  const confirmed = await save(assets, shown, { kind: 'confirmation' });
  assert.equal(confirmed.mutation.status, 'success');
  assert.equal(confirmed.detail.visibility, 'PRIVATE');
  assert.equal(await visibilityOf(shown), 'PRIVATE');
  assert.deepEqual((await r.view(r.list())).catches, [], '확인만 한 Catch는 수신자 목록에 없다');
  assert.equal((await r.view(r.detail(shown))).view, 'resource-unavailable');
  // 불일치 표시도 공개 여부를 바꾸지 않는다. 확인하지 않은 Catch는 공개가 거절된다.
  const marked = await save(assets, kept, { kind: 'mismatch', mismatch: true });
  assert.deepEqual([marked.mutation.status, marked.detail.mismatch, marked.detail.visibility], ['success', true, 'PRIVATE']);
  const refused = await save(assets, kept, { kind: 'visibility', visibility: 'PUBLIC' });
  assert.deepEqual([refused.mutation.status, refused.mutation.error.code], ['error', 'CONFIRMATION_REQUIRED']);
  assert.equal(await visibilityOf(kept), 'PRIVATE');

  const published = await save(assets, shown, { kind: 'visibility', visibility: 'PUBLIC' });
  assert.deepEqual([published.mutation.status, published.detail.visibility], ['success', 'PUBLIC']);
  const open = await r.view(r.list());
  assert.deepEqual(open.catches.map(item => item.catchId), [shown], '별도 공개한 Catch만 보인다');
  const openDetail = r.detail(shown);
  assert.equal((await r.view(openDetail)).view, 'ready');
  assert.equal((await r.view(r.detail(kept))).view, 'resource-unavailable', '공개하지 않은 Catch 상세는 막힌다');

  // 수신자 원본 응답에는 계약 필드만 있고, 본인용 질문·내부 식별자·회원 토큰이 없다.
  await assets.openDetail(shown);
  const own = assets.getSnapshot().detail;
  const secrets = [link.title, link.linkId, owner.user.memberId, own.repositoryId, own.sourceRequestId, own.sourceResultId, own.sourceCandidateId,
    ...own.evidence.flatMap(e => [e.catchEvidenceId, e.sourceEvidenceId]), ...own.reflection.questions];
  assert.ok(own.reflection.questions.length > 0, '비교할 본인용 질문이 있어야 한다');
  const reads = r.raw.filter(entry => entry.status === 200);
  assert.ok(reads.some(entry => entry.path.endsWith(`/catches/${shown}`)) && reads.some(entry => entry.path === `/v1/public/links/${r.token}`));
  for (const entry of r.raw) assert.equal(entry.cache, 'no-store', `수신자 응답을 저장하지 않게 한다: ${entry.path}`);
  for (const entry of reads) {
    const body = JSON.parse(entry.text);
    const items = entry.path.includes('/catches/') ? [body] : body.catches;
    if (!entry.path.includes('/catches/')) {
      assert.deepEqual(Object.keys(body).sort(), COLLECTION_KEYS);
      assert.deepEqual(Object.keys(body.profile).sort(), PUBLIC_PROFILE_KEYS);
    }
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), PUBLIC_CATCH_KEYS);
      for (const evidence of item.evidence) assert.deepEqual(Object.keys(evidence).sort(), PUBLIC_EVIDENCE_KEYS);
    }
    for (const secret of secrets) assert.ok(!entry.text.includes(secret), `수신자 응답에 내부 값이 없다: ${entry.path}`);
  }
  assert.ok(r.raw.every(entry => !entry.headers.has('authorization')), '수신자 요청에 회원 토큰을 붙이지 않는다');

  // 숨김: 이미 받은 화면을 회수하지는 않지만 다음 목록·상세 요청부터 막는다.
  const hidden = await save(assets, shown, { kind: 'visibility', visibility: 'PRIVATE' });
  assert.deepEqual([hidden.mutation.status, await visibilityOf(shown)], ['success', 'PRIVATE']);
  assert.deepEqual((await r.view(r.list())).catches, []);
  assert.equal((await r.view(openDetail)).view, 'resource-unavailable', '열려 있던 상세도 다시 읽으면 막힌다');
});

test('[실제 HTTP·DB] 타인·없는 Catch와 없음·중단·만료 링크는 각각 같은 공통 거부로 보인다', async t => {
  const s = await start(t);
  const owner = await member(s, 'deny-owner');
  const other = await member(s, 'deny-other');
  const [mine] = (await analyzed(s, owner, 'succeeded-one-candidate')).catchIds;
  const [theirs] = (await analyzed(s, other, 'succeeded-one-candidate')).catchIds;
  await publish(owner.assets(), mine);
  await publish(other.assets(), theirs);

  // 본인 화면: 다른 회원 Catch와 없는 Catch는 같은 404 RESOURCE_UNAVAILABLE·같은 안내이고 저장도 바꾸지 않는다.
  const foreign = await other.catches.detail(mine);
  const missing = await other.catches.detail(randomUUID());
  for (const result of [foreign, missing]) assert.deepEqual([result.kind, result.status, result.code], ['api-error', 404, 'RESOURCE_UNAVAILABLE']);
  assert.equal(web.catchErrorText(foreign), web.catchErrorText(missing));
  const hide = await other.catches.update(mine, { kind: 'visibility', visibility: 'PRIVATE' });
  assert.deepEqual([hide.status, hide.code, await visibilityOf(mine)], [404, 'RESOURCE_UNAVAILABLE', 'PUBLIC']);

  // 수신자: 링크 주인의 공개 Catch만 열리고, 다른 회원의 공개 Catch·없는 Catch는 같은 상세 불가다.
  const link = await issue(owner, '거부 확인 링크');
  const r = recipient(s, link.url);
  assert.equal((await r.view(r.detail(mine))).view, 'ready');
  for (const catchId of [theirs, randomUUID()]) assert.equal((await r.view(r.detail(catchId))).view, 'resource-unavailable');
  const resourceBodies = r.raw.filter(entry => entry.status === 404).map(entry => entry.text);
  assert.equal(new Set(resourceBodies).size, 1, '타인·없는 Catch의 거부 응답 본문이 같다');

  // 링크: 없는 주소·중단·만료를 구분하지 않고 같은 링크 불가다.
  const stopped = await issue(owner, '중단할 링크');
  assert.equal((await owner.links.stop(stopped.linkId)).data.state, 'STOPPED');
  const expired = await issue(owner, '만료될 링크');
  await expire(expired.linkId);
  const denied = [];
  for (const url of [`${WEB_BASE}/s/${'A'.repeat(43)}`, stopped.url, expired.url]) {
    const target = recipient(s, url);
    assert.equal((await target.view(target.list())).view, 'unavailable', url);
    assert.equal((await target.view(target.detail(mine))).view, 'unavailable', url);
    denied.push(...target.raw.map(entry => `${entry.status} ${entry.text}`));
  }
  assert.equal(new Set(denied).size, 1, '없음·중단·만료의 거부 응답이 같다');
  assert.ok(denied[0].startsWith('404 ') && JSON.parse(denied[0].slice(4)).code === 'LINK_UNAVAILABLE');
  // 발행자 목록에는 상태가 따로 보인다.
  const states = Object.fromEntries((await owner.links.list(null)).data.items.map(item => [item.linkId, item.state]));
  assert.deepEqual([states[link.linkId], states[stopped.linkId], states[expired.linkId]], ['ACTIVE', 'STOPPED', 'EXPIRED']);
});

test('[실제 HTTP·DB] 비밀번호 링크는 미입력·잘못된 값·올바른 값으로 갈리고, 받은 grant로 중단·만료·다른 링크를 넘지 못한다', async t => {
  const s = await start(t);
  const owner = await member(s, 'password-owner');
  const [catchId] = (await analyzed(s, owner, 'succeeded-one-candidate')).catchIds;
  await publish(owner.assets(), catchId);
  const PASSWORD = 'screen-pass-123';
  const locked = await issue(owner, '비밀번호 링크', PASSWORD);
  assert.equal(locked.passwordRequired, true);
  const r = recipient(s, locked.url);

  const list = r.list();
  assert.equal((await r.view(list)).view, 'password');
  assert.equal((await r.view(r.detail(catchId))).view, 'password', '상세로 바로 들어와도 비밀번호를 먼저 묻는다');
  const unlocks = () => r.raw.filter(entry => entry.path.endsWith('/unlock')).length;
  assert.deepEqual([await list.unlock(''), unlocks()], ['empty', 0], '빈 값은 보내지 않는다');
  assert.equal(await list.unlock('wrong-password-1'), 'invalid');
  assert.equal(list.getSnapshot().unlock.phase, 'invalid');
  assert.equal(r.storage.size, 0);
  assert.equal(await list.unlock(PASSWORD), 'granted');
  assert.deepEqual(list.getSnapshot().catches.map(item => item.catchId), [catchId]);
  const grant = r.grants.get(r.token);
  assert.ok(grant);
  assert.equal(r.raw.filter(entry => entry.path.endsWith('/unlock')).every(entry => !entry.path.includes(PASSWORD)), true);
  // 같은 링크의 상세는 받은 grant로 다시 묻지 않는다.
  const detail = r.detail(catchId);
  assert.equal((await r.view(detail)).view, 'ready');

  // grant는 링크 한정이다. 다른 비밀번호 링크에 붙여도 비밀번호를 다시 묻는다.
  const second = await issue(owner, '다른 비밀번호 링크', PASSWORD);
  const borrowed = await r.api.collection(tokenOf(second.url), grant, null);
  assert.deepEqual([borrowed.status, borrowed.code], [401, 'LINK_PASSWORD_REQUIRED']);

  // 중단한 링크는 받은 grant가 있어도 링크 불가이고, 그 grant를 지운다.
  await owner.links.stop(locked.linkId);
  assert.equal((await r.view(detail)).view, 'unavailable');
  assert.equal(r.grants.get(r.token), null);
  assert.equal((await r.view(r.list())).view, 'unavailable');

  // 만료도 같다: grant를 받은 뒤 만료되면 다음 요청에서 링크 불가다.
  const r2 = recipient(s, second.url);
  const list2 = r2.list();
  await r2.view(list2);
  assert.equal(await list2.unlock(PASSWORD), 'granted');
  const grant2 = r2.grants.get(r2.token);
  await expire(second.linkId);
  assert.equal((await r2.view(r2.detail(catchId))).view, 'unavailable');
  assert.equal(r2.grants.get(r2.token), null);
  const replay = await r2.api.collection(r2.token, grant2, null);
  assert.deepEqual([replay.status, replay.code], [404, 'LINK_UNAVAILABLE'], '지운 grant를 다시 붙여도 만료를 넘지 못한다');
});

test('[실패 대역] 조회 실패는 정상 0건·링크 불가로 바뀌지 않고 새 분석 요청을 보내지 않으며, 다시 불러오면 실제 자료가 보인다', async t => {
  const s = await start(t);
  const owner = await member(s, 'failure-owner');
  const [catchId] = (await analyzed(s, owner, 'succeeded-one-candidate')).catchIds;
  await publish(owner.assets(), catchId);
  const link = await issue(owner, '실패 확인 링크');
  owner.calls.length = 0;
  const [{ count: requestsBefore }] = await db.query('SELECT count(*)::int AS count FROM analysis_request');

  // 저장소 연결 관리: 상태 이력 500은 정상 0건(ready·빈 이력)이 아닌 조회 실패다.
  owner.fail = url => (url.pathname === '/v1/analysis-requests' ? 'server' : null);
  assert.equal((await web.loadConnectedRepositories(owner.repositories)).kind, 'failed');
  // 내 자산: 목록 통신 실패는 오류 상태이며 빈 목록으로 보이지 않는다.
  owner.fail = url => (url.pathname === '/v1/catches' ? 'network' : null);
  const assets = owner.assets();
  await assets.refresh(REPOSITORY_ID);
  assert.deepEqual([assets.getSnapshot().listState, assets.getSnapshot().listError.code], ['error', 'LOOKUP_FAILED']);
  assert.ok(owner.calls.every(call => !(call.method === 'POST' && call.path === '/v1/analysis-requests')), '실패 뒤 새 분석 요청을 보내지 않는다');
  const [{ count: requestsAfter }] = await db.query('SELECT count(*)::int AS count FROM analysis_request');
  assert.equal(requestsAfter, requestsBefore);

  owner.fail = null;
  await assets.refresh(REPOSITORY_ID);
  assert.deepEqual(assets.getSnapshot().items.map(item => item.catchId), [catchId], '실패를 걷으면 실제 자료가 보인다');
  const loaded = await web.loadConnectedRepositories(owner.repositories);
  assert.equal(web.canShowCatches(loaded.analyses[0]), true);

  // 수신자: 500·통신 실패는 조회 실패이고, 링크 불가·빈 목록으로 바꾸지 않는다. 다시 불러오면 공개 Catch가 보인다.
  const r = recipient(s, link.url);
  const list = r.list();
  for (const mode of ['server', 'network']) {
    r.fail = () => mode;
    assert.equal((await r.view(list)).view, 'failed', mode);
    assert.equal((await r.view(r.detail(catchId))).view, 'failed', mode);
  }
  r.fail = null;
  assert.deepEqual((await r.view(list)).catches.map(item => item.catchId), [catchId]);
});
