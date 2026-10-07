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
  /**
   * editing: 입력 가능 / submitting: 요청 중 / unknown: 응답 불명(같은 키·본문으로만 다시 발행) / issued: L02
   * limited: 빈도 제한(429)으로 처리되지 않음. 같은 키·본문을 붙잡고 `retryAt`이 지나기 전에는 다시 보내지 않는다.
   */
  phase: "editing" | "submitting" | "unknown" | "limited" | "issued";
  /** 이 요청(같은 키)의 앞선 시도 중 결과를 모르는 것이 있었는지. limited에서 [새로 작성] 안내·닫기 처리를 정한다. */
  uncertain: boolean;
  /**
   * 빈도 제한 뒤 다시 보낼 수 있게 되는 시각(ms). 대기 중일 때만 값이 있다(limited뿐 아니라, 닫았다 연 새 작성 화면에서도).
   * `Retry-After`가 없거나 형식이 맞지 않으면 null(남은 시간을 추정하지 않는다).
   */
  retryAt: number | null;
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
  open: false, title: "", usePassword: false, password: "", phase: "editing", uncertain: false, retryAt: null,
  discardAsked: false, fieldErrors: {}, message: null, issued: null,
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
const LIMITED_TEXT = "요청이 많아 지금은 발행하지 못했습니다. 잠시 뒤 [다시 발행]을 누르면 같은 요청을 다시 보냅니다.";
const WAIT_TEXT = "요청이 많아 잠시 뒤에 발행할 수 있습니다. 남은 시간이 지난 뒤 [링크 발행]을 눌러 주세요.";
const LIMITED_UNCERTAIN_TEXT = "요청이 많아 지금은 결과를 확인하지 못했습니다. 앞선 요청의 발행 여부는 아직 모릅니다. 잠시 뒤 [다시 발행]을 누르면 같은 요청을 다시 보내 결과를 확인합니다.";
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
/** 빈도 제한: 서버가 이 요청을 처리하지 않았다. 앞선 같은 키 요청의 결과도 알려 주지 않는다(#235 계약). */
const isRateLimited = (result: ShareLinkFailure) => result.kind === "api-error" && result.status === 429;

export type ShareLinksStoreOptions = {
  keys?: IdempotencyKeyHolder;
  now?: () => number;
};

