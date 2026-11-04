import type { NextConfig } from "next";

/**
 * 응답에 붙이는 보안 헤더(#217). 값은 `next dev`·`next build`를 시작할 때 정해진다(NEXT_PUBLIC_ 값과 같다).
 * 경로를 정리하는 자동 이동(308: 끝 슬래시, 중복 슬래시·역슬래시)에는 Next가 헤더 설정을 적용하지 않아 빠진다.
 * 이 응답은 이동할 주소만 담고 화면을 그리지 않는다.
 * - 스크립트는 인라인을 허용한다('unsafe-inline'). Next가 페이지에 인라인 스크립트를 넣는데, 요청마다 일회용 값(nonce)을
 *   주려면 모든 페이지를 요청 때마다 새로 그려야 해서다. 화면 출력은 React 텍스트로만 그려 스크립트 삽입을 막는다
 *   (docs/CatchU_security_checks.md 「화면 출력」).
 * - connect-src에 API 기준 주소의 출처를 더한다. web과 api의 출처가 달라서다. 주소가 없거나 http(s)가 아니면
 *   API 호출 함수도 요청하지 않으므로 더하지 않는다(src/lib/api-client.ts). IPv6 주소(`[::1]` 등)는 CSP 출처 문법에
 *   적을 수 없어 쓸 수 없으므로, 형식과 관계없이 `next dev`·`next build`에서 오류로 멈춘다(요청이 조용히 막히지 않게).
 *   `next start`는 빌드 때 정해진 헤더를 쓰므로 API 주소를 바꾸려면 다시 빌드한다.
 * - 'unsafe-eval'은 `next dev`(development)에서만 더한다(React 개발용 오류 표시). HSTS는 development·test가 아닐 때(배포용 빌드) 붙인다.
 * - 외부 스크립트·이미지·글꼴·연결을 새로 쓰면 해당 항목에 출처를 더한다.
 */
export function securityHeaders(env: NodeJS.ProcessEnv): { key: string; value: string }[] {
  const isDev = env.NODE_ENV === "development";
  const apiOrigin = readHttpOrigin(env.NEXT_PUBLIC_API_BASE_URL);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // 공유 링크 주소(/s/<토큰>)가 다른 사이트로 넘어가지 않게 다른 출처에는 출처만 보낸다.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
  // `next build`는 NODE_ENV가 비어 있을 때만 production으로 채우므로, 값이 없거나 다른 값이어도 운영과 같이 붙인다(docs/CatchU_security_checks.md 「설정·개발용 기능」).
  // TLS는 앞단에서 끝나지만 브라우저는 앞단이 https로 전달한 응답의 값을 따른다. 5분으로 시작해 도메인·인증서가 정해지면 늘리고, 하위 도메인·preload는 넣지 않는다(#217).
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") headers.push({ key: "Strict-Transport-Security", value: "max-age=300" });
  return headers;
}

function readHttpOrigin(value: string | undefined): string | null {
  if (typeof value !== "string" || !URL.canParse(value.trim())) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname.startsWith("[")) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL에는 IPv6 주소를 쓸 수 없습니다. CSP 허용 목록에 적을 수 없으므로 127.0.0.1이나 localhost로 적으세요.");
  }
  return url.origin;
}

const nextConfig: NextConfig = {
  // next dev가 web/에 AGENTS.md·CLAUDE.md를 만들어 AI 규칙에 끼어들지 않게 한다. 판본 문서 안내는 README 「작업 규칙」.
  agentRules: false,
  // 응답에서 X-Powered-By: Next.js를 뺀다(#217).
  poweredByHeader: false,
  // Google·GitHub 콜백 주소에는 일회용 code·state가 실리므로 next dev 요청 로그에서 뺀다(#287). 다른 경로는 그대로 찍는다.
  // Next는 찍을 주소(경로+query)에 패턴을 그대로 대조한다. 개발 서버에서만 쓰며 next start·운영 이미지에는 영향이 없다.
  logging: { incomingRequests: { ignore: [/^\/(?:google|github)\/callback(?:\?|$)/] } },
  // 운영 이미지(web/Dockerfile)만 .next/standalone의 server.js로 실행한다(#275). 이미지 빌드가 CATCHU_STANDALONE_BUILD=1을 줄 때만
  // standalone으로 만든다. 켜 두면 `npm run start`(next start)가 지원하지 않는 구성이라는 경고를 내므로 개발·CI 빌드는 그대로 둔다.
  ...(process.env.CATCHU_STANDALONE_BUILD === "1" ? { output: "standalone" as const } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env) }];
  },
};

export default nextConfig;
