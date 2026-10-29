const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ReceiverStorageError } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { candidate, context, event, result, harness, validator } = require('../helpers/receiver-harness.cjs');

for (const state of ['RECEIVED', 'RUNNING', 'UNCERTAIN']) {
  test(`진행 ${state}: 결과 ID/Receipt 없이 관측하며 계약의 전이만 반영`, async () => {
    const { receiver, store } = harness();
    assert.equal(await receiver.receiveProgress(event({ state })), 'OBSERVED');
    assert.equal(store.state.processing, state === 'RECEIVED' ? 'QUEUED' : state);
    assert.equal(store.state.application, 'NOT_READY');
    assert.equal(store.state.received, null);
    assert.equal(store.savedObservations, 1);
  });
}

test('진행 형식/맥락/현재 시도 오류는 상태에 반영하지 않는다', async () => {
  const { receiver, store } = harness();
  for (const invalid of [null, {}, event({ resultId: 'unexpected' }), event({ schemaVersion: '1' }),
    event({ messageId: '' }), event({ state: 'SUCCEEDED' }), event({ observedAt: '2026-09-29 01:00:00Z' })]) {
    assert.equal(await receiver.receiveProgress(invalid), 'SCHEMA_INVALID');
  }
  assert.equal(await receiver.receiveProgress(event({ requestId: 'unknown' })), 'CONTEXT_MISMATCH');
  assert.equal(await receiver.receiveProgress(event({ attemptId: 'old-attempt' })), 'STALE_ATTEMPT');
  assert.equal(store.savedObservations, 0);
  assert.equal(store.state.processing, 'QUEUED');
});

for (const [outcome, candidates, failures] of [
  ['SUCCEEDED', [candidate()], []], ['EMPTY', [], []],
  ['PARTIAL_FAILED', [candidate()], [{ stage: 'COLLECTION', code: 'TEST_FAILED', message: '합성 오류' }]],
  ['FAILED', [], [{ stage: 'ANALYSIS', code: 'TEST_FAILED', message: '합성 오류' }]],
]) {
  test(`${outcome}: 메타데이터 저장 후 ACCEPTED, 등록/열람 준비/요청 종료는 하지 않는다`, async () => {
    const { receiver, store } = harness();
    const input = result({ outcome, candidates, failures });
    const output = await receiver.receiveResult(input);
    assert.equal(output.receipt.disposition, 'ACCEPTED');
    assert.equal(output.receipt.code, 'OK');
    assert.deepEqual(output.accepted.result, input);
    assert.equal(store.savedResults, 1);
    assert.equal(store.state.processing, outcome);
    assert.equal(store.state.application, 'PENDING');
    assert.equal(store.state.eligibleCandidateCount, candidates.length);
    assert.equal(store.state.lifecycle, 'ACTIVE');
    assert.equal(store.state.ownerResultsReady, false);
    assert.deepEqual(store.state.registeredCatchIds, []);
    assert.deepEqual(Object.keys(store.state.received).sort(), [
      'applicationRecordId', 'attemptId', 'payloadFingerprint', 'receivedAt', 'requestId', 'resultId',
    ]);
    assert.equal(await receiver.receiveProgress(event()), 'TERMINAL_UNCHANGED');
    assert.equal(await receiver.receiveProgress(event({ state: 'UNCERTAIN' })), 'TERMINAL_UNCHANGED');
    assert.equal(store.state.processing, outcome);
    assert.equal(store.savedObservations, 0);
  });
}

test('진행 이전 결과, 중복 진행, 확정되지 않은 진행 간 전이를 구분한다', async () => {
  const { receiver, store } = harness();
  await receiver.receiveProgress(event());
  await receiver.receiveProgress(event());
  await receiver.receiveProgress(event({ state: 'RECEIVED' }));
  await receiver.receiveProgress(event({ state: 'UNCERTAIN' }));
  assert.equal(store.state.processing, 'RUNNING');
  await receiver.receiveResult(result());
  assert.equal(store.state.processing, 'SUCCEEDED');
});

