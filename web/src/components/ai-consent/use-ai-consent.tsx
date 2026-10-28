"use client";

import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { ClientResult } from "@/lib/api-client";
import { consentRecorder, createConsentDialogControl, type ConsentRunResult } from "./ai-consent-flow";
import { AiConsentDialog } from "./ai-consent-dialog";

/**
 * 동의가 필요한 AI 실행 요청을 보내는 훅(계약 C-04: 각 Unit은 403 AI_CONSENT_REQUIRED를 받으면 이 창을 연다).
 * `run(request)`이 403이면 창을 열고, [동의]가 기록되면 같은 요청을 한 번 다시 보낸다. 화면은 돌려준 `dialog`를 그린다.
 * 흐름은 `ai-consent-flow.ts`의 `createConsentDialogControl`이 맡고, 이 훅은 표시 상태만 잇는다.
 */
export function useAiConsent(): { run: (request: () => Promise<ClientResult>) => Promise<ConsentRunResult>; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [control] = useState(() => createConsentDialogControl({ setOpen, setBusy, setError },
    consentRecorder((path, request) => api.member(path, request))));

  const dialog = <AiConsentDialog open={open} busy={busy} error={error}
    onAgree={() => control.answer(true)} onClose={() => control.answer(false)} />;
  return { run: control.run, dialog };
}
