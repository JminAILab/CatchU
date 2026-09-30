require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { SnakeNamingStrategy } = require('../../dist/database/snake-naming.strategy');
const { MemberAccount, AnalysisRequest, AnalysisConsent, AnalysisAttempt } =
  require('../../dist/member-analysis/member-analysis.entity');
const { CatchAssetEntity } = require('../../dist/catches/entities/catch-asset.entity');
const { RepositoryProtectionEntity } = require('../../dist/catches/entities/repository-protection.entity');
const { CreateCatchAssets1790600000000 } = require('../../dist/database/migrations/1790600000000-CreateCatchAssets');
const { CreateRepositoryProtection1790601000000 } =
  require('../../dist/database/migrations/1790601000000-CreateRepositoryProtection');

test('B의 외부 FK 메타데이터가 실제 A/E 엔티티와 기존 마이그레이션의 참조·이름·옵션을 보존한다', async (t) => {
  // DB 접속·DDL 실행 없이 실제 엔티티의 참조를 해석하고 기존 up SQL과 대조한다.
  const dataSource = new DataSource({
    type: 'postgres', database: 'catch_metadata_test', synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [MemberAccount, AnalysisRequest, AnalysisConsent, AnalysisAttempt, CatchAssetEntity, RepositoryProtectionEntity],
  });
  await dataSource.buildMetadatas();
  const statements = [];
  const runner = { async query(sql) { statements.push(sql); } };
  await new CreateCatchAssets1790600000000().up(runner);
  await new CreateRepositoryProtection1790601000000().up(runner);

  const cases = [
    { entity: CatchAssetEntity, target: MemberAccount, name: 'fk_catch_asset_owner_id', column: 'owner_id', referenced: 'member_id' },
    { entity: CatchAssetEntity, target: AnalysisRequest, name: 'fk_catch_asset_source_request_id', column: 'source_request_id', referenced: 'request_id' },
    { entity: RepositoryProtectionEntity, target: MemberAccount, name: 'fk_repository_protection_owner_id', column: 'owner_id', referenced: 'member_id' },
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
      assert.equal(fk.onDelete, 'NO ACTION');
      assert.equal(fk.onUpdate, 'NO ACTION');
      assert.equal(fk.deferrable, undefined);

      const tableSql = statements.find(sql => sql.startsWith(`CREATE TABLE "${metadata.tableName}"`));
      assert.ok(tableSql, '기존 마이그레이션이 해당 B 테이블을 생성한다');
      const constraint = tableSql.split('\n').map(line => line.trim()).find(line => line.startsWith(`CONSTRAINT "${name}"`));
      assert.equal(constraint?.replace(/,$/, ''),
        `CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${fk.referencedTablePath}"("${referenced}")`,
        '기존 FK의 참조와 기본 NO ACTION·즉시 제약을 바꾸지 않는다');
    });
  }
});