test('초안 실패 적합 후보는 제거하지 않으며 정상 0건과 기준 미달을 구분한다', async () => {
  const input = result({ outcome: 'PARTIAL_FAILED', failures: [
    { stage: 'DRAFT', code: 'DRAFT_FAILED', message: '합성 설명 생성 실패', candidateId: 'candidate-1' },
  ] });
  input.candidates[0].draft = { status: 'FAILED', content: null };
  const { receiver } = harness();
  const accepted = await receiver.receiveResult(input);
  assert.equal(accepted.receipt.disposition, 'ACCEPTED');
  assert.deepEqual(accepted.accepted.result.candidates[0].draft, { status: 'FAILED', content: null });
  const empty = await harness().receiver.receiveResult(result({ outcome: 'EMPTY', candidates: [],
    notProvided: [{ reason: 'BELOW_CRITERIA', count: 2 }] }));
  assert.equal(empty.receipt.disposition, 'ACCEPTED');
});

test('세 ID 누락/빈 값/타입 오류는 Receipt 없이 안전한 거부 코드만 남긴다', async () => {
  const { receiver, store, logs } = harness();
  for (const key of ['requestId', 'attemptId', 'resultId']) {
    for (const value of [undefined, '', null, 123, {}, []]) {
      const input = result({ [key]: value, extra: 'secret-do-not-log' });
      assert.deepEqual(await receiver.receiveResult(input), { receipt: null });
    }
  }
  for (const invalid of [null, [], 'secret-do-not-log', true]) {
    assert.deepEqual(await receiver.receiveResult(invalid), { receipt: null });
  }
  assert.equal(store.commits, 0);
  assert.ok(logs.every((entry) => entry.kind === 'Result' && entry.code === 'UNIDENTIFIABLE'));
  assert.equal(JSON.stringify(logs).includes('secret-do-not-log'), false);
});

test('식별 가능한 형식/의미 오류는 REJECTED/SCHEMA_INVALID이고 입력을 보정하지 않는다', async () => {
  const { receiver, store } = harness();
  const invalids = [result({ schemaVersion: '1' }), result({ memberId: '' }), result({ finishedAt: 'invalid' }),
    result({ finishedAt: '2026-02-30T00:00:00Z' }), result({ finishedAt: '2026-09-29 00:00:00Z' }),
    result({ extra: 'secret' }), result({ sourceMode: 'OTHER' }), result({ outcome: 'EMPTY' })];
  const missingTitle = result(); delete missingTitle.candidates[0].title; invalids.push(missingTitle);
  const noEvidence = result(); noEvidence.candidates[0].evidence = []; invalids.push(noEvidence);
  const badUri = result(); badUri.candidates[0].evidence[0].sourceUrl = 'not a uri'; invalids.push(badUri);
  const ineligible = result(); ineligible.candidates[0].eligibility.independentOfFailures = false; invalids.push(ineligible);
  for (const input of invalids) {
    const before = structuredClone(input);
    const output = await receiver.receiveResult(input);
    assert.equal(output.receipt.disposition, 'REJECTED');
    assert.equal(output.receipt.code, 'SCHEMA_INVALID');
    assert.equal(output.accepted, undefined);
    assert.deepEqual(input, before);
  }
  assert.equal(store.commits, 0);
});

test('회원/저장소/동의/범위/자료 모드/요청과 현재 시도를 접수 정본과 대조한다', async () => {
  for (const key of ['requestId', 'memberId', 'repositoryId', 'consentId', 'scopeRevision', 'sourceMode', 'attemptId']) {
    const { receiver, store } = harness();
    const before = structuredClone(store.state);
    const output = await receiver.receiveResult(result({ [key]: key === 'sourceMode' ? 'LIVE' : 'different' }));
    assert.equal(output.receipt.code, key === 'attemptId' ? 'STALE_ATTEMPT' : 'CONTEXT_MISMATCH');
    assert.deepEqual(store.state, before);
  }
});

