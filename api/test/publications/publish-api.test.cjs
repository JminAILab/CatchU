// U4 제출 2 — 발행 API(POST /v1/publications) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 「주요 시나리오와 확인」 S4~S7, 성능 설계 「판정 위치와 순서」,
// 신뢰성 설계 「발행 트랜잭션 경계」·「작성자 실패 안내」, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
//
// 판정 순서(BR4.8·BR4.1·BR4.5·BR4.7·BR5.1): 인증(401) → 회원별 발행 빈도 1분 10회 임시값(429 RATE_LIMITED + Retry-After) →
//   입력 검사(400 VALIDATION_FAILED: 제목 1~50자 코드 포인트·앞뒤 공백 제거, 비밀번호 8~64자 그대로, 항목 1~20개, (kind, sourceId) 중복,
//   kind는 CATCH·TEXT_MATERIAL만, 정의 밖 필드) → 동의(403 AI_CONSENT_REQUIRED) → 트랜잭션 밖 토큰·scrypt →
//   트랜잭션(하루 횟수 consume → 원본 잠금·재읽기(404) → 자격(409) → 전체 글 60,000자 임시값(400) → 쓰기 → PRIVATE→PUBLIC →
//   chunkInTransaction → 커밋) → 커밋 뒤 EMBED_PUBLICATION·BASE_SUMMARY 등록(실패는 로그만) → 201.
//
// S4 공개 Catch 1 + 비공개 Catch 1 + 텍스트 1 발행 (US4.1, BR4.1·BR4.4·BR5.1·BR5.3·BR5.4·BR5.5)
//   - 기대: 201 { publicationId, url, state: ACTIVE, publishedAt, expiresAt(=발행+2160시간), passwordProtected }. url에만 토큰이 있고
//           다른 칸·로그에는 없다. published_item 3개가 요청 순서대로 position 1..3, Catch 사본은 workFacts·subjectContribution·
//           evidence(position 순)·authorDescription·aiDraft(GENERATED일 때만)·mismatch를 구분해 담고 제목이 없으면 '제목 없는 Catch'.
//           비공개 Catch가 PUBLIC으로 바뀐다. chunkInTransaction 가짜는 발행 트랜잭션의 manager(트랜잭션 활성)로 불리고 그 시점에 밖에서는
//           발행본이 보이지 않는다. 커밋 뒤 EMBED_PUBLICATION-{id}·BASE_SUMMARY-{id} 두 작업이 { publicationId }로 등록된다(등록 시점에 밖에서
//           발행본이 보인다). 비밀번호를 주면 scrypt 검증값이 저장되고 원문은 저장·응답·로그에 없다.
//   - 실패 조건: 순서 틀림, 등록이 커밋 전, 토큰이 url 밖에 노출, aiDraft가 작성자 설명과 섞임.
// S5 미확인 Catch 또는 SOURCE_PRIVATE Catch를 넣어 발행 (US4.1, BR4.2·BR5.2·BR7.4)
//   - 기대: 409 CONFIRMATION_REQUIRED 또는 409 SOURCE_RESTRICTED, details.catchIds에 해당 Catch만. 발행본·항목 행 없음, 함께 고른 다른
//           비공개 Catch도 PRIVATE 그대로. 보호 관측이 없거나 불완전하면 10월처럼 500(비공개로 단정하지 않음).
//   - 실패 조건: 일부만 저장·공개 전환.
// S6 하루 횟수 LIMIT_REACHED, chunkInTransaction 예외 (US4.1, BR5.1·BR5.2, NFR5.1)
//   - 기대: LIMIT_REACHED면 429 DAILY_LIMIT_REACHED(Retry-After 없음), 조각 예외면 500 INTERNAL_ERROR. 둘 다 발행본·항목 없음, 공개 전환 없음,
//           하루 횟수 행도 되돌아감(consume이 같은 트랜잭션). 작업 등록은 부르지 않는다.
//   - 실패 조건: 발행본·공개 전환·하루 횟수가 남음.
// S7 작업 등록 ENQUEUE_FAILED (US4.1, BR5.5, NFR5.2)
//   - 기대: 두 등록이 모두 실패해도 201 발행 성공 응답, 발행본은 남고 다시 등록하지 않는다(로그만).
//   - 실패 조건: 발행 실패로 보고.
// 거부 사례: 빈도 429(11번째)와 Retry-After, 입력 400(칸별 reason), 동의 없음 403(하루 횟수를 쓰지 않음), 남의 것·없는 원본 404
//   RESOURCE_UNAVAILABLE, 전체 글 60,000/60,001자, 인증 없음 401.
//
// 작성자 실패 안내 표(신뢰성 설계 NFR7.5, web이 응답 코드로 분기한다):
//   409 CONFIRMATION_REQUIRED/SOURCE_RESTRICTED(details.catchIds) → 해당 Catch 표시 | 404 RESOURCE_UNAVAILABLE → 목록 다시 불러오기 |
//   400 VALIDATION_FAILED → 칸별 이유 | 403 AI_CONSENT_REQUIRED → 공용 동의 창 | 429 DAILY_LIMIT_REACHED → "오늘 한도에 도달했습니다" |
//   429 RATE_LIMITED + Retry-After → 남은 초 동안 버튼 잠금 | 500 → "발행되지 않았습니다"(입력 유지)
//
// 실제 AppModule(전역 Guard·오류 형식·no-store)·테스트 DB·개발 로그인 합성 회원을 쓴다. U2 AiRun·U3 PublishedIndexWriter는 계약 모양 가짜로
// 바꿔 결과를 고른다(합성 연결을 포함한 사전 확인이며 실제 연결 성공이 아니다). 동의·하루 횟수는 실제 표 행으로 만든다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { DAILY_RUN_LIMIT, koreanUsageDate } = require('../../dist/daily-run-limit/daily-run-limit');
const { verifyLinkPassword } = require('../../dist/share-links/link-password');
const { PUBLICATION_TTL_HOURS } = require('../../dist/publications/publication.entity');
const { SNAPSHOT_TEXT_TOTAL_MAX, PUBLISH_RATE_LIMIT } = require('../../dist/publications/publications-config');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { buildCatchSnapshot } = require('../../dist/publications/snapshot-builder');
const { WORK_LIMIT_PREFIXES, WORK_LIMIT_SENTENCES } = require('../../dist/publications/work-limit-sentences');
const {
  PUBLISH_SETTINGS, WEB_BASE_URL, HOUR, setEnv, startApp, expectError, eligibleCatch, insertAnalysisRequest, insertCatch, insertTextMaterial,
  insertEvidence, insertCommitAssignment, insertProtection, hideRegistrationNames,
  consent, fakeAiRun, fakeIndexWriter, bindFakes, setClock, body, catchItem, textItem, tokenOf,
} = require('./support.cjs');

