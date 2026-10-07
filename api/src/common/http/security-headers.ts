import { INestApplication } from '@nestjs/common';

/**
 * 모든 응답에 붙이는 보안 헤더(#217). api는 JSON만 내보내므로 브라우저가 응답으로 아무것도 불러오지 않고,
 * 다른 사이트가 응답을 페이지 안에 끼워 넣지 못하며, 응답 형식을 짐작하지 않고, 주소 정보를 보내지 않게 한다.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * `NODE_ENV`가 development·test가 아니면(값이 없거나 다른 값 포함) 붙인다. 판정할 수 없으면 운영과 같이 다루는 팀 기준이다
 * (docs/CatchU_security_checks.md 「설정·개발용 기능」). TLS는 앞단에서 끝나지만 브라우저는 앞단이 https로 전달한 응답의 값을 따른다.
 * 기간은 5분으로 시작해 도메인·인증서가 정해지면 늘리고, 도메인이 정해지지 않아 하위 도메인 포함(includeSubDomains)·preload는 넣지 않는다(#217).
 */
export const HSTS_HEADER_VALUE = 'max-age=300';

type HeaderResponse = { setHeader(name: string, value: string): void };

/**
 * app.init() 전, CORS보다 먼저 부른다. 라우터·본문 해석·CORS 사전 요청보다 앞에서 헤더를 붙여야
 * /v1 기능 경로뿐 아니라 /health, CORS 사전 요청, Nest 밖에서 끝나는 오류 응답에도 같은 헤더가 남는다.
 */
export function applySecurityHeaders(app: INestApplication, nodeEnv: string | undefined): void {
  const server: { disable(setting: string): void } = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  const isDevelopmentOrTest = nodeEnv === 'development' || nodeEnv === 'test';
  const headers: Record<string, string> = isDevelopmentOrTest
    ? { ...SECURITY_HEADERS }
    : { ...SECURITY_HEADERS, 'Strict-Transport-Security': HSTS_HEADER_VALUE };
  app.use((_request: unknown, response: HeaderResponse, next: () => void) => {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    next();
  });
}
