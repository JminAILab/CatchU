import type { ApiClient } from '../../lib/api-client.ts';
import { memberAuthRejected, memberMutationOutcome } from '../../lib/auth-api.ts';

export type Profile = { displayName: string; introduction: string; desiredRole: string; skills: string[] };
export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.displayName === 'string' && typeof p.introduction === 'string'
    && typeof p.desiredRole === 'string' && Array.isArray(p.skills) && p.skills.every(s => typeof s === 'string');
}
/** 기술 입력 제한(#135, api `PROFILE_LIMITS`의 skills·skill). 저장 전 검사와 기술 칩 입력(#469)이 함께 쓴다. 길이는 유니코드 코드 포인트 기준이다. */
export const PROFILE_SKILL_LIMITS = Object.freeze({ count: 20, length: 50 });
export const SKILL_COUNT_MESSAGE = `기술은 최대 ${PROFILE_SKILL_LIMITS.count}개까지 입력할 수 있습니다.`;
export function overLength(value: string, max: number): boolean {
  return Array.from(value).length > max;
}
/** NUL·고립 서로게이트. 서버가 거부하는 문자다. */
export function hasUnsavableChars(value: string): boolean {
  return value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value);
}
export function profileErrors(profile: Profile): string[] {
  const errors: string[] = [];
  const fields: [string, string, number][] = [
    ['표시 이름', profile.displayName.trim(), 50], ['한 줄 소개', profile.introduction, 200],
    ['희망 직무', profile.desiredRole, 100],
    ...profile.skills.map((s, i): [string, string, number] => [`기술 ${i + 1}`, s, PROFILE_SKILL_LIMITS.length]),
  ];
  if (!profile.displayName.trim()) errors.push('표시 이름을 입력해 주세요.');
  if (profile.skills.length > PROFILE_SKILL_LIMITS.count) errors.push(SKILL_COUNT_MESSAGE);
  for (const [label, value, max] of fields) {
    if (overLength(value, max)) errors.push(`${label}은 최대 ${max}자까지 입력할 수 있습니다.`);
    if (hasUnsavableChars(value)) errors.push(`${label}에 저장할 수 없는 문자가 있습니다.`);
  }
  return errors;
}
export async function readProfile(api: Pick<ApiClient, 'member'>, signal?: AbortSignal): Promise<Profile | null> {
  const result = await api.member('/me', { signal });
  if (result.kind !== 'success' || !result.data || typeof result.data !== 'object' || !('profile' in result.data)) return null;
  return isProfile(result.data.profile) ? result.data.profile : null;
}
/**
 * 프로필 저장 결과를 자세히 돌려준다(#286 후속, 담당 합의). 자동으로 다시 보내지 않는다.
 * - `saved`: 저장 성공(기존 `saveProfile`의 true와 같은 기준).
 * - `renewed-rejected`: 로그인 연장 뒤 이 저장은 거부됐다(처리되지 않음). 입력을 두고 다시 누르게 한다.
 * - `reauth-rejected`: 이 저장이 회원 인증 단계에서 거부됐고 갱신하지 못했다(재인증 필요 등). 처리되지 않았다(#286 10/29 검증 확인 필요 1).
 * - `not-sent`: 저장 요청을 보내지 않았다. 결과 불명이 아니다.
 * - `discarded`: 보낸 뒤 로그인이 바뀌어 응답을 반영하지 않았다. 반영됐을 수 있어 성공·실패로 확정하지 않는다.
 * - `save-failed`: 그 밖(업무 거부·응답 유실·5xx·성공 형식 오류). 기존 처리와 같다.
 */
export type ProfileSaveOutcome = 'saved' | UnprocessedSaveOutcome | 'discarded' | 'save-failed';
/** 서버가 처리하지 않은 것이 확실한 저장. 입력을 두고 자동으로 다시 보내지 않는다. */
export type UnprocessedSaveOutcome = 'renewed-rejected' | 'reauth-rejected' | 'not-sent';
export function isUnprocessedSave(outcome: string): outcome is UnprocessedSaveOutcome {
  return outcome === 'renewed-rejected' || outcome === 'reauth-rejected' || outcome === 'not-sent';
}
/**
 * 처리되지 않은 저장의 안내(최초 입력·프로필 수정 공통). 문구는 제안이며 화면 담당이 바꿀 수 있다.
 * 이번 저장은 처리되지 않았지만 앞선 저장의 결과를 모르면(`uncertain`) 그 안내를 지우지 않는다. 이번 401·미전송으로 앞선 결과를 확정하지 않는다.
 */
