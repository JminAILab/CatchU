"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSENT_RECORD_FAILED, type ConsentRunResult } from "@/components/ai-consent/ai-consent-flow";
import { useAiConsent } from "@/components/ai-consent/use-ai-consent";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "@/features/profile/use-unsaved-guard";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import type { ClientResult } from "@/lib/api-client";
import type { BlockedSource } from "@/lib/api-response";
import { useUnsavedTraverseGuard } from "@/lib/unsaved-traverse-guard";
import { createViewStore } from "@/lib/view-store";
import { createPresetsApi, type PresetSummary, type PresetsApi } from "@/features/presets/presets-api";
import {
  blockedSourceLines, createPublicationsApi, presetBlockReason, publishDraftErrors, publishFailureLines, publishOutcome, PUBLISH_LIMITS,
  type PublicationsApi, type PublishedLink, type PublishFailure, type PublishRequest,
} from "./publications-api";
import { PresetPickerView, PublishConfirmView, PublishDoneView, PublishFormView, SelectedPresetsView, type StatusLines } from "./publish-view";
import styles from "./publications.module.css";

/** 발행 화면이 부르는 것: 프리셋 목록 하나와 발행(발행 프리셋 U2, 고르기 목록 셋·저장소 목록은 프리셋 편집 화면으로 옮겼다). */
export type PublishClients = { presets: Pick<PresetsApi, "list">; publications: Pick<PublicationsApi, "publishRaw"> };
// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const clients: PublishClients = { presets: createPresetsApi(api.member), publications: createPublicationsApi(api.member) };

/** 화면 밖 의존. 시험은 로그인 식별과 시계를 바꿔 끼운다. */
export type PublishDeps = { session: () => unknown; now: () => number };
const browserDeps: PublishDeps = { session: () => accessTokenStore.get(), now: () => Date.now() };

/** 동의 창 연결(C-04). 403 `AI_CONSENT_REQUIRED`면 창을 열고 [동의] 뒤 같은 요청을 한 번 다시 보낸다(`useAiConsent().run`). */
export type ConsentRunner = (request: () => Promise<ClientResult>) => Promise<ConsentRunResult>;
/** 동의 창 없이 요청만 보내는 실행기(시험·미리보기용). */
export const passthroughConsent: ConsentRunner = async (request) => ({ kind: "result", result: await request(), retried: false });

export type PublishStatus =
  | { kind: "idle" }
  | { kind: "invalid"; messages: string[] }
  | { kind: "submitting" }
  | { kind: "failed"; failure: PublishFailure }
  /** 동의 창을 닫아 발행하지 않았다. */
  | { kind: "declined" }
  /** 동의 기록이 실패해 발행 요청을 보내지 않았다. */
  | { kind: "consent-failed" };

/** 고른 프리셋. 이름은 고를 때 옮겨 담고, 목록을 다시 불러오면 새 이름으로 맞춘다. */
export type SelectedPreset = { presetId: string; name: string };

export type PublishScreenState = {
  /** 프리셋 목록(`GET /v1/presets` 한 번, NFR6.1). 불러오는 중·없음·실패를 구분한다(BR4.4). */
  presets: { state: "loading" | "ready" | "error"; items: PresetSummary[] };
  selected: SelectedPreset[];
  title: string;
  usePassword: boolean;
  password: string;
  step: "edit" | "confirm" | "done";
  status: PublishStatus;
  /** 마지막 막힘의 줄(BR4.6). 다시 불러온 목록(실패하면 그 전 목록)으로 이름을 찾아 만든다. 다음 발행 요청 때 비운다. */
  blockedLines: string[] | null;
  /** 빈도 초과 뒤 [발행]을 다시 누를 수 있는 시각(ms). `Retry-After`가 있을 때만 둔다. */
  retryAt: number | null;
  result: (PublishedLink & { title: string }) | null;
};

/** 이 실패들은 입력을 고쳐야 하므로 편집 단계로 돌아간다(결정 D12). 그 밖은 확인 단계에 남아 다시 시도한다. */
const BACK_TO_EDIT: ReadonlySet<PublishFailure["kind"]> = new Set([
  "confirmation-required", "source-restricted", "catch-private", "extraction-incomplete", "preset-invalid", "source-unavailable", "validation",
]);
/** 이 실패 뒤에는 프리셋 목록을 한 번 다시 불러온다(BR4.6, NFR6.6). 자동으로 다시 발행하지 않는다. */
const RELOAD_AFTER: ReadonlySet<PublishFailure["kind"]> = new Set([
  "confirmation-required", "source-restricted", "catch-private", "extraction-incomplete", "preset-invalid", "source-unavailable",
]);

