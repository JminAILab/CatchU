// 시험 출력에 토큰·승인 주소·state·받은 링크 주소가 나오지 않게 글을 고친다(#594 「지킬 것」, U6 NFR6.5).
// Playwright 오류 글은 이동한 주소와 찾은 요소의 HTML을 싣는다. 그래서 시험 단계의 오류와 서버 출력은 이 함수를 거쳐서만 내보낸다.

const RULES = [
  // 주소의 쿼리(승인 시작·승인 화면·돌아갈 주소의 client_id·state·code·code_challenge, 로그인 화면의 next 등)
  [/(https?:\/\/[^\s"'`<>]*?)\?[^\s"'`<>)]*/g, '$1?…'],
  [/([?&](?:code|state|next|client_id|code_challenge|redirect_uri|resource|error)=)[^&\s"'`<>)]*/g, '$1…'],
  // 받은 링크 주소의 토큰(/s/<토큰>)
  [/\/s\/[^\s"'`<>/?#)]+/g, '/s/…'],
  // Authorization 머리글과 회원 JWT
  [/(Bearer\s+)[^\s"'`<>]+/gi, '$1…'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '…'],
  // 길게 이어진 무작위 값(MCP 토큰·승인 코드·state·PKCE 값). 주소 밖에서 비교 오류 글에 실릴 때를 막는다.
  [/[A-Za-z0-9_-]{32,}/g, '…'],
];

/** 글에서 비밀이 될 수 있는 값을 지운다. */
export function redact(text) {
  let result = String(text);
  for (const [pattern, replacement] of RULES) result = result.replace(pattern, replacement);
  return result;
}

/** 오류의 글과 호출 기록을 고쳐 같은 오류를 돌려준다(시험 위치는 그대로 남는다). */
export function redactError(error) {
  if (error instanceof Error) {
    error.message = redact(error.message);
    if (typeof error.stack === 'string') error.stack = redact(error.stack);
    return error;
  }
  return new Error(redact(error));
}

/** fn을 실행하고, 실패하면 고친 오류로 다시 던진다. 시험 단계와 준비 단계를 모두 이것으로 감싼다. */
export async function redacting(fn) {
  try {
    return await fn();
  } catch (error) {
    throw redactError(error);
  }
}
