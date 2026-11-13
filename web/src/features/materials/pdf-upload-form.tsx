"use client";

import { useRef, useState, type FormEvent } from "react";
import { AiNoticeLine } from "../../components/ai-consent/ai-notice-line.tsx";
import { PDF_COUNT_LIMIT_TEXT, PDF_LIMITS, PDF_SENSITIVE_INFO_NOTICE } from "./pdf-materials-api.ts";
import styles from "./materials.module.css";

export type PdfUploadStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done" }
  /** 보내기 전 검사 거부·서버 거부·동의 닫음. `lines`의 첫 줄이 결과, 나머지가 이유다. */
  | { kind: "failed"; lines: string[] };

export type PdfUploadFormProps = {
  status: PdfUploadStatus;
  /** 이미 20벌이면 올릴 수 없다(BR1.2). */
  limitReached: boolean;
  /** 고른 파일들과 제목을 넘긴다. 올라가면 true를 돌려주고, 이때만 입력을 비운다. */
  onSubmit: (files: File[], title: string) => Promise<boolean>;
};

/**
 * PDF 올리기(U8 W1, 계획 10.1). 민감 정보 안내(텍스트 자료와 같은 문구, BR1.5)와 외부 AI 한 줄 고지를 늘 보인다.
 * 파일 종류·크기·제목은 보내기 전에 화면 모델이 검사하고(`pdfUploadErrors`), 여기서는 고른 값을 넘기기만 한다.
 * 올리는 중에는 다시 보내지 않는다. 실패하면 고른 파일·제목을 그대로 둔다.
 */
export function PdfUploadForm({ status, limitReached, onSubmit }: PdfUploadFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const busy = status.kind === "uploading";
  const blocked = busy || limitReached;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const uploaded = await onSubmit(Array.from(fileRef.current?.files ?? []), title);
    if (uploaded) {
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className={styles.editor} aria-labelledby="pdf-upload-title" data-testid="pdf-upload-form">
      <h2 id="pdf-upload-title">PDF 올리기</h2>
      <p className={styles.notice} data-testid="pdf-sensitive-notice">{PDF_SENSITIVE_INFO_NOTICE}</p>
      <AiNoticeLine />
      <form onSubmit={(event) => { void submit(event); }} noValidate>
        <label className={styles.field} htmlFor="pdf-file-input">PDF 파일
          <input id="pdf-file-input" ref={fileRef} type="file" accept="application/pdf,.pdf" data-testid="pdf-file-input"
            disabled={blocked} aria-describedby="pdf-file-help" />
        </label>
        <p id="pdf-file-help" className={styles.small}>
          파일 하나, {Math.round(PDF_LIMITS.fileSizeBytes / (1024 * 1024))} MB 이하, 50쪽까지. 올린 뒤 쪽별 글을 추출합니다.
        </p>
        <label className={styles.field} htmlFor="pdf-title-input">제목(선택)
          <input id="pdf-title-input" data-testid="pdf-title-input" value={title} disabled={blocked}
            aria-describedby="pdf-title-help" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p id="pdf-title-help" className={styles.small}>비우면 파일 이름을 제목으로 씁니다. {PDF_LIMITS.title}자까지.</p>
        {limitReached && <p role="status" className={styles.notice} data-testid="pdf-count-limit">{PDF_COUNT_LIMIT_TEXT}</p>}
        {status.kind === "uploading" && <p role="status" data-testid="pdf-upload-status">PDF를 올리고 있습니다.</p>}
        {status.kind === "done" && <p role="status" data-testid="pdf-upload-status">올렸습니다. 글을 추출하고 있습니다. 새로고침하면 상태가 바뀝니다.</p>}
        {status.kind === "failed" && <div role="alert" className={styles.error} data-testid="pdf-upload-status">
          {status.lines.map((line) => <p key={line}>{line}</p>)}
        </div>}
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} data-testid="pdf-upload-button" disabled={blocked}>
            {busy ? "올리는 중…" : "올리기"}
          </button>
        </div>
      </form>
    </section>
  );
}
