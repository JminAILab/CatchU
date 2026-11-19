// #594 Claude 연결(MCP) 두 흐름의 합성 E2E를 명령 하나로 돌린다. 이 폴더에서 npm run e2e로 실행하며, 안내는 README.md에 있다.
// 순서: 전용 DB 컨테이너 → api·web 빌드 → 마이그레이션 → api·web 실행 → Playwright 시험 → 정리.
// - api/.env·web/.env의 값을 쓰지 않는다. api는 --env-file 없이 dist/main.js로 띄우고, web이 읽는 NEXT_PUBLIC_ 값은 모두 여기서 준다.
//   두 서버와 빌드에는 셸 환경값 가운데 실행에 필요한 것(PATH 등)만 물려주므로 개발자 셸의 키·큐 주소가 섞이지 않는다.
// - 토큰·승인 주소·state·받은 링크 주소를 출력하지 않는다. 서버 출력은 화면에 내지 않고, 실패할 때만 주소를 지운 끝부분을 보인다.
// - 이 실행이 만든 DB 컨테이너만 이름으로 지운다(docker rm -f -v). 같은 이름의 컨테이너가 이미 있으면 지우지 않고 멈춘다.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { redact } from './lib/redact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const apiDir = join(repoRoot, 'api');
const webDir = join(repoRoot, 'web');

/** api README 「DB 테스트」와 같은 이미지. 자료는 컨테이너 메모리(--tmpfs)에만 둔다. */
const DB_IMAGE = 'pgvector/pgvector:0.8.7-pg16-trixie';
/** api 시험의 마이그레이션 실행(api/scripts/test-with-db.cjs)과 같은 방식이다. */
const MIGRATE = `const ds = require('./dist/database/data-source').default;
ds.initialize().then(() => ds.runMigrations()).then((applied) => ds.destroy().then(() => console.log(applied.length)))
  .catch((error) => { console.error(error.message); process.exit(1); });`;
/** 자식 프로세스에 물려줄 셸 환경값(대소문자 무시). 이 밖의 값은 넘기지 않는다. */
const INHERITED = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL', 'USER', 'LOGNAME', 'SHELL']);

/** 안내만 출력하고 멈추는 실패. */
class StopError extends Error {}

const log = (message) => console.log(`[e2e] ${message}`);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}초`;
const tailOf = (text, lines = 30) => redact(String(text).split(/\r?\n/).filter((line) => line.trim() !== '').slice(-lines).join('\n'));
const inheritedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => INHERITED.has(key.toUpperCase())));

function readPort(name, fallback) {
  const value = process.env[name] ?? String(fallback);
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) throw new StopError(`${name} 값은 1~65535 사이의 정수여야 합니다.`);
  return port;
}

function readSettings() {
  const container = process.env.CATCHU_E2E_DB_CONTAINER ?? 'catchu-mcp-e2e-db';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) throw new StopError('CATCHU_E2E_DB_CONTAINER는 Docker 컨테이너 이름 형식이어야 합니다.');
  const ports = {
    web: readPort('CATCHU_E2E_WEB_PORT', 3400),
    api: readPort('CATCHU_E2E_API_PORT', 3401),
    callback: readPort('CATCHU_E2E_CALLBACK_PORT', 6280),
    db: readPort('CATCHU_E2E_DB_PORT', 55434),
  };
  if (new Set(Object.values(ports)).size !== 4) throw new StopError('CATCHU_E2E_*_PORT 네 값은 서로 달라야 합니다.');
  return { container, ports };
}

/** npm을 셸 없이 부르는 방법. npm run e2e로 실행하면 npm이 npm_execpath를 넘긴다. */
function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const cli = candidates.find((path) => typeof path === 'string' && path.endsWith('.js') && existsSync(path));
  if (!cli) throw new StopError('npm을 찾지 못했습니다. 이 폴더에서 npm run e2e로 실행하세요.');
  return cli;
}

/** 끝나는 명령을 돌리고 출력을 모은다. 출력은 화면에 내지 않는다. */
function exec(command, args, { cwd = repoRoot, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.once('error', (error) => resolve({ code: -1, stdout: '', stderr: error.message }));
    child.once('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
  });
}

async function mustExec(label, command, args, options) {
  const result = await exec(command, args, options);
  if (result.code !== 0) {
    throw new StopError(`${label}에 실패했습니다(종료 코드 ${result.code}). 출력 끝부분(주소를 지움):\n${tailOf(`${result.stdout}\n${result.stderr}`)}`);
  }
  return result.stdout;
}

const servers = [];

/** 서버를 띄운다. 출력은 끝부분만 메모리에 두고, 뜨지 못할 때만 주소를 지워 보인다. */
function startServer(label, args, { cwd, env }) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  const tail = [];
  const keep = (chunk) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue;
      tail.push(line);
      if (tail.length > 40) tail.shift();
    }
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const server = { label, child, tail, exited };
  servers.push(server);
  return server;
}

async function stopServer(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-server.child.pid, 'SIGTERM'); } catch { /* 이미 끝났다 */ }
  }
  // 서버가 먼저 끝나도 기다림 타이머가 프로세스를 붙잡지 않게 한다(ref: false).
  await Promise.race([server.exited, sleep(10_000, undefined, { ref: false })]);
}

async function waitForHttp(server, url, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new StopError(`${server.label} 서버가 뜨기 전에 끝났습니다. 출력 끝부분(주소를 지움):\n${redact(server.tail.join('\n'))}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch {
      // 아직 뜨지 않았다.
    }
    await sleep(300);
  }
  throw new StopError(`${server.label} 서버가 ${timeoutMs / 1000}초 안에 응답하지 않았습니다. 출력 끝부분(주소를 지움):\n${redact(server.tail.join('\n'))}`);
}

