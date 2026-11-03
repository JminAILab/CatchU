import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileErrors } from '../src/features/profile/profile-api.ts';
import {
  commitSkill, emptySkillEditor, isComposingKey, pendingSkill, pendingSkillMessage, removeSkill, selectSkill,
} from '../src/features/profile/skill-editor.ts';

// #469 기술 칩 입력의 상태 규칙. 기대 결과는 #469 완료 기준에서 가져왔다. 화면 배치·키보드·실제 저장은 브라우저에서 확인한다.

const empty = emptySkillEditor();
const twenty = Array.from({ length: 20 }, (_, i) => `기술${i + 1}`);

test('[추가]는 입력한 이름을 목록 끝에 붙이고 입력칸을 비운 추가 모드로 돌아간다', () => {
  assert.deepEqual(commitSkill(['TS', 'React'], { draft: 'Node', selected: null }),
    { ok: true, skills: ['TS', 'React', 'Node'], editor: empty });
});

test('빈 값·앞뒤 공백·같은 이름은 막거나 다듬지 않고 그대로 반영한다', () => {
  for (const draft of ['', '  ', ' React ', 'TS']) {
    const result = commitSkill(['TS'], { draft, selected: null });
    assert.deepEqual(result, { ok: true, skills: ['TS', draft], editor: empty });
  }
  assert.deepEqual(commitSkill(['TS', 'React'], { draft: '', selected: 1 }).skills, ['TS', '']);
});

test('칩 이름 클릭은 그 칩을 고르고 이름을 입력칸에 채운다', () => {
  assert.deepEqual(selectSkill(['TS', 'React'], empty, 1), { draft: 'React', selected: 1 });
  // 다른 칩을 누르면 그 칩으로 선택이 바뀐다.
  assert.deepEqual(selectSkill(['TS', 'React'], { draft: 'React', selected: 1 }, 0), { draft: 'TS', selected: 0 });
});

test('[수정]은 고른 칩에 입력값을 반영하고 입력칸을 비운 추가 모드로 돌아간다', () => {
  assert.deepEqual(commitSkill(['TS', 'React', 'Node'], { draft: 'Next.js', selected: 1 }),
    { ok: true, skills: ['TS', 'Next.js', 'Node'], editor: empty });
});

test('고른 칩을 다시 누르면 미확정 수정을 버리고 선택을 풀며, 칩 이름은 그대로다', () => {
  const skills = ['TS', 'React'];
  assert.deepEqual(selectSkill(skills, { draft: 'React Native', selected: 1 }, 1), empty);
  assert.deepEqual(skills, ['TS', 'React']);
});

test('×는 그 기술만 지운다. 고른 칩을 지우면 추가 모드이고, 그 밖에는 입력과 선택한 칩을 유지한다', () => {
  assert.deepEqual(removeSkill(['TS', 'TS', 'React'], empty, 1), { skills: ['TS', 'React'], editor: empty });
  assert.deepEqual(removeSkill(['TS', 'React'], { draft: 'Re', selected: 1 }, 1), { skills: ['TS'], editor: empty });
  assert.deepEqual(removeSkill(['TS', 'React', 'Node'], { draft: 'Nest', selected: 2 }, 0),
    { skills: ['React', 'Node'], editor: { draft: 'Nest', selected: 1 } });
  assert.deepEqual(removeSkill(['TS', 'React'], { draft: 'Go', selected: null }, 0),
    { skills: ['React'], editor: { draft: 'Go', selected: null } });
});

test('기술이 20개면 추가만 막고 기존 칩의 수정·삭제는 된다', () => {
  assert.deepEqual(commitSkill(twenty, { draft: '21번째', selected: null }),
    { ok: false, message: '기술은 최대 20개까지 입력할 수 있습니다.' });
  const edited = commitSkill(twenty, { draft: '바꾼 이름', selected: 19 });
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.skills, [...twenty.slice(0, 19), '바꾼 이름']);
  assert.equal(removeSkill(twenty, empty, 0).skills.length, 19);
});

test('이름은 코드 포인트 50까지 반영하고 51이면 반영하지 않는다(이모지 포함). 저장 전 검사도 같은 경계다', () => {
  assert.equal(commitSkill([], { draft: '😀'.repeat(50), selected: null }).ok, true);
  assert.deepEqual(commitSkill([], { draft: '😀'.repeat(51), selected: null }),
    { ok: false, message: '기술 이름은 최대 50자까지 입력할 수 있습니다.' });
  assert.equal(commitSkill(['TS'], { draft: 'a'.repeat(51), selected: 0 }).ok, false);
  const base = { displayName: '회원', introduction: '', desiredRole: '' };
  assert.deepEqual(profileErrors({ ...base, skills: ['😀'.repeat(50)] }), []);
  assert.deepEqual(profileErrors({ ...base, skills: ['😀'.repeat(51)] }), ['기술 1은 최대 50자까지 입력할 수 있습니다.']);
});

test('서버가 거부하는 문자(NUL·고립 서로게이트)는 반영하지 않는다', () => {
  for (const draft of ['a\u0000b', 'a\uD800b']) {
    assert.deepEqual(commitSkill([], { draft, selected: null }), { ok: false, message: '기술 이름에 저장할 수 없는 문자가 있습니다.' });
  }
});

test('미확정 변경은 새 기술 입력과 고른 칩 이름의 변경이며, 칩을 고르기만 한 것은 변경이 아니다', () => {
  const skills = ['TS', 'React'];
  assert.equal(pendingSkill(skills, empty), null);
  assert.equal(pendingSkill(skills, { draft: 'Go', selected: null }), 'add');
  assert.equal(pendingSkill(skills, { draft: ' ', selected: null }), 'add');
  assert.equal(pendingSkill(skills, { draft: 'React', selected: 1 }), null);
  assert.equal(pendingSkill(skills, { draft: 'Reac', selected: 1 }), 'edit');
  assert.equal(pendingSkill(skills, { draft: '', selected: 1 }), 'edit');
});

test('미확정 변경이 있으면 저장하지 않았다고 알리고 [추가]·[수정]으로 먼저 반영하게 안내한다', () => {
  assert.equal(pendingSkillMessage(['TS'], empty), null);
  assert.equal(pendingSkillMessage(['TS'], { draft: 'TS', selected: 0 }), null);
  assert.match(pendingSkillMessage(['TS'], { draft: 'Go', selected: null }), /추가하지 않아 저장하지 않았습니다\. \[추가\]/);
  assert.match(pendingSkillMessage(['TS'], { draft: 'Go', selected: 0 }), /반영하지 않아 저장하지 않았습니다\. \[수정\]/);
  assert.match(pendingSkillMessage(twenty, { draft: '21번째', selected: null }), /최대 20개까지라 다른 기술을 지운 뒤 \[추가\]/);
});

test('입력기 조합을 확정하는 키 입력을 가려낸다', () => {
  assert.equal(isComposingKey({ isComposing: true, keyCode: 229 }), true);
  assert.equal(isComposingKey({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isComposingKey({ isComposing: false, keyCode: 13 }), false);
});

test('범위를 벗어난 위치나 사라진 선택은 추가 모드로 본다', () => {
  assert.deepEqual(selectSkill(['TS'], empty, 3), empty);
  assert.equal(pendingSkill(['TS'], { draft: '', selected: 5 }), null);
  assert.deepEqual(commitSkill(['TS'], { draft: 'Go', selected: 5 }).skills, ['TS', 'Go']);
  assert.deepEqual(removeSkill(['TS'], empty, 4), { skills: ['TS'], editor: empty });
});
