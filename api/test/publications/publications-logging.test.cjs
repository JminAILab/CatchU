// U4 제출 2 — 발행본 로그(Nest Logger 'Publications') 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 관측 설계 「로그 줄」·「남기지 않는 것」, NFR6.2·NFR6.3·NFR6.5·NFR6.6, BR10.2,
// team.md Testing Posture·Code Style). 세부 시험 코드는 구현 뒤 쓴다.
//
// 결과 분류별 한 줄 (NFR6.2·NFR6.3·NFR6.5)
//   - 기대: 사건마다 객체 한 줄. 칸은 event·publicationId·memberId·errorCode·jobKind·enqueue뿐이다(칸 이름·값 표기는 임시).
//           PUBLISH_SUCCEEDED(발행본 ID·회원 ID), PUBLISH_FAILED(회원 ID·오류 코드, 발행본 ID 없음), ENQUEUE_RESULT(발행본 ID·작업 종류
//           EMBED_PUBLICATION/BASE_SUMMARY·결과 ENQUEUED/ENQUEUE_FAILED), PREFIX_DELETE_FAILED(발행본 ID·회원 ID·INTERNAL_ERROR).
//           등록 실패(응답 201)와 접두어 삭제 실패(응답 500)는 다른 분류다. 항목 수·처리 시간·받은 사람 판정 결과는 남기지 않는다.
//   - 실패 조건: 분류가 섞임, 정해진 칸 밖의 값.
// 비밀값 비노출 (NFR6.6, BR10.2)
//   - 기대: 합성 토큰·grant·비밀번호·자료 본문·제목·작성자 설명 문자열이 어떤 로그 줄에도 없다(성공·실패·500 포함).
//   - 실패 조건: 로그에 비밀값이나 본문이 남음.
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓰고 로거 출력을 모아 본다. U2 AiRun·FileStorage·U3 기록기는 가짜다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { StorageUnavailable } = require('../../dist/file-storage/file-storage');
const { LINK_GRANT_KEY, issueLinkGrant } = require('../../dist/share-links/link-grant');
const { PublicationManageService } = require('../../dist/publications/publication-manage.service');
const { PUBLICATION_ACCESS, PublicationsModule } = require('../../dist/publications/publications.module');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, expectError, eligibleCatch, insertTextMaterial, consent,
  fakeAiRun, fakeIndexWriter, bindFakes, body, catchItem, textItem, tokenOf,
} = require('./support.cjs');

const FIELDS = ['enqueue', 'errorCode', 'event', 'jobKind', 'memberId', 'publicationId'];
const SECRETS = {
  password: 'synthetic-password-[로그노출확인-3e9c]',
  title: '[합성-제목-로그노출확인-a1f0]',
  body: '[합성-본문-로그노출확인-b2e1]',
  description: '[합성-설명-로그노출확인-c3d2]',
};
let server, db, restore, aiRun, writer, unbind, manage;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
  manage = server.app.get(PublicationManageService);
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
  manage.files = { deletePrefix: async () => undefined };
});

const publish = (token, payload) => server.call('POST', '/publications', { token, body: payload });
async function author() {
  const member = await server.login(`u4-log-${randomUUID()}`);
  await consent(server.app, member.memberId);
  return member;
}
/** Publications 로거의 줄만 고른다(마지막 인자가 로거 이름. error 수준은 stack 자리가 사이에 끼어 있다). */
const publicationLogs = () => server.logs.filter((log) => log.args.at(-1) === 'Publications').map((log) => ({ level: log.level, entry: log.args[0] }));
const allText = () => server.logs.map((log) => log.text).join('\n');

test('발행 성공은 PUBLISH_SUCCEEDED 한 줄과 작업 종류별 ENQUEUE_RESULT 두 줄이며 칸은 정해진 여섯 개뿐이다', async () => {
  const a = await author();
  const material = await insertTextMaterial(db, a.memberId);
  const response = await publish(a.token, body([textItem(material)]));
  assert.equal(response.status, 201, response.text);
  const id = response.body.publicationId;
  const lines = publicationLogs();
  assert.deepEqual(lines, [
    { level: 'log', entry: { event: 'PUBLISH_SUCCEEDED', publicationId: id, memberId: a.memberId, errorCode: null, jobKind: null, enqueue: null } },
    { level: 'log', entry: { event: 'ENQUEUE_RESULT', publicationId: id, memberId: null, errorCode: null, jobKind: 'EMBED_PUBLICATION', enqueue: 'ENQUEUED' } },
    { level: 'log', entry: { event: 'ENQUEUE_RESULT', publicationId: id, memberId: null, errorCode: null, jobKind: 'BASE_SUMMARY', enqueue: 'ENQUEUED' } },
  ]);
  for (const { entry } of lines) assert.deepEqual(Object.keys(entry).sort(), FIELDS);
});

