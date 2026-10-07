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

test('모든 경로에 헤더를 붙이고 X-Powered-By를 끈다', async () => {
  assert.equal(nextConfig.poweredByHeader, false);
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*');
});
