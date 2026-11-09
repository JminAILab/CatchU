// 회원당 도구 호출 빈도(기능 설계 BR6.1~BR6.4, 비기능 설계 reliability-design 「빈도 집계의 실패」, 시나리오 S16).
// 실제 Redis 시험은 CATCHU_TEST_REDIS_URL이 있을 때만 돈다. 없으면 건너뛰고 통과로 세지 않는다. 키 접두사는 시험마다 새로 만든다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { after, before, beforeEach, test } = require('node:test');
const IORedis = require('ioredis').default;
const { McpMaterialReader } = require('../../dist/claude-mcp/mcp-material-reader');
const { McpRateLimiter } = require('../../dist/claude-mcp/mcp-rate-limiter');
const { McpTools } = require('../../dist/claude-mcp/mcp-tools');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { connectMember, events, failingConnection, pageOf, rpc, startMcpApp, swapConnection, toolErrorOf, unusedPort } = require('./support.cjs');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 Redis 시험을 건너뜀';
const WINDOW_MS = 60_000;
const NOW = 1_800_000_000_000;

function recordingLogger() {
  const entries = [];
  const push = (level) => (entry) => entries.push({ level, ...entry });
  return { entries, warn: push('warn'), error: push('error') };
}

async function waitFor(check, timeoutMs = 5000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value || Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** 연결이 준비될 때까지 기다린다. enableOfflineQueue가 꺼져 있어 준비 전 명령은 바로 실패한다. */
const ready = (limiter) => waitFor(() => limiter.redis.status === 'ready');

function closeLimiter(t, limiter) {
  t.after(() => limiter.onApplicationShutdown());
}

/** 시험마다 새 접두사를 쓰는 실제 Redis 빈도 집계. */
async function liveLimiter(t) {
  const prefix = `u6-rate-${randomUUID()}`;
  const logger = recordingLogger();
  const limiter = new McpRateLimiter({ redisUrl: REDIS_URL, prefix }, logger);
  closeLimiter(t, limiter);
  assert.equal(await ready(limiter), true);
  const inspect = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1 });
  t.after(async () => {
    for (const key of await inspect.keys(`${prefix}:*`)) await inspect.del(key);
    await inspect.quit();
  });
  return { limiter, logger, prefix, inspect };
}

/**
 * 받기만 하는 시험용 TCP 서버. answerHandshake면 연결 준비 명령에만 답하고 EVAL에는 답하지 않는다(명령 멈춤).
 * 아니면 어떤 명령에도 답하지 않는다(연결 멈춤).
 */
