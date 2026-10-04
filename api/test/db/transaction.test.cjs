const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// CONVENTIONS.md 「트랜잭션 규약」 확인용. 테이블은 이 파일에서만 만들고 지운다.
let dataSource;
before(async () => {
  dataSource = await openTestDataSource();
  await dataSource.query('DROP TABLE IF EXISTS tx_probe_child, tx_probe_parent, tx_probe_log');
  await dataSource.query('CREATE TABLE tx_probe_parent (id uuid PRIMARY KEY)');
  await dataSource.query(`CREATE TABLE tx_probe_child (
    id uuid PRIMARY KEY, parent_id uuid NOT NULL REFERENCES tx_probe_parent (id), label text NOT NULL CHECK (label <> ''))`);
  await dataSource.query('CREATE TABLE tx_probe_log (id uuid PRIMARY KEY)');
});
after(async () => {
  await dataSource.query('DROP TABLE IF EXISTS tx_probe_child, tx_probe_parent, tx_probe_log');
  await dataSource.destroy();
});
beforeEach(() => resetTestDatabase(dataSource));

const count = async (table) => Number((await dataSource.query(`SELECT count(*) AS n FROM ${table}`))[0].n);

// 다른 영역의 저장 함수 역할: 넘겨받은 manager만 쓴다.
async function saveChild(manager, parentId, label) {
  await manager.query('INSERT INTO tx_probe_child (id, parent_id, label) VALUES ($1, $2, $3)', [randomUUID(), parentId, label]);
}

test('넘겨받은 EntityManager로 저장하면 한 트랜잭션으로 함께 커밋된다', async () => {
  await dataSource.transaction(async (manager) => {
    const parentId = randomUUID();
    await manager.query('INSERT INTO tx_probe_parent (id) VALUES ($1)', [parentId]);
    await saveChild(manager, parentId, 'ok');
  });
  assert.equal(await count('tx_probe_parent'), 1);
  assert.equal(await count('tx_probe_child'), 1);
});

test('넘겨받은 쪽 저장이 실패하면 호출한 쪽 저장까지 함께 롤백된다', async () => {
  await assert.rejects(dataSource.transaction(async (manager) => {
    const parentId = randomUUID();
    await manager.query('INSERT INTO tx_probe_parent (id) VALUES ($1)', [parentId]);
    await saveChild(manager, parentId, ''); // CHECK 위반
  }), { code: '23514' });
  assert.equal(await count('tx_probe_parent'), 0);
  assert.equal(await count('tx_probe_child'), 0);
});

test('규약 위반 예: 트랜잭션 안에서 전역 DataSource로 저장한 행은 롤백되지 않는다', async () => {
  await assert.rejects(dataSource.transaction(async (manager) => {
    await manager.query('INSERT INTO tx_probe_parent (id) VALUES ($1)', [randomUUID()]);
    await dataSource.query('INSERT INTO tx_probe_log (id) VALUES ($1)', [randomUUID()]);
    throw new Error('뒤 단계 실패');
  }), /뒤 단계 실패/);
  assert.equal(await count('tx_probe_parent'), 0);
  assert.equal(await count('tx_probe_log'), 1, '다른 연결에서 이미 커밋됐다');
});
