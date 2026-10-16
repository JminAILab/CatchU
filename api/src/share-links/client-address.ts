import { isIP } from 'node:net';

/**
 * 비밀번호 시도 제한을 세는 주소 단위(#150 10/4 보안 의견). 입력은 Express가 신뢰 프록시 설정으로 판정한 `request.ip`다.
 *
 * - IPv4: 그 주소. `4:<주소>`
 * - IPv4 매핑 IPv6(`::ffff:a.b.c.d`, 16진 표기 포함): IPv4로 바꿔 IPv4와 같은 칸으로 센다.
 * - 그 밖의 IPv6: 앞 64비트(/64). `6:<앞 네 구역>::/64`. 같은 /64 안에서 주소만 바꿔 다시 시도하는 것을 막는다.
 * - 해석할 수 없거나 없음: `unknown` 한 칸.
 *
 * /64는 한 사람을 가리키지 않는다. 가입자에게 /56·/48을 주는 망에서는 한 사람이 여러 /64를 가질 수 있고,
 * IPv4 공유 NAT에서는 여러 정상 사용자가 한 칸으로 묶인다. 반환값은 시도 제한의 키로만 쓰고 로그·응답에 내보내지 않는다.
 */
export function clientAddressKey(ip: string | undefined): string {
  if (typeof ip !== 'string' || ip === '') return 'unknown';
  const address = ip.split('%')[0]; // IPv6 zone id는 같은 호스트의 인터페이스 표시라 뺀다.
  const family = isIP(address);
  if (family === 4) return `4:${address}`;
  if (family !== 6) return 'unknown';
  const groups = expandIPv6(address);
  if (groups === null) return 'unknown';
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return `4:${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }
  return `6:${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

/** isIP가 6으로 판정한 주소를 16비트 구역 8개로 펼친다. 끝에 IPv4 표기가 오면 두 구역으로 바꾼다. */
function expandIPv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((group) => Number.parseInt(group, 16)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...rest];
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}
