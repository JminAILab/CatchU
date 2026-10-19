const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { SelectedRepositoryCatalog } = require('../dist/member-repositories/selected-repository-catalog');
const { SelectedRepositoryRegistrationSource } = require('../dist/analysis-receiver/selected-repository-registration.source');

// 좌표만 실제 선정 자료다. 분석 내용·동의 판본은 만들거나 외부로 전송하지 않는다.
test('선정된 두 저장소의 숫자 ID와 정확한 좌표를 보존하며 범위·고지는 발급하지 않는다', () => {
  const catalog = new SelectedRepositoryCatalog();
  assert.deepEqual(catalog.listCurrent().map(({repositoryId, owner, name, url, eligibility}) =>
    ({repositoryId, owner, name, url, eligibility})), [
    {repositoryId: '570342307', owner: 'ljm0850', name: 'TheMe', url: 'https://github.com/ljm0850/TheMe', eligibility: 'ALL_AUTHENTICATED'},
    {repositoryId: '547322698', owner: 'ljm0850', name: 'BEASTA-ZOO', url: 'https://github.com/ljm0850/BEASTA-ZOO', eligibility: 'ALL_AUTHENTICATED'},
  ]);
  for (const version of catalog.listCurrent()) {
    assert.equal(catalog.resolve(version.selectionReference), version);
    assert.deepEqual(Object.keys(version).sort(), ['eligibility', 'name', 'owner', 'repositoryId', 'selectionReference', 'url']);
  }
  assert.equal(catalog.resolve('catchu:synthetic-selection:v1'), null);
  assert.equal(catalog.resolve('__proto__'), null);
});

test('선정 취소와 이름 변경 후에도 이전 좌표 판본과 저장소 ID는 유지한다', () => {
  const prior = new SelectedRepositoryCatalog().listCurrent();
  // 가상 이름 변경이며 실제 GitHub 저장소를 수정하거나 조회하지 않는다.
  const renamed = {...prior[0], name: 'renamed-fixture', url: 'https://github.com/ljm0850/renamed-fixture', selectionReference: 'fixture:later-coordinates'};
  const catalog = new SelectedRepositoryCatalog([...prior, renamed], [renamed.selectionReference]);
  assert.equal(catalog.listCurrent().length, 1);
  assert.equal(catalog.listCurrent()[0].repositoryId, prior[0].repositoryId);
  assert.equal(catalog.resolve(prior[0].selectionReference).name, 'TheMe');
  assert.equal(catalog.resolve(prior[1].selectionReference).name, 'BEASTA-ZOO');
});

test('생성 입력과 반환 객체를 바꿔도 보관 좌표나 현재 선정 목록을 바꿀 수 없다', () => {
  const row = {...new SelectedRepositoryCatalog().listCurrent()[0]};
  const reference = row.selectionReference;
  const references = [reference];
  const catalog = new SelectedRepositoryCatalog([row], references);
  row.owner = 'mutated'; references.length = 0;
  assert.equal(catalog.resolve(reference).owner, 'ljm0850');
  assert.equal(Object.isFrozen(catalog.resolve(reference)), true);
  assert.equal(Object.isFrozen(catalog.listCurrent()), true);
  assert.equal(Reflect.set(catalog.resolve(reference), 'name', 'mutated'), false);
  assert.throws(() => catalog.listCurrent().push(row), TypeError);
});

test('중복 판본·없는 현재 판본·동일 저장소의 동시 현재 판본·잘못된 좌표 설정은 거부한다', () => {
  const row = new SelectedRepositoryCatalog().listCurrent()[0];
  assert.throws(() => new SelectedRepositoryCatalog([row, row]), /Invalid/);
  assert.throws(() => new SelectedRepositoryCatalog([row], ['missing']), /Invalid/);
  assert.throws(() => new SelectedRepositoryCatalog([row], [row.selectionReference, row.selectionReference]), /Invalid/);
  for (const changes of [{repositoryId: 'synthetic-repository'}, {owner: '../escape'}, {name: '..'},
    {url: 'https://example.invalid/repo'}, {eligibility: 'EVERYONE'}, {selectionReference: ''}]) {
    assert.throws(() => new SelectedRepositoryCatalog([{...row, ...changes}], []), /Invalid/);
  }
});

const context = () => ({requestId: randomUUID(), attemptId: randomUUID(), memberId: randomUUID(),
  repositoryId: '570342307', consentId: randomUUID(), scopeRevision: 'fixture-approved-scope', sourceMode: 'LIVE'});

test('잘못된 맥락과 MOCK은 DB 조회 전 거부하고 실제 DB 장애는 null로 감추지 않는다', async () => {
  let calls = 0;
  const failure = new Error('database unavailable');
  const source = new SelectedRepositoryRegistrationSource({transaction: async () => { calls++; throw failure; }});
  for (const value of [null, {}, {...context(), requestId: 'invalid'}, {...context(), sourceMode: 'MOCK'},
    {...context(), repositoryId: 570342307}, {...context(), scopeRevision: ''}]) {
    assert.equal(await source.findForRegistration(value), null);
  }
  assert.equal(calls, 0);
  await assert.rejects(source.findForRegistration(context()), error => error === failure);
  assert.equal(calls, 1);
});

test('입력 맥락은 비동기 DB 조회 전에 복사하고 일관된 스냅샷과 불변 출력만 사용한다', async () => {
  const input = context();
  const expected = {...input};
  const selected = new SelectedRepositoryCatalog().listCurrent()[0];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const source = new SelectedRepositoryRegistrationSource({transaction: async (isolation, work) => {
    assert.equal(isolation, 'REPEATABLE READ');
    await pending;
    return work({findOneBy: async (entity, where) => {
      assert.equal(where.requestId, expected.requestId);
      if (entity.name === 'AnalysisConsent') return {consentedScope: {revision: expected.scopeRevision,
        repositoryId: expected.repositoryId, selectionReference: selected.selectionReference}};
      return {};
    }});
  }});
  const result = source.findForRegistration(input);
  input.memberId = randomUUID(); input.repositoryId = '547322698';
  release();
  const snapshot = await result;
  assert.deepEqual(snapshot, {...expected, githubRepository: {owner: 'ljm0850', name: 'TheMe'}});
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.githubRepository), true);
});
