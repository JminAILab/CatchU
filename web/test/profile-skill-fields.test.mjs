import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// #469 기술 칩 입력이 그리는 구조(배치 순서·버튼 이름·선택 표시·빈 항목)를 본다.
// 클릭·키보드 동작과 CSS 배치는 브라우저에서 확인한다. CSS 모듈은 클래스 이름을 그대로 돌려주는 대역으로 바꾼다.
const fieldsUrl = new URL('../src/features/profile/profile-fields.tsx', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.module.css')) return { url: `catchu-css:${specifier}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('catchu-css:')) {
      return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, key) => String(key) });' };
    }
    if (url !== fieldsUrl.href) return nextLoad(url, context);
    return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fieldsUrl, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { ProfileFields } = await import(fieldsUrl.href);
hooks.deregister();

function render(skills, skillEditor = { draft: '', selected: null }) {
  return renderToStaticMarkup(createElement(ProfileFields, {
    profile: { displayName: '회원', introduction: '', desiredRole: '', skills },
    disabled: false, onChange() {}, skillEditor, onSkillEditorChange() {},
  }));
}
const chipNames = html => [...html.matchAll(/<button class="skillChipName"[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1]);

test('입력칸과 [추가]가 위, 안내 문구, 칩 상자 순서로 놓인다', () => {
  const html = render(['TS']);
  const positions = ['기술 (최대 20개, 각 50자)</label>', '<input id=', '>추가</button>', '기술 칩을 클릭하면 수정할 수 있습니다.', 'class="skillBox"']
    .map(part => html.indexOf(part));
  assert.ok(positions.every(position => position >= 0), `빠진 부분: ${positions}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.doesNotMatch(html, />지우기<|>선택 취소</);
});

test('저장된 기술은 빈 값·같은 이름을 포함해 순서대로 칩이 되고, ×는 그 기술 이름으로 읽힌다', () => {
  const html = render(['TS', '', 'TS', '  ']);
  assert.deepEqual(chipNames(html), ['TS', '<span class="skillBlank">(빈 항목)</span>', 'TS', '<span class="skillBlank">(빈 항목)</span>']);
  assert.deepEqual([...html.matchAll(/aria-label="([^"]+)">×<\/button>/g)].map(m => m[1]), ['TS 삭제', '빈 항목 삭제', 'TS 삭제', '빈 항목 삭제']);
});

test('기술 이름은 글자로만 그린다', () => {
  assert.deepEqual(chipNames(render(['<b>x</b>'])), ['&lt;b&gt;x&lt;/b&gt;']);
});

test('칩을 고르면 그 칩만 강조되고 버튼이 [수정]이 된다', () => {
  const html = render(['TS', 'React'], { draft: 'React', selected: 1 });
  assert.match(html, />수정<\/button>/);
  assert.doesNotMatch(html, />추가<\/button>/);
  assert.deepEqual([...html.matchAll(/<li class="([^"]+)">/g)].map(m => m[1]), ['skillChip', 'skillChip skillChipSelected']);
  assert.deepEqual([...html.matchAll(/aria-pressed="(true|false)"/g)].map(m => m[1]), ['false', 'true']);
  assert.match(html, /value="React"/);
});

test('기술이 20개면 [추가]만 막히고, 칩을 고른 [수정]은 열려 있다', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `기술${i + 1}`);
  assert.match(render(twenty), /<button class="skillCommit" type="button" disabled="">추가<\/button>/);
  assert.match(render(twenty, { draft: '기술1', selected: 0 }), /<button class="skillCommit" type="button">수정<\/button>/);
});

test('기술이 없으면 칩 상자에 없다는 안내만 보인다', () => {
  const html = render([]);
  assert.match(html, /입력한 기술이 없습니다\./);
  assert.doesNotMatch(html, /<ul/);
});
