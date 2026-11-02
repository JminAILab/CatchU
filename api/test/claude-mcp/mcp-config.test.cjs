// U6 설정 판정(기능 명세 「공개 주소 판정」, 기능 설계 BR1.2~BR1.4·BR2.2·BR4.2·BR4.6, 시나리오 S2). 순수 함수만 본다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CLAUDE_REDIRECT_URI, MCP_TOKEN_MAX_TTL_SECONDS, isSameResource, readMcpConfig } = require('../../dist/claude-mcp/mcp-config');

const WEB = 'https://catchu.example';
const DEV_WEB = 'http://localhost:3000';
const TUNNEL = 'https://synthetic-tunnel.example';
const production = (values = {}) => ({ NODE_ENV: 'production', AUTH_WEB_ORIGIN: WEB, PORT: '3001', ...values });
const development = (values = {}) => ({ NODE_ENV: 'development', AUTH_WEB_ORIGIN: DEV_WEB, PORT: '4100', ...values });

/** 값 대신 설정 이름만 든 오류인지 본다. */
function rejectsWithNameOnly(env, name, value) {
  assert.throws(() => readMcpConfig(env), (error) => {
    assert.ok(error.message.includes(name), error.message);
    assert.ok(!error.message.includes(value), '오류에 값이 들어가지 않는다');
    return true;
  });
}

test('S2 개발·test에 공개 주소가 없으면 http://127.0.0.1:{PORT}이고 승인 화면은 AUTH_WEB_ORIGIN이다', () => {
  for (const NODE_ENV of ['development', 'test']) {
    const config = readMcpConfig(development({ NODE_ENV }));
    assert.equal(config.publicOrigin, 'http://127.0.0.1:4100');
    assert.equal(config.mcpUrl, 'http://127.0.0.1:4100/v1/mcp');
    assert.equal(config.authorizeScreenUrl, `${DEV_WEB}/profile/claude/authorize`);
  }
  assert.equal(readMcpConfig({ NODE_ENV: 'test', AUTH_WEB_ORIGIN: DEV_WEB }).publicOrigin, 'http://127.0.0.1:3001', 'PORT가 없으면 main.ts의 기본 포트');
});

test('S2 개발·test에 공개 주소가 있으면 그 값이고 승인 화면은 그대로 AUTH_WEB_ORIGIN이다', () => {
  const config = readMcpConfig(development({ MCP_DEV_PUBLIC_ORIGIN: TUNNEL }));
  assert.equal(config.publicOrigin, TUNNEL);
  assert.equal(config.mcpUrl, `${TUNNEL}/v1/mcp`);
  assert.equal(config.authorizeScreenUrl, `${DEV_WEB}/profile/claude/authorize`);
});

test('S2 운영(값 없음·그 밖의 NODE_ENV 포함)은 AUTH_WEB_ORIGIN을 쓰고 127.0.0.1 기본값을 쓰지 않는다', () => {
  for (const env of [production(), production({ NODE_ENV: 'staging' }), { AUTH_WEB_ORIGIN: WEB, PORT: '3001' }]) {
    const config = readMcpConfig(env);
    assert.equal(config.publicOrigin, WEB);
    assert.equal(config.mcpUrl, `${WEB}/v1/mcp`);
    assert.equal(config.authorizeScreenUrl, `${WEB}/profile/claude/authorize`);
    assert.deepEqual(config.redirectUris, [CLAUDE_REDIRECT_URI]);
    assert.ok(!config.mcpUrl.includes('127.0.0.1'));
  }
});

test('S2 운영에 개발용 값이 있으면 기동을 멈추고 오류에는 설정 이름만 있다', () => {
  rejectsWithNameOnly(production({ MCP_DEV_PUBLIC_ORIGIN: TUNNEL }), 'MCP_DEV_PUBLIC_ORIGIN', TUNNEL);
  rejectsWithNameOnly(production({ MCP_DEV_REDIRECT_URIS: 'http://127.0.0.1:6274/secret-path' }), 'MCP_DEV_REDIRECT_URIS', 'secret-path');
});

