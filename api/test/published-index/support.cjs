// U3 발행본 색인·검색 시험의 공용 자료와 대역(기능 설계 「주요 시나리오와 확인」의 시험 자료·합성 임베딩 제공자).
// 시험 자료는 모두 공개해도 되는 합성 글이다. 발행본 표는 계약 C-07 모양으로 직접 넣는다(U4 발행 API를 대신함).
const { randomUUID } = require('node:crypto');
const { EmbeddingProviderError } = require('../../dist/published-index/embedding-provider');
const { syntheticEmbedding } = require('../../dist/published-index/synthetic-embedding-provider');

/** seed 문장을 이어 정확히 length자로 만든다. 끝 글자가 공백이면 마침표로 바꿔 앞뒤 공백 제외(BR1.4)가 길이를 바꾸지 않게 한다. */
function filler(seed, length) {
  let text = '';
  while (text.length < length) text += seed;
  text = text.slice(0, length);
  return /\s$/.test(text) ? text.slice(0, -1) + '.' : text;
}

/** 화면·검색에 나오면 안 되는 글(aiDraft·제목)을 찾기 쉬운 표식 */
const AI_DRAFT_MARKER = 'AIDRAFTMARKER';
const TITLE_MARKER = 'TITLEMARKER';

function catchSnapshot() {
  return {
    workFacts: ['로그인 오류 문구를 한 파일로 모았다.', '네트워크 오류일 때 다시 시도 버튼을 보이게 했다.'],
    subjectContribution: '문구 목록 파일을 만들고 화면 세 곳이 그 파일을 쓰게 바꿨다.',
    evidence: [{
      sourceUrl: 'https://github.com/synthetic-owner/synthetic-repo/pull/41',
      sourceRevision: 'abc1234',
      representedFacts: ['PR #41에서 web/lib/messages.ts를 더했다.', '리뷰 반영으로 버튼 문구를 통일했다.'],
    }],
    authorDescription: filler('회고: 문구가 화면마다 달라 사용자가 헷갈렸고, 한곳에 모아 고쳤다. ', 300),
    aiDraft: `${AI_DRAFT_MARKER} 이 작업은 사용자 경험을 크게 개선했다고 볼 수 있다.`,
    mismatch: false,
  };
}

/** 빈 줄로 나뉜 문단 600·300·900·700자(기능 설계 「조각 나누기 예」) */
function textBody() {
  return [
    filler('첫째 문단은 배포 순서를 설명한다. 개발 서버에 먼저 올린다. ', 600),
    filler('둘째 문단은 시험 방법이다. ', 300),
    filler('셋째 문단은 장애 기록이다. 큐가 멈춘 날의 원인을 적었다. ', 900),
    filler('넷째 문단은 다음 계획이다. 검색 품질을 다시 본다. ', 700),
  ].join('\n\n');
}

async function insertMember(db) {
  const memberId = randomUUID();
  await db.query("INSERT INTO member_account VALUES ($1, $2, 'ACTIVE')", [memberId, 'fixture:' + memberId]);
  return memberId;
}

