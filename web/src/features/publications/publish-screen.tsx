"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSENT_RECORD_FAILED, type ConsentRunResult } from "@/components/ai-consent/ai-consent-flow";
import { useAiConsent } from "@/components/ai-consent/use-ai-consent";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "@/features/profile/use-unsaved-guard";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import type { ClientResult } from "@/lib/api-client";
import { useUnsavedTraverseGuard } from "@/lib/unsaved-traverse-guard";
import { createViewStore } from "@/lib/view-store";
import { createCatchApi, type CatchApi } from "@/features/assets/catch-api";
import { createMaterialsApi, type MaterialsApi } from "@/features/materials/materials-api";
import {
  createPublicationsApi, publishDraftErrors, publishFailureLines, publishOutcome, PUBLISH_LIMITS,
  type PublicationsApi, type PublishedLink, type PublishFailure, type PublishRequest,
} from "./publications-api";
import { catchSourceOf, emptySourceList, type CatchSource, type MaterialSource, type SelectedItem, type SourceList } from "./publish-sources";
import { PublishConfirmView, PublishDoneView, PublishFormView, SelectedListView, SourcePickerView, type FlaggedCatches, type StatusLines } from "./publish-view";
import styles from "./publications.module.css";

export type PublishClients = { catches: CatchApi; materials: MaterialsApi; publications: PublicationsApi };
// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const clients: PublishClients = { catches: createCatchApi(api.member), materials: createMaterialsApi(api.member), publications: createPublicationsApi(api.member) };

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

export type PublishScreenState = {
  catches: SourceList<CatchSource>;
  materials: SourceList<MaterialSource>;
  selected: SelectedItem[];
  title: string;
  usePassword: boolean;
  password: string;
  step: "edit" | "confirm" | "done";
  status: PublishStatus;
  /** 마지막 409가 가리킨 Catch. 다음 발행 요청 때 비운다. */
  flagged: FlaggedCatches;
  /** 빈도 초과 뒤 [발행]을 다시 누를 수 있는 시각(ms). `Retry-After`가 있을 때만 둔다. */
  retryAt: number | null;
  result: (PublishedLink & { title: string }) | null;
};

/** 이 실패들은 입력을 고쳐야 하므로 편집 단계로 돌아간다(결정 D12). 그 밖은 확인 단계에 남아 다시 시도한다. */
const BACK_TO_EDIT: ReadonlySet<PublishFailure["kind"]> = new Set(["confirmation-required", "source-restricted", "source-unavailable", "validation"]);

const CATCH_LIST_ERROR = "Catch 목록을 불러오지 못했습니다. Catch가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
const MATERIAL_LIST_ERROR = "텍스트 자료 목록을 불러오지 못했습니다. 자료가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";

type PageFetch<T> = (cursor: string | null, signal?: AbortSignal) => Promise<{ kind: "ok"; items: T[]; nextCursor: string | null } | { kind: "failed" }>;

/** 목록 하나의 첫 쪽·다음 쪽 조회. 늦게 온 응답과 로그인이 바뀐 뒤의 응답은 반영하지 않는다(materials 화면과 같은 규칙). */
function createSourceLoader<T>(fetchPage: PageFetch<T>, read: () => SourceList<T>, write: (list: SourceList<T>) => void, errorText: string, deps: PublishDeps) {
  let request: AbortController | null = null;
  let generation = 0;
  return {
    async load() {
      request?.abort();
      const abort = new AbortController();
      request = abort;
      ++generation;
      const session = deps.session();
      write(emptySourceList<T>());
      const result = await fetchPage(null, abort.signal);
      if (abort.signal.aborted || deps.session() !== session) return;
      write(result.kind === "failed"
        ? { state: "error", items: [], nextCursor: null, moreState: "idle", errorText }
        : { state: "ready", items: result.items, nextCursor: result.nextCursor, moreState: "idle" });
    },
    async loadMore() {
      const list = read();
      if (list.state !== "ready" || list.nextCursor === null || list.moreState === "loading") return;
      write({ ...list, moreState: "loading" });
      const session = deps.session();
      const mine = generation;
      const result = await fetchPage(list.nextCursor);
      if (mine !== generation || deps.session() !== session) return;
      const current = read();
      if (result.kind === "failed") { write({ ...current, moreState: "error" }); return; }
      write({ ...current, moreState: "idle", items: [...current.items, ...result.items], nextCursor: result.nextCursor });
    },
    dispose: () => request?.abort(),
  };
}