async function silentServer(t, { answerHandshake }) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('data', (data) => {
      if (!answerHandshake) return;
      for (const [, command] of data.toString().matchAll(/\*\d+\r\n\$\d+\r\n([A-Za-z]+)/g)) {
        const name = command.toUpperCase();
        if (name === 'HELLO') {
          socket.write('-NOPROTO unsupported protocol version\r\n'); // ioredis가 RESP2로 다시 시작한다
        } else if (name === 'INFO') {
          const info = 'redis_version:8.0.0\r\nloading:0\r\n';
          socket.write(`$${Buffer.byteLength(info)}\r\n${info}\r\n`);
        } else if (name === 'CLIENT') {
          socket.write('+OK\r\n');
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return `redis://127.0.0.1:${server.address().port}`;
}

test('S16 실제 Redis: 한 창에 60번까지 통과하고 61번째부터 거부한다', { skip, timeout: 30000 }, async (t) => {
  const { limiter, prefix, inspect } = await liveLimiter(t);
  const memberId = randomUUID();
  for (let call = 1; call <= 60; call += 1) assert.equal(await limiter.allow(memberId, NOW), true, `${call}번째`);
  assert.equal(await limiter.allow(memberId, NOW), false, '61번째');
  assert.equal(await limiter.allow(memberId, NOW), false, '62번째');
  assert.equal(await inspect.get(`${prefix}:mcp-rate:${memberId}:${Math.floor(NOW / WINDOW_MS)}`), '62', '키는 접두사·회원·분 창이다');
});

test('S16 실제 Redis: 다른 회원은 따로 세고 다음 창은 처음부터 센다', { skip, timeout: 30000 }, async (t) => {
  const { limiter } = await liveLimiter(t);
  const [memberA, memberB] = [randomUUID(), randomUUID()];
  for (let call = 1; call <= 60; call += 1) await limiter.allow(memberA, NOW);
  assert.equal(await limiter.allow(memberA, NOW), false);
  assert.equal(await limiter.allow(memberB, NOW), true, '다른 회원');
  assert.equal(await limiter.allow(memberA, NOW + WINDOW_MS), true, '다음 창');
});

test('S16 실제 Redis: 키는 처음 셀 때 120초 만료가 걸리고 그 뒤로 늘어나지 않는다', { skip, timeout: 30000 }, async (t) => {
  const { limiter, prefix, inspect } = await liveLimiter(t);
  const memberId = randomUUID();
  const key = `${prefix}:mcp-rate:${memberId}:${Math.floor(NOW / WINDOW_MS)}`;
  await limiter.allow(memberId, NOW);
  const first = await inspect.ttl(key);
  assert.ok(first > 110 && first <= 120, `ttl ${first}`);
  await inspect.expire(key, 50);
  await limiter.allow(memberId, NOW);
  assert.ok(await inspect.ttl(key) <= 50, '두 번째 호출은 만료를 다시 걸지 않는다');
});

test('S16 주소가 없으면 연결 없이 언제나 통과하고 로그를 한 번 남긴다', async () => {
  const logger = recordingLogger();
  const limiter = new McpRateLimiter(null, logger);
  assert.equal(limiter.redis, null);
  for (let call = 0; call < 70; call += 1) assert.equal(await limiter.allow(randomUUID()), true);
  assert.deepEqual(logger.entries, [{ level: 'warn', event: 'mcp_rate_limit_off', message: 'MCP 빈도 제한 꺼짐' }]);
  limiter.onApplicationShutdown();
});

test('S16 끊김: 닫힌 포트면 바로 통과하고 오류 이름만 남기며, 연결 오류는 이어져도 첫 오류만 남는다', { timeout: 30000 }, async (t) => {
  const port = await unusedPort();
  const logger = recordingLogger();
  const redisUrl = `redis://127.0.0.1:${port}`;
  const limiter = new McpRateLimiter({ redisUrl, prefix: `u6-rate-${randomUUID()}` }, logger);
  closeLimiter(t, limiter);
  assert.ok(await waitFor(() => logger.entries.length >= 1), '연결 오류를 남긴다');
  await new Promise((resolve) => setTimeout(resolve, 400)); // 그사이 다시 연결을 시도해도 더 남기지 않는다
  assert.equal(logger.entries.length, 1);
  assert.deepEqual(Object.keys(logger.entries[0]).sort(), ['error', 'event', 'level']);
  assert.equal(logger.entries[0].event, 'mcp_rate_limit_error');
  assert.equal(logger.entries[0].level, 'warn');

  const started = Date.now();
  assert.equal(await limiter.allow(randomUUID()), true);
  assert.ok(Date.now() - started < 500, '오프라인 대기 없이 끝난다');
  assert.equal(logger.entries.length, 2, '셈 명령의 오류도 남긴다');
  const text = JSON.stringify(logger.entries);
  assert.ok(!text.includes(redisUrl) && !text.includes(String(port)), '주소를 로그에 남기지 않는다');
});

test('S16 멈춤(연결): 답하지 않는 서버면 준비 전이라 호출이 걸리지 않고 통과한다', { timeout: 30000 }, async (t) => {
  const redisUrl = await silentServer(t, { answerHandshake: false });
  const logger = recordingLogger();
  const limiter = new McpRateLimiter({ redisUrl, prefix: `u6-rate-${randomUUID()}` }, logger);
  closeLimiter(t, limiter);
  const started = Date.now();
  assert.equal(await limiter.allow(randomUUID()), true);
  assert.ok(Date.now() - started < 1000, '1초를 넘기지 않는다');
  assert.deepEqual(logger.entries.map((entry) => entry.event), ['mcp_rate_limit_error']);
});

test('S16 멈춤(명령): 준비 뒤 셈 명령에 답이 없으면 약 1초 뒤 통과하고 오류 이름만 남긴다', { timeout: 30000 }, async (t) => {
  const redisUrl = await silentServer(t, { answerHandshake: true });
  const logger = recordingLogger();
  const limiter = new McpRateLimiter({ redisUrl, prefix: `u6-rate-${randomUUID()}` }, logger);
  closeLimiter(t, limiter);
  assert.equal(await ready(limiter), true);
  logger.entries.length = 0;
  const started = Date.now();
  assert.equal(await limiter.allow(randomUUID()), true);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 900 && elapsed < 1800, `${elapsed}ms`);
  assert.deepEqual(logger.entries, [{ level: 'warn', event: 'mcp_rate_limit_error', error: 'Error' }]);
});

test('앱 종료 때 Redis 연결을 닫는다', { skip, timeout: 30000 }, async (t) => {
  const { limiter } = await liveLimiter(t);
  limiter.onApplicationShutdown();
  assert.equal(await waitFor(() => limiter.redis.status === 'end'), true);
});

// HTTP 경계: 실제 앱에 실제 Redis 빈도 집계를 끼운다. 창이 바뀌어 시험이 흔들리지 않게 시각만 고정한다.
let server;
let db;
let startupOffLogs;
before(async () => {
  server = await startMcpApp();
  startupOffLogs = events(server, 'mcp_rate_limit_off');
  db = await openTestDataSource();
});
after(async () => {
  await server?.close();
  await db?.destroy();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
});

async function installLiveLimiter(t) {
  const live = await liveLimiter(t);
  const tools = server.app.get(McpTools);
  const original = tools.limiter;
  const allow = live.limiter.allow.bind(live.limiter);
  live.limiter.allow = (memberId) => allow(memberId, NOW);
  tools.limiter = live.limiter;
  t.after(() => { tools.limiter = original; });
  return live;
}

test('S16 앱 기동: 큐 주소가 없으면 「MCP 빈도 제한 꺼짐」을 한 번 남기고 도구 호출을 세지 않는다', async () => {
  assert.deepEqual(startupOffLogs, [{ event: 'mcp_rate_limit_off', message: 'MCP 빈도 제한 꺼짐' }]);
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assert.deepEqual(pageOf(await server.callTool(token, 'list_my_catches')), { catches: [], nextCursor: null });
  assert.deepEqual(events(server, 'mcp_rate_limit_off'), [], '호출마다 다시 남기지 않는다');
});

test('S16 HTTP: 61번째 tools/call은 DB를 읽지 않고 RATE_LIMITED이며 다른 회원과 tools/list는 통과한다', { skip, timeout: 60000 }, async (t) => {
  const { prefix, inspect } = await installLiveLimiter(t);
  const [memberA, memberB] = [await server.login(), await server.login()];
  const { token } = await connectMember(db, memberA.memberId);
  const other = await connectMember(db, memberB.memberId);
  const key = `${prefix}:mcp-rate:${memberA.memberId}:${Math.floor(NOW / WINDOW_MS)}`;
  for (let call = 1; call <= 60; call += 1) pageOf(await server.callTool(token, 'list_my_catches', {}, call));
  assert.equal(await inspect.get(key), '60');

  // 61번째가 자료 읽개까지 가면 이 연결이 실패해 INTERNAL_ERROR가 된다.
  const reader = server.app.get(McpMaterialReader);
  swapConnection(t, reader, failingConnection());
  const limited = toolErrorOf(await server.callTool(token, 'list_my_text_materials'));
  assert.equal(limited.error, 'RATE_LIMITED');
  assert.deepEqual(events(server, 'mcp_rate_limited'), [{ event: 'mcp_rate_limited', tool: 'list_my_text_materials' }]);
  assert.deepEqual(events(server, 'mcp_tool_failed'), []);

  const before61 = await inspect.get(key);
  const listed = await server.mcp(rpc('tools/list'), { token });
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.body.result.tools.length, 2);
  assert.equal(await inspect.get(key), before61, 'tools/list는 세지 않는다');
  assert.equal(toolErrorOf(await server.callTool(other.token, 'list_my_catches')).error, 'INTERNAL_ERROR', '다른 회원은 빈도를 통과해 읽기까지 간다');
  assert.ok(!JSON.stringify(events(server, 'mcp_rate_limited')).includes('60'), '횟수를 로그에 남기지 않는다');
});

test('S16 HTTP: 묶음 호출은 tools/call을 하나씩 센다', { skip, timeout: 30000 }, async (t) => {
  const { prefix, inspect } = await installLiveLimiter(t);
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  const batch = [
    rpc('tools/call', { name: 'list_my_catches', arguments: {} }, 1),
    rpc('tools/call', { name: 'list_my_text_materials', arguments: {} }, 2),
    rpc('tools/list', {}, 3),
  ];
  const response = await server.mcp(batch, { token });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.length, 3);
  assert.equal(await inspect.get(`${prefix}:mcp-rate:${member.memberId}:${Math.floor(NOW / WINDOW_MS)}`), '2');
});

test('S16 HTTP: Redis가 끊겨도 도구 호출은 통과하고 경고를 남긴다', { timeout: 30000 }, async (t) => {
  const logger = recordingLogger();
  const limiter = new McpRateLimiter({ redisUrl: `redis://127.0.0.1:${await unusedPort()}`, prefix: `u6-rate-${randomUUID()}` }, logger);
  closeLimiter(t, limiter);
  const tools = server.app.get(McpTools);
  const original = tools.limiter;
  tools.limiter = limiter;
  t.after(() => { tools.limiter = original; });
  const member = await server.login();
  const { token } = await connectMember(db, member.memberId);
  assert.deepEqual(pageOf(await server.callTool(token, 'list_my_catches')), { catches: [], nextCursor: null });
  assert.ok(logger.entries.some((entry) => entry.event === 'mcp_rate_limit_error'));
});
