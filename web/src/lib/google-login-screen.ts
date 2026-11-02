/**
 * Google 로그인 화면(#287)의 버튼·콜백 처리. React와 분리해 시험한다. 시작 API 호출·시도 보관·콜백 해석·완료 요청은
 * 공통 인증(#286)의 함수가 맡고, 여기서는 그 결과로 안내·이동만 정한다(#287 연결 안내 「호출 순서」).
 */
import type { CallbackParse, GoogleCompletionInput, GoogleCompletionResult, GoogleStartResult } from "./auth-google.ts";
import { authScreenMessages, googleCallbackNotice, googleCompletionNotice, googleStartNotice } from "./auth-screen-messages.ts";
import type { lookupMemberWithAuth } from "./member-lookup.ts";
import { afterLoginPath, loginPath } from "./member-navigation.ts";

/**
 * 공통 인증판 회원 조회(#286 `lookupMemberWithAuth`)의 결과. `skipped`는 보내지 않았거나 이전 세션 응답이라 결과가 없는 조회다.
 * 조회 실패로도 성공으로도 보이지 않는다(#251 A 답변 1).
 */
export type MemberLookupOutcome = Awaited<ReturnType<typeof lookupMemberWithAuth>>;

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

/* ---------- Google 버튼 ---------- */

export type GoogleStartView = { busy: boolean; notice: string | null };

export type GoogleStartControl = {
  getView(): GoogleStartView;
  subscribe(listener: Listener): () => void;
  /** 화면에 붙어 있는 동안만 이동한다. 돌려준 함수를 부르면 뗀다(효과 정리). */
  attach(): () => void;
  /** 버튼 누름. 진행 중이면 무시한다. */
  press(next: string | null): Promise<void>;
};

/**
 * - 누르면 바로 막고 시작 함수를 한 번만 부른다. 연타는 무시한다.
 * - `ready`면 Google로 이동하고 버튼은 계속 막아 둔다.
 * - `superseded`는 안내 없이 버튼만 다시 연다. 그 밖의 실패는 이유별 안내 뒤 버튼을 다시 연다. 다시 누르면 새 시작이다.
 * - 화면을 떠난 뒤 온 결과로는 이동하지 않는다.
 */
export function createGoogleStartControl(deps: {
  start(next: string | null): Promise<GoogleStartResult>;
  redirect(url: string): void;
}): GoogleStartControl {
  const store = createViewStore<GoogleStartView>({ busy: false, notice: null });
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
    async press(next) {
      if (store.get().busy) return;
      store.set({ busy: true, notice: null });
      let result: GoogleStartResult;
      try {
        result = await deps.start(next);
      } catch (error) {
        // 공통 함수는 결과로 실패를 돌려준다. 예외는 예상 밖 오류이므로 버튼을 다시 열고 그대로 올린다.
        store.set({ busy: false, notice: authScreenMessages.startLoginFailed });
        throw error;
      }
      if (result.kind === "ready") {
        if (attached > 0) deps.redirect(result.authorizationUrl);
        else store.set({ busy: false, notice: null });
        return;
      }
      store.set({ busy: false, notice: googleStartNotice(result.reason) });
    },
  };
}

/* ---------- 콜백 화면 ---------- */

export type GoogleCallbackView =
  /** 해석 전 또는 완료 응답 대기 */
  | { phase: "checking" }
  /** 로그인 성공 뒤 회원 정보 확인(#261) */
  | { phase: "member-check" }
  /** 회원 정보 조회 실패. 다시 불러오기만 한다(완료 요청은 다시 보내지 않는다). */
  | { phase: "member-check-failed" }
  /** 이동할 곳. 화면이 붙어 있을 때만 화면이 이동한다. */
  | { phase: "redirect"; to: string }
  /** 안내와 새 로그인 진입 */
  | { phase: "notice"; notice: string; loginHref: string }
  /** 더 최근 시도에 밀린 결과(`superseded`)나 보내지 않은 회원 조회(`skipped`). 안내 없이 로그인 진입만 둔다. */
  | { phase: "ignored"; loginHref: string };

