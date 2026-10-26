import { createIdempotencyKeyHolder, isSettledResult, type IdempotencyKeyHolder } from "../../lib/idempotency.ts";
import type { AnalysisSummary, AnalyzableRepository, Lookup } from "../repository-management/repository-api.ts";
import type { AnalysisCreateBody, AnalysisNotice, AnalysisRequestApi, CreateOutcome, Result } from "./analysis-request-api.ts";

/**
 * 저장소 연결 관리 모달의 분석 요청 상태(#154). 아래쪽 「연결할 수 있는 저장소」의 선택·고지·동의·첫 요청과,
 * 위쪽 「연결된 저장소」의 허용된 실패 재요청을 같은 상태 객체가 맡는다(한 번에 하나의 요청만 보내고 키·본문을 한 곳에서 붙잡는다).
 * 화면 표시와 분리해 중복 제출·늦은 응답·응답 불명을 한 곳에서 다룬다.
 *
 * - 접수 허용은 서버가 판정한다. 화면은 서버가 준 선정 목록과 현재 고지만 따른다.
 * - 재요청은 서버 이력의 retry.allowed가 참인 최신 요청에만 제공하고, 현재 고지·범위 판본의 새 동의와 retryOfRequestId를 새 키로 보낸다.
 * - 응답 불명(조회 실패·5xx 등)이면 같은 키·같은 본문을 붙잡고, 사용자가 누를 때만 다시 보낸다. 새 키로 자동 접수하지 않는다.
 * - 서버가 판정한 4xx 거부만 확정으로 보고 다음 요청을 새 키로 만든다(공통 isSettledResult).
 * - 붙잡은 키·본문은 이 상태 객체가 살아 있는 동안(같은 회원의 내 자산 화면)만 메모리에 둔다. 새로고침·이동 뒤 복구는 하지 않는다.
 */

/** unavailable: 서버가 403으로 지금은 쓸 수 없다고 판정했다(조회 실패와 구분). code는 계약 오류 코드다. */
export type Load<T> = { state: "loading" } | { state: "failed" } | { state: "unavailable"; code: string } | { state: "ready"; value: T };
export type Message = { tone: "info" | "success" | "error"; text: string; action?: "github" };

export type RequestSnapshot = {
  repositories: Load<readonly AnalyzableRepository[]>;
  notice: Load<AnalysisNotice>;
  selectedId: string | null;
  /** editing: 입력 가능 / submitting: 요청 중 / unknown: 응답 불명 / limited: 빈도 제한(같은 키·본문 유지) */
  phase: "editing" | "submitting" | "unknown" | "limited";
  /** 빈도 제한 후 다시 보낼 수 있는 시각(ms). 유효한 Retry-After가 없으면 null이며 시간을 추정하지 않는다. */
  retryAt: number | null;
  /** 요청 중·응답 불명·빈도 제한일 때 붙잡은 본문의 저장소. 입력 중이면 null. */
  pendingRepositoryId: string | null;
  /** 붙잡은 본문이 실패 재요청(retryOfRequestId 있음)인지. 입력 중이면 false. */
  pendingRetry: boolean;
  message: Message | null;
};

/** 재요청 대상. 「연결된 저장소」의 저장소별 최신 요청이며, retryAllowed는 서버 이력의 retry.allowed 그대로다. */
export type RetryTarget = Pick<AnalysisSummary, "requestId" | "repositoryId" | "retryAllowed">;

const INITIAL: RequestSnapshot = {
  repositories: { state: "loading" },
  notice: { state: "loading" },
  selectedId: null,
  phase: "editing",
  retryAt: null,
  pendingRepositoryId: null,
  pendingRetry: false,
  message: null,
};

