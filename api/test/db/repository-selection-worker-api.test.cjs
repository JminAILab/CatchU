require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { setTimeout: delay } = require('node:timers/promises');
const { before, after, beforeEach, test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { WorkerContextModule } = require('../../dist/worker-context/worker-context.module');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { insertInitialAnalysis } = require('../support/registered-analysis.cjs');
const { REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { AllowedScopeRevision } = require('../../dist/member-repositories/repository-selection.entity');
const { RepositorySelectionService, DatabaseRepositorySelectionSource } =
  require('../../dist/member-repositories/repository-selection.source');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// 실제 공급 검사: WorkerContextModule에 실제 DatabaseRepositorySelectionSource를 등록하고 실제 HTTP·PostgreSQL·#231 보관소로
// 실행 조회를 부른다. 시험 대역은 GitHub OAuth·사용자 조회 응답과, 경쟁 시점을 만들려고 실제 공급 호출 앞뒤에 둔 멈춤 지점뿐이다.
// 동의는 실제 회원의 접수 재확인 결과로 만든다. #323 접수 API·큐·worker 실행·GitHub API는 부르지 않는다.
const THEME = '570342307', ZOO = '547322698';
const SCOPE = 'catchu:allowed-scope:2026-10-19:v1';
const TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const FAKE_TOKEN = 'SYNTHETIC_SELECTION_WORKER_TOKEN';
const versions = new SelectedRepositoryCatalog().listCurrent();
const themeVersion = versions.find(version => version.repositoryId === THEME);
const zooVersion = versions.find(version => version.repositoryId === ZOO);
// 이름이 바뀌었다고 가정한 새 좌표 판본. 기존 판본은 그대로 둔다.
const renamed = { ...themeVersion, name: 'renamed-fixture',
  url: 'https://github.com/ljm0850/renamed-fixture', selectionReference: 'catchu:selected-repository:test-renamed:570342307:v2' };
const catalog = new SelectedRepositoryCatalog([...versions, renamed], versions.map(version => version.selectionReference));
const realSource = new DatabaseRepositorySelectionSource(catalog);
const lockOptions = [];
let pause = null;
const selectionSource = { resolve: async (manager, context, options) => {
  lockOptions.push(options.lock);
  const run = () => realSource.resolve(manager, context, options);
  return pause ? pause(manager, options, run) : run();
} };
class TestModule {}
Module({ imports: [AppModule, WorkerContextModule.register({ selectionSource })] })(TestModule);

let app, db, url, directory, github, client, initial, selections, identityCalls = 0;
const saved = {}, settings = {}, logs = [];
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-252-worker-vault-test-'));
  Object.assign(settings, { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', AUTH_WEB_ORIGIN: 'http://localhost:3000', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: randomBytes(32).toString('hex'),
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client', GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback',
    GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  for (const [k, v] of Object.entries(settings)) { saved[k] = process.env[k]; process.env[k] = v; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  db = await openTestDataSource();
  initial = await readInitialSelection(db);
  github = app.get(GitHubConnectionService); client = app.get(GitHubClient);
  // 접수 재확인도 worker 공급과 같은 카탈로그를 쓴다.
  selections = new RepositorySelectionService(db, catalog);
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  // mkdtemp에서 받은 이 테스트 전용 경로만 정리한다.
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db); await restoreInitialSelection(db, initial);
  logs.length = 0; lockOptions.length = 0; pause = null; identityCalls = 0;
  github.authorizations.clear();
});

async function connectedMember(identityReference = 'catchu:google:' + randomUUID()) {
  const memberId = randomUUID();
  await db.manager.insert(MemberAccount, { memberId, identityReference, accountState: 'ACTIVE' });
  client.exchange = async () => ({ accountLogin: 'real-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000) });
  client.identity = async () => { identityCalls++; return { accountLogin: 'real-user', externalAccountReference: '9007199254740993' }; };
  const authorization = await github.authorize(memberId);
  await github.connect(memberId, 'SYNTHETIC_CODE', authorization.state);
  return memberId;
}
// #323이 할 접수와 같은 순서: 생성 트랜잭션에서 재확인한 동의 네 칸을 그대로 저장한다.
const analysis = (memberId, repositoryId = THEME, adjust = scope => scope) => db.transaction('READ COMMITTED', async manager => {
  const selection = await selections.confirmForIntake(manager, memberId, repositoryId);
  return insertInitialAnalysis(manager, { memberId, repositoryId, noticeRevision: REAL_NOTICE.noticeRevision,
    scopeRevision: selection.scopeRevision, consentedScope: adjust(selection.consentedScope), sourceMode: 'LIVE' });
});
async function context(attemptId) {
  const response = await fetch(url + '/v1/internal/analysis-attempts/' + attemptId + '/context', {
    headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY }, signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = { status: response.status, body: await response.json() };
  for (const secret of [settings.WORKER_CONTEXT_API_KEY, settings.GITHUB_CREDENTIAL_ENCRYPTION_KEY, FAKE_TOKEN]) {
    assert.equal(logs.join(' ').includes(secret), false);
  }
  if (result.status !== 200) assert.equal(JSON.stringify(result.body).includes(FAKE_TOKEN), false);
  return result;
}
const unavailable = (result, reason) => {
  assert.equal(result.status, 404, JSON.stringify(result.body));
  assert.equal(result.body.code, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(result.body.details, { violations: [{ field: 'attemptId', reason }] });
};
async function within(promise, label, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' 대기 시간 초과')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function assertWriterBlocked(holderPid, writerPid, state) {
  const deadline = Date.now() + 3000;
  do {
    assert.equal(state.finished, false, '선정 변경이 최종 확인 트랜잭션보다 먼저 끝나면 안 된다');
    const [row] = await db.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [holderPid, writerPid]);
    if (row.blocked) return;
    // 고정 지연으로 잠금을 추정하지 않고 실제 차단 PID가 관찰될 때까지 제한 시간 안에서 조회한다.
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail('선정 변경이 최종 선정 확인의 PostgreSQL 연결에 차단되지 않았다');
}
const CHANGES = {
  '선정 제외': manager => manager.query('UPDATE repository_selection SET active = false WHERE repository_id = $1', [THEME]),
  '범위 판본 변경': async manager => {
    await manager.insert(AllowedScopeRevision, { ...structuredClone(initial.scopes[0]), scopeRevision: 'catchu:allowed-scope:test-next:v2' });
    await manager.query('UPDATE repository_selection SET scope_revision = $2 WHERE repository_id = $1', [THEME, 'catchu:allowed-scope:test-next:v2']);
  },
  '새 좌표 판본': manager => manager.query('UPDATE repository_selection SET selection_reference = $2 WHERE repository_id = $1',
    [THEME, renamed.selectionReference]),
};

test('접수 재확인으로 저장한 동의의 LIVE 시도는 실제 선정 공급으로 카탈로그 좌표와 전체 선정을 받는다', async () => {
  for (const [repositoryId, name] of [[THEME, 'TheMe'], [ZOO, 'BEASTA-ZOO']]) {
    const memberId = await connectedMember();
    const r = await analysis(memberId, repositoryId);
    lockOptions.length = 0;
    const result = await context(r.currentAttemptId);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(result.body.credential.repository, { owner: 'ljm0850', name });
    assert.deepEqual(result.body.selection, { repositoryId, wholeRepository: true });
    assert.deepEqual(result.body.allowedResourceTypes, TYPES);
    assert.equal(result.body.credential.scopeRevision, SCOPE);
    assert.equal(result.body.credential.accessToken, FAKE_TOKEN);
    assert.deepEqual(lockOptions, [null, 'pessimistic_read'], '자격정보 조회 전 예비 확인과 최종 잠금 확인');
  }
});

test('개발 회원의 LIVE 시도·부분 자료 동의·다른 좌표 판본 동의·제외된 선정은 자격정보 조회 없이 SCOPE_UNVERIFIED', async () => {
  const developer = await connectedMember('catchu:dev-login:' + randomUUID());
  // 개발 회원 LIVE 시도는 접수가 만들지 않는 기록이다. 같은 동의 네 칸을 직접 저장해 공급의 회원 판정만 본다.
  const cases = [await db.transaction('READ COMMITTED', manager => insertInitialAnalysis(manager, { memberId: developer,
    repositoryId: THEME, noticeRevision: REAL_NOTICE.noticeRevision, scopeRevision: SCOPE, sourceMode: 'LIVE',
    consentedScope: { revision: SCOPE, repositoryId: THEME, allowedResourceTypes: TYPES, selectionReference: themeVersion.selectionReference } })),
  await analysis(await connectedMember(), THEME, scope => ({ ...scope, allowedResourceTypes: ['COMMIT'] })),
  await analysis(await connectedMember(), THEME, scope => ({ ...scope, selectionReference: zooVersion.selectionReference }))];
  for (const r of cases) unavailable(await context(r.currentAttemptId), 'SCOPE_UNVERIFIED');
  const excluded = await analysis(await connectedMember(), THEME);
  await CHANGES['선정 제외'](db.manager);
  unavailable(await context(excluded.currentAttemptId), 'SCOPE_UNVERIFIED');
  assert.equal(identityCalls, 0, '예비 선정 확인에서 막혀 GitHub 자격정보 조회를 하지 않는다');
});

for (const [label, change] of Object.entries(CHANGES)) {
  test('최종 선정 확인 전에 커밋된 변경(' + label + ')은 토큰 없이 SCOPE_UNVERIFIED로 거부한다', { timeout: 20000 }, async () => {
    const r = await analysis(await connectedMember());
    const finalSelection = Promise.withResolvers(), resumeSelection = Promise.withResolvers();
    pause = async (_manager, options, run) => {
      if (options.lock) {
        finalSelection.resolve();
        await within(resumeSelection.promise, '최종 선정 확인 재개');
      }
      return run();
    };
    lockOptions.length = 0;
    const pending = context(r.currentAttemptId);
    const settled = Promise.allSettled([pending]);
    try {
      await within(finalSelection.promise, '최종 선정 확인 진입');
      // 자격정보 확인은 끝났고, 최종 트랜잭션이 선정 근거를 읽기 전에 별도 트랜잭션의 변경이 커밋된다.
      await db.transaction(manager => change(manager));
      resumeSelection.resolve();
      unavailable(await pending, 'SCOPE_UNVERIFIED');
      assert.deepEqual(lockOptions, [null, 'pessimistic_read']);
    } finally {
      resumeSelection.resolve();
      await settled;
    }
  });
}

for (const label of ['선정 제외', '범위 판본 변경', '새 좌표 판본']) {
  test('최종 선정 잠금 뒤의 변경(' + label + ')은 응답 구성 트랜잭션이 끝날 때까지 기다린다', { timeout: 20000 }, async t => {
    const r = await analysis(await connectedMember());
    const selectionRead = Promise.withResolvers(), resumeSelection = Promise.withResolvers();
    const beforeCommit = Promise.withResolvers(), resumeCommit = Promise.withResolvers();
    const writerState = { finished: false };
    let finalRunner, selectionPid, pending, pendingSettled, writing, writingSettled;
    const writer = db.createQueryRunner();
    pause = async (manager, options, run) => {
      const selected = await run();
      if (options.lock) {
        finalRunner = manager.queryRunner;
        assert.equal(finalRunner?.isTransactionActive, true);
        [{ pid: selectionPid }] = await manager.query('SELECT pg_backend_pid() AS pid');
        const commit = finalRunner.commitTransaction.bind(finalRunner);
        t.mock.method(finalRunner, 'commitTransaction', async () => {
          // TypeORM은 서비스의 응답 객체 구성 callback이 끝난 다음 여기로 들어온다.
          beforeCommit.resolve();
          await within(resumeCommit.promise, '응답 구성 후 커밋 재개');
          await commit();
        });
        selectionRead.resolve();
        await within(resumeSelection.promise, '잠긴 선정 반환 재개');
      }
      return selected;
    };
    try {
      await writer.connect(); await writer.startTransaction();
      await writer.query("SET LOCAL statement_timeout = '8000ms'");
      const [{ pid: writerPid }] = await writer.query('SELECT pg_backend_pid() AS pid');
      lockOptions.length = 0;
      pending = context(r.currentAttemptId);
      pendingSettled = Promise.allSettled([pending]);
      await within(selectionRead.promise, '최종 선정 읽기 잠금');
      assert.notEqual(writerPid, selectionPid);
      writing = (async () => { await CHANGES[label](writer.manager); await writer.commitTransaction(); })();
      writingSettled = writing.then(() => { writerState.finished = true; }, () => { writerState.finished = true; });
      await assertWriterBlocked(selectionPid, writerPid, writerState);
      resumeSelection.resolve();
      await within(beforeCommit.promise, '응답 객체 구성 완료');
      assert.equal(finalRunner.isTransactionActive, true);
      await assertWriterBlocked(selectionPid, writerPid, writerState);
      resumeCommit.resolve();
      const result = await pending;
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body.credential.repository, { owner: 'ljm0850', name: 'TheMe' });
      assert.deepEqual(lockOptions, [null, 'pessimistic_read']);
      await within(writing, '선정 변경 커밋');
      unavailable(await context(r.currentAttemptId), 'SCOPE_UNVERIFIED');
    } finally {
      resumeSelection.resolve(); resumeCommit.resolve();
      await Promise.allSettled([pendingSettled, writingSettled]);
      try { if (writer.isTransactionActive) await writer.rollbackTransaction(); }
      finally { await writer.release(); }
    }
  });
}
