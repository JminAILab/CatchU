require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { before, after, beforeEach, test } = require('node:test');
const { ForbiddenException } = require('@nestjs/common');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { MemberAccount, GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
const { AllowedScopeRevision, RepositorySelection } = require('../../dist/member-repositories/repository-selection.entity');
const { RepositorySelectionService, DatabaseRepositorySelectionSource } =
  require('../../dist/member-repositories/repository-selection.source');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { CreateRepositorySelection1792383899264 } = require('../../dist/database/migrations/1792383899264-CreateRepositorySelection');

// 실제 공급 검사: 실제 PostgreSQL의 선정·범위 정의 행과 회원·#231 연결 행 모양으로 세 공급을 직접 부른다.
// GitHub·자격정보 보관소·HTTP는 쓰지 않는다. HTTP 목록과 worker 실행 조회는 *-api 시험 파일이 맡는다.
const THEME = '570342307', ZOO = '547322698';
const SCOPE = 'catchu:allowed-scope:2026-10-19:v1';
const TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const reference = id => 'catchu:selected-repository:2026-10-16:' + id + ':v1';
let db, initial, service, source;

before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  await restoreInitialSelection(db, initial);
  service = new RepositorySelectionService(db, new SelectedRepositoryCatalog());
  source = new DatabaseRepositorySelectionSource();
});

let accounts = 0;
async function member(identityReference = 'catchu:google:' + randomUUID(), connection = {}) {
  const account = Object.assign(new MemberAccount(), { identityReference, accountState: 'ACTIVE' });
  await db.manager.insert(MemberAccount, account);
  accounts++;
  // #231 connect가 남기는 행 모양. 이 파일의 공급은 보관소를 읽지 않으므로 참조만 둔다.
  if (connection) {
    await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), {
      memberId: account.memberId, connectionState: 'CONNECTED', accountLogin: 'real-user-' + accounts,
      externalAccountReference: String(70000 + accounts), credentialReference: 'github-v1:' + randomUUID(), ...connection,
    }));
  }
  return account.memberId;
}
const intake = (memberId, repositoryId = THEME, isolation = 'READ COMMITTED') =>
  db.transaction(isolation, manager => service.confirmForIntake(manager, memberId, repositoryId));
const consent = (repositoryId = THEME, overrides = {}) => ({ revision: SCOPE, repositoryId,
  allowedResourceTypes: [...TYPES], selectionReference: reference(repositoryId), ...overrides });
// #232 접수 조회가 넘기는 맥락 모양. 시도·요청 행은 이 공급이 읽지 않는다.
const context = (memberId, scope = consent(), overrides = {}) => ({ attemptId: randomUUID(), requestId: randomUUID(),
  memberId, repositoryId: scope.repositoryId ?? THEME, consentId: randomUUID(), noticeRevision: 'catchu-real-analysis-notice-v1',
  scopeRevision: scope.revision ?? SCOPE, consentedScope: scope, sourceMode: 'LIVE', ...overrides });
const apiError = code => error => error?.code === code;
const theme = { owner: 'ljm0850', name: 'TheMe', url: 'https://github.com/ljm0850/TheMe' };
const zoo = { owner: 'ljm0850', name: 'BEASTA-ZOO', url: 'https://github.com/ljm0850/BEASTA-ZOO' };

