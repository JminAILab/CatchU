"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { accessTokenStore } from "@/lib/access-token";
import { routes } from "@/lib/routes";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { readProfile, type Profile } from "./profile-api";
import authStyles from "@/components/auth/auth.module.css";
import styles from "./profile.module.css";

/**
 * 상세 프로필(W02-P). GET /v1/me의 저장된 본인 프로필만 표시한다.
 * 조회 실패는 빈 프로필이나 이름 미저장으로 바꾸지 않고 다시 불러오기로 처리한다.
 * GitHub 연동 화면(/profile/github)은 #253 범위다. 그 전에는 없는 주소로 이동해 404와 로그인 정보 유실이 생기므로
 * 프로필 메뉴의 [로그아웃]처럼 '연결 전'으로 표시하고 아무 동작도 하지 않는다(초점은 받아 보조기기가 읽을 수 있다).
 */
export function ProfileDetail() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const session = accessTokenStore.get();
    void readProfile(api, abort.signal).catch(() => null).then(value => {
      if (abort.signal.aborted || accessTokenStore.get() !== session) return;
      if (!value) { setFailed(true); return; }
      setProfile(value); setFailed(false);
    });
    return () => abort.abort();
  }, [attempt]);

  if (!profile) {
    return <main className={authStyles.page}>
      {failed
        ? <LookupFailedState title="프로필을 불러오지 못했습니다" onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} />
        : <LoadingState>프로필을 불러오고 있습니다.</LoadingState>}
    </main>;
  }
  const text = (value: string) => value === "" ? <span className={styles.empty}>입력하지 않았습니다</span> : value;
  return <main className={authStyles.page}><div className={authStyles.panel}>
    <h1 className={authStyles.title}>프로필</h1>
    <p className={authStyles.lead}>서비스에 저장된 내 프로필입니다.</p>
    <dl className={styles.detail}>
      <div><dt>표시 이름</dt><dd>{profile.displayName}</dd></div>
      <div><dt>한 줄 소개</dt><dd>{text(profile.introduction)}</dd></div>
      <div><dt>희망 직무</dt><dd>{text(profile.desiredRole)}</dd></div>
      <div><dt>기술</dt><dd>{profile.skills.length === 0
        ? <span className={styles.empty}>입력하지 않았습니다</span>
        : <ul className={styles.skills}>{profile.skills.map((skill, index) => <li key={index}>{skill === "" ? "(빈 항목)" : skill}</li>)}</ul>}</dd></div>
    </dl>
    <p className={styles.note}>직접 입력한 정보이며 검증된 경력이나 기술을 뜻하지 않습니다.</p>
    <div className={styles.actions}>
      <Link className={styles.primaryLink} href={routes.profileEdit}>프로필 수정</Link>
      <button type="button" className={styles.pendingAction} aria-disabled="true">
        GitHub 연결 상태 <span className={authStyles.pendingTag}>연결 전</span>
      </button>
    </div>
  </div></main>;
}
