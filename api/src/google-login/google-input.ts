import { ApiError } from '../common/errors';
import { GoogleLoginInput } from './google-login.service';

function violation(field: string, reason: string): never {
  throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });
}

export function assertEmptyInput(body: unknown, query: Record<string, unknown>): void {
  if (Object.keys(query).length) violation('query', 'whitelistValidation');
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    violation('body', 'whitelistValidation');
  }
}

export function parseGoogleLogin(body: unknown, query: Record<string, unknown>): GoogleLoginInput {
  if (Object.keys(query).length) violation('query', 'whitelistValidation');
  if (!body || typeof body !== 'object' || Array.isArray(body)) violation('body', 'isObject');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['state', 'loginAttemptToken', 'code', 'error'].includes(key))) {
    violation('body', 'whitelistValidation');
  }
  for (const field of ['state', 'loginAttemptToken']) {
    if (!Object.hasOwn(input, field) || typeof input[field] !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input[field])) {
      violation(field, 'format');
    }
  }
  if (Object.hasOwn(input, 'error')) {
    if (input.error !== 'access_denied' || Object.hasOwn(input, 'code')) violation('error', 'format');
  } else if (typeof input.code !== 'string' || !input.code || input.code.length > 4096 ||
      Array.from(input.code).some(char => /\s/u.test(char) || char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)) {
    violation('code', 'format');
  }
  return input as unknown as GoogleLoginInput;
}