test('마이그레이션: 빈 스키마 up/down/re-up, 엔티티와 DDL 일치, 범위 정의 불변과 CHECK·FK·유일성', async () => {
  const schema = 'test_252_' + randomUUID().replaceAll('-', '');
  await db.query('CREATE SCHEMA "' + schema + '"');
  const isolated = await openTestDataSource({ schema, extra: { options: '-c search_path=' + schema + ' -c TimeZone=UTC' },
    entities: [AllowedScopeRevision, RepositorySelection], migrations: [CreateRepositorySelection1792383899264] });
  const sql = (text, params) => isolated.query(text, params);
  try {
    assert.deepEqual((await isolated.runMigrations()).map(m => m.name), ['CreateRepositorySelection1792383899264']);
    assert.deepEqual((await isolated.driver.createSchemaBuilder().log()).upQueries.map(q => q.query), []);
    // 접수된 동의가 가리키는 범위 의미이므로 정의 행은 고치거나 지울 수 없다.
    for (const statement of ["UPDATE allowed_scope_revision SET collection_terms = '{}'",
      "UPDATE allowed_scope_revision SET allowed_resource_types = ARRAY['COMMIT']", 'DELETE FROM allowed_scope_revision']) {
      await assert.rejects(sql(statement), e => e.code === '23514', statement);
    }
    for (const [types, whole, terms] of [[['COMMIT', 'TREE'], true, {}], [[], true, {}], [['COMMIT'], false, {}], [['COMMIT'], true, []]]) {
      await assert.rejects(sql('INSERT INTO allowed_scope_revision VALUES ($1, $2, $3, $4)',
        ['catchu:allowed-scope:invalid', types, whole, JSON.stringify(terms)]), e => e.code === '23514', JSON.stringify(types));
    }
    const insertSelection = (repositoryId, selectionReference, scopeRevision) =>
      sql('INSERT INTO repository_selection VALUES ($1, $2, $3, true)', [repositoryId, selectionReference, scopeRevision]);
    await assert.rejects(insertSelection('0123', 'catchu:test:a', SCOPE), e => e.code === '23514');
    await assert.rejects(insertSelection('123', 'catchu:test:b', 'catchu:allowed-scope:undefined'), e => e.code === '23503');
    await assert.rejects(insertSelection('123', reference(THEME), SCOPE), e => e.code === '23505');
    await isolated.undoLastMigration();
    assert.deepEqual((await sql('SELECT tablename FROM pg_tables WHERE schemaname = $1', [schema])).map(r => r.tablename), ['migrations']);
    assert.deepEqual(await sql('SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1', [schema]), []);
    await isolated.runMigrations();
    assert.equal((await sql('SELECT count(*)::int AS n FROM repository_selection WHERE active'))[0].n, 2);
  } finally { await isolated.destroy(); await db.query('DROP SCHEMA "' + schema + '" CASCADE'); }
});

test('초기 자료: #105의 두 저장소를 #319 좌표 판본으로 활성화하고 범위 판본에 값의 지위를 남긴다', () => {
  const catalog = new SelectedRepositoryCatalog();
  assert.deepEqual(initial.selections.map(({ repositoryId, selectionReference, scopeRevision, active }) =>
    ({ repositoryId, selectionReference, scopeRevision, active })), [
    { repositoryId: ZOO, selectionReference: reference(ZOO), scopeRevision: SCOPE, active: true },
    { repositoryId: THEME, selectionReference: reference(THEME), scopeRevision: SCOPE, active: true },
  ]);
  for (const row of initial.selections) assert.equal(catalog.resolve(row.selectionReference).repositoryId, row.repositoryId);
  assert.equal(initial.scopes.length, 1);
  const [scope] = initial.scopes;
  assert.equal(scope.scopeRevision, SCOPE);
  assert.deepEqual(scope.allowedResourceTypes, TYPES);
  assert.equal(scope.wholeRepository, true);
  // 확정 결정·제안값·현행 계약을 구분한다. 수치는 정의 시점 worker 기본값의 사본이며 확정 정책이 아니다.
  assert.deepEqual(Object.fromEntries(Object.entries(scope.collectionTerms).map(([key, value]) => [key, value.status])),
    { method: 'DECIDED', range: 'PROPOSED', limits: 'PROPOSED', retries: 'CONTRACT' });
  assert.deepEqual(scope.collectionTerms.method.value, 'GITHUB_API');
  assert.deepEqual(scope.collectionTerms.retries.value, 'NONE');
  assert.deepEqual(scope.collectionTerms.range.value, { defaultBranchCommits: 500, linkedAccountCommitDetails: 200,
    pullRequests: 100, linkedAccountPullRequestCommitLists: 30, issueListItems: 100 });
  assert.deepEqual(scope.collectionTerms.limits.value, { calls: 300, collectionSeconds: 600, totalBytes: 52428800,
    responseBytes: 10485760, connectTimeoutSeconds: 5, readTimeoutSeconds: 15, comparePages: 10, baseBranchCommits: 100,
    associatedPullRequestLookupBatch: 100 });
});

