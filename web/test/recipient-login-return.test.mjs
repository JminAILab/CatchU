import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createGoogleAuth, GOOGLE_ATTEMPT_KEY } from '../src/lib/auth-google.ts';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createGoogleCallbackControl } from '../src/lib/google-login-screen.ts';
import {
  createRecipientLoginReturn, isRecipientReturnToken, RECIPIENT_RETURN_KEY,
  RECIPIENT_RETURN_TTL_MS, recipientLoginHref,
} from '../src/lib/recipient-login-return.ts';

// api는 CommonJS package다. 정본 TS를 ESM으로 변환해 실제 판정 함수를 대조한다.
const apiTokenSource = readFileSync(new URL('../../api/src/share-links/link-token.ts', import.meta.url), 'utf8');
const apiTokenModule = ts.transpileModule(apiTokenSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { isLinkTokenFormat } = await import(`data:text/javascript;base64,${Buffer.from(apiTokenModule).toString('base64')}`);

const TOKEN = 'a'.repeat(43);
const OTHER = 'b'.repeat(43);
const destination = `/s/${TOKEN}`;
const entry = () => new URLSearchParams('entry=recipient');
function fixture() {
  const values = new Map();
  let now = 10_000;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  const flow = createRecipientLoginReturn(() => storage, () => now);
  return { flow, values, storage, advance: (ms) => { now += ms; } };
}
function begin(flow) { assert.equal(flow.begin(TOKEN), recipientLoginHref); flow.prepareLogin(entry()); }

test('web의 받은 링크 token 검사와 api 정본이 같은 값을 허용한다', () => {
  const cases = [TOKEN, '_'.repeat(43), '-'.repeat(43), 'A0_-'.repeat(10) + 'xyz',
    '', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}\n`, null, 123,
    'https://other.example', '//example', `${TOKEN}?`, `${TOKEN}#`, `${TOKEN}/`, `${TOKEN}\\`, '가'.repeat(43)];
  for (const value of cases) assert.equal(isRecipientReturnToken(value), isLinkTokenFormat(value), String(value));
});

test('상단 바와 JD가 쓰는 진입 함수는 token 없는 주소를 만들고 같은 탭에만 보관한다', () => {
  const { flow, values } = fixture();
  assert.equal(flow.begin(TOKEN), '/login?entry=recipient');
  assert.equal(values.size, 1);
  assert.equal(JSON.parse(values.get(RECIPIENT_RETURN_KEY)).token, TOKEN);
  assert.equal(flow.loginEntry(entry()), destination);
  assert.equal(flow.loginEntry(new URLSearchParams()), null);
});

test('기존 회원 로그인은 받은 링크로 이동하고 실제 도착 때만 복귀 값을 지운다', () => {
  const { flow, values } = fixture(); begin(flow);
  assert.equal(flow.afterLogin('면접관', null), destination);
  assert.equal(flow.afterLogin('면접관', null), destination, '중복 effect도 같은 이동이어야 한다');
  assert.ok(values.has(RECIPIENT_RETURN_KEY));
  flow.arrive(OTHER); assert.ok(values.has(RECIPIENT_RETURN_KEY));
  flow.arrive(TOKEN); assert.equal(values.size, 0);
});

test('새 회원은 최초 입력 동안 유지하고 이름 저장 뒤 받은 링크로 간다', () => {
  const { flow, values } = fixture(); begin(flow);
  assert.equal(flow.afterLogin('', null), '/profile/setup');
  assert.equal(flow.afterLogin('', null), '/profile/setup');
  assert.equal(flow.profileReturn(), destination);
  assert.ok(values.has(RECIPIENT_RETURN_KEY));
  assert.equal(flow.afterProfile(), destination);
  assert.equal(flow.afterProfile(), destination, '가드와 저장 완료가 함께 이동해도 홈으로 덮지 않는다');
  flow.arrive(TOKEN); assert.equal(values.size, 0);
});

test('일반 로그인·회원 next로 들어오면 남아 있던 받은 링크가 이동을 가로채지 않는다', () => {
  for (const query of ['', 'next=%2Fassets%3FrepositoryId%3D1', 'entry=recipient&next=%2Fjds', 'entry=other']) {
    const { flow, values } = fixture(); begin(flow);
    const params = new URLSearchParams(query); flow.prepareLogin(params);
    assert.equal(values.size, 0);
    assert.equal(flow.afterLogin('면접관', params.get('next')), params.get('next') ?? '/home');
  }
});

test('보관 값 없이 표시만 붙인 진입과 처음 가입하는 일반 회원은 기존 경로를 쓴다', () => {
  const { flow } = fixture();
  flow.prepareLogin(entry());
  assert.equal(flow.loginEntry(entry()), null);
  assert.equal(flow.afterLogin('', '/assets'), '/profile/setup');
  assert.equal(flow.afterProfile(), '/home');
});

test('30분 경계와 미래 시각의 값은 지우고 홈으로 간다', () => {
  const { flow, values, advance } = fixture(); begin(flow);
  advance(RECIPIENT_RETURN_TTL_MS - 1);
  assert.equal(flow.loginEntry(entry()), destination);
  advance(1);
  assert.equal(flow.afterLogin('면접관', null), '/home');
  assert.equal(values.size, 0);
  values.set(RECIPIENT_RETURN_KEY, JSON.stringify({ token: TOKEN, createdAt: Number.MAX_SAFE_INTEGER, stage: 'login' }));
  assert.equal(flow.afterLogin('면접관', null), '/home');
  assert.equal(values.size, 0);
});

test('이름 입력 중 시한이 지나도 새 시한을 부여하지 않고 홈으로 간다', () => {
  const { flow, values, advance } = fixture(); begin(flow);
  flow.afterLogin('', null); advance(RECIPIENT_RETURN_TTL_MS);
  assert.equal(flow.profileReturn(), null);
  assert.equal(flow.afterProfile(), '/home');
  assert.equal(values.size, 0);
});

test('잘못된 주소·token·보관 구조는 복귀에 쓰지 않는다', () => {
  const { flow, values } = fixture();
  for (const token of ['https://evil.example', '//evil.example', `${TOKEN}?x=1`, `${TOKEN}#x`, 'a'.repeat(42), 'a'.repeat(44)]) {
    assert.equal(flow.begin(token), '/login');
    values.set(RECIPIENT_RETURN_KEY, JSON.stringify({ token, createdAt: 10_000, stage: 'login' }));
    assert.equal(flow.afterLogin('면접관', null), '/home');
    assert.equal(values.size, 0);
  }
  for (const raw of ['{', 'null', '[]', JSON.stringify({ token: TOKEN, createdAt: '10000', stage: 'login' }), JSON.stringify({ token: TOKEN, createdAt: 10_000, stage: 'invalid' })]) {
    values.set(RECIPIENT_RETURN_KEY, raw);
    assert.equal(flow.afterLogin('면접관', null), '/home');
    assert.equal(values.size, 0);
  }
});

test('탭별 저장소를 분리하고 비밀번호 grant를 지우거나 복사하지 않는다', () => {
  const first = fixture(); const second = fixture();
  first.values.set('catchu.recipient.grant', 'synthetic-grant'); begin(first.flow);
  assert.equal(second.flow.afterLogin('다른 탭 회원', null), '/home');
  assert.equal(first.flow.afterLogin('면접관', null), destination);
  first.flow.arrive(TOKEN);
  assert.equal(first.values.get('catchu.recipient.grant'), 'synthetic-grant');
  assert.equal(second.values.size, 0);
});

test('sessionStorage 접근·쓰기 실패는 토큰을 다른 곳으로 보내지 않고 일반 로그인으로 처리한다', () => {
  for (const get of [() => null, () => { throw new Error('denied'); }, () => ({ getItem: () => null, removeItem() {}, setItem() { throw new Error('full'); } })]) {
    const flow = createRecipientLoginReturn(get);
    assert.equal(flow.begin(TOKEN), '/login');
    assert.equal(flow.afterLogin('면접관', null), '/home');
  }
});

test('Google 시작 인자에 token이 없고 취소·실패 뒤 다시 로그인은 받은 링크 진입을 유지한다', async () => {
  for (const result of [{ kind: 'cancelled' }, { kind: 'failed', reason: 'network' }, { kind: 'failed', reason: 'server' }]) {
    const { flow, values } = fixture(); begin(flow);
    assert.equal(flow.startGoogle(null), null);
    const requests = [];
    const input = { code: 'synthetic-code', state: 'synthetic-state', loginAttemptToken: 'synthetic-attempt' };
    const callback = createGoogleCallbackControl({
      readCallback: () => ({ kind: 'complete', input, next: null }),
      completeGoogleLogin: async (request) => { requests.push(request); return result; },
      lookupMember: async () => { throw new Error('실패 때 회원을 조회하면 안 된다'); },
      afterLogin: flow.afterLogin, retryLogin: flow.retryLogin,
    });
    await callback.begin(() => new URLSearchParams(), () => {});
    assert.equal(callback.getView().loginHref, recipientLoginHref);
    assert.equal(JSON.stringify(requests).includes(TOKEN), false);
    flow.prepareLogin(entry());
    assert.equal(flow.afterLogin('면접관', null), destination);
    flow.arrive(TOKEN); assert.equal(values.size, 0);
  }
});

test('콜백 해석 실패의 다시 로그인도 받은 링크로 돌아오는 경로를 이어 간다', async () => {
  const { flow } = fixture(); begin(flow); flow.startGoogle(null);
  const callback = createGoogleCallbackControl({
    readCallback: () => ({ kind: 'provider-error' }),
    completeGoogleLogin: async () => { throw new Error('해석 실패는 완료 요청 금지'); },
    lookupMember: async () => ({ state: 'loaded', displayName: '면접관' }),
    afterLogin: flow.afterLogin, retryLogin: flow.retryLogin,
  });
  await callback.begin(() => new URLSearchParams(), () => {});
  assert.equal(callback.getView().loginHref, recipientLoginHref);
});

test('Google 성공 callback은 회원 조회 뒤 같은 링크 또는 최초 입력으로 이동한다', async () => {
  for (const displayName of ['면접관', '']) {
    const { flow } = fixture(); begin(flow); flow.startGoogle(null);
    let completed = 0;
    const callback = createGoogleCallbackControl({
      readCallback: () => ({ kind: 'complete', input: { code: 'synthetic-code' }, next: null }),
      completeGoogleLogin: async () => { completed++; return { kind: 'signed-in' }; },
      lookupMember: async () => ({ state: 'loaded', displayName }),
      afterLogin: flow.afterLogin, retryLogin: flow.retryLogin,
    });
    await callback.begin(() => new URLSearchParams(), () => {});
    assert.equal(completed, 1);
    assert.deepEqual(callback.getView(), { phase: 'redirect', to: displayName ? destination : '/profile/setup' });
  }
});

test('반복된 새 로그인·회원 next는 앞선 받은 링크의 복귀 값을 이어 가지 않는다', () => {
  const { flow, values } = fixture(); begin(flow); flow.startGoogle(null);
  flow.prepareLogin(new URLSearchParams('next=%2Fjds'));
  assert.equal(flow.startGoogle('/jds'), '/jds');
  assert.equal(flow.retryLogin('/jds'), '/login?next=%2Fjds');
  assert.equal(flow.afterLogin('면접관', '/jds'), '/jds');
  assert.equal(values.size, 0);
});

test('실제 Google 시작 함수의 요청·이동 주소·시도 보관에는 받은 링크 token이 없다', async () => {
  const { flow, storage, values } = fixture(); begin(flow);
  const requests = [];
  const google = createGoogleAuth({
    baseUrl: 'http://127.0.0.1:3001', nodeEnv: 'test', store: createAuthStore(), session: {}, storage,
    fetch: async (url, init) => {
      requests.push({ url, body: init.body });
      return Response.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state', loginAttemptToken: 'synthetic-attempt', expiresIn: 600 });
    },
  });
  const result = await google.startGoogleLogin(flow.startGoogle(null));
  assert.equal(result.kind, 'ready');
  const attempt = values.get(GOOGLE_ATTEMPT_KEY);
  assert.equal(JSON.parse(attempt).next, null);
  assert.equal(JSON.stringify([requests, result, attempt]).includes(TOKEN), false);
  assert.equal(JSON.parse(values.get(RECIPIENT_RETURN_KEY)).token, TOKEN);
  assert.equal(flow.startGoogle(null), null, '시작 실패 뒤 같은 버튼으로 재시도해도 복귀를 유지한다');
  assert.equal(flow.retryLogin(), recipientLoginHref);
});

test('삭제가 거부된 옛 보관 값도 일반 로그인 이후에는 사용하지 않는다', () => {
  const { values, storage } = fixture();
  const flow = createRecipientLoginReturn(() => ({ ...storage, removeItem() { throw new Error('denied'); } }), () => 10_000);
  values.set(RECIPIENT_RETURN_KEY, JSON.stringify({ token: TOKEN, createdAt: 10_000, stage: 'login' }));
  flow.prepareLogin(new URLSearchParams());
  assert.equal(flow.afterLogin('면접관', null), '/home');
});
