import { createIdempotencyKeyHolder, isSettledResult, type IdempotencyKeyHolder } from "../../lib/idempotency.ts";
import type { ShareCreateBody, ShareLink, ShareLinkApi, ShareLinkFailure, ShareLinkResult } from "./share-link-api.ts";

/**
 * W6 공유 링크 관리(L03)·발행(L01)·발행 완료(L02) 화면의 상태(#149).
 * 화면 표시와 분리해 늦게 도착한 응답·중복 제출·응답 불명을 한 곳에서 다룬다.
 * 문구·분기는 공유링크 흐름 초안 §4.1~§4.3, §4.8과 API 명세 v1의 링크 규칙을 따른다.
 */

/** 유효 링크 한도(계약: 사용자별 유효 링크 최대 5개). */
export const ACTIVE_LINK_LIMIT = 5;

export type Notice = { tone: "info" | "success" | "error"; text: string };

export type ListSnapshot = {
  status: "loading" | "ready" | "error";
  items: readonly ShareLink[];
  nextCursor: string | null;
  /** 목록을 이미 보여 준 상태에서 다시 조회 중. 상태에 따라 달라지는 행동(복사·중단)을 잠시 막는다. */
  refreshing: boolean;
  /** 다시 조회에 실패해 보이는 목록이 마지막 확인 기준이다. 상태 의존 행동을 막는다. */
  stale: boolean;
  more: "idle" | "loading" | "error";
};

export type FormAction = "to-list";
export type FormSnapshot = {
  open: boolean;
  title: string;
  usePassword: boolean;
  password: string;
  /** editing: 입력 가능 / submitting: 요청 중 / unknown: 응답 불명(같은 키·본문으로만 다시 발행) / issued: L02 */
  phase: "editing" | "submitting" | "unknown" | "issued";
  /** 불명 상태에서 [새로 작성]을 눌러 안내를 보는 중. [새로 작성 계속]을 눌러야 붙잡은 요청을 놓는다. */
  discardAsked: boolean;
  fieldErrors: { title?: string; password?: string };
  message: (Notice & { action?: FormAction }) | null;
  issued: ShareLink | null;
};

export type StopSnapshot = {
  linkId: string;
  title: string;
  url: string;
  /** confirm: 확인 상자 / requesting: 요청 중 / failed: 실패 확정 / unknown: 응답 불명 */
  phase: "confirm" | "requesting" | "failed" | "unknown";
  message: string | null;
} | null;

export type ShareLinksSnapshot = {
  list: ListSnapshot;
  form: FormSnapshot;
  stop: StopSnapshot;
  /** 응답이 불명이었던 중단 대상. 목록을 다시 확인하기 전에는 같은 링크의 중단을 다시 보내지 않는다. */
  unresolvedStops: readonly string[];
  /**
   * 결과를 확인하지 못한 발급 요청. 발행 화면을 닫아도 같은 키·본문을 붙잡아 두며, 다시 열면 불명 상태로 이어진다.
   * 다시 보낸 요청의 응답이 확정되거나 사용자가 안내를 본 뒤 [새로 작성 계속]을 고를 때만 풀린다.
   * 목록의 같은 제목 링크는 기존 링크나 다른 탭의 발급일 수 있어 후보로만 보여 주고, 이것으로 요청을 놓지 않는다.
   */
  pendingIssue: { title: string } | null;
  notice: Notice | null;
};

const EMPTY_FORM: FormSnapshot = {
  open: false, title: "", usePassword: false, password: "", phase: "editing", discardAsked: false, fieldErrors: {}, message: null, issued: null,
};

const INITIAL: ShareLinksSnapshot = {
  list: { status: "loading", items: [], nextCursor: null, refreshing: false, stale: false, more: "idle" },
  form: EMPTY_FORM,
  stop: null,
  unresolvedStops: [],
  pendingIssue: null,
  notice: null,
};

const TITLE_REQUIRED = "링크 제목을 입력해 주세요.";
const PASSWORD_REQUIRED = "비밀번호를 입력하거나 비밀번호 사용을 해제해 주세요.";
const AUTH_TEXT = "로그인이 필요합니다. 다시 로그인한 뒤 확인해 주세요.";
const UNKNOWN_TEXT = "발행 여부를 확인하지 못했습니다. [다시 발행]은 같은 요청을 다시 보내 결과를 확인합니다. 이미 처리된 요청이면 새 링크를 만들지 않고 그 결과를 돌려받습니다.";
export const DISCARD_WARNING = "이전 요청은 이미 발급됐을 수 있습니다. 목록을 확인한 뒤 새로 작성해 주세요. 새로 작성하면 새 요청으로 보내며, 이전 요청은 자동으로 다시 보내지 않습니다.";