test('접수 재확인: 서로 다른 GitHub 연결의 실제 회원이 같은 현재 선정과 저장 동의 네 칸을 받는다', async () => {
  const members = [await member(), await member(undefined, { accountLogin: 'another-account', externalAccountReference: '424242' })];
  for (const memberId of members) {
    for (const [repositoryId, repository] of [[THEME, theme], [ZOO, zoo]]) {
      const selection = await intake(memberId, repositoryId);
      assert.deepEqual(selection, { memberId, repositoryId, selectionReference: reference(repositoryId), scopeRevision: SCOPE,
        allowedResourceTypes: TYPES, wholeRepository: true, repository,
        consentedScope: { revision: SCOPE, repositoryId, allowedResourceTypes: TYPES, selectionReference: reference(repositoryId) } });
      // 접수가 저장할 동의는 worker 공급이 같은 전체 선정으로 해석한다.
      assert.deepEqual((await source.resolve(db.manager, context(memberId, selection.consentedScope), { lock: null }))?.repository,
        { owner: repository.owner, name: repository.name });
    }
  }
});

test('접수 재확인: 생성 트랜잭션 없이·READ COMMITTED가 아닌 격리 수준으로 부르면 판정 전에 거부한다', async () => {
  const memberId = await member();
  await assert.rejects(service.confirmForIntake(db.manager, memberId, THEME), /requires an active transaction/);
  await assert.rejects(intake(memberId, THEME, 'REPEATABLE READ'), /READ COMMITTED/);
});

test('접수 재확인·목록: 개발·미지원 출처·비활성·없는 회원은 기존 회원 경계(403)로 거부한다', async () => {
  const disabled = await member();
  await db.manager.update(MemberAccount, { memberId: disabled }, { accountState: 'DISABLED' });
  // 개발 회원은 실제 GitHub 연결 모양이 있어도 실제 선정을 받지 않는다(#322).
  for (const memberId of [await member('catchu:dev-login:' + randomUUID()), await member('catchu:google:'),
    await member('legacy:' + randomUUID()), disabled, randomUUID()]) {
    await assert.rejects(intake(memberId), ForbiddenException);
    await assert.rejects(service.listEligible(memberId), ForbiddenException);
  }
});

test('접수 재확인·목록: 연결 없음·해제·재인증 필요·보관 자격정보 없는 연결은 GITHUB_CONNECTION_REQUIRED', async () => {
  const connected = await member();
  for (const connection of [null,
    { connectionState: 'DISCONNECTED', accountLogin: null, externalAccountReference: null, credentialReference: null },
    { connectionState: 'REAUTH_REQUIRED', credentialReference: null },
    { credentialReference: null }, { credentialReference: 'catchu:mock-credential:not-real' }]) {
    const memberId = await member(undefined, connection);
    await assert.rejects(intake(memberId), apiError('GITHUB_CONNECTION_REQUIRED'), JSON.stringify(connection));
    await assert.rejects(service.listEligible(memberId), apiError('GITHUB_CONNECTION_REQUIRED'));
  }
  assert.equal((await intake(connected)).repositoryId, THEME, '다른 회원의 연결 상태와 섞지 않는다');
});

test('접수 재확인: 현재 선정에 없거나 제외한 저장소는 REPOSITORY_NOT_ALLOWED이며 다른 선정은 그대로다', async () => {
  const memberId = await member();
  for (const repositoryId of ['999999', 'synthetic-repo-0001', '']) {
    await assert.rejects(intake(memberId, repositoryId), apiError('REPOSITORY_NOT_ALLOWED'), repositoryId);
  }
  await db.manager.update(RepositorySelection, { repositoryId: THEME }, { active: false });
  await assert.rejects(intake(memberId, THEME), apiError('REPOSITORY_NOT_ALLOWED'));
  assert.equal((await intake(memberId, ZOO)).repositoryId, ZOO);
});

test('목록 공급: 같은 판정으로 현재 선정을 주고 활성 선정이 없으면 정상 빈 목록이다', async () => {
  const memberId = await member();
  const sorted = items => [...items].sort((a, b) => a.repositoryId < b.repositoryId ? -1 : 1);
  assert.deepEqual(sorted(await service.listEligible(memberId)), [
    { repositoryId: ZOO, name: zoo.name, ownerLogin: zoo.owner, url: zoo.url, allowedScopeRevision: SCOPE },
    { repositoryId: THEME, name: theme.name, ownerLogin: theme.owner, url: theme.url, allowedScopeRevision: SCOPE },
  ]);
  await db.query('UPDATE repository_selection SET active = false');
  assert.deepEqual(await service.listEligible(memberId), []);
});

