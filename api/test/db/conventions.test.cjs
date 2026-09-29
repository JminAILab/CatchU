require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique } = require('typeorm');
const { inValues, lengthBetween } = require('../../dist/database/checks');
const { SnakeNamingStrategy } = require('../../dist/database/snake-naming.strategy');
const { openTestDataSource } = require('../support/test-database.cjs');

// README 「DB 물리 규약」대로 쓴 검증용 엔티티. 제품 src/에 두지 않고, 테이블을 만들지 않고 생성될 SQL만 본다.
class ProbeOwner {}
Entity()(ProbeOwner);
PrimaryColumn({ type: 'uuid' })(ProbeOwner.prototype, 'probeOwnerId');
Column({ type: 'text', unique: true })(ProbeOwner.prototype, 'identityReference');

class ProbeItem {}
Entity()(ProbeItem);
Check(inValues('state', ['OPEN', 'CLOSED']))(ProbeItem);
Check(lengthBetween('idem_key', 1, 128))(ProbeItem);
Unique(['ownerId', 'workKey'])(ProbeItem);
Index(['ownerId'], { unique: true, where: `"state" = 'OPEN'` })(ProbeItem);
PrimaryColumn({ type: 'uuid' })(ProbeItem.prototype, 'probeItemId');
Column({ type: 'uuid' })(ProbeItem.prototype, 'ownerId');
ManyToOne(() => ProbeOwner)(ProbeItem.prototype, 'owner');
JoinColumn({ name: 'owner_id' })(ProbeItem.prototype, 'owner');
Column({ type: 'text' })(ProbeItem.prototype, 'workKey');
Column({ type: 'varchar' })(ProbeItem.prototype, 'state');
Column({ type: 'text' })(ProbeItem.prototype, 'idemKey');
Column({ type: 'timestamptz' })(ProbeItem.prototype, 'occurredAt');
CreateDateColumn({ type: 'timestamptz' })(ProbeItem.prototype, 'createdAt');

test('규약대로 쓴 엔티티는 규약의 타입·이름으로 마이그레이션 SQL이 생성된다', { timeout: 10000 }, async (t) => {
  const dataSource = await openTestDataSource({ entities: [ProbeOwner, ProbeItem] });
  t.after(() => dataSource.destroy());
  const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
  const sql = upQueries.map(({ query }) => query).join('\n');

  for (const expected of [
    /CREATE TABLE "probe_owner" \("probe_owner_id" uuid NOT NULL, "identity_reference" text NOT NULL/,
    /CONSTRAINT "pk_probe_owner" PRIMARY KEY \("probe_owner_id"\)/,
    /CONSTRAINT "uq_probe_owner_identity_reference" UNIQUE/,
    /"occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL/,
    /"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now\(\)/,
    /"state" character varying NOT NULL/,
    /CONSTRAINT "ck_probe_item_state_[0-9a-f]{8}" CHECK \("state" IN \('OPEN', 'CLOSED'\)\)/,
    /CONSTRAINT "ck_probe_item_idem_key_[0-9a-f]{8}" CHECK \(char_length\("idem_key"\) BETWEEN 1 AND 128\)/,
    /CONSTRAINT "uq_probe_item_owner_id_work_key" UNIQUE \("owner_id", "work_key"\)/,
    /CREATE UNIQUE INDEX "ix_probe_item_owner_id_[0-9a-f]{8}" ON "probe_item" +\("owner_id"\) WHERE "state" = 'OPEN'/,
    /CONSTRAINT "fk_probe_item_owner_id" FOREIGN KEY \("owner_id"\) REFERENCES "probe_owner"\("probe_owner_id"\)/,
  ]) {
    assert.match(sql, expected);
  }
  assert.doesNotMatch(sql, /CREATE TYPE|ENUM/i, '네이티브 enum을 만들지 않는다');
});

test('제약 이름은 결정적이고 PostgreSQL 식별자 길이(63자)를 넘지 않는다', () => {
  const naming = new SnakeNamingStrategy();
  const columns = ['source_request_id', 'source_result_id', 'source_candidate_id'];
  const name = naming.uniqueConstraintName('catch_asset', columns);
  assert.ok(name.length <= 63);
  assert.match(name, /^uq_catch_asset_source_request_id_/);
  assert.equal(naming.uniqueConstraintName('catch_asset', columns), name);
  assert.notEqual(naming.uniqueConstraintName('catch_asset', columns.slice(0, 2)), name);
  assert.notEqual(
    naming.checkConstraintName('member_account', inValues('account_state', ['ACTIVE'])),
    naming.checkConstraintName('member_account', inValues('account_state', ['ACTIVE', 'DISABLED'])),
    '허용 값이 바뀌면 CHECK 이름도 바뀐다',
  );
  assert.equal(naming.tableName('MemberAccount', undefined), 'member_account');
  assert.equal(naming.columnName('sourceRequestId', undefined, []), 'source_request_id');
});
