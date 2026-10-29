// C-10 PublicationAccess 메모리 가짜 구현. 소비 Unit이 합성 제공자로 쓸 때 판정 결과가 계약(C-10)·U4 설계(BR6.1·BR6.5)와 같은지 본다.
// 실제 DB 판정·grant 서명은 U4 본체의 범위라 여기서 보지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { InMemoryPublicationAccess } = require('../../dist/publications/in-memory-publication-access');
const { LinkPasswordRequired, LinkUnavailable, NotFound } = require('../../dist/publications/publication-access');

const NOW = new Date('2026-11-10T00:00:00.000Z');
const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const HOUR = 3600 * 1000;

function publication(overrides = {}) {
  return {
    publicationId: '00000000-0000-4000-8000-000000000001',
    ownerMemberId: OWNER,
    token: 'token-open',
    passwordProtected: false,
    title: '합성 발행본',
    publishedAt: new Date(NOW.getTime() - HOUR),
    expiresAt: new Date(NOW.getTime() + 2159 * HOUR),
    stoppedAt: null,
    items: [
      { publishedItemId: '00000000-0000-4000-8000-000000000012', position: 2, itemKind: 'TEXT_MATERIAL', title: '자료',
        snapshot: { body: '합성 본문' }, pdfPages: null },
      { publishedItemId: '00000000-0000-4000-8000-000000000011', position: 1, itemKind: 'CATCH', title: 'Catch',
        snapshot: { workFacts: ['합성 사실'], subjectContribution: '합성 기여', evidence: [], authorDescription: null,
          aiDraft: null, mismatch: false }, pdfPages: null },
    ],
    ...overrides,
  };
}

function access(...publications) {
  const fake = new InMemoryPublicationAccess(() => NOW);
  for (const p of publications) fake.put(p);
  return fake;
}

test('비밀번호 없는 유효 링크는 grant 없이 통과하고 작성자·만료 시각을 돌려준다', async () => {
  const p = publication();
  assert.deepEqual(await access(p).resolveForRecipient('token-open', null, NOW), {
    publicationId: p.publicationId, ownerMemberId: OWNER, passwordProtected: false, expiresAt: p.expiresAt,
  });
});

test('없음·삭제·중지·만료 링크는 구분 없이 LinkUnavailable이다', async () => {
  const fake = access(publication());
  await assert.rejects(fake.resolveForRecipient('token-unknown', null, NOW), LinkUnavailable);
  fake.put(publication({ stoppedAt: NOW }));
  await assert.rejects(fake.resolveForRecipient('token-open', null, NOW), LinkUnavailable);
  fake.put(publication({ expiresAt: NOW }));
  await assert.rejects(fake.resolveForRecipient('token-open', null, NOW), LinkUnavailable, '만료 시각과 같은 순간부터 만료');
  fake.put(publication());
  fake.remove(publication().publicationId);
  await assert.rejects(fake.resolveForRecipient('token-open', null, NOW), LinkUnavailable);
});

test('비밀번호 링크는 그 발행본의 유효 grant만 통과한다', async () => {
  const locked = publication({ token: 'token-locked', passwordProtected: true });
  const other = publication({ publicationId: '00000000-0000-4000-8000-000000000002', token: 'token-other' });
  const fake = access(locked, other);
  const grant = fake.issueGrant(locked.publicationId, new Date(NOW.getTime() + 2 * HOUR));

  await assert.rejects(fake.resolveForRecipient('token-locked', null, NOW), LinkPasswordRequired, 'grant 없음(MCP 경로)');
  await assert.rejects(fake.resolveForRecipient('token-locked', 'fake-grant-unknown', NOW), LinkPasswordRequired);
  await assert.rejects(fake.resolveForRecipient('token-locked', fake.issueGrant(other.publicationId, new Date(NOW.getTime() + HOUR)), NOW),
    LinkPasswordRequired, '다른 발행본 grant');
  await assert.rejects(fake.resolveForRecipient('token-locked', fake.issueGrant(locked.publicationId, NOW), NOW),
    LinkPasswordRequired, '만료된 grant');
  assert.equal((await fake.resolveForRecipient('token-locked', grant, NOW)).passwordProtected, true);
});

test('중지·만료 판정은 grant 확인보다 먼저다', async () => {
  const locked = publication({ token: 'token-locked', passwordProtected: true });
  const fake = access(locked);
  const grant = fake.issueGrant(locked.publicationId, new Date(NOW.getTime() + 2 * HOUR));
  fake.put({ ...locked, stoppedAt: NOW });
  await assert.rejects(fake.resolveForRecipient('token-locked', grant, NOW), LinkUnavailable);
});

test('작성자는 본인 발행본을 중지·만료 뒤에도 보고, 남의 것·없는 것은 NotFound다', async () => {
  const p = publication();
  const fake = access(p);
  assert.deepEqual(await fake.resolveForOwner(OWNER, p.publicationId), { publicationId: p.publicationId, state: 'ACTIVE' });
  fake.put(publication({ expiresAt: NOW }));
  assert.equal((await fake.resolveForOwner(OWNER, p.publicationId)).state, 'EXPIRED');
  fake.put(publication({ expiresAt: NOW, stoppedAt: NOW }));
  assert.equal((await fake.resolveForOwner(OWNER, p.publicationId)).state, 'STOPPED', '중지가 만료보다 우선');
  await assert.rejects(fake.resolveForOwner(OTHER, p.publicationId), NotFound);
  await assert.rejects(fake.resolveForOwner(OWNER, '00000000-0000-4000-8000-000000000099'), NotFound);
});

test('사본은 position 오름차순이고, 돌려받은 값을 고쳐도 넣은 사본은 바뀌지 않는다', async () => {
  const p = publication();
  const fake = access(p);
  const first = await fake.readSnapshot(p.publicationId);
  assert.deepEqual(first.items.map((item) => item.position), [1, 2]);
  assert.equal(first.title, '합성 발행본');
  first.items[0].snapshot.workFacts.push('바꾼 사실');
  p.items[1].snapshot.workFacts.push('넣은 뒤 바꾼 사실');
  assert.deepEqual((await fake.readSnapshot(p.publicationId)).items[0].snapshot.workFacts, ['합성 사실']);
  await assert.rejects(fake.readSnapshot('00000000-0000-4000-8000-000000000099'), NotFound);
});
