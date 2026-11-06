"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { accessTokenStore } from "@/lib/access-token";
import { routes } from "@/lib/routes";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { readProfile, completeProfileSetup, profileErrors, isUnprocessedSave, unprocessedSaveMessages, type Profile } from "./profile-api";
import { ProfileFields } from "./profile-fields";
import { emptySkillEditor, pendingSkill, pendingSkillMessage, type SkillEditor } from "./skill-editor";
import { useUnsavedGuard } from "./use-unsaved-guard";
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
  const [skillEditor, setSkillEditor] = useState<SkillEditor>(emptySkillEditor);
  const pending = useRef<AbortController | null>(null);
  // 저장본과 다른 입력에 더해, 기술 입력칸의 미확정 변경(#469)도 저장하지 않은 입력으로 본다.
  const dirty = profile !== null
    && (JSON.stringify(profile) !== JSON.stringify(initial) || pendingSkill(profile.skills, skillEditor) !== null) && !saved;
  /** 앞선 저장 요청의 결과를 아직 모르는지. 다음 요청이 처리되지 않았을 때(연장 뒤 거부·재인증 거부·보내지 않음) 이 안내를 지우지 않는다. */
  const uncertain = useRef(false);
  // 로그아웃·[다시 로그인] 전 미저장 확인(#287)에 같은 판정을 알린다. 링크 이동·새로고침 확인은 아래 effect가 맡는다.
  useUnsavedChanges(dirty);
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
  useUnsavedGuard(dirty);

  async function submit() {
    if (!profile || busy) return;
    // 기술 입력칸에 반영하지 않은 변경이 있으면 저장 요청을 보내지 않고 입력을 둔 채 [추가]·[수정]을 안내한다(#469).
    // 저장이 끝난 뒤의 [회원 정보 다시 확인]은 조회만 다시 하므로 막지 않는다.
    const unconfirmed = saved ? null : pendingSkillMessage(profile.skills, skillEditor);
    if (unconfirmed) { setErrors([unconfirmed]); return; }
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
      if (isUnprocessedSave(result)) {
        // 이번 요청은 처리되지 않았다(연장 뒤 거부·재인증 거부·보내지 않음). 입력을 두고 다시 누르게 하며, 앞선 요청의 결과 불명 안내는 남긴다.
        setErrors(unprocessedSaveMessages(result, uncertain.current)); return;
      }
      if (result === "save-failed") {
        uncertain.current = true;
        setErrors(["저장 결과를 확인하지 못했습니다. 입력을 유지했습니다. 다시 시도해 주세요."]); return;
      }
      uncertain.current = false;
      if (result === "refresh-failed") {
        setErrors(["저장은 완료됐지만 회원 정보를 확인하지 못했습니다. 다시 확인해 주세요."]); return;
      }
      router.replace(routes.home);
    } catch {
      if (current()) {
        uncertain.current = true;
        setErrors(["처리 결과를 확인하지 못했습니다. 입력을 유지했습니다. 다시 시도해 주세요."]);
      }
    } finally { if (current()) setBusy(false); }
  }
  if (failed && !profile) return <main className={styles.page}><LookupFailedState title="프로필을 불러오지 못했습니다" onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} /></main>;
  if (!profile) return <main className={styles.page}><LoadingState /></main>;
  return <main className={styles.page}><div className={styles.panel}>
    <h1 className={styles.title}>최초 프로필 입력</h1>
    <p className={styles.lead}>표시 이름을 입력해 주세요. 나머지 항목은 선택 사항입니다.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <ProfileFields profile={profile} disabled={busy || saved} onChange={setProfile} skillEditor={skillEditor} onSkillEditorChange={setSkillEditor} />
      {errors.length > 0 && <div className={styles.error} role="alert">{errors.map(message => <p key={message}>{message}</p>)}</div>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "처리 중" : saved ? "회원 정보 다시 확인" : "저장하고 시작하기"}</button>
    </form>
  </div></main>;
}
