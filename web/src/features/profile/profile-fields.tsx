"use client";
import type { Profile } from "./profile-api";
import styles from "@/components/auth/auth.module.css";

/** 최초 입력(/profile/setup)과 기존 수정(/profile/edit)이 함께 쓰는 네 입력 항목. 검증·저장은 profile-api가 맡는다. */
export function ProfileFields({ profile, disabled, onChange }: {
  profile: Profile; disabled: boolean; onChange: (next: Profile) => void;
}) {
  const edit = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
    <label className={styles.field}>표시 이름 (필수, 최대 50자)<input className={styles.input} value={profile.displayName} onChange={e => edit("displayName", e.target.value)} autoComplete="nickname" /></label>
    <label className={styles.field}>한 줄 소개 (최대 200자)<input className={styles.input} value={profile.introduction} onChange={e => edit("introduction", e.target.value)} /></label>
    <label className={styles.field}>희망 직무 (최대 100자)<input className={styles.input} value={profile.desiredRole} onChange={e => edit("desiredRole", e.target.value)} /></label>
    <p>기술 (최대 20개, 각 50자)</p>
    {profile.skills.map((skill, index) => <div key={index}>
      <label className={styles.field}>기술 {index + 1}<input className={styles.input} value={skill} onChange={e => edit("skills", profile.skills.map((s, i) => i === index ? e.target.value : s))} /></label>
      <button type="button" onClick={() => edit("skills", profile.skills.filter((_, i) => i !== index))}>기술 {index + 1} 삭제</button>
    </div>)}
    <button type="button" disabled={profile.skills.length >= 20} onClick={() => edit("skills", [...profile.skills, ""])}>기술 추가</button>
  </fieldset>;
}
