/**
 * 회원 화면 묶음의 로그아웃·재인증 안내(#287). React와 분리해 시험한다.
 * 인증 상태 판단·입력 정리·복원·로그아웃 뒤 이동은 공통 인증(#286)과 그 가드가 맡는다.
 * 여기서는 이동 전 확인(미저장 입력·미확정 분석 요청)·요청·진행·실패·불명 표시와 [다시 로그인]의 한 번 이동만 정한다. 확인 사유의 판정·등록은 각 화면이 #286 등록 수단으로 한다.
 */
import type { ReauthNoticeProps } from "./auth-gate.ts";
import type { LogoutOutcome } from "./auth-logout.ts";
import type { AuthSnapshot, LogoutResult } from "./auth-state.ts";
import { leaveConfirmMessage, logoutNotice, type LeaveAction } from "./auth-screen-messages.ts";
import type { ConfirmDialog, UnsavedRegistry } from "./unsaved-changes.ts";

type Listener = () => void;

/** 로그아웃 표시에 쓰는 공통 인증 상태(#286 `AuthSnapshot`)의 일부. */
export type LogoutSnapshot = Pick<AuthSnapshot, "generation" | "logout" | "canRetryLogout">;

/* ---------- 로그아웃 ---------- */

/** 이 탭에서 보낸 로그아웃의 화면 상태. 공통 인증 상태와 함께 `logoutView()`로 표시를 정한다. */
export type LogoutLocal = {
  /** 이 화면이 보낸 요청이 아직 끝나지 않음 */
  inFlight: boolean;
  /** 이 화면이 받은 실패·불명. 요청을 시작한 인증 세대를 함께 둔다. */
  last: { result: Exclude<LogoutResult, "done">; generation: number } | null;
};

export type LogoutRequestResult = "busy" | "stayed" | LogoutOutcome;

export type MemberLogoutControl = {
  getLocal(): LogoutLocal;
  subscribe(listener: Listener): () => void;
  /** 헤더 [로그아웃]과 [다시 시도]. `snapshot`은 누른 시점의 공통 인증 상태다. */
  request(snapshot: LogoutSnapshot): Promise<LogoutRequestResult>;
};

/**
 * - 진행 중(이 화면의 요청 또는 공통 상태 `pending`)이면 묻지도 보내지도 않는다.
 * - 이동 전 확인(`confirmLogout`)에서 머무르면 요청·이동 없이 끝낸다.
 * - `done`이어도 여기서는 이동하지 않는다. 정리·이동은 가드가 현재 유효한 완료일 때만 한다.
 * - `not-started`·`discarded`는 안내 없이 진행 표시만 지운다.
 */
export function createMemberLogoutControl(deps: {
  logout(): Promise<LogoutOutcome>;
  confirmLeave(): boolean;
}): MemberLogoutControl {
  let local: LogoutLocal = { inFlight: false, last: null };
  const listeners = new Set<Listener>();
  const set = (next: LogoutLocal) => {
    local = next;
    for (const listener of listeners) listener();
  };
  return {
    getLocal: () => local,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async request(snapshot) {
      if (local.inFlight || snapshot.logout.phase === "pending") return "busy";
      if (!deps.confirmLeave()) return "stayed";
      set({ inFlight: true, last: null });
      let outcome: LogoutOutcome;
      try {
        outcome = await deps.logout();
      } catch (error) {
        // 공통 함수는 결과로 실패를 돌려준다. 예외는 예상 밖 오류이므로 진행 표시만 지우고 그대로 올린다.
        set({ inFlight: false, last: null });
        throw error;
      }
      const failed = outcome.kind === "settled" && outcome.result !== "done" ? outcome.result : null;
      set({ inFlight: false, last: failed ? { result: failed, generation: snapshot.generation } : null });
      return outcome;
    },
  };
}

export type LogoutView = {
  /** 로그아웃 버튼을 막고 진행을 표시한다. */
  pending: boolean;
  /** 실패·불명 안내. `retry`면 [다시 시도]를 보인다. */
  notice: { message: string; retry: boolean } | null;
};

/**
 * 실패·불명은 이 화면이 받은 결과가 지금도 공통 상태의 마지막 로그아웃 결과일 때만 보인다.
 * 그사이 새 로그인이 시작됐거나 인증 세대가 바뀌었거나 다른 로그아웃이 진행 중이면 이전 결과를 보이지 않는다.
 * 다른 탭의 결과로는 안내하지 않는다(다른 탭의 유효한 완료는 가드가 처리한다).
 */
