/**
 * 세션 쿠키 잠금과 구성(#286 4단계, T4). 갱신·로그아웃·로그인 완료처럼 Refresh 쿠키를 바꾸는 요청을 한 잠금으로 줄 세운다.
 *
 * 합의와 결정
 * - 다중 탭 로그인 유지는 Web Locks를 지원하는 브라우저에서만 보장한다(#251 T4). Web Locks는 HTTPS나 localhost에서만 동작한다.
 * - 지원하지 않는 환경에서는 탭 사이 순서를 보장하지 않는다. 갱신이 실패하면 입력을 보존하고 재인증을 안내한다(T4·T2).
 *
 * 잠금 구성
 * - 모든 요청은 먼저 이 탭의 잠금(`createTabLock`)을 지나고, 그 안에서 같은 이름(`SESSION_LOCK_NAME`)의 Web Lock을 얻는다.
 *   그래서 Web Lock을 쓰든 못 쓰든 이 탭 안의 순서는 항상 지켜지고, Web Lock을 쓸 수 있으면 같은 출처의 다른 탭과도 순서가 지켜진다.
 * - 잠금은 작업(task)이 끝나면 성공·실패와 관계없이 놓인다. Web Lock은 콜백이 돌려준 약속이 끝날 때 브라우저가 놓고, 탭이 닫혀도 놓인다.
 * - 잠금을 얻은 뒤 보내기 직전의 상태 재확인은 작업 쪽이 맡는다(갱신 `refreshCurrent()`, 로그아웃 `logoutCurrent()`).
 *
 * Web Locks를 쓸 수 없을 때
 * - 미지원(`navigator.locks` 없음, 비보안 출처 포함): 처음부터 탭 안 잠금만 쓴다. `mode`는 `tab-only`, `reason`은 `unsupported`.
 * - 사용 실패(잠금 요청이 작업 시작 전에 예외·거부): 그 요청은 탭 안 잠금만으로 실행하고, 이 페이지에서는 이후에도 탭 안 잠금만 쓴다.
 *   `mode`는 `tab-only`, `reason`은 `failed`. 요청마다 Web Lock 사용 여부가 섞이면 이 탭 안에서도 다른 탭과의 순서를 예측할 수 없어서다.
 * - 작업이 시작된 뒤의 예외는 작업 자체의 실패이므로 다시 실행하지 않고 그대로 돌려준다.
 * - `tab-only`에서는 탭 사이 안전성을 보장하지 않는다. 화면·문서에 탭 간 보호가 된다고 표시하지 않는다.
 *
 * 로그인 표식 비교(4-2, T3)
 * - `marker`를 넘기면 다음 시점에 표식을 비교한다. 표식이 다르거나 사라졌거나 읽을 수 없거나 확인할 수 없으면
 *   `store.invalidateByLoginMarker()`로 이전 세대를 끊고, [팀장 결정 2](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)대로 처리한다.
 *   - 차단·보류가 없는 탭(`restore`): 기준값을 비우고 지금 쿠키로 복원을 한 번 보낸다. 잠금 안에서 감지해도 기다리지 않고 예약만 하므로
 *     잠금이 풀린 뒤 보낸다. 같은 세대의 복원은 하나로 합쳐진다. 복원이 성공하면 그때 읽은 표식을 기준값으로 삼는다.
 *   - 재전송 차단·로그아웃 보류가 있거나 복원 뒤에도 표식 오류가 이어지는 탭(`relogin-only`): 요청을 보내지 않고 [다시 로그인]만 남긴다.
 *   - 표식이 같다고 확인되면(`same`) 감지 뒤 복원 사용 기록을 푼다(`loginMarkerConfirmed`).
 *   - 비로그인 탭이 다른 탭 로그인을 감지했을 때의 반응은 정하지 않았다(기록만 한다).
 *   - 갱신·로그아웃을 부를 때(요청 전)
 *   - 잠금을 얻은 직후 보내기 전, 작업이 끝난 직후 결과를 반영하기 전(잠금 안)
 *   - 탭이 다시 보일 때(`watchVisibility`), 회원 조회 전·반영 전(`checkLoginMarker`, 연결은 5단계)
 * - 이 탭의 로그인 성공은 `loginSucceeded(token, attempt)`로 알리며, 반드시 `withSessionLock` 작업 안에서 부른다.
 *   표식을 잠금 안에서 써야 잠금을 기다리던 다른 탭이 새 쿠키로 보내기 전에 바뀐 표식을 본다.
 * - 서버가 로그인을 처리해 쿠키가 바뀌었는데 이 탭이 반영하지 않은 경우는 `loginNotAdopted()`로 알린다(5단계).
 * - 복원 성공 때는 잠금 안에서 읽어 둔 표식을 이 탭의 표식으로 삼는다. 표식만으로 인증 성공을 확정하지 않는다.
 * - 로그아웃 완료 뒤에도 기준값을 지우지 않는다. 비로그인 탭은 정리할 회원 화면이 없어 감지 기록만 남기고 새 로그인을 받는다.
 * - 표식 비교는 다른 탭의 로그인을 알아차리는 수단이다. 쿠키 경쟁·탭 종료 뒤 재전송을 해결하지 않는다(팀장 결정 1: "갱신 응답 유실 후 재인증" 한계).
 * - `marker`를 넘기지 않으면 비교하지 않는다(4-1과 같음). 앱 연결(5단계)에서는 반드시 넘긴다.
 *
 * 한계
 * - 대기 시간 제한은 두지 않았다. 다른 탭이 잠금을 쥔 채 응답을 오래 기다리면 이 탭의 갱신·로그아웃도 그동안 기다린다.
 * - 대역 시험은 잠금 인터페이스와 순서 규칙의 확인이다. 실제 브라우저 두 탭 검증과 구분한다.
 */
