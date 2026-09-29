import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiResponse } from '../src/lib/api-response.ts';

test('정상 빈 목록과 부분 결과는 성공으로 보존한다', async () => {
  for (const data of [[], { processing: 'EMPTY' }, { processing: 'FAILED' }, { processing: 'PARTIAL_FAILED', items: [{ id: 'catch-1' }] }]) {
    assert.deepEqual(await readApiResponse(Response.json(data)), { kind: 'success', status: 200, data });
  }
  assert.deepEqual(await readApiResponse(new Response(null, { status: 204 })), { kind: 'success', status: 204, data: null });
});

test('HTTP 상태와 업무 오류 code를 함께 보존하며 401을 자동 이동시키지 않는다', async () => {
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [401, 'AUTH_REQUIRED'], [401, 'AUTH_INVALID'], [401, 'LINK_PASSWORD_REQUIRED'], [401, 'LINK_PASSWORD_INVALID'], [403, 'INTERNAL_ERROR'], [404, 'LINK_UNAVAILABLE'], [409, 'ANALYSIS_IN_PROGRESS'], [500, 'INTERNAL_ERROR'], [409, 'FUTURE_CODE']]) {
    assert.deepEqual(await readApiResponse(Response.json({ code, message: '안내' }, { status })), { kind: 'api-error', status, code, message: '안내' });
  }
});

test('명세 details만 전달한다', async () => {
  const result = await readApiResponse(Response.json({ code: 'VALIDATION_FAILED', message: '안내', details: { violations: [{ field: 'title', reason: 'required', value: 'secret' }], extra: 'secret' } }, { status: 400 }));
  assert.deepEqual(result.details, { violations: [{ field: 'title', reason: 'required' }] });
  const conflict = await readApiResponse(Response.json({ code: 'ANALYSIS_IN_PROGRESS', message: '안내', details: { existingRequestId: 'req-1' } }, { status: 409 }));
  assert.deepEqual(conflict.details, { existingRequestId: 'req-1' });
});

test('비정상 응답과 본문 읽기 실패는 빈 결과로 바꾸지 않는다', async () => {
  for (const response of [new Response('<html>fail</html>', { status: 502 }), Response.json({ message: 'missing code' }, { status: 400 }), Response.json({ code: 'X', message: '안내', details: { violations: [null] } }, { status: 400 }), Response.json({ code: 'X', message: '안내', details: { existingRequestId: '' } }, { status: 409 }), new Response('broken', { status: 200 })]) {
    assert.deepEqual(await readApiResponse(response), { kind: 'lookup-failed', status: response.status, code: 'LOOKUP_FAILED' });
  }
  const consumed = Response.json({});
  await consumed.text();
  assert.equal((await readApiResponse(consumed)).kind, 'lookup-failed');
});

test('네트워크 실패는 HTTP 상태 없이 조회 실패로 반환한다', async () => {
  assert.deepEqual(await readApiResponse(Promise.reject(new TypeError('network'))), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
});
