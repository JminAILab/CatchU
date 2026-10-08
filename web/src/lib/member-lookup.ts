import type { ApiClient } from './api-client.ts';
import type { MeLookup } from './member-navigation.ts';

/** 이름 판단에 필요한 필드를 검증한다. 실패·잘못된 응답을 빈 이름으로 바꾸지 않는다. */
export async function lookupMember(api: Pick<ApiClient, 'member'>, signal?: AbortSignal): Promise<MeLookup> {
  try {
    const result = await api.member('/me', { signal });
    if (result.kind !== 'success') return { state: 'failed' };
    const data = result.data;
    if (!data || typeof data !== 'object' || !('profile' in data)) return { state: 'failed' };
    const profile = data.profile;
    if (!profile || typeof profile !== 'object' || !('displayName' in profile)
      || typeof profile.displayName !== 'string') return { state: 'failed' };
    return { state: 'loaded', displayName: profile.displayName };
  } catch {
    return { state: 'failed' };
  }
}
