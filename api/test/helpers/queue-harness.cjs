// 큐 연결(#233) 시험 도우미. 테스트 전용이며 운영 코드에서 쓰지 않는다.
// 접수 기록은 처음부터 원하는 값으로 직접 넣는다(동의 행은 마이그레이션 트리거로 고칠 수 없다).
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { CONTRACT_DIR } = require('./receiver-harness.cjs');
const { ensureRegistration } = require('../support/registered-analysis.cjs');

const FIXTURES = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');

const RESOURCE_TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const REPOSITORY_ID = 'synthetic-repo-0001';
const SCOPE_REVISION = '00000000-0000-4000-8000-000000000201';

/** 회원·요청·동의·시도를 한 트랜잭션에 넣는다. 기본값은 정상 대기(ACTIVE/QUEUED/NOT_READY) MOCK 시도다. */
async function insertAttempt(db, overrides = {}) {
  const now = new Date();
  const row = {
    requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId: randomUUID(),
    repositoryId: REPOSITORY_ID, scopeRevision: SCOPE_REVISION, noticeRevision: 'catchu-synthetic-analysis-notice-v1',
    submittedAt: now, consentedAt: now, sourceMode: 'MOCK', processing: 'QUEUED', application: 'NOT_READY', lifecycle: 'ACTIVE',
    ...overrides,
  };
  row.consentedScope = overrides.consentedScope ?? { revision: row.scopeRevision, repositoryId: row.repositoryId,
    allowedResourceTypes: [...RESOURCE_TYPES], selectionReference: 'catchu:synthetic-selection:v1' };
  await db.transaction(async manager => {
    await manager.query("INSERT INTO member_account (member_id, identity_reference, account_state) VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING",
      [row.memberId, 'queue-fixture:' + row.memberId]);
    row.registrationId = await ensureRegistration(manager, row);
    if (row.sourceMode === 'LIVE' && Object.keys(row.consentedScope).every(key =>
      ['revision', 'repositoryId', 'allowedResourceTypes', 'selectionReference'].includes(key))) {
      const version = new (require('../../dist/member-repositories/selected-repository-catalog').SelectedRepositoryCatalog)()
        .resolve(row.consentedScope.selectionReference);
      const repository = version ? { owner: version.owner, name: version.name, url: version.url }
        : { owner: 'synthetic-owner', name: 'synthetic-repo', url: 'https://github.com/synthetic-owner/synthetic-repo' };
      row.consentedScope = { ...row.consentedScope, registrationId: row.registrationId,
        selectionReference: row.registrationId, repository };
    }
    await manager.query(`INSERT INTO analysis_request (request_id, member_id, repository_id, consent_id, current_attempt_id,
      submitted_at, updated_at, lifecycle, registration_id) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)`,
    [row.requestId, row.memberId, row.repositoryId, row.consentId, row.attemptId, row.submittedAt, row.lifecycle, row.registrationId]);
    await manager.query(`INSERT INTO analysis_consent (consent_id, request_id, member_id, repository_id, accepted, notice_revision,
      scope_revision, consented_scope, consented_at) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8)`,
    [row.consentId, row.requestId, row.memberId, row.repositoryId, row.noticeRevision, row.scopeRevision, row.consentedScope, row.consentedAt]);
    await manager.query(`INSERT INTO analysis_attempt (attempt_id, request_id, processing, application, source_mode)
      VALUES ($1,$2,$3,$4,$5)`, [row.attemptId, row.requestId, row.processing, row.application, row.sourceMode]);
  });
  return row;
}

function fill(value, context) {
  if (Array.isArray(value)) return value.map(entry => fill(entry, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fill(entry, context)]));
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(context, key)) throw new Error('Unknown fixture placeholder');
    return context[key];
  }) : value;
}

/** worker가 보내는 형식의 결과(#103 합성 세트). 메시지 ID message-mock-<시도>-result, 결과 ID result-mock-<시도>. */
function workerResult(row, file = 'succeeded-one-candidate') {
  const template = JSON.parse(readFileSync(resolve(FIXTURES, `results/${file}.json`), 'utf8'));
  return fill(template, { ...row, caseId: row.sourceMode === 'LIVE' ? 'live' : 'mock' });
}

/** worker가 보내는 형식의 진행 알림. 메시지 ID event-mock-<시도>-<상태>. */
function workerEvent(row, state) {
  return { schemaVersion: '2', messageId: `event-${row.sourceMode === 'LIVE' ? 'live' : 'mock'}-${row.attemptId}-${state.toLowerCase()}`,
    requestId: row.requestId, attemptId: row.attemptId, state, observedAt: new Date().toISOString() };
}

/** 필수 공급 경계의 시험 대역. 실제 GitHub 관측·#105 정책 공급자가 아니다. */
function observation(context) {
  return { ownerId: context.memberId, repositoryId: context.repositoryId,
    githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' },
    confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
    observationProvenance: { synthetic: true, provider: 'test' },
    observedAt: new Date(), appliedRestriction: 'NONE' };
}

/** 보내기 시험용 메모리 요청 큐. BullMQ처럼 같은 작업 ID의 두 번째 add를 무시한다. */
class MemoryRequestQueue {
  constructor() {
    this.jobs = new Map();
    this.calls = [];
    this.isReady = true;
    this.next = null; // 다음 명령 하나의 동작: { hang: true } | { error }
  }
  ready() { return this.isReady; }
  async run(kind, id, work) {
    this.calls.push([kind, id]);
    const next = this.next;
    this.next = null;
    if (next?.hang) return new Promise(resolve => { this.release = () => resolve(work()); });
    if (next?.error) throw next.error;
    return work();
  }
  getJob(id) { return this.run('getJob', id, () => this.jobs.get(id)); }
  add(name, data, options) {
    return this.run('add', options.jobId, () => {
      if (!this.jobs.has(options.jobId)) this.jobs.set(options.jobId, structuredClone({ name, data, options }));
      return this.jobs.get(options.jobId);
    });
  }
}

/** 보내기 기록을 모은다. */
function dispatchLog() {
  const entries = [];
  return {
    entries,
    enqueued: (requestId, attemptId) => entries.push({ event: 'ENQUEUED', requestId, attemptId }),
    skipped: (requestId, attemptId, code) => entries.push({ event: 'SKIPPED', requestId, attemptId, code }),
    paused: (reason, error) => entries.push({ event: 'PAUSED', reason, ...(error ? { error } : {}) }),
    resumed: () => entries.push({ event: 'RESUMED' }),
  };
}

/** AppModule을 띄우는 시험의 필수 설정. 실행마다 무작위 키를 쓴다. 시험이 끝나면 되돌린다. */
function useAppSettings(t, extra = {}) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'), ...extra };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

/** Nest 로그를 문자열로 모은다. */
function captureLogger() {
  const lines = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => lines.push(`${level} ${args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')}`)]));
  return { lines, logger };
}

async function waitFor(check, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('시간 안에 일어나지 않음: ' + label);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

module.exports = {
  CONTRACT_DIR, FIXTURES, REPOSITORY_ID, RESOURCE_TYPES, SCOPE_REVISION, MemoryRequestQueue, captureLogger, dispatchLog,
  insertAttempt, observation, useAppSettings, waitFor, workerEvent, workerResult,
};
