import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createAuthApi } from '../src/lib/auth-api.ts';
import { createLoginMarker } from '../src/lib/auth-login-marker.ts';
import { createFetchLogoutTransport } from '../src/lib/auth-logout.ts';
import { createFetchRefreshTransport } from '../src/lib/auth-refresh.ts';
import { createAuthSession, createSessionLock } from '../src/lib/auth-session.ts';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { initialSessionLookup, lookupMemberWithAuth, recordSessionLookup, viewSessionLookup } from '../src/lib/member-lookup.ts';

/**
 * 공통 인증 회원 경로 가드(`session-member-guard.tsx`)의 렌더 시험(#286, PR #308 A 검토).
 * 인증 상태·세션 갱신·보호 API·회원 조회 표시는 실제 코드이고, 서버 응답은 대역 fetch다. 가드는 원본 tsx를 변환해 렌더하며
 * 화면 훅(`use-auth`·`use-session-member-lookup`)·라우터·`authRuntime`만 대역으로 바꾼다(효과는 돌지 않음).
 * 실제 브라우저·API·DB 검증이 아니다.
 */

const guardUrl = new URL('../src/components/auth/session-member-guard.tsx', import.meta.url);
const srcUrl = new URL('../src/', import.meta.url);
const stubBase = new URL('./__guard-stubs__/', import.meta.url);
const STUBS = {
  'next/navigation': 'export const usePathname = () => globalThis.__guard.pathname; export const useRouter = () => globalThis.__guard.router;',
  '@/lib/auth-runtime': 'export const authRuntime = () => ({ store: { getSnapshot: () => globalThis.__guard.auth }, session: { refresh() {} } });',
  './use-auth': 'export const useAuth = () => globalThis.__guard.auth; export const useEnsureRestored = () => {}; export const useLastScopeGeneration = () => 1;',
  './use-session-member-lookup': 'export const useSessionMemberLookup = () => ({ sessionScope: 1, me: globalThis.__guard.me, retry: () => {} });',
};
// 커버리지 보고가 주소 속 %2F를 거부하므로, 영문·숫자·`-` 밖의 글자는 `_`+16진 코드로 바꿔 파일 이름 글자만 쓴다.
const stubUrl = (name) => new URL(name.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`) + '.mjs', stubBase).href;
const stubSources = new Map(Object.entries(STUBS).map(([name, source]) => [stubUrl(name), source]));

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier] !== undefined) return { url: stubUrl(specifier), shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const path = specifier.slice(2);
      const ext = path.startsWith('components/') ? '.tsx' : '.ts';
      return { url: new URL(path + ext, srcUrl).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (stubSources.has(url)) return { format: 'module', shortCircuit: true, source: stubSources.get(url) };
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true, source: 'export default {};' };
    if (url.endsWith('.tsx')) {
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});
const { SessionMemberGuard } = await import(guardUrl.href);
hooks.deregister();

const BASE = 'http://127.0.0.1:3001';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** 개발 로그인 → `GET /me`는 `me`에 넣은 순서대로, `POST /auth/refresh`는 `refresh` 상태로 답하는 서버 대역. */
function fakeServer({ me, refresh = 401 }) {
  const log = [];
  const queue = [...me];
  return {
    log,
    count: (entry) => log.filter((e) => e === entry).length,
    async fetch(url, init) {
      const entry = `${init.method} ${new URL(url).pathname.replace(/^\/v1/, '')}`;
      log.push(entry);
      if (entry === 'POST /auth/dev-login') return json(200, { accessToken: 'A1', tokenType: 'Bearer', expiresIn: 900 });
      if (entry === 'POST /auth/refresh') {
        return refresh === 200
          ? json(200, { accessToken: 'A2', tokenType: 'Bearer', expiresIn: 900 })
          : json(401, { code: 'AUTH_INVALID', message: '인증이 유효하지 않습니다.' });
      }
      if (entry === 'GET /me') {
        const status = queue.shift() ?? 200;
        if (status === 200) return json(200, { profile: { displayName: '합성 회원' } });
        if (status === 401) return json(401, { code: 'AUTH_INVALID', message: '인증이 유효하지 않습니다.' });
        return json(500, { code: 'INTERNAL_ERROR', message: '서버 오류' });
      }
      return json(404, { code: 'NOT_FOUND', message: '없음' });
    },
  };
}

/** 실제 인증 코드로 로그인한 탭과, 가드의 회원 조회 훅과 같은 경로(lookupMemberWithAuth → record → view)의 조회 기록. */
async function signedIn(server) {
  const fetch = (url, init) => server.fetch(url, init);
  const store = createAuthStore();
  // 표식을 읽을 수 없으면 회원 조회 전 비교에서 세대를 끊으므로, 한 탭의 메모리 저장소를 둔다.
  const map = new Map();
  const storage = { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)); } };
  const session = createAuthSession({
    store, marker: createLoginMarker({ storage }), lock: createSessionLock({ locks: null }),
    refreshTransport: createFetchRefreshTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }),
    logoutTransport: createFetchLogoutTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }),
  });
  const api = createAuthApi({ baseUrl: BASE, nodeEnv: 'test', store, session, fetch });
  assert.equal((await api.devLogin('synthetic')).kind, 'success');
  let lookup = initialSessionLookup;
  let attempt = -1;
  const t = {
    store, api, session,
    /** 가드의 [다시 불러오기]·첫 조회와 같다: 보낼 수 있을 때만 보내고 결과를 기록한다. */
    async lookup() {
      attempt += 1;
      if (!t.callable()) return;
      lookup = recordSessionLookup(lookup, { sessionScope: 1, scope: '/home', attempt }, await lookupMemberWithAuth(api.member));
    },
    callable: () => { const s = store.getSnapshot(); return s.status === 'signed-in' && s.sessionHold === null; },
    me: () => viewSessionLookup(lookup, { sessionScope: 1, scope: '/home', attempt, callable: t.callable() }),
  };
  return t;
}

/** 원본 가드를 렌더한다. `notice`를 주면 #287 재인증 안내 대역을 넘기고 호출 인자를 남긴다. */
function render({ auth, me, notice = true }) {
  const calls = [];
  globalThis.__guard = { auth, me, pathname: '/home', router: { replace() {}, push() {} } };
  const renderReauthNotice = notice
    ? (props) => { calls.push(props); return createElement('aside', { 'data-test': 'reauth-notice' }, '다시 로그인해 주세요.'); }
    : undefined;
  const html = renderToStaticMarkup(createElement(SessionMemberGuard, { renderReauthNotice }, createElement('p', null, '회원 화면')));
  return { html, calls };
}
const FAILED_TITLE = '회원 정보를 불러오지 못했습니다';
const NOTICE = 'data-test="reauth-notice"';

test('회귀(PR #308 A): 회원 조회 500 뒤 재조회의 /me 401 → refresh 401이면 조회 실패와 재인증 안내를 함께 보인다', async () => {
  const server = fakeServer({ me: [500, 401], refresh: 401 });
  const t = await signedIn(server);
  await t.lookup();
  assert.deepEqual(t.me(), { state: 'failed' });

  await t.lookup(); // [다시 불러오기]
  assert.equal(t.store.getSnapshot().status, 'reauth-required');
  assert.equal(server.count('POST /auth/refresh'), 1);
  assert.deepEqual(t.me(), { state: 'failed' }, '실패 결과는 그대로 남는다');

  const { html, calls } = render({ auth: t.store.getSnapshot(), me: t.me() });
  assert.ok(html.includes(FAILED_TITLE), '조회 실패 표시를 유지한다');
  assert.ok(html.includes(NOTICE), '재인증 안내로 [다시 로그인]에 갈 수 있다');
  assert.deepEqual(calls, [{ returnTo: '/home' }]);
  assert.ok(!html.includes('회원 화면'));

  // 이 상태의 [다시 불러오기]는 보내지 않는다. 안내가 없으면 화면에서 진행할 방법이 없다.
  const before = server.count('GET /me');
  await t.lookup();
  assert.equal(server.count('GET /me'), before);
  assert.deepEqual(t.me(), { state: 'failed' });
});

test('회귀(PR #308 A): 첫 조회의 /me 401 → refresh 401도 조회 실패로 남으므로 재인증 안내를 함께 보인다', async () => {
  const t = await signedIn(fakeServer({ me: [401], refresh: 401 }));
  await t.lookup();
  assert.equal(t.store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(t.me(), { state: 'failed' });
  const { html, calls } = render({ auth: t.store.getSnapshot(), me: t.me() });
  assert.ok(html.includes(FAILED_TITLE) && html.includes(NOTICE));
  assert.deepEqual(calls, [{ returnTo: '/home' }]);
});

test('일반 조회 실패(로그인 유지): 조회 실패만 보이고 재인증 안내는 부르지 않는다', async () => {
  const server = fakeServer({ me: [500] });
  const t = await signedIn(server);
  await t.lookup();
  assert.equal(t.store.getSnapshot().status, 'signed-in');
  const { html, calls } = render({ auth: t.store.getSnapshot(), me: t.me() });
  assert.ok(html.includes(FAILED_TITLE));
  assert.ok(!html.includes(NOTICE));
  assert.deepEqual(calls, []);
});

test('기존 재인증 경로: 결과 없는 조회(idle)는 안내만, 불러온 화면은 안내와 회원 화면을 함께 보인다', async () => {
  // 조회 전에 재인증이 필요해지면 첫 조회를 보내지 않는다(idle).
  const idle = await signedIn(fakeServer({ me: [], refresh: 401 }));
  await idle.session.refresh();
  await idle.lookup();
  assert.equal(idle.store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(idle.me(), { state: 'idle' });
  const a = render({ auth: idle.store.getSnapshot(), me: idle.me() });
  assert.deepEqual(a.calls, [{ returnTo: '/home' }]);
  assert.ok(a.html.includes(NOTICE) && !a.html.includes(FAILED_TITLE) && !a.html.includes('회원 화면'));

  // 불러온 뒤 다른 요청(갱신)에서 재인증이 필요해지면 이전 결과로 화면을 유지한다.
  const loaded = await signedIn(fakeServer({ me: [200], refresh: 401 }));
  await loaded.lookup();
  await loaded.session.refresh();
  assert.equal(loaded.store.getSnapshot().status, 'reauth-required');
  assert.equal(loaded.me().state, 'loaded');
  const b = render({ auth: loaded.store.getSnapshot(), me: loaded.me() });
  assert.deepEqual(b.calls, [{ returnTo: '/home' }]);
  assert.ok(b.html.includes(NOTICE) && b.html.includes('회원 화면') && !b.html.includes(FAILED_TITLE));
});

test('안내 컴포넌트를 아직 넘겨받지 않았으면(#287 연결 전) 재인증이어도 조회 실패 표시만 그대로 보인다', async () => {
  const server = fakeServer({ me: [500, 401], refresh: 401 });
  const t = await signedIn(server);
  await t.lookup();
  await t.lookup();
  const { html } = render({ auth: t.store.getSnapshot(), me: t.me(), notice: false });
  assert.ok(html.includes(FAILED_TITLE));
  assert.ok(!html.includes(NOTICE));
});
