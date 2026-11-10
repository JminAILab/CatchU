// U9 받은 링크 읽개 시험(기능 설계 BR2.1~BR2.5·BR5.2, 비기능 설계 reliability-design 「실패와 결과」·security-design 「겹겹의 검사」, NFR1.1·NFR1.2·NFR1.8·
// NFR1.9·NFR4.3·NFR4.7, 계약 C-10). DB 없이 dist의 McpSharedPublicationReader 생성자에 PublicationAccess 대역을 바로 넘긴다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(기능 명세 「처리 순서와 결과」·「주요 시나리오와 확인」, 단위 시험 안내 「시나리오 표」, team.md Testing Posture).
// 계획 Step 3(2026-11-10)에서 옮겼다.
//
// 처리 순서(BR5.2): 토큰 꺼내기 → cursor 모양 → resolveForRecipient → readSnapshot → 글로 펴기 → cursor 범위 → 쪽 만들기
//   - 기대: S2의 실패 넷(42자, 44자, /s/ 없는 주소, 2,049자)은 McpLinkDenied('LINK_UNAVAILABLE')이고 판정을 부르지 않는다. S14 cursor 모양 오류는 U6
//           InvalidCursorError이고 판정을 부르지 않는다. 판정 실패(S7 LinkPasswordRequired, S8 LinkUnavailable)는 사본을 읽지 않는다. 비밀번호 링크에 모양이 맞는
//           cursor를 줘도 LINK_PASSWORD_REQUIRED다. 범위 밖 cursor(S15)는 판정과 사본 읽기를 부른 뒤 InvalidCursorError다.
//   - 실패 조건: 대역의 판정·사본 읽기가 불림, 다른 오류.
// 판정 인자(BR2.1)
//   - 기대: resolveForRecipient(토큰, null, 호출 때의 시각)이다. 시각은 부를 때마다 새로 정한다. 판정과 사본을 캐시하지 않아 두 번 부르면 두 번 판정하고 두 번 읽는다.
//           readSnapshot은 판정이 돌려준 publicationId로 부른다.
//   - 실패 조건: grant 값이 넘어감, 고정된 시각, 두 번째 호출에서 판정·사본 읽기를 건너뜀.
// 오류 대응(BR2.2)
//   - 기대: LinkUnavailable은 McpLinkDenied('LINK_UNAVAILABLE'), LinkPasswordRequired는 McpLinkDenied('LINK_PASSWORD_REQUIRED')다. McpLinkDenied는 이름 붙은 오류이고
//           code만 담으며, 오류 글에 토큰·link가 없다.
//   - 실패 조건: 두 이유가 섞임, 오류 글에 토큰·link가 실림.
// S9 읽개 쪽: 작성자 회원 행 없음(PublicationOwnerMissing), 판정 중 DB 오류, 사본 읽기 중 DB 오류
//   - 기대: 같은 오류 객체를 그대로 던진다(도구 쪽의 INTERNAL_ERROR 변환은 mcp-shared-publication 시험이 본다).
//   - 실패 조건: McpLinkDenied로 바뀜, 삼킴.
// S11 판정 뒤(BR2.5): 판정 통과 뒤 중지가 커밋됨, 판정 통과 뒤 사본이 지워짐(readSnapshot의 NotFound)
//   - 기대: 앞은 그 쪽을 돌려준다(판정을 통과한 호출은 취소하지 않는다). 뒤는 McpLinkDenied('LINK_UNAVAILABLE')다.
//   - 실패 조건: 앞을 거부, 뒤가 그 밖의 오류.
//
// 비기능 설계에서 더한 것
// - PublicationAccess 대역은 정상 DB로 만들 수 없는 S9·S11과, 판정·사본 읽기를 불렀는지 보는 처리 순서에만 쓴다(logical-components 「시험에서 바꿔 끼우는 자리」).
//   대역은 부른 인자와 횟수를 기록한다. 나머지 판정은 mcp-shared-publication 시험이 실제 DbPublicationAccess와 시험 DB로 본다.
//
// 합성 값만 쓴다. 토큰·cursor는 시험 안에서 만들고 출력에 찍지 않는다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { InvalidCursorError, encodeCursor } = require('../../dist/claude-mcp/mcp-page');
const { SHARED_PUBLICATION_NOTICE } = require('../../dist/claude-mcp/mcp-shared-page');
const { McpLinkDenied, McpSharedPublicationReader } = require('../../dist/claude-mcp/mcp-shared-publication-reader');
const { flattenPublishedItem } = require('../../dist/claude-mcp/mcp-shared-text');
const { PublicationOwnerMissing } = require('../../dist/publications/db-publication-access');
const { LinkPasswordRequired, LinkUnavailable, NotFound } = require('../../dist/publications/publication-access');
const { generateLinkToken } = require('../../dist/share-links/link-token');

