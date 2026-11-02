/**
 * Claude 본인 연결 화면의 요청과 결과 판정(12월 intent U6 기능 설계 W2·W6, BR3.2~BR3.6·BR7.1·BR7.2·BR7.5, 비기능 NFR1.8).
 * - 승인 화면의 쿼리 값은 요청 본문으로 되돌려 보낼 뿐이고, 화면에는 돌아갈 주소의 호스트만 보인다. clientName은 쓰지 않는다.
 * - 이동은 api가 돌려준 redirectTo가 http(s) 주소일 때만 한다. 쿼리의 주소로 직접 이동하지 않는다.
 * - 실패는 안내만 보이고 자동으로 다시 보내지 않는다. 다시 시도는 회원이 누른다.
 * - 전체 해제는 204만 성공이다. 조회 실패를 NONE으로 바꾸지 않는다.
 */
import type { ClientResult, MemberRequest } from "../../lib/api-client.ts";

const CONNECTION_PATH = "/me/mcp-connection";
const AUTHORIZATIONS_PATH = `${CONNECTION_PATH}/authorizations`;

export const AUTHORIZE_TEXT = {
  title: "Claude 연결 승인",
  loading: "연결 상태를 확인하고 있습니다.",
  lookupFailed: "연결 상태를 확인하지 못했습니다",
  invalid: "연결 요청을 확인할 수 없습니다. Claude에서 다시 시작해 주세요.",
  host: "승인하면 돌아갈 곳",
  warning: "직접 시작한 연결이 아니면 취소하세요",
  consent: "승인하면 Claude가 내 공개·비공개 Catch와 지금 있는 텍스트 자료, 앞으로 저장할 텍스트 자료를 읽게 됩니다.",
  reapprove: "전에 동의한 Claude 연결을 다시 승인합니다. 승인해야 Claude가 자료를 읽을 수 있습니다.",
  approveWithConsent: "동의하고 승인",
  approve: "승인",
  cancel: "취소",
  sending: "요청을 보내고 있습니다.",
  consentRequired: "자료 읽기에 먼저 동의해 주세요.",
  failed: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  unknown: "요청 결과를 확인하지 못했습니다. 다시 시도해 주세요.",
} as const;

export const CONNECTION_TEXT = {
  title: "Claude 연결",
  lead: "이 주소를 Claude의 연결 설정에 넣으면 Claude에서 내 Catch와 텍스트 자료를 읽을 수 있습니다.",
  loading: "연결 상태를 불러오고 있습니다.",
  lookupFailed: "연결 상태를 불러오지 못했습니다",
  state: {
    NONE: "연결되어 있지 않습니다",
    ACTIVE: "연결되어 있습니다",
    EXPIRED: "연결이 만료되었습니다. Claude에서 다시 연결해 주세요",
  },
  expiresAt: "만료",
  url: "MCP 주소",
  copy: "주소 복사",
  copied: "주소를 복사했습니다",
  copyFailed: "복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요",
  disconnect: "전체 연결 해제",
  confirm: "모든 Claude 연결을 해제합니다. 연결별로 고를 수 없고, 다시 쓰려면 Claude에서 새로 연결하고 동의해야 합니다",
  confirmAction: "해제하기",
  cancel: "취소",
  sending: "연결을 해제하고 있습니다.",
  disconnected: "연결을 모두 해제했습니다",
  disconnectFailed: "연결을 해제하지 못했습니다. 다시 시도해 주세요",
  disconnectUnknown: "해제 결과를 확인하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요",
} as const;

export type MemberCall = (path: string, request: MemberRequest) => Promise<ClientResult>;

