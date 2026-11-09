"use client";

import { useState } from "react";
import { copyText } from "@/lib/copy-text";
import { api } from "@/lib/api";
import {
  confirmDisconnect, copyConnectionUrl, type ConnectionNotice, type CopyResult, type DisconnectPhase,
} from "./claude-connection";
import { ClaudeConnectionView } from "./claude-connection-view";
import { useConnectionLookup } from "./use-connection-lookup";

/**
 * 연결 관리 화면(`/profile/claude`, BR7.5). 상태와 MCP 주소 복사, 확인 뒤 전체 해제를 둔다.
 * 해제 버튼은 상태와 상관없이 둔다. 연결 행이 없어도(NONE) 승인만 하고 교환하지 않은 코드를 지울 수 있고, 반복해도 204다(BR7.2).
 */
export function ClaudeConnectionPanel() {
  const { lookup, reload } = useConnectionLookup();
  const [phase, setPhase] = useState<DisconnectPhase>("idle");
  const [notice, setNotice] = useState<ConnectionNotice | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);

  const copy = () => {
    if (lookup?.kind !== "loaded") return;
    void copyConnectionUrl((text) => copyText(navigator.clipboard, text), lookup.status.mcpUrl, setCopyResult);
  };
  const confirm = () => confirmDisconnect({
    member: (path, request) => api.member(path, request),
    setPhase,
    setNotice,
    reload,
  });

  return (
    <ClaudeConnectionView lookup={lookup} phase={phase} notice={notice} copyResult={copyResult} onCopy={copy}
      onOpen={() => { setNotice(null); setPhase("confirming"); }} onConfirm={() => { void confirm(); }}
      onCancel={() => setPhase("idle")} onRetry={reload} />
  );
}
