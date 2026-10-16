const assert = require('node:assert/strict');
const { test } = require('node:test');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');

const context = Object.freeze({ requestId: 'request', attemptId: 'attempt', memberId: 'member',
  repositoryId: 'repository', consentId: 'consent', scopeRevision: 'scope', sourceMode: 'LIVE' });
const recordedAt = new Date('2026-10-16T00:00:00.000Z');
const snapshot = input => ({ ...input, githubRepository: { owner: 'Example-Org', name: 'Demo.Repo' } });
const source = (findForRegistration = async input => snapshot(input), now = () => recordedAt) =>
  new OctoberRepositoryObservationSource({ findForRegistration }, now);

for (const sourceMode of ['MOCK', 'LIVE']) {
  test(`${sourceMode}: 명시적 10월 정책은 공개 확인 없이 출처·기록 시각과 NONE을 공급한다`, async () => {
    let calls = 0;
    const provider = source(async input => {
      calls++;
      assert.ok(Object.isFrozen(input));
      assert.deepEqual(input, { ...context, sourceMode });
      return { ...snapshot(input), token: 'synthetic-secret', visibility: 'PUBLIC' };
    });
    const observation = await provider.observe({ ...context, sourceMode, unexpected: 'synthetic-secret' });
    assert.equal(calls, 1);
    assert.equal(observation.ownerId, context.memberId);
    assert.equal(observation.repositoryId, context.repositoryId);
    assert.deepEqual(observation.githubRepository, { owner: 'Example-Org', name: 'Demo.Repo' });
    assert.deepEqual(observation.confirmedSourceState, { observation: 'NOT_OBSERVED', sourceMode });
    assert.equal(observation.observationProvenance.policy, 'OCTOBER_2026_NOT_OBSERVED');
    assert.equal(observation.observationProvenance.description, '10월 관측 안 함(9/28 결정)');
    assert.equal(observation.observationProvenance.attemptId, context.attemptId);
    assert.equal(observation.observedAt.toISOString(), recordedAt.toISOString());
    assert.notEqual(observation.observedAt, recordedAt);
    assert.equal(observation.appliedRestriction, 'NONE');
    assert.equal(JSON.stringify(observation).includes('PUBLIC'), false);
    assert.equal(JSON.stringify(observation).includes('synthetic-secret'), false);
  });
}

test('좌표 공급 부재는 정책 NONE을 만들지 않는다', async () => {
  assert.equal(await source(async () => null).observe(context), null);
});

test('좌표 조회 실패는 호출부에 전달하고 NONE으로 바꾸지 않는다', async () => {
  const failure = Error('synthetic lookup failure');
  await assert.rejects(source(async () => { throw failure; }).observe(context), error => error === failure);
});

for (const field of Object.keys(context)) {
  test(`다른 ${field}의 좌표는 사용하지 않는다`, async () => {
    const provider = source(async input => ({ ...snapshot(input), [field]: field === 'sourceMode' ? 'MOCK' : 'other' }));
    assert.equal(await provider.observe(context), null);
  });
}

for (const githubRepository of [null, { owner: '', name: 'repo' }, { owner: 'owner/extra', name: 'repo' },
  { owner: 'owner', name: '..' }, { owner: 'owner', name: '.' }, { owner: 'owner', name: 'repo/other' },
  { owner: 'owner', name: 'repo?token=x' }, { owner: 123, name: 'repo' }]) {
  test(`잘못된 저장소 좌표 거부: ${JSON.stringify(githubRepository)}`, async () => {
    assert.equal(await source(async input => ({ ...snapshot(input), githubRepository })).observe(context), null);
  });
}

test('좌표·시각·출처는 호출마다 독립된 값이다', async () => {
  const stored = snapshot(context);
  const provider = source(async () => stored);
  const first = await provider.observe(context);
  first.githubRepository.owner = 'changed';
  first.observedAt.setUTCFullYear(2000);
  first.confirmedSourceState.observation = 'PUBLIC';
  const next = await provider.observe(context);
  assert.deepEqual(next.githubRepository, stored.githubRepository);
  assert.equal(next.observedAt.toISOString(), recordedAt.toISOString());
  assert.equal(next.confirmedSourceState.observation, 'NOT_OBSERVED');
});

test('잘못된 기록 시각은 NONE을 만들지 않는다', async () => {
  assert.equal(await source(undefined, () => new Date('invalid')).observe(context), null);
});

for (const input of [{ ...context, sourceMode: 'UNKNOWN' }, { ...context, memberId: '' },
  { ...context, attemptId: undefined }]) {
  test('잘못된 내부 맥락은 좌표 공급자를 호출하지 않는다: ' + JSON.stringify(input), async () => {
    assert.equal(await source(async () => { assert.fail('must not look up'); }).observe(input), null);
  });
}