export type ConnectionState = "NONE" | "ACTIVE" | "EXPIRED";
export type ConnectionStatus = { state: ConnectionState; expiresAt: string | null; mcpUrl: string };
export type ConnectionLookup = { kind: "loaded"; status: ConnectionStatus } | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 호출 함수가 던진 예외도 결과를 모르는 실패로 본다. 버튼이 막힌 채 남지 않게 한다. */
async function callMember(member: MemberCall, path: string, request: MemberRequest): Promise<ClientResult> {
  try {
    return await member(path, request);
  } catch {
    return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
  }
}

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  if (!isRecord(value)) return false;
  const { state, expiresAt, mcpUrl } = value;
  if (state !== "NONE" && state !== "ACTIVE" && state !== "EXPIRED") return false;
  if (typeof mcpUrl !== "string" || mcpUrl.length === 0) return false;
  return expiresAt === null || (typeof expiresAt === "string" && !Number.isNaN(Date.parse(expiresAt)));
}

/** GET /me/mcp-connection. 응답이 없거나 모양이 다르면 실패이고 NONE으로 바꾸지 않는다(BR7.1). */
export async function readConnectionStatus(member: MemberCall, signal?: AbortSignal): Promise<ConnectionLookup> {
  const result = await callMember(member, CONNECTION_PATH, { signal });
  return result.kind === "success" && isConnectionStatus(result.data) ? { kind: "loaded", status: result.data } : { kind: "failed" };
}

export type AuthorizeQuery = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource?: string;
  /** 화면에 보일 돌아갈 주소의 호스트(BR3.5). */
  host: string;
};

/** http(s) 주소면 URL, 아니면 null. */
function parseHttpUrl(value: string): URL | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/** /authorize가 넘긴 쿼리. 필수 값이 없거나 돌아갈 주소가 http(s)가 아니면 null이고 요청을 보내지 않는다. 주소를 믿을지는 api가 다시 확인한다(BR3.2). */
export function parseAuthorizeQuery(search: string): AuthorizeQuery | null {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  if (!clientId || !redirectUri || !codeChallenge) return null;
  const target = parseHttpUrl(redirectUri);
  if (!target) return null;
  return {
    clientId,
    redirectUri,
    state: params.get("state") ?? undefined,
    codeChallenge,
    resource: params.get("resource") ?? undefined,
    host: target.host,
  };
}

export type AuthorizeView =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "lookup-failed" }
  | { kind: "ready"; query: AuthorizeQuery; showConsent: boolean };

/**
 * 승인 화면에 무엇을 보일지. `search`는 브라우저에서 읽기 전이면 null이다.
 * 연결 행이 없으면(NONE) 동의 안내를, 그 밖이면 재승인 안내를 보인다. 승인 요청이 동의를 요구하면 동의 안내로 바꾼다(BR3.3~BR3.5).
 */
export function authorizeView(search: string | null, lookup: ConnectionLookup | null, consentRequired: boolean): AuthorizeView {
  if (search === null) return { kind: "loading" };
  const query = parseAuthorizeQuery(search);
  if (!query) return { kind: "invalid" };
  if (!lookup) return { kind: "loading" };
  if (lookup.kind === "failed") return { kind: "lookup-failed" };
  return { kind: "ready", query, showConsent: lookup.status.state === "NONE" || consentRequired };
}

export type AuthorizeDecision = "APPROVE" | "DENY";

export type DecisionOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "consent-required" }
  | { kind: "failed"; message: string };

/** 승인 요청 결과. 200의 redirectTo가 http(s) 주소일 때만 이동한다. */
export function classifyDecision(result: ClientResult): DecisionOutcome {
  if (result.kind === "lookup-failed") return { kind: "failed", message: AUTHORIZE_TEXT.unknown };
  if (result.kind === "success") {
    const redirectTo = isRecord(result.data) ? result.data.redirectTo : undefined;
    return typeof redirectTo === "string" && parseHttpUrl(redirectTo)
      ? { kind: "redirect", url: redirectTo }
      : { kind: "failed", message: AUTHORIZE_TEXT.unknown };
  }
  if (result.code === "MCP_CONSENT_REQUIRED") return { kind: "consent-required" };
  if (result.code === "MCP_AUTHORIZATION_INVALID") return { kind: "failed", message: AUTHORIZE_TEXT.invalid };
  return { kind: "failed", message: AUTHORIZE_TEXT.failed };
}

