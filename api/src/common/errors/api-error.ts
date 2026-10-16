import { HttpException } from '@nestjs/common';
import { DEFAULT_ERROR_MESSAGES, ERROR_STATUS, ErrorCode } from './error-codes';

/** 명세 common.yaml Error.details 가 허용하는 두 키만 둔다. */
export interface ErrorDetails {
  violations?: { field: string; reason: string }[];
  existingRequestId?: string;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

/**
 * 기능 코드가 던지는 공통 예외. HTTP 상태는 code로 정해지며 직접 지정하지 않는다.
 *
 * @example
 * throw new ApiError('AUTH_REQUIRED');
 * throw new ApiError('ANALYSIS_IN_PROGRESS', { details: { existingRequestId } });
 */
export class ApiError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  /** 차단 해제까지 남은 초. 공통 필터가 `Retry-After` 헤더로 보낸다(계약 Error429). 본문에는 넣지 않는다. */
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, options: { message?: string; details?: ErrorDetails; retryAfterSeconds?: number } = {}) {
    const message = options.message ?? DEFAULT_ERROR_MESSAGES[code];
    super({ code, message }, ERROR_STATUS[code]);
    this.code = code;
    this.details = options.details;
    if (options.retryAfterSeconds !== undefined) {
      if (!Number.isSafeInteger(options.retryAfterSeconds) || options.retryAfterSeconds < 1) {
        throw new TypeError('retryAfterSeconds must be a positive integer');
      }
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}
