import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { authRuntime } from "@/lib/auth-runtime";
import { createPdfHttp, createPdfMaterialsApi, legacyPdfAuth, sessionPdfAuth } from "./pdf-materials-api.ts";

/**
 * 화면이 쓰는 PDF 호출 객체(U8 계획 10.1~10.3). 렌더마다 새로 만들지 않는다.
 * 기준 주소는 다른 호출과 같은 NEXT_PUBLIC_API_BASE_URL이다. 회원 요청의 토큰은 `api.member`와 같은 쪽을 쓴다:
 * 공통 인증을 켠 빌드(제품 기본)는 공통 인증 상태의 실제 토큰, 끈 빌드는 이 탭의 메모리 토큰이다(`api.ts`와 같은 판정).
 * 자료 화면(원본·업로드)·작성자 발행본 화면(사본)·받은 사람 화면(사본)이 함께 쓴다.
 */
export const pdfHttp = createPdfHttp({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
  auth: authSessionIntegrationEnabled ? sessionPdfAuth(authRuntime) : legacyPdfAuth(accessTokenStore),
});

export const pdfMaterialsApi = createPdfMaterialsApi(api.member, pdfHttp);