let server, db, restore, aiRun, writer, unbind;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
});
after(async () => {
  await server?.app.close();
  await db?.destroy();
  restore?.();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  unbind?.();
  aiRun = fakeAiRun(db);
  writer = fakeIndexWriter(db);
  unbind = bindFakes(server.app, { aiRun, indexWriter: writer });
});

const publish = (token, payload) => server.call('POST', '/publications', { token, body: payload });
async function author(identity = `u4-author-${randomUUID()}`) {
  const member = await server.login(identity);
  await consent(server.app, member.memberId);
  return member;
}
const publications = () => db.query('SELECT publication_id, member_id, title, password_protection_reference, published_at, expires_at, stopped_at FROM publication');
const items = (publicationId) => db.query(
  'SELECT position, item_kind, source_id, title, snapshot, pdf_copy_key FROM published_item WHERE publication_id = $1 ORDER BY position', [publicationId]);
const visibility = async (catchId) => (await db.query('SELECT visibility FROM catch_asset WHERE catch_id = $1', [catchId]))[0].visibility;
const dailyCount = async (memberId) => (await db.query('SELECT count FROM daily_execution_count WHERE member_id = $1', [memberId]))[0]?.count ?? null;
/** 시험 쪽에서 따로 계산한 한국 시간 해·달(구현의 koreanMonth를 쓰지 않는다). */
const kstMonth = (at) => new Date(new Date(at).getTime() + 9 * HOUR).toISOString().slice(0, 7);

