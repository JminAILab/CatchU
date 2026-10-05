import { accessTokenStore } from "./access-token";
import { createApiClient } from "./api-client";

/**
 * 화면에서 쓰는 API 호출 함수. 주소는 NEXT_PUBLIC_API_BASE_URL(예: http://127.0.0.1:3001, `/v1` 제외)이다.
 * NEXT_PUBLIC_ 값은 개발 서버를 켤 때·빌드할 때 읽히므로 바꾸면 다시 켠다.
 * NODE_ENV는 Next가 정한다(`npm run dev`는 development, `npm run build`는 production).
 * 회원 자료는 메모리 토큰을 쓰므로 브라우저에서 호출한다.
 */
export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
  tokens: accessTokenStore,
});

/** 개발용 로그인 진입 표시. 정확히 "true"일 때만 보인다. 서버가 막으면 403이다(#87). */
export const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
