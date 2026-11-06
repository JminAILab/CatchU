"use client";

import { useEffect, useRef, useState } from "react";
import { copyText, type ClipboardLike } from "@/lib/copy-text";
import type { PublicationState } from "./publications-api";
import styles from "./publications.module.css";

export type { ClipboardLike };

/**
 * 클립보드 쓰기. 실제로 성공했을 때만 true다. 클립보드를 쓸 수 없는 환경(권한 거부·비보안 출처)은 false이고 화면은 수동 복사를 안내한다.
 * 제출 3(W6)에서 10월 `share-links/copy-text.ts`를 공용 `lib/copy-text.ts`로 옮겼으므로(U6도 쓴다) 그 함수를 그대로 쓴다.
 */
export const copyUrl = copyText;

/** [URL 복사]. 상태와 관계없이 보인다(#416 2026-11-03). 성공 뒤에만 완료를 표시하고 실패하면 주소를 직접 복사하게 보여 준다. */
export function CopyUrlButton({ url, disabled = false }: { url: string; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const manual = useRef<HTMLInputElement>(null);
  const copy = async () => {
    const ok = await copyUrl(typeof navigator === "undefined" ? undefined : navigator.clipboard, url);
    setStatus(ok ? "copied" : "failed");
  };
  useEffect(() => { if (status === "failed") manual.current?.select(); }, [status]);
  return (
    <span className={styles.copy}>
      <button type="button" className={styles.secondaryButton} data-testid="publication-copy-url" disabled={disabled}
        onClick={() => void copy()}>{status === "failed" ? "다시 복사" : "URL 복사"}</button>
      {status === "copied" && <span className={styles.ok} role="status">URL을 복사했습니다.</span>}
      {status === "failed" && (
        <span className={styles.manual} role="alert">
          URL을 복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.
          <input ref={manual} className={styles.manualInput} value={url} readOnly aria-label="복사할 URL" onFocus={(event) => event.target.select()} />
        </span>
      )}
    </span>
  );
}

/**
 * [링크 열기](#416 2026-11-02·11-03). [URL 복사]가 복사하는 것과 같은 서버 응답의 `url`을 새 탭으로 연다. 새 API를 더하지 않고
 * 작성자 로그인으로 받은 사람 접근 조건을 우회하지 않는다. 서버가 돌려준 상태가 `ACTIVE`일 때만 보인다.
 */
export function OpenLinkAnchor({ url, state }: { url: string; state: PublicationState }) {
  if (state !== "ACTIVE") return null;
  return (
    <a className={styles.secondaryButton} href={url} target="_blank" rel="noopener noreferrer" data-testid="publication-open-link">
      링크 열기<span className="visually-hidden"> (새 탭)</span>
    </a>
  );
}
