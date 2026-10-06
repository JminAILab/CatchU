import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import net from "node:net";
const port = Number(process.env.PORT ?? "3119");
const busy = await new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});
assert.equal(busy, false, "검사 포트가 사용 중입니다.");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "--hostname", "127.0.0.1"],
  { stdio: "ignore", windowsHide: true });
try {
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && child.exitCode === null) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch { /* 서버 시작 대기 */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "검사용 서버 시작 실패");
  for (const route of ["/preview/assets", "/preview/assets-connected"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 404, route);
  }
  console.log("통과: 배포용 서버에서 내 자산 미리보기 두 경로 모두 404");
} finally {
  if (child.exitCode === null) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else child.kill("SIGTERM");
  }
}

