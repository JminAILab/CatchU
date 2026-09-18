// AI-DLC 2.8.1 전용 로컬 호환 진입점. 승인/상태 로직은 구현하지 않는다.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [target, ...argv] = process.argv.slice(2);
try {
  if (!target || argv[0] !== "engine" || argv[1] !== "review-brief") {
    throw new Error("Only engine review-brief is supported by this entry point.");
  }
  if (process.env.AIDLC_DISPATCH_TOOLS_DIR) {
    throw new Error("AIDLC_DISPATCH_TOOLS_DIR override is not supported here.");
  }
  const tools = join(resolve(target, ".."), "runtime/codex/.codex/tools");
  const load = (file: string) => import(pathToFileURL(join(tools, file)).href);
  const { installedExecutablePath, inspectInstalledVersion } = await load("aidlc-install-paths.ts");
  if (resolve(target) !== installedExecutablePath("2.8.1")) {
    throw new Error("This entry point requires the installed 2.8.1 executable.");
  }
  const integrity = inspectInstalledVersion("2.8.1", "codex");
  if (!integrity.complete) throw new Error(`Installed runtime integrity: ${integrity.reason}`);
  // 소스는 기계 설치 경로에 있다. 기본 프로젝트는 원래 CLI와 같이
  // 명시 플래그 > 기존 프로젝트 환경변수 > 현재 작업 디렉터리로 둔다.
  process.env.AIDLC_PROJECT_DIR ||= process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { main } = await load("aidlc.ts");
  await main(argv); // 기존 CLI 정책 검사 → 기존 review-brief 구현
} catch (error) {
  process.stderr.write(`aidlc review-brief compatibility: ${String(error)}\n`);
  process.exitCode = 1;
}