test('S4: 공개 Catch·비공개 Catch·텍스트 자료를 순서대로 사본에 담고, 비공개 Catch를 공개로 바꾸며, 커밋 뒤 두 작업을 등록한다', async () => {
  const a = await author();
  const publicCatch = await eligibleCatch(db, a.memberId, { title: null, visibility: 'PUBLIC', workFacts: ['[합성] 사실 1', '[합성] 사실 2'],
    subjectContribution: '[합성] 기여', authorDescription: '[합성] 작성자 설명', draftContent: '[합성] AI 초안', mismatch: true }, { evidence: 2 });
  const privateCatch = await eligibleCatch(db, a.memberId, { title: '[합성] 비공개 Catch', visibility: 'PRIVATE' }, { repositoryId: 'synthetic-repository-2' });
  const materialId = await insertTextMaterial(db, a.memberId, { title: '[합성] 자료', body: '  [합성] 본문\n둘째 줄  ' });
  const password = 'synthetic-password-1!';

  const response = await publish(a.token, body([catchItem(publicCatch), catchItem(privateCatch), textItem(materialId)], { title: '  [합성] 제목  ', password }));
  assert.equal(response.status, 201, response.text);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(response.body).sort(), ['expiresAt', 'passwordProtected', 'publicationId', 'publishedAt', 'state', 'url']);
  assert.equal(response.body.state, 'ACTIVE');
  assert.equal(response.body.passwordProtected, true);
  assert.equal(Date.parse(response.body.expiresAt) - Date.parse(response.body.publishedAt), PUBLICATION_TTL_HOURS * HOUR);
  const token = tokenOf(response.body.url);
  assert.ok(response.body.url.startsWith(`${WEB_BASE_URL}/s/`));
  const rest = { ...response.body, url: undefined };
  assert.ok(!JSON.stringify(rest).includes(token), '토큰은 url 안에만 있다');
  assert.ok(!response.text.includes(password), '비밀번호 원문은 응답에 없다');

  const [row] = await publications();
  assert.equal(row.publication_id, response.body.publicationId);
  assert.equal(row.member_id, a.memberId);
  assert.equal(row.title, '[합성] 제목');
  assert.equal(row.stopped_at, null);
  assert.ok(row.password_protection_reference.startsWith('scrypt$') && !row.password_protection_reference.includes(password));
  assert.equal(await verifyLinkPassword(password, row.password_protection_reference), true);
  assert.equal((await db.query('SELECT link_token_reference AS t FROM publication'))[0].t, token);

  const stored = await items(row.publication_id);
  assert.deepEqual(stored.map((item) => [item.position, item.item_kind, item.source_id, item.title, item.pdf_copy_key]), [
    [1, 'CATCH', publicCatch, '제목 없는 Catch', null],
    [2, 'CATCH', privateCatch, '[합성] 비공개 Catch', null],
    [3, 'TEXT_MATERIAL', materialId, '[합성] 자료', null],
  ]);
  // NC2(계약 C3): 저장소 이름·작성 달·근거별 ownCommit이 더해진다. PR 근거라 ownCommit은 거짓이고 한계가 없어 workLimits 칸은 없다.
  const [{ edited }] = await db.query('SELECT author_description_updated_at AS edited FROM catch_asset WHERE catch_id = $1', [publicCatch]);
  assert.deepEqual(stored[0].snapshot, {
    workFacts: ['[합성] 사실 1', '[합성] 사실 2'], subjectContribution: '[합성] 기여',
    evidence: [
      { sourceUrl: 'https://github.com/synthetic-owner/synthetic-repo/pull/1', sourceRevision: 'synthetic-revision-1', representedFacts: ['[합성] 근거 사실 1'], ownCommit: false },
      { sourceUrl: 'https://github.com/synthetic-owner/synthetic-repo/pull/2', sourceRevision: 'synthetic-revision-2', representedFacts: ['[합성] 근거 사실 2'], ownCommit: false },
    ],
    authorDescription: '[합성] 작성자 설명', aiDraft: '[합성] AI 초안', mismatch: true,
    repositoryName: 'synthetic-owner/synthetic-repository', authorDescriptionEditedMonth: kstMonth(edited),
  });
  assert.deepEqual(stored[1].snapshot, { workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여',
    evidence: [{ sourceUrl: 'https://github.com/synthetic-owner/synthetic-repo/pull/1', sourceRevision: 'synthetic-revision-1', representedFacts: ['[합성] 근거 사실 1'], ownCommit: false }],
    authorDescription: null, aiDraft: null, mismatch: false, repositoryName: 'synthetic-owner/synthetic-repository' }, '초안이 없으면 aiDraft null');
  assert.deepEqual(stored[2].snapshot, { body: '  [합성] 본문\n둘째 줄  ' }, '본문은 가공 없이 그대로');
  assert.equal(await visibility(publicCatch), 'PUBLIC');
  assert.equal(await visibility(privateCatch), 'PUBLIC', '고른 비공개 Catch는 PUBLIC으로');

  assert.deepEqual(writer.calls.map(({ publicationId, transactionActive, itemsInside, visibleOutside }) => ({ publicationId, transactionActive, itemsInside, visibleOutside })),
    [{ publicationId: row.publication_id, transactionActive: true, itemsInside: 3, visibleOutside: false }], '같은 manager, 커밋 전');
  assert.equal(writer.calls[0].now.toISOString(), new Date(row.published_at).toISOString(), 'chunkInTransaction의 now는 발행 시각');
  assert.deepEqual(aiRun.calls, [
    { kind: 'EMBED_PUBLICATION', runKey: `EMBED_PUBLICATION-${row.publication_id}`, payload: { publicationId: row.publication_id }, committed: true },
    { kind: 'BASE_SUMMARY', runKey: `BASE_SUMMARY-${row.publication_id}`, payload: { publicationId: row.publication_id }, committed: true },
  ], '커밋 뒤 두 작업 등록');
  assert.equal(await dailyCount(a.memberId), 1, '기본 요약 1회를 센다');
});

test('S4: 비밀번호 없는 발행은 passwordProtected false이고 검증값이 NULL이다', async () => {
  const a = await author();
  const materialId = await insertTextMaterial(db, a.memberId);
  const response = await publish(a.token, body([textItem(materialId)]));
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.passwordProtected, false);
  assert.equal((await publications())[0].password_protection_reference, null);
});