export type GoogleCallbackControl = {
  getView(): GoogleCallbackView;
  subscribe(listener: Listener): () => void;
  /**
   * 콜백 query를 한 번만 해석하고 결과를 보존한 뒤 query를 지운다. 두 번째 호출부터는 처음의 진행을 그대로 돌려준다
   * (개발 모드의 효과 두 번 실행·다시 그리기에도 다시 해석하거나 완료 요청을 다시 보내지 않는다).
   * 돌려준 Promise는 예상 밖 예외일 때만 거부된다.
   */
  begin(readQuery: () => URLSearchParams, clearQuery: () => void): Promise<void>;
  /** 회원 정보 조회 실패 뒤 다시 불러오기. */
  retryMemberCheck(): Promise<void>;
};

/**
 * 콜백 화면(`/google/callback`)의 진행. 합의(#251 접점 1·T2, #287 연결 안내 2-2)
 * - 세션 복원을 시작하지 않고, 복원 결과로 이번 로그인 성공을 판정하지 않는다.
 * - 해석 결과가 `complete`일 때만 완료 요청을 한 번 보낸다. 실패·응답 유실 뒤 다시 보내지 않는다. 다시 시도는 새 로그인 시작이다.
 * - 성공하면 #261 회원 조회 뒤 `afterLoginPath(이름, 다시 검사한 next)`로 간다. `next`로 바로 가지 않는다.
 */
export function createGoogleCallbackControl(deps: {
  readCallback(query: URLSearchParams): CallbackParse;
  completeGoogleLogin(input: GoogleCompletionInput): Promise<GoogleCompletionResult>;
  lookupMember(): Promise<MemberLookupOutcome>;
}): GoogleCallbackControl {
  const store = createViewStore<GoogleCallbackView>({ phase: "checking" });
  let run: Promise<void> | null = null;
  let next: string | null = null;

  function checkMember(): Promise<void> {
    store.set({ phase: "member-check" });
    return deps.lookupMember().then((me) => {
      if (me.state === "loaded") store.set({ phase: "redirect", to: afterLoginPath(me.displayName, next) });
      // 보내지 않은 조회는 실패로 안내하지 않는다. 인증 상태가 바뀐 경우라 이동하지 않고 로그인 진입만 둔다.
      else if (me.state === "skipped") store.set({ phase: "ignored", loginHref: loginPath(next ?? undefined) });
      else store.set({ phase: "member-check-failed" });
    }, (error: unknown) => {
      // #261 조회 함수는 실패를 결과로 돌려준다. 예외는 예상 밖 오류이므로 다시 불러오기를 보이고 그대로 올린다.
      store.set({ phase: "member-check-failed" });
      throw error;
    });
  }

  function settle(result: GoogleCompletionResult): Promise<void> | void {
    if (result.kind === "signed-in") return checkMember();
    const notice = googleCompletionNotice(result);
    const loginHref = loginPath(next ?? undefined);
    store.set(notice === null ? { phase: "ignored", loginHref } : { phase: "notice", notice, loginHref });
  }

  return {
    getView: store.get,
    subscribe: store.subscribe,
    begin(readQuery, clearQuery) {
      if (run !== null) return run;
      const parsed = deps.readCallback(readQuery());
      // 해석 결과를 보존한 뒤에 지운다. 이후에는 지금 주소에서 다시 해석하지 않는다.
      clearQuery();
      if (parsed.kind !== "complete") {
        store.set({ phase: "notice", notice: googleCallbackNotice(parsed.kind), loginHref: loginPath() });
        run = Promise.resolve();
        return run;
      }
      next = parsed.next;
      run = deps.completeGoogleLogin(parsed.input).then(settle, (error: unknown) => {
        // 공통 함수는 결과로 실패를 돌려준다. 예외는 예상 밖 오류이므로 새 로그인을 안내하고 그대로 올린다.
        store.set({ phase: "notice", notice: authScreenMessages.callbackLoginFailed, loginHref: loginPath(next ?? undefined) });
        throw error;
      });
      return run;
    },
    retryMemberCheck() {
      return store.get().phase === "member-check-failed" ? checkMember() : Promise.resolve();
    },
  };
}
