import {
  ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  GatewayTimeoutException,
  GoneException,
  HttpException,
  InternalServerErrorException,
  Logger,
  MethodNotAllowedException,
  NotAcceptableException,
  NotFoundException,
  NotImplementedException,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import { requestIdOf } from '../http/request-id';
import { ApiError, ErrorBody, ErrorDetails } from './api-error';
import { DEFAULT_ERROR_MESSAGES, ErrorCode } from './error-codes';
import { collectedFrames } from './stack-frames';

interface Resolved {
  status: number;
  body: ErrorBody;
  /** error: 서버 결함(스택 기록) / warn: 코드 없는 예외·요청 거부(한 줄) / none: 정상적인 업무 거부 */
  log: 'error' | 'warn' | 'none';
}

interface RequestLike {
  method?: string;
  route?: { path?: unknown };
}

/**
 * 모든 예외를 명세의 {code, message, details?} 형식과 Cache-Control: no-store로 응답한다.
 * 로그에는 메서드·등록 경로·예외 분류명과 코드 위치만 남기고, 헤더·본문·쿼리·토큰·오류 메시지는 남기지 않는다.
 * 예외 분류명은 error.name 원문이 아니라 허용 목록의 고정 분류명이다(errorKind, instanceof 기반 분류).
 * 코드 위치는 stack-frames.ts가 스택 문자열과 분리해 수집한 파일·줄·칸이다.
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
 * 업무 거부 중 보안 사건으로 한 줄씩 남기는 코드(#222, [10/4 팀장 결정](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5975854431)).
 * 정상적인 업무 거부는 지금처럼 기록하지 않는다. 토큰 없이 온 요청(AUTH_REQUIRED)과 비밀번호를 아직 넣지 않은
 * 요청(LINK_PASSWORD_REQUIRED)은 로그인 전 접속·링크 첫 열람에서도 생기므로 넣지 않는다.
 * 링크 비밀번호 틀림·시도 제한도 같은 기록 형식을 사용한다.
 */
export const SECURITY_EVENT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['AUTH_INVALID', 'LINK_PASSWORD_INVALID', 'LINK_UNLOCK_LIMITED']);

const securityLogger = new Logger('SecurityEvent');

/**
 * 예외 하나를 명세 형식으로 응답하고 로그를 남긴다.
 * Nest 필터와, Nest 밖에서 끝나는 요청(전역 접두사 밖의 없는 경로 등)의 대비 처리가 함께 쓴다.
 */