import { createTabLock, createRefreshClient, type RefreshClient, type RefreshLock, type RefreshTransport } from "./auth-refresh.ts";
import { createLogoutClient, type LogoutClient, type LogoutTransport } from "./auth-logout.ts";
import type { AuthGeneration, AuthStore, LoginAttempt } from "./auth-state.ts";
import type { LoginMarker, MarkerComparison, MarkerReading } from "./auth-login-marker.ts";

/** 같은 출처의 모든 탭이 함께 쓰는 Web Lock 이름. 갱신·로그아웃·로그인 완료가 모두 이 이름을 쓴다. */
export const SESSION_LOCK_NAME = "catchu-auth-session";

/** `navigator.locks`에서 쓰는 부분. 시험에서는 대역을 넣는다. */
export type LockManagerLike = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
};

export type SessionLockMode = "web-locks" | "tab-only";
export type SessionLockFallback = "unsupported" | "failed";

export type SessionLock = RefreshLock & {
  /** 지금 쓰는 잠금. `tab-only`면 탭 사이 순서를 보장하지 않는다. */
  readonly mode: SessionLockMode;
  /** `tab-only`인 이유. `web-locks`면 null. */
  readonly fallback: SessionLockFallback | null;
};

function isLockManager(value: unknown): value is LockManagerLike {
  return typeof value === "object" && value !== null && typeof (value as { request?: unknown }).request === "function";
}

/** 이 브라우저의 `navigator.locks`. 서버 렌더링·미지원·비보안 출처에서는 null. */
export function browserLockManager(): LockManagerLike | null {
  const candidate = (globalThis as { navigator?: { locks?: unknown } }).navigator?.locks;
  return isLockManager(candidate) ? candidate : null;
}

export type SessionLockOptions = {
  /** 기본값은 `browserLockManager()`. null이면 미지원으로 본다. */
  locks?: LockManagerLike | null;
  /** 기본값은 `SESSION_LOCK_NAME`. */
  name?: string;
};

/** 탭마다 하나만 만든다. 갱신·로그아웃·로그인 완료가 이 인스턴스를 함께 써야 탭 안 순서도 지켜진다. */
export function createSessionLock(options: SessionLockOptions = {}): SessionLock {
  const locks = options.locks === undefined ? browserLockManager() : options.locks;
  const name = options.name ?? SESSION_LOCK_NAME;
  const tab = createTabLock();
  let manager: LockManagerLike | null = isLockManager(locks) ? locks : null;
  let fallback: SessionLockFallback | null = manager ? null : "unsupported";

  async function underWebLock<T>(task: () => Promise<T>): Promise<T> {
    const current = manager;
    if (!current) return task();
    let started = false;
    try {
      return await current.request(name, { mode: "exclusive" }, () => {
        started = true;
        return task();
      });
    } catch (error) {
      if (started) throw error; // 작업 자체의 실패: 다시 실행하지 않는다.
      // 잠금을 얻지 못했다. 이 페이지에서는 탭 안 잠금만 쓰고, 이번 작업도 탭 안 잠금으로 실행한다.
      manager = null;
      fallback = "failed";
      return task();
    }
  }

  return {
    run: (task) => tab.run(() => underWebLock(task)),
    get mode() {
      return manager ? "web-locks" : "tab-only";
    },
    get fallback() {
      return fallback;
    },
  };
}

