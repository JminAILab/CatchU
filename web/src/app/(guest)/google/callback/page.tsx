import { notFound } from "next/navigation";
import { SessionGoogleCallback } from "@/components/auth/session-google-callback";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";

/**
 * Google 로그인 콜백(`/google/callback`, #287). api `GOOGLE_REDIRECT_URI`와 같은 주소다.
 * 공통 인증(#286) 화면 연결은 통합 시험 전환(`auth-integration.ts`) 아래에만 있으므로, 전환을 끈 빌드에서는 열지 않는다(404).
 */
export default function GoogleCallbackPage() {
  if (!authSessionIntegrationEnabled) notFound();
  return <SessionGoogleCallback />;
}
