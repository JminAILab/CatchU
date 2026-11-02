import { API_VERSION_PATH, normalizeApiBaseUrl, type ApiClient, type ClientResult } from "../../lib/api-client.ts";
import { readApiResponse } from "../../lib/api-response.ts";
import { readSseStream } from "./sse-reader.ts";

/**
 * 12월 intent U5 기본 요약·질의응답 API 경계(계약 C-11·C-12, 기능 설계 W1·W4~W6·BR8).
 *
 * - 요약 GET·[다시 만들기] POST는 공용 `createApiClient`로 부른다. 받은 사람은 `recipient()`에 linkGrant, 작성자는 `member()`의 회원 토큰.
 * - 질문 SSE만 같은 기준 주소 규칙(`normalizeApiBaseUrl`·`API_VERSION_PATH`, `credentials: "omit"`, `X-Link-Grant`)으로 직접 `fetch` 스트림을 연다.
 * - 받은 사람 경로의 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`은 스스로 처리하지 않고 `onAccessLost(code)`를 부른다(C-11 rule).
 * - 응답 모양을 검사해 계약 칸만 넘긴다. 링크 토큰·grant·질문 글을 로그에 남기지 않는다.
 */

export type SourceLocation = {
  readonly publishedItemId: string;
  readonly fieldPath: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly pdfPage: number | null;
};

export type ItemCitation = {
  readonly sourceId: string;
  readonly quote: string;
  readonly location: SourceLocation;
  readonly sourceLabel: string;
};

/** C-01 GatedItem 중 화면이 쓰는 칸. */
export type GatedItem = {
  readonly kind: "CITED" | "AI_INTERPRETATION" | "SERVER_NOTICE";
  readonly text: string;
  readonly citations: readonly ItemCitation[];
};

export type SummaryStatus = "PENDING" | "DONE" | "FAILED";

export type SummaryView = {
  readonly status: SummaryStatus;
  readonly items: readonly GatedItem[];
  /** 작성자 응답에만 있다. */
  readonly canRegenerate?: boolean;
};

export type LinkAccessCode = "LINK_UNAVAILABLE" | "LINK_PASSWORD_REQUIRED";

/** C-11 RecipientSlotProps에서 요청에 쓰는 칸. */
export type RecipientContext = {
  readonly token: string;
  readonly getGrant: () => string | null;
  readonly onAccessLost: (code: LinkAccessCode) => void;
};

/** 요약 읽기 결과. 링크 접근 오류는 onAccessLost를 부른 뒤 access-lost로 돌려준다. */
export type SummaryLoad =
  | { kind: "success"; view: SummaryView }
  | { kind: "access-lost"; code: LinkAccessCode }
  | { kind: "failed"; status: number | null; code: string };

export type RegenerateOutcome =
  | { kind: "accepted" }
  | { kind: "limit-reached" }
  | { kind: "failed"; status: number | null; code: string };

export type HistoryMessage = { readonly role: "USER" | "ASSISTANT"; readonly text: string };

export type QuestionBody = { readonly question: string; readonly history: readonly HistoryMessage[] };

/** 질문 하나의 끝. 스트림을 연 뒤의 실패(stream-error)는 이미 받은 항목을 두고 끝낸다(BR4.6). */
export type AskOutcome =
  | { kind: "done"; itemCount: number }
  | { kind: "stream-error"; itemCount: number; code: string | null }
  | { kind: "access-lost"; code: LinkAccessCode }
  | { kind: "http-error"; status: number | null; code: string }
  | { kind: "aborted"; itemCount: number };

export type RagAnswerApiOptions = {
  /** 화면은 `@/lib/api`의 api를 넘긴다. */
  client: Pick<ApiClient, "member" | "recipient">;
  /** NEXT_PUBLIC_API_BASE_URL. 질문 SSE 주소를 같은 규칙으로 만든다. */
  baseUrl: string | undefined;
  nodeEnv?: string;
  /** 질문 SSE에 쓸 fetch. 기본은 부를 때의 전역 fetch. */
  fetch?: typeof fetch;
};

