// U4 제출 2 — C-10 PublicationAccess DB 구현(src/publications/db-publication-access.ts) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 「주요 시나리오와 확인」 S8·S9의 판정 부분, 보안 설계 「링크 판정」·
// 「소유 회원 비활성 (R-06)」, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
//
// 판정 순서 (BR6.1, C-10, NFR1.3·NFR1.12)
//   - 기대: 토큰 형식(base64url 43자)이 아니면 조회 없이 LinkUnavailable. 발행본 없음·중지·만료(만료 시각과 같은 순간부터)는 구분 없이
//           LinkUnavailable. 그다음 소유 회원 상태(OQ-U4-NFR-6 합의 전 10월 동작): 비활성이면 LinkUnavailable(404), 회원 행 없음이면
//           내부 오류(500 INTERNAL_ERROR 계열, 토큰·SQL 비노출). 그다음 비밀번호 링크면 grant(없음·서명 틀림·다른 발행본·만료)를 확인해
//           LinkPasswordRequired. 비밀번호 없는 링크는 grant 없이 통과한다. 판정은 호출마다 다시 하고 캐시하지 않는다.
//   - 실패 조건: 중지·만료 링크가 grant로 열림, 비활성 소유자의 링크가 열림, 회원 없음을 404나 빈 결과로 바꿈, 형식 오류 토큰으로 DB 조회.
// S8 비밀번호 링크의 grant (US4.4, BR6.1·BR6.2, NFR1.6)
//   - 기대: 10월 link-grant 서명(LINK_GRANT_SECRET)으로 publicationId에 묶은 grant만 통과. 다른 발행본 grant·만료 grant·위조 grant는
//           LinkPasswordRequired. 통과하면 RecipientAccess { publicationId, ownerMemberId, passwordProtected: true, expiresAt }.
//   - 실패 조건: 다른 발행본 grant로 사본 노출.
// S9 중지·만료·삭제 링크 (US5.1, BR6.1·BR6.5)
//   - 기대: 받은 사람 판정은 LinkUnavailable. 작성자 판정(resolveForOwner)은 본인 발행본이면 중지·만료 뒤에도 OwnerAccess를 돌려주고
//           state는 중지가 만료보다 우선(STOPPED > EXPIRED > ACTIVE). 남의 것·없는 것·UUID 형식이 아닌 ID는 구분 없이 NotFound.
//   - 실패 조건: 남의 발행본을 OwnerAccess로 돌려줌.
// readSnapshot (BR6.4, NFR1.4)
//   - 기대: published_item만 읽어 position 오름차순 PublishedSnapshot { title, publishedAt, expiresAt, items }를 만든다. U4 항목의
//           pdfPages는 null. 발행본 행이 없으면 빈 사본을 만들지 않고 NotFound로 실패한다.
//   - 실패 조건: 원본 catch_asset·text_material을 읽음, 없는 발행본에 빈 사본.
//
// 실제 테스트 DB의 publication·published_item·member_account 표를 쓴다. 회원·발행본·토큰·grant는 모두 합성이다.
// 회원 행 없음은 정상 DB에서 만들 수 없으므로 10월 recipient-http 시험처럼 OwnerProfileReader.readOwnerState 결과만 대역으로 바꾼다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { OwnerProfileReader } = require('../../dist/member-profile/owner-profile-reader');
const { issueLinkGrant } = require('../../dist/share-links/link-grant');
const { generateLinkToken } = require('../../dist/share-links/link-token');
const { DbPublicationAccess, PublicationOwnerMissing } = require('../../dist/publications/db-publication-access');
const { LinkPasswordRequired, LinkUnavailable, NotFound } = require('../../dist/publications/publication-access');
const { insertMember } = require('./support.cjs');

const NOW = new Date('2026-11-10T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const GRANT_KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
let db;
let clockNow = NOW;
let access;

before(async () => {
  db = await openTestDataSource();
  access = new DbPublicationAccess(db, GRANT_KEY, new OwnerProfileReader(db), () => clockNow);
});
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); clockNow = NOW; });

