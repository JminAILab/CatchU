"use client";

import { useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { authorizeView, submitDecision, type AuthorizeDecision } from "./claude-connection";
import { ClaudeAuthorizeView } from "./claude-authorize-view";
import { useConnectionLookup } from "./use-connection-lookup";

const subscribeNothing = () => () => {};
const readSearch = () => window.location.search;
const noSearchOnServer = () => null;

/**
 * 승인 화면(`/profile/claude/authorize`, BR3.2~BR3.6). /authorize가 넘긴 쿼리를 읽어 연결 상태와 함께 안내를 보인다.
 * 승인·취소는 회원 토큰으로 fetch하고(폼 제출 아님) 응답의 redirectTo로만 이동한다. 흐름은 `claude-connection.ts`의 `submitDecision`이 맡는다.
 */
export function ClaudeAuthorizeScreen() {
  // 쿼리는 브라우저에서만 읽는다. 서버 렌더링에서는 null이라 불러오는 중으로 보인다.
  const search = useSyncExternalStore(subscribeNothing, readSearch, noSearchOnServer);
  const { lookup, reload } = useConnectionLookup();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const view = authorizeView(search, lookup, consentRequired);

  const decide = (decision: AuthorizeDecision) => {
    if (view.kind !== "ready") return;
    void submitDecision({
      member: (path, request) => api.member(path, request),
      navigate: (url) => window.location.assign(url),
      setSending,
      setMessage,
      setConsentRequired,
    }, view.query, decision, view.showConsent);
  };

  return (
    <ClaudeAuthorizeView view={view} sending={sending} message={message}
      onApprove={() => decide("APPROVE")} onDeny={() => decide("DENY")} onRetry={reload} />
  );
}