test('입력 400: 제목·비밀번호·항목 규칙 위반은 칸별 이유를 담고 아무것도 저장하지 않는다', async (t) => {
  const a = await author();
  const materialId = await insertTextMaterial(db, a.memberId);
  const ok = [textItem(materialId)];
  // 사례가 1분 10회(빈도 임시값)보다 많으므로 요청마다 시계를 1분 넘게 옮긴다.
  let now = new Date('2026-11-10T00:00:00Z');
  t.after(setClock(server.app, () => { now = new Date(now.getTime() + 61_000); return now; }));
  const cases = [
    [{ title: ' '.repeat(3), items: ok }, [{ field: 'title', reason: 'isNotEmpty' }]],
    [{ title: '가'.repeat(49) + '😀😀', items: ok }, [{ field: 'title', reason: 'maxLength' }]],
    [{ title: 1, items: ok }, [{ field: 'title', reason: 'isString' }]],
    [{ title: 'a\u0000', items: ok }, [{ field: 'title', reason: 'noNul' }]],
    [{ title: 't', password: 'short12', items: ok }, [{ field: 'password', reason: 'minLength' }]],
    [{ title: 't', password: 'p'.repeat(65), items: ok }, [{ field: 'password', reason: 'maxLength' }]],
    [{ title: 't', password: '', items: ok }, [{ field: 'password', reason: 'isNotEmpty' }]],
    [{ title: 't', password: null, items: ok }, [{ field: 'password', reason: 'isString' }]],
    [{ title: 't' }, [{ field: 'items', reason: 'isArray' }]],
    [{ title: 't', items: [] }, [{ field: 'items', reason: 'arrayMinSize' }]],
    [{ title: 't', items: Array.from({ length: 21 }, () => textItem(randomUUID())) }, [{ field: 'items', reason: 'arrayMaxSize' }]],
    [{ title: 't', items: [textItem(materialId), textItem(materialId.toUpperCase())] }, [{ field: 'items[1]', reason: 'arrayUnique' }]],
    [{ title: 't', items: [{ kind: 'PDF_MATERIAL', sourceId: materialId }] }, [{ field: 'items[0].kind', reason: 'isIn' }]],
    [{ title: 't', items: [{ kind: 'CATCH', sourceId: 'not-a-uuid' }] }, [{ field: 'items[0].sourceId', reason: 'isUuid' }]],
    [{ title: 't', items: [{ kind: 'CATCH', sourceId: materialId, extra: 1 }] }, [{ field: 'items[0]', reason: 'isObject' }]],
    [{ title: 't', items: ok, extra: true }, [{ field: 'body', reason: 'whitelistValidation' }]],
  ];
  for (const [payload, violations] of cases) {
    const response = await publish(a.token, payload);
    expectError(response, 400, 'VALIDATION_FAILED');
    assert.deepEqual(response.body.details, { violations }, JSON.stringify(payload).slice(0, 100));
  }
  // 비밀번호 길이는 코드 포인트로 세고 앞뒤 공백을 지우지 않는다: 8자(이모지 포함) 통과.
  assert.equal((await publish(a.token, body(ok, { password: ' 😀😀😀😀😀😀 ' }))).status, 201);
  assert.equal((await publish(a.token, body(ok, { title: '가'.repeat(48) + '😀😀' }))).status, 201, '50 코드 포인트');
  expectError(await server.call('POST', '/publications?x=1', { token: a.token, body: body(ok) }), 400, 'VALIDATION_FAILED');
  assert.equal((await publications()).length, 2);
  assert.deepEqual(aiRun.calls.length, 4);
});

test('빈도 429: 같은 회원의 11번째 요청은 입력 검사 전에 RATE_LIMITED + Retry-After이고, 창이 지나면 다시 받는다(1분 10회 임시값)', async () => {
  const a = await author();
  const other = await author();
  let now = new Date('2026-11-10T00:00:00Z');
  const unsetClock = setClock(server.app, () => now);
  try {
    for (let index = 0; index < PUBLISH_RATE_LIMIT.maxRequests; index += 1) {
      expectError(await publish(a.token, { title: 't' }), 400, 'VALIDATION_FAILED');
    }
    const limited = await publish(a.token, { title: 't' });
    expectError(limited, 429, 'RATE_LIMITED');
    assert.equal(limited.headers.get('retry-after'), '60');
    expectError(await publish(other.token, { title: 't' }), 400, 'VALIDATION_FAILED', '다른 회원은 영향 없음');
    now = new Date(now.getTime() + 30_000);
    expectError(await publish(a.token, { title: 't' }), 429, 'RATE_LIMITED');
    now = new Date(now.getTime() + 31_000);
    expectError(await publish(a.token, { title: 't' }), 400, 'VALIDATION_FAILED');
  } finally {
    unsetClock();
  }
  assert.deepEqual(await publications(), []);
});

test('동의 403: 동의가 없으면 AI_CONSENT_REQUIRED이고 하루 횟수를 쓰지 않으며, 동의 뒤 같은 요청이 통과한다', async () => {
  const member = await server.login(`u4-no-consent-${randomUUID()}`);
  const materialId = await insertTextMaterial(db, member.memberId);
  expectError(await publish(member.token, body([textItem(materialId)])), 403, 'AI_CONSENT_REQUIRED');
  assert.equal(await dailyCount(member.memberId), null);
  assert.deepEqual(await publications(), []);
  await consent(server.app, member.memberId);
  assert.equal((await publish(member.token, body([textItem(materialId)]))).status, 201);
  assert.equal(await dailyCount(member.memberId), 1);
});

test('404: 남의 Catch·남의 자료·없는 원본은 같은 RESOURCE_UNAVAILABLE이고 아무것도 저장하지 않는다. 인증 없으면 401', async () => {
  const a = await author();
  const b = await author();
  const bCatch = await eligibleCatch(db, b.memberId);
  const bMaterial = await insertTextMaterial(db, b.memberId);
  const own = await insertTextMaterial(db, a.memberId);
  for (const list of [[catchItem(bCatch)], [textItem(bMaterial)], [textItem(own), catchItem(randomUUID())], [textItem(randomUUID()), textItem(own)]]) {
    const response = await publish(a.token, body(list));
    expectError(response, 404, 'RESOURCE_UNAVAILABLE');
    assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
  }
  assert.deepEqual(await publications(), []);
  assert.equal(await dailyCount(a.memberId), null, '되돌아간 트랜잭션은 횟수를 남기지 않는다');
  assert.equal(writer.calls.length, 0);
  expectError(await publish(undefined, body([textItem(own)])), 401, 'AUTH_REQUIRED');
});

