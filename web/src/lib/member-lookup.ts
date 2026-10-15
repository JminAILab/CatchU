import type { ApiClient, ClientResult } from './api-client.ts';
import type { MemberCallResult } from './auth-api.ts';
import type { MeLookup } from './member-navigation.ts';

/** 이름 판단에 필요한 필드를 검증한다. 실패·잘못된 응답을 빈 이름으로 바꾸지 않는다. */
export async function lookupMember(api: Pick<ApiClient, 'member'>, signal?: AbortSignal): Promise<MeLookup> {
  try {
    return parseMe(await api.member('/me', { signal }));
  } catch {
    return { state: 'failed' };
  }
}

function parseMe(result: ClientResult): MeLookup {
  if (result.kind !== 'success') return { state: 'failed' };
  const data = result.data;
  if (!data || typeof data !== 'object' || !('profile' in data)) return { state: 'failed' };
  const profile = data.profile;
  if (!profile || typeof profile !== 'object' || !('displayName' in profile)
    || typeof profile.displayName !== 'string') return { state: 'failed' };
  return { state: 'loaded', displayName: profile.displayName };
}

/**
 * 공통 인증 호출로 회원을 조회한다(#286 6단계). 보내지 않았거나(재인증 필요·로그아웃 보류·로그인 변경 감지 등)
 * 이전 세션 응답이면 `skipped`다. 화면은 이를 조회 실패로 보이지 않고 이전 화면을 유지하거나 확인 중으로 둔다.
 */
export async function lookupMemberWithAuth(
  member: (path: string, request?: { signal?: AbortSignal }) => Promise<MemberCallResult>, signal?: AbortSignal,
): Promise<MeLookup | { state: 'skipped' }> {
  try {
    const result = await member('/me', { signal });
    if (result.kind === 'not-sent' || result.kind === 'discarded') return { state: 'skipped' };
    return parseMe(result);
  } catch {
    return { state: 'failed' };
  }
}
