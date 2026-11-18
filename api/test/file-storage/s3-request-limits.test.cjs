// S3 요청 시간 제한과 시도 횟수(#420, 팀장 결정 2026-11-17: 연결 5초, 응답 유휴 15초, 총 시도 2회).
// 실제 AWS에는 접속하지 않는다. 실제 SDK 클라이언트(@aws-sdk/client-s3)를 로컬 대역 서버(s3-stub-server.cjs)에 붙여 본다.
// 먼저 정한 시나리오:
// - T-1 실제 실행이 쓰는 클라이언트(S3FileStorage가 스스로 만든 것)에 연결 5초·유휴 15초·총 시도 2회가 들어 있다.
// - T-2 응답하지 않는 대역: put·get·copy·delete·deletePrefix가 끝없이 기다리지 않고 StorageUnavailable(IO_FAILED)로 끝난다.
//   원인은 SDK의 TimeoutError로 남고, 대역에는 시도 횟수만큼만 연결이 온다(총 2회 = 다시 시도 1회).
//   시험은 연결 제한 5초 → 1초, 유휴 제한 15초 → 300 ms로 줄이고 총 시도 2회는 그대로 둔다(SHORT_LIMITS).
//   시험 자체에도 시간 제한을 둔다: 호출이 SHORT_BOUND_MS 안에 끝나지 않으면 기다리지 않고 실패하고, 끝날 때 대역·클라이언트를 닫아
//   남은 요청을 끊은 뒤 소켓과 진행 중 호출이 남지 않았는지 본다.
// - T-3 바로 응답하는 대역: 같은 설정의 클라이언트로 put·delete가 한 번의 요청으로 성공한다(시간 제한이 정상 요청을 막지 않는다).
// 실패 조건: 제한 시간 안에 끝나지 않음, 시도가 2회를 넘음, 오류가 StorageUnavailable이 아님, 정상 요청이 실패하거나 다시 시도됨.
// 보지 않는 것: 연결 자체가 맺어지지 않는 경우(연결 5초)는 로컬에서 안정적으로 만들 수 없어 설정 값만 본다(T-1). 실제 S3는 #420에서 따로 확인한다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FileNotFound, StorageUnavailable, materialKey, memberPrefix } = require('../../dist/file-storage/file-storage');
const { S3_REQUEST_LIMITS, S3FileStorage, createS3Client } = require('../../dist/file-storage/s3-file-storage');
const { SHORT_BOUND_MS, SHORT_LIMITS, settleWithin, startAnsweringServer, startSilentServer, stubClient } = require('./s3-stub-server.cjs');

const BUCKET = 'catchu-test-bucket';
const MEMBER = '11111111-1111-4111-8111-111111111111';
const MATERIAL = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const KEY = materialKey(MEMBER, MATERIAL);

/** T-2 전체의 시간 제한. 다섯 호출이 모두 SHORT_BOUND_MS까지 걸려도 그 안이고, 넘으면 시험 실행기가 실패로 끝낸다. */
const T2_TIMEOUT_MS = 60_000;

const timeoutCause = (error) => {
  for (let cause = error?.cause, depth = 0; cause && depth < 5; cause = cause.cause, depth += 1) {
    if (cause.name === 'TimeoutError') return true;
  }
  return false;
};

test('T-1 실제 실행이 쓰는 S3 클라이언트에는 연결 5초·응답 유휴 15초·총 시도 2회가 들어 있다', async (t) => {
  assert.deepEqual({ ...S3_REQUEST_LIMITS }, { connectionTimeoutMs: 5_000, socketTimeoutMs: 15_000, maxAttempts: 2 });
  assert.ok(Object.isFrozen(S3_REQUEST_LIMITS));

  // S3FileStorage가 client 없이 스스로 만든 클라이언트를 본다(접속은 첫 호출 때라 여기서는 네트워크를 쓰지 않는다).
  const own = new S3FileStorage(BUCKET).client;
  const made = createS3Client();
  t.after(() => { own.destroy(); made.destroy(); });
  for (const client of [own, made]) {
    assert.equal(await client.config.maxAttempts(), 2);
    // 핸들러 설정은 첫 요청 때 풀리는 Promise다(@smithy/node-http-handler 4.14.2). 요청 없이 그 값을 기다려 읽는다.
    const handler = await client.config.requestHandler.configProvider;
    assert.equal(handler.connectionTimeout, 5_000);
    assert.equal(handler.socketTimeout, 15_000);
    assert.equal(handler.requestTimeout, undefined, '요청 전체 시간 제한은 두지 않았다(경고만 남기는 설정을 쓰지 않는다)');
  }
});