const STATUSES: readonly string[] = ["PENDING", "DONE", "FAILED"];
const KINDS: readonly string[] = ["CITED", "AI_INTERPRETATION", "SERVER_NOTICE"];
const LINK_ACCESS: Readonly<Record<string, number>> = { LINK_UNAVAILABLE: 404, LINK_PASSWORD_REQUIRED: 401 };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function parseLocation(value: unknown): SourceLocation | null {
  if (!record(value) || typeof value.publishedItemId !== "string" || typeof value.fieldPath !== "string"
    || !integer(value.charStart) || !integer(value.charEnd) || !(value.pdfPage === null || integer(value.pdfPage))) return null;
  return { publishedItemId: value.publishedItemId, fieldPath: value.fieldPath, charStart: value.charStart, charEnd: value.charEnd,
    pdfPage: value.pdfPage };
}

function parseCitation(value: unknown): ItemCitation | null {
  if (!record(value) || typeof value.sourceId !== "string" || typeof value.quote !== "string" || typeof value.sourceLabel !== "string") {
    return null;
  }
  const location = parseLocation(value.location);
  return location && { sourceId: value.sourceId, quote: value.quote, location, sourceLabel: value.sourceLabel };
}

/** 항목 하나의 모양 검사. 틀리면 null. */
export function parseGatedItem(value: unknown): GatedItem | null {
  if (!record(value) || !KINDS.includes(value.kind as string) || typeof value.text !== "string" || !Array.isArray(value.citations)) {
    return null;
  }
  const citations = value.citations.map(parseCitation);
  if (citations.some((citation) => citation === null)) return null;
  return { kind: value.kind as GatedItem["kind"], text: value.text, citations: citations as ItemCitation[] };
}

/** 요약 응답 모양 검사. 작성자 응답이면 canRegenerate도 본다. */
export function parseSummaryView(value: unknown, owner: boolean): SummaryView | null {
  if (!record(value) || !STATUSES.includes(value.status as string) || !Array.isArray(value.items)) return null;
  if (owner && typeof value.canRegenerate !== "boolean") return null;
  const items = value.items.map(parseGatedItem);
  if (items.some((item) => item === null)) return null;
  return {
    status: value.status as SummaryStatus,
    items: items as GatedItem[],
    ...(owner ? { canRegenerate: value.canRegenerate as boolean } : {}),
  };
}

/** 받은 사람 경로의 링크 접근 오류인가(C-11 rule). */
export function linkAccessCode(status: number | null, code: string): LinkAccessCode | null {
  return Object.hasOwn(LINK_ACCESS, code) && LINK_ACCESS[code] === status ? code as LinkAccessCode : null;
}

function failure(result: Exclude<ClientResult, { kind: "success" }>): { kind: "failed"; status: number | null; code: string } {
  return { kind: "failed", status: result.status, code: result.code };
}

const linkPath = (token: string) => `/public/links/${encodeURIComponent(token)}`;
const ownerPath = (publicationId: string) => `/publications/${encodeURIComponent(publicationId)}/summary`;

function grantOf(context: RecipientContext): string | null {
  const grant = context.getGrant();
  return typeof grant === "string" && grant !== "" ? grant : null;
}

