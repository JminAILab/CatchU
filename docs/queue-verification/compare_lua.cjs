// Node(bullmq npm)와 Python(bullmq PyPI) 패키지에 들어 있는 Lua 스크립트가 글자 단위로 같은지 비교한다.
// 양쪽이 Redis에서 같은 스크립트를 실행해야 같은 큐 자료 구조를 공유할 수 있다. 판본을 올릴 때마다 다시 실행한다.
// 사용: node compare_lua.cjs   (npm ci, uv sync --locked 뒤)
const { createHash } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const nodeDir = join(__dirname, 'node_modules/bullmq/dist/cjs/scripts');
const pythonDir = join(__dirname, '.venv/lib/python3.12/site-packages/bullmq/commands');
const sha1 = (text) => createHash('sha1').update(text).digest('hex');

const python = new Map(readdirSync(pythonDir).filter((f) => f.endsWith('.lua')).map((f) => [f, readFileSync(join(pythonDir, f), 'utf8')]));
const rows = [];
for (const file of readdirSync(nodeDir).filter((f) => f.endsWith('.js') && f !== 'index.js')) {
  // Node 패키지는 include를 펼친 최종 스크립트를 content 문자열로 들고 있다.
  const { content } = Object.values(require(join(nodeDir, file)))[0];
  const lua = file.replace(/\.js$/, '.lua');
  const other = python.get(lua);
  python.delete(lua);
  rows.push({ script: lua, same: other !== undefined && sha1(content) === sha1(other), sha1: sha1(content) });
}
const summary = {
  bullmqNode: require('bullmq/package.json').version,
  scripts: rows.length,
  same: rows.filter((r) => r.same).length,
  different: rows.filter((r) => !r.same).map((r) => r.script),
  onlyInPython: [...python.keys()],
};
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.different.length || summary.onlyInPython.length ? 1 : 0);
