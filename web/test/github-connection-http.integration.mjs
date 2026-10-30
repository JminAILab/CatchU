// 명시 실행 전용: 격리 PostgreSQL 필요. 기본 web 단위 테스트에는 포함하지 않는다(#253).
// 실제 web API 함수 → Nest HTTP → PostgreSQL. GitHub의 토큰 교환·계정 조회 두 주소만 이 프로세스의 fetch에서 합성 응답으로 바꾼다.
// 실제 GitHub 승인·브라우저 왕복은 검사하지 않는다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApiClient } from '../src/lib/api-client.ts';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import {
  completeConnection, readCallbackParams, readConnection, startConnection,
} from '../src/features/github-connection/github-connection-api.ts';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
require('reflect-metadata');

const realFetch = globalThis.fetch;
let github = { exchange: 'ok', scopes: '' };
const exchanged = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://github.com/login/oauth/access_token') {
    exchanged.push(new URLSearchParams(init.body).get('code'));
    if (github.exchange === 'down') return new Response('{}', { status: 502 });
    return Response.json({ access_token: `synthetic-${randomUUID()}`, token_type: 'bearer', scope: github.scopes, expires_in: 28800 });
  }
  if (url === 'https://api.github.com/user') {
    return Response.json({ login: 'octo-253', id: 253001 }, { headers: { 'x-oauth-scopes': github.scopes } });
  }
  if (/^https:\/\/([a-z.]*\.)?github\.com\//.test(url)) throw new Error('실제 GitHub로 요청하지 않는다');
  return realFetch(input, init);
};

const vaultDirectory = await mkdtemp(join(tmpdir(), 'catchu-253-vault-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'), SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '55253', DB_USER: 'catchu', DB_PASSWORD: 'catchu_local', DB_NAME: 'catchu_issue253_test',
});
const githubEnv = {
  GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'Iv1-issue253-synthetic', GITHUB_OAUTH_CLIENT_SECRET: randomBytes(20).toString('hex'),
  GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback', GITHUB_CREDENTIAL_DIRECTORY: vaultDirectory,
  GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};

const db = require('./dist/database/data-source').default;
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { configureApp } = require('./dist/app.setup');
async function start() {
  const app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  return app;
}
const SYNTHETIC = { kind: 'loaded', connection: { state: 'CONNECTED', accountLogin: 'catchu-synthetic-owner' } };
const DISCONNECTED = { kind: 'loaded', connection: { state: 'DISCONNECTED', accountLogin: null } };
async function member(app) {
  const tokens = createAccessTokenStore();
  const api = createApiClient({ baseUrl: await app.getUrl(), nodeEnv: 'test', tokens, fetch: realFetch });
  assert.equal((await api.devLogin(`github-http-${randomUUID()}`)).kind, 'success');
  return { api, tokens };
}
// 개발 로그인 회원의 합성 연결을 #231 해제 API로 지워 실제 회원의 미연결과 같은 상태에서 시작한다(10월 화면에는 해제 버튼이 없다).
async function disconnectedMember(app) {
  const value = await member(app);
  assert.deepEqual(await readConnection(value.api), SYNTHETIC);
  assert.equal((await value.api.member('/me/github/connection', { method: 'DELETE' })).kind, 'success');
  assert.deepEqual(await readConnection(value.api), DISCONNECTED);
  return value;
}
// GitHub가 콜백에 붙여 보내는 값을 흉내 낸다. state는 서버가 준 인증 주소의 값 그대로다.
const callbackFor = (authorizationUrl, code) => readCallbackParams(new URLSearchParams({
  code, state: new URL(authorizationUrl).searchParams.get('state'),
}));

