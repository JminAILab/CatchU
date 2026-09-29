const { randomUUID } = require('node:crypto');

const TEST_KEYS = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USER', 'TEST_DB_PASSWORD', 'TEST_DB_NAME'];

// 일반 검사에서 DB 설정이 전혀 없으면 건너뛴다. 명시 실행/부분 설정은 조용히 건너뛰지 않는다.
function readCatchTestDatabase(env = process.env) {
  if (env.CATCH_DB_TEST_REQUIRED !== '1' && TEST_KEYS.every((key) => env[key] === undefined)) return undefined;
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

/** A/E 구현의 대체물이 아닌 B의 FK·맥락 검사를 위한 최소 합성 스키마다. */
async function createUpstreamTables(dataSource) {
  await dataSource.query(`CREATE TABLE member_account (
    member_id uuid PRIMARY KEY, account_state varchar NOT NULL DEFAULT 'ACTIVE'
  )`);
  await dataSource.query(`CREATE TABLE analysis_request (
    request_id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member_account(member_id),
    repository_id text NOT NULL, current_attempt_id uuid NOT NULL,
    lifecycle varchar NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle IN ('ACTIVE', 'CLOSED'))
  )`);
  await dataSource.query(`CREATE TABLE analysis_attempt (
    attempt_id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES analysis_request(request_id),
    source_mode varchar NOT NULL CHECK (source_mode IN ('MOCK', 'LIVE')),
    processing varchar NOT NULL DEFAULT 'SUCCEEDED',
    application varchar NOT NULL DEFAULT 'PENDING'
      CHECK (application IN ('NOT_READY', 'PENDING', 'APPLYING', 'RECOVERING', 'APPLIED', 'APPLY_FAILED')),
    owner_results_ready boolean NOT NULL DEFAULT false, eligible_candidate_count integer NOT NULL DEFAULT 1
  )`);
  await dataSource.query(`ALTER TABLE analysis_request ADD CONSTRAINT fixture_current_attempt
    FOREIGN KEY (current_attempt_id) REFERENCES analysis_attempt(attempt_id) DEFERRABLE INITIALLY DEFERRED`);
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
    dataSource = new DataSource({
      ...config, schema, entities: [CatchAssetEntity, CatchEvidenceEntity, CandidateRegistrationEntity, RepositoryProtectionEntity],
      migrations: [CreateCatchAssets1790600000000, CreateRepositoryProtection1790601000000],
      extra: { options: `-c TimeZone=UTC -c search_path=${schema}` },
    });
    await dataSource.initialize();
    await createUpstreamTables(dataSource);
    await dataSource.runMigrations();
    return {
      dataSource, schema, close,
      async reset() {
        await dataSource.query(`TRUNCATE candidate_registration, catch_evidence, catch_asset,
          repository_protection, result_application_record, analysis_attempt, analysis_request, member_account CASCADE`);
      },
      async receipt(overrides = {}, { repositoryId = 'synthetic-repository', protection = 'NONE' } = {}) {
        const input = {
          applicationRecordId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID(),
          resultId: `synthetic-result-${randomUUID()}`, ownerId: randomUUID(),
          sourceMode: 'MOCK', candidates: [candidate()], ...overrides,
        };
        await dataSource.transaction(async (manager) => {
          await manager.query('INSERT INTO member_account(member_id) VALUES ($1) ON CONFLICT DO NOTHING', [input.ownerId]);
          await manager.query(`INSERT INTO analysis_request(request_id, member_id, repository_id, current_attempt_id)
            VALUES ($1, $2, $3, $4)`, [input.requestId, input.ownerId, repositoryId, input.attemptId]);
          await manager.query(`INSERT INTO analysis_attempt(attempt_id, request_id, source_mode)
            VALUES ($1, $2, $3)`, [input.attemptId, input.requestId, input.sourceMode]);
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

module.exports = { candidate, readCatchTestDatabase, createCatchDbFixture };
