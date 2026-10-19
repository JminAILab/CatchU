"use client";

import { authRuntime } from "@/lib/auth-runtime";
import { lookupMemberWithAuth } from "@/lib/member-lookup";
import { GoogleCallbackScreen } from "./google-callback-screen";

/**
 * 공통 인증판 Google 콜백 화면(#287, 통합 시험 전환이 켜졌을 때만 쓴다). #286의 콜백 해석·완료 함수와 공통 인증판 회원 조회(#261 흐름)를 넘긴다.
 * 세션 복원은 시작하지 않는다(`useEnsureRestored()`를 쓰지 않는다, #251 접점 1). 탭별 인스턴스는 브라우저에서 부를 때 얻는다.
 */
export function SessionGoogleCallback() {
  return (
    <GoogleCallbackScreen
      readGoogleCallback={(query) => authRuntime().google.readGoogleCallback(query)}
      completeGoogleLogin={(input) => authRuntime().google.completeGoogleLogin(input)}
      lookupMember={() => lookupMemberWithAuth(authRuntime().api.member)}
    />
  );
}
