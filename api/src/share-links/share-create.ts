export interface ShareCreateInput {
  title: string;
  password?: string;
}

export interface ShareCreateViolation {
  field: 'body' | 'title' | 'password';
  reason: string;
}

export type ShareCreateValidation =
  | { valid: true; value: ShareCreateInput }
  | { valid: false; violations: ShareCreateViolation[] };

// HTTP 오류 매핑은 #88의 공통 경계에서 수행한다. 입력값은 오류에 포함하지 않는다.
export function validateShareCreate(body: unknown): ShareCreateValidation {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, violations: [{ field: 'body', reason: '객체가 필요합니다.' }] };
  }

  const input = body as Record<string, unknown>;
  const violations: ShareCreateViolation[] = [];
  if (Object.keys(input).some((key) => key !== 'title' && key !== 'password')) {
    violations.push({ field: 'body', reason: '허용되지 않은 필드가 있습니다.' });
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length === 0) {
    violations.push({ field: 'title', reason: '공백이 아닌 제목을 입력해 주세요.' });
  }
  const hasPassword = Object.hasOwn(input, 'password');
  if (hasPassword && (typeof input.password !== 'string' || input.password.length === 0)) {
    violations.push({ field: 'password', reason: '비밀번호를 지정하면 비어 있지 않은 문자열이어야 합니다.' });
  }
  if (violations.length > 0) {
    return { valid: false, violations };
  }

  // 계약은 제목만 trim한다. 비밀번호의 공백·대소문자는 그대로 보존한다.
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
