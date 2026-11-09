// 지키는 fetch: redirect 거부와 응답 본문 256 KiB 상한(U1 비기능 NFR2.2 ②③).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGuardedFetch, GuardedFetchError, MAX_RESPONSE_BODY_BYTES } = require('../../dist/ai-generation/guarded-fetch');
const { chunkedResponse, recordingFetch } = require('./fixtures.cjs');

const URL_ = 'https://api.anthropic.com/v1/messages';

test('상한은 256 KiB다', () => {
  assert.equal(MAX_RESPONSE_BODY_BYTES, 262144);
});

test('redirect를 따라가지 않게 요청하고 3xx 응답은 실패로 끝낸다', async () => {
  for (const status of [301, 302, 307, 308]) {
    const { fetch, requests } = recordingFetch([new Response(null, { status, headers: { location: 'https://evil.example/' } })]);
    await assert.rejects(createGuardedFetch(fetch)(URL_, { method: 'POST', body: '{}' }),
      (error) => error instanceof GuardedFetchError && error.failure === 'REDIRECT_REJECTED' && !error.message.includes('evil'));
    assert.equal(requests.length, 1, 'redirect 주소로 다시 요청하지 않는다');
    assert.equal(requests[0].init.redirect, 'manual');
    assert.equal(requests[0].init.method, 'POST', '받은 요청 설정은 그대로 넘긴다');
  }
});

test('정상 본문은 상태·머리글·글자 그대로 넘긴다', async () => {
  const { fetch } = recordingFetch([new Response('{"ok":true}', { status: 200, headers: { 'request-id': 'req_1' } })]);
  const response = await createGuardedFetch(fetch)(URL_);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('request-id'), 'req_1');
  assert.deepEqual(await response.json(), { ok: true });
});

test('본문이 256 KiB 딱 맞으면 그대로 읽는다', async () => {
  const { response: upstream } = chunkedResponse(64 * 1024, 4);
  const { fetch } = recordingFetch([upstream]);
  const body = await (await createGuardedFetch(fetch)(URL_)).arrayBuffer();
  assert.equal(body.byteLength, MAX_RESPONSE_BODY_BYTES);
});

test('본문이 256 KiB를 1바이트라도 넘으면 실패로 끝낸다', async () => {
  const { fetch } = recordingFetch([new Response(new Uint8Array(MAX_RESPONSE_BODY_BYTES + 1))]);
  const response = await createGuardedFetch(fetch)(URL_);
  await assert.rejects(response.arrayBuffer(), (error) => error instanceof GuardedFetchError && error.failure === 'RESPONSE_TOO_LARGE');
});

test('작은 조각의 합이 상한을 넘으면 그 자리에서 읽기를 멈추고 원래 본문을 닫는다', async () => {
  const { response: upstream, state } = chunkedResponse(1024, 1000);
  const { fetch } = recordingFetch([upstream]);
  const response = await createGuardedFetch(fetch)(URL_);
  await assert.rejects(response.text(), (error) => error instanceof GuardedFetchError && error.failure === 'RESPONSE_TOO_LARGE');
  // 257번째 조각에서 상한을 넘는다. 스트림이 미리 채우는 조각 1개를 빼면 그 뒤를 읽지 않는다.
  assert.ok(state.pulled >= 257 && state.pulled <= 258, `읽은 조각 ${state.pulled}개`);
  assert.equal(state.cancelled, true);
});

test('오류 상태의 본문도 같은 상한을 지킨다', async () => {
  const { fetch } = recordingFetch([new Response(new Uint8Array(MAX_RESPONSE_BODY_BYTES + 10), { status: 500 })]);
  const response = await createGuardedFetch(fetch)(URL_);
  assert.equal(response.status, 500);
  await assert.rejects(response.text(), GuardedFetchError);
});