async function insertPublication(db, memberId) {
  const publicationId = randomUUID();
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
    VALUES ($1, $2, $3, $4, now(), now() + interval '2160 hours')`, [publicationId, memberId, `${TITLE_MARKER} 발행본`, randomUUID()]);
  return publicationId;
}

async function insertItem(db, publicationId, { position, kind, snapshot }) {
  const publishedItemId = randomUUID();
  await db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [publishedItemId, publicationId, position, kind, randomUUID(), `${TITLE_MARKER} 항목 ${position}`, JSON.stringify(snapshot)]);
  return publishedItemId;
}

/** 발행본 A: Catch 1개(aiDraft 있음) + 텍스트 자료 1개. PDF 항목은 published_pdf_page(U8)가 없어 넣지 않는다. */
async function publicationA(db, memberId) {
  const owner = memberId ?? await insertMember(db);
  const publicationId = await insertPublication(db, owner);
  const catchValue = catchSnapshot();
  const body = textBody();
  const catchItemId = await insertItem(db, publicationId, { position: 1, kind: 'CATCH', snapshot: catchValue });
  const textItemId = await insertItem(db, publicationId, { position: 2, kind: 'TEXT_MATERIAL', snapshot: { body } });
  return { memberId: owner, publicationId, catchItemId, textItemId, catchSnapshot: catchValue, body };
}

/** 발행본 B: 텍스트 자료 1개 */
async function publicationB(db, memberId, body = '발행본 B의 텍스트 자료다. 다른 발행본 검색에 섞이면 안 된다.') {
  const owner = memberId ?? await insertMember(db);
  const publicationId = await insertPublication(db, owner);
  const textItemId = await insertItem(db, publicationId, { position: 1, kind: 'TEXT_MATERIAL', snapshot: { body } });
  return { memberId: owner, publicationId, textItemId, body };
}

/** 넘긴 발행 트랜잭션 안에서 조각을 나눈다(U4 publish-sequence 3단계를 대신함). */
function chunkPublication(db, writer, publicationId, now) {
  return db.transaction((manager) => writer.chunkInTransaction(manager, publicationId, now));
}

function recordingLogger() {
  const entries = [];
  const record = (level) => (entry) => entries.push({ level, entry });
  return { entries, log: record('log'), warn: record('warn'), error: record('error'), text: () => JSON.stringify(entries) };
}

/** C-02 모양의 기록용 AiRun. registerHandler·enqueueAfterCommit만 있다. */
function fakeAiRun(result = 'ENQUEUED') {
  const calls = [];
  const handlers = new Map();
  return {
    calls,
    handlers,
    registerHandler(kind, handler) { handlers.set(kind, handler); },
    async enqueueAfterCommit(kind, runKey, payload) { calls.push({ kind, runKey, payload }); return result; },
  };
}

/**
 * 기록용 시험 제공자. vectorFor(글)로 벡터를 정하고(기본은 결정적 합성 벡터), failAt 번째 호출에서 failure로 실패한다.
 * onCall(호출 번호, 종류)은 호출 중에 DB를 바꾸는 시험에 쓴다.
 */
function recordingProvider({ vectorFor = syntheticEmbedding, failAt = null, failure = 'API_STATUS', httpStatus = 400, onCall = null } = {}) {
  const calls = [];
  async function call(inputType, texts) {
    calls.push({ inputType, count: texts.length });
    if (onCall) await onCall(calls.length, inputType);
    if (failAt === calls.length) throw new EmbeddingProviderError(failure, httpStatus);
    return texts.map(vectorFor);
  }
  return {
    calls,
    async embedDocuments(texts) { return { vectors: await call('document', texts), totalTokens: texts.length }; },
    async embedQuery(text) { return { vector: (await call('query', [text]))[0], totalTokens: 1 }; },
  };
}

/** 길이 1의 1024차원 벡터. weights는 { 자리: 값 } */
function axisVector(weights) {
  const vector = new Array(1024).fill(0);
  for (const [index, value] of Object.entries(weights)) vector[Number(index)] = value;
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / norm);
}

async function indexRow(db, publicationId) {
  const rows = await db.query('SELECT status, deadline_at, updated_at FROM publication_index WHERE publication_id = $1', [publicationId]);
  return rows[0] ?? null;
}

async function setIndex(db, publicationId, status, deadlineAt) {
  await db.query('UPDATE publication_index SET status = $2, deadline_at = $3 WHERE publication_id = $1', [publicationId, status, deadlineAt]);
}

async function embeddedCount(db, publicationId) {
  return (await db.query('SELECT count(*)::int AS n FROM published_chunk WHERE publication_id = $1 AND embedding IS NOT NULL',
    [publicationId]))[0].n;
}

module.exports = {
  AI_DRAFT_MARKER, TITLE_MARKER, axisVector, catchSnapshot, chunkPublication, embeddedCount, fakeAiRun, filler, indexRow,
  insertItem, insertMember, insertPublication, publicationA, publicationB, recordingLogger, recordingProvider, setIndex, textBody,
};
