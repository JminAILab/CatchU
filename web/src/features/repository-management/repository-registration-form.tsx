"use client";
import { useId, useSyncExternalStore } from "react";
import type { RepositoryRegistrationStore } from "./repository-registration-store";
import styles from "../analysis-request/analysis-request.module.css";

export function RepositoryRegistrationForm({ store, disabled }: {
  store: RepositoryRegistrationStore; disabled: boolean;
}) {
  const id = useId();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const pending = state.phase === "registering";
  return <form className={styles.section} onSubmit={event => { event.preventDefault(); if (!disabled) void store.submit(); }}>
    <label htmlFor={id}>공개 GitHub 저장소 주소</label>
    <input id={id} className={styles.urlInput} type="url" maxLength={512} placeholder="https://github.com/owner/repository"
      value={state.url} disabled={disabled || pending} onChange={event => store.change(event.target.value)}
      aria-invalid={state.failed || undefined} aria-describedby={`${id}-help${state.failed ? ` ${id}-message` : ""}`} required />
    <p id={`${id}-help`} className={styles.muted}>저장소를 등록한 뒤 분석 안내를 확인하고 동의할 수 있습니다. 등록만으로 분석이 시작되지는 않습니다.</p>
    <div className={styles.actions}><button type="submit" className={styles.secondaryButton} disabled={disabled || pending || !state.url.trim()} aria-busy={pending}>
      {pending ? "공개 여부 확인 중…" : "저장소 등록"}
    </button></div>
    {state.message && <p id={`${id}-message`} className={state.failed ? styles.messageError : styles.messageSuccess} role={state.failed ? "alert" : "status"}>{state.message}</p>}
  </form>;
}
