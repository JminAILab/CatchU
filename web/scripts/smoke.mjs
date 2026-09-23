// 최소 실행 검사: 빌드 결과로 서버를 띄우고 기본 화면이 200으로 응답하는지 확인한다.
// 실행 전 `npm run build`가 끝나 있어야 한다. 외부 서비스(API·DB)를 호출하지 않는다.
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const port = process.env.PORT || "3000";
const url = `http://127.0.0.1:${port}/`;
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");

if (!existsSync(".next")) {
  console.error("[smoke] .next 폴더가 없습니다. 먼저 `npm run build`를 실행하세요.");
  process.exit(1);
}

const server = spawn(process.execPath, [nextBin, "start", "-p", port], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: port },
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function stop() {
  if (server.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* 이미 종료됨 */
    }
  } else {
    server.kill("SIGTERM");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 30_000;
let result = null;

while (Date.now() < deadline) {
  if (server.exitCode !== null) break;
  try {
    const res = await fetch(url);
    const body = await res.text();
    result = { status: res.status, ok: res.status === 200 && body.includes("CatchU web") };
    break;
  } catch {
    await sleep(500);
  }
}

stop();

if (!result) {
  console.error(`[smoke] 30초 안에 ${url} 응답을 받지 못했습니다.\n${serverLog}`);
  process.exit(1);
}
if (!result.ok) {
  console.error(`[smoke] 실패: status=${result.status}, 본문에 'CatchU web'이 없습니다.\n${serverLog}`);
  process.exit(1);
}
console.log(`[smoke] 통과: GET ${url} -> ${result.status}, 기본 화면 확인`);