const PUBLICATION_ID = randomUUID();
const PUBLISHED_AT = new Date('2026-11-01T09:00:00.000Z');
const EXPIRES_AT = new Date(PUBLISHED_AT.getTime() + 2160 * 60 * 60 * 1000);
const DRAFT_MARKER = 'SYNTHETIC-DRAFT-MUST-NOT-LEAVE';

/** 판정을 통과한 발행본의 사본(C-10 readSnapshot 모양). Catch·텍스트 자료·PDF가 하나씩이다. */
const SNAPSHOT = {
  title: '[합성] 받은 발행본',
  publishedAt: PUBLISHED_AT,
  expiresAt: EXPIRES_AT,
  items: [
    { publishedItemId: randomUUID(), position: 1, itemKind: 'CATCH', title: '[합성] Catch', pdfPages: null, snapshot: {
      workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여', evidence: [], authorDescription: null, aiDraft: DRAFT_MARKER, mismatch: false,
    } },
    { publishedItemId: randomUUID(), position: 2, itemKind: 'TEXT_MATERIAL', title: '[합성] 자료', pdfPages: null, snapshot: { body: '[합성] 본문' } },
    { publishedItemId: randomUUID(), position: 3, itemKind: 'PDF_MATERIAL', title: '[합성] PDF', snapshot: { pageCount: 2 },
      pdfPages: [{ pageNumber: 1, text: '[합성] 첫 쪽', readable: true }, { pageNumber: 2, text: '', readable: false }] },
  ],
};

/** 부른 인자와 횟수를 기록하는 PublicationAccess 대역. 판정·사본 읽기의 동작은 resolve·read로 받는다. */
function fakeAccess({ resolve, read } = {}) {
  const calls = { resolve: [], read: [] };
  return {
    calls,
    async resolveForRecipient(token, grant, now) {
      calls.resolve.push({ token, grant, now });
      if (resolve) return resolve();
      return { publicationId: PUBLICATION_ID, ownerMemberId: randomUUID(), passwordProtected: false, expiresAt: EXPIRES_AT };
    },
    async resolveForOwner() {
      throw new Error('받은 링크 읽개는 작성자 판정을 부르지 않는다');
    },
    async readSnapshot(publicationId) {
      calls.read.push(publicationId);
      return read ? read() : structuredClone(SNAPSHOT);
    },
  };
}

const deniedWith = (code) => (error) => error instanceof McpLinkDenied && error.code === code;
const dbError = () => Object.assign(new Error('synthetic database failure'), { name: 'QueryFailedError' });

test('정상: 토큰으로 판정(grant null, 호출 때 시각)한 뒤 판정이 준 발행본의 사본을 읽어 notice가 첫 칸인 쪽을 돌려준다', async () => {
  const token = generateLinkToken();
  const access = fakeAccess();
  const reader = new McpSharedPublicationReader(access);
  const before = Date.now();
  const page = await reader.readPage(`https://catchu.example/s/${token}`);
  const after = Date.now();
  assert.equal(access.calls.resolve.length, 1);
  const [{ token: judged, grant, now }] = access.calls.resolve;
  assert.ok(judged === token, '주소에서 꺼낸 토큰으로 판정한다');
  assert.equal(grant, null);
  assert.ok(now instanceof Date && now.getTime() >= before && now.getTime() <= after, '시각은 호출 때의 시각이다');
  assert.deepEqual(access.calls.read, [PUBLICATION_ID]);
  assert.equal(Object.keys(page)[0], 'notice');
  assert.equal(page.notice, SHARED_PUBLICATION_NOTICE);
  assert.equal(page.title, SNAPSHOT.title);
  assert.equal(page.publishedAt, PUBLISHED_AT.toISOString());
  assert.equal(page.expiresAt, EXPIRES_AT.toISOString());
  assert.deepEqual(page.items, SNAPSHOT.items.map((item) => (
    { position: item.position, itemKind: item.itemKind, title: item.title, content: flattenPublishedItem(item) })));
  assert.equal(JSON.stringify(page).includes(DRAFT_MARKER), false, 'aiDraft 글이 없다');
  assert.equal(page.nextCursor, null);
});