const blockedOf = (failure: PublishFailure): BlockedSource[] | null => "blockedSources" in failure ? failure.blockedSources : null;

/** 고른 프리셋의 지금 목록 값(없으면 빠짐). 상한 셈에 쓴다. */
export function chosenSummaries(state: Pick<PublishScreenState, "presets" | "selected">): PresetSummary[] {
  return state.selected.map((entry) => state.presets.items.find((item) => item.presetId === entry.presetId))
    .filter((item): item is PresetSummary => item !== undefined);
}

/**
 * 발행 화면 상태 전이(U4 W3, 발행 프리셋 U2 BR4.1~BR4.7, NFR7.5).
 *
 * - 열 때 프리셋 목록을 한 번 부른다. 고르기·순서 바꾸기·빼기는 화면 안에서만 바뀌고 서버에 아무것도 보내지 않는다(NFR6.5).
 * - [다음]에서 제목·비밀번호·프리셋 1~5개를 먼저 검사하고(BR4.1), 확인 단계의 [발행]은 응답까지 버튼을 막는다(BR4.9).
 * - 발행 요청은 `{ title, password?, presetIds }`(고른 순서)다. 201과 응답 모양이 맞을 때만 완료 화면이다.
 * - 막힘(409·추출 미완료 400)·404·400 `presetIds`는 목록을 한 번 다시 불러오고 편집 단계로 돌아간다. 고른 프리셋·제목·비밀번호는 남긴다.
 *   404는 새 목록에 없는 프리셋을 고른 목록에서 뺀다. 막힘은 줄마다 프리셋·자료 이름을 찾아 보인다.
 * - 빈도 초과는 `Retry-After` 동안 [발행]을 막고 자동으로 다시 보내지 않는다. 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createPublishModel(client: PublishClients, consent: ConsentRunner, deps: PublishDeps = browserDeps) {
  const store = createViewStore<PublishScreenState>({
    presets: { state: "loading", items: [] }, selected: [], title: "", usePassword: false, password: "",
    step: "edit", status: { kind: "idle" }, blockedLines: null, retryAt: null, result: null,
  });
  const patch = (next: Partial<PublishScreenState>) => store.set((prev) => ({ ...prev, ...next }));
  let listRequest: AbortController | null = null;

  /** 프리셋 목록을 부른다. 겹치면 나중 요청만 쓴다. 성공하면 새 목록, 실패하면 null을 돌려준다(그 전 목록으로 이름을 찾게). */
  async function loadPresets(): Promise<PresetSummary[] | null | undefined> {
    listRequest?.abort();
    const abort = new AbortController();
    listRequest = abort;
    const session = deps.session();
    patch({ presets: { state: "loading", items: [] } });
    const result = await client.presets.list(abort.signal);
    if (abort.signal.aborted || deps.session() !== session) return undefined;
    if (result.kind === "failed") { patch({ presets: { state: "error", items: [] } }); return null; }
    const items = result.value.presets;
    // 고른 프리셋의 이름을 새 목록으로 맞춘다. 고른 프리셋은 막혀도 고른 목록에 남는다(지원자가 직접 뺀다).
    store.set((prev) => ({
      ...prev, presets: { state: "ready", items },
      selected: prev.selected.map((entry) => ({ ...entry, name: items.find((item) => item.presetId === entry.presetId)?.name ?? entry.name })),
    }));
    return items;
  }

  const editable = () => { const s = store.get(); return s.step === "edit" && s.status.kind !== "submitting"; };
  /** 입력을 바꾸면 검사 거부 안내는 지운다. 서버 실패 안내와 막힘 줄은 다음 발행 요청까지 남긴다. */
  const clearInvalid = (status: PublishStatus): PublishStatus => status.kind === "invalid" ? { kind: "idle" } : status;

  /** 프리셋 고르기 단추(BR4.1~BR4.3). 고른 프리셋이면 빼고, 아니면 막힘 이유가 없고 5개 미만일 때 끝에 더한다. */
  function togglePreset(presetId: string) {
    if (!editable()) return;
    const s = store.get();
    const index = s.selected.findIndex((entry) => entry.presetId === presetId);
    if (index >= 0) { remove(index); return; }
    const preset = s.presets.items.find((item) => item.presetId === presetId);
    const full = s.selected.length >= PUBLISH_LIMITS.presets;
    if (!preset || full || presetBlockReason(preset, chosenSummaries(s), full) !== null) return;
    store.set((prev) => ({ ...prev, selected: [...prev.selected, { presetId, name: preset.name }], status: clearInvalid(prev.status) }));
  }

  function remove(index: number) {
    if (!editable()) return;
    store.set((prev) => index < 0 || index >= prev.selected.length ? prev
      : { ...prev, selected: prev.selected.filter((_, i) => i !== index), status: clearInvalid(prev.status) });
  }

  function move(index: number, delta: -1 | 1) {
    if (!editable()) return;
    store.set((prev) => {
      const target = index + delta;
      if (index < 0 || index >= prev.selected.length || target < 0 || target >= prev.selected.length) return prev;
      const selected = [...prev.selected];
      [selected[index], selected[target]] = [selected[target], selected[index]];
      return { ...prev, selected };
    });
  }

  function setField(next: Partial<Pick<PublishScreenState, "title" | "usePassword" | "password">>) {
    if (!editable()) return;
    store.set((prev) => ({ ...prev, ...next, status: clearInvalid(prev.status) }));
  }

  /** [다음]. 검사를 통과하면 확인 단계로 간다. 통과하지 못하면 요청하지 않고 이유를 보인다. */
  function toConfirm(): boolean {
    if (!editable()) return false;
    const s = store.get();
    const errors = publishDraftErrors({ title: s.title, usePassword: s.usePassword, password: s.password, presetCount: s.selected.length });
    if (errors.length > 0) { patch({ status: { kind: "invalid", messages: errors } }); return false; }
    patch({ step: "confirm", status: { kind: "idle" } });
    return true;
  }

  function backToEdit() {
    const s = store.get();
    if (s.step !== "confirm" || s.status.kind === "submitting") return;
    patch({ step: "edit" });
  }

  function retryWaitSeconds(): number {
    const { retryAt } = store.get();
    return retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - deps.now()) / 1000));
  }

  function canSubmit(): boolean {
    const s = store.get();
    return s.step === "confirm" && s.status.kind !== "submitting" && retryWaitSeconds() === 0;
  }

  function buildRequest(s: PublishScreenState): PublishRequest {
    const body: PublishRequest = { title: s.title.trim(), presetIds: s.selected.map((entry) => entry.presetId) };
    if (s.usePassword) body.password = s.password;
    return body;
  }

  /** 막힘·404·400 `presetIds` 뒤: 목록을 다시 불러와 막힘 줄의 이름을 찾고(실패하면 그 전 목록), 404면 없어진 프리셋을 뺀다. */
  async function afterRejection(failure: PublishFailure, previous: PresetSummary[]) {
    const fresh = await loadPresets();
    if (fresh === undefined) return;
    const blocked = blockedOf(failure);
    if (blocked) patch({ blockedLines: blockedSourceLines(blocked, fresh ?? previous) });
    if (failure.kind === "source-unavailable" && fresh) {
      store.set((prev) => ({ ...prev, selected: prev.selected.filter((entry) => fresh.some((item) => item.presetId === entry.presetId)) }));
    }
  }

  /** [발행]. 동의 창을 거쳐 한 번 보낸다. 성공 응답 뒤에만 완료 화면이고, 실패하면 입력을 그대로 둔다. */
  async function submit() {
    if (!canSubmit()) return;
    const s = store.get();
    const body = buildRequest(s);
    const session = deps.session();
    patch({ status: { kind: "submitting" }, blockedLines: null });
    const outcome = await consent(() => client.publications.publishRaw(body));
    if (deps.session() !== session) return;
    if (outcome.kind === "declined") { patch({ status: { kind: "declined" } }); return; }
    if (outcome.kind === "consent-failed") { patch({ status: { kind: "consent-failed" } }); return; }
    const result = publishOutcome(outcome.result);
    if (result.kind === "ok") {
      patch({ step: "done", status: { kind: "idle" }, retryAt: null, result: { ...result.value, title: body.title } });
      return;
    }
    const { failure } = result;
    const retryAt = failure.kind === "rate-limited" && failure.retryAfterSeconds !== undefined ? deps.now() + failure.retryAfterSeconds * 1000 : null;
    const blocked = blockedOf(failure);
    // 다시 불러오기 전에 지금 목록으로 먼저 줄을 만든다. 다시 불러온 뒤 새 목록으로 바꾼다.
    patch({
      status: { kind: "failed", failure }, retryAt, step: BACK_TO_EDIT.has(failure.kind) ? "edit" : "confirm",
      blockedLines: blocked ? blockedSourceLines(blocked, store.get().presets.items) : null,
    });
    if (RELOAD_AFTER.has(failure.kind)) await afterRejection(failure, s.presets.items);
  }

  /** 완료 뒤 [새로 발행]. 목록은 그대로 두고 입력만 비운다. */
  function reset() {
    if (store.get().step !== "done") return;
    patch({ selected: [], title: "", usePassword: false, password: "", step: "edit", status: { kind: "idle" }, blockedLines: null, result: null });
  }

  return {
    store,
    /** 화면을 열 때 한 번: 프리셋 목록을 부른다(NFR6.1). */
    open: () => loadPresets().then(() => undefined),
    loadPresets: () => loadPresets().then(() => undefined),
    togglePreset, remove,
    moveUp: (index: number) => move(index, -1),
    moveDown: (index: number) => move(index, 1),
    setTitle: (title: string) => setField({ title }),
    setUsePassword: (usePassword: boolean) => setField(usePassword ? { usePassword } : { usePassword, password: "" }),
    setPassword: (password: string) => setField({ password }),
    toConfirm, backToEdit, submit, reset, retryWaitSeconds, canSubmit,
    /** 저장하지 않은 입력(이탈 확인 대상). 완료 뒤에는 없다. */
    isDirty: () => { const s = store.get(); return s.step !== "done" && (s.selected.length > 0 || s.title !== "" || s.password !== ""); },
    dispose: () => { listRequest?.abort(); },
  };
}

