/**
 * GitHub 연동 화면(W02-G, #253)의 상태 표시·시작 버튼·콜백 처리. React와 분리해 시험한다.
 * API 호출과 응답 해석은 `github-connection-api.ts`가 맡고, 여기서는 그 결과로 안내·이동만 정한다.
 * 문구와 상태별 행동은 회원·자산 흐름 초안의 W02-G 표(A 화면 제안)를 따른다.
 */
import { routes } from "../../lib/routes.ts";
import type { GitHubState } from "../repository-management/repository-api.ts";
import type { CallbackParams, CompletionResult, GitHubConnection, StartResult } from "./github-connection-api.ts";

type Listener = () => void;

function createViewStore<T>(initial: T) {
  let view = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => view,
    set(next: T) {
      view = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** 안내. `info`는 오류가 아닌 결과(취소), `error`는 실패·확인 불가다. 화면은 tone에 따라 알림 방식을 고른다. */
export type GitHubNotice = { tone: "info" | "error"; text: string };

export const githubConnectionMessages = {
  lead: "분석을 요청하려면 GitHub 계정을 연결해 주세요.",
  leadNote: "연결만으로 저장소 분석이 시작되지 않습니다.",
  loading: "GitHub 연결 상태를 확인하고 있습니다.",
  lookupFailed: "연결 상태를 확인하지 못했습니다",
  starting: "GitHub 연결을 진행하고 있습니다.",
  checking: "GitHub 연결 결과를 확인하고 있습니다.",
  connected: "GitHub 계정이 연결되었습니다. 내 자산으로 이동합니다.",
} as const;

export const githubNotices = {
  cancelled: { tone: "info", text: "GitHub 연결을 취소했습니다. 기존 연결 상태는 바뀌지 않았습니다." },
  failed: { tone: "error", text: "GitHub 계정을 연결하지 못했습니다. 다시 연결하려면 연결 버튼을 눌러 주세요." },
  unknown: { tone: "error", text: "GitHub 연결 결과를 확인하지 못했습니다. 아래에서 현재 연결 상태를 확인해 주세요." },
  unavailable: { tone: "error", text: "지금은 GitHub 연결을 사용할 수 없습니다." },
  startFailed: { tone: "error", text: "GitHub 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." },
} as const satisfies Record<string, GitHubNotice>;

/* ---------- 연결 상태 표시 ---------- */

/**
 * 조회한 연결 상태의 표시. 세 상태의 이름이 서로 다르다(홈 안내와 같은 이름).
 * - 미연결·재연결 필요: 연결 시작 버튼. 직전에 취소·실패 안내가 있었으면 [다시 연결]이다.
 * - 연결됨: 계정과 내 자산의 저장소 연결 관리 이동. 10월 화면에는 연결 해제·다른 계정 교체가 없다.
 */
export type ConnectionStatusView = {
  github: GitHubState;
  label: string;
  account: string | null;
  description: string | null;
  action: { kind: "start"; label: string } | { kind: "link"; label: string; href: string };
};

export function connectionStatusView(connection: GitHubConnection, retried: boolean): ConnectionStatusView {
  const account = connection.accountLogin === "" ? null : connection.accountLogin;
  switch (connection.state) {
    case "DISCONNECTED":
      return {
        github: "DISCONNECTED", label: "GitHub 미연결", account: null, description: null,
        action: { kind: "start", label: retried ? "다시 연결" : "GitHub 연결" },
      };
    case "REAUTH_REQUIRED":
      return {
        github: "REAUTH_REQUIRED", label: "GitHub 재연결 필요", account,
        description: "GitHub 연결을 다시 확인해 주세요. 다시 연결해야 저장소를 연결하고 분석을 요청할 수 있습니다.",
        action: { kind: "start", label: "다시 연결" },
      };
    case "CONNECTED":
      return {
        github: "CONNECTED", label: "GitHub 연결됨", account,
        description: "저장소 연결과 분석 요청은 내 자산의 저장소 연결 관리에서 합니다.",
        action: { kind: "link", label: "내 자산에서 저장소 연결 관리", href: routes.assets },
      };
  }
}

/* ---------- 연결 시작 버튼 ---------- */

export type StartView = { busy: boolean; notice: GitHubNotice | null };

export type StartControl = {
  getView(): StartView;
  subscribe(listener: Listener): () => void;
  /** 화면에 붙어 있는 동안만 이동한다. 돌려준 함수를 부르면 뗀다(효과 정리). */
  attach(): () => void;
  /** 버튼 누름. 진행 중이면 무시한다. */
  press(): Promise<void>;
  /** 뒤로 가기로 이전 화면이 그대로 복원됐을 때(bfcache) 막아 둔 버튼을 다시 연다. */
  reset(): void;
};

/**
 * - 누르면 바로 막고 시작 API를 한 번만 부른다. 연타는 무시한다.
 * - `ready`면 GitHub로 이동하고 버튼은 계속 막아 둔다. 화면을 떠난 뒤 온 결과로는 이동하지 않는다.
 * - CatchU 인증 오류(`auth`)는 안내하지 않는다. 토큰이 지워져 회원 경로 가드가 로그인으로 보낸다.
 * - 그 밖의 실패는 안내 뒤 버튼을 다시 연다. 다시 누르면 새 시작이다(서버는 이전 state를 새 state로 바꾼다).
 */
export function createStartControl(deps: {
  start(): Promise<StartResult>;
  redirect(url: string): void;
}): StartControl {
  const store = createViewStore<StartView>({ busy: false, notice: null });
  let attached = 0;
  return {
    getView: store.get,
    subscribe: store.subscribe,
    attach() {
      attached += 1;
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        attached -= 1;
      };
    },
    async press() {
      if (store.get().busy) return;
      store.set({ busy: true, notice: null });
      let result: StartResult;
      try {
        result = await deps.start();
      } catch (error) {
        // 시작 함수는 결과로 실패를 돌려준다. 예외는 예상 밖 오류이므로 버튼을 다시 열고 그대로 올린다.
        store.set({ busy: false, notice: githubNotices.startFailed });
        throw error;
      }
      if (result.kind === "ready") {
        if (attached > 0) deps.redirect(result.authorizationUrl);
        else store.set({ busy: false, notice: null });
        return;
      }
      const notice = result.reason === "auth" ? null
        : result.reason === "unavailable" ? githubNotices.unavailable : githubNotices.startFailed;
      store.set({ busy: false, notice });
    },
    reset() {
      if (store.get().busy) store.set({ busy: false, notice: null });
    },
  };
}

/* ---------- 콜백 화면 ---------- */

export type CallbackView =
  /** 해석 전 또는 완료 응답 대기 */
  | { phase: "checking" }
  /** 연결 성공 확인. 화면이 붙어 있을 때만 화면이 이동한다. */
  | { phase: "redirect"; to: string }
  /** 연동 화면을 그대로 보이고 안내를 덧붙인다. 안내가 null이면 현재 상태만 보인다. */
  | { phase: "panel"; notice: GitHubNotice | null };

export type CallbackControl = {
  getView(): CallbackView;
  subscribe(listener: Listener): () => void;
  /**
   * 콜백 query를 한 번만 해석하고 결과를 보존한 뒤 query를 지운다. 두 번째 호출부터는 처음의 진행을 그대로 돌려준다
   * (개발 모드의 효과 두 번 실행·다시 그리기에도 다시 해석하거나 완료 요청을 다시 보내지 않는다).
   * 돌려준 Promise는 예상 밖 예외일 때만 거부된다.
   */
  begin(readQuery: () => URLSearchParams, clearQuery: () => void): Promise<void>;
};

/**
 * 콜백 화면(`/github/callback`)의 진행.
 * - `code`일 때만 완료 API를 한 번 보낸다. 거부·응답 유실 뒤 다시 보내지 않는다. 다시 연결은 새 시작이다.
 * - 서버가 CONNECTED를 돌려준 경우만 성공이며 내 자산(Catch 탭의 저장소 연결 관리)으로 간다. 저장소 연결·분석 요청은 하지 않는다.
 * - 응답 유실(`unknown`)은 성공·실패로 단정하지 않고 연결 상태 조회만 한다(화면이 현재 상태를 다시 읽는다).
 * - 요청을 보낸 뒤 CatchU 인증이 바뀌었으면 결과를 쓰지 않는다. 지금 회원의 상태만 다시 읽는다.
 */
export function createCallbackControl(deps: {
  readCallback(query: URLSearchParams): CallbackParams;
  complete(input: { code: string; state: string }): Promise<CompletionResult>;
  /** 지금의 CatchU 인증. 같은 값이면 같은 세션이다. */
  session(): unknown;
}): CallbackControl {
  const store = createViewStore<CallbackView>({ phase: "checking" });
  let run: Promise<void> | null = null;

  function settle(result: CompletionResult, session: unknown) {
    if (deps.session() !== session) {
      store.set({ phase: "panel", notice: null });
      return;
    }
    switch (result.kind) {
      case "connected": store.set({ phase: "redirect", to: routes.assets }); return;
      case "rejected": store.set({ phase: "panel", notice: githubNotices.failed }); return;
      case "unavailable": store.set({ phase: "panel", notice: githubNotices.unavailable }); return;
      case "unknown": store.set({ phase: "panel", notice: githubNotices.unknown }); return;
      // 토큰이 지워져 회원 경로 가드가 로그인으로 보낸다. 다시 로그인한 뒤에는 연결 상태를 새로 읽는다.
      case "auth": store.set({ phase: "panel", notice: null }); return;
    }
  }

  return {
    getView: store.get,
    subscribe: store.subscribe,
    begin(readQuery, clearQuery) {
      if (run !== null) return run;
      const parsed = deps.readCallback(readQuery());
      // 해석 결과를 보존한 뒤에 지운다. code·state가 주소·방문 기록에 남지 않게 한다.
      clearQuery();
      if (parsed.kind !== "code") {
        const notice = parsed.kind === "missing" ? null : parsed.kind === "cancelled" ? githubNotices.cancelled : githubNotices.failed;
        store.set({ phase: "panel", notice });
        run = Promise.resolve();
        return run;
      }
      const session = deps.session();
      run = deps.complete({ code: parsed.code, state: parsed.state }).then((result) => settle(result, session), (error: unknown) => {
        // 완료 함수는 결과로 실패를 돌려준다. 예외는 예상 밖 오류다. 요청이 서버에 닿았는지 모르므로 상태 확인을 안내하고 그대로 올린다.
        store.set({ phase: "panel", notice: githubNotices.unknown });
        throw error;
      });
      return run;
    },
  };
}