test('판정 인자: 시각은 부를 때마다 새로 정하고, 판정과 사본을 캐시하지 않아 두 번 부르면 두 번 판정하고 두 번 읽는다', async () => {
  const token = generateLinkToken();
  const access = fakeAccess();
  const reader = new McpSharedPublicationReader(access);
  await reader.readPage(token);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  await reader.readPage(token, encodeCursor({ position: 2, offset: 0 }));
  assert.equal(access.calls.resolve.length, 2);
  assert.equal(access.calls.read.length, 2);
  assert.ok(access.calls.resolve.every((call) => call.grant === null), 'grant는 언제나 null이다');
  assert.ok(access.calls.resolve[1].now.getTime() > access.calls.resolve[0].now.getTime(), '고정된 시각을 쓰지 않는다');
});

test('처리 순서: 토큰을 못 꺼낸 link 넷은 McpLinkDenied(LINK_UNAVAILABLE)이고 판정을 부르지 않는다', async () => {
  const token = generateLinkToken();
  const links = {
    '42자': token.slice(0, 42),
    '44자': `${token}A`,
    '/s/ 없는 주소': `https://catchu.example/p/${token}`,
    '2,049자': `https://catchu.example/s/${token}?pad=`.padEnd(2_049, 'a'),
  };
  for (const [name, link] of Object.entries(links)) {
    const access = fakeAccess();
    await assert.rejects(new McpSharedPublicationReader(access).readPage(link, 'not+a+cursor'), deniedWith('LINK_UNAVAILABLE'), name);
    assert.equal(access.calls.resolve.length, 0, `${name}: 판정을 부르지 않는다`);
  }
});

test('처리 순서: cursor 모양 오류는 InvalidCursorError이고 판정을 부르지 않는다', async () => {
  const token = generateLinkToken();
  const cursors = {
    'base64url 아님': 'not+a+cursor',
    'v 2': Buffer.from(JSON.stringify({ v: 2, position: 1, offset: 0 })).toString('base64url'),
    'position 음수': encodeCursor({ position: -1, offset: 0 }),
    '1,025자': 'A'.repeat(1_025),
  };
  for (const [name, cursor] of Object.entries(cursors)) {
    const access = fakeAccess();
    await assert.rejects(new McpSharedPublicationReader(access).readPage(token, cursor), InvalidCursorError, name);
    assert.equal(access.calls.resolve.length, 0, `${name}: 판정을 부르지 않는다`);
  }
});

test('처리 순서: 판정 실패는 사본을 읽지 않고, 비밀번호 링크는 모양이 맞는 cursor를 줘도 LINK_PASSWORD_REQUIRED다', async () => {
  const token = generateLinkToken();
  const cases = [
    ['S8 LinkUnavailable', () => { throw new LinkUnavailable(); }, undefined, 'LINK_UNAVAILABLE'],
    ['S7 LinkPasswordRequired', () => { throw new LinkPasswordRequired(); }, undefined, 'LINK_PASSWORD_REQUIRED'],
    ['S7 비밀번호 링크와 cursor', () => { throw new LinkPasswordRequired(); }, encodeCursor({ position: 1, offset: 0 }), 'LINK_PASSWORD_REQUIRED'],
    ['S8 막힌 링크와 범위 밖 cursor', () => { throw new LinkUnavailable(); }, encodeCursor({ position: 99, offset: 5 }), 'LINK_UNAVAILABLE'],
  ];
  for (const [name, resolve, cursor, code] of cases) {
    const access = fakeAccess({ resolve });
    await assert.rejects(new McpSharedPublicationReader(access).readPage(token, cursor), deniedWith(code), name);
    assert.equal(access.calls.resolve.length, 1, name);
    assert.equal(access.calls.read.length, 0, `${name}: 사본을 읽지 않는다`);
  }
});

