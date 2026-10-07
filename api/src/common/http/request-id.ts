import { randomUUID } from 'node:crypto';

/**
 * 요청 하나에 붙이는 서버 내부 식별자(#222). 같은 요청의 로그를 묶어 볼 때 쓴다.
 *
 * - 처음 물을 때 UUID를 만들고, 같은 요청 객체에는 같은 값을 돌려준다.
 * - 응답 헤더·본문·web으로 내보내지 않는다. 밖과 주고받게 되면 계약으로 먼저 정한다(#222 범위).
 * - 분석 요청 번호(`requestId` 칼럼)와는 다른 값이다.
 */
const ids = new WeakMap<object, string>();

export function requestIdOf(request: object): string {
  let id = ids.get(request);
  if (id === undefined) {
    id = randomUUID();
    ids.set(request, id);
  }
  return id;
}
