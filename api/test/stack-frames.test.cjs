const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { installStackFrameCollector, collectedFrames } = require('../dist/common/errors/stack-frames');

// 수집 훅은 프로세스 전역 설정이므로 이 파일(별도 프로세스)에서 따로 검증한다.
const FAKE_SECRET = 'probe-fake-secret-7f3a';
const OWN_FRAME = /^ {4}at test\/stack-frames\.test\.cjs:\d+:\d+$/m;

function withFormatter(formatter, run) {
  const original = Error.prepareStackTrace;
  Error.prepareStackTrace = formatter;
  try {
    run();
  } finally {
    Error.prepareStackTrace = original;
  }
}

function assertNoSecret(frames) {
  for (const leaked of [FAKE_SECRET, 'token=']) assert.equal(frames.includes(leaked), false, `위치에 ${leaked} 없음`);
}

test('Node 기본 formatter의 .stack 문자열은 설치 전후가 같다', () => {
  withFormatter(Error.prepareStackTrace, () => {
    const make = () => new Error('같은 메시지');
    const stacks = [];
    for (const phase of [0, 1]) {
      if (phase === 1) installStackFrameCollector();
      stacks.push(make().stack);
    }
    assert.equal(typeof stacks[0], 'string');
    assert.equal(stacks[1], stacks[0]);
  });
});

test('기존 formatter의 반환값을 보존하고, 여러 번 설치해도 한 번만 감싼다', () => {
  let calls = 0;
  withFormatter(function custom(error, callSites) {
    calls += 1;
    assert.ok(Array.isArray(callSites), '기존 formatter도 호출 위치를 받는다');
    return `CUSTOM:${callSites.length > 0}`;
  }, () => {
    installStackFrameCollector();
    const installed = Error.prepareStackTrace;
    installStackFrameCollector();
    installStackFrameCollector();
    assert.equal(Error.prepareStackTrace, installed, '다시 불러도 감싸지 않는다');

    const error = new Error('x');
    assert.equal(error.stack, 'CUSTOM:true', '기존 formatter 반환값 유지');
    assert.equal(calls, 1, '기존 formatter는 오류당 한 번만 불린다');
    assert.match(collectedFrames(error), OWN_FRAME);
  });
});

test('기존 formatter가 없으면 설치하지 않고 위치를 생략한다', () => {
  withFormatter(undefined, () => {
    installStackFrameCollector();
    assert.equal(Error.prepareStackTrace, undefined);
    const error = new Error('x');
    assert.equal(typeof error.stack, 'string', 'V8 기본 스택은 그대로');
    assert.equal(collectedFrames(error), undefined);
  });
});

test('스택 생성 뒤 메시지를 줄여도 메시지와 무관한 실제 위치만 남는다', () => {
  withFormatter(Error.prepareStackTrace, () => {
    installStackFrameCollector();
    const messages = [
      `외부 처리 오류\n    at token=${FAKE_SECRET}`, // 남은 줄이 코드 위치 형식이 아닌 경우
      `외부 처리 오류\n    at query (token=${FAKE_SECRET}:1:1)`, // 코드 위치 형식을 흉내 낸 경우
    ];
    for (const message of messages) {
      const error = new Error(message);
      void error.stack;
      error.message = '외부 처리 오류';
      const frames = collectedFrames(error);
      assert.match(frames, OWN_FRAME);
      assertNoSecret(frames);
      assert.equal(frames.includes('query ('), false);
    }
  });
});

test('스택을 먼저 덮어쓰거나 스택 접근이 실패하면 문자열 파싱 없이 위치를 생략한다', () => {
  withFormatter(Error.prepareStackTrace, () => {
    installStackFrameCollector();
    const overwritten = new Error('x');
    overwritten.stack = `Error: ${FAKE_SECRET}\n    at query (token=${FAKE_SECRET}:1:1)`;
    assert.equal(collectedFrames(overwritten), undefined);

    const broken = new Error('x');
    Object.defineProperty(broken, 'stack', { get() { throw new Error(FAKE_SECRET); } });
    assert.equal(collectedFrames(broken), undefined);
  });
});

test('함수 이름은 기록하지 않고, 동적 코드·앱 밖 파일은 자리표시자로 남긴다', () => {
  withFormatter(Error.prepareStackTrace, () => {
    installStackFrameCollector();
    const renamed = function () { return new Error('x'); };
    Object.defineProperty(renamed, 'name', { value: `token=${FAKE_SECRET}` });
    const computed = { [`token=${FAKE_SECRET}`]() { return new Error('x'); } };
    const cases = {
      renamed: [renamed(), OWN_FRAME],
      computed: [computed[`token=${FAKE_SECRET}`](), OWN_FRAME],
      eval: [eval(`(function token_${FAKE_SECRET.replace(/-/g, '_')}() { return new Error('x'); })`)(), /^ {4}at <eval>$/m],
      newFunction: [new Function("return new Error('x');")(), /^ {4}at <eval>$/m],
      vmFile: [vm.runInThisContext("(function () { return new Error('x'); })", { filename: `/tmp/token=${FAKE_SECRET}.js` })(), /^ {4}at <external>$/m],
    };
    for (const [name, [error, expected]] of Object.entries(cases)) {
      const frames = collectedFrames(error);
      assert.match(frames, expected, `${name}: 기대한 위치 표현`);
      assertNoSecret(frames);
      assert.equal(/probe_fake_secret/.test(frames), false, `${name}: 이름 없음`);
      for (const line of frames.split('\n')) {
        assert.match(line, /^ {4}at (?:<eval>|<native>|<unknown>|<external>|[\w./-]+:\d+:\d+|node:[\w/.-]+(?::\d+:\d+)?)$/, `${name}: 허용한 형식만 기록`);
      }
    }
  });
});
