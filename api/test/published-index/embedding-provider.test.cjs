// U3 임베딩 설정·제공자(security-design 「키와 합성 제공자」·「Voyage 외부 호출」·「오류 분류」, BR2.3·BR6.1·BR6.2).
// Voyage 전송은 시험용 fetch로 기록한 HTTP 응답을 돌려준다. 실제 Voyage는 부르지 않는다(S12는 live-embedding.test.cjs).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  EMBEDDING_DIMENSION, EMBEDDING_MODEL, VOYAGE_EMBEDDINGS_URL, embeddingDeadline, readEmbeddingConfig,
} = require('../../dist/published-index/embedding-config');
const { createEmbeddingProvider, EmbeddingProviderError } = require('../../dist/published-index/embedding-provider');
const { parseEmbeddingResponse } = require('../../dist/published-index/voyage-embedding-provider');
const { createSyntheticEmbeddingProvider, syntheticEmbedding } = require('../../dist/published-index/synthetic-embedding-provider');
const { recordingLogger } = require('./support.cjs');

const API_KEY = 'synthetic-voyage-key-not-real';
const SENT_TEXT = '보낸 조각 글은 오류에 옮겨지면 안 된다';
const vector = (value = 0.01) => new Array(EMBEDDING_DIMENSION).fill(value);
const encoder = new TextEncoder();

function okBody(count, { tokens = 42, embedding = vector() } = {}) {
  return { object: 'list', model: EMBEDDING_MODEL, usage: { total_tokens: tokens },
    data: Array.from({ length: count }, (_, index) => ({ object: 'embedding', index, embedding })) };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 받은 주소·init을 기록하고 respond(init)의 응답을 돌려주는 fetch */
function recordingFetch(respond) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return respond(init, calls.length); };
  return { fetch, calls };
}
function voyage(respond, options = {}) {
  const recorder = recordingFetch(respond);
  const provider = createEmbeddingProvider({ apiKey: API_KEY }, { NODE_ENV: 'production' }, { fetch: recorder.fetch, ...options });
  return { provider, calls: recorder.calls };
}
const failure = (kind, httpStatus = null) => (error) => {
  assert.ok(error instanceof EmbeddingProviderError, `EmbeddingProviderError가 아님: ${error?.name}`);
  assert.equal(error.failure, kind);
  assert.equal(error.httpStatus, httpStatus);
  assert.ok(!error.message.includes(SENT_TEXT) && !error.message.includes(API_KEY) && !error.message.includes('voyageai'));
  return true;
};
/** 지정한 바이트 덩어리를 차례로 흘리는 본문 */
function streamOf(chunks, onCancel) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel() { onCancel?.(); },
  });
}

test('문서 임베딩 요청: 고정 주소·POST·정한 본문 칸만, 키는 Authorization 머리글에만 있다', async () => {
  const { provider, calls } = voyage(() => json(okBody(2)));
  const result = await provider.embedDocuments(['조각 하나', '조각 둘']);
  assert.equal(result.vectors.length, 2);
  assert.equal(result.vectors[0].length, EMBEDDING_DIMENSION);
  assert.equal(result.totalTokens, 42);
  const [{ url, init }] = calls;
  assert.equal(url, VOYAGE_EMBEDDINGS_URL);
  assert.equal(url, 'https://api.voyageai.com/v1/embeddings');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual', 'U1 지키는 fetch를 거친다');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(init.body), { input: ['조각 하나', '조각 둘'], model: 'voyage-4-lite', input_type: 'document', output_dimension: 1024 });
  assert.equal(init.headers.Authorization, `Bearer ${API_KEY}`);
  assert.ok(!init.body.includes(API_KEY));
  // 제공자 객체는 키를 내보내지 않는다.
  assert.deepEqual(Object.keys(provider).sort(), ['embedDocuments', 'embedQuery']);
  assert.ok(!JSON.stringify(provider).includes(API_KEY) && !String(provider).includes(API_KEY));
});

