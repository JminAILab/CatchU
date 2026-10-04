import { isIP } from 'node:net';
import { INestApplication } from '@nestjs/common';

/**
 * 신뢰할 프록시(부하분산기) 주소(#150 10/4 보안 의견). 요청 주소(`request.ip`)를 Express가 판정할 때만 쓴다.
 *
 * - `TRUST_PROXY_CIDRS`: 쉼표로 구분한 IP 또는 CIDR(예: `10.0.0.0/24`). 비어 있거나 없으면 어떤 프록시도 신뢰하지 않고
 *   직접 연결 주소를 쓴다(`X-Forwarded-For`를 무시).
 * - 주소 목록만 받는다. `true`·홉 수·`loopback` 같은 이름과 전체 대역(`/0`)은 거부한다. 넓게 열면 수신자가 `X-Forwarded-For`를
 *   꾸며 비밀번호 시도 제한을 피할 수 있다. 배포에서는 부하분산기 대역만 넣는다.
 * - Express의 `trust proxy`는 `request.ip`뿐 아니라 `request.hostname`·`request.protocol` 해석에도 쓰인다.
 *   api는 현재 이 둘을 쓰지 않지만, 설정은 실제 배포 경로(부하분산기 → api)와 맞아야 한다.
 */
export function readTrustProxy(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];
  return value.split(',').map((raw) => {
    const entry = raw.trim();
    if (!isTrustedProxyEntry(entry)) {
      // 값 자체는 오류에 넣지 않는다.
      throw new Error('TRUST_PROXY_CIDRS는 쉼표로 구분한 IP 또는 CIDR(예: 10.0.0.0/24)이어야 하며 전체 대역(/0)은 쓸 수 없습니다.');
    }
    return entry;
  });
}

function isTrustedProxyEntry(entry: string): boolean {
  const [address, prefix, extra] = entry.split('/');
  if (extra !== undefined) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 1 && bits <= (family === 4 ? 32 : 128);
}

/** app.init() 전에 부른다. 목록이 비면 `trust proxy`를 끈 상태로 명시한다. */
export function applyTrustProxy(app: INestApplication, value: string | undefined): void {
  const addresses = readTrustProxy(value);
  const server = app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void };
  server.set('trust proxy', addresses.length === 0 ? false : addresses);
}
