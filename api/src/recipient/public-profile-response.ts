import { OwnerPublicProfile } from '../member-profile/owner-profile-reader';

/** common.yaml PublicProfile. 자가 입력 네 항목·출처(fieldSource는 네 항목에만 적용)·저장된 GitHub 계정명만 담는다. */
export interface PublicProfileResponse {
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
  fieldSource: 'SELF_REPORTED';
  githubAccountLogin: string | null;
}

/** 공급 값이 계약 모양이 아니면 빈 값·기본값으로 채우지 않고 500으로 보낸다. 입력값은 메시지에 넣지 않는다. */
export class PublicProfileIntegrityError extends Error {
  constructor(readonly reason: string) {
    super(`public profile value is invalid: ${reason}`);
    this.name = 'PublicProfileIntegrityError';
  }
}

/**
 * A 공급 함수(`OwnerProfileReader.readPublicProfile`)의 프로필에서 허용 필드만 골라 응답을 만든다.
 * 다른 필드가 섞여 와도 복사하지 않는다. 문자열이 비어 있는 것은 계약상 정상이다(값이 없는 문자열은 빈 문자열).
 * `githubAccountLogin`의 상태별 값(CONNECTED만 저장값, 나머지 null)은 공급 함수가 정하며 여기서는 모양만 확인한다.
 */
export function toPublicProfile(value: OwnerPublicProfile): PublicProfileResponse {
  const source: unknown = value;
  if (source === null || typeof source !== 'object' || Array.isArray(source)) throw new PublicProfileIntegrityError('object');
  const fields = source as Record<string, unknown>;
  for (const field of ['displayName', 'introduction', 'desiredRole'] as const) {
    if (typeof fields[field] !== 'string') throw new PublicProfileIntegrityError(field);
  }
  const skills = fields.skills;
  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill === 'string')) {
    throw new PublicProfileIntegrityError('skills');
  }
  const login = fields.githubAccountLogin;
  if (login !== null && (typeof login !== 'string' || login === '')) throw new PublicProfileIntegrityError('githubAccountLogin');
  return {
    displayName: fields.displayName as string,
    introduction: fields.introduction as string,
    desiredRole: fields.desiredRole as string,
    skills: [...skills] as string[],
    fieldSource: 'SELF_REPORTED',
    githubAccountLogin: login,
  };
}
