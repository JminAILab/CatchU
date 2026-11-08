require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { SnakeNamingStrategy } = require('../../dist/database/snake-naming.strategy');
const { MemberAccount, AnalysisRequest, AnalysisConsent, AnalysisAttempt } =
  require('../../dist/member-analysis/member-analysis.entity');
const { CatchAssetEntity } = require('../../dist/catches/entities/catch-asset.entity');
const { RepositoryProtectionEntity } = require('../../dist/catches/entities/repository-protection.entity');
const { CandidateRegistrationEntity } = require('../../dist/catches/entities/candidate-registration.entity');
const { ResultApplicationRecord } = require('../../dist/result-application/result-application.entity');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { CreateCatchAssets1790600000000 } = require('../../dist/database/migrations/1790600000000-CreateCatchAssets');
const { CreateRepositoryProtection1790601000000 } =
  require('../../dist/database/migrations/1790601000000-CreateRepositoryProtection');
const { CascadeCatchAssetsOnDelete1792817978014 } =
  require('../../dist/database/migrations/1792817978014-CascadeCatchAssetsOnDelete');

test('B의 외부 FK 메타데이터가 실제 A/E 엔티티와 마이그레이션의 참조·이름·옵션과 같다', async (t) => {
  // DB 접속·DDL 실행 없이 실제 엔티티의 참조를 해석하고 기존 up SQL과 대조한다.
  const dataSource = new DataSource({
    type: 'postgres', database: 'catch_metadata_test', synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [MemberAccount, AnalysisRequest, AnalysisConsent, AnalysisAttempt, CatchAssetEntity,
      RepositoryProtectionEntity, CandidateRegistrationEntity, ResultApplicationRecord, RepositoryRegistration],
  });
  await dataSource.buildMetadatas();
  const statements = [];
  const runner = { async query(sql) { statements.push(sql); } };
  await new CreateCatchAssets1790600000000().up(runner);
  await new CreateRepositoryProtection1790601000000().up(runner);
  await new CascadeCatchAssetsOnDelete1792817978014().up(runner);

  const cases = [
    { entity: CatchAssetEntity, target: MemberAccount, name: 'fk_catch_asset_owner_id', column: 'owner_id', referenced: 'member_id' },
    { entity: CatchAssetEntity, target: AnalysisRequest, name: 'fk_catch_asset_source_request_id', column: 'source_request_id', referenced: 'request_id' },
    { entity: RepositoryProtectionEntity, target: MemberAccount, name: 'fk_repository_protection_owner_id', column: 'owner_id', referenced: 'member_id' },
    { entity: CandidateRegistrationEntity, target: ResultApplicationRecord, name: 'fk_candidate_registration_application_record_id', column: 'application_record_id', referenced: 'application_record_id' },
  ];
  for (const { entity, target, name, column, referenced } of cases) {
    await t.test(name, () => {
      const metadata = dataSource.getMetadata(entity);
      const matching = metadata.foreignKeys.filter(fk => fk.name === name);
      assert.equal(matching.length, 1, '기존 SQL과 같은 이름의 외부 FK가 하나만 있어야 한다');
      const [fk] = matching;
      assert.equal(fk.referencedEntityMetadata.target, target, '시험용 사본이 아닌 실제 A/E 엔티티를 참조한다');
      assert.deepEqual(fk.columnNames, [column]);
      assert.deepEqual(fk.referencedColumnNames, [referenced]);
      assert.equal(fk.onDelete, 'CASCADE', '회원 탈퇴 때 부모를 따라 지운다(#387)');
      assert.equal(fk.onUpdate, 'NO ACTION');
      assert.equal(fk.deferrable, undefined);

      const tableSql = statements.find(sql => sql.startsWith(`CREATE TABLE "${metadata.tableName}"`));
      assert.ok(tableSql, '기존 마이그레이션이 해당 B 테이블을 생성한다');
      const constraint = tableSql.split('\n').map(line => line.trim()).find(line => line.startsWith(`CONSTRAINT "${name}"`));
      assert.equal(constraint?.replace(/,$/, ''),
        `CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${fk.referencedTablePath}"("${referenced}")`,
        '병합된 마이그레이션의 FK 생성문은 고치지 않는다');
      assert.ok(statements.includes(`ALTER TABLE "${metadata.tableName}" DROP CONSTRAINT "${name}"`));
      assert.ok(statements.includes(`ALTER TABLE "${metadata.tableName}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") ` +
        `REFERENCES "${fk.referencedTablePath}"("${referenced}") ON DELETE CASCADE ON UPDATE NO ACTION`),
        '새 마이그레이션이 같은 이름·참조·즉시 제약으로 삭제 규칙만 바꾼다');
    });
  }
});

test('CR2 소속 기록은 Catch (catch_id, owner_id) 한 쌍만 가리키고 Catch를 따라 연쇄 삭제된다', async () => {
  const { CommitAssignmentEntity } = require('../../dist/catches/entities/commit-assignment.entity');
  const { CreateCommitAssignment1794054790720 } =
    require('../../dist/database/migrations/1794054790720-CreateCommitAssignment');
  const dataSource = new DataSource({
    type: 'postgres', database: 'catch_metadata_test', synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [MemberAccount, AnalysisRequest, AnalysisConsent, AnalysisAttempt, CatchAssetEntity,
      RepositoryProtectionEntity, CandidateRegistrationEntity, ResultApplicationRecord, RepositoryRegistration,
      CommitAssignmentEntity],
  });
  await dataSource.buildMetadatas();
  const metadata = dataSource.getMetadata(CommitAssignmentEntity);
  // 회원·분석 요청을 직접 가리키는 외래 키는 두지 않는다(지우는 길은 Catch 하나, BR3.7).
  assert.equal(metadata.foreignKeys.length, 1);
  const [fk] = metadata.foreignKeys;
  assert.equal(fk.name, 'fk_commit_assignment_catch_id_member_id');
  assert.equal(fk.referencedEntityMetadata.target, CatchAssetEntity);
  assert.deepEqual(fk.columnNames, ['catch_id', 'member_id']);
  assert.deepEqual(fk.referencedColumnNames, ['catch_id', 'owner_id']);
  assert.equal(fk.onDelete, 'CASCADE');
  assert.equal(fk.onUpdate, 'NO ACTION');
  assert.ok(dataSource.getMetadata(CatchAssetEntity).uniques.some(unique => unique.name === 'uq_catch_asset_catch_id_owner_id'));

  const statements = [];
  await new CreateCommitAssignment1794054790720().up({ async query(sql) { statements.push(sql); } });
  assert.match(statements[0], /ADD CONSTRAINT "uq_catch_asset_catch_id_owner_id" UNIQUE \("catch_id", "owner_id"\)/,
    '한 쌍 외래 키가 가리킬 유일 조건을 먼저 둔다');
  assert.ok(statements.includes('ALTER TABLE "commit_assignment" ADD CONSTRAINT "fk_commit_assignment_catch_id_member_id" ' +
    'FOREIGN KEY ("catch_id", "member_id") REFERENCES "catch_asset"("catch_id","owner_id") ON DELETE CASCADE ON UPDATE NO ACTION'));
});
