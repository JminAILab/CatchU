// 읽기 전용 회귀 검사. 승인/상태 명령이나 외부 API를 호출하지 않는다.
// node scripts/test-aidlc-review-brief.mjs <실행 파일> <프로젝트> <질문 파일>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [executable, projectArg, questions] = process.argv.slice(2);
assert(executable && projectArg && questions, '실행 파일·프로젝트·질문 파일이 필요합니다.');
const project = resolve(projectArg);
const record = dirname(dirname(dirname(resolve(project, questions))));
const snapshot = () => {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(record);
  files.push(join(project, '.codex/tools/data/aidlc-stamp.json'));
  return files.sort().map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]);
};
const before = snapshot();
const run = (args, ok, expected) => {
  const result = spawnSync(executable, args, { cwd: project, encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, ok ? 0 : 1, result.stderr);
  assert.match(result.stdout + result.stderr, expected);
  assert.doesNotMatch(result.stdout + result.stderr, /does not export main/);
};
run(['--version'], true, /aidlc 2\.8\.1 \(runtime 2\.8\.1\)/);
const base = ['engine', 'review-brief'];
run([...base, 'summary', '--stage', 'feasibility', '--questions-file', questions], true, /\*\*Looks correct\*\*/);
run([...base, 'context', '--stage', 'feasibility'], true, /No review findings were recorded/);
// 출력 경로 검사일 뿐 실제 리뷰 완료/품질 판정이 아니다.
run([...base, 'review', '--stage', 'feasibility', '--why', 'first'], true, /\*\*Decision options:\*\*/);
run([...base, 'summary', '--stage', 'feasibility'], false, /requires --questions-file/);
run([...base, 'summary', '--stage', 'feasibility', '--questions-file', 'AGENTS.md'], false, /must exist inside the active intent record/);
run([...base, 'context', '--stage', 'not-a-stage'], false, /Unknown stage/);
assert.deepEqual(snapshot(), before, '검사 중 intent 기록 또는 버전 스탬프가 변경됐습니다.');
console.log('PASS: 7개 명령 검사; intent 전체 기록·버전 스탬프 내용/파일 목록 불변.');
