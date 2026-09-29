const { join } = require('node:path');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');

const CONTRACT_DIR = join(__dirname, '../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design');
const validator = new WorkerMessageValidator(CONTRACT_DIR);

function context(overrides = {}) {
  return {
    requestId: 'test-request', attemptId: 'test-attempt', memberId: 'test-member',
    repositoryId: 'test-repository', consentId: 'test-consent', scopeRevision: 'scope-1', sourceMode: 'MOCK',
    ...overrides,
  };
}

function candidate() {
  return {
    candidateId: 'candidate-1', title: '합성 후보', workIdentity: 'work-1', workFacts: ['합성 작업'],
    subjectContribution: '합성 본인 기여', groupingBasis: '합성 작업 묶음', groupingLimitations: [],
    eligibility: { workFactsVerified: true, contributionVerified: true, independentOfFailures: true },
    evidence: [{ evidenceId: 'evidence-1', sourceUrl: 'https://example.invalid/commit/1', sourceRevision: 'revision-1',
      representedFacts: ['합성 작업'], contributionScope: '합성 기여', coverageLimits: [] }],
    draft: { status: 'GENERATED', content: '합성 설명' },
    reflection: { status: 'NOT_GENERATED', questions: [] },
  };
}

function result(overrides = {}) {
  return {
    ...context(), schemaVersion: '1', messageId: 'result-message', resultId: 'test-result',
    outcome: 'SUCCEEDED', candidates: [candidate()], notProvided: [], failures: [],
    finishedAt: '2026-09-29T01:00:00Z', ...overrides,
  };
}

function event(overrides = {}) {
  return {
    schemaVersion: '1', messageId: 'event-message', requestId: 'test-request', attemptId: 'test-attempt',
    state: 'RUNNING', observedAt: '2026-09-29T00:59:00Z', ...overrides,
  };
}

// 테스트 대역만 제공한다. 요청 단위 직렬화와 commit/rollback 경계를 재현하지만 실제 DB 검증은 아니다.
class MemoryReceiverStore {
  constructor(acceptedContext = context()) {
    this.state = { context: acceptedContext, processing: 'QUEUED', application: 'NOT_READY', received: null,
      lifecycle: 'ACTIVE', ownerResultsReady: false, registeredCatchIds: [], eligibleCandidateCount: 0, observations: [] };
    this.tail = Promise.resolve();
    this.failSave = false;
    this.failCommit = false;
    this.commits = 0;
    this.savedResults = 0;
    this.savedObservations = 0;
  }

  async withRequest(requestId, work) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    const draft = structuredClone(this.state);
    let results = 0;
    let observations = 0;
    try {
      const found = draft && draft.context.requestId === requestId;
      const response = await work({
        snapshot: found ? structuredClone(draft) : null,
        saveObservation: async (event, processing) => {
          if (this.failSave) throw new Error('synthetic-sensitive-storage-error');
          draft.observations.push(event);
          draft.processing = processing;
          observations++;
        },
        saveResult: async (metadata, state) => {
          if (this.failSave) throw new Error('synthetic-sensitive-storage-error');
          draft.received = metadata;
          Object.assign(draft, state);
          results++;
        },
      });
      if (this.beforeCommit) await this.beforeCommit();
      if (this.failCommit) throw new Error('synthetic-sensitive-commit-error');
      this.state = draft;
      this.savedResults += results;
      this.savedObservations += observations;
      this.commits++;
      return response;
    } finally { release(); }
  }
}

function harness(acceptedContext) {
  const store = new MemoryReceiverStore(acceptedContext);
  const logs = [];
  const receiver = new AnalysisReceiver(store, validator, { record: (kind, code) => logs.push({ kind, code }) });
  return { store, receiver, logs };
}

module.exports = { CONTRACT_DIR, MemoryReceiverStore, candidate, context, event, result, harness, validator };