export type AuthorizeDeps = {
  member: MemberCall;
  /** 브라우저에서는 window.location.assign. */
  navigate: (url: string) => void;
  setSending: (sending: boolean) => void;
  setMessage: (message: string | null) => void;
  setConsentRequired: (required: boolean) => void;
};

/**
 * [승인]·[취소]를 눌렀을 때의 처리(BR3.2, BR3.6). 동의 안내를 보고 승인했을 때만 consent를 보낸다.
 * 이동하면 페이지를 떠나므로 버튼을 막아 둔 채로 끝낸다. 실패하면 버튼을 풀고 안내만 보인다.
 */
export async function submitDecision(deps: AuthorizeDeps, query: AuthorizeQuery, decision: AuthorizeDecision, consentShown: boolean): Promise<void> {
  const { member, navigate, setSending, setMessage, setConsentRequired } = deps;
  setSending(true);
  setMessage(null);
  const result = await callMember(member, AUTHORIZATIONS_PATH, {
    method: "POST",
    body: {
      clientId: query.clientId,
      redirectUri: query.redirectUri,
      state: query.state,
      codeChallenge: query.codeChallenge,
      resource: query.resource,
      decision,
      consent: decision === "APPROVE" && consentShown ? true : undefined,
    },
  });
  const outcome = classifyDecision(result);
  if (outcome.kind === "redirect") {
    navigate(outcome.url);
    return;
  }
  if (outcome.kind === "consent-required") {
    setConsentRequired(true);
    setMessage(AUTHORIZE_TEXT.consentRequired);
  } else {
    setMessage(outcome.message);
  }
  setSending(false);
}

/** 상태 칸의 만료 시각 표시. */
export function formatExpiresAt(expiresAt: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(expiresAt));
}

export type CopyResult = "copied" | "failed";

/** 복사 주소는 api의 mcpUrl 그대로다(BR7.5). 복사 실패도 표시한다. */
export async function copyConnectionUrl(copy: (text: string) => Promise<boolean>, mcpUrl: string, setCopyResult: (result: CopyResult) => void): Promise<void> {
  setCopyResult(await copy(mcpUrl) ? "copied" : "failed");
}

export type DisconnectPhase = "idle" | "confirming" | "sending";
export type ConnectionNotice = { tone: "done" | "error"; text: string };

/** 전체 해제 결과. 204만 성공이다(BR7.2). */
export function classifyDisconnect(result: ClientResult): ConnectionNotice {
  if (result.kind === "success" && result.status === 204) return { tone: "done", text: CONNECTION_TEXT.disconnected };
  if (result.kind === "api-error") return { tone: "error", text: CONNECTION_TEXT.disconnectFailed };
  return { tone: "error", text: CONNECTION_TEXT.disconnectUnknown };
}

export type DisconnectDeps = {
  member: MemberCall;
  setPhase: (phase: DisconnectPhase) => void;
  setNotice: (notice: ConnectionNotice | null) => void;
  /** 상태를 다시 읽는다. */
  reload: () => void;
};

/** [해제하기]를 눌렀을 때의 처리(BR7.2, BR7.5). 성공하면 상태를 다시 읽고, 실패하면 안내만 보이며 자동으로 다시 보내지 않는다. */
export async function confirmDisconnect({ member, setPhase, setNotice, reload }: DisconnectDeps): Promise<void> {
  setPhase("sending");
  setNotice(null);
  const notice = classifyDisconnect(await callMember(member, CONNECTION_PATH, { method: "DELETE" }));
  setNotice(notice);
  setPhase("idle");
  if (notice.tone === "done") reload();
}
