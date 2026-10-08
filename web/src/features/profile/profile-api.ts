import type { ApiClient } from '../../lib/api-client.ts';

export type Profile = { displayName: string; introduction: string; desiredRole: string; skills: string[] };
export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.displayName === 'string' && typeof p.introduction === 'string'
    && typeof p.desiredRole === 'string' && Array.isArray(p.skills) && p.skills.every(s => typeof s === 'string');
}
export function profileErrors(profile: Profile): string[] {
  const errors: string[] = [];
  const fields: [string, string, number][] = [
    ['표시 이름', profile.displayName.trim(), 50], ['한 줄 소개', profile.introduction, 200],
    ['희망 직무', profile.desiredRole, 100], ...profile.skills.map((s, i): [string, string, number] => [`기술 ${i + 1}`, s, 50]),
  ];
  if (!profile.displayName.trim()) errors.push('표시 이름을 입력해 주세요.');
  if (profile.skills.length > 20) errors.push('기술은 최대 20개까지 입력할 수 있습니다.');
  for (const [label, value, max] of fields) {
    if (Array.from(value).length > max) errors.push(`${label}은 최대 ${max}자까지 입력할 수 있습니다.`);
    if (value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value)) errors.push(`${label}에 저장할 수 없는 문자가 있습니다.`);
  }
  return errors;
}
export async function readProfile(api: Pick<ApiClient, 'member'>, signal?: AbortSignal): Promise<Profile | null> {
  const result = await api.member('/me', { signal });
  if (result.kind !== 'success' || !result.data || typeof result.data !== 'object' || !('profile' in result.data)) return null;
  return isProfile(result.data.profile) ? result.data.profile : null;
}
export async function saveProfile(api: Pick<ApiClient, 'member'>, profile: Profile, signal?: AbortSignal): Promise<boolean> {
  const body = { displayName: profile.displayName.trim(), introduction: profile.introduction,
    desiredRole: profile.desiredRole, skills: [...profile.skills] };
  const result = await api.member('/me/profile', { method: 'PUT', body, signal });
  return result.kind === 'success' && isProfile(result.data) && result.data.displayName !== '';
}

/** PUT 성공 뒤에는 GET만 재시도한다. 세션이 바뀌면 후속 요청·이동을 중단한다. */
export async function completeProfileSetup(
  api: Pick<ApiClient, 'member'>, profile: Profile,
  options: { alreadySaved: boolean; onSaved: () => void; isCurrent: () => boolean; signal?: AbortSignal },
): Promise<'ready' | 'save-failed' | 'refresh-failed' | 'cancelled'> {
  let saved = options.alreadySaved;
  const current = () => !options.signal?.aborted && options.isCurrent();
  if (!current()) return 'cancelled';
  try {
    if (!saved) {
      const ok = await saveProfile(api, profile, options.signal);
      if (!current()) return 'cancelled';
      if (!ok) return 'save-failed';
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