/** 상태 줄. 검사 거부·실패는 alert, 동의 관련 안내도 alert로 읽힌다. 막힘이면 막힌 프리셋·자료 줄을 잇는다. */
export function publishStatusLines(status: PublishStatus, blockedLines: readonly string[] | null = null): StatusLines {
  switch (status.kind) {
    case "idle": case "submitting": return null;
    case "invalid": return { tone: "alert", lines: status.messages };
    case "failed": return { tone: "alert", lines: [...publishFailureLines(status.failure), ...(blockedLines ?? [])] };
    case "declined": return { tone: "alert", lines: ["발행되지 않았습니다", "외부 AI 전송에 동의하지 않아 발행하지 않았습니다. 고른 프리셋과 입력은 그대로입니다."] };
    case "consent-failed": return { tone: "alert", lines: ["발행되지 않았습니다", CONSENT_RECORD_FAILED] };
  }
}

/** 회원 가드((member) 레이아웃) 안의 발행 화면(U4 W3). */
export function PublishPage() {
  return <PublishScreen api={clients} />;
}

/** 고르기·입력·확인·완료를 한 화면에 둔다. 상태 전이는 `createPublishModel`이 맡고 동의 창은 `useAiConsent`가 연다. */
export function PublishScreen({ api: client, deps, consent }: { api: PublishClients; deps?: PublishDeps; consent?: ConsentRunner }) {
  const consentHook = useAiConsent();
  const [model] = useState(() => createPublishModel(client, consent ?? consentHook.run, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  // 열 때마다 프리셋 목록을 새로 불러온다.
  useEffect(() => { void model.open(); return () => model.dispose(); }, [model]);

  const dirty = model.isDirty();
  useUnsavedGuard(dirty);
  useUnsavedTraverseGuard(dirty, UNSAVED_MESSAGE);
  useUnsavedChanges(dirty);

  // 빈도 초과의 남은 초를 보이고 시간이 지나면 [발행]을 풀기 위해 1초마다 다시 그린다. 자동으로 다시 보내지는 않는다.
  const [, setTick] = useState(0);
  const lockSeconds = model.retryWaitSeconds();
  const locked = lockSeconds > 0;
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [locked, view.retryAt]);

  const submitting = view.status.kind === "submitting";
  const statusLines = publishStatusLines(view.status, view.blockedLines);
  return (
    <main className={styles.page}>
      <h1>발행</h1>
      <p className={styles.lead}>프리셋을 골라 발행 시각의 내용을 고정한 발행본과 링크를 만듭니다.</p>
      {consentHook.dialog}
      {view.step === "done" && view.result ? <PublishDoneView result={view.result} onNew={model.reset} />
        : view.step === "confirm" ? (
          <PublishConfirmView presets={view.selected} title={view.title} usePassword={view.usePassword} submitting={submitting}
            lockSeconds={lockSeconds} statusLines={statusLines} onBack={model.backToEdit} onSubmit={() => { void model.submit(); }} />
        ) : (
          <div className={styles.layout}>
            <PresetPickerView presets={view.presets} selected={view.selected} disabled={submitting}
              onRetry={() => { void model.loadPresets(); }} onToggle={model.togglePreset} />
            <div className={styles.column}>
              <SelectedPresetsView presets={view.selected} disabled={submitting}
                onMoveUp={model.moveUp} onMoveDown={model.moveDown} onRemove={model.remove} />
              <PublishFormView title={view.title} usePassword={view.usePassword} password={view.password} disabled={submitting} statusLines={statusLines}
                onTitle={model.setTitle} onUsePassword={model.setUsePassword} onPassword={model.setPassword} onNext={() => { model.toConfirm(); }} />
            </div>
          </div>
        )}
    </main>
  );
}