export function createRagAnswerApi(options: RagAnswerApiOptions) {
  function toLoad(result: ClientResult, owner: boolean, context?: RecipientContext): SummaryLoad {
    if (result.kind === "success") {
      const view = parseSummaryView(result.data, owner);
      return view ? { kind: "success", view } : { kind: "failed", status: result.status, code: "LOOKUP_FAILED" };
    }
    const lost = context && result.kind === "api-error" ? linkAccessCode(result.status, result.code) : null;
    if (lost && context) {
      context.onAccessLost(lost);
      return { kind: "access-lost", code: lost };
    }
    return failure(result);
  }

  /** 질문 SSE 응답을 끝까지 읽는다. item마다 onItem, done이면 done, error 이벤트면 stream-error. */
  async function readAnswer(response: Response, onItem: (item: GatedItem) => void, signal?: AbortSignal): Promise<AskOutcome> {
    let itemCount = 0;
    // 콜백 안에서 바꾸므로 null로 좁혀지지 않게 선언한다.
    let outcome = null as AskOutcome | null;
    if (!response.body || !(response.headers.get("Content-Type") ?? "").startsWith("text/event-stream")) {
      return { kind: "stream-error", itemCount, code: null };
    }
    try {
      await readSseStream(response.body, (event) => {
        if (event.event === "item") {
          const item = parseGatedItem(safeJson(event.data));
          if (item === null) {
            outcome = { kind: "stream-error", itemCount, code: null };
            return false;
          }
          itemCount += 1;
          onItem(item);
          return true;
        }
        if (event.event === "done") outcome = { kind: "done", itemCount };
        else if (event.event === "error") outcome = { kind: "stream-error", itemCount, code: errorCodeOf(safeJson(event.data)) };
        else return true;
        return false;
      });
    } catch {
      if (signal?.aborted) return { kind: "aborted", itemCount };
      return { kind: "stream-error", itemCount, code: null };
    }
    if (signal?.aborted) return { kind: "aborted", itemCount };
    // done·error 없이 끝난 스트림은 끊긴 것이라 실패로 본다.
    return outcome ?? { kind: "stream-error", itemCount, code: null };
  }

  return {
    /** W4: 받은 사람 요약 GET. 화면을 열 때 한 번만 부른다(BR8.2). */
    async recipientSummary(context: RecipientContext, signal?: AbortSignal): Promise<SummaryLoad> {
      const grant = grantOf(context);
      const result = await options.client.recipient(`${linkPath(context.token)}/summary`,
        { method: "GET", signal, ...(grant ? { linkGrant: grant } : {}) });
      return toLoad(result, false, context);
    },

    /** W5: 작성자 요약 GET(회원 토큰). */
    async ownerSummary(publicationId: string, signal?: AbortSignal): Promise<SummaryLoad> {
      return toLoad(await options.client.member(ownerPath(publicationId), { method: "GET", signal }), true);
    },

    /** W6: [다시 만들기] POST. 202는 접수다. 429는 하루 한도(BR8.2). */
    async regenerate(publicationId: string, signal?: AbortSignal): Promise<RegenerateOutcome> {
      const result = await options.client.member(`${ownerPath(publicationId)}/regenerate`, { method: "POST", signal });
      if (result.kind === "success" && result.status === 202) return { kind: "accepted" };
      if (result.kind === "api-error" && result.status === 429 && result.code === "DAILY_LIMIT_REACHED") return { kind: "limit-reached" };
      if (result.kind === "success") return { kind: "failed", status: result.status, code: "LOOKUP_FAILED" };
      return failure(result);
    },

    /**
     * W1: 질문 POST를 SSE로 받는다. 스트림 전 거부(400·401·404·409·429)는 http-error 또는 access-lost다.
     * signal로 끊으면(화면 해제) aborted다. 서버는 끊김을 보고 생성을 멈춘다(BR4.8).
     */
    async ask(context: RecipientContext, body: QuestionBody, onItem: (item: GatedItem) => void, signal?: AbortSignal): Promise<AskOutcome> {
      const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
      if (!baseUrl) return { kind: "http-error", status: null, code: "LOOKUP_FAILED" };
      const grant = grantOf(context);
      const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${API_VERSION_PATH}${linkPath(context.token)}/questions`, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
            ...(grant ? { "X-Link-Grant": grant } : {}),
          },
          body: JSON.stringify({ question: body.question, history: body.history.map(({ role, text }) => ({ role, text })) }),
          cache: "no-store",
          credentials: "omit",
          signal,
        });
      } catch {
        return signal?.aborted ? { kind: "aborted", itemCount: 0 } : { kind: "http-error", status: null, code: "LOOKUP_FAILED" };
      }
      if (response.status !== 200) {
        const result = await readApiResponse(response);
        if (result.kind !== "api-error") return { kind: "http-error", status: response.status, code: "LOOKUP_FAILED" };
        const lost = linkAccessCode(result.status, result.code);
        if (lost) {
          context.onAccessLost(lost);
          return { kind: "access-lost", code: lost };
        }
        return { kind: "http-error", status: result.status, code: result.code };
      }
      return readAnswer(response, onItem, signal);
    },
  };
}

export type RagAnswerApi = ReturnType<typeof createRagAnswerApi>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorCodeOf(value: unknown): string | null {
  return record(value) && typeof value.code === "string" ? value.code : null;
}
