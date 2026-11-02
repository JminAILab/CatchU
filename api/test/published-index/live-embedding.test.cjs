// S12 실제 Voyage 연결 시험(U3 기능 설계 「주요 시나리오와 확인」 S12, 비기능 NFR6.1). CATCHU_EMBEDDING_API_KEY가 셸 환경변수로 있을 때만 돈다.
// 글은 공개해도 되는 합성 글이다. 결과 기록에는 상태·조각 개수·맞은 조각의 위치만 남기고 조각 글·질문 글·키는 남기지 않는다.
// 실행: 저장소 맨 위에서 `npm --prefix api test -- test/published-index/live-embedding.test.cjs`. 키는 명령줄·파일·로그에 적지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readEmbeddingConfig } = require('../../dist/published-index/embedding-config');
const { createEmbeddingProvider } = require('../../dist/published-index/embedding-provider');
const { createEmbedPublicationHandler } = require('../../dist/published-index/embed-publication-handler');
const { createPublishedIndexWriter } = require('../../dist/published-index/published-index-writer');
const { createPublishedSearch } = require('../../dist/published-index/published-search');
const { chunkPublication, fakeAiRun, indexRow, insertItem, insertMember, insertPublication, recordingLogger } = require('./support.cjs');

// 서로 다른 주제의 문단 셋. 두 문단을 이으면 1,000자를 넘도록 길이를 맞춰 문단마다 조각 하나가 되게 한다.
const pad = (text) => (text + ' ').repeat(Math.ceil(600 / (text.length + 1))).slice(0, 600).trim();
const PARAGRAPHS = [
  pad('이 프로젝트의 배포는 개발 서버에 먼저 올린 뒤 확인하고, 문제가 없으면 운영 서버에 올리는 순서로 진행했다.'),
  pad('점심 메뉴는 팀원들이 돌아가며 정했고, 금요일에는 근처 국수집에 함께 갔다.'),
  pad('데이터베이스 백업은 매일 새벽에 자동으로 받고, 일주일 지난 백업 파일은 지운다.'),
];
const QUESTION = '서비스를 서버에 배포하는 절차가 어떻게 되나요?';

let db;
before(async () => {
  if (!process.env.CATCHU_EMBEDDING_API_KEY?.trim()) return;
  db = await openTestDataSource();
  await resetTestDatabase(db);
});
after(async () => { await db?.destroy(); });

test('S12 실제 Voyage: 발행본을 나누고 임베딩한 뒤 같은 뜻의 질문으로 검색하면 맞는 조각이 원문 위치와 함께 맨 위에 나온다', async (t) => {
  const config = readEmbeddingConfig(process.env);
  if (config.apiKey === null) {
    console.log(JSON.stringify({ test: 'S12', status: '미실행', reason: 'CATCHU_EMBEDDING_API_KEY 없음' }));
    t.skip('미실행: CATCHU_EMBEDDING_API_KEY가 없어 실제 Voyage 시험을 건너뜀(통과 아님)');
    return;
  }
  const now = new Date();
  const body = PARAGRAPHS.join('\n\n');
  const publicationId = await insertPublication(db, await insertMember(db));
  await insertItem(db, publicationId, { position: 1, kind: 'TEXT_MATERIAL', snapshot: { body } });
  await chunkPublication(db, createPublishedIndexWriter({ dataSource: db, aiRun: fakeAiRun(), logger: recordingLogger() }), publicationId, now);

  // 키가 있으므로 판정표대로 Voyage 제공자가 만들어진다(NODE_ENV와 무관).
  const provider = createEmbeddingProvider(config, process.env, { logger: recordingLogger() });
  const logger = recordingLogger();
  await createEmbedPublicationHandler({ dataSource: db, provider, logger })({ runKey: 'live', payload: { publicationId } });
  const status = (await indexRow(db, publicationId)).status;
  const event = logger.entries[0]?.entry;
  const { hits } = await createPublishedSearch({ dataSource: db, provider, logger: recordingLogger() }).search(publicationId, QUESTION, 3);
  console.log(JSON.stringify({ test: 'S12', status, chunkCount: event?.chunkCount ?? null,
    top: hits[0] ? { fieldPath: hits[0].fieldPath, charStart: hits[0].charStart, charEnd: hits[0].charEnd } : null }));

  assert.equal(status, 'DONE', `임베딩 결과: ${event?.event} ${event?.failure ?? ''}`);
  assert.equal(event.chunkCount, 3);
  const expectedStart = 0;
  assert.deepEqual([hits[0].fieldPath, hits[0].charStart, hits[0].charEnd], ['body', expectedStart, PARAGRAPHS[0].length]);
  assert.equal(body.slice(hits[0].charStart, hits[0].charEnd), hits[0].text);
  assert.ok(hits[0].score > hits[1].score);
});