// 접수 안내는 상태 조회 결과와 따로 보인다. 「연결된 저장소」 조회가 실패할 수 있으므로 그곳에서 확인할 수 있다고 단정하지 않는다.
export const TEXT = {
  accepted: "분석 요청을 접수했습니다. 분석이 끝난 것은 아닙니다.",
  retryAccepted: "다시 요청을 접수했습니다. 분석이 끝난 것은 아닙니다.",
  existing: "이 저장소의 분석 요청이 이미 접수되어 있습니다. 새 요청을 만들지 않았습니다.",
  // 200은 같은 키 재전송과 같은 저장소의 진행 중 작업 반환을 모두 포함한다. 앞선 시도가 만든 요청이라고 특정하지 않는다.
  resentExisting: "이 저장소의 접수된 분석 요청을 확인했습니다. 이번 재전송으로 새 요청을 만들지 않았습니다.",
  unknown: "요청이 접수됐는지 확인하지 못했습니다. [같은 요청 다시 보내기]는 같은 요청을 다시 보내 결과를 확인합니다. 이미 접수됐다면 새 분석을 만들지 않습니다.",
  limited: "요청이 많아 이번 시도는 처리되지 않았습니다. [같은 요청 다시 보내기]로 같은 요청을 다시 보낼 수 있습니다.",
  limitedUncertain: "요청이 많아 이번 시도는 처리되지 않았습니다. 앞선 요청이 접수됐는지는 아직 확인하지 못했습니다. [같은 요청 다시 보내기]로 결과를 확인해 주세요.",
  auth: "로그인이 필요합니다. 다시 로그인한 뒤 확인해 주세요.",
  inProgress: "다른 저장소의 분석이 진행 중이라 이번 요청은 접수되지 않았습니다. 진행 중인 분석이 끝난 뒤 다시 요청해 주세요.",
  // 아래 세 안내는 다시 읽기를 시작한 시점에 보인다. 다시 읽기가 끝났다고 단정하지 않는다(실패하면 각 영역에 조회 실패가 따로 보인다).
  consent: "분석 안내나 허용 범위가 바뀌어 이번 요청은 접수되지 않았습니다. 최신 안내와 저장소 목록을 확인한 뒤 다시 동의해 주세요.",
  github: "GitHub 연동을 다시 확인해야 분석을 요청할 수 있습니다. 이번 요청은 접수되지 않았습니다.",
  notAllowed: "선택한 저장소는 지금 분석을 요청할 수 없습니다. 이번 요청은 접수되지 않았습니다. 저장소 목록을 확인한 뒤 다시 선택해 주세요.",
  unavailable: "지금은 분석을 요청할 수 없습니다. 이번 요청은 접수되지 않았습니다.",
  deferred: "이 저장소는 이미 분석을 마친 기록이 있어 지금은 다시 분석할 수 없습니다. 이번 요청은 접수되지 않았습니다.",
  previousRequest: "이 저장소에는 이전 분석 요청이 있어 새 요청으로 받을 수 없습니다. 이번 요청은 접수되지 않았습니다. 다시 요청할 수 있는 실패라면 「연결된 저장소」의 해당 저장소에 [동의하고 다시 요청]이 보입니다.",
  // 재요청 거부. 「연결된 저장소」를 다시 읽기 시작한 시점에 보이므로 다시 읽기가 끝났다고 단정하지 않는다.
  retryNotAllowed: "이 요청은 지금 다시 요청할 수 없어 접수되지 않았습니다. 「연결된 저장소」에서 최신 상태를 확인해 주세요.",
  retryMissing: "다시 요청할 이전 요청을 찾지 못했습니다. 이번 요청은 접수되지 않았습니다. 「연결된 저장소」에서 최신 상태를 확인해 주세요.",
  conflict: "같은 요청 키로 다른 내용이 전송되어 처리하지 못했습니다. 상태를 확인한 뒤 다시 요청해 주세요.",
  invalid: "요청 내용을 확인하지 못해 이번 요청은 접수되지 않았습니다. 최신 안내와 저장소 목록을 확인한 뒤 다시 시도해 주세요.",
  rejected: "분석 요청이 접수되지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
} as const;

export type AnalysisRequestStoreOptions = {
  /** 선정 저장소 조회. #153 RepositoryApi의 analyzableRepositories(판본 검증)를 넘긴다. */
  repositories: (signal?: AbortSignal) => Promise<Lookup<AnalyzableRepository[]>>;
  requests: AnalysisRequestApi;
  keys?: IdempotencyKeyHolder;
  now?: () => number;
};

const LOOKUP_FAILED = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" } as const;

/** 조회 결과를 화면 상태로. 403은 서버가 지금 쓸 수 없다고 판정한 것이라 다시 불러오기로 풀리는 조회 실패와 나눈다. */
function toLoad<T>(result: Result<T>): Load<T> {
  if (result.kind === "success") return { state: "ready", value: result.data };
  if (result.kind === "api-error" && result.status === 403) return { state: "unavailable", code: result.code };
  return { state: "failed" };
}