test('발행 실패는 PUBLISH_FAILED 한 줄에 회원 ID·오류 코드만 남기고 발행본 ID·작업 줄이 없다(400·403·409·429·500)', async () => {
  const a = await author();
  const noConsent = await server.login(`u4-log-noconsent-${randomUUID()}`);
  const material = await insertTextMaterial(db, a.memberId);
  const unconfirmed = await eligibleCatch(db, a.memberId, { confirmed: false });
  const expected = [];
  expectError(await publish(a.token, { title: '' }), 400, 'VALIDATION_FAILED');
  expected.push([a.memberId, 'VALIDATION_FAILED']);
  expectError(await publish(noConsent.token, body([textItem(material)])), 403, 'AI_CONSENT_REQUIRED');
  expected.push([noConsent.memberId, 'AI_CONSENT_REQUIRED']);
  expectError(await publish(a.token, body([catchItem(unconfirmed)])), 409, 'CONFIRMATION_REQUIRED');
  expected.push([a.memberId, 'CONFIRMATION_REQUIRED']);
  expectError(await publish(a.token, body([textItem(randomUUID())])), 404, 'RESOURCE_UNAVAILABLE');
  expected.push([a.memberId, 'RESOURCE_UNAVAILABLE']);
  writer.fail = true;
  expectError(await publish(a.token, body([textItem(material)])), 500, 'INTERNAL_ERROR');
  expected.push([a.memberId, 'INTERNAL_ERROR']);
  const lines = publicationLogs();
  assert.deepEqual(lines.map(({ level, entry }) => [level, entry.event, entry.publicationId, entry.memberId, entry.errorCode, entry.jobKind, entry.enqueue]),
    expected.map(([memberId, code]) => ['warn', 'PUBLISH_FAILED', null, memberId, code, null, null]));
});

test('작업 등록 실패(201)와 접두어 삭제 실패(500)는 다른 분류·다른 수준으로 남는다', async () => {
  const a = await author();
  const material = await insertTextMaterial(db, a.memberId);
  aiRun.result = 'ENQUEUE_FAILED';
  const response = await publish(a.token, body([textItem(material)]));
  assert.equal(response.status, 201);
  const id = response.body.publicationId;
  assert.deepEqual(publicationLogs().slice(1), [
    { level: 'warn', entry: { event: 'ENQUEUE_RESULT', publicationId: id, memberId: null, errorCode: null, jobKind: 'EMBED_PUBLICATION', enqueue: 'ENQUEUE_FAILED' } },
    { level: 'warn', entry: { event: 'ENQUEUE_RESULT', publicationId: id, memberId: null, errorCode: null, jobKind: 'BASE_SUMMARY', enqueue: 'ENQUEUE_FAILED' } },
  ]);
  server.logs.length = 0;
  manage.files = { deletePrefix: async () => { throw new StorageUnavailable('IO_FAILED'); } };
  expectError(await server.call('DELETE', `/publications/${id}`, { token: a.token }), 500, 'INTERNAL_ERROR');
  assert.deepEqual(publicationLogs(), [
    { level: 'error', entry: { event: 'PREFIX_DELETE_FAILED', publicationId: id, memberId: a.memberId, errorCode: 'INTERNAL_ERROR', jobKind: null, enqueue: null } },
  ]);
  assert.ok(!allText().includes('IO_FAILED') && !allText().includes('StorageUnavailable'), '원인 종류·경로는 남기지 않는다');
});

test('토큰·grant·비밀번호·제목·본문·설명은 어떤 로그 줄에도 없다(성공·거부·500·삭제 실패·판정 포함)', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { authorDescription: SECRETS.description, title: SECRETS.title });
  const material = await insertTextMaterial(db, a.memberId, { title: SECRETS.title, body: SECRETS.body });
  const published = await publish(a.token, body([catchItem(catchId), textItem(material)], { title: SECRETS.title, password: SECRETS.password }));
  assert.equal(published.status, 201, published.text);
  const token = tokenOf(published.body.url);
  const key = server.app.select(PublicationsModule).get(LINK_GRANT_KEY);
  const grant = issueLinkGrant(key, published.body.publicationId, new Date(published.body.expiresAt), new Date());
  const access = server.app.get(PUBLICATION_ACCESS);
  assert.equal((await access.resolveForRecipient(token, grant, new Date())).publicationId, published.body.publicationId);
  await assert.rejects(access.resolveForRecipient(token, `${grant}x`, new Date()));
  expectError(await publish(a.token, { title: SECRETS.title, password: SECRETS.password, items: [textItem(material)], extra: SECRETS.body }), 400, 'VALIDATION_FAILED');
  writer.fail = true;
  expectError(await publish(a.token, body([textItem(material)], { title: SECRETS.title, password: SECRETS.password })), 500, 'INTERNAL_ERROR');
  manage.files = { deletePrefix: async () => { throw new StorageUnavailable('IO_FAILED'); } };
  expectError(await server.call('DELETE', `/publications/${published.body.publicationId}`, { token: a.token }), 500, 'INTERNAL_ERROR');

  assert.ok(server.logs.length > 0, '로그가 수집됐다');
  const text = allText();
  for (const [name, value] of Object.entries({ ...SECRETS, token, grant })) {
    assert.equal(text.includes(value), false, `${name}이(가) 로그에 있다`);
  }
});