/**
 * 발행 화면 상태 전이(U4 W3, BR4.1~BR4.9·BR5.6, NFR7.5).
 *
 * - 고르기·순서 바꾸기·빼기는 화면 안에서만 바뀌고 서버에 아무것도 쓰지 않는다(BR4.4).
 * - [다음]에서 제목·비밀번호·항목 수를 먼저 검사하고(BR4.1·BR4.5), 확인 단계의 [발행]은 응답까지 버튼을 막는다(BR4.9).
 * - 201과 응답 모양이 맞을 때만 완료 화면이다. 실패하면 고른 항목·순서·제목·비밀번호 입력을 그대로 두고 안내만 바꾼다.
 * - 409는 `details.catchIds`의 Catch를 표시하고 편집 단계로 돌아간다. 빈도 초과는 `Retry-After` 동안 [발행]을 막고 자동으로 다시 보내지 않는다.
 * - 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createPublishModel(client: PublishClients, consent: ConsentRunner, deps: PublishDeps = browserDeps) {
  const store = createViewStore<PublishScreenState>({
    catches: emptySourceList(), materials: emptySourceList(), selected: [], title: "", usePassword: false, password: "",
    step: "edit", status: { kind: "idle" }, flagged: null, retryAt: null, result: null,
  });
  const patch = (next: Partial<PublishScreenState>) => store.set((prev) => ({ ...prev, ...next }));

  const catches = createSourceLoader<CatchSource>(async (cursor, signal) => {
    const result = await client.catches.list("", cursor, signal);
    return result.kind === "success"
      ? { kind: "ok", items: result.data.items.map(catchSourceOf), nextCursor: result.data.page.nextCursor }
      : { kind: "failed" };
  }, () => store.get().catches, (list) => patch({ catches: list }), CATCH_LIST_ERROR, deps);

  const materials = createSourceLoader<MaterialSource>(async (cursor, signal) => {
    const result = await client.materials.list(cursor, signal);
    return result.kind === "ok" ? { kind: "ok", items: result.value.items, nextCursor: result.value.page.nextCursor } : { kind: "failed" };
  }, () => store.get().materials, (list) => patch({ materials: list }), MATERIAL_LIST_ERROR, deps);

  const editable = () => { const s = store.get(); return s.step === "edit" && s.status.kind !== "submitting"; };
  /** 입력을 바꾸면 검사 거부 안내는 지운다. 서버 실패 안내와 409 표시는 다음 발행 요청까지 남긴다. */
  const clearInvalid = (status: PublishStatus): PublishStatus => status.kind === "invalid" ? { kind: "idle" } : status;

  function add(item: SelectedItem) {
    if (!editable()) return;
    const { selected } = store.get();
    if (selected.length >= PUBLISH_LIMITS.items) return;
    if (selected.some((entry) => entry.kind === item.kind && entry.sourceId === item.sourceId)) return;
    store.set((prev) => ({ ...prev, selected: [...prev.selected, item], status: clearInvalid(prev.status) }));
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

  function toggleCatch(catchId: string) {
    const { selected, catches: list } = store.get();
    const index = selected.findIndex((entry) => entry.kind === "CATCH" && entry.sourceId === catchId);
    if (index >= 0) { remove(index); return; }
    const source = list.items.find((item) => item.catchId === catchId);
    if (!source || !source.eligible) return;
    add({ kind: "CATCH", sourceId: catchId, title: source.title, visibility: source.visibility });
  }

  function toggleMaterial(textMaterialId: string) {
    const { selected, materials: list } = store.get();
    const index = selected.findIndex((entry) => entry.kind === "TEXT_MATERIAL" && entry.sourceId === textMaterialId);
    if (index >= 0) { remove(index); return; }
    const source = list.items.find((item) => item.textMaterialId === textMaterialId);
    if (!source) return;
    add({ kind: "TEXT_MATERIAL", sourceId: textMaterialId, title: source.title, visibility: null });
  }

  function setField(next: Partial<Pick<PublishScreenState, "title" | "usePassword" | "password">>) {
    if (!editable()) return;
    store.set((prev) => ({ ...prev, ...next, status: clearInvalid(prev.status) }));
  }

  /** [다음]. 검사를 통과하면 확인 단계로 간다. 통과하지 못하면 요청하지 않고 이유를 보인다. */
  function toConfirm(): boolean {
    if (!editable()) return false;
    const s = store.get();
    const errors = publishDraftErrors({ title: s.title, usePassword: s.usePassword, password: s.password, itemCount: s.selected.length });
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
    const body: PublishRequest = { title: s.title.trim(), items: s.selected.map(({ kind, sourceId }) => ({ kind, sourceId })) };
    if (s.usePassword) body.password = s.password;
    return body;
  }

  /** [발행]. 동의 창을 거쳐 한 번 보낸다. 성공 응답 뒤에만 완료 화면이고, 실패하면 입력을 그대로 둔다. */
  async function submit() {
    if (!canSubmit()) return;
    const s = store.get();
    const body = buildRequest(s);
    const session = deps.session();
    patch({ status: { kind: "submitting" }, flagged: null });
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
    const flagged: FlaggedCatches = failure.kind === "confirmation-required" || failure.kind === "source-restricted"
      ? { catchIds: failure.catchIds, reason: failure.kind } : null;
    const retryAt = failure.kind === "rate-limited" && failure.retryAfterSeconds !== undefined ? deps.now() + failure.retryAfterSeconds * 1000 : null;
    patch({ status: { kind: "failed", failure }, flagged, retryAt, step: BACK_TO_EDIT.has(failure.kind) ? "edit" : "confirm" });
  }

  /** 완료 뒤 [새로 발행]. 목록은 그대로 두고 입력만 비운다. */
  function reset() {
    if (store.get().step !== "done") return;
    patch({ selected: [], title: "", usePassword: false, password: "", step: "edit", status: { kind: "idle" }, flagged: null, result: null });
  }

  return {
    store,
    loadSources: () => Promise.all([catches.load(), materials.load()]).then(() => undefined),
    loadMoreCatches: catches.loadMore,
    loadMoreMaterials: materials.loadMore,
    toggleCatch, toggleMaterial, remove,
    moveUp: (index: number) => move(index, -1),
    moveDown: (index: number) => move(index, 1),
    setTitle: (title: string) => setField({ title }),
    setUsePassword: (usePassword: boolean) => setField(usePassword ? { usePassword } : { usePassword, password: "" }),
    setPassword: (password: string) => setField({ password }),
    toConfirm, backToEdit, submit, reset, retryWaitSeconds, canSubmit,
    /** 저장하지 않은 입력(이탈 확인 대상). 완료 뒤에는 없다. */
    isDirty: () => { const s = store.get(); return s.step !== "done" && (s.selected.length > 0 || s.title !== "" || s.password !== ""); },
    dispose: () => { catches.dispose(); materials.dispose(); },
  };
}

