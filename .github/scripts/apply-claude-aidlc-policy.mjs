// AI-DLC refresh 뒤 CatchU의 Claude 실행 제한을 다시 적용한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) {
  throw new Error('사용법: node .github/scripts/apply-claude-aidlc-policy.mjs [--check]');
}
const path = resolve('.claude/settings.json');
const original = JSON.parse(readFileSync(path, 'utf8'));
const settings = structuredClone(original);
if (!Array.isArray(settings.hooks?.PostToolUse)) {
  throw new Error('Claude PostToolUse 설정이 없습니다. AI-DLC 설치 상태를 먼저 확인하세요.');
}

settings.permissions ??= {};
const append = (key, values) => {
  const current = settings.permissions[key] ?? [];
  if (!Array.isArray(current)) throw new Error(`permissions.${key}는 배열이어야 합니다.`);
  settings.permissions[key] = [...new Set([...current, ...values])];
};
append('deny', ['PowerShell']);
append('ask', [
  'Bash(aidlc engine sensor *)',
  'Bash(aidlc engine sensor-linter *)',
  'Bash(aidlc engine hook run-sensors*)',
  'Bash(aidlc engine __sensor-script *)',
  'Bash(aidlc engine __sensor-script-file *)',
  'Bash(aidlc engine adapter *)',
]);
settings.env ??= {};
settings.env.CLAUDE_CODE_USE_POWERSHELL_TOOL = '0';
settings.hooks.PostToolUse = settings.hooks.PostToolUse.flatMap((group) => {
  if (!Array.isArray(group.hooks)) throw new Error('PostToolUse hooks는 배열이어야 합니다.');
  const hooks = group.hooks.filter((hook) => hook.command !== 'aidlc engine hook run-sensors');
  return hooks.length ? [{ ...group, hooks }] : [];
});

const changed = !isDeepStrictEqual(original, settings);
if (args.includes('--check')) {
  if (changed) {
    console.error('Claude AI-DLC 실행 제한이 누락됐습니다. 이 스크립트를 --check 없이 실행하세요.');
    process.exitCode = 1;
  } else {
    console.log('Claude AI-DLC 실행 제한 확인: 통과');
  }
} else if (changed) {
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  console.log('Claude AI-DLC 실행 제한 적용 완료');
} else {
  console.log('Claude AI-DLC 실행 제한이 이미 적용돼 있습니다.');
}
