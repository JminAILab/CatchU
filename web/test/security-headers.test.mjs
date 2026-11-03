import assert from 'node:assert/strict';
import { test } from 'node:test';
import nextConfig, { securityHeaders } from '../next.config.ts';

const asMap = (headers) => Object.fromEntries(headers.map(({ key, value }) => [key, value]));
const directive = (csp, name) => csp.split('; ').find((part) => part.startsWith(`${name} `));

test('배포용 빌드: 개발용 eval 없이 HSTS를 붙이고 API 기준 주소의 출처로만 연결을 연다', () => {
  const headers = asMap(securityHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: ' https://api.catchu.example/base/ ' }));
  const csp = headers['Content-Security-Policy'];
  assert.equal(directive(csp, 'script-src'), "script-src 'self' 'unsafe-inline'");
  assert.equal(directive(csp, 'connect-src'), "connect-src 'self' https://api.catchu.example");
  assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(csp, 'object-src'), "object-src 'none'");
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Strict-Transport-Security'], 'max-age=300');
});

test('개발 서버: React 개발용 eval만 더하고 HSTS는 붙이지 않는다', () => {
  const headers = asMap(securityHeaders({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3001' }));
  const csp = headers['Content-Security-Policy'];
  assert.equal(directive(csp, 'script-src'), "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  assert.equal(directive(csp, 'connect-src'), "connect-src 'self' http://127.0.0.1:3001");
  assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(headers['Strict-Transport-Security'], undefined);
});

test('HSTS는 development·test가 아니면 붙인다(값이 없거나 다른 값 포함)', () => {
  for (const env of [{ NODE_ENV: 'production' }, {}, { NODE_ENV: 'staging' }]) {
    assert.equal(asMap(securityHeaders(env))['Strict-Transport-Security'], 'max-age=300', JSON.stringify(env));
  }
  for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }]) {
    assert.equal(asMap(securityHeaders(env))['Strict-Transport-Security'], undefined, JSON.stringify(env));
  }
});

test('API 기준 주소가 없거나 http(s)가 아니면 다른 출처로 연결을 열지 않는다', () => {
  for (const value of [undefined, '', 'not a url', 'ftp://files.catchu.example', 'javascript:alert(1)']) {
    const csp = asMap(securityHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: value }))['Content-Security-Policy'];
    assert.equal(directive(csp, 'connect-src'), "connect-src 'self'", String(value));
  }
});

test('API 기준 주소가 IPv6 주소면 CSP에 적을 수 없으므로 시작할 때 멈춘다', () => {
  for (const value of ['http://[::1]:3001', 'https://[2001:db8::1]']) {
    assert.throws(() => securityHeaders({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: value }), /IPv6/, value);
  }
});

test('개발 요청 로그: 두 콜백 주소만 빼고 다른 경로는 남긴다', () => {
  const { ignore } = nextConfig.logging.incomingRequests;
  const ignored = (url) => ignore.some((pattern) => pattern.test(url));
  for (const url of ['/google/callback', '/github/callback', '/google/callback?code=c&state=s', '/github/callback?code=c&state=s',
    '/google/callback?error=access_denied&state=s', '/google/callback?_rsc=abc']) {
    assert.equal(ignored(url), true, url);
    assert.equal(ignored(url), true, `${url}: 다시 대조해도 같다`);
  }
  for (const url of ['/', '/login', '/login?next=%2Fhome', '/home', '/profile/github', '/google/callbacks', '/google/callback/extra',
    '/github/callback2?code=c', '/s/google/callback?code=c', '/preview/google/callback', '/s/x?next=/google/callback']) {
    assert.equal(ignored(url), false, url);
  }
});

test('모든 경로에 헤더 생성 함수의 헤더를 붙이고 X-Powered-By를 끈다', async () => {
  // headers()는 process.env를 읽으므로, 실행하는 셸의 값과 관계없이 합성 값으로 확인하고 되돌린다.
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.catchu.example' };
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    assert.equal(nextConfig.poweredByHeader, false);
    const rules = await nextConfig.headers();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].source, '/:path*');
    assert.deepEqual(rules[0].headers, securityHeaders(env));
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
