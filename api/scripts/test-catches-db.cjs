const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', 'test/catches/registration-postgres.test.cjs', 'test/catches/owner-catch-http.test.cjs'],
  { stdio: 'inherit', env: { ...process.env, CATCH_DB_TEST_REQUIRED: '1' } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
