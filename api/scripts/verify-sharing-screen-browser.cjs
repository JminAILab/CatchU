// #123 화면 통합 수동 확인 전용. 자동 검사(test/integration/sharing-screen-web.test.cjs)와 같은 시험 앱을 고정 포트로 띄우고,
// 개발 회원 두 명에게 #103 합성 결과를 실제 접수 → 개발 주입으로 넣어 둔다. 브라우저에서는 같은 식별 문자열로 개발용 로그인한다.
// 테스트 DB만 쓰며 시작할 때 그 DB의 표를 모두 비운다. 먼저 `npm test -- test/integration/sharing-screen-web.test.cjs`로 마이그레이션을 적용한다.
// 출력에는 식별 문자열·요청/Catch 수만 남기고 토큰·비밀번호·내부 식별자는 내지 않는다.
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createInterface } = require('node:readline');
const { parseEnv } = require('node:util');

const API_PORT = 3432;
const WEB_ORIGIN = 'http://localhost:3000';
const MEMBERS = { owner: 'verify-123-owner', empty: 'verify-123-empty' };
const FIXTURES = resolve(__dirname, '../../worker/fixtures/m1-synthetic');
const read = file => JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8'));
const print = line => process.stdout.write(JSON.stringify(line) + '\n');

// 테스트 DB 접속값은 npm test와 같은 순서(셸 환경변수 → api/.env의 TEST_DB_* → 기본값)로 정한다.
function useTestDatabase() {
  const envPath = resolve(__dirname, '../.env');
  const file = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  const pick = (key, fallback) => process.env[key] || file[key] || fallback;
  Object.assign(process.env, { DB_HOST: pick('TEST_DB_HOST', '127.0.0.1'), DB_PORT: pick('TEST_DB_PORT', '5433'),
    DB_USER: pick('TEST_DB_USER', 'catchu'), DB_PASSWORD: pick('TEST_DB_PASSWORD', 'catchu_local'),
    DB_NAME: pick('TEST_DB_NAME', 'catchu_test') });
}

async function main() {
  useTestDatabase();
  const { openTestDataSource, resetTestDatabase } = require('../test/support/test-database.cjs');
  const { startIntakeApp } = require('../test/helpers/intake-app.cjs');
  const db = await openTestDataSource();
  await resetTestDatabase(db);
  const s = await startIntakeApp(db, { port: API_PORT,
    settings: { NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: WEB_ORIGIN, AUTH_WEB_ORIGIN: WEB_ORIGIN,
      SHARE_LINK_WEB_BASE_URL: WEB_ORIGIN } });
  // 결과 진입 사례: Catch 두 개(#103 two-candidates-same-work의 둘째 후보 작업 식별만 바꾼 변형). 둘 다 처음엔 비공개다.
  const owner = await s.login(MEMBERS.owner);
  const ownerIntake = await s.submit(owner);
  const two = read('results/two-candidates-same-work.json');
  two.candidates[1].workIdentity += '-other';
  const applied = await s.inject(owner, ownerIntake.status.requestId, 'Result', two, 'verify-123');
  // 정상 0건 사례: 후보 없는 정상 완료(#103 empty).
  const empty = await s.login(MEMBERS.empty);
  const emptyIntake = await s.submit(empty);
  const none = await s.inject(empty, emptyIntake.status.requestId, 'Result', read('results/empty.json'), 'verify-123-empty');
  if (applied.status !== 201 || none.status !== 201) throw new Error('합성 결과 주입 실패');
  print({ kind: 'ready', api: `http://127.0.0.1:${API_PORT}`, web: WEB_ORIGIN, members: MEMBERS,
    ownerCatches: applied.body.application.registeredCatchIds.length, emptyCatches: (none.body.application?.registeredCatchIds ?? []).length });
  print({ kind: 'hint', text: 'Enter 또는 Ctrl+C로 종료한다. 종료하면 앱만 닫고 DB 자료는 다음 시작 때 지운다.' });

  const input = createInterface({ input: process.stdin });
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    input.close();
    await s.close();
    await db.destroy();
    print({ kind: 'closed' });
  };
  input.on('line', stop);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  print({ kind: 'startup-error', reason: error?.code ?? error?.name ?? 'unknown' });
  process.exit(1);
});