/** 서버가 판정한 입력 오류(400 VALIDATION_FAILED)를 필드별 안내로 바꾼다. 입력값은 담지 않는다. */
export function violationText(field: string, reason: string): { field: "title" | "password" | null; text: string } {
  if (field === "title") {
    if (reason === "isNotEmpty") return { field, text: TITLE_REQUIRED };
    if (reason === "maxLength") return { field, text: "링크 제목이 허용 길이를 넘었습니다. 줄여서 다시 입력해 주세요." };
    return { field, text: "링크 제목을 확인해 주세요." };
  }
  if (field === "password") {
    if (reason === "isNotEmpty") return { field, text: "비밀번호를 입력해 주세요." };
    if (reason === "minLength" || reason === "maxLength") return { field, text: "비밀번호 길이를 확인해 주세요." };
    return { field, text: "비밀번호를 확인해 주세요." };
  }
  return { field: null, text: "입력값을 확인해 주세요." };
}

/** 응답 불명: 서버가 처리했는지 알 수 없는 결과(조회 실패·5xx). */
const isUnknown = (result: ShareLinkFailure) => result.kind === "lookup-failed" || result.status >= 500;

export type ShareLinksStoreOptions = {
  keys?: IdempotencyKeyHolder;
  now?: () => number;
};

