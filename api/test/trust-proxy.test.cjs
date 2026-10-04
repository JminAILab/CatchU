const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readTrustProxy } = require('../dist/trust-proxy');

// #150 10/4 보안 의견: 신뢰 프록시는 명시한 IP·CIDR만 받는다. 값 해석만 보고, 실제 요청 주소 판정은 test/db/public-links-client-address.test.cjs에서 본다.

test('신뢰 프록시: 없거나 비어 있으면 아무 프록시도 신뢰하지 않는다', () => {
  assert.deepEqual(readTrustProxy(undefined), []);
  assert.deepEqual(readTrustProxy(''), []);
  assert.deepEqual(readTrustProxy('   '), []);
});

test('신뢰 프록시: 쉼표로 구분한 IPv4·IPv6 주소와 CIDR을 받는다', () => {
  assert.deepEqual(readTrustProxy('10.0.0.0/24, 192.0.2.10,2001:db8::/48 , ::1'), ['10.0.0.0/24', '192.0.2.10', '2001:db8::/48', '::1']);
  assert.deepEqual(readTrustProxy('10.0.0.1/32,2001:db8::1/128'), ['10.0.0.1/32', '2001:db8::1/128']);
});

test('신뢰 프록시: 이름·홉 수·불리언·전체 대역·잘못된 CIDR은 기동을 멈추고 값을 오류에 넣지 않는다', () => {
  const messages = new Set();
  for (const value of [
    'true', 'false', '1', 'loopback', 'uniquelocal', 'lb.internal.example',
    '0.0.0.0/0', '::/0', '10.0.0.0/33', '2001:db8::/129', '10.0.0.0/', '10.0.0.0/8/8', '10.0.0.0/+8', '10.0.0.0/08x',
    '10.0.0.0/24,', '10.0.0.0/24,,192.0.2.1', '300.0.0.1',
  ]) {
    assert.throws(() => readTrustProxy(value), (error) => {
      assert.match(error.message, /TRUST_PROXY_CIDRS/);
      messages.add(error.message);
      return true;
    }, value);
  }
  assert.equal(messages.size, 1, '입력값과 상관없이 같은 문구여야 한다(값을 오류에 넣지 않음)');
});
