const { randomUUID } = require('node:crypto');

const TEST_KEYS = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USER', 'TEST_DB_PASSWORD', 'TEST_DB_NAME'];

// npm test는 공통 실행기가 확정한 DB_*를 사용한다. B 전용 명령만 TEST_DB_*를 직접 받는다.
function readCatchTestDatabase(env = process.env) {
  if (env.CATCH_DB_TEST_REQUIRED !== '1') {
    require('reflect-metadata');
    const { readDatabaseConfig } = require('../../dist/database/database.config');
    const { assertTestDatabaseName } = require('./test-database.cjs');
    const config = readDatabaseConfig(env);
    assertTestDatabaseName(config.database);
    return { type: 'postgres', ...config, synchronize: false, logging: false, connectTimeoutMS: 5000 };
  }
  const missing = TEST_KEYS.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Catch DB 검사에 필요한 설정: ${missing.join(', ')}`);
  if (!env.TEST_DB_NAME.endsWith('_test')) throw new Error('TEST_DB_NAME은 _test로 끝나야 합니다.');
  const port = Number(env.TEST_DB_PORT);
  if (!/^\d+$/.test(env.TEST_DB_PORT) || port < 1 || port > 65535) {
    throw new Error('TEST_DB_PORT는 1~65535 사이의 정수여야 합니다.');
  }
  return {
    type: 'postgres', host: env.TEST_DB_HOST, port, username: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD, database: env.TEST_DB_NAME,
    synchronize: false, logging: false, connectTimeoutMS: 5000,
  };
}

function candidate(candidateId = 'synthetic-candidate-1', workIdentity = 'synthetic-work-1') {
  return {
    candidateId, workIdentity, title: '[합성] 오류 응답 처리',
    workFacts: ['[합성] 오류 응답을 구분했다.'], subjectContribution: '[합성] 응답 분기를 구현했다.',
    groupingBasis: '[합성] 동일 작업 키', groupingLimitations: ['[합성] 실제 동일성은 판정하지 않는다.'],
    eligibility: { workFactsVerified: true, contributionVerified: true, independentOfFailures: true },
    draft: { status: 'GENERATED', content: '[합성] 오류 응답 설명' },
    reflection: { status: 'GENERATED', questions: ['[합성] 무엇을 확인했나요?'] },
    evidence: [{
      evidenceId: 'synthetic-evidence-1', sourceUrl: 'https://example.invalid/pull/1',
      sourceRevision: 'synthetic-revision-1', representedFacts: ['[합성] 응답 변경'],
      contributionScope: '[합성] 응답 구현', coverageLimits: [],
    }],
  };
}

/** 실제 회원·분석 기반을 적용한다. E 수신 기록만 아직 구현되지 않은 명시적 SQL 시험 대역이다. */
async function createUpstreamTables(dataSource) {
  const { assertTestDatabaseName } = require('./test-database.cjs');
  const { DataSource } = require('typeorm');
  const { CreateMemberAnalysisFoundation1790500000000 } = require('../../dist/database/migrations/1790500000000-CreateMemberAnalysisFoundation');
  assertTestDatabaseName(dataSource.options.database);
  // 공통 npm test가 이어서 runMigrations해도 기반을 중복 생성하지 않도록 이력도 남긴다.
  const foundation = new DataSource({ ...dataSource.options, migrations: [CreateMemberAnalysisFoundation1790500000000] });
  try {
    await foundation.initialize();
    await foundation.runMigrations();
  } finally {
    if (foundation.isInitialized) await foundation.destroy();
  }
  await dataSource.query(`CREATE TABLE result_application_record (
    application_record_id uuid PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES analysis_request(request_id),
    attempt_id uuid NOT NULL UNIQUE REFERENCES analysis_attempt(attempt_id),
    result_id text NOT NULL, payload_fingerprint text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id, attempt_id, result_id)
  )`);
}

async function createCatchDbFixture(config) {
  require('reflect-metadata');
  const { DataSource } = require('typeorm');
  const schema = `b_registration_${randomUUID().replaceAll('-', '')}`;
  const control = new DataSource({ ...config, extra: { options: '-c TimeZone=UTC' } });
  let dataSource;
  let created = false;
  async function close() {
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } finally {
      if (control.isInitialized) {
        try {
          // 이 함수가 무작위로 만든 스키마만 지운다. DB 전체나 public은 변경하지 않는다.
          if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally { await control.destroy(); }
      }
    }
  }
  try {
    await control.initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const { CreateCatchAssets1790600000000 } = require('../../dist/database/migrations/1790600000000-CreateCatchAssets');
    const { CreateRepositoryProtection1790601000000 } = require('../../dist/database/migrations/1790601000000-CreateRepositoryProtection');
    const { CatchAssetEntity } = require('../../dist/catches/entities/catch-asset.entity');
    const { CatchEvidenceEntity } = require('../../dist/catches/entities/catch-evidence.entity');
    const { CandidateRegistrationEntity } = require('../../dist/catches/entities/candidate-registration.entity');
    const { RepositoryProtectionEntity } = require('../../dist/catches/entities/repository-protection.entity');
    const { MemberAccount, MemberProfile, GitHubConnection, AnalysisRequest, AnalysisConsent,
      AnalysisAttempt, IdempotencyRecord } = require('../../dist/member-analysis/member-analysis.entity');
    const { SnakeNamingStrategy } = require('../../dist/database/snake-naming.strategy');
    dataSource = new DataSource({
      ...config, schema, namingStrategy: new SnakeNamingStrategy(),
      entities: [MemberAccount, MemberProfile, GitHubConnection, AnalysisRequest, AnalysisConsent,
        AnalysisAttempt, IdempotencyRecord, CatchAssetEntity, CatchEvidenceEntity,
        CandidateRegistrationEntity, RepositoryProtectionEntity],
      // 되돌리기 검사는 B 마이그레이션만 취소하여 실제 선행 테이블의 보존을 확인한다.
      migrations: [CreateCatchAssets1790600000000, CreateRepositoryProtection1790601000000],
      extra: { options: `-c TimeZone=UTC -c search_path=${schema}` },
    });
    await dataSource.initialize();
    await createUpstreamTables(dataSource);
    await dataSource.runMigrations();
    return {
      dataSource, schema, close,
      async reset() {
        const { resetTestDatabase } = require('./test-database.cjs');
        await resetTestDatabase(dataSource);
      },
      async receipt(overrides = {}, { repositoryId = 'synthetic-repository', protection = 'NONE' } = {}) {
        const input = {
          applicationRecordId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID(),
          resultId: `synthetic-result-${randomUUID()}`, ownerId: randomUUID(),
          sourceMode: 'MOCK', candidates: [candidate()], ...overrides,
        };
        await dataSource.transaction('READ COMMITTED', async (manager) => {
          const consentId = randomUUID();
          const now = new Date('2026-10-01T00:00:00Z');
          await manager.query(`INSERT INTO member_account(member_id, identity_reference, account_state)
            VALUES ($1, $2, 'ACTIVE') ON CONFLICT (member_id) DO NOTHING`,
          [input.ownerId, `synthetic:catch-db-fixture:${input.ownerId.toLowerCase()}`]);
          // worker 공용 합성 자료가 지정한 ID를 보존하고 순환 FK 세 행을 같은 트랜잭션에 준비한다.
          // 이전 ACTIVE 요청은 자동으로 종료하지 않는다. 후속 요청 시험이 종료를 명시해야 한다.
          await manager.insert(AnalysisRequest, {
            requestId: input.requestId, memberId: input.ownerId, repositoryId, consentId,
            currentAttemptId: input.attemptId, submittedAt: now, updatedAt: now,
          });
          await manager.insert(AnalysisConsent, {
            consentId, requestId: input.requestId, memberId: input.ownerId, repositoryId,
            accepted: true, noticeRevision: 'synthetic-notice', scopeRevision: 'synthetic-scope',
            consentedScope: { synthetic: true }, consentedAt: now,
          });
          await manager.insert(AnalysisAttempt, {
            attemptId: input.attemptId, requestId: input.requestId, sourceMode: input.sourceMode,
            processing: 'SUCCEEDED', application: 'PENDING', eligibleCandidateCount: input.candidates.length,
          });
          await manager.query(`INSERT INTO result_application_record
            (application_record_id, request_id, attempt_id, result_id, payload_fingerprint) VALUES ($1,$2,$3,$4,$5)`,
          [input.applicationRecordId, input.requestId, input.attemptId, input.resultId, 'synthetic-fingerprint']);
          // 정상 시험을 위한 명시적인 합성 관측이다. 제품이 누락된 판단을 NONE으로 채우는 동작이 아니다.
          // 보호 부재 시험은 protection: null로 이 준비 자체를 생략한다.
          if (protection !== null) {
            await manager.query(`INSERT INTO repository_protection
              (protection_id, owner_id, repository_id, applied_restriction,
               confirmed_source_state, observation_provenance, observed_at)
              VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
              ON CONFLICT (owner_id, repository_id) DO NOTHING`,
            [randomUUID(), input.ownerId, repositoryId, protection,
              JSON.stringify({ synthetic: true, visibility: protection === 'SOURCE_PRIVATE' ? 'PRIVATE' : 'PUBLIC' }),
              JSON.stringify({ fixture: 'catch-db-fixture', synthetic: true }), '2026-10-01T00:00:00Z']);
          }
        });
        return input;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { candidate, readCatchTestDatabase, createCatchDbFixture, createUpstreamTables };
