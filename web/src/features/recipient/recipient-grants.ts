/**
 * 비밀번호 링크의 grant 보관(#150 9/29 결정: 브라우저 `sessionStorage`).
 *
 * - 링크(token)마다 따로 보관하고, 다른 링크의 요청에는 그 링크의 grant만 쓴다.
 * - 수명은 서버가 정하고 응답에 담지 않는다. 만료·무효 grant는 서버가 401 `LINK_PASSWORD_REQUIRED`로 알려 주므로,
 *   그때(그리고 링크 불가 404 때) 그 링크의 grant만 지운다. 화면이 따로 시간을 재 만료시키지 않는다.
 * - 이 실행(새로 고치기 전까지)에서 저장·삭제한 결과는 메모리에 따로 기록하고, 저장소 값보다 먼저 쓴다.
 *   저장소가 읽기만 되고 쓰기·지우기가 실패하거나, 실패했다가 복구돼도 저장소에 남은 이전 grant가
 *   새 grant나 삭제 상태를 덮지 않게 하기 위해서다. 저장소를 쓸 수 없으면(차단·용량·사생활 모드) 이 메모리만 남는다.
 *   영속 저장소를 새로 쓰지 않는다. 새로 고친 뒤에는 메모리가 없으므로 저장소에 남은 이전 값이 다시 쓰일 수 있고,
 *   그 값은 서버가 거부(401·404)하면 다시 지운다.
 * - 손상된 값(빈 값·헤더에 실을 수 없는 문자·지나치게 긴 값)은 쓰지 않고 지운다.
 * - grant 원문을 로그·오류·URL에 남기지 않는다.
 */

/** 저장소 키 접두사. 뒤에 링크 token을 붙인다(토큰은 이미 이 탭의 주소에 있다). */
export const GRANT_KEY_PREFIX = "catchu.recipient.grant:";
/** 헤더 값으로 보낼 수 있는 길이 상한. 서버 grant보다 넉넉하며, 넘으면 손상된 값으로 본다. */
export const GRANT_MAX_LENGTH = 2048;
/** 헤더에 그대로 실을 수 있는 보이는 ASCII만 허용한다. */
const GRANT_PATTERN = /^[\x21-\x7e]+$/;

export type GrantStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isUsableGrant(value: unknown): value is string {
  return typeof value === "string" && value.length <= GRANT_MAX_LENGTH && GRANT_PATTERN.test(value);
}

export function createGrantStore(storage: () => GrantStorage | null) {
  /** 이 실행에서 저장(문자열)·삭제(null)한 결과. 있으면 저장소 값보다 먼저 쓴다. */
  const decided = new Map<string, string | null>();
  const keyOf = (token: string) => `${GRANT_KEY_PREFIX}${token}`;
  const target = (): GrantStorage | null => {
    try { return storage(); } catch { return null; }
  };

  function remove(token: string): void {
    decided.set(token, null);
    try { target()?.removeItem(keyOf(token)); } catch { /* 저장소를 못 지워도 이 실행에서는 삭제로 본다 */ }
  }

  return {
    get(token: string): string | null {
      if (decided.has(token)) return decided.get(token) ?? null;
      let stored: string | null = null;
      try {
        stored = target()?.getItem(keyOf(token)) ?? null;
      } catch {
        stored = null;
      }
      if (stored === null) return null;
      if (isUsableGrant(stored)) return stored;
      remove(token);
      return null;
    },
    set(token: string, grant: string): void {
      if (!isUsableGrant(grant)) {
        remove(token);
        return;
      }
      decided.set(token, grant);
      const store = target();
      if (!store) return;
      try {
        store.setItem(keyOf(token), grant);
      } catch {
        // 새 값을 못 남겼으면 이전 값도 지워 둔다(새로 고친 뒤 이전 grant를 보내지 않게). 이것도 실패하면 그대로 둔다.
        try { store.removeItem(keyOf(token)); } catch { /* 이 실행에서는 메모리의 새 값을 쓴다 */ }
      }
    },
    remove,
  };
}

export type GrantStore = ReturnType<typeof createGrantStore>;

/** 브라우저의 sessionStorage. 서버 렌더링·접근 차단이면 null. */
export function browserSessionStorage(): GrantStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
