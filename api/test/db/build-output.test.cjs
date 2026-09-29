require('reflect-metadata');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const apiDir = resolve(__dirname, '../..');
const staleFile = resolve(apiDir, 'dist/database/migrations/1999999999999-StaleOnly.js');

// 새 프로세스에서 dist의 DataSource가 탐색하는 마이그레이션 이름을 읽는다. DB에는 접속하지 않는다.
function loadedMigrations() {
  const script = `
    const ds = require('./dist/database/data-source').default;
    ds.buildMetadatas().then(() => console.log(JSON.stringify(ds.migrations.map((m) => m.constructor.name))));`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: apiDir, env: process.env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

test('다시 빌드하면 소스에 없는 마이그레이션의 이전 빌드 결과가 탐색되지 않는다', { timeout: 60000 }, () => {
  assert.match(JSON.parse(readFileSync(resolve(apiDir, 'package.json'), 'utf8')).scripts.build, /^node scripts\/clean-dist\.cjs && /);

  // 소스에서 지운 마이그레이션이 이전 빌드에 남은 상태를 만든다.
  mkdirSync(resolve(staleFile, '..'), { recursive: true });
  writeFileSync(staleFile, `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class StaleOnly1999999999999 { async up() {} async down() {} }
exports.StaleOnly1999999999999 = StaleOnly1999999999999;
`);
  assert.ok(loadedMigrations().includes('StaleOnly1999999999999'), '정리 전에는 남은 JS가 탐색된다');

  // package.json의 build와 같은 두 단계: dist 정리 → tsc
  for (const args of [['scripts/clean-dist.cjs'], [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json']]) {
    const result = spawnSync(process.execPath, args, { cwd: apiDir, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(existsSync(staleFile), false);
  assert.equal(loadedMigrations().includes('StaleOnly1999999999999'), false);
});