export type AuthSessionOptions = {
  store: AuthStore;
  refreshTransport: RefreshTransport;
  logoutTransport: LogoutTransport;
  /** 기본값은 `createSessionLock()`. */
  lock?: SessionLock;
  /** 로그인 표식(T3). 없으면 비교하지 않는다. */
  marker?: LoginMarker;
  /**
   * 같은 출처 탭 사이 알림(`BroadcastChannel`). 이 탭의 로그아웃 `done`을 다른 탭에 알리고, 다른 탭의 알림을 받는다(#251 접점 4).
   * 없으면 알리지도 받지도 않는다. 알림을 놓친 탭은 다음 갱신에서 세션 종료(401)를 받아 재인증 필요가 된다.
   */
  broadcast?: AuthBroadcast | null;
};

/** `BroadcastChannel`에서 쓰는 부분. 메시지에는 토큰·회원 정보를 넣지 않는다. */
export type AuthBroadcast = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
};

/** 다른 탭에 보내는 로그아웃 완료 알림. `marker`는 로그아웃한 로그인의 표식(무작위 값)이다. */
export const LOGOUT_DONE_MESSAGE = "catchu.auth.logout-done";

/** `document`에서 쓰는 부분. */
export type VisibilityTarget = {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type AuthSession = {
  refresh: RefreshClient["refresh"];
  logout: LogoutClient["logout"];
  /**
   * 세션 쿠키를 바꾸는 다른 요청(로그인 완료)을 같은 잠금 안에서 보낸다. 연결은 5·8단계에서 하며, 보내기 직전 확인과
   * 시도 식별자 전달(`signedIn(token, attempt)`의 null은 무시된 결과)은 그 단계의 연결 기준을 따른다.
   */
  withSessionLock: RefreshClient["withSessionLock"];
  /**
   * 이 탭의 로그인 성공(`store.signedIn(token, attempt)`)과 표식 기록을 함께 한다. 반드시 `withSessionLock` 작업 안에서 부른다.
   * 진행 중인 시도가 아니면 null이며 아무것도 바꾸지 않고 표식도 쓰지 않는다(무시된 결과).
   */
  loginSucceeded(token: string, attempt: LoginAttempt): AuthGeneration | null;
  /**
   * 서버는 로그인을 처리해 Refresh 쿠키를 바꿨는데 이 탭이 그 결과를 반영하지 않았을 때 부른다(#286 5단계).
   * 예: 이전·종료된 시도의 성공(`loginSucceeded`가 null), 보낸 뒤 취소된 시도의 성공, 본문을 읽지 못한 200.
   * 반드시 그 로그인 요청을 보낸 `withSessionLock` 작업 안에서 부른다.
   * - 새 표식을 써서 같은 브라우저의 다른 탭이 다음 비교에서 새 로그인으로 알아차리게 한다(T3).
   * - 이 탭은 이전 세대를 끊고 자동 복원 없이 [다시 로그인]만 남긴다(`allowRestore: false`). 쿠키가 이 탭이 반영하지 않은
   *   로그인 것이므로, 그 쿠키로 복원하면 사용자가 취소한 로그인을 이어받게 되기 때문이다. 이 탭의 로그인 성공으로만 풀린다.
   *   Google 완료는 A 합의 1(세션 확인 결과로 이번 로그인의 성공을 판정하지 않음)을 적용한 것이고, 개발 로그인은 같은 안전 기준을 적용했다.
   *   취소된 개발 로그인 성공의 반영(P1)은 별도 미결이다.
   */
  loginNotAdopted(): void;
  /** 지금 표식을 비교하고, 다르거나 읽을 수 없으면 이전 세대를 끊는다. 회원 조회 전·반영 전에 쓴다. `marker`가 없으면 null. */
  checkLoginMarker(): MarkerComparison | null;
  /** 탭이 다시 보일 때마다 표식을 비교한다. 해제 함수를 돌려준다. */
  watchVisibility(target: VisibilityTarget): () => void;
  lock: SessionLock;
};

/** 갱신·로그아웃이 같은 잠금을 쓰도록 한 번에 만든다. 탭마다 하나만 만든다. */
export function createAuthSession(options: AuthSessionOptions): AuthSession {
  const { store, marker } = options;
  const lock = options.lock ?? createSessionLock();
  /** 마지막으로 잠금 안에서 읽은 표식. 복원 성공 때 이 탭의 표식으로 삼는다. */
  let lastReading: MarkerReading | null = null;
  /** 감지 뒤 복원을 보낸다. 아래 반환 객체가 만들어진 뒤에 채운다. */
  let startRecovery: () => void = () => {};

  const checkLoginMarker = (): MarkerComparison | null => {
    if (!marker) return null;
    const result = marker.compare();
    if (result === "same") store.loginMarkerConfirmed();
    if (result === "changed" || result === "unreadable" || result === "unconfirmed") {
      if (store.invalidateByLoginMarker() === "restore") {
        // 복원하는 동안 같은 변경을 다시 감지하지 않도록 기준값을 비운다. 성공하면 refresh()가 그때 읽은 값을 기준값으로 삼는다.
        marker.reset();
        // 잠금 안에서 불릴 수 있으므로 기다리지 않고 예약만 한다(잠금이 풀린 뒤 차례로 보낸다).
        queueMicrotask(startRecovery);
      }
    }
    return result;
  };

  /** 잠금 안: 보내기 전과 결과 반영 전에 표식을 비교한다. 다르면 세대가 바뀌어 작업 쪽 재확인·반영이 막힌다. */
  const markedLock: RefreshLock = {
    run: (task) => lock.run(async () => {
      checkLoginMarker();
      const result = await task();
      checkLoginMarker();
      if (marker) lastReading = marker.read();
      return result;
    }),
  };

  const broadcast = options.broadcast ?? null;
  // 다른 탭의 로그아웃 done: 이 탭이 아는 표식과 같을 때만(같은 로그인) 반영한다. 반영 조건은 저장소가 다시 판정한다.
  broadcast?.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; marker?: unknown } | null;
    if (!data || data.type !== LOGOUT_DONE_MESSAGE || typeof data.marker !== "string") return;
    const value = marker?.known() ?? null;
    if (value === null || value !== data.marker) return;
    checkLoginMarker(); // 그사이 다른 로그인이 있었으면 먼저 감지한다(감지되면 저장소가 반영하지 않는다).
    store.logoutDoneElsewhere();
  });

  const refreshClient = createRefreshClient({ store, transport: options.refreshTransport, lock: markedLock });
  const logoutClient = createLogoutClient({ store, transport: options.logoutTransport, session: refreshClient });

  const session: AuthSession = {
    async refresh() {
      checkLoginMarker();
      const restoring = store.getSnapshot().status === "restoring";
      const outcome = await refreshClient.refresh();
      // 복원 성공: 이 탭이 지금 세션을 확인했다. 잠금 안에서 읽은 표식을 이 탭의 표식으로 삼는다.
      if (marker && restoring && outcome.kind === "signed-in" && lastReading) marker.adopt(lastReading);
      return outcome;
    },
    async logout() {
      checkLoginMarker();
      const outcome = await logoutClient.logout();
      // 이 탭의 로그아웃이 done이면 같은 로그인을 쓰는 다른 탭에 알린다. 표식을 모르면 같은 로그인인지 확인할 수 없어 알리지 않는다.
      const value = marker?.known() ?? null;
      if (broadcast && value !== null && outcome.kind === "settled" && outcome.result === "done") {
        try {
          broadcast.postMessage({ type: LOGOUT_DONE_MESSAGE, marker: value });
        } catch {
          // 알림 실패는 이 탭의 결과를 바꾸지 않는다. 다른 탭은 다음 갱신에서 세션 종료를 알게 된다.
        }
      }
      return outcome;
    },
    withSessionLock: (task) => refreshClient.withSessionLock(task),
    loginSucceeded(token, attempt) {
      const generation = store.signedIn(token, attempt);
      if (generation !== null && marker) marker.issue();
      return generation;
    },
    loginNotAdopted() {
      if (marker) marker.issue();
      store.invalidateByLoginMarker({ allowRestore: false });
    },
    checkLoginMarker,
    watchVisibility(target) {
      const listener = () => {
        if (target.visibilityState === "visible") checkLoginMarker();
      };
      target.addEventListener("visibilitychange", listener);
      return () => target.removeEventListener("visibilitychange", listener);
    },
    lock,
  };
  // 감지 뒤 복원은 일반 복원과 같은 경로(표식 비교·잠금·500 1회 재시도·응답 유실 뒤 차단)를 쓴다. 결과는 저장소 상태로 화면에 전해진다.
  startRecovery = () => {
    void session.refresh().catch(() => undefined);
  };
  return session;
}