test('질문 임베딩은 질문 하나를 query 입력으로 보내고, 응답 index 순서대로 벡터를 맞춘다', async () => {
  const { provider, calls } = voyage(() => json(okBody(1, { tokens: 3 })));
  const { vector: queryVector, totalTokens } = await provider.embedQuery('배포 순서가 어떻게 되나요?');
  assert.equal(queryVector.length, EMBEDDING_DIMENSION);
  assert.equal(totalTokens, 3);
  assert.deepEqual(JSON.parse(calls[0].init.body), { input: '배포 순서가 어떻게 되나요?', model: 'voyage-4-lite', input_type: 'query', output_dimension: 1024 });

  const swapped = { data: [{ index: 1, embedding: vector(0.2) }, { index: 0, embedding: vector(0.1) }] };
  const parsed = parseEmbeddingResponse(JSON.stringify(swapped), 2);
  assert.deepEqual([parsed.vectors[0][0], parsed.vectors[1][0]], [0.1, 0.2]);
  assert.equal(parsed.totalTokens, 0, '토큰 칸이 없으면 0(로그용)');
});

test('빈 글 목록은 Voyage를 부르지 않는다', async () => {
  const { provider, calls } = voyage(() => json(okBody(0)));
  assert.deepEqual(await provider.embedDocuments([]), { vectors: [], totalTokens: 0 });
  assert.equal(calls.length, 0);
});

test('redirect 응답은 따라가지 않고 REDIRECT_REJECTED', async () => {
  const { provider } = voyage(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }));
  await assert.rejects(provider.embedDocuments([SENT_TEXT]), failure('REDIRECT_REJECTED'));
});

test('응답 본문 상한은 8 MiB다: 256 KiB를 넘는 정상 응답은 받고, 본문 도중 8 MiB를 넘으면 RESPONSE_TOO_LARGE', async () => {
  const texts = Array.from({ length: 128 }, (_, i) => `조각 ${i}`);
  const big = JSON.stringify(okBody(128, { embedding: vector(0.0123456789) }));
  assert.ok(big.length > 256 * 1024 && big.length < 8 * 1024 * 1024, `본문 ${big.length}바이트`);
  const ok = voyage(() => new Response(big, { status: 200 }));
  assert.equal((await ok.provider.embedDocuments(texts)).vectors.length, 128);

  const mib = new Uint8Array(1024 * 1024).fill(32);
  const huge = voyage(() => new Response(streamOf([encoder.encode('{"data":['), ...Array(9).fill(mib)]), { status: 200 }));
  await assert.rejects(huge.provider.embedDocuments([SENT_TEXT]), failure('RESPONSE_TOO_LARGE'));
});

test('본문을 천천히 흘리거나 머리글이 오지 않으면 시간 제한에서 TIMEOUT(본문 읽기까지 덮음)', async () => {
  // 실제 fetch처럼 신호가 끊기면 본문 스트림을 그 이유로 실패시킨다.
  const slowBody = (init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"data":['));
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
    },
  }), { status: 200 });
  const slow = voyage(slowBody, { documentTimeoutMs: 50 });
  await assert.rejects(slow.provider.embedDocuments([SENT_TEXT]), failure('TIMEOUT'));

  const noHeaders = voyage((init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    { queryTimeoutMs: 50 });
  await assert.rejects(noHeaders.provider.embedQuery(SENT_TEXT), failure('TIMEOUT'));
});

test('2xx가 아닌 응답은 본문을 읽지 않고 버리며 API_STATUS와 HTTP 상태만 낸다(보낸 글이 오류에 없음)', async () => {
  let cancelled = false;
  const echo = encoder.encode(JSON.stringify({ detail: `invalid input: ${SENT_TEXT}` }));
  // 닫히지 않는 본문: 읽으면 끝나지 않으므로, 버렸는지는 cancel이 불렸는지로 본다.
  const openBody = () => new ReadableStream({
    start(controller) { controller.enqueue(echo); },
    cancel() { cancelled = true; },
  });
  const { provider } = voyage(() => new Response(openBody(), { status: 400 }));
  await assert.rejects(provider.embedDocuments([SENT_TEXT]), failure('API_STATUS', 400));
  assert.equal(cancelled, true);
  const rateLimited = voyage(() => json({ detail: SENT_TEXT }, 429));
  await assert.rejects(rateLimited.provider.embedQuery(SENT_TEXT), failure('API_STATUS', 429));
});