export function writeErrorResponse(adapter: AbstractHttpAdapter, request: RequestLike, response: unknown, exception: unknown): void {
  const { status, body, log } = resolve(exception);
  const name = errorKind(exception);
  const where = `${request.method ?? '?'} ${safePath(request)}`;

  if (SECURITY_EVENT_CODES.has(body.code)) {
    // 분류 코드·등록된 경로 틀(메서드 포함)·시각·요청 식별자만 남긴다. 토큰·비밀번호·요청 원문·실제 URL은 넣지 않는다.
    securityLogger.warn(`${body.code} ${where} requestId=${requestIdOf(request)} at=${new Date().toISOString()}`);
  }

  if (log === 'error') {
    const frames = exception instanceof Error ? collectedFrames(exception) : undefined;
    logger.error(`${where} → ${status} ${body.code} (${name})`, frames);
  } else if (log === 'warn') {
    logger.warn(`${where} → ${status} ${body.code} (${name})`);
  }

  adapter.setHeader(response, 'Cache-Control', 'no-store');
  if (exception instanceof ApiError && exception.retryAfterSeconds !== undefined) {
    adapter.setHeader(response, 'Retry-After', String(exception.retryAfterSeconds));
  }
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

  // 명세 밖 예외는 #88의 2026-09-28 팀장 결정을 따른다.

  // 요청 본문 해석 단계(body-parser)의 오류: 잘못된 JSON·본문 크기 초과 등
  const parser = bodyParserStatus(exception);
  if (parser !== undefined) {
    if (parser === 413) return reject(400, 'INVALID_REQUEST', '요청 본문이 너무 큽니다.');
    return reject(400, 'INVALID_REQUEST');
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 400) return reject(400, 'INVALID_REQUEST');
    if (status === 401) return reject(401, 'AUTH_REQUIRED');
    if (status === 404) return reject(404, 'RESOURCE_UNAVAILABLE');
    if (status === 413) return reject(400, 'INVALID_REQUEST', '요청 본문이 너무 큽니다.');
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** details 는 명세의 두 키와 U4 발행 거부의 `catchIds`(UUID만)를 복사한다. 다른 키·항목의 추가 속성은 버린다. */
function withDetails(body: ErrorBody, details: ErrorDetails | undefined): ErrorBody {
  if (!details) return body;
  const safe: ErrorDetails = {};
  if (Array.isArray(details.violations)) {
    safe.violations = details.violations.map((v) => ({ field: String(v.field), reason: String(v.reason) }));
  }
  if (typeof details.existingRequestId === 'string' && details.existingRequestId.length > 0) {
    safe.existingRequestId = details.existingRequestId;
  }
  if (Array.isArray(details.catchIds)) {
    const catchIds = details.catchIds.filter((id): id is string => typeof id === 'string' && UUID.test(id));
    if (catchIds.length > 0) safe.catchIds = catchIds;
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

/**
 * 로그에 남길 예외 분류명. `error.name`과 `constructor.name`은 실행 중에 바꾸거나 계산된 이름으로 만들 수 있어
 * 원문을 쓰지 않는다. instanceof로 아래 허용 목록을 앞에서부터 확인해 처음 맞는 고정 분류명을 쓴다.
 * instanceof는 상속도 포함하므로 목록 밖의 하위 클래스는 가장 가까운 상위 분류(HttpException·Error 등)로 기록된다.
 * 판별 중 예외가 나도 응답은 계속한다.
 */
const ERROR_KINDS: readonly (readonly [abstract new (...args: never[]) => object, string])[] = [
  [ApiError, 'ApiError'],
  [BadRequestException, 'BadRequestException'],
  [UnauthorizedException, 'UnauthorizedException'],
  [ForbiddenException, 'ForbiddenException'],
  [NotFoundException, 'NotFoundException'],
  [MethodNotAllowedException, 'MethodNotAllowedException'],
  [NotAcceptableException, 'NotAcceptableException'],
  [RequestTimeoutException, 'RequestTimeoutException'],
  [ConflictException, 'ConflictException'],
  [GoneException, 'GoneException'],
  [PayloadTooLargeException, 'PayloadTooLargeException'],
  [UnsupportedMediaTypeException, 'UnsupportedMediaTypeException'],
  [UnprocessableEntityException, 'UnprocessableEntityException'],
  [InternalServerErrorException, 'InternalServerErrorException'],
  [NotImplementedException, 'NotImplementedException'],
  [BadGatewayException, 'BadGatewayException'],
  [ServiceUnavailableException, 'ServiceUnavailableException'],
  [GatewayTimeoutException, 'GatewayTimeoutException'],
  [HttpException, 'HttpException'],
  [TypeError, 'TypeError'],
  [RangeError, 'RangeError'],
  [SyntaxError, 'SyntaxError'],
  [ReferenceError, 'ReferenceError'],
  [EvalError, 'EvalError'],
  [URIError, 'URIError'],
  [Error, 'Error'],
];

function errorKind(exception: unknown): string {
  try {
    if (bodyParserStatus(exception) !== undefined) return 'BodyParserError';
    for (const [type, kind] of ERROR_KINDS) {
      if (exception instanceof type) return kind;
    }
    return exception === null ? 'null' : typeof exception;
  } catch {
    return 'unknown';
  }
}

function safePath(request: RequestLike): string {
  // 실제 URL에는 수신자 링크 token이 들어갈 수 있으므로 등록된 경로 틀만 남긴다.
  return typeof request.route?.path === 'string' ? request.route.path : '[unmatched]';
}
