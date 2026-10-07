import { INestApplication, NotFoundException, RequestMethod } from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import { writeErrorResponse } from './common/errors/api-exception.filter';
import { installStackFrameCollector } from './common/errors/stack-frames';
import { applySecurityHeaders } from './common/http/security-headers';
import { applyCors } from './cors';
import { applyTrustProxy } from './trust-proxy';

/** 명세 v1의 기본 URI. 기능 컨트롤러는 이 접두사 아래에서 응답한다. */
export const API_PREFIX = 'v1';

type Next = (error?: unknown) => void;

/**
 * 앱 객체에 직접 걸어야 하는 전역 설정을 모은다. main.ts와 테스트가 같은 함수를 부른다.
 * (오류 필터·입력 검증·no-store는 ErrorsModule·AppModule에 등록돼 AppModule만 불러도 적용된다.)
 *
 * - 500 오류 로그의 코드 위치 수집 훅을 설치한다(여러 번 불러도 한 번만 설치).
 * - 모든 응답에 보안 헤더를 붙이고 X-Powered-By를 끈다(security-headers.ts). HSTS는 `NODE_ENV`가 development·test가 아닐 때만.
 * - `CORS_ALLOWED_ORIGINS`가 있으면 개발용 CORS를 켠다(cors.ts). 없으면 교차 출처 요청을 허용하지 않는다.
 * - `TRUST_PROXY_CIDRS`에 적은 프록시만 신뢰해 `request.ip`를 정한다(trust-proxy.ts). 없으면 직접 연결 주소다.
 * - 기능 경로는 /v1 아래. GET /health는 배포 점검용이라 접두사 없이 둔다(#81).
 * - Nest는 전역 접두사를 쓰면 "경로 없음"·요청 해석 오류 처리를 /v1 아래에만 붙인다.
 *   /v1 밖에서 끝나는 요청이 Express 기본 HTML 응답으로 나가지 않도록, 초기화 뒤 맨 끝에 같은 오류 응답을 붙인다.
 */
export async function configureApp(app: INestApplication): Promise<INestApplication> {
  installStackFrameCollector();
  applySecurityHeaders(app, process.env.NODE_ENV);
  applyCors(app, process.env);
  applyTrustProxy(app, process.env.TRUST_PROXY_CIDRS);
  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  await app.init();

  const adapter: AbstractHttpAdapter = app.get(HttpAdapterHost).httpAdapter;
  const server = adapter.getInstance<{ use(...handlers: unknown[]): void }>();
  server.use((request: object, response: unknown) => {
    writeErrorResponse(adapter, request, response, new NotFoundException());
  });
  server.use((error: unknown, request: object, response: unknown, next: Next) => {
    if ((response as { headersSent?: boolean }).headersSent) return next(error);
    writeErrorResponse(adapter, request, response, error);
  });
  return app;
}
