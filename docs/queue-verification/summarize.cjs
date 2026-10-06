// runs/<엔진>-ncp-like/summary.json을 엔진별로 모아 results/에 요약을 쓰고, 문서용 표를 출력한다.
// 사용: node summarize.cjs   (세 엔진의 전체 실행 결과가 모두 있어야 한다)
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const ENGINES = ['redis-7.2.11', 'valkey-7.2.11', 'valkey-8.1.6'];
const STATUS_LABEL = { MEETS: '충족', MISSES: '미충족', INVALID: '무효', SKIP: '건너뜀', ERROR: '오류' };

const missing = ENGINES.filter((engine) => !existsSync(join(__dirname, 'runs', `${engine}-ncp-like`, 'summary.json')));
if (missing.length) {
  console.error(`전체 실행 결과가 없는 엔진: ${missing.join(', ')}`);
  process.exit(1);
}
const runs = ENGINES.map((engine) => ({ engine, ...JSON.parse(readFileSync(join(__dirname, 'runs', `${engine}-ncp-like`, 'summary.json'), 'utf8')) }));

mkdirSync(join(__dirname, 'results'), { recursive: true });
for (const run of runs) {
  // 로그 경로 등 로컬 정보 없이 판정에 쓴 값만 남긴다.
  writeFileSync(join(__dirname, 'results', `${run.engine}.json`), `${JSON.stringify({ environment: run.environment, results: run.results }, null, 1)}\n`);
}

const ids = runs[0].results.map((r) => r.id);
const differentIds = runs.filter((r) => r.results.map((x) => x.id).join() !== ids.join()).map((r) => r.engine);
if (differentIds.length) console.log(`주의: 시나리오 목록이 다른 엔진: ${differentIds.join(', ')}`);

const cell = (row) => {
  if (!row) return '-';
  const calls = row.observed.calls;
  return `${STATUS_LABEL[row.status]}${calls === undefined || row.status === 'SKIP' ? '' : ` (분석 ${calls}회)`}`;
};
console.log(`| 시나리오 | 구분 | ${runs.map((r) => r.engine).join(' | ')} |`);
console.log(`|---|---|${runs.map(() => '---').join('|')}|`);
for (const id of ids) {
  const rows = runs.map((r) => r.results.find((x) => x.id === id));
  console.log(`| ${id} ${rows[0].title} | ${rows[0].variant} | ${rows.map(cell).join(' | ')} |`);
}

console.log('\n| 엔진 | 충족 | 미충족 | 무효 | 오류 | 건너뜀 | 합계 |');
console.log('|---|---|---|---|---|---|---|');
for (const run of runs) {
  const count = (status) => run.results.filter((r) => r.status === status).length;
  console.log(`| ${run.engine} | ${count('MEETS')} | ${count('MISSES')} | ${count('INVALID')} | ${count('ERROR')} | ${count('SKIP')} | ${run.results.length} |`);
}

// 엔진 사이 일치는 판정이 난 행(충족·미충족)만 센다. 오류·무효가 같아도 "일치"로 세지 않는다.
const decided = ids.filter((id) => runs.every((r) => ['MEETS', 'MISSES'].includes((r.results.find((x) => x.id === id) || {}).status)));
const same = decided.filter((id) => {
  const rows = runs.map((r) => r.results.find((x) => x.id === id));
  return rows.every((row) => row.status === rows[0].status && row.observed.calls === rows[0].observed.calls);
});
console.log(`\n세 엔진 모두 판정이 난 시나리오 ${decided.length}/${ids.length}, 그중 판정·호출 수가 같은 시나리오 ${same.length}/${decided.length}`);
const notDecided = ids.filter((id) => !decided.includes(id));
if (notDecided.length) console.log(`판정이 나지 않은 시나리오(무효·오류·건너뜀): ${notDecided.join(', ')}`);
for (const run of runs) {
  const env = run.environment;
  console.log(`${run.engine}: server ${env.valkeyVersion || env.redisVersion}, policy ${env.maxmemoryPolicy}, aof ${env.aofEnabled}, config ${String(env.configCommand).slice(0, 40)}, started ${env.startedAt}, seconds ${Math.round(run.results.reduce((s, r) => s + r.seconds, 0))}`);
}