const CATCH_SNAPSHOT = { workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여',
  evidence: [{ sourceUrl: 'https://github.com/o/r/pull/1', sourceRevision: 'rev', representedFacts: ['[합성] 근거'] }],
  authorDescription: '[합성] 설명', aiDraft: null, mismatch: false };

/** 발행본 행을 직접 넣는다(U4 발행 API를 대신함). 비밀번호 링크는 검증값이 있다는 사실만 중요하다. */
async function insertPublication(memberId, { password = false, publishedAt = new Date(NOW.getTime() - HOUR), stoppedAt = null, title = '[합성] 발행본' } = {}) {
  const publicationId = randomUUID();
  const token = generateLinkToken();
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, password_protection_reference, published_at, expires_at, stopped_at)
    VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + interval '2160 hours', $7)`,
  [publicationId, memberId, title, token, password ? 'scrypt$1$synthetic-verifier' : null, publishedAt, stoppedAt]);
  return { publicationId, token, expiresAt: new Date(publishedAt.getTime() + 2160 * HOUR) };
}
function insertItem(publicationId, position, kind, snapshot, title = `[합성] 항목 ${position}`) {
  const publishedItemId = randomUUID();
  return db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [publishedItemId, publicationId, position, kind, randomUUID(), title, JSON.stringify(snapshot)])
    .then(() => publishedItemId);
}
const setState = (memberId, state) => db.query('UPDATE member_account SET account_state = $2 WHERE member_id = $1', [memberId, state]);

test('비밀번호 없는 유효 링크는 grant 없이 통과하고 호출마다 다시 판정하며, 형식이 틀린 토큰은 조회 없이 LinkUnavailable이다', async () => {
  const owner = await insertMember(db);
  const p = await insertPublication(owner);
  const expected = { publicationId: p.publicationId, ownerMemberId: owner, passwordProtected: false, expiresAt: p.expiresAt };
  assert.deepEqual(await access.resolveForRecipient(p.token, null, NOW), expected);
  assert.deepEqual(await access.resolveForRecipient(p.token, 'ignored-grant', NOW), expected, '비밀번호 없는 링크는 grant를 보지 않는다');
  // 중지를 커밋하면 다음 호출은 바로 막힌다(캐시 없음).
  await db.query('UPDATE publication SET stopped_at = $2 WHERE publication_id = $1', [p.publicationId, NOW]);
  await assert.rejects(access.resolveForRecipient(p.token, null, NOW), LinkUnavailable);

  const noQuery = new DbPublicationAccess({ transaction: () => { throw new Error('형식 오류 토큰으로 조회했다'); } }, GRANT_KEY, null, () => NOW);
  for (const token of ['short', p.token + 'x', p.token.slice(1), 'a'.repeat(43) + '=', '', null, 42]) {
    await assert.rejects(noQuery.resolveForRecipient(token, null, NOW), LinkUnavailable, String(token));
  }
});

test('S9: 없음·중지·만료(같은 순간부터)·삭제는 구분 없이 LinkUnavailable이다', async () => {
  const owner = await insertMember(db);
  await assert.rejects(access.resolveForRecipient(generateLinkToken(), null, NOW), LinkUnavailable, '없는 토큰');
  const stopped = await insertPublication(owner, { stoppedAt: new Date(NOW.getTime() - 1000) });
  await assert.rejects(access.resolveForRecipient(stopped.token, null, NOW), LinkUnavailable, '중지');
  const expiring = await insertPublication(owner, { publishedAt: new Date(NOW.getTime() - 2160 * HOUR) });
  assert.equal((await access.resolveForRecipient(expiring.token, null, new Date(NOW.getTime() - 1))).publicationId, expiring.publicationId, '만료 1ms 전');
  await assert.rejects(access.resolveForRecipient(expiring.token, null, NOW), LinkUnavailable, '만료 시각과 같은 순간');
  const removed = await insertPublication(owner);
  await db.query('DELETE FROM publication WHERE publication_id = $1', [removed.publicationId]);
  await assert.rejects(access.resolveForRecipient(removed.token, null, NOW), LinkUnavailable, '삭제');
});

test('S8: 비밀번호 링크는 그 발행본에 묶인 유효 grant만 통과하고, 중지·만료 판정이 grant 확인보다 먼저다', async () => {
  const owner = await insertMember(db);
  const locked = await insertPublication(owner, { password: true });
  const other = await insertPublication(owner, { password: true });
  const grant = issueLinkGrant(GRANT_KEY, locked.publicationId, locked.expiresAt, NOW);
  await assert.rejects(access.resolveForRecipient(locked.token, null, NOW), LinkPasswordRequired, 'grant 없음(MCP 경로)');
  await assert.rejects(access.resolveForRecipient(locked.token, undefined, NOW), LinkPasswordRequired, '헤더 없음');
  await assert.rejects(access.resolveForRecipient(locked.token, 'g1.forged.forged', NOW), LinkPasswordRequired, '위조');
  await assert.rejects(access.resolveForRecipient(locked.token, issueLinkGrant(OTHER_KEY, locked.publicationId, locked.expiresAt, NOW), NOW),
    LinkPasswordRequired, '다른 키 서명');
  await assert.rejects(access.resolveForRecipient(locked.token, issueLinkGrant(GRANT_KEY, other.publicationId, other.expiresAt, NOW), NOW),
    LinkPasswordRequired, '다른 발행본 grant');
  await assert.rejects(access.resolveForRecipient(locked.token, grant, new Date(NOW.getTime() + 2 * HOUR)), LinkPasswordRequired, '만료된 grant');
  assert.deepEqual(await access.resolveForRecipient(locked.token, grant, NOW),
    { publicationId: locked.publicationId, ownerMemberId: owner, passwordProtected: true, expiresAt: locked.expiresAt });
  await db.query('UPDATE publication SET stopped_at = $2 WHERE publication_id = $1', [locked.publicationId, NOW]);
  await assert.rejects(access.resolveForRecipient(locked.token, grant, NOW), LinkUnavailable, '중지는 grant보다 먼저');
});

test('소유 회원이 비활성이면 404(LinkUnavailable), 다시 ACTIVE가 되면 열리고, 회원 행이 없으면 내부 오류다(토큰 비노출)', async (t) => {
  const owner = await insertMember(db);
  const open = await insertPublication(owner);
  const locked = await insertPublication(owner, { password: true });
  const grant = issueLinkGrant(GRANT_KEY, locked.publicationId, locked.expiresAt, NOW);
  for (const state of ['SUSPENDED', 'WITHDRAWN', 'active']) {
    await setState(owner, state);
    await assert.rejects(access.resolveForRecipient(open.token, null, NOW), LinkUnavailable, state);
    await assert.rejects(access.resolveForRecipient(locked.token, grant, NOW), LinkUnavailable, `${state} (grant 있어도)`);
  }
  await setState(owner, 'ACTIVE');
  assert.equal((await access.resolveForRecipient(open.token, null, NOW)).ownerMemberId, owner);

  // [시험 대역] 회원 행 없음: 외래 키 때문에 정상 DB에서 만들 수 없어 상태 조회 결과만 바꾼다.
  const calls = [];
  access.owners.readOwnerState = async (ownerId, manager) => { calls.push({ ownerId, manager: manager !== undefined }); return 'NO_MEMBER'; };
  t.after(() => { delete access.owners.readOwnerState; });
  for (const [token, withGrant] of [[open.token, null], [locked.token, grant]]) {
    await assert.rejects(access.resolveForRecipient(token, withGrant, NOW), (error) => {
      assert.ok(error instanceof PublicationOwnerMissing);
      assert.ok(!(error instanceof LinkUnavailable) && !(error instanceof LinkPasswordRequired));
      assert.ok(!error.message.includes(token) && !error.message.includes('SELECT'), '메시지에 토큰·SQL 없음');
      return true;
    });
  }
  assert.deepEqual(calls, [{ ownerId: owner, manager: true }, { ownerId: owner, manager: true }], '판정 트랜잭션의 manager로 같은 시점에 읽는다');
});

test('S9: 작성자는 본인 발행본을 중지·만료 뒤에도 보고(중지 우선), 남의 것·없는 것·형식 오류 ID는 NotFound다', async () => {
  const owner = await insertMember(db);
  const other = await insertMember(db);
  const p = await insertPublication(owner);
  assert.deepEqual(await access.resolveForOwner(owner, p.publicationId), { publicationId: p.publicationId, state: 'ACTIVE' });
  assert.equal((await access.resolveForOwner(owner.toUpperCase(), p.publicationId.toUpperCase())).state, 'ACTIVE', '대문자 UUID도 같은 행');
  clockNow = new Date(p.expiresAt.getTime());
  assert.equal((await access.resolveForOwner(owner, p.publicationId)).state, 'EXPIRED');
  await db.query('UPDATE publication SET stopped_at = $2 WHERE publication_id = $1', [p.publicationId, NOW]);
  assert.equal((await access.resolveForOwner(owner, p.publicationId)).state, 'STOPPED', '중지가 만료보다 우선');
  clockNow = NOW;
  assert.equal((await access.resolveForOwner(owner, p.publicationId)).state, 'STOPPED');
  for (const [memberId, publicationId] of [[other, p.publicationId], [owner, randomUUID()], [owner, 'not-a-uuid'], ['not-a-uuid', p.publicationId], [owner, '']]) {
    await assert.rejects(access.resolveForOwner(memberId, publicationId), NotFound, `${memberId} ${publicationId}`);
  }
});

test('readSnapshot은 published_item만 position 순으로 읽어 사본을 만들고, 없는 발행본은 빈 사본 대신 NotFound다', async () => {
  const owner = await insertMember(db);
  const p = await insertPublication(owner, { title: '[합성] 제목' });
  const textId = await insertItem(p.publicationId, 2, 'TEXT_MATERIAL', { body: '[합성] 본문' });
  const catchId = await insertItem(p.publicationId, 1, 'CATCH', CATCH_SNAPSHOT, '제목 없는 Catch');
  const snapshot = await access.readSnapshot(p.publicationId);
  assert.deepEqual(snapshot, {
    title: '[합성] 제목', publishedAt: new Date(NOW.getTime() - HOUR), expiresAt: p.expiresAt,
    items: [
      { publishedItemId: catchId, position: 1, itemKind: 'CATCH', title: '제목 없는 Catch', snapshot: CATCH_SNAPSHOT, pdfPages: null },
      { publishedItemId: textId, position: 2, itemKind: 'TEXT_MATERIAL', title: '[합성] 항목 2', snapshot: { body: '[합성] 본문' }, pdfPages: null },
    ],
  });
  // 원본 표(catch_asset·text_material)에는 아무것도 없어도 사본은 읽힌다(사본만 읽는다).
  assert.deepEqual(await db.query('SELECT 1 FROM catch_asset'), []);
  const empty = await insertPublication(owner);
  assert.deepEqual((await access.readSnapshot(empty.publicationId)).items, [], '항목이 없는 발행본은 빈 목록');
  await assert.rejects(access.readSnapshot(randomUUID()), NotFound);
  await assert.rejects(access.readSnapshot('not-a-uuid'), NotFound);
  await db.query('DELETE FROM publication WHERE publication_id = $1', [p.publicationId]);
  await assert.rejects(access.readSnapshot(p.publicationId), NotFound, '삭제 뒤 빈 사본을 만들지 않는다');
});