test('선정 자료가 카탈로그·범위 정의와 어긋나면 세 공급 모두 정상 거부·빈 목록 대신 예외로 알린다', async () => {
  const memberId = await member();
  const runs = [() => service.listEligible(memberId), () => intake(memberId),
    () => source.resolve(db.manager, context(memberId), { lock: null })];
  await db.manager.update(RepositorySelection, { repositoryId: THEME }, { selectionReference: 'catchu:selected-repository:missing:v1' });
  for (const run of runs) await assert.rejects(run(), /Invalid current repository selection/);
  // 다른 저장소의 좌표 판본을 가리키는 선정
  await db.manager.delete(RepositorySelection, { repositoryId: ZOO });
  await db.manager.update(RepositorySelection, { repositoryId: THEME }, { selectionReference: reference(ZOO) });
  for (const run of runs) await assert.rejects(run(), /Invalid current repository selection/);
  // 자료 종류가 중복된 범위 정의(CHECK가 막지 못하는 모양)
  await db.manager.insert(AllowedScopeRevision, { scopeRevision: 'catchu:allowed-scope:test-duplicate:v1',
    allowedResourceTypes: ['COMMIT', 'COMMIT'], wholeRepository: true, collectionTerms: {} });
  await db.manager.update(RepositorySelection, { repositoryId: THEME },
    { selectionReference: reference(THEME), scopeRevision: 'catchu:allowed-scope:test-duplicate:v1' });
  for (const run of runs) await assert.rejects(run(), /Invalid repository selection scope/);
});

async function assertWriterBlocked(holderPid, writerPid, state) {
  const deadline = Date.now() + 3000;
  do {
    assert.equal(state.finished, false, '변경이 잠금을 쥔 트랜잭션보다 먼저 끝나면 안 된다');
    const [row] = await db.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [holderPid, writerPid]);
    if (row.blocked) return;
    // 고정 지연으로 잠금을 추정하지 않고 실제 차단 PID가 관찰될 때까지 제한 시간 안에서 조회한다.
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail('변경이 접수 재확인 트랜잭션에 차단되지 않았다');
}

for (const [label, change, rejected] of [
  ['선정 제외', writer => writer.query('UPDATE repository_selection SET active = false WHERE repository_id = $1', [THEME]),
    'REPOSITORY_NOT_ALLOWED'],
  ['연결 재인증 필요', (writer, memberId) => writer.query("UPDATE github_connection SET connection_state = 'REAUTH_REQUIRED'," +
    ' credential_reference = NULL WHERE member_id = $1', [memberId]), 'GITHUB_CONNECTION_REQUIRED'],
]) {
  test('접수 재확인의 읽기 잠금은 #323 생성 트랜잭션이 끝날 때까지 ' + label + ' 변경을 기다리게 한다', { timeout: 20000 }, async () => {
    const memberId = await member();
    const holder = db.createQueryRunner(), writer = db.createQueryRunner();
    let writing;
    try {
      await holder.connect(); await writer.connect();
      await holder.startTransaction('READ COMMITTED');
      assert.equal((await service.confirmForIntake(holder.manager, memberId, THEME)).repositoryId, THEME);
      const [{ pid: holderPid }] = await holder.query('SELECT pg_backend_pid() AS pid');
      await writer.startTransaction();
      await writer.query("SET LOCAL statement_timeout = '8000ms'");
      const [{ pid: writerPid }] = await writer.query('SELECT pg_backend_pid() AS pid');
      const state = { finished: false };
      writing = (async () => { await change(writer, memberId); await writer.commitTransaction(); })()
        .finally(() => { state.finished = true; });
      await assertWriterBlocked(holderPid, writerPid, state);
      await holder.commitTransaction();
      await writing;
      await assert.rejects(intake(memberId), apiError(rejected));
    } finally {
      await Promise.allSettled([writing]);
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await holder.release(); await writer.release();
    }
  });
}

