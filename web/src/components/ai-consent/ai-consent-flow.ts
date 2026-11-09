/**
 * 동의가 필요한 AI 실행 요청 흐름(12월 intent U2 기능 설계 W2, 계약 C-04).
 * 403 `AI_CONSENT_REQUIRED`를 받으면 동의 창을 열고, [동의] → `POST /v1/ai-consent` 성공 뒤 같은 요청을 **한 번만** 다시 보낸다.
 * [닫기]면 실행하지 않는다. 다시 보낸 요청이 또 403이어도 동의 창을 다시 열지 않고 그 결과를 돌려준다(반복 방지).
 */
import type { ClientResult } from "../../lib/api-client.ts";
import { AI_NOTICE_VERSION } from "./ai-consent-notice.ts";

export type ConsentRunResult =
  /** 요청 결과(처음 결과 또는 동의 뒤 한 번 다시 보낸 결과). */
  | { kind: "result"; result: ClientResult; retried: boolean }
  /** 동의 창을 닫아 실행하지 않았다. */
  | { kind: "declined" }
  /** 동의 기록이 실패해 다시 보내지 않았다. */
  | { kind: "consent-failed"; result: ClientResult };

export type ConsentRunOptions = {
  /** 실행 요청. 같은 요청을 다시 보낼 수 있어야 한다(생성 POST라면 호출자가 같은 재전송 키를 쓴다). */
  request: () => Promise<ClientResult>;
  /** 동의 창을 열고 [동의]면 true, [닫기]면 false. */
  askConsent: () => Promise<boolean>;
  /** 동의 기록 요청. */
  recordConsent: () => Promise<ClientResult>;
};

export function isConsentRequired(result: ClientResult): boolean {
  return result.kind === "api-error" && result.status === 403 && result.code === "AI_CONSENT_REQUIRED";
}

export async function runWithConsent({ request, askConsent, recordConsent }: ConsentRunOptions): Promise<ConsentRunResult> {
  const first = await request();
  if (!isConsentRequired(first)) return { kind: "result", result: first, retried: false };
  if (!(await askConsent())) return { kind: "declined" };
  const recorded = await recordConsent();
  if (recorded.kind !== "success") return { kind: "consent-failed", result: recorded };
  return { kind: "result", result: await request(), retried: true };
}

/** 회원 API 호출 함수로 동의 기록 요청을 만든다. 본문은 지금 보이는 고지의 판본 하나다. */
export function consentRecorder(member: (path: string, request: { method: "POST"; body: unknown }) => Promise<ClientResult>) {
  return () => member("/ai-consent", { method: "POST", body: { noticeVersion: AI_NOTICE_VERSION } });
}

export const CONSENT_RECORD_FAILED = "동의를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

/** 동의 창 표시 상태를 바꾸는 함수들(React state setter). */
export type ConsentDialogView = {
  setOpen(open: boolean): void;
  setBusy(busy: boolean): void;
  setError(message: string | null): void;
};

/**
 * 동의 창 제어(`useAiConsent`가 쓴다). 창은 [동의] 뒤 기록이 끝날 때까지 열어 두고(버튼은 막음), 기록이 성공하면 닫는다.
 * 기록이 실패하면 창을 연 채 안내를 보이고 요청은 다시 보내지 않는다. 그 뒤 [동의]·[닫기]는 창만 닫는다.
 */
export function createConsentDialogControl(view: ConsentDialogView, record: () => Promise<ClientResult>) {
  let pending: ((agreed: boolean) => void) | null = null;
  return {
    /** 창의 [동의](true)·[닫기]·Esc(false). 기다리는 질문이 없으면 창만 닫는다. */
    answer(agreed: boolean): void {
      const resolve = pending;
      pending = null;
      if (resolve === null || !agreed) view.setOpen(false);
      resolve?.(agreed);
    },
    async run(request: () => Promise<ClientResult>): Promise<ConsentRunResult> {
      return runWithConsent({
        request,
        askConsent: () => new Promise<boolean>((resolve) => {
          pending = resolve;
          view.setError(null);
          view.setOpen(true);
        }),
        recordConsent: async () => {
          view.setBusy(true);
          try {
            const result = await record();
            if (result.kind === "success") view.setOpen(false);
            else view.setError(CONSENT_RECORD_FAILED);
            return result;
          } finally {
            view.setBusy(false);
          }
        },
      });
    },
  };
}
