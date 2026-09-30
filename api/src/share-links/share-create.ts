export interface ShareCreateInput {
  title: string;
  password?: string;
}

export interface ShareCreateViolation {
  field: string;
  /** 위반한 규칙 이름. 공통 ValidationPipe와 같은 방식이며 입력값을 담지 않는다. */
  reason: 'isObject' | 'whitelistValidation' | 'isString' | 'isNotEmpty';
}

export type ShareCreateValidation =
  | { valid: true; value: ShareCreateInput }
  | { valid: false; violations: ShareCreateViolation[] };

// 400 VALIDATION_FAILED의 details.violations로 그대로 쓴다. 입력값은 오류에 포함하지 않는다.
export function validateShareCreate(body: unknown): ShareCreateValidation {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, violations: [{ field: 'body', reason: 'isObject' }] };
  }

  const input = body as Record<string, unknown>;
  const violations: ShareCreateViolation[] = [];
  // 임의 필드 이름은 응답에 반사하지 않고 body 한 건으로 알린다.
  if (Object.keys(input).some((key) => key !== 'title' && key !== 'password')) {
    violations.push({ field: 'body', reason: 'whitelistValidation' });
  }
  if (typeof input.title !== 'string') {
    violations.push({ field: 'title', reason: 'isString' });
  } else if (input.title.trim().length === 0) {
    violations.push({ field: 'title', reason: 'isNotEmpty' });
  }
  const hasPassword = Object.hasOwn(input, 'password');
  if (hasPassword && typeof input.password !== 'string') {
    violations.push({ field: 'password', reason: 'isString' });
  } else if (hasPassword && input.password === '') {
    violations.push({ field: 'password', reason: 'isNotEmpty' });
  }
  if (violations.length > 0) {
    return { valid: false, violations };
  }

  // 계약은 제목만 trim한다. 비밀번호의 공백·대소문자는 그대로 보존한다.
  const title = (input.title as string).trim();
  return {
    valid: true,
    value: hasPassword ? { title, password: input.password as string } : { title },
  };
}

// 달력의 다음 달이 아닌 발급 시각부터 정확히 30×24시간이다.
export function shareLinkExpiresAt(issuedAt: Date): Date {
  const expiresAt = new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new RangeError('유효한 발급 시각이 필요합니다.');
  }
  return expiresAt;
}
