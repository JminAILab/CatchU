import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmDiscardUnsaved, createUnsavedRegistry, UNSAVED_REASONS } from '../src/lib/unsaved-changes.ts';

/**
 * #286 공통 등록 수단의 확인 사유([#287 A 답변 1](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6310239160)).
 * 등록·해제·읽기만 시험한다. 확인 창·문구·이동은 #287 확인 흐름의 몫이라 여기서 만들지 않는다.
 */

const INPUT = 'unsaved-input';
const REQUEST = 'unconfirmed-analysis-request';

test('사유 목록과 순서가 정해져 있다', () => {
  assert.deepEqual([...UNSAVED_REASONS], [INPUT, REQUEST]);
});

test('기존 호출 호환: 사유 없이 등록하면 저장하지 않은 입력이고 hasUnsaved·confirmDiscardUnsaved가 지금처럼 동작한다', () => {
  const registry = createUnsavedRegistry();
  assert.deepEqual(registry.activeReasons(), []);
  const asked = [];
  let dirty = true;
  const off = registry.register(() => dirty);
  assert.equal(registry.hasUnsaved(), true);
  assert.deepEqual(registry.activeReasons(), [INPUT]);
  assert.equal(confirmDiscardUnsaved(registry, (m) => { asked.push(m); return false; }, 'q'), false);
  dirty = false;
  assert.equal(registry.hasUnsaved(), false);
  assert.deepEqual(registry.activeReasons(), []);
  off();
  assert.deepEqual(asked, ['q']);
});

test('분석 요청 사유만 있으면 hasUnsaved는 거짓이다: 기존 확인 흐름이 입력 문구로 묻지 않는다', () => {
  const registry = createUnsavedRegistry();
  registry.register(() => true, REQUEST);
  assert.equal(registry.hasUnsaved(), false);
  assert.equal(confirmDiscardUnsaved(registry, () => assert.fail('입력 문구로 묻지 않는다'), 'q'), true);
  assert.deepEqual(registry.activeReasons(), [REQUEST]);
});

test('같은 사유를 여러 곳에서 등록하고 하나를 풀어도 나머지는 남는다. 해제는 여러 번 불러도 다른 등록에 영향이 없다', () => {
  const registry = createUnsavedRegistry();
  const check = () => true;
  const offA = registry.register(check, REQUEST);
  const offB = registry.register(check, REQUEST); // 같은 함수도 따로 등록된다
  offA();
  offA();
  assert.deepEqual(registry.activeReasons(), [REQUEST]);
  offB();
  assert.deepEqual(registry.activeReasons(), []);
});

test('두 사유가 함께 참이면 표시용 사유는 사유마다 한 번, 정해진 순서다(등록 순서와 무관)', () => {
  const registry = createUnsavedRegistry();
  registry.register(() => true, REQUEST);
  registry.register(() => true, REQUEST);
  registry.register(() => true);
  registry.register(() => true, INPUT);
  registry.register(() => false, INPUT);
  assert.deepEqual(registry.activeReasons(), [INPUT, REQUEST]);
  assert.equal(registry.hasUnsaved(), true);
});

test('읽는 시점의 상태를 쓴다: 등록 뒤 확인 직전에 바뀐 값이 다시 등록하지 않아도 반영된다', () => {
  const registry = createUnsavedRegistry();
  const state = { phase: 'editing' };
  let reads = 0;
  registry.register(() => { reads += 1; return state.phase !== 'editing'; }, REQUEST);
  assert.deepEqual(registry.activeReasons(), []);
  state.phase = 'unknown';
  assert.deepEqual(registry.activeReasons(), [REQUEST]);
  state.phase = 'editing';
  assert.deepEqual(registry.activeReasons(), []);
  assert.equal(reads, 3);
});

test('판정 함수의 오류를 삼키지 않는다', () => {
  const registry = createUnsavedRegistry();
  registry.register(() => { throw new Error('판정 실패'); }, REQUEST);
  assert.throws(() => registry.activeReasons(), /판정 실패/);
});

test('정해지지 않은 사유는 등록하지 않는다', () => {
  const registry = createUnsavedRegistry();
  assert.throws(() => registry.register(() => true, 'other'), /알 수 없는 확인 사유/);
  assert.deepEqual(registry.activeReasons(), []);
});

test('확인 흐름 사용 예(대역): 누른 시점에 activeReasons()를 한 번 읽고, 사유가 없으면 묻지 않는다', () => {
  // #287 확인 함수의 실제 문구·분기는 A 담당이다. 여기의 문자열은 사유 전달만 보이는 대역이다.
  const confirmWith = (registry, confirm) => {
    const reasons = registry.activeReasons();
    return reasons.length === 0 || confirm(reasons.join('+'));
  };
  const registry = createUnsavedRegistry();
  const asked = [];
  const answer = (m) => { asked.push(m); return false; };
  assert.equal(confirmWith(registry, answer), true);
  const offRequest = registry.register(() => true, REQUEST);
  assert.equal(confirmWith(registry, answer), false);
  const offInput = registry.register(() => true);
  assert.equal(confirmWith(registry, answer), false);
  offRequest();
  offInput();
  assert.equal(confirmWith(registry, answer), true);
  assert.deepEqual(asked, [REQUEST, `${INPUT}+${REQUEST}`]);
});
