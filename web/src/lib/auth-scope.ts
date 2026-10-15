/**
 * 회원 화면 범위(#286 6단계). 회원 화면을 새로 만들어야 하는 순간에만 바뀌는 번호를 준다.
 *
 * 합의
 * - 같은 세션의 Access 갱신만으로 조회나 화면을 초기화하지 않는다(#286 본문, #251 「작업 상태 보존」).
 * - 재인증이 필요하면 화면·입력을 유지한다. 로그아웃·새 로그인·회원 전환 뒤에는 이전 화면 상태를 이어 쓰지 않는다.
 *
 * 번호가 바뀌는 때
 * - 로그인 성공·복원 성공으로 인증 세대가 바뀌어 `signed-in`이 될 때 새 번호.
 * - 비로그인·복원 중이면 null.
 * - Access 갱신·재인증 필요·로그아웃 진행/실패/불명은 세대를 바꾸지 않으므로 그대로다.
 * - 로그인 표식 불일치 감지(4-2)는 세대를 올리지만 감지 뒤 화면 정책이 미결이라 번호를 바꾸지 않는다(임시 처리).
 *
 * 다른 화면 호환(통합 시험 전환이 켜졌을 때만 `auth-runtime.ts`가 연결한다)
 * - 내 자산·공유 링크의 회원 범위(`assets-session-scope`·`member-session-scope`)는 `accessTokenStore`의 값이 바뀔 때 화면을 새로 만든다.
 *   그 값에 실제 토큰 대신 이 번호로 만든 표시값을 넣어(`bindLegacyTokenSignal`), 해당 화면 파일을 고치지 않고 같은 기준을 따르게 한다.
 */
import type { AccessTokenStore } from "./access-token.ts";
import type { AuthSnapshot, AuthStore } from "./auth-state.ts";

export type SessionScope = {
  /** 지금 회원 화면 범위 번호. 비로그인·복원 중이면 null. */
  getSnapshot(): number | null;
  /** 가장 최근에 범위를 연 인증 세대. 비로그인이 된 뒤에도 남는다. 한 번도 없으면 null. */
  lastGeneration(): number | null;
  subscribe(listener: () => void): () => void;
};

let nextScope = 0;

export function createSessionScope(store: AuthStore): SessionScope {
  let seen: AuthSnapshot | null = null;
  let seenDetected = false;
  let scope: number | null = null;
  let generation: number | null = null;

  const update = () => {
    const snapshot = store.getSnapshot();
    const detected = store.loginChangeDetected();
    if (snapshot === seen && detected === seenDetected) return;
    seen = snapshot;
    seenDetected = detected;
    if (detected) return; // 감지 뒤 정책 미지정: 화면 범위를 그대로 둔다.
    if (snapshot.status === "signed-in" || snapshot.status === "reauth-required") {
      if (scope === null || snapshot.generation !== generation) {
        scope = ++nextScope;
        generation = snapshot.generation;
      }
    } else {
      scope = null;
    }
  };

  return {
    getSnapshot() {
      update();
      return scope;
    },
    lastGeneration() {
      update();
      return generation;
    },
    subscribe: (listener) => store.subscribe(listener),
  };
}

/**
 * 기존 `accessTokenStore`를 회원 화면 범위 신호로 맞춘다(호환). 실제 Access 토큰은 넣지 않는다.
 * 범위가 생기거나 바뀌면 그 번호로 만든 표시값을, 범위가 없어지면 비운다(로그아웃 완료면 `logout`, 그 밖은 `auth-failed`).
 * 해제 함수를 돌려준다.
 */
export function bindLegacyTokenSignal(store: AuthStore, scope: SessionScope, tokens: AccessTokenStore): () => void {
  let current: number | null = null;
  const sync = () => {
    const next = scope.getSnapshot();
    if (next === current) return;
    current = next;
    if (next !== null) {
      tokens.set(`member-scope-${next}`);
      return;
    }
    const { logout } = store.getSnapshot();
    tokens.clear(logout.phase === "settled" && logout.result === "done" ? "logout" : "auth-failed");
  };
  sync();
  return store.subscribe(sync);
}
