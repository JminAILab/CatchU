"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PROFILE_SKILL_LIMITS, type Profile } from "./profile-api.ts";
import { commitSkill, isComposingKey, removeSkill, selectSkill, type SkillEditor } from "./skill-editor.ts";
import styles from "@/components/auth/auth.module.css";
import profileStyles from "./profile.module.css";

/**
 * 최초 입력(/profile/setup)과 기존 수정(/profile/edit)이 함께 쓰는 네 입력 항목. 검증·저장은 profile-api가 맡는다.
 * 기술은 입력칸 하나와 칩 목록으로 고친다(#469). 입력칸·선택 상태(`skillEditor`)는 화면이 가져 미저장 판정과 저장 전 확인에 쓴다.
 */
export function ProfileFields({ profile, disabled, onChange, skillEditor, onSkillEditorChange }: {
  profile: Profile; disabled: boolean; onChange: (next: Profile) => void;
  skillEditor: SkillEditor; onSkillEditorChange: (next: SkillEditor) => void;
}) {
  const edit = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });
  const id = useId();
  const skillInput = useRef<HTMLInputElement>(null);
  const chipButtons = useRef<(HTMLButtonElement | null)[]>([]);
  /** 칩을 지운 뒤 초점을 둘 곳. 지운 버튼이 사라져 초점을 잃지 않게 다음 그리기 뒤에 옮긴다. */
  const focusAfterRemove = useRef<number | "input" | null>(null);
  const [skillMessage, setSkillMessage] = useState<string | null>(null);
  const { skills } = profile;
  const editing = skillEditor.selected !== null && skillEditor.selected < skills.length ? skillEditor.selected : null;
  const addBlocked = editing === null && skills.length >= PROFILE_SKILL_LIMITS.count;

  useEffect(() => {
    const target = focusAfterRemove.current;
    if (target === null) return;
    focusAfterRemove.current = null;
    (target === "input" ? skillInput.current : chipButtons.current[target])?.focus();
  });

  function changeSkillEditor(next: SkillEditor) {
    setSkillMessage(null);
    onSkillEditorChange(next);
  }
  function commit() {
    const result = commitSkill(skills, skillEditor);
    if (!result.ok) { setSkillMessage(result.message); return; }
    setSkillMessage(null);
    onChange({ ...profile, skills: result.skills });
    onSkillEditorChange(result.editor);
    skillInput.current?.focus();
  }
  function select(index: number) {
    const next = selectSkill(skills, skillEditor, index);
    changeSkillEditor(next);
    if (next.selected !== null) skillInput.current?.focus();
  }
  function remove(index: number) {
    const result = removeSkill(skills, skillEditor, index);
    setSkillMessage(null);
    onChange({ ...profile, skills: result.skills });
    onSkillEditorChange(result.editor);
    focusAfterRemove.current = result.skills.length === 0 ? "input" : Math.min(index, result.skills.length - 1);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || isComposingKey(event.nativeEvent)) return;
    // 기술 입력칸의 Enter는 [추가]·[수정]이다. 폼 제출(프로필 전체 저장)로 이어지지 않게 막는다.
    event.preventDefault();
    commit();
  }

  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <label className={styles.field}>표시 이름 (필수, 최대 50자)<input className={styles.input} value={profile.displayName} onChange={e => edit("displayName", e.target.value)} autoComplete="nickname" /></label>
    <label className={styles.field}>한 줄 소개 (최대 200자)<input className={styles.input} value={profile.introduction} onChange={e => edit("introduction", e.target.value)} /></label>
    <label className={styles.field}>희망 직무 (최대 100자)<input className={styles.input} value={profile.desiredRole} onChange={e => edit("desiredRole", e.target.value)} /></label>
    <div className={profileStyles.skillField}>
      <label className={profileStyles.skillLabel} htmlFor={`${id}-skill`}>기술 (최대 {PROFILE_SKILL_LIMITS.count}개, 각 {PROFILE_SKILL_LIMITS.length}자)</label>
      <div className={profileStyles.skillEntry}>
        <input id={`${id}-skill`} ref={skillInput} className={styles.input} value={skillEditor.draft} autoComplete="off"
          aria-describedby={skillMessage ? `${id}-skill-message` : undefined}
          onChange={e => changeSkillEditor({ ...skillEditor, draft: e.target.value })} onKeyDown={keyDown} />
        <button className={profileStyles.skillCommit} type="button" disabled={addBlocked} onClick={commit}>{editing === null ? "추가" : "수정"}</button>
      </div>
      {skillMessage && <p id={`${id}-skill-message`} className={profileStyles.skillMessage} role="alert">{skillMessage}</p>}
      <p id={`${id}-skill-hint`} className={profileStyles.skillHint}>기술 칩을 클릭하면 수정할 수 있습니다.</p>
      <div className={profileStyles.skillBox}>
        {skills.length === 0
          ? <p className={profileStyles.skillEmpty}>입력한 기술이 없습니다.</p>
          : <ul className={profileStyles.skillChips} aria-label="입력한 기술" aria-describedby={`${id}-skill-hint`}>
            {skills.map((skill, index) => {
              const blank = skill.trim() === "";
              const name = blank ? "빈 항목" : skill;
              return <li key={index} className={index === editing ? `${profileStyles.skillChip} ${profileStyles.skillChipSelected}` : profileStyles.skillChip}>
                <button className={profileStyles.skillChipName} type="button" aria-pressed={index === editing}
                  ref={button => { chipButtons.current[index] = button; }} onClick={() => select(index)}>
                  {blank ? <span className={profileStyles.skillBlank}>(빈 항목)</span> : skill}
                </button>
                <button className={profileStyles.skillChipRemove} type="button" aria-label={`${name} 삭제`} onClick={() => remove(index)}>×</button>
              </li>;
            })}
          </ul>}
      </div>
    </div>
  </fieldset>;
}
