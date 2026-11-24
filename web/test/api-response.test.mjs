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

// 발행 프리셋 U2 BR5.2·NFR4.2·NFR4.3: 막힘 칸 blockedSources는 세 칸만 옮기고 모양이 어긋나면 응답 모양 어긋남이다. catchIds는 옮기지 않는다.
// 먼저 정한 실패 조건: 막힘 칸이 버려짐, 남는 속성이 화면까지 옴, 어긋난 모양이 성공처럼 지나감.
const P = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const blocked = (blockedSources, status = 409, code = 'CATCH_PRIVATE') =>
  readApiResponse(Response.json({ code, message: '비공개 Catch는 발행할 수 없습니다.', details: { blockedSources } }, { status }));

test('blockedSources는 presetId·kind·sourceId 세 칸만 옮기고 남는 속성은 버린다', async () => {
  const result = await blocked([
    { presetId: P, kind: 'CATCH', sourceId: S, title: '합성 제목', name: '프리셋 이름' },
    { presetId: P, kind: 'TEXT_MATERIAL', sourceId: S }, { presetId: P, kind: 'PDF_MATERIAL', sourceId: S },
  ]);
  assert.deepEqual(result, {
    kind: 'api-error', status: 409, code: 'CATCH_PRIVATE', message: '비공개 Catch는 발행할 수 없습니다.',
    details: { blockedSources: [{ presetId: P, kind: 'CATCH', sourceId: S }, { presetId: P, kind: 'TEXT_MATERIAL', sourceId: S }, { presetId: P, kind: 'PDF_MATERIAL', sourceId: S }] },
  });
  // 추출 미완료 400은 violations와 함께 온다.
  const incomplete = await readApiResponse(Response.json({ code: 'VALIDATION_FAILED', message: '안내', details: {
    violations: [{ field: 'presetIds', reason: 'extractionIncomplete' }], blockedSources: [{ presetId: P, kind: 'PDF_MATERIAL', sourceId: S }],
  } }, { status: 400 }));
  assert.deepEqual(incomplete.details, { violations: [{ field: 'presetIds', reason: 'extractionIncomplete' }], blockedSources: [{ presetId: P, kind: 'PDF_MATERIAL', sourceId: S }] });
});

test('blockedSources의 어긋난 kind·빈 ID·글자 아닌 ID·배열 아님·줄이 객체 아님은 응답 모양 어긋남이다', async () => {
  for (const value of [
    [{ presetId: P, kind: 'SNIPPET', sourceId: S }], [{ presetId: P, kind: 'catch', sourceId: S }], [{ presetId: '', kind: 'CATCH', sourceId: S }],
    [{ presetId: P, kind: 'CATCH', sourceId: '' }], [{ presetId: 1, kind: 'CATCH', sourceId: S }], [{ presetId: P, kind: 'CATCH' }],
    { presetId: P, kind: 'CATCH', sourceId: S }, 'CATCH', null, [null],
  ]) {
    assert.deepEqual(await blocked(value), { kind: 'lookup-failed', status: 409, code: 'LOOKUP_FAILED' }, JSON.stringify(value));
  }
});

test('api가 더는 보내지 않는 catchIds는 와도 옮기지 않는다', async () => {
  const result = await readApiResponse(Response.json({ code: 'CONFIRMATION_REQUIRED', message: '안내', details: { catchIds: [S] } }, { status: 409 }));
  assert.deepEqual(result, { kind: 'api-error', status: 409, code: 'CONFIRMATION_REQUIRED', message: '안내', details: {} });
  assert.equal('catchIds' in result.details, false);
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
