import { HttpException } from '@nestjs/common';
import { DEFAULT_ERROR_MESSAGES, ERROR_STATUS, ErrorCode } from './error-codes';

/** 발행 거부에서 막힌 자료 한 줄(발행 프리셋 계약 P-2 blockedSources). 같은 자료가 두 프리셋에 있으면 프리셋마다 한 줄이다. */
export interface BlockedSource {
  presetId: string;
  kind: 'CATCH' | 'TEXT_MATERIAL' | 'PDF_MATERIAL';
  sourceId: string;
}

/**
 * 명세 common.yaml Error.details 가 허용하는 두 키와, 발행 거부(400 extractionIncomplete, 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED·
 * CATCH_PRIVATE)가 막힌 자료를 알리는 `blockedSources`(발행 프리셋 계약 P-2, 기능 설계 BR3.5)만 둔다. `blockedSources`는 프리셋 ID와
 * 자료 종류·ID만 담고 이름·내용을 담지 않는다(NFR4.2). 12월 U4의 `catchIds`는 이것으로 바뀌어 없어졌다(P-2 승인 검토 R-03).
 */
export interface ErrorDetails {
  violations?: { field: string; reason: string }[];
  existingRequestId?: string;
  blockedSources?: BlockedSource[];
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
