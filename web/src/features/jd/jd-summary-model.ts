import type { ClientResult } from "../../lib/api-client.ts";
import { createViewStore } from "../../lib/view-store.ts";
import type { ConsentRunResult } from "../../components/ai-consent/ai-consent-flow.ts";
import { jdErrorText, jdFailure, type JdApi, type JdFailure } from "./jd-api.ts";
import type { JdSessionDeps } from "./jd-management-model.ts";
import type { JdItem, JdRecipientContext, JdRun, JdRunItem, LinkAccessCode } from "./jd-types.ts";

export type JdSummaryState = {
  jds: JdItem[]; jdCursor: string | null; runs: JdRunItem[]; runCursor: string | null;
  selectedJd: string | null; selectedRun: string | null; result: JdRun | null;
  jdState: "idle" | "loading" | "ready" | "error"; runState: "idle" | "loading" | "ready" | "error";
  accepting: boolean; resultLoading: boolean; error: string | null; notice: string | null; accessLost: boolean;
};
const initial = (): JdSummaryState => ({ jds: [], jdCursor: null, runs: [], runCursor: null, selectedJd: null,
  selectedRun: null, result: null, jdState: "idle", runState: "idle", accepting: false, resultLoading: false,
  error: null, notice: null, accessLost: false });
export type ConsentRunner = (request: () => Promise<ClientResult>) => Promise<ConsentRunResult>;
let nextViewId = 0;

/** C-11 연결과 합성 검사에서 같은 상태 모델을 사용한다. 자동 폴링·자동 재접수는 하지 않는다. */
export function createJdSummaryModel(api: JdApi, context: JdRecipientContext, deps: JdSessionDeps) {
  const store = createViewStore(initial());
  const session = deps.session();
  let disposed = false, lost = false, jdVersion = 0, runVersion = 0, resultVersion = 0;
  const current = () => !disposed && !lost && context.isLoggedIn && deps.isLoggedIn() && deps.session() === session;
  function clear() {
    lost = true; ++jdVersion; ++runVersion; ++resultVersion;
    store.set({ ...initial(), accessLost: true });
  }
  function valid() {
    if (current()) return true;
    if (!disposed) clear();
    return false;
  }
  function failure(result: JdFailure) {
    const link = result.status === 401 && result.code === "LINK_PASSWORD_REQUIRED" || result.status === 404 && result.code === "LINK_UNAVAILABLE";
    const auth = result.status === 401 && result.outcome !== "renewed-rejected" && ["AUTH_REQUIRED", "AUTH_INVALID"].includes(result.code);
    if (link || auth || result.outcome === "discarded") {
      clear();
      store.set((s) => ({ ...s, error: auth ? jdErrorText(result) : "접근 상태가 바뀌었습니다. 링크 또는 로그인을 다시 확인해 주세요." }));
      if (link) context.onAccessLost(result.code as LinkAccessCode);
      return;
    }
    store.set((s) => ({ ...s, error: jdErrorText(result) }));
  }
  async function loadJds(more = false) {
    if (!valid()) return;
    const before = store.get();
    if (before.jdState === "loading" || more && !before.jdCursor) return;
    const version = ++jdVersion;
    store.set({ ...before, jdState: "loading", error: null });
    const response = await api.list(more ? before.jdCursor : null);
    if (!valid() || version !== jdVersion) return;
    if (response.kind === "failed") { store.set((s) => ({ ...s, jdState: "error" })); failure(response); return; }
    const jds = more ? [...before.jds, ...response.value.items] : response.value.items;
    store.set((s) => ({ ...s, jds, jdCursor: response.value.nextCursor, jdState: "ready",
      selectedJd: jds.some((jd) => jd.jdId === s.selectedJd) ? s.selectedJd : null }));
  }
  async function loadRuns(more = false) {
    if (!valid()) return;
    const before = store.get();
    if (more && (before.runState === "loading" || !before.runCursor)) return;
    const version = ++runVersion;
    store.set({ ...before, runState: "loading", error: null });
    const response = await api.listRuns(context, more ? before.runCursor : null);
    if (!valid() || version !== runVersion) return;
    if (response.kind === "failed") { store.set((s) => ({ ...s, runState: "error" })); failure(response); return; }
    store.set((s) => ({ ...s, runs: more ? [...before.runs, ...response.value.items] : response.value.items,
      runCursor: response.value.nextCursor, runState: "ready" }));
  }
  async function selectRun(runId: string) {
    if (!valid()) return;
    const version = ++resultVersion;
    store.set((s) => ({ ...s, selectedRun: runId, result: null, resultLoading: true, error: null }));
    const response = await api.getRun(context, runId);
    if (!valid() || version !== resultVersion || store.get().selectedRun !== runId) return;
    store.set((s) => ({ ...s, resultLoading: false }));
    if (response.kind === "failed") failure(response);
    else store.set((s) => ({ ...s, result: response.value }));
  }
  async function accept(runWithConsent: ConsentRunner) {
    const before = store.get();
    if (!valid() || before.accepting || !before.selectedJd) return;
    const jdId = before.selectedJd;
    const selectedVersion = resultVersion;
    store.set({ ...before, accepting: true, error: null, notice: null });
    // 동의 창을 연 동안 계정/token이 바뀌면 재요청도 보내지 않는다.
    const outcome = await runWithConsent(() => current() ? api.acceptRaw(context, jdId)
      : Promise.resolve({ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }));
    if (!valid()) return;
    store.set((s) => ({ ...s, accepting: false }));
    if (outcome.kind === "declined") { store.set((s) => ({ ...s, notice: "동의하지 않아 실행하지 않았습니다." })); return; }
    if (outcome.kind === "consent-failed") { failure(jdFailure(outcome.result)); return; }
    const result = api.accepted(outcome.result);
    if (result.kind === "failed") { failure(result); return; }
    store.set((s) => ({ ...s, notice: "새 요약 실행이 접수되었습니다. 처리 상태를 새로고침해 확인해 주세요." }));
    // 접수를 기다리며 사용자가 과거 실행을 골랐다면 그 선택을 덮지 않고 새 실행은 목록에서 확인한다.
    await Promise.all([loadRuns(), ...(selectedVersion === resultVersion ? [selectRun(result.value.runId)] : [])]);
  }
  return { viewId: ++nextViewId, store, loadJds, loadRuns, selectRun, accept, clear,
    activate() {
      // 개발 모드의 effect 정리→재설정 뒤에도 이전 loading 표식이 새 조회를 막지 않는다.
      if (disposed) store.set((s) => ({ ...s, jdState: s.jdState === "loading" ? "idle" : s.jdState }));
      disposed = false;
    },
    selectJd(jdId: string) { if (valid() && !store.get().accepting && store.get().jds.some((jd) => jd.jdId === jdId)) store.set((s) => ({ ...s, selectedJd: jdId })); },
    dispose() { disposed = true; ++jdVersion; ++runVersion; ++resultVersion; } };
}
export type JdSummaryModel = ReturnType<typeof createJdSummaryModel>;