export function unprocessedSaveMessages(outcome: UnprocessedSaveOutcome, uncertain: boolean): string[] {
  const text = outcome === 'renewed-rejected' ? '로그인이 연장되었습니다. 다시 눌러 주세요.'
    : outcome === 'reauth-rejected' ? '로그인이 필요해 저장하지 않았습니다. 입력은 그대로 두었습니다.'
      : '지금은 요청을 보내지 않았습니다. 입력은 그대로 두었습니다.';
  return uncertain ? [text, '앞선 저장 요청의 결과는 아직 확인하지 못했습니다.'] : [text];
}
export async function saveProfileDetailed(api: Pick<ApiClient, 'member'>, profile: Profile, signal?: AbortSignal): Promise<ProfileSaveOutcome> {
  const body = { displayName: profile.displayName.trim(), introduction: profile.introduction,
    desiredRole: profile.desiredRole, skills: [...profile.skills] };
  const result = await api.member('/me/profile', { method: 'PUT', body, signal });
  if (result.kind === 'success' && isProfile(result.data) && result.data.displayName !== '') return 'saved';
  if (memberAuthRejected(result)) return 'reauth-rejected';
  const outcome = memberMutationOutcome(result);
  return outcome === 'other' ? 'save-failed' : outcome;
}
/** 기존 호출 계약(성공 여부만). 자세한 결과가 필요하면 `saveProfileDetailed`를 쓴다. */
export async function saveProfile(api: Pick<ApiClient, 'member'>, profile: Profile, signal?: AbortSignal): Promise<boolean> {
  return (await saveProfileDetailed(api, profile, signal)) === 'saved';
}

/**
 * PUT 성공 뒤에는 GET만 재시도한다. 세션이 바뀌면 후속 요청·이동을 중단한다.
 * 로그인 연장 뒤 거부(`renewed-rejected`)·재인증 거부(`reauth-rejected`)·보내지 않음(`not-sent`)은 저장되지 않은 것이라 그대로 돌려준다(자동 재전송 없음).
 * 반영하지 않은 응답(`discarded`)은 세션이 바뀐 것이라 보통 `cancelled`이며, 아니면 결과 불명인 `save-failed`로 본다.
 */
export async function completeProfileSetup(
  api: Pick<ApiClient, 'member'>, profile: Profile,
  options: { alreadySaved: boolean; onSaved: () => void; isCurrent: () => boolean; signal?: AbortSignal },
): Promise<'ready' | 'save-failed' | UnprocessedSaveOutcome | 'refresh-failed' | 'cancelled'> {
  let saved = options.alreadySaved;
  const current = () => !options.signal?.aborted && options.isCurrent();
  if (!current()) return 'cancelled';
  try {
    if (!saved) {
      const outcome = await saveProfileDetailed(api, profile, options.signal);
      if (!current()) return 'cancelled';
      if (isUnprocessedSave(outcome)) return outcome;
      if (outcome !== 'saved') return 'save-failed';
      saved = true;
      options.onSaved();
    }
    const refreshed = await readProfile(api, options.signal);
    if (!current()) return 'cancelled';
    return refreshed && refreshed.displayName !== '' ? 'ready' : 'refresh-failed';
  } catch {
    if (!current()) return 'cancelled';
    return saved ? 'refresh-failed' : 'save-failed';
  }
}

export function sameProfile(a: Profile, b: Profile): boolean {
  return a.displayName === b.displayName && a.introduction === b.introduction && a.desiredRole === b.desiredRole
    && a.skills.length === b.skills.length && a.skills.every((skill, index) => skill === b.skills[index]);
}

/**
 * 기존 프로필 수정 저장. PUT 성공만 'saved'다. 실패·응답 유실·성공 형식 오류는 입력을 유지하는 'save-failed'이며,
 * 세션이 바뀌었거나 취소됐으면 'cancelled'라서 화면은 이동·안내를 하지 않는다. 자동 재전송은 하지 않는다.
 * 로그인 연장 뒤 거부(`renewed-rejected`)·재인증 거부(`reauth-rejected`)·보내지 않음(`not-sent`)은 저장되지 않은 것이라 그대로 돌려준다(#286 후속, 담당 합의).
 * 반영하지 않은 응답(`discarded`)은 세션이 바뀐 것이라 보통 'cancelled'이며, 아니면 결과 불명인 'save-failed'로 본다.
 */
export async function updateProfile(
  api: Pick<ApiClient, 'member'>, profile: Profile,
  options: { isCurrent: () => boolean; signal?: AbortSignal },
): Promise<'saved' | 'save-failed' | UnprocessedSaveOutcome | 'cancelled'> {
  const current = () => !options.signal?.aborted && options.isCurrent();
  if (!current()) return 'cancelled';
  try {
    const outcome = await saveProfileDetailed(api, profile, options.signal);
    if (!current()) return 'cancelled';
    if (outcome === 'saved' || isUnprocessedSave(outcome)) return outcome;
    return 'save-failed';
  } catch {
    return current() ? 'save-failed' : 'cancelled';
  }
}
