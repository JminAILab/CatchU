import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import { ApiError, ErrorBody, ErrorDetails } from './api-error';
import { DEFAULT_ERROR_MESSAGES, ErrorCode } from './error-codes';

interface Resolved {
  status: number;
  body: ErrorBody;
  /** error: 서버 결함(스택 기록) / warn: 코드 없는 예외·요청 거부(한 줄) / none: 정상적인 업무 거부 */
  log: 'error' | 'warn' | 'none';
}

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
}

/**
 * 모든 예외를 명세의 {code, message, details?} 형식과 Cache-Control: no-store로 응답한다.
 * 로그에는 메서드·경로(쿼리 제외)·예외 이름만 남기고, 헤더·본문·쿼리·토큰은 남기지 않는다.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    writeErrorResponse(this.adapterHost.httpAdapter, http.getRequest<RequestLike>(), http.getResponse<unknown>(), exception);
  }
}

const logger = new Logger('ApiExceptionFilter');

/**
 * 예외 하나를 명세 형식으로 응답하고 로그를 남긴다.
 * Nest 필터와, Nest 밖에서 끝나는 요청(전역 접두사 밖의 없는 경로 등)의 대비 처리가 함께 쓴다.
 */
export function writeErrorResponse(adapter: AbstractHttpAdapter, request: RequestLike, response: unknown, exception: unknown): void {
  const { status, body, log } = resolve(exception);
  const name = exception instanceof Error ? exception.name : typeof exception;
  const where = `${request.method ?? '?'} ${safePath(request)}`;

  if (log === 'error') {
    logger.error(`${where} → ${status} ${body.code} (${name})`, exception instanceof Error ? exception.stack : undefined);
  } else if (log === 'warn') {
    logger.warn(`${where} → ${status} ${body.code} (${name})`);
  }

  adapter.setHeader(response, 'Cache-Control', 'no-store');
  adapter.reply(response, body, status);
}

function resolve(exception: unknown): Resolved {
  if (exception instanceof ApiError) {
    const status = exception.getStatus();
    return {
      status,
      body: withDetails({ code: exception.code, message: exception.message }, exception.details),
      log: status >= 500 ? 'error' : 'none',
    };
  }

  // ── 아래는 명세에 코드가 없는 예외의 잠정 처리다. 확정은 #88에서 결정한다. ──

  // 요청 본문 해석 단계(body-parser)의 오류: 잘못된 JSON·본문 크기 초과 등
  const parser = bodyParserStatus(exception);
  if (parser !== undefined) {
    if (parser === 413) return reject(413, 'INVALID_REQUEST', '요청 본문이 너무 큽니다.');
    return reject(400, 'INVALID_REQUEST');
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 400) return reject(400, 'INVALID_REQUEST');
    if (status === 401) return reject(401, 'AUTH_REQUIRED');
    if (status === 404) return reject(404, 'RESOURCE_UNAVAILABLE');
    if (status === 413) return reject(413, 'INVALID_REQUEST', '요청 본문이 너무 큽니다.');
    if (status >= 400 && status < 500) {
      // 코드 없는 403·409 등: 상태는 보존하되 분기할 코드가 없으므로 일반 실패로 알린다.
      return { status, body: base('INTERNAL_ERROR'), log: 'warn' };
    }
  }

  return { status: 500, body: base('INTERNAL_ERROR'), log: 'error' };
}

function reject(status: number, code: ErrorCode, message?: string): Resolved {
  return { status, body: { code, message: message ?? DEFAULT_ERROR_MESSAGES[code] }, log: 'warn' };
}

function base(code: ErrorCode): ErrorBody {
  return { code, message: DEFAULT_ERROR_MESSAGES[code] };
}

/** details 는 명세의 두 키만 복사한다. 다른 키·항목의 추가 속성은 버린다. */
function withDetails(body: ErrorBody, details: ErrorDetails | undefined): ErrorBody {
  if (!details) return body;
  const safe: ErrorDetails = {};
  if (Array.isArray(details.violations)) {
    safe.violations = details.violations.map((v) => ({ field: String(v.field), reason: String(v.reason) }));
  }
  if (typeof details.existingRequestId === 'string' && details.existingRequestId.length > 0) {
    safe.existingRequestId = details.existingRequestId;
  }
  return Object.keys(safe).length > 0 ? { ...body, details: safe } : body;
}

/** body-parser 오류는 HttpException이 아니며 type·status를 가진다. */
function bodyParserStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || !type.startsWith('entity.') && !type.startsWith('charset.') && !type.startsWith('encoding.')) {
    return undefined;
  }
  return typeof status === 'number' && status >= 400 && status < 500 ? status : 400;
}

function safePath(request: RequestLike): string {
  const raw = request.originalUrl ?? request.url ?? '';
  return raw.split('?')[0] || '/';
}
