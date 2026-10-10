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
  db = await openTestDataSource(); await db.runMigrations();
  app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const upstreamUrl = await app.getUrl();
  const identity = randomUUID();
  let mode = 'normal', first = null;
  const count = async () => (await db.query(`SELECT
    (SELECT count(*)::int FROM share_link) AS links,
    (SELECT count(*)::int FROM idempotency_record) AS records`))[0];
  const emit = (data) => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }));
  relay = createServer(async (req, res) => {
    try {
      // absolute URL/다른 호스트 프록시 금지. 상류는 위에서 띄운 앱 하나다.
      if (!req.url.startsWith('/v1/')) { res.writeHead(404).end(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('body limit'); chunks.push(chunk); }
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
          const fill = await fetch(`${upstreamUrl}/v1/share-links`, { method: 'POST',
            headers: { ...headers, 'idempotency-key': randomUUID() }, body: JSON.stringify({ title: '' }),
            redirect: 'error', signal: AbortSignal.timeout(10000) });
          await fill.arrayBuffer();
          if (fill.status !== 400) throw new Error('rate preparation failed');
        }
      }
      const upstream = await fetch(upstreamUrl + req.url, { method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
        redirect: 'error', signal: AbortSignal.timeout(15000) });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (issuing) {
        const data = JSON.parse(bytes.toString());
        const key = headers['idempotency-key'];
        first ??= { key, raw, linkId: data.linkId };
        emit({ kind: 'issue', status: upstream.status, code: data.code,
          retryAfter: upstream.headers.get('retry-after'), cacheControl: upstream.headers.get('cache-control'),
          sameKey: key === first.key, sameBody: raw === first.raw,
          sameLink: first.linkId && data.linkId ? first.linkId === data.linkId : null,
          dropped: armed === 'loss' && upstream.status === 201, db: await count() });
        if (armed === 'loss' && upstream.status !== 201) throw new Error('initial issue failed');
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
    } catch {
      emit({ kind: 'verification-error', action: 'API/DB 준비 또는 요청 순서를 확인하고 새 회원으로 재시작' });
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"code":"INTERNAL_ERROR","message":"verification failed"}');
    }
  });
  await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(3431, '127.0.0.1', resolve); });
  input = createInterface({ input: process.stdin, output: process.stdout });
  input.once('SIGINT', () => { void close(); });
  input.on('line', line => {
    if (['normal', 'loss', '429'].includes(line.trim())) { mode = line.trim(); first = null; emit({ armed: mode }); }
  });
  emit({ ready: true, api: 'http://127.0.0.1:3431', commands: 'loss / 429 / normal', db: await count() });
}
async function close() { input?.close(); relay?.closeAllConnections(); if (relay?.listening) await new Promise(resolve => relay.close(resolve)); await app?.close(); await db?.destroy(); }
process.once('SIGINT', () => { void close(); });
main().catch(async () => { console.error('검증 환경 시작 실패: 빌드·로컬 catchu_149_test DB·포트 3431을 확인하세요.'); await close(); process.exitCode = 1; });