test('처리 순서: 이 사본 범위 밖의 cursor는 판정과 사본 읽기를 한 뒤 InvalidCursorError다', async () => {
  const access = fakeAccess();
  await assert.rejects(new McpSharedPublicationReader(access).readPage(generateLinkToken(), encodeCursor({ position: 9, offset: 0 })), InvalidCursorError);
  assert.equal(access.calls.resolve.length, 1);
  assert.equal(access.calls.read.length, 1);
});

test('S9 읽개 쪽: 작성자 회원 행 없음·판정 중 DB 오류·사본 읽기 중 DB 오류는 McpLinkDenied로 바꾸지 않고 같은 오류를 그대로 던진다', async () => {
  const token = generateLinkToken();
  const ownerMissing = new PublicationOwnerMissing();
  const judgeFailure = dbError();
  const readFailure = dbError();
  const cases = [
    ['작성자 회원 행 없음', fakeAccess({ resolve: () => { throw ownerMissing; } }), ownerMissing],
    ['판정 중 DB 오류', fakeAccess({ resolve: () => { throw judgeFailure; } }), judgeFailure],
    ['사본 읽기 중 DB 오류', fakeAccess({ read: () => { throw readFailure; } }), readFailure],
  ];
  for (const [name, access, thrown] of cases) {
    await assert.rejects(new McpSharedPublicationReader(access).readPage(token), (error) => error === thrown, name);
  }
});

test('S11 판정 뒤: 판정을 통과한 뒤 중지가 커밋돼도 그 쪽을 돌려주고, 차단은 다음 호출의 재판정이 한다', async () => {
  const token = generateLinkToken();
  let stopped = false;
  const access = fakeAccess({
    resolve: () => {
      if (stopped) throw new LinkUnavailable();
      return { publicationId: PUBLICATION_ID, ownerMemberId: randomUUID(), passwordProtected: false, expiresAt: EXPIRES_AT };
    },
    read: () => {
      stopped = true; // 판정과 사본 읽기 사이에 작성자가 링크를 중지했다(사본 읽기는 상태를 판정하지 않는다, C-10).
      return structuredClone(SNAPSHOT);
    },
  });
  const reader = new McpSharedPublicationReader(access);
  const page = await reader.readPage(token);
  assert.equal(page.items.length, SNAPSHOT.items.length, '판정을 통과한 호출은 취소하지 않는다');
  await assert.rejects(reader.readPage(token, encodeCursor({ position: 2, offset: 0 })), deniedWith('LINK_UNAVAILABLE'));
  assert.equal(access.calls.read.length, 1, '다음 호출은 사본을 읽지 않는다');
});

test('S11 판정 뒤: 판정을 통과한 뒤 사본이 지워졌으면(NotFound) McpLinkDenied(LINK_UNAVAILABLE)다', async () => {
  const access = fakeAccess({ read: () => { throw new NotFound(); } });
  await assert.rejects(new McpSharedPublicationReader(access).readPage(generateLinkToken()), deniedWith('LINK_UNAVAILABLE'));
  assert.equal(access.calls.read.length, 1);
});

test('McpLinkDenied는 이름 붙은 오류이고 code만 담으며 오류 글에 토큰·link가 없다', async () => {
  const token = generateLinkToken();
  const link = `https://catchu.example/s/${token}`;
  for (const [resolve, code] of [[() => { throw new LinkUnavailable(); }, 'LINK_UNAVAILABLE'], [() => { throw new LinkPasswordRequired(); }, 'LINK_PASSWORD_REQUIRED']]) {
    const error = await new McpSharedPublicationReader(fakeAccess({ resolve })).readPage(link).then(() => assert.fail('거부되어야 한다'), (caught) => caught);
    assert.ok(error instanceof McpLinkDenied);
    assert.equal(error.name, 'McpLinkDenied');
    assert.equal(error.code, code);
    assert.equal(`${error.message} ${error.stack}`.includes(token), false, '오류 글에 토큰이 없다');
  }
});