/** 상태 줄. 검사 거부·실패는 alert, 동의 관련 안내도 alert로 읽힌다. */
export function publishStatusLines(status: PublishStatus): StatusLines {
  switch (status.kind) {
    case "idle": case "submitting": return null;
    case "invalid": return { tone: "alert", lines: status.messages };
    case "failed": return { tone: "alert", lines: publishFailureLines(status.failure) };
    case "declined": return { tone: "alert", lines: ["발행되지 않았습니다", "외부 AI 전송에 동의하지 않아 발행하지 않았습니다. 고른 항목과 입력은 그대로입니다."] };
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
  useEffect(() => { void model.loadSources(); return () => model.dispose(); }, [model]);

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
  const statusLines = publishStatusLines(view.status);
  return (
    <main className={styles.page}>
      <h1>발행</h1>
      <p className={styles.lead}>본인 Catch와 텍스트 자료를 골라 발행 시각의 내용을 고정한 발행본과 링크를 만듭니다.</p>
      {consentHook.dialog}
      {view.step === "done" && view.result ? <PublishDoneView result={view.result} onNew={model.reset} />
        : view.step === "confirm" ? (
          <PublishConfirmView items={view.selected} title={view.title} usePassword={view.usePassword} submitting={submitting}
            lockSeconds={lockSeconds} statusLines={statusLines} onBack={model.backToEdit} onSubmit={() => { void model.submit(); }} />
        ) : (
          <div className={styles.layout}>
            <SourcePickerView catches={view.catches} materials={view.materials} selected={view.selected} flagged={view.flagged} disabled={submitting}
              onRetry={() => { void model.loadSources(); }}
              onMoreCatches={() => { void model.loadMoreCatches(); }}
              onMoreMaterials={() => { void model.loadMoreMaterials(); }}
              onToggleCatch={model.toggleCatch} onToggleMaterial={model.toggleMaterial} />
            <div className={styles.column}>
              <SelectedListView items={view.selected} flagged={view.flagged} disabled={submitting}
                onMoveUp={model.moveUp} onMoveDown={model.moveDown} onRemove={model.remove} />
              <PublishFormView title={view.title} usePassword={view.usePassword} password={view.password} disabled={submitting} statusLines={statusLines}
                onTitle={model.setTitle} onUsePassword={model.setUsePassword} onPassword={model.setPassword} onNext={() => { model.toConfirm(); }} />
            </div>
          </div>
        )}
    </main>
  );
}