test('S5: 미확인 Catch는 409 CONFIRMATION_REQUIRED, 보호된 Catch는 409 SOURCE_RESTRICTED(details.catchIds)이고 다른 비공개 Catch는 그대로다', async () => {
  const a = await author();
  const unconfirmed = await eligibleCatch(db, a.memberId, { confirmed: false, visibility: 'PUBLIC' });
  const keptPrivate = await eligibleCatch(db, a.memberId, { visibility: 'PRIVATE' }, { repositoryId: 'synthetic-repository-kept' });
  const restricted = await eligibleCatch(db, a.memberId, { visibility: 'PRIVATE' }, { repositoryId: 'synthetic-repository-private', protection: 'SOURCE_PRIVATE' });
  const materialId = await insertTextMaterial(db, a.memberId);

  const confirmation = await publish(a.token, body([textItem(materialId), catchItem(keptPrivate), catchItem(unconfirmed), catchItem(restricted)]));
  expectError(confirmation, 409, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(confirmation.body.details, { catchIds: [unconfirmed] }, '확인 판정이 보호 판정보다 먼저');
  const source = await publish(a.token, body([catchItem(keptPrivate), catchItem(restricted)]));
  expectError(source, 409, 'SOURCE_RESTRICTED');
  assert.deepEqual(source.body.details, { catchIds: [restricted] });
  assert.deepEqual(await publications(), []);
  assert.equal(await visibility(keptPrivate), 'PRIVATE');
  assert.equal(await visibility(restricted), 'PRIVATE');
  assert.equal(await dailyCount(a.memberId), null);
  assert.equal(writer.calls.length + aiRun.calls.length, 0);

  // 보호 관측이 없거나 불완전하면 비공개로 단정하지 않고 10월처럼 서버 오류다(BR7.4).
  const noProtection = await eligibleCatch(db, a.memberId, {}, { repositoryId: 'synthetic-repository-none', protection: null });
  expectError(await publish(a.token, body([catchItem(noProtection)])), 500, 'INTERNAL_ERROR');
  const request = await insertAnalysisRequest(db, a.memberId, 'synthetic-repository-partial');
  await db.query(`INSERT INTO repository_protection (protection_id, owner_id, repository_id, applied_restriction) VALUES ($1, $2, $3, 'NONE')`,
    [randomUUID(), a.memberId, request.repositoryId]);
  const partial = await insertCatch(db, a.memberId, request.requestId);
  expectError(await publish(a.token, body([catchItem(partial)])), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await publications(), []);
  assert.equal(await visibility(partial), 'PRIVATE');
});

test('S6: 하루 횟수 LIMIT_REACHED는 429 DAILY_LIMIT_REACHED, 조각 나누기 예외는 500이며 둘 다 아무것도 남지 않는다', async () => {
  const a = await author();
  const privateCatch = await eligibleCatch(db, a.memberId, { visibility: 'PRIVATE' });
  const materialId = await insertTextMaterial(db, a.memberId);
  await db.query('INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, $3)', [a.memberId, koreanUsageDate(new Date()), DAILY_RUN_LIMIT]);
  const limited = await publish(a.token, body([catchItem(privateCatch), textItem(materialId)]));
  expectError(limited, 429, 'DAILY_LIMIT_REACHED');
  assert.equal(limited.headers.get('retry-after'), null);
  assert.equal(limited.body.message, '오늘 한도에 도달했습니다');
  assert.equal(await dailyCount(a.memberId), DAILY_RUN_LIMIT);
  assert.deepEqual(await publications(), []);
  assert.equal(await visibility(privateCatch), 'PRIVATE');
  assert.equal(writer.calls.length, 0);

  await db.query('DELETE FROM daily_execution_count WHERE member_id = $1', [a.memberId]);
  writer.fail = true;
  const failed = await publish(a.token, body([catchItem(privateCatch), textItem(materialId)]));
  expectError(failed, 500, 'INTERNAL_ERROR');
  assert.deepEqual(failed.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  assert.equal(writer.calls.length, 1);
  assert.equal(writer.calls[0].itemsInside, 2, '조각 나누기 전에 항목이 써졌다가 함께 되돌아간다');
  assert.deepEqual(await publications(), []);
  assert.deepEqual(await db.query('SELECT 1 FROM published_item'), []);
  assert.equal(await visibility(privateCatch), 'PRIVATE', '공개 전환도 되돌아간다');
  assert.equal(await dailyCount(a.memberId), null, '하루 횟수도 되돌아간다');
  assert.equal(aiRun.calls.length, 0, '실패한 발행은 작업을 등록하지 않는다');
});

test('S7: 작업 등록이 모두 ENQUEUE_FAILED여도 201 발행 성공이고 다시 등록하지 않는다', async () => {
  const a = await author();
  const materialId = await insertTextMaterial(db, a.memberId);
  aiRun.result = 'ENQUEUE_FAILED';
  const response = await publish(a.token, body([textItem(materialId)]));
  assert.equal(response.status, 201, response.text);
  assert.equal((await publications()).length, 1);
  assert.deepEqual(aiRun.calls.map((call) => call.kind), ['EMBED_PUBLICATION', 'BASE_SUMMARY']);
});

test('전체 글 60,000자(임시값)는 발행되고 60,001자는 400이며 되돌아간다. 제목·aiDraft·근거 주소는 세지 않는다', async () => {
  const a = await author();
  const full = [];
  for (let index = 0; index < 3; index += 1) full.push(await insertTextMaterial(db, a.memberId, { body: '가'.repeat(SNAPSHOT_TEXT_TOTAL_MAX / 3) }));
  const one = await insertTextMaterial(db, a.memberId, { body: '😀' });
  const draftOnly = await eligibleCatch(db, a.memberId, { workFacts: ['a'], subjectContribution: 'b', draftContent: '다'.repeat(5000), title: '라'.repeat(50) },
    { evidence: 0 });

  const over = await publish(a.token, body([...full.map(textItem), textItem(one)]));
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'items', reason: 'maxTotalLength' }] });
  assert.deepEqual(await publications(), []);
  assert.equal(await dailyCount(a.memberId), null);

  assert.equal((await publish(a.token, body(full.map(textItem)))).status, 201, '정확히 60,000자');
  // Catch의 세는 필드는 2자뿐이라 59,998 + 2 = 60,000이다(초안 5,000자·제목은 세지 않는다).
  const almost = await insertTextMaterial(db, a.memberId, { body: '나'.repeat(SNAPSHOT_TEXT_TOTAL_MAX - 2) });
  assert.equal((await publish(a.token, body([textItem(almost), catchItem(draftOnly)]))).status, 201);
  assert.equal((await publications()).length, 2);
});