/** 그 포트에 이미 누가 듣고 있는지 본다. localhost가 ::1로 먼저 갈 수 있어 두 주소를 다 본다. */
async function assertPortFree(port, name) {
  for (const host of ['127.0.0.1', '::1']) {
    const listening = await new Promise((resolve) => {
      const socket = connect({ port, host });
      const done = (value) => { socket.destroy(); resolve(value); };
      socket.setTimeout(1_000, () => done(false));
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
    });
    if (listening) throw new StopError(`이미 쓰고 있는 포트입니다: ${port}(${host}). ${name} 값으로 다른 포트를 정해 다시 실행하세요.`);
  }
}

async function preflight({ container, ports }) {
  for (const [dir, command] of [[here, 'scripts/claude-mcp-e2e'], [apiDir, 'api'], [webDir, 'web']]) {
    if (!existsSync(join(dir, 'node_modules'))) throw new StopError(`${command}에 의존성이 없습니다. README.md 「준비」대로 그 폴더에서 npm ci를 실행하세요.`);
  }
  const docker = await exec('docker', ['version', '--format', '{{.Server.Version}}']);
  if (docker.code !== 0) throw new StopError('Docker에 연결하지 못했습니다. Docker Desktop(또는 Docker 엔진)을 켠 뒤 다시 실행하세요.');
  const existing = await exec('docker', ['container', 'inspect', container]);
  if (existing.code === 0) {
    throw new StopError(`같은 이름의 컨테이너(${container})가 이미 있어 멈춥니다. 이 시험이 남긴 것이면 지운 뒤 다시 실행하세요: docker rm -f -v ${container}`);
  }
  await assertPortFree(ports.web, 'CATCHU_E2E_WEB_PORT');
  await assertPortFree(ports.api, 'CATCHU_E2E_API_PORT');
  await assertPortFree(ports.callback, 'CATCHU_E2E_CALLBACK_PORT');
  await assertPortFree(ports.db, 'CATCHU_E2E_DB_PORT');
  const { chromium } = await import('@playwright/test');
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch {
    throw new StopError('Playwright의 Chromium(headless shell)을 띄우지 못했습니다. 이 폴더에서 npx playwright install --only-shell chromium을 실행하세요.');
  }
}