test('응답 모양이 다르면 INVALID_RESPONSE: JSON 아님·개수·차원·유한하지 않은 수·index 중복', async () => {
  const cases = [
    'not json',
    JSON.stringify({ nothing: true }),
    JSON.stringify(okBody(1)),
    JSON.stringify(okBody(2, { embedding: new Array(1023).fill(0.1) })),
    JSON.stringify(okBody(2)).replace('0.01', '1e999'),
    JSON.stringify(okBody(2)).replace('0.01', '"0.01"'),
    JSON.stringify({ data: [{ index: 0, embedding: vector() }, { index: 0, embedding: vector() }] }),
    JSON.stringify({ data: [{ index: 0, embedding: vector() }, { index: 5, embedding: vector() }] }),
  ];
  for (const body of cases) {
    const { provider } = voyage(() => new Response(body, { status: 200 }));
    await assert.rejects(provider.embedDocuments([SENT_TEXT, '둘째']), failure('INVALID_RESPONSE'));
  }
});

test('전송 오류는 원래 메시지를 옮기지 않고 CONNECTION_FAILED', async () => {
  const { provider } = voyage(() => { throw new TypeError(`fetch failed while sending ${SENT_TEXT}`); });
  await assert.rejects(provider.embedQuery(SENT_TEXT), failure('CONNECTION_FAILED'));
});

test('설정은 CATCHU_EMBEDDING_API_KEY만 읽고 공백뿐인 값은 키 없음이다(VOYAGE_API_KEY는 읽지 않음)', () => {
  assert.deepEqual(readEmbeddingConfig({ CATCHU_EMBEDDING_API_KEY: '  key-1  ' }), { apiKey: 'key-1' });
  assert.deepEqual(readEmbeddingConfig({ CATCHU_EMBEDDING_API_KEY: '   ' }), { apiKey: null });
  assert.deepEqual(readEmbeddingConfig({ VOYAGE_API_KEY: 'sdk-name' }), { apiKey: null });
  const now = new Date('2026-11-02T00:00:00Z');
  assert.equal(embeddingDeadline(now).toISOString(), '2026-11-02T00:10:00.000Z');
});

test('제공자 만들기 판정표: 키 있음 → Voyage, 키 없음 + development·test → 합성(경고 한 줄), 그 밖 → 키 값 없는 오류', async () => {
  // 키 있음: NODE_ENV와 상관없이 Voyage(시험용 fetch가 불린다).
  for (const NODE_ENV of ['production', 'test', undefined]) {
    const recorder = recordingFetch(() => json(okBody(1)));
    const provider = createEmbeddingProvider({ apiKey: API_KEY }, { NODE_ENV }, { fetch: recorder.fetch });
    await provider.embedQuery('질문');
    assert.equal(recorder.calls.length, 1);
  }
  for (const NODE_ENV of ['development', 'test']) {
    const logger = recordingLogger();
    const provider = createEmbeddingProvider({ apiKey: null }, { NODE_ENV }, { logger });
    assert.deepEqual(logger.entries, [{ level: 'warn', entry: { event: 'EMBEDDING_PROVIDER_SYNTHETIC' } }]);
    assert.equal((await provider.embedQuery('질문')).totalTokens, 0);
  }
  for (const NODE_ENV of ['production', undefined, 'Test', 'staging']) {
    assert.throws(() => createEmbeddingProvider({ apiKey: null }, { NODE_ENV }, { logger: recordingLogger() }),
      { message: 'CATCHU_EMBEDDING_API_KEY가 비어 있어 임베딩 제공자를 만들 수 없습니다.' });
  }
});

test('합성 제공자는 같은 글에 같은 1024차원 단위 벡터를 주고 다른 글에는 다른 벡터를 준다', async () => {
  const provider = createSyntheticEmbeddingProvider();
  const { vectors, totalTokens } = await provider.embedDocuments(['같은 글', '같은 글', '다른 글']);
  assert.equal(totalTokens, 0);
  assert.deepEqual(vectors[0], vectors[1]);
  assert.notDeepEqual(vectors[0], vectors[2]);
  assert.equal(vectors[0].length, EMBEDDING_DIMENSION);
  assert.ok(Math.abs(Math.hypot(...vectors[0]) - 1) < 1e-9);
  assert.deepEqual((await provider.embedQuery('같은 글')).vector, vectors[0]);
  assert.deepEqual(syntheticEmbedding('같은 글'), vectors[0]);
});