// 새 Catch NC2 — 발행 사본의 선택 칸 넷(repositoryName·authorDescriptionEditedMonth·workLimits·evidence[].ownCommit, 계약 C3).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(US6.1~US6.3·US7.2 수락 기준, 기능 설계 BR1.1~BR1.5, NFR 설계 성능·보안·신뢰성, Unit 시험 안내
// 「실패 조건」). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 새 사본의 repositoryName은 분석 요청이 가리키는 저장소 등록의 「소유자/저장소」다(AC6.1.1). 작성 달은 작성자 설명을 마지막으로 고친
//         시각의 한국 시간 해·달이고(AC6.2.1, 2026-11-30T16:00Z → "2026-12" AC6.2.2), 설명이 없으면 칸이 없다(AC6.2.3). 발행 뒤 설명을
//         고쳐도 사본은 그대로다(AC6.2.4). workLimits는 근거 순서대로 작업 전체 한계 두 가지만 고르고 같은 글자는 한 번이며(AC6.3.1),
//         근거별 조회 상태 문장은 담지 않고(AC6.3.2) 고른 것이 없으면 칸이 없다(AC6.3.3). ownCommit은 근거 주소가 커밋 주소이고 그 식별값이
//         이 Catch의 소속 기록(같은 회원·같은 저장소 ID)에 있을 때만 참이다. 병합 커밋·PR·이슈 근거는 거짓(AC7.2.2).
//         등록 이름을 읽지 못하면(안전망) repositoryName만 빠지고 발행은 된다. 새 칸은 발행 글자 수 합산에 들지 않는다.
// - 실패 조건: 저장소 이름이 없거나 등록과 다름, 작성 달이 UTC로 정해짐, 설명 없는 Catch에 작성 달, 같은 한계 두 번, 근거별 조회 상태가 담김,
//         빈 workLimits, 다른 Catch·다른 회원에 속한 커밋이나 다른 저장소 ID의 같은 식별값에 ownCommit 참, 안전망에서 발행 실패.

/** 고른 Catch들을 발행하고 저장된 사본을 요청 순서대로 돌려준다. */
async function publishCatches(member, catchIds) {
  const response = await publish(member.token, body(catchIds.map(catchItem)));
  assert.equal(response.status, 201, response.text);
  return (await items(response.body.publicationId)).map((item) => item.snapshot);
}
/** 근거를 직접 넣을 Catch(확인됨·보호 NONE, 근거 없음). 같은 회원·저장소 ID면 등록·보호 관측을 함께 쓴다. */
async function bareCatch(memberId, repositoryId, overrides = {}, repository = undefined) {
  const request = await insertAnalysisRequest(db, memberId, repositoryId, repository);
  await insertProtection(db, memberId, repositoryId, 'NONE');
  return insertCatch(db, memberId, request.requestId, overrides);
}
const sha = (character) => character.repeat(40);
const commitUrl = (value, repository = 'nc2-owner/nc2-repo') => `https://github.com/${repository}/commit/${value}`;

test('NC2 AC6.1.1·AC6.2.1·AC6.2.3: 사본 repositoryName은 저장소 등록의 「소유자/저장소」이고, 작성 달은 설명이 있을 때만 한국 시간 해·달이다', async () => {
  const a = await author();
  const repository = { owner: 'nc2-owner', name: 'nc2-repo' };
  const described = await eligibleCatch(db, a.memberId, { authorDescription: '[합성] 11월 설명', authorDescriptionUpdatedAt: new Date('2026-11-10T03:00:00Z') },
    { repositoryId: 'nc2-repository-1', repository });
  const silent = await eligibleCatch(db, a.memberId, { authorDescription: null }, { repositoryId: 'nc2-repository-2', repository: { owner: 'Other-Owner', name: 'lib.js' } });
  const [first, second] = await publishCatches(a, [described, silent]);
  assert.equal(first.repositoryName, 'nc2-owner/nc2-repo');
  assert.equal(first.authorDescriptionEditedMonth, '2026-11');
  assert.equal(second.repositoryName, 'Other-Owner/lib.js', '등록 표기 그대로(대소문자·점 유지)');
  assert.equal('authorDescriptionEditedMonth' in second, false, '설명이 없으면 작성 달 칸이 없다');
  assert.equal('workLimits' in first || 'workLimits' in second, false, '한계가 없으면 칸이 없다');
});