function revision() {
  const head = spawnSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  if (head.status !== 0) return '알 수 없음';
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  return `${head.stdout.trim()}(${status.stdout.trim() === '' ? '미커밋 변경 없음' : '미커밋 변경 있음'})`;
}

async function main() {
  const started = performance.now();
  const times = {};
  const settings = readSettings();
  const { container, ports } = settings;
  const runId = randomBytes(4).toString('hex');
  const webOrigin = `http://localhost:${ports.web}`;
  const callbackUri = `http://127.0.0.1:${ports.callback}/oauth/callback`;
  const db = { DB_HOST: '127.0.0.1', DB_PORT: String(ports.db), DB_USER: 'catchu', DB_PASSWORD: randomBytes(16).toString('hex'), DB_NAME: 'catchu_e2e_test' };
  let containerCreated = false;

  let cleaning = null;
  const cleanup = () => {
    cleaning ??= (async () => {
      for (const server of [...servers].reverse()) await stopServer(server);
      if (containerCreated) {
        const removed = await exec('docker', ['rm', '-f', '-v', container]);
        log(removed.code === 0 ? `DB 컨테이너를 지웠습니다: ${container}` : `DB 컨테이너를 지우지 못했습니다. 직접 지우세요: docker rm -f -v ${container}`);
      }
    })();
    return cleaning;
  };
  // npm은 받은 SIGINT를 바로 아래 자식에게 한 번 더 넘긴다. node가 npm 바로 아래에서 돌면(macOS의 /bin/sh) 같은 신호를 두 번 받으므로
  // on으로 받아 첫 신호로 정리를 시작하고, 그 뒤에 오는 신호는 출력 없이 넘긴다. once로 받으면 두 번째 신호에 정리 도중 끝난다.
  let stopping = false;
  const onStopSignal = () => {
    if (stopping) return;
    stopping = true;
    log('멈춤 신호를 받아 서버와 DB 컨테이너를 정리합니다.');
    cleanup().finally(() => process.exit(130));
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, onStopSignal);

  try {
    log(`판본 ${revision()} · 실행 ${runId}`);
    let mark = performance.now();
    await preflight(settings);
    times['사전 확인'] = performance.now() - mark;

    // DB 컨테이너와 두 빌드를 함께 시작한다.
    mark = performance.now();
    const npm = npmCli();
    // Next는 작업 폴더의 web/.env*를 스스로 읽지만, 이미 있는 환경값은 덮지 않는다(빈 값도 있는 값이다).
    // web 코드가 읽는 값을 모두 여기서 주어 원래 작업 폴더의 web/.env가 시험 빌드에 섞이지 않게 한다.
    // CATCHU_STANDALONE_BUILD는 운영 이미지 빌드 전용이라(web/next.config.ts) 빈 값으로 둔다.
    const webEnv = { ...inheritedEnv(), NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_API_BASE_URL: `http://localhost:${ports.api}`,
      NEXT_PUBLIC_DEV_LOGIN_ENABLED: 'true', NEXT_PUBLIC_AUTH_SESSION_INTEGRATION: 'true', CATCHU_STANDALONE_BUILD: '' };
    const database = (async () => {
      const at = performance.now();
      await mustExec('DB 컨테이너 시작', 'docker', ['run', '-d', '--name', container, '-p', `127.0.0.1:${ports.db}:5432`,
        '-e', `POSTGRES_USER=${db.DB_USER}`, '-e', `POSTGRES_PASSWORD=${db.DB_PASSWORD}`, '-e', `POSTGRES_DB=${db.DB_NAME}`,
        '--tmpfs', '/var/lib/postgresql/data', DB_IMAGE]);
      containerCreated = true;
      log(`DB 컨테이너를 만들었습니다: ${container}(127.0.0.1:${ports.db})`);
      for (;;) {
        const ready = await exec('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', db.DB_USER, '-d', db.DB_NAME]);
        if (ready.code === 0) break;
        if (performance.now() - at > 60_000) throw new StopError('DB 컨테이너가 60초 안에 준비되지 않았습니다.');
        await sleep(500);
      }
      times['DB 준비'] = performance.now() - at;
    })();
    const timed = async (label, work) => {
      const at = performance.now();
      await work;
      times[label] = performance.now() - at;
    };
    const apiBuild = timed('api 빌드', mustExec('api 빌드(npm run build)', process.execPath, [npm, 'run', 'build'], { cwd: apiDir, env: inheritedEnv() }));
    const webBuild = timed('web 운영 빌드', mustExec('web 운영 빌드(npm run build)', process.execPath, [npm, 'run', 'build'], { cwd: webDir, env: webEnv }));
    const results = await Promise.allSettled([database, apiBuild, webBuild]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    log(`DB·빌드 준비 끝(${seconds(performance.now() - mark)})`);

    mark = performance.now();
    const applied = await mustExec('마이그레이션', process.execPath, ['-e', MIGRATE], { cwd: apiDir, env: { ...inheritedEnv(), ...db } });
    times['마이그레이션'] = performance.now() - mark;
    log(`마이그레이션 ${applied.trim()}개 적용(${seconds(times['마이그레이션'])})`);

    mark = performance.now();
    const api = startServer('api', ['dist/main.js'], {
      cwd: apiDir,
      env: {
        ...inheritedEnv(), ...db,
        // 개발용 로그인과 개발용 돌아갈 주소는 NODE_ENV가 development·test일 때만 열린다(api/docs/claude-mcp.md 「설정」). 그 조건 그대로 test로 띄운다.
        NODE_ENV: 'test', PORT: String(ports.api), BIND_HOST: '127.0.0.1',
        AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
        AUTH_WEB_ORIGIN: webOrigin, CORS_ALLOWED_ORIGINS: webOrigin, DEV_LOGIN_ENABLED: 'true',
        SHARE_LINK_WEB_BASE_URL: webOrigin, LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
        MCP_DEV_REDIRECT_URIS: callbackUri,
      },
    });
    const web = startServer('web', [join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--port', String(ports.web), '--hostname', '127.0.0.1'],
      { cwd: webDir, env: webEnv });
    await Promise.all([waitForHttp(api, `http://127.0.0.1:${ports.api}/health`, 60_000), waitForHttp(web, `http://127.0.0.1:${ports.web}/login`, 60_000)]);
    times['서버 시작'] = performance.now() - mark;
    log(`api(127.0.0.1:${ports.api})·web(${webOrigin}) 실행(${seconds(times['서버 시작'])}). 큐·worker·AI 키 없이 띄웠습니다.`);

    mark = performance.now();
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [join(here, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', ...process.argv.slice(2)], {
        cwd: here,
        stdio: 'inherit',
        env: {
          ...process.env, ...db,
          // 실패한 시험의 화면 글(aria 스냅샷)을 결과 파일에 남기지 않는다. 받은 링크 주소가 화면 글에 있다.
          PLAYWRIGHT_NO_COPY_PROMPT: '1',
          CATCHU_E2E_WEB_ORIGIN: webOrigin, CATCHU_E2E_MCP_URL: `http://127.0.0.1:${ports.api}/v1/mcp`,
          CATCHU_E2E_CALLBACK_PORT: String(ports.callback), CATCHU_E2E_RUN_ID: runId,
        },
      });
      child.once('exit', (exitCode) => resolve(exitCode ?? 1));
    });
    times['시험'] = performance.now() - mark;
    return code;
  } catch (error) {
    // 멈춘 까닭을 정리·걸린 시간 줄보다 먼저 보인다.
    console.error(`[e2e] ${error instanceof StopError ? error.message : redact(error?.stack ?? error)}`);
    return 2;
  } finally {
    await cleanup();
    const parts = [...Object.entries(times).map(([label, ms]) => `${label} ${seconds(ms)}`), `전체 ${seconds(performance.now() - started)}`];
    log(`걸린 시간: ${parts.join(' · ')}`);
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  // 정리 중에 난 오류처럼 위에서 받지 못한 것.
  console.error(`[e2e] ${redact(error?.stack ?? error)}`);
  process.exitCode = 2;
});
