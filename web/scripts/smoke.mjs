// 최소 실행 검사: 빌드 결과로 서버를 띄우고 기본 화면이 200으로 응답하는지, 보안 헤더(#217)가 붙는지 확인한다.
// 실행 전 `npm run build`가 끝나 있어야 한다. 외부 서비스(API·DB)를 호출하지 않는다.
// 포트는 셸 환경변수 PORT로만 바꾼다(.env 파일의 PORT는 next가 읽기 전에 포트를 정하므로 적용되지 않음).
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const port = process.env.PORT || "3000";
const url = `http://127.0.0.1:${port}/`;
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
const TOTAL_MS = 30_000;

function fail(msg) {
  console.error(`[smoke] ${msg}`);
  process.exit(1);
}

if (!existsSync(".next")) fail(".next 폴더가 없습니다. 먼저 `npm run build`를 실행하세요.");

// 1) 포트가 이미 사용 중이면 기존 서버 응답으로 통과하는 것을 막기 위해 시작 전에 실패시킨다.
const portInUse = await new Promise((resolve) => {
  const sock = net.connect({ host: "127.0.0.1", port: Number(port) });
  sock.once("connect", () => { sock.destroy(); resolve(true); });
  sock.once("error", () => resolve(false));
});
if (portInUse) fail(`포트 ${port}가 이미 사용 중입니다. 켜 둔 개발 서버를 끄거나 PORT를 바꿔 다시 실행하세요.`);

// 호스트에서 직접 띄우는 검사이므로 이 컴퓨터 안(127.0.0.1)에만 연다.
const server = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: port },
});
let serverLog = "";
let ready = false;
const onData = (d) => {
  serverLog += d;
  if (/Ready in/.test(serverLog)) ready = true;
};
server.stdout.on("data", onData);
server.stderr.on("data", onData);

function stop() {
  if (server.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" }); } catch { /* 이미 종료됨 */ }
  } else {
    server.kill("SIGTERM");
  }
}

// 배포용 빌드의 응답에 있어야 할 보안 헤더. 값의 근거는 next.config.ts.
function checkHeaders(headers) {
  const errors = [];
  if (!headers.get("content-security-policy")?.includes("frame-ancestors 'none'")) errors.push("CSP에 frame-ancestors 'none'이 없습니다");
  if (headers.get("x-content-type-options") !== "nosniff") errors.push("X-Content-Type-Options가 nosniff가 아닙니다");
  if (headers.get("referrer-policy") !== "strict-origin-when-cross-origin") errors.push("Referrer-Policy가 strict-origin-when-cross-origin이 아닙니다");
  if (headers.get("strict-transport-security") !== "max-age=300") errors.push("Strict-Transport-Security가 max-age=300이 아닙니다");
  if (headers.has("x-powered-by")) errors.push("X-Powered-By가 있습니다");
  return errors;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + TOTAL_MS;
let result = null;
let error = null;

try {
  // 2) 새 서버의 Ready 출력 뒤에만 요청한다. 요청마다 남은 시간으로 타임아웃을 건다.
  while (Date.now() < deadline) {
    if (server.exitCode !== null) { error = `서버가 먼저 종료됐습니다(exit ${server.exitCode}).`; break; }
    if (!ready) { await sleep(200); continue; }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(remaining) });
      const body = await res.text();
      result = { status: res.status, ok: res.status === 200 && body.includes("CatchU web"), headerErrors: checkHeaders(res.headers) };
      break;
    } catch (e) {
      if (e?.name === "TimeoutError") break;
      await sleep(500);
    }
  }
} finally {
  stop();
}

if (error) fail(`${error}\n${serverLog}`);
if (!result) fail(`${TOTAL_MS / 1000}초 안에 ${url} 응답을 받지 못했습니다.\n${serverLog}`);
if (!result.ok) fail(`실패: status=${result.status}, 본문에 'CatchU web'이 없습니다.\n${serverLog}`);
if (result.headerErrors.length > 0) fail(`보안 헤더 실패: ${result.headerErrors.join(", ")}`);
console.log(`[smoke] 통과: GET ${url} -> ${result.status}, 기본 화면·보안 헤더 확인`);
