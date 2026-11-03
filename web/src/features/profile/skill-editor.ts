import { PROFILE_SKILL_LIMITS, SKILL_COUNT_MESSAGE, hasUnsavableChars, overLength } from './profile-api.ts';

/**
 * 프로필 기술 칩 입력(#469)의 입력칸·선택 상태와 변경 규칙. 화면(`ProfileFields`)과 최초 입력·프로필 수정의 저장 전 확인이 함께 쓴다.
 * 서버 반영은 기존 전체 프로필 저장이 맡는다. 빈 값·앞뒤 공백·같은 이름은 기존처럼 막거나 다듬지 않고, 개수·길이 제한은 서버 제한과 같다.
 */
export type SkillEditor = {
  /** 입력칸의 글자. */
  draft: string;
  /** 수정 중인 칩의 위치. null이면 추가 모드다. */
  selected: number | null;
};

export function emptySkillEditor(): SkillEditor {
  return { draft: '', selected: null };
}

/** 칩 이름 클릭. 고른 칩을 강조하고 이름을 입력칸에 채운다. 이미 고른 칩을 다시 누르면 미확정 수정을 버리고 추가 모드로 돌아간다. */
export function selectSkill(skills: readonly string[], editor: SkillEditor, index: number): SkillEditor {
  if (index < 0 || index >= skills.length) return editor;
  if (activeSelection(skills, editor) === index) return emptySkillEditor();
  return { draft: skills[index], selected: index };
}

export type SkillCommit = { ok: true; skills: string[]; editor: SkillEditor } | { ok: false; message: string };

/** [추가]·[수정]. 추가는 목록 끝에 붙이고 수정은 고른 칩에 반영한 뒤, 입력칸을 비운 추가 모드로 돌아간다. 제한을 넘으면 반영하지 않고 입력을 둔다. */
export function commitSkill(skills: readonly string[], editor: SkillEditor): SkillCommit {
  const editing = activeSelection(skills, editor);
  if (editing === null && skills.length >= PROFILE_SKILL_LIMITS.count) return { ok: false, message: SKILL_COUNT_MESSAGE };
  if (overLength(editor.draft, PROFILE_SKILL_LIMITS.length)) {
    return { ok: false, message: `기술 이름은 최대 ${PROFILE_SKILL_LIMITS.length}자까지 입력할 수 있습니다.` };
  }
  if (hasUnsavableChars(editor.draft)) return { ok: false, message: '기술 이름에 저장할 수 없는 문자가 있습니다.' };
  const next = editing === null ? [...skills, editor.draft] : skills.map((skill, index) => (index === editing ? editor.draft : skill));
  return { ok: true, skills: next, editor: emptySkillEditor() };
}

/** 칩의 ×. 그 기술만 지운다. 수정 중이던 칩을 지우면 추가 모드로 돌아가고, 그 밖에는 입력칸 글자와 다른 칩의 선택을 그대로 둔다. */
export function removeSkill(skills: readonly string[], editor: SkillEditor, index: number): { skills: string[]; editor: SkillEditor } {
  if (index < 0 || index >= skills.length) return { skills: [...skills], editor };
  const next = skills.filter((_, i) => i !== index);
  const editing = activeSelection(skills, editor);
  if (editing === index) return { skills: next, editor: emptySkillEditor() };
  if (editing === null) return { skills: next, editor: { draft: editor.draft, selected: null } };
  return { skills: next, editor: { draft: editor.draft, selected: editing > index ? editing - 1 : editing } };
}

/** 미확정 변경: 새 기술을 입력했거나(`add`) 고른 칩의 이름을 바꾼 뒤(`edit`) 아직 [추가]·[수정]하지 않은 상태. 칩을 고르기만 한 것은 변경이 아니다. */
export function pendingSkill(skills: readonly string[], editor: SkillEditor): 'add' | 'edit' | null {
  const editing = activeSelection(skills, editor);
  if (editing === null) return editor.draft === '' ? null : 'add';
  return editor.draft === skills[editing] ? null : 'edit';
}

/** 미확정 변경이 있을 때 [저장] 대신 보여 줄 안내. 저장 요청은 보내지 않고 입력은 그대로 둔다. */
export function pendingSkillMessage(skills: readonly string[], editor: SkillEditor): string | null {
  const pending = pendingSkill(skills, editor);
  if (pending === 'edit') return '선택한 기술의 수정을 아직 반영하지 않아 저장하지 않았습니다. [수정]을 누른 뒤 다시 저장해 주세요.';
  if (pending === null) return null;
  return skills.length >= PROFILE_SKILL_LIMITS.count
    ? `입력칸의 기술을 아직 추가하지 않아 저장하지 않았습니다. 기술은 최대 ${PROFILE_SKILL_LIMITS.count}개까지라 다른 기술을 지운 뒤 [추가]해 주세요.`
    : '입력칸의 기술을 아직 추가하지 않아 저장하지 않았습니다. [추가]를 누른 뒤 다시 저장해 주세요.';
}

/**
 * 한글 등 입력기 조합을 확정하는 키 입력인지. 이 Enter는 조합만 확정하고 [추가]·[수정]으로 처리하지 않는다.
 * Safari는 조합을 확정하는 Enter의 `isComposing`이 false라서 keyCode 229도 함께 본다.
 */
export function isComposingKey(event: { isComposing: boolean; keyCode: number }): boolean {
  return event.isComposing || event.keyCode === 229;
}

function activeSelection(skills: readonly string[], editor: SkillEditor): number | null {
  const { selected } = editor;
  return selected !== null && selected >= 0 && selected < skills.length ? selected : null;
}
