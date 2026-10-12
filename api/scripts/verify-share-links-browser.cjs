// #149 수동 브라우저 검증 전용. 실제 앱/DB를 쓰며 응답 유실만 주입한다.
require('reflect-metadata');
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { createInterface } = require('node:readline');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { openTestDataSource } = require('../test/support/test-database.cjs');

let app, db, relay, input;
// 실패는 단계와 안전한 원인 코드만 남긴다. 예외 메시지·요청 본문·토큰·비밀번호·멱등 키·URL·SQL은 출력하지 않는다.
class VerificationFailure extends Error {
  constructor(stage, reason, status) { super(stage); this.stage = stage; this.reason = reason; this.status = status; }
}
// 원인으로 남길 수 있는 값은 아래 목록뿐이다. 목록에 없으면 unknown으로 남긴다.
const SAFE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EADDRINUSE', 'EACCES', 'EPIPE', // 운영체제·소켓
  'UND_ERR_INVALID_ARG', 'UND_ERR_NOT_SUPPORTED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', // Node fetch
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  '28P01', '28000', '3D000', '42P01', '53300', '57P01', '57P03', '08001', '08006', // PostgreSQL SQLSTATE
]);
const SAFE_NAMES = new Set(['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError']);
function safeReason(error) {
  for (const code of [error?.code, error?.cause?.code, error?.driverError?.code]) {
    if (SAFE_CODES.has(code)) return code;
  }
  return SAFE_NAMES.has(error?.name) ? error.name : 'unknown';
}
async function step(stage, run) {
  try { return await run(); } catch (error) {
    throw error instanceof VerificationFailure ? error : new VerificationFailure(stage, safeReason(error));
  }
}
const ACTIONS = {
  'request-body': '요청 본문이 16KB를 넘었다. 브라우저 입력을 확인한다',
  'rate-preparation': '빈도 제한 준비 요청이 400으로 끝나지 않았다. 도구를 재시작하고 새로 로그인한 뒤 다시 한다',
  'upstream-request': 'API 요청 자체가 실패했다. 요청 헤더·API 상태를 확인하고 도구를 재시작한다',
  'upstream-response': '발급 응답을 JSON으로 해석하지 못했다. API 상태를 확인한다',
  'initial-issue': 'loss의 첫 발급이 201이 아니었다. 입력값·유효 링크 수를 확인하고 새 회원으로 재시작한다',
  'db-count': '전용 DB 건수 조회가 실패했다. 테스트 DB 컨테이너 상태를 확인한다',
  'db-connect': '전용 DB(127.0.0.1, TEST_DB_PORT, catchu_149_test)의 실행·접속 정보를 확인한다',
  'db-migration': '빌드 결과와 테스트 DB의 마이그레이션 상태를 확인한다',
  'app-start': '빌드(npm run build)와 API 시작 설정을 확인한다',
  'relay-listen': '포트 3431을 쓰는 다른 프로세스를 확인한다',
  cleanup: '남은 node 프로세스와 포트 3431·DB 연결을 확인한다',
};
const actionFor = (stage) => ACTIONS[stage] ?? '도구를 재시작하고 새 회원으로 다시 한다';
async function main() {
  // .env/운영 DB는 읽지 않는다. 이 도구 전용 로컬 DB만 허용하며 기존 자료를 삭제하지 않는다.
  Object.assign(process.env, {
    NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true',
    DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '5433',
    DB_USER: process.env.TEST_DB_USER || 'catchu', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'catchu_local',
    DB_NAME: 'catchu_149_test', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '3600', SHARE_LINK_WEB_BASE_URL: 'http://localhost:3000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  });
  db = await step('db-connect', () => openTestDataSource());
  await step('db-migration', () => db.runMigrations());
  app = await step('app-start', async () => configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false })));
  await step('app-start', () => app.listen(0, '127.0.0.1'));
  const upstreamUrl = await app.getUrl();
  const identity = randomUUID();
  let mode = 'normal', first = null;
  const count = () => step('db-count', async () => (await db.query(`SELECT
    (SELECT count(*)::int FROM share_link) AS links,
    (SELECT count(*)::int FROM idempotency_record) AS records`))[0]);
  const emit = (data) => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }));
  relay = createServer(async (req, res) => {
    try {
      // absolute URL/다른 호스트 프록시 금지. 상류는 위에서 띄운 앱 하나다.
      if (!req.url.startsWith('/v1/')) { res.writeHead(404).end(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new VerificationFailure('request-body', 'too-large'); chunks.push(chunk); }
      let raw = Buffer.concat(chunks).toString();
      const headers = { ...req.headers };
      for (const name of ['host', 'connection', 'content-length', 'transfer-encoding']) delete headers[name];
      // 재시작할 때마다 새 합성 회원. 브라우저가 정한 기존 개발 회원 자료는 건드리지 않는다.
      if (req.method === 'POST' && req.url === '/v1/auth/dev-login') raw = JSON.stringify({ memberId: identity });
      const issuing = req.method === 'POST' && req.url === '/v1/share-links';
      const armed = issuing ? mode : 'normal';
      if (issuing) mode = 'normal';
      if (armed !== 'normal') {
        first = null;
        for (let i = 0; i < (armed === 'loss' ? 9 : 10); i++) {
          const fill = await step('rate-preparation', () => fetch(`${upstreamUrl}/v1/share-links`, { method: 'POST',
            headers: { ...headers, 'idempotency-key': randomUUID() }, body: JSON.stringify({ title: '' }),
            redirect: 'error', signal: AbortSignal.timeout(10000) }));
          await step('rate-preparation', () => fill.arrayBuffer());
          if (fill.status !== 400) throw new VerificationFailure('rate-preparation', 'unexpected-status', fill.status);
        }
      }
      const upstream = await step('upstream-request', () => fetch(upstreamUrl + req.url, { method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
        redirect: 'error', signal: AbortSignal.timeout(15000) }));
      const bytes = Buffer.from(await step('upstream-request', () => upstream.arrayBuffer()));
      if (issuing) {
        let data;
        try { data = JSON.parse(bytes.toString()); } catch { throw new VerificationFailure('upstream-response', 'invalid-json', upstream.status); }
        const key = headers['idempotency-key'];
        first ??= { key, raw, linkId: data.linkId };
        emit({ kind: 'issue', status: upstream.status, code: data.code,
          retryAfter: upstream.headers.get('retry-after'), cacheControl: upstream.headers.get('cache-control'),
          sameKey: key === first.key, sameBody: raw === first.raw,
          sameLink: first.linkId && data.linkId ? first.linkId === data.linkId : null,
          dropped: armed === 'loss' && upstream.status === 201, db: await count() });
        if (armed === 'loss' && upstream.status !== 201) throw new VerificationFailure('initial-issue', 'unexpected-status', upstream.status);
      }
      res.statusCode = upstream.status;
      upstream.headers.forEach((value, name) => {
        if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(name)) res.setHeader(name, value);
      });
      if (armed === 'loss') {
        // 성공 헤더를 보낸 뒤 본문을 끊어 fetch의 자동 네트워크 재시도와 구분한다.
        res.setHeader('Content-Length', bytes.length); res.flushHeaders(); res.write(bytes.subarray(0, 1));
        setTimeout(() => res.destroy(), 100);
      } else res.end(bytes);
    } catch (error) {
      const failure = error instanceof VerificationFailure ? error : new VerificationFailure('relay', safeReason(error));
      emit({ kind: 'verification-error', stage: failure.stage, reason: failure.reason,
        ...(failure.status ? { status: failure.status } : {}), action: actionFor(failure.stage) });
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"code":"INTERNAL_ERROR","message":"verification failed"}');
    }
  });
  await step('relay-listen', () => new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(3431, '127.0.0.1', resolve); }));
  input = createInterface({ input: process.stdin, output: process.stdout });
  input.once('SIGINT', () => { void closeSafely(); });
  input.on('line', line => {
    if (['normal', 'loss', '429'].includes(line.trim())) { mode = line.trim(); first = null; emit({ armed: mode }); }
  });
  emit({ ready: true, api: 'http://127.0.0.1:3431', commands: 'loss / 429 / normal', db: await count() });
}
async function close() { input?.close(); relay?.closeAllConnections(); if (relay?.listening) await new Promise(resolve => relay.close(resolve)); await app?.close(); await db?.destroy(); }
// 정리 실패도 예외 원문 대신 단계·원인만 남긴다.
const closeSafely = () => close().catch((error) => console.error(JSON.stringify({ at: new Date().toISOString(),
  kind: 'cleanup-error', stage: 'cleanup', reason: safeReason(error), action: actionFor('cleanup') })));
process.once('SIGINT', () => { void closeSafely(); });
main().catch(async (error) => {
  const failure = error instanceof VerificationFailure ? error : new VerificationFailure('startup', safeReason(error));
  console.error(JSON.stringify({ at: new Date().toISOString(), kind: 'startup-error', stage: failure.stage, reason: failure.reason, action: actionFor(failure.stage) }));
  await closeSafely(); process.exitCode = 1;
});
