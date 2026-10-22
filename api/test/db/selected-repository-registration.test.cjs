require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { MemberAccount, AnalysisRequest, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const versions = new SelectedRepositoryCatalog().listCurrent();
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

// LIVE는 저장 맥락 검사값이다. 동의·분석 결과는 테스트 전용이며 실제 GitHub·LLM 호출은 없다.
async function seed({version = versions[0], sourceMode = 'LIVE', processing = 'SUCCEEDED', lifecycle = 'CLOSED',
  consentedScope} = {}) {
  const member = Object.assign(new MemberAccount(), {identityReference: `fixture:${randomUUID()}`, accountState: 'ACTIVE'});
  await db.manager.insert(MemberAccount, member);
  const request = await db.transaction('READ COMMITTED', async manager => {
    const created = await insertInitialAnalysis(manager, {memberId: member.memberId, repositoryId: version.repositoryId,
      noticeRevision: 'fixture-notice-not-product-approved', scopeRevision: 'fixture-scope-not-product-approved', sourceMode,
      consentedScope: consentedScope ?? {revision: 'fixture-scope-not-product-approved', repositoryId: version.repositoryId,
        selectionReference: version.selectionReference}});
    await manager.update(AnalysisAttempt, {attemptId: created.currentAttemptId}, {processing});
    await manager.update(AnalysisRequest, {requestId: created.requestId}, {lifecycle});
    return created;
  });
  return {requestId: request.requestId, attemptId: request.currentAttemptId, memberId: member.memberId,
    repositoryId: version.repositoryId, consentId: request.consentId,
    scopeRevision: 'fixture-scope-not-product-approved', sourceMode};
}
const source = catalog => new SelectedRepositoryRegistrationSource(db, catalog);
const expected = (context, version = versions[0]) => ({...context, githubRepository: {owner: version.owner, name: version.name}});

test('실제 DB의 LIVE 요청·동의·시도와 선정 판본을 대조해 두 저장소의 정확한 좌표를 읽는다', async () => {
  for (const version of versions) {
    const context = await seed({version});
    assert.deepEqual(await source().findForRegistration(context), expected(context, version));
  }
});

test('종결·닫힘 뒤에도 좌표를 읽고 현재 GitHub 연결·현재 시도 여부를 요구하지 않는다', async () => {
  for (const processing of ['SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED']) {
    const context = await seed({processing});
    assert.deepEqual(await source().findForRegistration(context), expected(context));
  }
  const context = await seed();
  await db.transaction('READ COMMITTED', async manager => {
    const newer = Object.assign(new AnalysisAttempt(), {requestId: context.requestId, sourceMode: 'LIVE'});
    await manager.insert(AnalysisAttempt, newer);
    await manager.update(AnalysisRequest, {requestId: context.requestId}, {currentAttemptId: newer.attemptId});
  });
  assert.deepEqual(await source().findForRegistration(context), expected(context));
});

test('입력의 일곱 맥락 값이 저장 자료와 다르면 좌표를 주지 않는다', async () => {
  const context = await seed();
  const mismatches = {requestId: randomUUID(), attemptId: randomUUID(), memberId: randomUUID(),
    repositoryId: versions[1].repositoryId, consentId: randomUUID(), scopeRevision: 'other-scope', sourceMode: 'MOCK'};
  for (const [field, value] of Object.entries(mismatches)) {
    assert.equal(await source().findForRegistration({...context, [field]: value}), null, field);
  }
  const other = await seed();
  assert.equal(await source().findForRegistration({...context, attemptId: other.attemptId}), null);
  assert.equal(await source().findForRegistration({...context, consentId: other.consentId}), null);
});

test('저장된 MOCK 시도는 LIVE로 바꿔 요청해도 사용할 수 없다', async () => {
  const context = await seed({sourceMode: 'MOCK'});
  assert.equal(await source().findForRegistration(context), null);
  assert.equal(await source().findForRegistration({...context, sourceMode: 'LIVE'}), null);
});

test('동의 범위의 누락·타입 오류·다른 저장소·미등록/합성 선정 참조는 모두 거부한다', async () => {
  const valid = {revision: 'fixture-scope-not-product-approved', repositoryId: versions[0].repositoryId,
    selectionReference: versions[0].selectionReference};
  const invalid = [{}, {revision: valid.revision}, {...valid, revision: null}, {...valid, revision: 1},
    {...valid, revision: 'other-scope'}, {...valid, repositoryId: Number(valid.repositoryId)},
    {...valid, repositoryId: versions[1].repositoryId}, {...valid, selectionReference: null},
    {...valid, selectionReference: 1}, {...valid, selectionReference: ''}, {...valid, selectionReference: 'unknown'},
    {...valid, selectionReference: 'catchu:synthetic-selection:v1'},
    {...valid, selectionReference: versions[1].selectionReference}];
  for (const scope of invalid) {
    const context = await seed({consentedScope: scope});
    assert.equal(await source().findForRegistration(context), null);
  }
});

test('현재 선정에서 제외하거나 같은 ID의 이름 판본을 추가해도 과거 동의의 좌표를 보존한다', async () => {
  const context = await seed();
  const renamed = {...versions[0], name: 'renamed-fixture', url: 'https://github.com/ljm0850/renamed-fixture', selectionReference: 'fixture:renamed'};
  for (const catalog of [new SelectedRepositoryCatalog(versions, []),
    new SelectedRepositoryCatalog([...versions, renamed], [renamed.selectionReference])]) {
    assert.deepEqual(await source(catalog).findForRegistration(context), expected(context));
  }
});

test('선정 좌표 판본이 보관되지 않았으면 현재 저장소나 URL에서 추론하지 않는다', async () => {
  const context = await seed();
  assert.equal(await source(new SelectedRepositoryCatalog([], [])).findForRegistration(context), null);
});

test('분석이 조회 도중 완료돼도 세 행은 같은 DB 스냅샷으로 읽는다', async () => {
  const context = await seed({processing: 'RUNNING', lifecycle: 'ACTIVE'});
  let changed = false;
  const transactionalSource = new SelectedRepositoryRegistrationSource({
    transaction: (isolation, work) => db.transaction(isolation, async manager => work({
      findOneBy: async (entity, where) => {
        const value = await manager.findOneBy(entity, where);
        if (entity === AnalysisRequest && !changed) {
          changed = true;
          await db.transaction('READ COMMITTED', async other => {
            await other.update(AnalysisAttempt, {attemptId: context.attemptId}, {processing: 'SUCCEEDED'});
            await other.update(AnalysisRequest, {requestId: context.requestId}, {lifecycle: 'CLOSED'});
          });
        }
        if (entity === AnalysisAttempt) assert.equal(value.processing, 'RUNNING');
        return value;
      },
    })),
  });
  assert.deepEqual(await transactionalSource.findForRegistration(context), expected(context));
  const latest = await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: context.attemptId});
  assert.equal(latest.processing, 'SUCCEEDED', '다음 트랜잭션에는 완료된 상태가 보임');
  assert.deepEqual(await source().findForRegistration(context), expected(context));
});
test('닫힌 실제 DB 연결의 조회 실패는 좌표 없음으로 바꾸지 않는다', async () => {
  const context = await seed();
  const closedDb = await openTestDataSource();
  await closedDb.destroy();
  await assert.rejects(new SelectedRepositoryRegistrationSource(closedDb).findForRegistration(context));
});
