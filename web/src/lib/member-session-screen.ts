/**
 * 회원 화면 묶음의 로그아웃·재인증 안내(#287). React와 분리해 시험한다.
 * 인증 상태 판단·입력 정리·복원·로그아웃 뒤 이동은 공통 인증(#286)과 그 가드가 맡는다. 여기서는 미저장 확인·요청·진행·실패·불명 표시만 정한다.
 */
import type { LogoutOutcome, LogoutResult, LogoutSnapshot } from "./auth-screen-contract.ts";
import { authScreenMessages, logoutNotice } from "./auth-screen-messages.ts";
import { confirmDiscardUnsaved, type ConfirmDialog, type UnsavedRegistry } from "./unsaved-changes.ts";

type Listener = () => void;

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
 * - 미저장 확인에서 머무르면 요청·이동 없이 끝낸다.
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

/** 로그아웃 전 미저장 확인. */
export function confirmLogout(registry: Pick<UnsavedRegistry, "hasUnsaved">, confirm: ConfirmDialog): boolean {
  return confirmDiscardUnsaved(registry, confirm, authScreenMessages.logoutUnsavedConfirm);
}

/* ---------- 재인증 안내 ---------- */

/**
 * 재인증 안내의 [다시 로그인]을 눌렀을 때 로그인 화면으로 갈지. 로그아웃·갱신 요청은 보내지 않는다(#251 A 답변 3, 팀장 답변 2).
 * - 일반 재인증(`inputCleared` false): 화면·입력을 유지하고 있으므로 로그아웃과 같은 미저장 확인을 거친다. 머무르면 false.
 * - 로그인 표식 변경 뒤 공통 인증이 이미 화면·입력을 정리한 탭(`inputCleared` true): 잃을 입력이 없으므로 묻지 않는다.
 *   정리 여부는 #286이 정해 넘긴다.
 */
export function confirmReauthLeave(
  inputCleared: boolean,
  registry: Pick<UnsavedRegistry, "hasUnsaved">,
  confirm: ConfirmDialog,
): boolean {
  return inputCleared || confirmDiscardUnsaved(registry, confirm, authScreenMessages.reauthUnsavedConfirm);
}
