require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { inspect } = require('node:util');
const { test } = require('node:test');
const { GitHubClient, GitHubAccessToken, GitHubProviderError, providerExpiresAt } = require('../dist/github-connection/github.client');
const { readGitHubConfig } = require('../dist/github-connection/github.config');
const { resolve } = require('node:path');
const config = { enabled: true, clientId: 'fake-client', clientSecret: 'FAKE_CLIENT_SECRET',
  callbackUrl: 'http://localhost:3000/github/callback', vaultDirectory: resolve('fake-vault'),
  encryptionKey: randomBytes(32) };
const issued = () => ({ access_token: 'FAKE_ACCESS_TOKEN', token_type: 'bearer', scope: '', expires_in: 721,
  refresh_token: 'FAKE_REFRESH_NEVER_RETURNED' });
const identity = () => new Response(JSON.stringify({ id: 12345, login: 'test-user' }), { headers: { 'x-oauth-scopes': '' } });
async function fakeFetch(responses, fn) {
  const saved = global.fetch, requests = [];
  global.fetch = async (...args) => {
    requests.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  try { return await fn(requests); } finally { global.fetch = saved; }
}
test('추가 scope 없이 교환하고 발급 응답 수명만 사용하며 refresh는 반환하지 않음', async () => {
  await fakeFetch([new Response(JSON.stringify(issued())), identity()], async requests => {
    const started = Date.now();
    const value = await new GitHubClient(config).exchange('fake-code', 'fake-verifier');
    assert.equal(value.accountLogin, 'test-user');
    assert.equal(value.externalAccountReference, '12345');
    assert(value.expiresAt.getTime() >= started + 721000);
    assert(value.expiresAt.getTime() <= Date.now() + 721000);
    assert.equal(value.token.reveal(), 'FAKE_ACCESS_TOKEN');
    assert(!JSON.stringify(value).includes('FAKE_ACCESS_TOKEN'));
    assert(!JSON.stringify(value).includes('FAKE_REFRESH'));
    assert(!inspect(value).includes('FAKE_ACCESS_TOKEN'));
    assert.equal(String(value.token), '[redacted]');
    assert.equal(requests[0][0], 'https://github.com/login/oauth/access_token');
    assert.equal(requests[1][0], 'https://api.github.com/user');
    assert.equal(new URLSearchParams(requests[0][1].body).get('code_verifier'), 'fake-verifier');
    for (const [, options] of requests) { assert.equal(options.redirect, 'error'); assert(options.signal); }
  });
});
for (const value of [undefined, null, 0, -1, 1.5, '3600', Number.MAX_SAFE_INTEGER, Infinity]) {
  test('누락·잘못된 expires_in은 연결 실패: ' + String(value), async () => {
    await fakeFetch([new Response(JSON.stringify({ ...issued(), expires_in: value }))], async () => {
      await assert.rejects(new GitHubClient(config).exchange('code', 'verifier'), GitHubProviderError);
    });
  });
}
for (const scope of ['repo', 'public_repo', 'read:user', undefined]) {
  test('실제 교환 권한이 최소 권한과 다르면 거부: ' + String(scope), async () => {
    await fakeFetch([new Response(JSON.stringify({ ...issued(), scope }))], async () => {
      await assert.rejects(new GitHubClient(config).exchange('code', 'verifier'), e => e.reason === 'scopeRejected');
    });
  });
}
test('user 응답의 실제 권한 누락·넓은 권한도 거부', async () => {
  for (const scope of [undefined, 'repo']) {
    await fakeFetch([new Response(JSON.stringify({ id: 1, login: 'user' }), { headers: scope === undefined ? {} : { 'x-oauth-scopes': scope } })],
      async () => assert.rejects(new GitHubClient(config).identity(new GitHubAccessToken('FAKE')), e => e.reason === 'scopeRejected'));
  }
});
test('폐기·외부 오류·잘못된 본문·큰 응답은 비밀값 없는 고정 오류', async () => {
  for (const response of [new Response('FAKE_TOKEN', { status: 401 }), new Response('FAKE_TOKEN', { status: 500 }),
    new Response('FAKE_TOKEN'), new Response('x'.repeat(65537)), new Error('FAKE_TOKEN')]) {
    await fakeFetch([response], async () => {
      await assert.rejects(new GitHubClient(config).identity(new GitHubAccessToken('FAKE')), e =>
        e instanceof GitHubProviderError && !String(e).includes('FAKE_TOKEN'));
    });
  }
});
test('유효 시각 계산은 임의 고정 수명·슬라이딩 연장 없음', () => {
  const start = Date.now();
  assert.equal(providerExpiresAt(173, start).getTime(), start + 173000);
});
test('설정 기본 비활성 및 필수·운영 콜백·별도 암호화 키 검증', () => {
  assert.deepEqual(readGitHubConfig({}), { enabled: false });
  const env = { NODE_ENV: 'test', GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client',
    GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET', GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/callback',
    GITHUB_CREDENTIAL_DIRECTORY: resolve('fake-vault'), GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') };
  assert(readGitHubConfig(env).enabled);
  for (const key of Object.keys(env).filter(k => k !== 'GITHUB_CONNECTION_ENABLED')) {
    const missing = { ...env }; delete missing[key];
    assert.throws(() => readGitHubConfig(missing));
  }
  assert.throws(() => readGitHubConfig({ ...env, NODE_ENV: 'production' }));
  assert.throws(() => readGitHubConfig({ ...env, AUTH_JWT_SECRET: env.GITHUB_CREDENTIAL_ENCRYPTION_KEY }));
  assert.throws(() => readGitHubConfig({ ...env, GITHUB_CREDENTIAL_DIRECTORY: 'relative' }));
  assert.throws(() => readGitHubConfig({ GITHUB_CONNECTION_ENABLED: 'yes' }));
});

test('HTTP 콜백은 development·test의 허용 루프백만, 미지정·기타 환경은 HTTPS만 허용', () => {
  const env = { GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client',
    GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET', GITHUB_CREDENTIAL_DIRECTORY: resolve('fake-vault'),
    GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') };
  for (const nodeEnv of ['development', 'test', 'production', undefined, '', 'staging', 'Development']) {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '192.168.0.1', 'localhost.evil.example']) {
      const settings = { ...env, NODE_ENV: nodeEnv, GITHUB_OAUTH_CALLBACK_URL: `http://${host}:3000/callback` };
      const allowed = ['development', 'test'].includes(nodeEnv) && ['localhost', '127.0.0.1', '[::1]'].includes(host);
      if (allowed) assert.equal(readGitHubConfig(settings).enabled, true);
      else assert.throws(() => readGitHubConfig(settings));
    }
    assert.equal(readGitHubConfig({ ...env, NODE_ENV: nodeEnv, GITHUB_OAUTH_CALLBACK_URL: 'https://catchu.example/github/callback' }).enabled, true);
  }
});