let app;
try {
  await db.initialize(); await db.runMigrations();

  // 1. 기능 꺼짐(기본값): 시작·완료 모두 이용 불가. 개발 로그인 회원은 합성 연결(#104)로 시작한다.
  app = await start();
  {
    const { api } = await member(app);
    assert.deepEqual(await readConnection(api), SYNTHETIC);
    assert.deepEqual(await startConnection(api), { kind: 'failed', reason: 'unavailable' });
    assert.deepEqual(await completeConnection(api, { code: 'c', state: 'a'.repeat(64) }), { kind: 'unavailable' });
  }
  await app.close(); app = undefined;

  // 2. 기능 켬
  Object.assign(process.env, githubEnv);
  app = await start();
  const a = await disconnectedMember(app);

  // 서버가 준 인증 주소를 화면의 검사가 받아들인다(다른 출처·state 불일치면 이동하지 않는 검사와 같은 함수).
  const first = await startConnection(a.api);
  assert.equal(first.kind, 'ready');
  const url = new URL(first.authorizationUrl);
  assert.equal(url.searchParams.get('redirect_uri'), githubEnv.GITHUB_OAUTH_CALLBACK_URL);

  // 성공: 콜백 값 → 완료 → CONNECTED, 상태 조회도 연결됨.
  const params = callbackFor(first.authorizationUrl, 'code-253-first');
  assert.equal(params.kind, 'code');
  assert.deepEqual(await completeConnection(a.api, params), { kind: 'connected', accountLogin: 'octo-253' });
  assert.deepEqual(await readConnection(a.api), { kind: 'loaded', connection: { state: 'CONNECTED', accountLogin: 'octo-253' } });
  // 같은 콜백을 다시 보내면(새로고침·뒤로 가기) 이미 쓴 state라 거부다. 연결은 그대로다.
  assert.deepEqual(await completeConnection(a.api, params), { kind: 'rejected' });
  assert.deepEqual(exchanged, ['code-253-first'], '거부된 재전송은 GitHub로 교환하지 않는다');
  assert.equal((await readConnection(a.api)).connection.state, 'CONNECTED');

  // 다른 state(새 시작이 바꾼 이전 state 포함)는 거부다.
  const stale = await startConnection(a.api);
  const fresh = await startConnection(a.api);
  assert.deepEqual(await completeConnection(a.api, callbackFor(stale.authorizationUrl, 'code-253-stale')), { kind: 'rejected' });

  // GitHub 장애(교환 5xx)는 API 500 → 화면은 결과 불명. 기존 연결을 지우지 않는다. 쓴 state는 다시 쓸 수 없다.
  github = { exchange: 'down', scopes: '' };
  const down = callbackFor(fresh.authorizationUrl, 'code-253-down');
  assert.deepEqual(await completeConnection(a.api, down), { kind: 'unknown' });
  assert.deepEqual(await readConnection(a.api), { kind: 'loaded', connection: { state: 'CONNECTED', accountLogin: 'octo-253' } });
  github = { exchange: 'ok', scopes: '' };
  assert.deepEqual(await completeConnection(a.api, down), { kind: 'rejected' });

  // 추가 권한이 붙은 발급은 연결 실패(거부)다.
  github = { exchange: 'ok', scopes: 'repo' };
  const widened = await startConnection(a.api);
  assert.deepEqual(await completeConnection(a.api, callbackFor(widened.authorizationUrl, 'code-253-scope')), { kind: 'rejected' });
  github = { exchange: 'ok', scopes: '' };

  // 다른 회원: A의 연결과 분리되고, A가 받은 state를 B가 보내도 거부다.
  const b = await disconnectedMember(app);
  const forA = await startConnection(a.api);
  assert.deepEqual(await completeConnection(b.api, callbackFor(forA.authorizationUrl, 'code-253-other')), { kind: 'rejected' });
  assert.equal((await readConnection(b.api)).connection.state, 'DISCONNECTED');

  // CatchU 인증 오류: 완료가 401이면 토큰을 지우고 인증 오류로 돌려준다. 연결은 바뀌지 않는다.
  const expired = createAccessTokenStore();
  expired.set('not-a-valid-token');
  const anonymous = createApiClient({ baseUrl: await app.getUrl(), nodeEnv: 'test', tokens: expired, fetch: realFetch });
  assert.deepEqual(await completeConnection(anonymous, callbackFor(forA.authorizationUrl, 'code-253-expired')), { kind: 'auth' });
  assert.equal(expired.get().token, null);
  assert.deepEqual(await startConnection(anonymous), { kind: 'failed', reason: 'auth' });
  assert.deepEqual(await readConnection(a.api), { kind: 'loaded', connection: { state: 'CONNECTED', accountLogin: 'octo-253' } });

  console.log('PASS: 실제 web API 함수 → HTTP → PostgreSQL(GitHub 교환·계정 조회는 합성): 기능 꺼짐 이용 불가, 합성 연결 해제 뒤 미연결 조회, 서버 인증 주소 검사 통과, 콜백 값으로 연결 성공·연결됨 조회, 같은 콜백 재전송·이전 state·추가 권한·다른 회원 state 거부, GitHub 장애는 결과 불명이며 기존 연결 유지, 401 토큰 정리');
} finally {
  await app?.close();
  if (db.isInitialized) await db.destroy();
  await rm(vaultDirectory, { recursive: true, force: true });
  globalThis.fetch = realFetch;
}