export function createShareLinksStore(api: ShareLinkApi, options: ShareLinksStoreOptions = {}) {
  const keys = options.keys ?? createIdempotencyKeyHolder();
  const now = options.now ?? (() => Date.now());
  let state = INITIAL;
  const listeners = new Set<() => void>();
  /** dispose 때 올려, 그 전에 시작한 요청의 늦은 응답을 버린다(StrictMode의 effect 재시작에도 다시 쓸 수 있게). */
  let generation = 0;
  let listVersion = 0;
  let listAbort: AbortController | undefined;
  /** 응답 불명·빈도 제한 뒤 다시 보낼 본문. 같은 키에는 같은 본문만 보낸다. */
  let pendingBody: ShareCreateBody | null = null;
  /** 붙잡은 요청의 앞선 시도 중 결과를 모르는 것이 있었는지(조회 실패·5xx). */
  let uncertain = false;
  /**
   * 빈도 제한 뒤 다시 보낼 수 있게 되는 시각. 요청 키·본문과 따로 관리한다.
   * 같은 화면에서 닫기·다시 열기·[새로 작성 계속]으로 요청을 놓아도 지우지 않으며, 대기 중에는 새 요청도 보내지 않는다.
   * 지우는 때: 대기가 끝난 뒤 실제로 보낼 때, 화면을 떠날 때(dispose).
   */
  let retryAt: number | null = null;

  /** 붙잡은 요청(키·본문)을 놓는다. 다음 발행은 새 키로 보낸다. 빈도 제한 대기 시간은 건드리지 않는다. */
  const releasePending = () => {
    keys.reset();
    pendingBody = null;
    uncertain = false;
  };
  const waiting = () => retryAt !== null && now() < retryAt;
  /** 화면 상태에 실을 대기 시각. 대기 중이 아니면 null. */
  const visibleRetryAt = () => (waiting() ? retryAt : null);

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
      // 빈도 제한 대기 중이면 대기 상태로 열어, 닫았다 여는 것으로 대기를 건너뛰지 않게 한다.
      const limited = waiting();
      emit({
        form: {
          ...EMPTY_FORM, open: true, phase: limited ? "limited" : "unknown", uncertain, retryAt: limited ? retryAt : null,
          title: pending.title, usePassword: pending.password !== undefined, password: pending.password ?? "",
          message: { tone: "error", text: limited ? LIMITED_UNCERTAIN_TEXT : UNKNOWN_TEXT },
        },
        notice: null,
      });
      return;
    }
    releasePending();
    // 요청은 새로 쓰지만 빈도 제한 대기는 이어진다(닫았다 여는 것으로 대기를 건너뛰지 않는다).
    emit({ form: { ...EMPTY_FORM, open: true, retryAt: visibleRetryAt(), message: waiting() ? { tone: "error", text: WAIT_TEXT } : null }, notice: null });
  }

  /** 발행 화면을 닫고 목록을 다시 확인한다. 요청 중에는 닫지 않는다. 응답 불명이었으면 그 요청은 목록에서 확인한다. */
  function closeForm() {
    if (!state.form.open || state.form.phase === "submitting") return;
    // 빈도 제한이라도 앞선 시도의 결과를 모르면 불명 요청처럼 붙잡는다. 결과를 모르는 시도가 없었다면 처리된 요청이 없으므로 놓는다.
    const wasUnknown = (state.form.phase === "unknown" || (state.form.phase === "limited" && uncertain)) && pendingBody !== null;
    const issued = state.form.phase === "issued";
    // 제목 중복·한도·멱등 충돌 안내는 목록 확인을 권하므로 목록을 다시 받는다(앞선 불명 요청이 만든 링크가 아직 목록에 없을 수 있다).
    const toList = state.form.message?.action === "to-list";
    // 결과를 모르는 요청은 닫아도 키·본문을 버리지 않는다(목록 조회가 실패해도 같은 키로만 다시 보낼 수 있게).
    if (!wasUnknown) releasePending();
    emit({
      form: EMPTY_FORM,
      pendingIssue: wasUnknown && pendingBody ? { title: pendingBody.title } : null,
      // 불명 요청의 안내는 목록 위 배너가 맡는다(후보 행 수와 [요청 다시 보기]).
      notice: null,
    });
    if (wasUnknown || issued || toList || state.list.status !== "ready") void load();
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

  async function send(body: ShareCreateBody): Promise<void> {
    // 빈도 제한 대기 중에는 어떤 경로로도 보내지 않는다(submit·resend가 먼저 막지만 한 번 더 지킨다).
    if (waiting()) return;
    // 요청을 보내기 전에 발행 중 표시와 입력·버튼 차단을 먼저 적용한다(초안 §4.1, F 2026-09-15).
    retryAt = null;
    setForm({ phase: "submitting", retryAt: null, discardAsked: false, message: null, fieldErrors: {} });
    const key = keys.current();
    const gen = generation;
    const result = await safely(() => api.create(body, key));
    if (gen !== generation) return;
    if (result.kind === "success") {
      releasePending();
      emit({ pendingIssue: null });
      setForm({ phase: "issued", issued: result.data, password: "", uncertain: false, message: null });
      return;
    }
    if (isSettledResult(result)) {
      releasePending();
      emit({ pendingIssue: null });
    }
    if (isUnknown(result)) {
      uncertain = true;
      emit({ pendingIssue: { title: body.title } });
      setForm({ phase: "unknown", uncertain: true, message: { tone: "error", text: UNKNOWN_TEXT } });
      return;
    }
    // 여기부터는 서버가 판정한 거부(4xx)다.
    if (isRateLimited(result)) {
      // 처리되지 않은 요청이다. 키·본문을 유지하고 남은 시간 동안 다시 보내지 않는다. 자동으로 다시 보내지도 않는다.
      const seconds = "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined;
      retryAt = seconds === undefined ? null : now() + seconds * 1000;
      setForm({
        phase: "limited", uncertain, retryAt,
        message: { tone: "error", text: uncertain ? LIMITED_UNCERTAIN_TEXT : LIMITED_TEXT },
      });
      return;
    }
    if (result.kind === "api-error" && result.status === 401) {
      // 인증 단계에서 거부돼 이 요청은 처리되지 않았다. 앞선 시도의 결과를 모르면 그 결과는 여전히 모른다.
      setForm({ phase: uncertain ? "unknown" : "editing", message: { tone: "error", text: AUTH_TEXT } });
      if (!uncertain) releasePending();
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
    // 빈도 제한 대기 중이면 새 요청도 보내지 않는다. 키를 만들지 않고 입력은 그대로 둔다. 자동으로 보내지도 않는다.
    if (waiting()) return setForm({ retryAt: visibleRetryAt(), message: { tone: "error", text: WAIT_TEXT } });
    // 비밀번호는 trim·정규화하지 않는다(계약). 제목은 서버도 앞뒤 공백을 빼고 비교한다.
    const body: ShareCreateBody = state.form.usePassword ? { title, password: state.form.password } : { title };
    pendingBody = body;
    uncertain = false;
    await send(body);
  }

  /** [링크 발행]을 누를 수 있는지. 입력 중이고 빈도 제한 대기 중이 아닐 때만이다. */
  function canSubmit(): boolean {
    return editable() && !waiting();
  }

  /** [다시 발행]을 누를 수 있는지. 응답 불명이거나, 빈도 제한의 남은 시간이 지났을 때만이다. */
  function canResend(): boolean {
    if (!state.form.open || pendingBody === null) return false;
    if (waiting()) return false;
    return state.form.phase === "unknown" || state.form.phase === "limited";
  }

  /** 빈도 제한의 남은 초(올림). 대기 중이 아니면 0. */
  function retryWaitSeconds(): number {
    return waiting() && retryAt !== null ? Math.ceil((retryAt - now()) / 1000) : 0;
  }

  /**
   * 응답 불명·빈도 제한 뒤 [다시 발행]: 같은 키·같은 본문으로만 보낸다. 새 키로 자동 재요청하지 않는다.
   * 빈도 제한의 남은 시간이 지나기 전에는 보내지 않는다(버튼을 강제로 눌러도).
   */
  async function resend(): Promise<void> {
    if (!canResend() || pendingBody === null) return;
    await send(pendingBody);
  }

  /** 결과를 모르는 요청을 붙잡은 상태인지(불명, 또는 결과를 모르는 시도가 있었던 빈도 제한). [새로 작성] 안내 대상이다. */
  const holdingUnknown = () => state.form.open && (state.form.phase === "unknown" || (state.form.phase === "limited" && uncertain));

  /** 불명 상태의 [새로 작성]: 바로 버리지 않고, 이전 요청이 이미 발급됐을 수 있다는 안내를 먼저 보여 준다. */
  function askDiscard() {
    if (!holdingUnknown() || state.form.discardAsked) return;
    setForm({ discardAsked: true, message: { tone: "error", text: DISCARD_WARNING } });
  }

  /** 안내에서 [취소]: 같은 키·본문의 불명(또는 빈도 제한) 상태로 돌아간다. */
  function cancelDiscard() {
    if (!holdingUnknown() || !state.form.discardAsked) return;
    setForm({ discardAsked: false, message: { tone: "error", text: state.form.phase === "limited" ? LIMITED_UNCERTAIN_TEXT : UNKNOWN_TEXT } });
  }

  /**
   * 안내를 본 뒤 [새로 작성 계속]: 붙잡은 키·본문을 버리고 입력을 고칠 수 있게 한다.
   * 이전 요청은 취소되지 않으며 자동으로 다시 보내지도 않는다. 다음 [링크 발행]은 새 키로 보낸다.
   * 이전 요청이 처리됐다면 같은 제목은 서버가 제목 중복으로 거부하므로 같은 제목의 링크가 두 번 생기지 않는다.
   */
  function discardPending() {
    if (!holdingUnknown() || !state.form.discardAsked) return;
    releasePending();
    emit({ pendingIssue: null });
    setForm({
      phase: "editing",
      uncertain: false,
      // 이전 요청은 놓지만 빈도 제한 대기는 이어진다. 남은 시간이 지난 뒤 [링크 발행]을 누르면 새 키로 보낸다.
      retryAt: visibleRetryAt(),
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
    openForm, closeForm, setTitle, setUsePassword, setPassword, submit, canSubmit, resend, canResend, retryWaitSeconds,
    askDiscard, cancelDiscard, discardPending,
    openStop, cancelStop, confirmStop, recheckStop, dismissNotice,
    now,
    /** 화면을 떠날 때: 진행 중 조회를 취소하고 늦은 응답을 버리며 처음 상태로 돌린다. 비밀번호 입력도 지운다. */
    dispose() {
      generation += 1;
      listVersion += 1;
      listAbort?.abort();
      releasePending();
      retryAt = null;
      emit(INITIAL);
    },
  };
}

export type ShareLinksStore = ReturnType<typeof createShareLinksStore>;