test('같은 결과 재전달/객체 키 순서/새 messageId는 중복이며 payload 충돌을 덮어쓰지 않는다', async () => {
  const { receiver, store } = harness();
  const input = result();
  await receiver.receiveResult(input);
  const first = structuredClone(store.state);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  reordered.messageId = 'redelivery-message';
  const duplicate = await receiver.receiveResult(reordered);
  assert.equal(duplicate.receipt.code, 'ALREADY_RECEIVED');
  assert.equal(duplicate.accepted, undefined);
  for (const changed of [result({ resultId: 'second-result' }), result({ finishedAt: '2026-09-29T02:00:00Z' })]) {
    assert.equal((await receiver.receiveResult(changed)).receipt.code, 'PAYLOAD_CONFLICT');
  }
  input.candidates[0].title = 'changed';
  assert.equal((await receiver.receiveResult(input)).receipt.code, 'PAYLOAD_CONFLICT');
  assert.deepEqual(store.state, first);
  assert.equal(store.savedResults, 1);
});

test('동시 재전달은 저장소 원자 구간에서 한 번만 저장하고 중복으로 수렴한다(대역)', async () => {
  const { receiver, store } = harness();
  const responses = await Promise.all(Array.from({ length: 8 }, () => receiver.receiveResult(result())));
  assert.equal(responses.filter((entry) => entry.receipt.disposition === 'ACCEPTED').length, 1);
  assert.equal(responses.filter((entry) => entry.receipt.disposition === 'DUPLICATE').length, 7);
  assert.equal(store.savedResults, 1);
});

test('커밋 전에는 Receipt가 반환되지 않고 저장/커밋 실패에도 성공 확인을 만들지 않는다', async () => {
  const { receiver, store } = harness();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  store.beforeCommit = () => gate;
  let returned = false;
  const pending = receiver.receiveResult(result()).then((value) => { returned = true; return value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  assert.equal(store.state.received, null);
  release();
  assert.equal((await pending).receipt.disposition, 'ACCEPTED');
  for (const flag of ['failSave', 'failCommit']) {
    for (const kind of ['Result', 'Progress']) {
      const failure = harness(); failure.store[flag] = true;
      const before = structuredClone(failure.store.state);
      await assert.rejects(
        kind === 'Result' ? failure.receiver.receiveResult(result()) : failure.receiver.receiveProgress(event()),
        (error) => error instanceof ReceiverStorageError && !error.message.includes('synthetic-sensitive'),
      );
      assert.deepEqual(failure.store.state, before);
      assert.deepEqual(failure.logs.at(-1), { kind: kind === 'Result' ? 'Result' : 'ProcessingEvent', code: 'STORAGE_UNAVAILABLE' });
      failure.store[flag] = false;
      if (kind === 'Result') assert.equal((await failure.receiver.receiveResult(result())).receipt.disposition, 'ACCEPTED');
    }
  }
});

test('await 중 입력 변경을 저장하지 않고 반영/복구 상태에서 중복은 현재 상태를 보존한다', async () => {
  const { receiver, store } = harness();
  const input = result();
  const pending = receiver.receiveResult(input);
  input.candidates[0].title = 'mutated after validation';
  assert.equal((await pending).accepted.result.candidates[0].title, '합성 후보');
  for (const application of ['APPLYING', 'APPLY_FAILED', 'RECOVERING', 'APPLIED']) {
    store.state.application = application;
    const before = structuredClone(store.state);
    assert.equal((await receiver.receiveResult(result())).receipt.disposition, 'DUPLICATE');
    assert.deepEqual(store.state, before);
  }
});

test('현재 시도가 바뀌었거나 불완전한 종결 기록이면 기존 상태를 보존한다', async () => {
  const { receiver, store } = harness();
  await receiver.receiveResult(result());
  store.state.context = context({ attemptId: 'new-attempt' });
  assert.equal((await receiver.receiveResult(result())).receipt.code, 'STALE_ATTEMPT');
  const broken = harness(); broken.store.state.processing = 'EMPTY';
  assert.equal((await broken.receiver.receiveResult(result())).receipt.code, 'PAYLOAD_CONFLICT');
});

test('수신 스키마가 OpenAPI nullable 초안과 필수 값 경계를 그대로 사용한다', () => {
  const input = result(); input.candidates[0].draft = { status: 'NOT_GENERATED', content: null };
  assert.equal(validator.result(input), true);
  input.candidates[0].draft.status = null;
  assert.equal(validator.result(input), false);
});
