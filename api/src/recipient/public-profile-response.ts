/** common.yaml PublicProfile. 자가 입력 네 항목과 출처만 담는다. */
export interface PublicProfileResponse {
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
  fieldSource: 'SELF_REPORTED';
}

/** 공급자 값이 계약 모양이 아니면 빈 값·기본값으로 채우지 않고 500으로 보낸다. 입력값은 메시지에 넣지 않는다. */
export class PublicProfileIntegrityError extends Error {
  constructor(readonly reason: string) {
    super(`public profile source returned an invalid value: ${reason}`);
    this.name = 'PublicProfileIntegrityError';
  }
}

/**
 * 공급자 값에서 허용 필드만 골라 응답을 만든다. 다른 필드(회원 ID·연동 상태 등)가 섞여 와도 복사하지 않는다.
 * 문자열이 비어 있는 것은 계약상 정상이다(값이 없는 문자열은 빈 문자열).
 */
export function toPublicProfile(value: unknown): PublicProfileResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new PublicProfileIntegrityError('object');
  const source = value as Record<string, unknown>;
  for (const field of ['displayName', 'introduction', 'desiredRole'] as const) {
    if (typeof source[field] !== 'string') throw new PublicProfileIntegrityError(field);
  }
  const skills = source.skills;
  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill === 'string')) {
    throw new PublicProfileIntegrityError('skills');
  }
  return {
    displayName: source.displayName as string,
    introduction: source.introduction as string,
    desiredRole: source.desiredRole as string,
    skills: [...skills] as string[],
    fieldSource: 'SELF_REPORTED',
  };
}