test('worker 공급: 저장 동의 네 칸이 현재 선정·범위 정의와 같으면 카탈로그 좌표로 전체 선정을 준다', async () => {
  const memberId = await member();
  const accepted = context(memberId);
  const expected = { attemptId: accepted.attemptId, requestId: accepted.requestId, memberId, repositoryId: THEME,
    scopeRevision: SCOPE, repository: { owner: theme.owner, name: theme.name }, wholeRepository: true };
  assert.deepEqual(await source.resolve(db.manager, accepted, { lock: null }), expected);
  assert.deepEqual(await db.transaction('READ COMMITTED', manager =>
    source.resolve(manager, accepted, { lock: 'pessimistic_read' })), expected);
  // 자료 종류의 나열 순서는 의미가 아니다.
  const reordered = context(memberId, consent(THEME, { allowedResourceTypes: [...TYPES].reverse() }));
  assert.equal((await source.resolve(db.manager, reordered, { lock: null }))?.repositoryId, THEME);
  await assert.rejects(source.resolve(db.manager, accepted, { lock: 'pessimistic_read' }), /requires a transaction/);
});

test('worker 공급: 부분·알 수 없는 범위, 다른 판본·좌표, 철회, 실제 회원 아님은 null이다', async () => {
  const memberId = await member();
  await db.manager.insert(AllowedScopeRevision, { scopeRevision: 'catchu:allowed-scope:test-other:v1',
    allowedResourceTypes: [...TYPES], wholeRepository: true, collectionTerms: {} });
  const withoutReference = consent();
  delete withoutReference.selectionReference;
  const cases = {
    '정의되지 않은 칸': consent(THEME, { wholeRepository: true }),
    '선정 참조 없음': withoutReference,
    '부분 자료 종류': consent(THEME, { allowedResourceTypes: ['COMMIT'] }),
    '중복 자료 종류': consent(THEME, { allowedResourceTypes: ['COMMIT', 'COMMIT', 'ISSUE'] }),
    '모르는 자료 종류': consent(THEME, { allowedResourceTypes: ['COMMIT', 'PULL_REQUEST', 'TREE'] }),
    '다른 저장소의 좌표 판본': consent(THEME, { selectionReference: reference(ZOO) }),
    '현재가 아닌 좌표 판본': consent(THEME, { selectionReference: 'catchu:selected-repository:2026-10-20:570342307:v2' }),
    '현재가 아닌 범위 판본': consent(THEME, { revision: 'catchu:allowed-scope:test-other:v1' }),
    '정의되지 않은 범위 판본': consent(THEME, { revision: 'catchu:allowed-scope:undefined' }),
  };
  for (const [label, scope] of Object.entries(cases)) {
    assert.equal(await source.resolve(db.manager, context(memberId, scope), { lock: null }), null, label);
  }
  // 동의 칸과 시도·동의 행 값이 어긋난 맥락
  assert.equal(await source.resolve(db.manager, context(memberId, consent(), { scopeRevision: 'catchu:allowed-scope:test-other:v1' }), { lock: null }), null);
  assert.equal(await source.resolve(db.manager, context(memberId, consent(), { repositoryId: ZOO }), { lock: null }), null);
  const disabled = await member();
  await db.manager.update(MemberAccount, { memberId: disabled }, { accountState: 'DISABLED' });
  for (const other of [await member('catchu:dev-login:' + randomUUID()), await member('legacy:' + randomUUID()), disabled, randomUUID()]) {
    assert.equal(await source.resolve(db.manager, context(other), { lock: null }), null, other);
  }
  await db.manager.update(RepositorySelection, { repositoryId: THEME }, { active: false });
  assert.equal(await source.resolve(db.manager, context(memberId), { lock: null }), null, '제외');
  await db.manager.delete(RepositorySelection, { repositoryId: THEME });
  assert.equal(await source.resolve(db.manager, context(memberId), { lock: null }), null, '선정 행 없음');
  assert.equal((await source.resolve(db.manager, context(memberId, consent(ZOO)), { lock: null }))?.repositoryId, ZOO);
});

test('worker·접수 공급: 실제 DB 오류는 null이나 거부로 감추지 않고 예외로 전달한다', async () => {
  const memberId = await member();
  for (const run of [manager => source.resolve(manager, context(memberId), { lock: 'pessimistic_read' }),
    manager => source.resolve(manager, context(memberId), { lock: null }),
    manager => service.confirmForIntake(manager, memberId, THEME)]) {
    await assert.rejects(db.transaction('READ COMMITTED', async manager => {
      // 같은 트랜잭션을 실제 PostgreSQL 오류 상태로 만든 뒤 공급을 부른다.
      await manager.query('SELECT 1 FROM __synthetic_missing_table_252').catch(() => undefined);
      return run(manager);
    }), error => error?.code === '25P02');
  }
});
