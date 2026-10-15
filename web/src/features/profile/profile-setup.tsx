"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { accessTokenStore } from "@/lib/access-token";
import { routes } from "@/lib/routes";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { readProfile, completeProfileSetup, profileErrors, type Profile } from "./profile-api";
import styles from "@/components/auth/auth.module.css";

export function ProfileSetup() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initial, setInitial] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const pending = useRef<AbortController | null>(null);
  const dirty = profile !== null && JSON.stringify(profile) !== JSON.stringify(initial) && !saved;
  useEffect(() => {
    const abort = new AbortController();
    const session = accessTokenStore.get();
    void readProfile(api, abort.signal).catch(() => null).then(value => {
      if (abort.signal.aborted || accessTokenStore.get() !== session) return;
      if (!value) { setFailed(true); return; }
      setProfile(value); setInitial(value); setFailed(false);
    });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !window.confirm("저장하지 않은 입력이 있습니다. 이동하시겠습니까?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);

  async function submit() {
    if (!profile || busy) return;
    const invalid = profileErrors(profile);
    if (invalid.length) { setErrors(invalid); return; }
    setBusy(true); setErrors([]);
    const abort = new AbortController(); pending.current = abort;
    const session = accessTokenStore.get();
    const current = () => !abort.signal.aborted && accessTokenStore.get() === session;
    try {
      const result = await completeProfileSetup(api, profile, {
        alreadySaved: saved, onSaved: () => setSaved(true), isCurrent: current, signal: abort.signal,
      });
      if (result === "cancelled") return;
      if (result === "save-failed") {
        setErrors(["저장 결과를 확인하지 못했습니다. 입력을 유지했습니다. 다시 시도해 주세요."]); return;
      }
      if (result === "refresh-failed") {
        setErrors(["저장은 완료됐지만 회원 정보를 확인하지 못했습니다. 다시 확인해 주세요."]); return;
      }
      router.replace(routes.home);
    } catch {
      if (current()) setErrors(["처리 결과를 확인하지 못했습니다. 입력을 유지했습니다. 다시 시도해 주세요."]);
    } finally { if (current()) setBusy(false); }
  }
  if (failed && !profile) return <main className={styles.page}><LookupFailedState title="프로필을 불러오지 못했습니다" onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} /></main>;
  if (!profile) return <main className={styles.page}><LoadingState /></main>;
  const edit = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value });
  return <main className={styles.page}><div className={styles.panel}>
    <h1 className={styles.title}>최초 프로필 입력</h1>
    <p className={styles.lead}>표시 이름을 입력해 주세요. 나머지 항목은 선택 사항입니다.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <fieldset disabled={busy || saved} style={{ border: 0, padding: 0, margin: 0 }}>
        <label className={styles.field}>표시 이름 (필수, 최대 50자)<input className={styles.input} value={profile.displayName} onChange={e => edit("displayName", e.target.value)} autoComplete="nickname" /></label>
        <label className={styles.field}>한 줄 소개 (최대 200자)<input className={styles.input} value={profile.introduction} onChange={e => edit("introduction", e.target.value)} /></label>
        <label className={styles.field}>희망 직무 (최대 100자)<input className={styles.input} value={profile.desiredRole} onChange={e => edit("desiredRole", e.target.value)} /></label>
        <p>기술 (최대 20개, 각 50자)</p>
        {profile.skills.map((skill, index) => <div key={index}>
          <label className={styles.field}>기술 {index + 1}<input className={styles.input} value={skill} onChange={e => edit("skills", profile.skills.map((s, i) => i === index ? e.target.value : s))} /></label>
          <button type="button" onClick={() => edit("skills", profile.skills.filter((_, i) => i !== index))}>기술 {index + 1} 삭제</button>
        </div>)}
        <button type="button" disabled={profile.skills.length >= 20} onClick={() => edit("skills", [...profile.skills, ""])}>기술 추가</button>
      </fieldset>
      {errors.length > 0 && <div className={styles.error} role="alert">{errors.map(message => <p key={message}>{message}</p>)}</div>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "처리 중" : saved ? "회원 정보 다시 확인" : "저장하고 시작하기"}</button>
    </form>
  </div></main>;
}
