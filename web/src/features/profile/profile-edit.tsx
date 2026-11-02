"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { accessTokenStore } from "@/lib/access-token";
import { routes } from "@/lib/routes";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { readProfile, updateProfile, profileErrors, sameProfile, isUnprocessedSave, unprocessedSaveMessages, type Profile } from "./profile-api";
import { ProfileFields } from "./profile-fields";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "./use-unsaved-guard";
import authStyles from "@/components/auth/auth.module.css";
import styles from "./profile.module.css";

/**
 * 기존 프로필 수정(W02). 저장 성공·취소 후 상세 프로필로 돌아가고, 저장 실패 시 이 화면과 입력을 유지한다.
 * 최초 입력(/profile/setup)과 달리 취소가 있으며 이름이 저장된 회원만 이 화면에 들어온다(회원 경로 가드).
 */
export function ProfileEdit() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initial, setInitial] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const pending = useRef<AbortController | null>(null);
  const dirty = profile !== null && initial !== null && !sameProfile(profile, initial) && !saved;
  /** 앞선 저장 요청의 결과를 아직 모르는지. 다음 요청이 처리되지 않았을 때(연장 뒤 거부·재인증 거부·보내지 않음) 이 안내를 지우지 않는다. */
  const uncertain = useRef(false);
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
  // 로그아웃·[다시 로그인] 전 미저장 확인(#287)에 같은 판정을 알린다.
  useUnsavedChanges(dirty);

  async function submit() {
    if (!profile || busy || saved) return;
    const invalid = profileErrors(profile);
    if (invalid.length) { setErrors(invalid); return; }
    setBusy(true); setErrors([]);
    const abort = new AbortController(); pending.current = abort;
    const session = accessTokenStore.get();
    const current = () => !abort.signal.aborted && accessTokenStore.get() === session;
    try {
      const result = await updateProfile(api, profile, { isCurrent: current, signal: abort.signal });
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
      setSaved(true);
      router.replace(routes.profile);
    } finally { if (current()) setBusy(false); }
  }
  function cancel() {
    if (busy) return;
    if (dirty && !window.confirm(UNSAVED_MESSAGE)) return;
    router.replace(routes.profile);
  }

  if (!profile) {
    return <main className={authStyles.page}>
      {failed
        ? <>
          <LookupFailedState title="프로필을 불러오지 못했습니다" onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} />
          <p className={styles.backRow}><Link href={routes.profile}>돌아가기</Link></p>
        </>
        : <LoadingState>프로필을 불러오고 있습니다.</LoadingState>}
    </main>;
  }
  return <main className={authStyles.page}><div className={authStyles.panel}>
    <h1 className={authStyles.title}>프로필 수정</h1>
    <p className={authStyles.lead}>서비스에 저장된 프로필을 불러왔습니다. 표시 이름만 필수입니다.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <ProfileFields profile={profile} disabled={busy || saved} onChange={setProfile} />
      {errors.length > 0 && <div className={authStyles.error} role="alert">{errors.map(message => <p key={message}>{message}</p>)}</div>}
      <div className={styles.formActions}>
        <button className={styles.secondaryButton} type="button" disabled={busy || saved} onClick={cancel}>취소</button>
        <button className={authStyles.submit} type="submit" disabled={busy || saved}>{busy ? "처리 중" : "저장"}</button>
      </div>
    </form>
  </div></main>;
}
