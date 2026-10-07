import { ApiError } from '../common/errors';

/** #135에서 2026-10-06 확인한 서비스 입력 제한. 길이는 유니코드 코드 포인트 기준이다. */
export const PROFILE_LIMITS = Object.freeze({ displayName: 50, introduction: 200, desiredRole: 100, skills: 20, skill: 50 });

export interface ProfileInput {
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
}

/** 전체 저장 입력만 검사한다. 선택 항목은 보정하지 않으며 값을 오류 응답에 담지 않는다. */
export function validateProfileInput(body: unknown): ProfileInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'body', reason: 'isObject' }] } });
  }
  const input = body as Record<string, unknown>;
  const violations: { field: string; reason: string }[] = [];
  const allowed = ['displayName', 'introduction', 'desiredRole', 'skills'];
  if (Object.keys(input).some(key => !allowed.includes(key))) {
    violations.push({ field: 'body', reason: 'whitelistValidation' });
  }
  for (const field of ['displayName', 'introduction', 'desiredRole'] as const) {
    const value = input[field];
    if (!Object.hasOwn(input, field) || typeof value !== 'string') {
      violations.push({ field, reason: 'isString' });
      continue;
    }
    if (value.includes('\u0000')) violations.push({ field, reason: 'noNul' });
    const checked = field === 'displayName' ? value.trim() : value;
    if (field === 'displayName' && checked.length === 0) violations.push({ field, reason: 'isNotEmpty' });
    if (Array.from(checked).length > PROFILE_LIMITS[field]) violations.push({ field, reason: 'maxLength' });
  }
  if (!Object.hasOwn(input, 'skills') || !Array.isArray(input.skills)) {
    violations.push({ field: 'skills', reason: 'isArray' });
  } else {
    if (input.skills.length > PROFILE_LIMITS.skills) violations.push({ field: 'skills', reason: 'arrayMaxSize' });
    for (const [index, skill] of input.skills.entries()) {
      if (typeof skill !== 'string') violations.push({ field: `skills.${index}`, reason: 'isString' });
      else {
        if (skill.includes('\u0000')) violations.push({ field: `skills.${index}`, reason: 'noNul' });
        if (Array.from(skill).length > PROFILE_LIMITS.skill) violations.push({ field: `skills.${index}`, reason: 'maxLength' });
      }
    }
  }
  if (violations.length > 0) throw new ApiError('VALIDATION_FAILED', { details: { violations } });
  return {
    displayName: (input.displayName as string).trim(),
    introduction: input.introduction as string,
    desiredRole: input.desiredRole as string,
    skills: [...input.skills as string[]],
  };
}