test('NC2 AC6.2.2: 작성 달은 UTC가 아니라 한국 시간으로 정한다(2026-11-30T16:00Z → "2026-12", 14:59Z → "2026-11")', async () => {
  const a = await author();
  const december = await eligibleCatch(db, a.memberId, { authorDescription: '[합성] 설명', authorDescriptionUpdatedAt: new Date('2026-11-30T16:00:00Z') });
  const november = await eligibleCatch(db, a.memberId, { authorDescription: '[합성] 설명', authorDescriptionUpdatedAt: new Date('2026-11-30T14:59:59Z') },
    { repositoryId: 'nc2-repository-kst' });
  const [first, second] = await publishCatches(a, [december, november]);
  assert.equal(first.authorDescriptionEditedMonth, '2026-12');
  assert.equal(second.authorDescriptionEditedMonth, '2026-11');
});

test('NC2 AC6.2.4: 발행 뒤 작성자 설명을 고쳐도 저장된 사본의 설명과 작성 달은 발행 때 그대로다', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { authorDescription: '[합성] 발행 때 설명', authorDescriptionUpdatedAt: new Date('2026-11-02T00:00:00Z') });
  const response = await publish(a.token, body([catchItem(catchId)]));
  assert.equal(response.status, 201, response.text);
  await db.query(`UPDATE catch_asset SET author_description = '[합성] 고친 설명', author_description_updated_at = '2027-01-05T00:00:00Z' WHERE catch_id = $1`, [catchId]);
  const [stored] = await items(response.body.publicationId);
  assert.equal(stored.snapshot.authorDescription, '[합성] 발행 때 설명');
  assert.equal(stored.snapshot.authorDescriptionEditedMonth, '2026-11');
});

test('NC2 AC6.3.1·AC6.3.2·AC6.3.3: workLimits는 작업 전체 한계만 근거 순서대로 한 번씩 고르고, 근거별 조회 상태는 빼며, 없으면 칸이 없다', async () => {
  const a = await author();
  const resubmission = `${WORK_LIMIT_PREFIXES.RESUBMISSION_UNCONFIRMED}PR #3·#5, 공백을 무시한 변경 비교로 같은 변경을 확정하지 못함)`;
  const cherryPick = `${WORK_LIMIT_PREFIXES.CHERRY_PICK_UNCONFIRMED}커밋 aaaaaaaaaaaa·bbbbbbbbbbbb, 공백을 무시한 변경 비교로 같은 변경을 확정하지 못함)`;
  const perEvidence = '병합 커밋이라 변경 내용을 조회하지 않았다';
  const limited = await bareCatch(a.memberId, 'nc2-repository-limits');
  await insertEvidence(db, limited, 1, { coverageLimits: [WORK_LIMIT_SENTENCES._LISTS_INCOMPLETE, perEvidence] });
  await insertEvidence(db, limited, 2, { coverageLimits: [resubmission, WORK_LIMIT_SENTENCES._LISTS_INCOMPLETE, cherryPick] });
  await insertEvidence(db, limited, 3, { coverageLimits: [WORK_LIMIT_SENTENCES._EARLIER_LIST_INCOMPLETE, resubmission] });
  const plain = await bareCatch(a.memberId, 'nc2-repository-plain');
  await insertEvidence(db, plain, 1, { coverageLimits: [perEvidence, '본인 커밋이 20건을 넘어 최근 20건만 근거로 담았다'] });
  const [first, second] = await publishCatches(a, [limited, plain]);
  assert.deepEqual(first.workLimits, [WORK_LIMIT_SENTENCES._LISTS_INCOMPLETE, resubmission, cherryPick, WORK_LIMIT_SENTENCES._EARLIER_LIST_INCOMPLETE],
    '두 근거의 같은 문장은 한 번, 근거별 조회 상태는 없음');
  assert.equal('workLimits' in second, false, '고른 문장이 없으면 빈 배열이 아니라 칸이 없다');
});

test('NC2 AC7.2.2·NFR5.3: ownCommit은 이 Catch·같은 회원·같은 저장소 ID의 소속 기록에 있는 커밋 주소 근거만 참이다', async () => {
  const a = await author();
  const b = await author();
  const repositoryId = 'nc2-repository-own';
  const mine = await bareCatch(a.memberId, repositoryId);
  const sibling = await bareCatch(a.memberId, repositoryId);
  const stranger = await bareCatch(b.memberId, repositoryId);
  const cases = [
    [commitUrl(sha('A')), true, '이 Catch에 속한 본인 커밋(주소 대문자도 소문자로 대조)'],
    [commitUrl(sha('b')), false, '소속 기록에 없는 병합 커밋'],
    ['https://github.com/nc2-owner/nc2-repo/pull/9', false, 'PR 근거'],
    ['https://github.com/nc2-owner/nc2-repo/issues/4', false, '이슈 근거'],
    [`https://github.com/nc2-owner/nc2-repo/blob/${sha('a')}/a.ts`, false, '커밋 주소가 아닌 파일 주소'],
    [commitUrl(sha('c')), false, '같은 회원의 다른 Catch에 속한 커밋'],
    [commitUrl(sha('d')), false, '같은 식별값이지만 다른 저장소 ID의 소속 기록'],
    [commitUrl(sha('e')), false, '다른 회원의 Catch에 속한 커밋'],
  ];
  for (const [index, [sourceUrl]] of cases.entries()) await insertEvidence(db, mine, index + 1, { sourceUrl });
  await insertEvidence(db, sibling, 1, { sourceUrl: commitUrl(sha('c')) });
  await insertCommitAssignment(db, { memberId: a.memberId, repositoryId, commitSha: sha('a'), catchId: mine });
  await insertCommitAssignment(db, { memberId: a.memberId, repositoryId, commitSha: sha('c'), catchId: sibling });
  await insertCommitAssignment(db, { memberId: a.memberId, repositoryId: 'nc2-repository-elsewhere', commitSha: sha('d'), catchId: mine });
  await insertCommitAssignment(db, { memberId: b.memberId, repositoryId, commitSha: sha('e'), catchId: stranger });

  const [first, second] = await publishCatches(a, [mine, sibling]);
  assert.deepEqual(first.evidence.map((item) => item.ownCommit), cases.map(([, expected]) => expected), cases.map(([, , label]) => label).join(' / '));
  assert.deepEqual(second.evidence.map((item) => item.ownCommit), [true], '같은 발행의 다른 Catch는 자기 소속 기록으로 참');
  assert.equal(first.evidence[0].sourceUrl, commitUrl(sha('A')), '근거 주소는 바꾸지 않는다');
});

