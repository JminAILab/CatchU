const assert = require('node:assert/strict');
const { test } = require('node:test');
const { clientAddressKey } = require('../dist/share-links/client-address');

// #150 10/4 보안 의견: 시도 제한을 세는 주소 단위. 주소는 모두 문서용 예시 대역(RFC 5737·3849)이다.

test('주소 단위: IPv4는 그 주소 하나가 한 칸이다', () => {
  assert.equal(clientAddressKey('203.0.113.5'), '4:203.0.113.5');
  assert.notEqual(clientAddressKey('203.0.113.5'), clientAddressKey('203.0.113.6'));
});

test('주소 단위: IPv4 매핑 IPv6는 점 표기·16진 표기·생략 없는 표기 모두 같은 IPv4와 한 칸이다', () => {
  const ipv4 = clientAddressKey('203.0.113.5');
  for (const mapped of ['::ffff:203.0.113.5', '::FFFF:203.0.113.5', '::ffff:cb00:7105', '0:0:0:0:0:ffff:cb00:7105']) {
    assert.equal(clientAddressKey(mapped), ipv4, mapped);
  }
});

test('주소 단위: 같은 IPv6 /64 안의 다른 주소는 표기가 달라도 한 칸이다', () => {
  const base = clientAddressKey('2001:db8:1:2::1');
  for (const same of ['2001:db8:1:2::ffff', '2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd', '2001:db8:1:2:0:0:0:9', '2001:db8:1:2::1%eth0']) {
    assert.equal(clientAddressKey(same), base, same);
  }
  assert.equal(base, '6:2001:db8:1:2::/64');
});

test('주소 단위: 다른 /64는 다른 칸이다(/56 안의 이웃 /64 포함)', () => {
  assert.notEqual(clientAddressKey('2001:db8:1:2::1'), clientAddressKey('2001:db8:1:3::1'));
  assert.notEqual(clientAddressKey('2001:db8:1:2::1'), clientAddressKey('2001:db8:2:2::1'));
});

test('주소 단위: IPv4 매핑이 아닌 ::로 시작하는 IPv6는 IPv4로 바꾸지 않는다', () => {
  assert.equal(clientAddressKey('::1'), '6:0:0:0:0::/64');
  assert.equal(clientAddressKey('::203.0.113.5'), '6:0:0:0:0::/64'); // IPv4 호환 표기(폐기)는 IPv6로 센다
  assert.notEqual(clientAddressKey('::ffff:0:203.0.113.5'), clientAddressKey('203.0.113.5'));
});

test('주소 단위: 없거나 해석할 수 없는 값은 unknown 한 칸이다', () => {
  for (const value of [undefined, '', 'unknown', 'not-an-ip', '203.0.113', '2001:db8::1::2', '1.2.3.4, 5.6.7.8']) {
    assert.equal(clientAddressKey(value), 'unknown', String(value));
  }
});
