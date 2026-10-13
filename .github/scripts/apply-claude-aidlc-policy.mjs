// AI-DLC refresh 뒤 CatchU의 Claude 실행 제한을 다시 적용한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !['--check', '--prepare-refresh'].includes(arg))) {
  throw new Error('사용법: node .github/scripts/apply-claude-aidlc-policy.mjs [--check|--prepare-refresh]');
}
const onboardingPatches = [
  {
    "before": "- **Settings**: `.claude/settings.json` pre-approves the framework's own work (file edits inside the project, Task, WebSearch, and the bun .claude/tools/ engine commands) so workflows run without per-call permission prompts; a project's own build or test commands prompt once.",
    "after": "- **Settings**: CatchU는 프로젝트 편집과 AI-DLC 조회·엔진 명령을 기본 허용하지만, `.claude/settings.json`의 `deny`·`ask`가 우선합니다. PowerShell 도구는 거부하고 센서·어댑터·동적 statusline의 직접 호출은 승인을 요구합니다. 자동 린터가 실행됐다고 가정하지 말고 실제 검사 결과를 확인합니다."
  },
  {
    "before": "- **Sensors**: `.claude/sensors/`: automatic checks that run on matching writes or once per existing deliverable at the approval gate. Gate-fired sensors may be advisory or blocking; blocking failures require an explicit audited override before the gate opens. Ships with framework defaults (`aidlc-claim-sources.md`, `aidlc-required-sections.md`, `aidlc-upstream-coverage.md`, `aidlc-traceability.md`, `aidlc-linter.md`, `aidlc-type-check.md`); forks may add custom `aidlc-<id>.md` manifests. Stages declare which sensors fire via the frontmatter `sensors: [<id>]` list — a pull import resolved at compile time.",
    "after": "- **Sensors**: `.claude/sensors/`는 센서 정의입니다. CatchU의 Claude에서는 `PostToolUse`의 `run-sensors`를 제거하여 파일 편집 직후 린터·타입 검사·문서 센서가 자동 실행되지 않습니다. 승인 게이트의 문서 센서만 해당 단계·센서 정책에 따라 유지되며, blocking 실패에는 명시적으로 감사되는 override가 필요합니다. 편집 직후 센서 결과를 통과로 보고하지 말고, 필요한 검사는 설정 검토·실행 승인 후 개인 인증이 없는 별도 환경에서 수행합니다."
  },
  {
    "before": "- **Hooks**: `.claude/hooks/`: scripts your CLI runs automatically at set moments, so the decision log, saved progress, and status display stay correct without anyone remembering to update them. All framework files prefixed `aidlc-*.ts`.",
    "after": "- **Hooks**: `.claude/settings.json`에 등록된 hook만 자동 실행합니다. 쓰기 감사와 상태·승인 가드는 유지하지만 쓰기 후 센서는 제거했습니다. 상태 표시줄은 셸의 `printf`로 `/aidlc --status` 안내만 출력하며 프로젝트 스크립트를 불러오거나 현재 상태를 자동 계산하지 않습니다. 실제 상태는 `/aidlc --status`로 조회합니다. [CatchU 운영 안내](../docs/ai-dlc/AI_DLC_2.11.0_GUIDE.md)의 설정 갱신 전 준비·갱신 후 재적용 절차를 따릅니다."
  }
];
const onboardingPath = resolve('.claude/CLAUDE.md');
const onboardingOriginal = readFileSync(onboardingPath, 'utf8');
const onboardingLines = onboardingOriginal.split('\n');
for (const { before, after } of onboardingPatches) {
  const matches = onboardingLines.flatMap((line, i) => line === before || line === after ? [i] : []);
  if (matches.length !== 1) throw new Error('Claude 안내의 예상 밖 편집을 발견했습니다. 덮어쓰지 않고 중단합니다.');
  onboardingLines[matches[0]] = args.includes('--prepare-refresh') ? before : after;
}
const onboarding = onboardingLines.join('\n');
if (args.includes('--prepare-refresh')) {
  const manifest = JSON.parse(readFileSync('.claude/tools/data/aidlc-manifest.json', 'utf8'));
  const baseline = manifest.files?.['.claude/CLAUDE.md'];
  if (`sha256:${createHash('sha256').update(onboarding).digest('hex')}` !== baseline) {
    throw new Error('알려진 안내 패치를 제외한 변경이 있습니다. 공식 baseline과 달라 refresh 준비를 중단합니다.');
  }
  if (onboarding !== onboardingOriginal) writeFileSync(onboardingPath, onboarding);
  console.log('안내의 공식 baseline 확인 완료. config 검토 후 이 스크립트를 인자 없이 다시 실행하세요.');
  process.exit(0);
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
  'Bash(aidlc engine statusline*)',
  'Bash(aidlc engine hook statusline*)',
]);
// 셸 builtin의 고정 문자열만 출력한다. 저장소 소유 statusline 모듈을 실행하지 않는다.
settings.statusLine = { ...settings.statusLine, type: 'command', command: "printf '%s' 'AI-DLC status: /aidlc --status'" };
settings.env ??= {};
settings.env.CLAUDE_CODE_USE_POWERSHELL_TOOL = '0';
settings.hooks.PostToolUse = settings.hooks.PostToolUse.flatMap((group) => {
  if (!Array.isArray(group.hooks)) throw new Error('PostToolUse hooks는 배열이어야 합니다.');
  const hooks = group.hooks.filter((hook) => hook.command !== 'aidlc engine hook run-sensors');
  return hooks.length ? [{ ...group, hooks }] : [];
});

const changed = !isDeepStrictEqual(original, settings) || onboarding !== onboardingOriginal;
if (args.includes('--check')) {
  if (changed) {
    console.error('Claude AI-DLC 실행 제한이 누락됐습니다. 이 스크립트를 --check 없이 실행하세요.');
    process.exitCode = 1;
  } else {
    console.log('Claude AI-DLC 실행 제한 확인: 통과');
  }
} else if (changed) {
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  if (onboarding !== onboardingOriginal) writeFileSync(onboardingPath, onboarding);
  console.log('Claude AI-DLC 실행 제한 적용 완료');
} else {
  console.log('Claude AI-DLC 실행 제한이 이미 적용돼 있습니다.');
}