test('T-2 응답하지 않는 대역에서 다섯 메서드는 제한 시간 안에 StorageUnavailable(IO_FAILED)로 끝나고, 시도는 호출마다 총 2회다', { timeout: T2_TIMEOUT_MS }, async (t) => {
  assert.deepEqual({ ...SHORT_LIMITS }, { connectionTimeoutMs: 1_000, socketTimeoutMs: 300, maxAttempts: 2 });
  const silent = await startSilentServer(t);
  const client = stubClient(t, silent.endpoint, SHORT_LIMITS);
  const storage = new S3FileStorage(BUCKET, client);
  // 시작한 호출을 모두 적어 둔다. 시험이 어떻게 끝나든 대역과 클라이언트를 닫아 남은 요청을 끊고, 호출이 모두 끝났는지 확인한다.
  const started = [];
  t.after(async () => {
    await silent.close();
    client.destroy();
    await settleWithin(Promise.allSettled(started), SHORT_BOUND_MS, 'T-2 정리: 시작한 S3 호출이 모두 끝남');
    assert.equal(silent.openSockets(), 0, 'T-2 정리: 대역에 열린 소켓이 없다');
  });
  const calls = {
    put: () => storage.put(KEY, Buffer.from('%PDF-1.4\n'), 'application/pdf'),
    get: () => storage.get(KEY),
    copy: () => storage.copy(KEY, materialKey(MEMBER, OTHER)),
    delete: () => storage.delete(KEY),
    deletePrefix: () => storage.deletePrefix(memberPrefix(MEMBER)),
  };
  for (const [name, call] of Object.entries(calls)) {
    const before = silent.connections();
    const startedAt = Date.now();
    const outcome = call().then(() => ({ ok: true }), (error) => ({ ok: false, error }));
    started.push(outcome);
    // 호출이 끝나지 않아도 여기서 SHORT_BOUND_MS 뒤에 실패한다(끝없이 기다리지 않는다).
    const { ok, error } = await settleWithin(outcome, SHORT_BOUND_MS, `${name}: 응답하지 않는 대역에서 호출이 끝남`);
    const elapsed = Date.now() - startedAt;
    assert.equal(ok, false, `${name}: 성공하면 안 된다`);
    assert.ok(error instanceof StorageUnavailable, `${name}: ${error?.name}`);
    assert.ok(!(error instanceof FileNotFound));
    assert.equal(error.reason, 'IO_FAILED');
    assert.ok(timeoutCause(error), `${name}: 원인이 TimeoutError로 남는다`);
    assert.equal(silent.connections() - before, S3_REQUEST_LIMITS.maxAttempts, `${name}: 시도는 총 2회`);
    assert.ok(elapsed >= SHORT_LIMITS.socketTimeoutMs * S3_REQUEST_LIMITS.maxAttempts - 50, `${name}: 두 시도 모두 유휴 제한까지 기다린다(${elapsed}ms)`);
  }
});

test('T-3 바로 응답하는 대역에서는 같은 설정의 클라이언트로 put·delete가 요청 한 번으로 성공한다', async (t) => {
  const answering = await startAnsweringServer(t);
  const storage = new S3FileStorage(BUCKET, stubClient(t, answering.endpoint));
  await storage.put(KEY, Buffer.from('%PDF-1.4\n'), 'application/pdf');
  await storage.delete(KEY);
  const path = `/${BUCKET}/${KEY}`;
  assert.deepEqual(answering.requests(), [{ method: 'PUT', path }, { method: 'DELETE', path }]);
});