export function createShareLinksStore(api: ShareLinkApi, options: ShareLinksStoreOptions = {}) {
  const keys = options.keys ?? createIdempotencyKeyHolder();
  let state = INITIAL;
  const listeners = new Set<() => void>();
  /** dispose 때 올려, 그 전에 시작한 요청의 늦은 응답을 버린다(StrictMode의 effect 재시작에도 다시 쓸 수 있게). */
  let generation = 0;
  let listVersion = 0;
  let listAbort: AbortController | undefined;
  /** 응답 불명 뒤 다시 보낼 본문. 같은 키에는 같은 본문만 보낸다. */
  let pendingBody: ShareCreateBody | null = null;

  const emit = (patch: Partial<ShareLinksSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const setList = (patch: Partial<ListSnapshot>) => emit({ list: { ...state.list, ...patch } });
  const setForm = (patch: Partial<FormSnapshot>) => emit({ form: { ...state.form, ...patch } });

  async function safely<T>(call: () => Promise<ShareLinkResult<T>>): Promise<ShareLinkResult<T>> {
    try { return await call(); } catch { return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }; }
  }

  /** 첫 페이지부터 다시 조회한다. 이미 목록이 있으면 그 목록을 유지한 채 갱신한다. */
  async function load(): Promise<void> {
    const version = ++listVersion;
    const gen = generation;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    const hasList = state.list.status === "ready";
    setList(hasList ? { refreshing: true } : { status: "loading", items: [], nextCursor: null, stale: false, more: "idle" });
    const result = await safely(() => api.list(null, abort.signal));
    if (gen !== generation || version !== listVersion) return;
    if (result.kind === "success") {
      setList({ status: "ready", items: result.data.items, nextCursor: result.data.nextCursor, refreshing: false, stale: false, more: "idle" });
      // 목록을 다시 확인했으므로 응답 불명이었던 중단의 재요청 차단을 푼다. 현재 상태는 목록이 보여 준다.
      emit({ unresolvedStops: [] });
      // 결과를 모르는 발급 요청은 목록으로 놓지 않는다. 같은 제목 링크가 있어도 기존 링크·다른 탭의 발급일 수 있다.
      // 결과 확정은 같은 키·본문으로 다시 보낸 응답(200 그 링크 / 409 제목 중복 등)으로만 한다.
      return;
    }
    if (hasList) setList({ refreshing: false, stale: true });
    else setList({ status: "error", items: [], nextCursor: null });
  }

  async function loadMore(): Promise<void> {
    const { status, nextCursor, more, refreshing } = state.list;
    if (status !== "ready" || nextCursor === null || more === "loading" || refreshing) return;
    const version = listVersion;
    const gen = generation;
    setList({ more: "loading" });
    const result = await safely(() => api.list(nextCursor, listAbort?.signal));
    if (gen !== generation || version !== listVersion) return;
    if (result.kind !== "success") return setList({ more: "error" });
    const seen = new Set(state.list.items.map((item) => item.linkId));
    setList({
      items: [...state.list.items, ...result.data.items.filter((item) => !seen.has(item.linkId))],
      nextCursor: result.data.nextCursor,
      more: "idle",
    });
  }

  /** 모든 페이지를 받았을 때만 유효 링크 수를 안다. 다 받지 못했으면 null(추정하지 않는다). */
  function activeCount(): number | null {
    const { status, nextCursor, items, stale } = state.list;
    if (status !== "ready" || nextCursor !== null || stale) return null;
    return items.filter((item) => item.state === "ACTIVE").length;
  }

  /**
   * 결과를 모르는 발급 요청과 제목이 같은 목록 행. 이 요청의 결과일 수도, 기존 링크·다른 탭의 발급일 수도 있어 후보로만 쓴다.
   * 서버는 제목을 trim해 비교하고, 화면도 trim한 제목을 보내므로 그대로 비교한다.
   */
  function issueCandidates(): readonly string[] {
    const pending = pendingBody;
    if (!pending) return [];
    return state.list.items.filter((item) => item.title === pending.title).map((item) => item.linkId);
  }

  function openForm() {
    if (state.form.open) return;
    const pending = pendingBody;
    if (pending) {
      // 결과를 모르는 요청이 남아 있으면 같은 키·본문의 불명 상태로 다시 연다. 새 키로 같은 요청을 보내지 않는다.
      emit({
        form: {
          ...EMPTY_FORM, open: true, phase: "unknown", title: pending.title,
          usePassword: pending.password !== undefined, password: pending.password ?? "",
          message: { tone: "error", text: UNKNOWN_TEXT },
        },
        notice: null,
      });
      return;
    }
    keys.reset();
    emit({ form: { ...EMPTY_FORM, open: true }, notice: null });
  }

  /** 발행 화면을 닫고 목록을 다시 확인한다. 요청 중에는 닫지 않는다. 응답 불명이었으면 그 요청은 목록에서 확인한다. */
  function closeForm() {
    if (!state.form.open || state.form.phase === "submitting") return;
    const wasUnknown = state.form.phase === "unknown" && pendingBody !== null;
    const issued = state.form.phase === "issued";
    // 결과를 모르는 요청은 닫아도 키·본문을 버리지 않는다(목록 조회가 실패해도 같은 키로만 다시 보낼 수 있게).
    if (!wasUnknown) {
      keys.reset();
      pendingBody = null;
    }
    emit({
      form: EMPTY_FORM,
      pendingIssue: wasUnknown && pendingBody ? { title: pendingBody.title } : null,
      // 불명 요청의 안내는 목록 위 배너가 맡는다(후보 행 수와 [요청 다시 보기]).
      notice: null,
    });
    if (wasUnknown || issued || state.list.status !== "ready") void load();
  }

  function editable() {
    return state.form.open && state.form.phase === "editing";
  }
  function setTitle(title: string) {
    if (editable()) setForm({ title, fieldErrors: { ...state.form.fieldErrors, title: undefined } });
  }
  function setUsePassword(usePassword: boolean) {
    if (editable()) setForm({ usePassword, password: usePassword ? state.form.password : "", fieldErrors: { ...state.form.fieldErrors, password: undefined } });
  }
  function setPassword(password: string) {
    if (editable()) setForm({ password, fieldErrors: { ...state.form.fieldErrors, password: undefined } });
  }

  async function send(body: ShareCreateBody, resend: boolean): Promise<void> {
    // 요청을 보내기 전에 발행 중 표시와 입력·버튼 차단을 먼저 적용한다(초안 §4.1, F 2026-09-15).
    setForm({ phase: "submitting", discardAsked: false, message: null, fieldErrors: {} });
    const key = keys.current();
    const gen = generation;
    const result = await safely(() => api.create(body, key));
    if (gen !== generation) return;
    if (result.kind === "success") {
      keys.reset();
      pendingBody = null;
      emit({ pendingIssue: null });
      setForm({ phase: "issued", issued: result.data, password: "", message: null });
      return;
    }
    if (isSettledResult(result)) {
      keys.reset();
      pendingBody = null;
      emit({ pendingIssue: null });
    }
    if (isUnknown(result)) {
      emit({ pendingIssue: { title: body.title } });
      setForm({ phase: "unknown", message: { tone: "error", text: UNKNOWN_TEXT } });
      return;
    }
    // 여기부터는 서버가 판정한 거부(4xx)다.
    if (result.kind === "api-error" && result.status === 401) {
      // 인증 단계에서 거부돼 이 요청은 처리되지 않았다. 다시 보내던 요청이면 앞선 요청의 결과는 여전히 모른다.
      setForm({ phase: resend ? "unknown" : "editing", message: { tone: "error", text: AUTH_TEXT } });
      if (!resend) {
        keys.reset();
        pendingBody = null;
      }
      return;
    }
    const code = result.kind === "api-error" ? result.code : "";
    if (code === "VALIDATION_FAILED" && result.kind === "api-error") {
      const fieldErrors: FormSnapshot["fieldErrors"] = {};
      let general: string | null = null;
      for (const { field, reason } of result.details?.violations ?? []) {
        const mapped = violationText(field, reason);
        if (mapped.field) fieldErrors[mapped.field] ??= mapped.text;
        else general = mapped.text;
      }
      if (!fieldErrors.title && !fieldErrors.password) general ??= "입력값을 확인해 주세요.";
      setForm({ phase: "editing", fieldErrors, message: general ? { tone: "error", text: general } : null });
      return;
    }
    if (code === "LINK_TITLE_CONFLICT") {
      // 앞선 요청이 이미 성공했을 수도 있으므로 ‘발행 실패’라고 하지 않는다(초안 §4.8).
      setForm({ phase: "editing", message: { tone: "info", text: "같은 제목의 유효한 링크가 이미 있습니다. 공유 링크 목록에서 제목과 상태를 확인해 주세요.", action: "to-list" } });
      return;
    }
    if (code === "LINK_LIMIT_REACHED") {
      setForm({ phase: "editing", message: { tone: "error", text: `유효 링크는 ${ACTIVE_LINK_LIMIT}개까지입니다. 사용하지 않는 링크를 중단한 뒤 발행해 주세요.`, action: "to-list" } });
      return;
    }
    if (code === "IDEMPOTENCY_CONFLICT") {
      setForm({ phase: "editing", message: { tone: "error", text: "같은 발행 요청의 내용이 달라 처리하지 못했습니다. 공유 링크 목록을 확인한 뒤 다시 발행해 주세요.", action: "to-list" } });
      return;
    }
    setForm({ phase: "editing", message: { tone: "error", text: "링크를 발행하지 못했습니다. 입력과 링크 목록을 확인한 뒤 다시 발행해 주세요." } });
  }

  async function submit(): Promise<void> {
    if (!editable()) return;
    const title = state.form.title.trim();
    const fieldErrors: FormSnapshot["fieldErrors"] = {};
    if (title.length === 0) fieldErrors.title = TITLE_REQUIRED;
    if (state.form.usePassword && state.form.password.length === 0) fieldErrors.password = PASSWORD_REQUIRED;
    if (fieldErrors.title || fieldErrors.password) return setForm({ fieldErrors, message: null });
    // 비밀번호는 trim·정규화하지 않는다(계약). 제목은 서버도 앞뒤 공백을 빼고 비교한다.
    const body: ShareCreateBody = state.form.usePassword ? { title, password: state.form.password } : { title };
    pendingBody = body;
    await send(body, false);
  }

  /** 응답 불명 뒤 [다시 발행]: 같은 키·같은 본문으로만 보낸다. 새 키로 자동 재요청하지 않는다. */
  async function resend(): Promise<void> {
    if (!state.form.open || state.form.phase !== "unknown" || pendingBody === null) return;
    await send(pendingBody, true);
  }

  /** 불명 상태의 [새로 작성]: 바로 버리지 않고, 이전 요청이 이미 발급됐을 수 있다는 안내를 먼저 보여 준다. */
  function askDiscard() {
    if (!state.form.open || state.form.phase !== "unknown" || state.form.discardAsked) return;
    setForm({ discardAsked: true, message: { tone: "error", text: DISCARD_WARNING } });
  }

  /** 안내에서 [취소]: 같은 키·본문의 불명 상태로 돌아간다. */
  function cancelDiscard() {
    if (!state.form.open || state.form.phase !== "unknown" || !state.form.discardAsked) return;
    setForm({ discardAsked: false, message: { tone: "error", text: UNKNOWN_TEXT } });
  }

  /**
   * 안내를 본 뒤 [새로 작성 계속]: 붙잡은 키·본문을 버리고 입력을 고칠 수 있게 한다.
   * 이전 요청은 취소되지 않으며 자동으로 다시 보내지도 않는다. 다음 [링크 발행]은 새 키로 보낸다.
   * 이전 요청이 처리됐다면 같은 제목은 서버가 제목 중복으로 거부하므로 같은 제목의 링크가 두 번 생기지 않는다.
   */
  function discardPending() {
    if (!state.form.open || state.form.phase !== "unknown" || !state.form.discardAsked) return;
    keys.reset();
    pendingBody = null;
    emit({ pendingIssue: null });
    setForm({
      phase: "editing",
      discardAsked: false,
      message: { tone: "info", text: "새 요청으로 작성합니다. [링크 발행]을 누르면 새 요청으로 보냅니다. 이전 요청이 이미 발급됐다면 같은 제목은 ‘이미 있음’으로 안내됩니다." },
    });
  }

  function canStop(link: ShareLink): boolean {
    const { status, refreshing, stale } = state.list;
    return status === "ready" && !refreshing && !stale && link.state === "ACTIVE"
      && state.stop === null && !state.unresolvedStops.includes(link.linkId);
  }

  function openStop(linkId: string) {
    const link = state.list.items.find((item) => item.linkId === linkId);
    if (!link || !canStop(link)) return;
    emit({ stop: { linkId, title: link.title, url: link.url, phase: "confirm", message: null }, notice: null });
  }

  /** 확인 상자의 [취소]: 요청을 보내기 전에만 닫는다. 전송 후에는 취소를 제공하지 않는다. */
  function cancelStop() {
    if (state.stop?.phase === "confirm") emit({ stop: null });
  }

  async function confirmStop(): Promise<void> {
    const target = state.stop;
    if (!target || target.phase !== "confirm") return;
    emit({ stop: { ...target, phase: "requesting", message: null } });
    const gen = generation;
    const result = await safely(() => api.stop(target.linkId));
    if (gen !== generation) return;
    if (result.kind === "success" && result.data.state !== "ACTIVE") {
      const items = state.list.items.map((item) => (item.linkId === target.linkId ? result.data : item));
      setList({ items });
      emit({
        stop: null,
        notice: result.data.state === "STOPPED"
          ? { tone: "success", text: "링크가 중단되었습니다." }
          : { tone: "info", text: "이 링크는 이미 만료되어 중단 처리 없이 만료 상태입니다." },
      });
      return;
    }
    if (result.kind !== "success" && !isUnknown(result)) {
      emit({
        stop: {
          ...target,
          phase: "failed",
          message: result.kind === "api-error" && result.status === 401 ? AUTH_TEXT : "링크를 중단하지 못했습니다. 상태를 다시 확인해 주세요.",
        },
      });
      return;
    }
    // 응답 불명(또는 성공 응답인데 유효 상태): 중단 완료·실패 어느 쪽도 단정하지 않는다. 다시 확인하기 전에는 재전송하지 않는다.
    emit({
      stop: { ...target, phase: "unknown", message: "중단 여부를 확인하지 못했습니다. 상태를 다시 확인해 주세요." },
      unresolvedStops: [...state.unresolvedStops.filter((id) => id !== target.linkId), target.linkId],
    });
  }

  /** [상태 다시 확인]: 중단을 다시 보내지 않고 목록 조회만 한다. */
  function recheckStop() {
    if (state.stop?.phase !== "failed" && state.stop?.phase !== "unknown") return;
    emit({ stop: null });
    void load();
  }

  function dismissNotice() {
    emit({ notice: null });
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load, loadMore, activeCount, canStop, issueCandidates,
    openForm, closeForm, setTitle, setUsePassword, setPassword, submit, resend, askDiscard, cancelDiscard, discardPending,
    openStop, cancelStop, confirmStop, recheckStop, dismissNotice,
    now: options.now ?? (() => Date.now()),
    /** 화면을 떠날 때: 진행 중 조회를 취소하고 늦은 응답을 버리며 처음 상태로 돌린다. 비밀번호 입력도 지운다. */
    dispose() {
      generation += 1;
      listVersion += 1;
      listAbort?.abort();
      keys.reset();
      pendingBody = null;
      emit(INITIAL);
    },
  };
}

export type ShareLinksStore = ReturnType<typeof createShareLinksStore>;
