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
 * 이전 세션 응답이면 `skipped`다. 화면은 이를 조회 실패로도 성공으로도 보이지 않는다(아래 `viewSessionLookup`).
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

/** 공통 화면의 회원 조회 하나를 가리킨다. 회원 화면 범위 번호·경로(화면)·재조회 횟수가 모두 같아야 같은 조회다. */
export type SessionLookupKey = { sessionScope: number; scope: string; attempt: number };

/** 공통 화면(가드·로그인)의 회원 조회 기록. 마지막으로 받은 결과와, 결과 없이 끝난(`skipped`) 마지막 조회. */
export type SessionLookupState = {
  result: (SessionLookupKey & { me: MeLookup }) | null;
  skipped: SessionLookupKey | null;
};

/** `idle`: 진행 중인 조회도 보일 결과도 없다. 실패 안내·진행 표시를 하지 않고 인증 상태 표시(재인증 안내 등)에 맡긴다. */
export type SessionLookupView = MeLookup | { state: 'idle' };

export const initialSessionLookup: SessionLookupState = { result: null, skipped: null };

/** 조회가 끝나면 기록한다. 화면이 이미 떠났거나 다음 조회로 넘어간 응답은 호출부가 버린다(AbortController). */
export function recordSessionLookup(
  state: SessionLookupState, key: SessionLookupKey, outcome: MeLookup | { state: 'skipped' },
): SessionLookupState {
  // 같은 화면의 더 최신 조회 결과가 이미 있으면 늦게 끝난 이전 조회는 기록하지 않는다(호출부의 취소와 별도 방어).
  if (sameScreen(state.result, key) && key.attempt < (state.result as SessionLookupKey).attempt) return state;
  if (outcome.state === 'skipped') return { ...state, skipped: key };
  return { result: { ...key, me: outcome }, skipped: null };
}

function sameScreen(a: SessionLookupKey | null, b: SessionLookupKey): boolean {
  return a !== null && a.sessionScope === b.sessionScope && a.scope === b.scope;
}

/**
 * 공통 화면에 보일 회원 조회 상태(#251 A 동의: 보내지 않음·이전 세션 응답은 안내·이동 없이 넘기고 그 요청의 진행 표시만 정리한다).
 * - 지금 조회의 결과가 있으면 그 결과. 다시 조회하는 동안에는 이전에 불러온 결과로 화면을 유지한다(#251 접점 3·15번).
 * - 지금 조회가 결과 없이 끝났거나(`skipped`) 보낼 수 없는 상태(`callable` 아님)면 진행 표시를 지운다.
 *   이 화면의 이전 결과가 있으면 그대로(실패면 다시 시도 버튼 유지), 없으면 `idle`이다.
 * - 그 밖에는 지금 조회가 진행 중이므로 `loading`이다. 이전 조회의 `skipped`는 다음 조회의 진행 표시를 지우지 않는다.
 */
export function viewSessionLookup(
  state: SessionLookupState, current: SessionLookupKey & { callable: boolean },
): SessionLookupView {
  const result = sameScreen(state.result, current) ? state.result : null;
  if (result && result.attempt === current.attempt) return result.me;
  if (result && result.me.state === 'loaded') return result.me;
  const ended = !current.callable || (sameScreen(state.skipped, current) && state.skipped?.attempt === current.attempt);
  if (ended) return result ? result.me : { state: 'idle' };
  return { state: 'loading' };
}