test('NC2 안전망(NFR7.3): 저장소 등록 이름을 읽지 못하면 repositoryName만 빠지고 나머지 사본은 같으며 발행은 된다', async () => {
  // 순수 함수: 등록 이름이 null인 행.
  const row = { catchId: randomUUID(), title: 't', workFacts: ['사실'], subjectContribution: '기여', draftStatus: 'NOT_GENERATED', draftContent: null,
    authorDescription: '설명', authorDescriptionUpdatedAt: new Date('2026-11-10T00:00:00Z'), mismatch: false, visibility: 'PRIVATE',
    workFactsConfirmed: true, contributionConfirmed: true, requestMemberId: randomUUID(), repositoryId: 'r', repositoryOwner: 'o', repositoryName: 'n' };
  const evidence = [{ catchId: row.catchId, sourceUrl: commitUrl(sha('a')), sourceRevision: 'v', representedFacts: ['f'],
    coverageLimits: [WORK_LIMIT_SENTENCES._LISTS_INCOMPLETE], ownCommit: true }];
  const named = buildCatchSnapshot(row, evidence);
  const unnamed = buildCatchSnapshot({ ...row, repositoryOwner: null, repositoryName: null }, evidence);
  assert.equal(named.repositoryName, 'o/n');
  assert.equal('repositoryName' in unnamed, false);
  const rest = { ...named };
  delete rest.repositoryName;
  assert.deepEqual(unnamed, rest);

  // 발행 경로: 잠금 조회 결과에서 이름만 지워도 201이고 사본에 칸이 없다.
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId);
  const restoreNames = hideRegistrationNames(server.app);
  try {
    const [snapshot] = await publishCatches(a, [catchId]);
    assert.equal('repositoryName' in snapshot, false);
    assert.deepEqual(snapshot.workFacts, ['[합성] 사실']);
  } finally {
    restoreNames();
  }
});

// 새 Catch NC3 — 다시 볼 곳 사실과 작업 시각은 본인만 본다(BR6.3, 보안 설계 1절, S8·AC9.4.1·AC11.1.4).
// 먼저 정한 실패 조건: 사실이 든 Catch를 발행한 사본에 사실 경로·커밋 식별값·작업 시각 글자가 하나라도 나옴.
const NC3_PATH_MARKER = 'src/REVISITMARKER/firebase.ts';
const NC3_FIRST = '2025-03-02T10:00:00.000Z';
const NC3_LAST = '2025-04-10T09:30:00.000Z';
async function catchWithRevisitFacts(memberId) {
  const catchId = await eligibleCatch(db, memberId);
  const facts = [
    { kind: 'REWORKED_LINES', paths: [NC3_PATH_MARKER], commits: [sha('7'), sha('8')] },
    { kind: 'REVERTED', paths: [], commits: [sha('8'), sha('7')] },
  ];
  await db.query('UPDATE catch_asset SET revisit_facts = $2::jsonb, first_work_at = $3, last_work_at = $4 WHERE catch_id = $1',
    [catchId, JSON.stringify(facts), NC3_FIRST, NC3_LAST]);
  return catchId;
}

test('NC3 S8·AC9.4.1·AC11.1.4: 사실·시각이 든 Catch를 발행한 사본에 사실 경로·커밋 식별값·작업 시각 글자가 없다', async () => {
  const a = await author();
  const catchId = await catchWithRevisitFacts(a.memberId);
  const [snapshot] = await publishCatches(a, [catchId]);
  assert.deepEqual(snapshot.workFacts, ['[합성] 사실'], '사본의 다른 칸은 그대로다');
  const text = JSON.stringify(snapshot);
  for (const marker of ['REVISITMARKER', sha('7'), sha('8'), sha('7').slice(0, 7), '2025-03-02', '2025-04-10',
    'revisitFacts', 'WorkAt', 'REWORKED_LINES', 'REVERTED']) {
    assert.equal(text.includes(marker), false, marker);
  }
  // 읽은 원본에는 값이 남아 있다(발행이 사실을 지운 것이 아니다).
  const [stored] = await db.query('SELECT revisit_facts FROM catch_asset WHERE catch_id = $1', [catchId]);
  assert.equal(stored.revisit_facts[0].paths[0], NC3_PATH_MARKER);
});
