/**
 * API 명세 v1 「공통 오류·요청 안전성」의 오류 코드와 HTTP 상태.
 * 정본은 aidlc/.../contract-design/contract-summary.md 와 common.yaml 이다.
 * 코드를 추가·변경하는 것은 계약 수정이므로, 명세를 먼저 고친 뒤 이 표와 api README 표를 함께 맞춘다.
 */
export const ERROR_STATUS = {
  INVALID_REQUEST: 400,
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  // #250 팀장 결정에 따라 담당자가 선정한 전용 Origin 거부 코드. 공식 명세 반영은 별도다.
  AUTH_ORIGIN_FORBIDDEN: 403,
  LINK_PASSWORD_REQUIRED: 401,
  LINK_PASSWORD_INVALID: 401,
  GITHUB_CONNECTION_REQUIRED: 403,
  REPOSITORY_NOT_ALLOWED: 403,
  REPOSITORY_URL_INVALID: 400,
  REPOSITORY_PRIVATE: 403,
  REPOSITORY_UNSUPPORTED: 403,
  REPOSITORY_UNVERIFIED: 422,
  CONSENT_REQUIRED: 403,
  RESOURCE_UNAVAILABLE: 404,
  LINK_UNAVAILABLE: 404,
  ANALYSIS_IN_PROGRESS: 409,
  RETRY_NOT_ALLOWED: 409,
  REANALYSIS_DEFERRED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CONFIRMATION_REQUIRED: 409,
  SOURCE_RESTRICTED: 409,
  LINK_TITLE_CONFLICT: 409,
  LINK_LIMIT_REACHED: 409,
  LINK_UNLOCK_LIMITED: 429,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  // 12월 intent U2(계약 C-03·C-04, U2 기능 설계 BR1.4·BR2.2·BR7.4).
  AI_CONSENT_REQUIRED: 403,
  DAILY_LIMIT_REACHED: 429,
  WITHDRAWAL_FAILED: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * 코드별 기본 안내 문구. 내부 정보(경로·입력값·원인)를 담지 않는다.
 * 명세가 문구를 정한 코드(RESOURCE_UNAVAILABLE·LINK_UNAVAILABLE·INTERNAL_ERROR)는 명세 문구를 쓴다.
 * 나머지는 기본값이며, 기능 담당이 ApiError의 message로 바꿀 수 있다. web은 문구가 아닌 code로 분기한다.
 */
export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: '요청 형식이 올바르지 않습니다.',
  VALIDATION_FAILED: '입력값을 확인해 주세요.',
  AUTH_REQUIRED: '로그인이 필요합니다.',
  AUTH_INVALID: '로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.',
  AUTH_ORIGIN_FORBIDDEN: '허용된 화면에서 다시 요청해 주세요.',
  LINK_PASSWORD_REQUIRED: '비밀번호를 입력해 주세요.',
  LINK_PASSWORD_INVALID: '비밀번호가 올바르지 않습니다.',
  GITHUB_CONNECTION_REQUIRED: 'GitHub 연결이 필요합니다.',
  REPOSITORY_NOT_ALLOWED: '분석할 수 없는 저장소입니다.',
  REPOSITORY_URL_INVALID: 'https://github.com/소유자/저장소 형태의 주소를 입력해 주세요.',
  REPOSITORY_PRIVATE: '비공개이거나 없는 저장소라 확인할 수 없습니다. 공개 저장소 주소인지 확인해 주세요.',
  REPOSITORY_UNSUPPORTED: '현재 지원하지 않는 저장소입니다.',
  REPOSITORY_UNVERIFIED: 'GitHub에서 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  CONSENT_REQUIRED: '분석 동의가 필요합니다.',
  RESOURCE_UNAVAILABLE: '현재 열람할 수 없는 자료입니다.',
  LINK_UNAVAILABLE: '이 링크는 열람할 수 없습니다.',
  ANALYSIS_IN_PROGRESS: '이미 진행 중인 분석이 있습니다.',
  RETRY_NOT_ALLOWED: '지금은 다시 요청할 수 없습니다.',
  REANALYSIS_DEFERRED: '재분석은 아직 제공하지 않습니다.',
  IDEMPOTENCY_CONFLICT: '같은 요청 키로 다른 내용이 전송되었습니다.',
  CONFIRMATION_REQUIRED: '확인을 마친 뒤 공개할 수 있습니다.',
  SOURCE_RESTRICTED: '원본 접근이 제한되어 공개할 수 없습니다.',
  LINK_TITLE_CONFLICT: '같은 제목의 유효한 링크가 있습니다.',
  LINK_LIMIT_REACHED: '유효한 링크는 최대 5개까지 만들 수 있습니다.',
  LINK_UNLOCK_LIMITED: '비밀번호 시도가 많아 잠시 뒤에 다시 시도할 수 있습니다.',
  RATE_LIMITED: '요청이 많아 잠시 뒤에 다시 시도할 수 있습니다.',
  DAILY_LIMIT_REACHED: '오늘 한도에 도달했습니다',
  INTERNAL_ERROR: '처리 중 오류가 발생했습니다.',
  AI_CONSENT_REQUIRED: '외부 AI 전송에 먼저 동의해 주세요.',
  // 계약 C-03이 문구를 정했다. 남은 횟수·한도 값은 어디에도 넣지 않는다(BR1.4).
  WITHDRAWAL_FAILED: '탈퇴를 끝내지 못했습니다. 팀에 알려 주세요',
};