test('S2 빈 값은 없는 것으로 본다', () => {
  const blank = { MCP_DEV_PUBLIC_ORIGIN: '', MCP_DEV_REDIRECT_URIS: '', MCP_ACCESS_TOKEN_TTL_SECONDS: '' };
  assert.equal(readMcpConfig(production(blank)).publicOrigin, WEB);
  const config = readMcpConfig(development(blank));
  assert.equal(config.publicOrigin, 'http://127.0.0.1:4100');
  assert.deepEqual(config.redirectUris, [CLAUDE_REDIRECT_URI]);
  assert.equal(config.accessTokenTtlSeconds, MCP_TOKEN_MAX_TTL_SECONDS);
});

test('S2 MCP_DEV_REDIRECT_URIS는 쉼표로 나눠 Claude 콜백 뒤에 더하고, 주소가 아니면 이름만 든 오류다', () => {
  const uris = readMcpConfig(development({ MCP_DEV_REDIRECT_URIS: 'http://127.0.0.1:6274/a, http://127.0.0.1:6275/b' })).redirectUris;
  assert.deepEqual(uris, [CLAUDE_REDIRECT_URI, 'http://127.0.0.1:6274/a', 'http://127.0.0.1:6275/b']);
  rejectsWithNameOnly(development({ MCP_DEV_REDIRECT_URIS: 'http://127.0.0.1:6274/a,not-a-url-value' }), 'MCP_DEV_REDIRECT_URIS', 'not-a-url-value');
});

test('MCP_DEV_PUBLIC_ORIGIN은 끝 슬래시 없는 http(s) 출처만 받는다', () => {
  for (const value of [`${TUNNEL}/`, `${TUNNEL}/path`, 'ftp://synthetic-tunnel.example', 'not-a-url-value', `${TUNNEL}?a=1`]) {
    rejectsWithNameOnly(development({ MCP_DEV_PUBLIC_ORIGIN: value }), 'MCP_DEV_PUBLIC_ORIGIN', value);
  }
});

test('S2 토큰 수명은 기본 7일이고 7일 초과·0·문자열·음수·소수는 기동을 멈춘다', () => {
  assert.equal(readMcpConfig(development()).accessTokenTtlSeconds, 604800);
  assert.equal(readMcpConfig(development({ MCP_ACCESS_TOKEN_TTL_SECONDS: '604800' })).accessTokenTtlSeconds, 604800);
  assert.equal(readMcpConfig(development({ MCP_ACCESS_TOKEN_TTL_SECONDS: '60' })).accessTokenTtlSeconds, 60);
  for (const value of ['604801', '0', 'abc', '-1', '1.5', '06']) {
    rejectsWithNameOnly(development({ MCP_ACCESS_TOKEN_TTL_SECONDS: value }), 'MCP_ACCESS_TOKEN_TTL_SECONDS', value === '0' ? 'never-in-message' : value);
  }
});

test('설정 값은 고쳐 쓸 수 없고 AUTH_WEB_ORIGIN이 잘못되면 기동을 멈춘다', () => {
  const config = readMcpConfig(development());
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.redirectUris));
  assert.throws(() => readMcpConfig({ NODE_ENV: 'production' }), /AUTH_WEB_ORIGIN/);
});

test('BR4.6 resource는 정규형으로 MCP 주소와 비교한다', () => {
  const mcpUrl = 'https://catchu.example/v1/mcp';
  for (const same of [mcpUrl, `${mcpUrl}/`, `${mcpUrl}#fragment`, 'HTTPS://CATCHU.EXAMPLE/v1/mcp', 'https://catchu.example:443/v1/mcp']) {
    assert.equal(isSameResource(mcpUrl, same), true, same);
  }
  for (const other of ['https://catchu.example/v1/mcp/other', 'https://catchu.example/v1', 'http://catchu.example/v1/mcp', 'https://catchu.example:8443/v1/mcp',
    'https://other.example/v1/mcp', `${mcpUrl}?a=1`, 'not-a-url', '']) {
    assert.equal(isSameResource(mcpUrl, other), false, other);
  }
});
