// 12월 intent U2 시험 공용 도우미. 시험 파일이 아니다(이름이 .test.cjs로 끝나지 않아 실행기가 따로 돌리지 않는다).
// 실제 사용자 자료·실제 키를 쓰지 않는다. 키는 시험마다 무작위로 만든다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { configureApp } = require('../../dist/app.setup');

/** AppModule이 요구하는 인증 설정. 개발 로그인은 test 환경에서만 켠다. */
const APP_SETTINGS = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
  AUTH_WEB_ORIGIN: 'http://localhost:3000',
};
const WEB_ORIGIN = APP_SETTINGS.AUTH_WEB_ORIGIN;

/** 환경변수를 바꾸고, 되돌리는 함수를 돌려준다. undefined는 지운다. */
function setEnv(values) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** Nest 로거 출력을 모으는 로거 객체. */
function collectingLogger(logs) {
  return Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push({ level, args, text: args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') })]));
}

/** 모듈 하나로 실제 로컬 HTTP 서버를 띄운다. */
async function startApp(rootModule, logs = []) {
  const app = await configureApp(await NestFactory.create(rootModule, { logger: collectingLogger(logs), abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  /** /v1 아래를 부른다. origin을 주면 Origin 머리글을 붙인다. */
  async function call(method, path, { token, body, origin } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${url}/v1${path}`, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, body: text === '' ? null : JSON.parse(text) };
  }
  /** 개발 로그인으로 회원과 세션을 만든다(실제 Guard를 거치는 토큰). */
  async function login(identity = `u2-member-${randomUUID()}`) {
    const response = await call('POST', '/auth/dev-login', { body: { memberId: identity } });
    assert.equal(response.status, 200, response.text);
    const decoded = decodeJwt(response.body.accessToken);
    return { token: response.body.accessToken, memberId: decoded.sub, sessionId: decoded.sid };
  }
  return { app, url, call, login, logs };
}

/** 회원 행 하나를 직접 만든다(HTTP가 필요 없는 시험용). */
async function insertMember(db, memberId = randomUUID()) {
  await db.query("INSERT INTO member_account (member_id, identity_reference, account_state) VALUES ($1, $2, 'ACTIVE')",
    [memberId, `fixture:${memberId}`]);
  return memberId;
}

function expectError(response, status, code) {
  assert.equal(response.status, status, response.text);
  assert.equal(response.body.code, code, response.text);
}

module.exports = { APP_SETTINGS, WEB_ORIGIN, setEnv, collectingLogger, startApp, insertMember, expectError };