export function logoutView(snapshot: LogoutSnapshot, local: LogoutLocal): LogoutView {
  const pending = local.inFlight || snapshot.logout.phase === "pending";
  const { last } = local;
  const { logout } = snapshot;
  const current = last !== null && !pending && logout.phase === "settled" && logout.result === last.result
    && logout.fromGeneration === last.generation && snapshot.generation === last.generation && !logout.loginStartedAfter;
  if (!current) return { pending, notice: null };
  const message = logoutNotice(last.result, snapshot.canRetryLogout);
  return { pending, notice: message === null ? null : { message, retry: snapshot.canRetryLogout } };
}

/* ---------- 이동 전 확인 ---------- */

/** 이동 전 확인이 읽는 등록 수단(#286 `unsavedChanges`)의 일부. */
type LeaveReasons = Pick<UnsavedRegistry, "activeReasons">;

/**
 * 누를 때마다 `activeReasons()`를 한 번 읽어 그 시점의 사유로 묻는다([#287 접점 안내](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6313395220)).
 * 사유가 없으면 묻지 않고 true(계속)다. 있으면 사유에 맞는 문구로 한 번만 묻고, 머무르면 false다. 입력·요청 정보와 그 등록은 건드리지 않는다.
 * 어떤 상태를 사유로 등록할지는 각 화면 담당이 정한다(미확정 분석 요청은 #153·#154). 여기서는 분석 상태를 판정하지 않는다.
 */
function confirmLeave(action: LeaveAction, registry: LeaveReasons, confirm: ConfirmDialog): boolean {
  const message = leaveConfirmMessage(action, registry.activeReasons());
  return message === null || confirm(message);
}

/** 로그아웃 전 확인. 계속하면 기존 흐름대로 `logout()`을 보낸다. */
export function confirmLogout(registry: LeaveReasons, confirm: ConfirmDialog): boolean {
  return confirmLeave("logout", registry, confirm);
}

/* ---------- 재인증 안내 ---------- */

/**
 * 재인증 안내의 [다시 로그인]을 눌렀을 때 로그인 화면으로 갈지. 로그아웃·갱신 요청은 보내지 않는다(#251 A 답변 3, 팀장 결정 2).
 * - `variant` 생략·`reauth`: 화면·입력을 유지하고 있으므로 로그아웃과 같은 이동 전 확인을 거친다. 머무르면 false.
 * - `login-changed`: 다른 탭의 새 로그인 감지로 가드가 화면·입력을 이미 정리한 탭이다. 잃을 입력이 없으므로 사유를 읽지 않고 묻지 않는다.
 *   이 값은 #286 가드가 정해 넘긴다(`relogin-only` 판정).
 */
export function confirmReauthLeave(
  variant: ReauthNoticeProps["variant"],
  registry: LeaveReasons,
  confirm: ConfirmDialog,
): boolean {
  return variant === "login-changed" || confirmLeave("reauth", registry, confirm);
}

export type ReauthLeaveResult = "busy" | "stayed" | "leaving";

export type ReauthLeaveControl = {
  /** 재인증 안내의 [다시 로그인]. `notice`는 누른 시점의 안내 값(`returnTo`·`variant`)이다. */
  request(notice: ReauthNoticeProps): ReauthLeaveResult;
};

/**
 * [다시 로그인]의 이동을 한 번만 시작한다([#287 D 재현](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6335776141)).
 * 확인 창이 떠 있는 동안 들어온 더블클릭의 두 번째 클릭·Enter 반복은 창이 닫힌 뒤 같은 버튼에 이어서 들어온다.
 * 버튼 표시·초점은 바꾸지 않고, 누를 때마다 이 제어의 값으로 바로 판단한다.
 * - 이동을 시작한 뒤(확인에서 계속했거나 물을 사유가 없음)에는 묻지도 이동하지도 않는다. 이동하면 안내가 회원 화면과 함께 사라지므로 되돌리지 않는다.
 * - 머무르면 아무것도 바꾸지 않는다. 화면·입력·요청 정보가 그대로이고, 다시 누르면 그 시점의 사유로 다시 묻는다.
 * - 이동을 시작하지 못하면(예상 밖 예외) 다시 누를 수 있게 되돌리고 예외를 그대로 올린다.
 */
export function createReauthLeaveControl(deps: {
  confirmLeave(variant: ReauthNoticeProps["variant"]): boolean;
  navigate(returnTo: ReauthNoticeProps["returnTo"]): void;
}): ReauthLeaveControl {
  let leaving = false;
  return {
    request({ returnTo, variant }) {
      if (leaving) return "busy";
      if (!deps.confirmLeave(variant)) return "stayed";
      leaving = true;
      try {
        deps.navigate(returnTo);
      } catch (error) {
        leaving = false;
        throw error;
      }
      return "leaving";
    },
  };
}
