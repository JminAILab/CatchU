import { accessTokenStore } from "./access-token";
import { createApiClient, type ApiClient } from "./api-client";
import { toClientResult } from "./auth-api";
import { authSessionIntegrationEnabled } from "./auth-integration";
import { authRuntime } from "./auth-runtime";

/**
 * 화면에서 쓰는 API 호출 함수. 주소는 NEXT_PUBLIC_API_BASE_URL(예: http://127.0.0.1:3001, `/v1` 제외)이다.
 * NEXT_PUBLIC_ 값은 개발 서버를 켤 때·빌드할 때 읽히므로 바꾸면 다시 켠다.
 * NODE_ENV는 Next가 정한다(`npm run dev`는 development, `npm run build`는 production).
 * 회원 자료는 메모리 토큰을 쓰므로 브라우저에서 호출한다.
 *
 * 공통 인증(#286) 통합 시험 전환(`auth-integration.ts`)이 켜졌을 때만 회원 API·개발 로그인을 공통 인증으로 보낸다.
 * 이때 보내지 않은 요청·이전 세션 응답을 조회 실패로 바꾸는 변환(`toClientResult`)은 각 기능 화면 담당 확인(P2·P5) 전이라 통합 시험에만 쓴다.
 * 변경 요청 결과의 원래 구분은 `memberMutationOutcome()`(auth-api.ts)으로 읽는다. 전환을 끈 기존 호출에서는 언제나 `other`다.
 */
const legacyApi = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
  tokens: accessTokenStore,
});

const sessionApi: ApiClient = {
  member: async (path, request) => toClientResult(await authRuntime().api.member(path, request)),
  recipient: (path, request) => legacyApi.recipient(path, request),
  devLogin: async (memberId, request) => {
    const result = await authRuntime().api.devLogin(memberId, request);
    return result.kind === "discarded" ? { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" } : result;
  },
};

export const api: ApiClient = authSessionIntegrationEnabled ? sessionApi : legacyApi;

/** 개발용 로그인 진입 표시. 정확히 "true"일 때만 보인다. 서버가 막으면 403이다(#87). */
export const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true";
