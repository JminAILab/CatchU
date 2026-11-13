// 받은 링크에서 링크 토큰 꺼내기(U9 기능 설계 BR1.3, 비기능 설계 security-design 「겹겹의 검사」 4번·performance-design 「입력 상한」, NFR1.4·NFR4.2,
// 계약 C-15 input). DB가 없는 순수 함수다. 꺼낸 토큰만 C-10 판정에 넘기고, 주소의 호스트·포트·쿼리·조각(#)은 보지 않는다.
import { isLinkTokenFormat } from '../share-links/link-token';

/** 앞뒤 공백을 뗀 link의 길이 상한. 넘으면 주소로 읽지 않는다(NFR4.2). */
const LINK_MAX_LENGTH = 2_048;

/** 경로 끝의 `/s/{조각}`. 끝의 `/` 하나를 허용한다. */
const RECIPIENT_PATH_END = /\/s\/([^/]+)\/?$/;

/**
 * link가 43자 토큰이면 그대로, 주소면 경로가 `/s/{토큰}`으로 끝날 때 그 토큰을 돌려준다.
 * 꺼내지 못하면 null이다. 없는 토큰·잘못된 모양을 구분하지 않고, 부르는 쪽이 DB 없이 LINK_UNAVAILABLE로 끝낸다.
 */
export function extractLinkToken(link: string): string | null {
  const value = link.trim();
  if (value.length > LINK_MAX_LENGTH) return null;
  if (isLinkTokenFormat(value)) return value;
  const url = URL.parse(value);
  if (url === null) return null;
  const segment = RECIPIENT_PATH_END.exec(url.pathname)?.[1];
  return isLinkTokenFormat(segment) ? segment : null;
}
