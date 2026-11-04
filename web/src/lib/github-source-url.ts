/**
 * GitHub 주소 판정과 본문 안 주소 링크 나누기. 받은 사람 화면(10월 `recipient-format.ts`)에 있던 판정을 옮겼고
 * 동작은 바꾸지 않았다. 작성자 발행본 상세(U4 W5)와 받은 사람 화면(W4)이 같은 규칙을 쓴다(#416 Q1 B, NFR1.11).
 */

/** 근거 원문은 GitHub의 https 주소만 새 탭 링크로 연다(보안 점검 「화면 출력」). 그 밖의 값은 글자로만 보인다. */
export function isGithubSourceUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password;
}

export type TextSegment = { kind: "text"; text: string } | { kind: "link"; url: string };

/** 주소에 쓸 수 있는 글자(RFC 3986의 비예약·예약 문자와 `%`). 따옴표·꺾쇠·공백·한글은 주소 밖이다. */
const URL_CHARS = String.raw`A-Za-z0-9\-._~:/?#\[\]@!$&()*+,;=%`;
/** 주소 후보: `https://github.com` 바로 뒤가 경로·포트·쿼리·조각이거나 주소 글자가 아니어야 한다(`github.com.evil`·`github.coma`는 후보가 아니다). */
const CANDIDATE = new RegExp(String.raw`https://github\.com(?=[/:?#]|[^${URL_CHARS}]|$)[${URL_CHARS}]*`, "gi");
/** 문장 부호가 주소 끝에 붙은 경우는 주소에서 뺀다(예: "…/pull/1." "(…/o/r)와"). */
const TRAILING_PUNCTUATION = /[.,;:!?)\]*]+$/;

/**
 * 자유 문장(텍스트 자료 본문·Catch 작성자 설명)에서 GitHub 주소만 링크 조각으로 나눈다. 판정은 `isGithubSourceUrl`과 같다(결정 D8).
 * 주소의 끝은 주소 글자(RFC 3986)가 끊기는 곳(공백·따옴표·꺾쇠·한글 등)이며, 끝에 붙은 문장 부호·닫는 괄호는 글자로 돌린다.
 * 판정에 실패한 후보(예: 계정 정보가 든 주소)는 글자로 둔다. AI 설명 초안·제목에는 쓰지 않는다(OQ-U4-NFR-3).
 */
export function splitGithubLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index;
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    if (url.length === 0 || !isGithubSourceUrl(url)) continue;
    if (start > cursor) segments.push({ kind: "text", text: text.slice(cursor, start) });
    segments.push({ kind: "link", url });
    cursor = start + url.length;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}