export function createAnalysisRequestStore(options: AnalysisRequestStoreOptions) {
  const keys = options.keys ?? createIdempotencyKeyHolder();
  const now = options.now ?? Date.now;
  let state = INITIAL;
  const listeners = new Set<() => void>();
  /** 접수 결과나 진행 상태가 바뀌었을 수 있을 때 부를 함수들(#153의 「연결된 저장소」 다시 불러오기). */
  const statusWatchers = new Set<() => void>();
  /** dispose 때 올려, 그 전에 시작한 요청의 늦은 응답을 버린다. */
  let generation = 0;
  let repositoryVersion = 0;
  let noticeVersion = 0;
  let repositoryAbort: AbortController | undefined;
  let noticeAbort: AbortController | undefined;
  /** 요청 중·응답 불명·빈도 제한일 때 다시 보낼 본문. 같은 키에는 같은 본문만 보낸다. */
  let pendingBody: AnalysisCreateBody | null = null;
  /** 붙잡은 요청에 결과를 모르는 시도가 있었는지. 200을 받았을 때 안내를 고른다. */
  let uncertain = false;

  const emit = (patch: Partial<RequestSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  /** 붙잡은 요청(키·본문)을 놓는다. 다음 요청은 새 키로 보낸다. */
  const releasePending = () => {
    keys.reset();
    pendingBody = null;
    uncertain = false;
  };
  const statusChanged = () => {
    statusWatchers.forEach((watch) => {
      try { watch(); } catch { /* 목록 갱신 실패가 접수 결과 표시를 바꾸지 않게 한다 */ }
    });
  };

  async function safely<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
    try { return await call(); } catch { return LOOKUP_FAILED; }
  }

  async function loadRepositories(): Promise<void> {
    const version = ++repositoryVersion;
    const gen = generation;
    repositoryAbort?.abort();
    const abort = new AbortController();
    repositoryAbort = abort;
    emit({ repositories: { state: "loading" } });
    const result = await safely(() => options.repositories(abort.signal));
    if (gen !== generation || version !== repositoryVersion) return;
    const repositories = toLoad<readonly AnalyzableRepository[]>(result);
    // 입력 중인데 고른 저장소가 새 목록에 없으면 선택을 푼다. 요청 중·응답 불명이면 붙잡은 본문이 기준이라 그대로 둔다.
    const keep = state.phase !== "editing"
      || (repositories.state === "ready" && repositories.value.some((item) => item.repositoryId === state.selectedId));
    emit({ repositories, selectedId: keep ? state.selectedId : null });
  }

  async function loadNotice(): Promise<void> {
    const version = ++noticeVersion;
    const gen = generation;
    noticeAbort?.abort();
    const abort = new AbortController();
    noticeAbort = abort;
    emit({ notice: { state: "loading" } });
    const result = await safely(() => options.requests.notice(abort.signal));
    if (gen !== generation || version !== noticeVersion) return;
    emit({ notice: toLoad(result) });
  }

  /**
   * 선정 목록과 현재 고지를 함께 다시 읽는다. 요청 중·응답 불명이면 읽지 않는다.
   * 붙잡은 본문이 동의한 고지와 다른 최신 고지를 그 아래에 보여 주지 않기 위해서다.
   */
  function load(): Promise<void> {
    if (state.phase !== "editing") return Promise.resolve();
    return Promise.all([loadRepositories(), loadNotice()]).then(() => undefined);
  }

  /** 모달을 열 때. 입력 중이면 이전 안내 문구를 지우고 목록·고지를 다시 읽는다. 응답 불명·빈도 제한이면 안내·요청·대기 기한을 그대로 둔다. */
  function open(): Promise<void> {
    if (state.phase === "editing" && state.message !== null) emit({ message: null });
    return load();
  }

  const editable = () => state.phase === "editing";
  const findRepository = (repositoryId: string | null) =>
    state.repositories.state === "ready" && repositoryId !== null
      ? state.repositories.value.find((item) => item.repositoryId === repositoryId) ?? null
      : null;

  /** 서버가 준 선정 목록 안에서만 고른다. */
  function select(repositoryId: string) {
    if (!editable() || !findRepository(repositoryId)) return;
    emit({ selectedId: repositoryId, message: null });
  }

  /** 지금 화면 입력으로 만들 본문. 선정 목록·고지가 준비되고 고른 저장소가 목록에 있을 때만 만든다. */
  function composeBody(): AnalysisCreateBody | null {
    const repository = findRepository(state.selectedId);
    if (!repository || state.notice.state !== "ready") return null;
    return {
      repositoryId: repository.repositoryId,
      consent: { accepted: true, noticeRevision: state.notice.value.noticeRevision, scopeRevision: repository.allowedScopeRevision },
    };
  }

  function canSubmit(): boolean {
    return editable() && composeBody() !== null;
  }

  /**
   * 실패 재요청 본문. 서버가 retry.allowed를 참으로 준 대상이고, 현재 고지와 그 저장소의 현재 허용 범위 판본이
   * 준비됐을 때만 만든다(과거 동의를 다시 쓰지 않는다). 재요청 허용 여부를 화면이 다시 계산하지 않는다.
   */
  function composeRetryBody(target: RetryTarget): AnalysisCreateBody | null {
    if (!target.retryAllowed || !target.requestId) return null;
    const repository = findRepository(target.repositoryId);
    if (!repository || state.notice.state !== "ready") return null;
    return {
      repositoryId: repository.repositoryId,
      consent: { accepted: true, noticeRevision: state.notice.value.noticeRevision, scopeRevision: repository.allowedScopeRevision },
      retryOfRequestId: target.requestId,
    };
  }

  function canRetry(target: RetryTarget): boolean {
    return editable() && composeRetryBody(target) !== null;
  }

  /** 입력 단계로 돌아갈 때 붙잡은 요청 표시를 함께 지운다. */
  const idle = { phase: "editing" as const, retryAt: null, pendingRepositoryId: null, pendingRetry: false };

  function settle(outcome: CreateOutcome, isRetry: boolean) {
    const text = outcome.kind === "accepted" ? (isRetry ? TEXT.retryAccepted : TEXT.accepted) : uncertain ? TEXT.resentExisting : TEXT.existing;
    releasePending();
    // 같은 요청을 실수로 다시 누르지 않게 선택을 푼다. 다음 요청은 저장소를 다시 골라야 만든다.
    emit({ ...idle, selectedId: null, message: { tone: "success", text } });
    statusChanged();
  }

  /** 서버가 판정한 거부(4xx)의 안내와 뒤따를 다시 읽기. 키는 이미 놓았다. 403 전체를 판본 거부로 보지 않고 코드로 나눈다. */
  function rejected(code: string, status: number, isRetry: boolean) {
    const reset = idle;
    const error = (text: string, action?: "github"): Message => (action ? { tone: "error", text, action } : { tone: "error", text });
    if (isRetry && code === "RESOURCE_UNAVAILABLE") {
      // 다른 회원·없는 요청 ID(계약상 같은 404). 기존 작업 ID를 추정하지 않고 목록만 다시 읽는다.
      emit({ ...reset, message: error(TEXT.retryMissing) });
      statusChanged();
      return;
    }
    switch (code) {
      case "CONSENT_REQUIRED":
        // 고지·범위 판본이 바뀌었다. 둘 다 다시 읽고, 사용자가 버튼을 다시 눌러야(새 동의) 새 키로 보낸다.
        emit({ ...reset, message: error(TEXT.consent) });
        void load();
        return;
      case "ANALYSIS_IN_PROGRESS":
        emit({ ...reset, message: error(TEXT.inProgress) });
        statusChanged();
        return;
      case "GITHUB_CONNECTION_REQUIRED":
        emit({ ...reset, message: error(TEXT.github, "github") });
        return;
      case "REPOSITORY_NOT_ALLOWED":
        emit({ ...reset, selectedId: null, message: error(TEXT.notAllowed) });
        void loadRepositories();
        return;
      case "REANALYSIS_DEFERRED":
        emit({ ...reset, message: error(TEXT.deferred) });
        statusChanged();
        return;
      case "RETRY_NOT_ALLOWED":
        // 재요청이면 그사이 대상이 최신 요청이 아니게 됐거나 서버 판정이 바뀐 것이다. 목록을 다시 읽어 서버의 현재 판정을 보인다.
        emit({ ...reset, message: error(isRetry ? TEXT.retryNotAllowed : TEXT.previousRequest) });
        statusChanged();
        return;
      case "IDEMPOTENCY_CONFLICT":
        emit({ ...reset, message: error(TEXT.conflict) });
        statusChanged();
        return;
      case "VALIDATION_FAILED":
      case "INVALID_REQUEST":
        emit({ ...reset, message: error(TEXT.invalid) });
        void load();
        return;
      default:
        // 그 밖의 403(개발 기능 비활성·실제 회원 접수 전 등)은 지금 요청할 수 없다는 판정이다.
        emit({ ...reset, message: error(status === 403 ? TEXT.unavailable : TEXT.rejected) });
    }
  }

  async function send(body: AnalysisCreateBody): Promise<void> {
    const isRetry = body.retryOfRequestId !== undefined;
    // 응답을 기다리기 전에 요청 중 표시와 입력·버튼 차단을 먼저 적용한다(같은 틱의 두 번째 클릭도 막는다).
    emit({ phase: "submitting", retryAt: null, pendingRepositoryId: body.repositoryId, pendingRetry: isRetry, message: null });
    const key = keys.current();
    const gen = generation;
    const result = await safely(() => options.requests.create(body, key));
    if (gen !== generation) return;
    if (result.kind === "success") return settle(result.data, isRetry);
    if (result.kind === "api-error" && result.status === 429) {
      // 이번 시도는 처리되지 않았지만, 앞선 불명 시도의 결과까지 확인된 것은 아니다. 키·본문과 uncertain은 유지한다.
      const seconds = "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined;
      const retryAt = typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 ? now() + seconds * 1000 : null;
      return emit({
        phase: "limited", retryAt,
        message: { tone: "error", text: uncertain ? TEXT.limitedUncertain : TEXT.limited },
      });
    }
    if (result.kind === "api-error" && result.status === 401) {
      // 인증 단계에서 거부돼 이번 시도는 처리되지 않았다. 앞선 시도의 결과를 모르면 그 결과는 여전히 모른다.
      if (uncertain) return emit({ phase: "unknown", message: { tone: "error", text: TEXT.auth } });
      releasePending();
      return emit({ ...idle, message: { tone: "error", text: TEXT.auth } });
    }
    if (result.kind === "api-error" && isSettledResult(result)) {
      releasePending();
      return rejected(result.code, result.status, isRetry);
    }
    // 조회 실패·5xx·계약과 다른 성공 응답. 서버가 처리했는지 알 수 없으므로 키·본문을 붙잡고 자동으로 다시 보내지 않는다.
    uncertain = true;
    emit({ phase: "unknown", message: { tone: "error", text: TEXT.unknown } });
  }

  /** [동의하고 분석 요청]: 버튼 하나로 현재 고지·범위 판본의 동의와 요청을 함께 보낸다. */
  async function submit(): Promise<void> {
    if (!editable()) return;
    const body = composeBody();
    if (!body) return;
    pendingBody = body;
    uncertain = false;
    await send(body);
  }

  /**
   * [동의하고 다시 요청]: 「연결된 저장소」의 허용된 실패(서버 retry.allowed)에 현재 고지·범위 판본의 새 동의와
   * retryOfRequestId를 실어 새 요청으로 보낸다. 입력 단계에서만 받으므로 직전 요청의 키를 쓰지 않고 새 키를 만든다.
   * 응답 불명 뒤에는 첫 요청과 같이 같은 키·본문의 [같은 요청 다시 보내기]만 쓴다.
   */
  async function retry(target: RetryTarget): Promise<void> {
    if (!editable()) return;
    const body = composeRetryBody(target);
    if (!body) return;
    pendingBody = body;
    uncertain = false;
    await send(body);
  }

  /** 빈도 제한의 남은 초(올림). 대기 중이 아니면 0. */
  function retryWaitSeconds(): number {
    return state.retryAt === null ? 0 : Math.max(0, Math.ceil((state.retryAt - now()) / 1000));
  }

  function canResend(): boolean {
    return (state.phase === "unknown" || state.phase === "limited") && pendingBody !== null && retryWaitSeconds() === 0;
  }

  /** 응답 불명·빈도 제한 뒤 [같은 요청 다시 보내기]: 기한이 지난 뒤 같은 키·같은 본문으로만 보낸다. */
  async function resend(): Promise<void> {
    if (!canResend() || pendingBody === null) return;
    await send(pendingBody);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** 접수 결과나 진행 상태가 바뀌었을 수 있을 때 부를 함수를 등록한다. 그 함수의 실패는 접수 결과 안내를 바꾸지 않는다. */
    watchStatusChanges(watch: () => void) {
      statusWatchers.add(watch);
      return () => { statusWatchers.delete(watch); };
    },
    open, load, loadRepositories, loadNotice, select, canSubmit, submit, canRetry, retry, canResend, resend, retryWaitSeconds,
    /** 화면(내 자산)을 떠날 때: 진행 중 조회를 취소하고 늦은 응답을 버리며 처음 상태로 돌린다. 보낸 POST는 취소하지 않는다. */
    dispose() {
      generation += 1;
      repositoryVersion += 1;
      noticeVersion += 1;
      repositoryAbort?.abort();
      noticeAbort?.abort();
      releasePending();
      state = INITIAL;
      listeners.forEach((listener) => listener());
    },
  };
}

export type AnalysisRequestStore = ReturnType<typeof createAnalysisRequestStore>;
