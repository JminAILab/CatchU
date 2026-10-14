#!/usr/bin/env node
// 운영 이미지 검사(#275). 이 컴퓨터의 아키텍처로 web·api·worker 이미지와 api migration 이미지를 빌드하고,
// 저장소 밖 임시 폴더의 합성 환경(합성 비밀값·합성 DB·시험용 사설 CA)에서 실행 조건을 확인한다.
// 실제 GitHub·LLM·AWS·운영 DB에 연결하지 않는다. health 응답은 기동 확인일 뿐 분석 연결 성공이 아니다.
// 확인 항목·결과 해석은 deploy/README.md 「검사」.
//
// 사용(저장소 루트): node deploy/scripts/check-images.mjs [--keep] [--report <저장소 밖 JSON 경로>]
//   --keep    검사 이미지를 지우지 않는다(합성 환경·임시 폴더·컨테이너·망·DB 볼륨은 항상 지운다)
//   --report  결과(통과·실패, 이미지 ID·플랫폼, 정리 조회 결과)를 JSON으로 쓴다. 비밀값·환경변수 원문은 쓰지 않는다
// 끝에 남은 자원(컨테이너·볼륨·망, --keep이 아니면 검사 이미지까지)을 조회한다. 자원이 남았거나 조회가 실패해 확인하지
// 못하면 정리 실패로 기록하고 종료 코드 1로 끝낸다.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DEPLOY = path.join(ROOT, "deploy");
const CONTRACT = "/app/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design";
// 실행마다 다른 이름을 써서 다른 검사(다른 작업 폴더 포함)가 남긴 자원을 건드리지 않는다.
const PROJECT = `catchu-check-${randomBytes(3).toString("hex")}`;
const PORTS = { web: 23000, api: 23001, worker: 28000 };
// .dockerignore가 여는 경로(그 밖의 파일이 맥락에 있으면 실패). 둘을 함께 고친다.
const CONTEXT_ALLOWED = [
  "web/package.json", "web/package-lock.json", "web/.npmrc", "web/next.config.ts", "web/tsconfig.json", "web/src/",
  "web/scripts/check-image-build-env.mjs",
  "api/package.json", "api/package-lock.json", "api/tsconfig.json", "api/tsconfig.build.json", "api/scripts/clean-dist.cjs", "api/src/",
  "worker/.python-version", "worker/pyproject.toml", "worker/uv.lock", "worker/app/", "worker/fixtures/m1-synthetic/",
  "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
  "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml",
];
// 맥락 검사 미끼 파일. 허용한 폴더 안(.env·키)과 서비스 폴더의 허용하지 않은 자료를 함께 둔다. 모두 .gitignore 대상 이름이다.
const DECOYS = ["web/.env.catchu-check", "web/src/.env.catchu-check", "api/src/catchu-check.pem", "worker/app/.env.catchu-check",
  "worker/catchu-check-userdata.local"];
const args = process.argv.slice(2);
const keepImages = args.includes("--keep");
const reportArg = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;
const reportPath = reportArg ? path.resolve(reportArg) : null;
if (args.includes("--report") && (!reportPath || reportPath.startsWith(`${ROOT}${path.sep}`))) {
  console.error("--report에는 저장소 밖 파일 경로를 줍니다.");
  process.exit(2);
}

const results = [];
const imageInfo = {}; // 이미지 전체 ID·플랫폼(보고서용)
const captured = []; // 비밀값 노출 검사에 쓸 로그·출력(메모리에만 둔다)
const cleanups = [];

// 셸에 남은 COMPOSE_*·CATCHU_* 값이 compose 프로젝트·이미지를 바꾸지 않게 자식 프로세스에 넘기지 않는다(넘길 값은 env로 명시).
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(COMPOSE_|CATCHU_)/.test(key)));
function run(cmd, cmdArgs, { input, timeoutMs = 600_000, env, capture = true } = {}) {
  const out = spawnSync(cmd, cmdArgs, {
    cwd: ROOT, input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
    env: { ...BASE_ENV, ...(env ?? {}) },
  });
  const text = `${out.stdout ?? ""}${out.stderr ?? ""}`;
  if (capture) captured.push(text);
  return { code: out.status, signal: out.signal, stdout: out.stdout ?? "", stderr: out.stderr ?? "", text, timedOut: out.error?.code === "ETIMEDOUT" };
}
function must(cmd, cmdArgs, options) {
  const out = run(cmd, cmdArgs, options);
  if (out.code !== 0) throw new Error(`${cmd} ${cmdArgs.slice(0, 3).join(" ")} 실패(code=${out.code})\n${out.text.slice(-3000)}`);
  return out;
}
const docker = (cmdArgs, options) => run("docker", cmdArgs, options);
const mustDocker = (cmdArgs, options) => must("docker", cmdArgs, options);
// 비밀값 검사에 쓸 로그·이미지 기록을 모은다(출력은 run이 captured에 넣는다). 조회가 실패하면 빈 출력으로 통과시키지 않도록 따로 적는다.
const collectFailed = [];
const collect = (label, cmdArgs) => {
  const out = docker(cmdArgs);
  if (out.code !== 0) collectFailed.push(`${label} code=${out.code}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(group, name, ok, detail = "") {
  results.push({ group, name, status: ok ? "pass" : "fail", detail });
  console.log(`${ok ? "통과" : "실패"}  [${group}] ${name}${detail ? ` — ${detail}` : ""}`);
}
async function check(group, name, fn) {
  // 검사는 대부분 동기 실행이라, 단계마다 이벤트 루프에 양보해 Ctrl-C 처리(정리 후 종료)가 바로 돌게 한다.
  await new Promise((resolve) => setImmediate(resolve));
  try {
    const detail = await fn();
    record(group, name, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(group, name, false, error instanceof Error ? error.message.split("\n").slice(0, 4).join(" / ") : String(error));
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// ---------- 준비 ----------
const revision = (() => {
  const head = must("git", ["rev-parse", "--short=12", "HEAD"]).stdout.trim();
  const dirty = must("git", ["status", "--porcelain"]).stdout.trim() !== "";
  return dirty ? `${head}-dirty` : head;
})();
const tag = `check-${revision}-${PROJECT.slice("catchu-check-".length)}`; // 실행마다 다른 이미지 태그
const image = {
  web: `catchu-check-web:${tag}`,
  api: `catchu-check-api:${tag}`,
  apiNext: `catchu-check-api:${tag}-r2`,
  migration: `catchu-check-api-migration:${tag}`,
  worker: `catchu-check-worker:${tag}`,
};
const apiBase = `http://127.0.0.1:${PORTS.api}`;
const nodeImage = /^ARG NODE_IMAGE=(\S+)$/m.exec(readFileSync(path.join(ROOT, "web/Dockerfile"), "utf8"))?.[1];
const work = mkdtempSync(path.join(tmpdir(), "catchu-check-"));
expect(!path.resolve(work).startsWith(`${ROOT}${path.sep}`), "임시 폴더가 저장소 안에 있습니다");
const envDir = path.join(work, "env");
const composeEnv = path.join(envDir, "compose.env");
const compose = (extra) => ["compose", "-p", PROJECT, "--env-file", composeEnv, "-f", path.join(DEPLOY, "compose.single.yaml"),
  "-f", path.join(DEPLOY, "compose.local-db.yaml"), ...extra];
const replace = (extra = [], env) => run("bash", [path.join(DEPLOY, "scripts/replace-single.sh"), "--env-file", composeEnv, "--local-db", ...extra], { timeoutMs: 900_000, env });
const name = (service) => `${PROJECT}-${service}`;

async function main() {
  console.log(`[check-images] 판본 ${revision}, 임시 폴더 ${work}`);
  mustDocker(["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"]);
  // 다른 검사가 남긴 자원이 있으면 건드리지 않고 멈춘다(포트·이름이 겹칠 수 있다). 조회가 실패하면 없다고 보지 않고 멈춘다.
  const others = runQueries(OTHER_CHECK_QUERIES);
  expect(others.failedQueries.length === 0, `다른 검사가 남긴 자원을 확인하지 못했습니다: ${others.failedQueries.map(describeFailure).join(", ")}`);
  expect(others.found.length === 0, `다른 검사가 남긴 자원이 있습니다(직접 확인 뒤 지웁니다): ${others.found.slice(0, 5).join(", ")}`);
  for (const [service, port] of Object.entries(PORTS)) {
    const busy = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
    expect(!busy, `${service} 검사 포트 ${port}가 이미 사용 중입니다`);
  }

  // ---------- 1. 빌드 맥락 ----------
  // 잘못 들어가면 안 되는 미끼 파일을 새 이름으로만 만든다(기존 파일은 건드리지 않음). .gitignore 대상이라 커밋되지 않는다.
  const canary = randomBytes(16).toString("hex");
  const decoys = DECOYS;
  for (const decoy of decoys) {
    const file = path.join(ROOT, decoy);
    expect(!existsSync(file), `미끼 파일 이름이 이미 있습니다: ${decoy} (이전 검사가 중단됐다면 이 파일을 지웁니다)`);
    writeFileSync(file, `CATCHU_CHECK_CANARY=${canary}\n`);
    cleanups.push(() => rmSync(file, { force: true }));
  }
  await check("맥락", ".dockerignore가 허용한 경로만 들어간다", () => {
    const ctxTag = `catchu-check-context:${tag}`;
    mustDocker(["build", "--load", "-q", "-t", ctxTag, "-f", "-", "."], {
      input: `FROM ${nodeImage}\nCOPY . /ctx\nRUN cd /ctx && find . -type f | sort > /ctx-files && ! grep -rq ${canary} /ctx\n`,
    });
    let files;
    try {
      files = mustDocker(["run", "--rm", "--network", "none", ctxTag, "cat", "/ctx-files"]).stdout.trim().split("\n");
    } finally {
      docker(["image", "rm", "-f", ctxTag]); // 지우지 못하면 마지막 정리 조회(이미지)가 잡는다
    }
    const outside = files.filter((file) => !CONTEXT_ALLOWED.some((allowed) => file.slice(2) === allowed || (allowed.endsWith("/") && file.slice(2).startsWith(allowed))));
    expect(outside.length === 0, `허용 목록 밖 ${outside.slice(0, 5).join(", ")}`);
    const missing = ["api/src/main.ts", "web/src/lib/api-client.ts", "worker/app/main.py", "worker/fixtures/m1-synthetic/context.sample.json",
      CONTEXT_ALLOWED.at(-1), CONTEXT_ALLOWED.at(-2)].filter((need) => !files.includes(`./${need}`));
    expect(missing.length === 0, `필요한 파일 없음 ${missing.join(", ")}`);
    const banned = files.filter((file) => /(^|\/)(\.env[^/]*|node_modules|\.next|\.venv|\.git|\.aws|__pycache__|\.(mypy|pytest|ruff)_cache|\.cache|coverage)(\/|$)|\.(pem|key|log)$/.test(file));
    expect(banned.length === 0, `제외 대상 ${banned.slice(0, 5).join(", ")}`);
    return `파일 ${files.length}개, 미끼 ${decoys.length}개 제외 확인`;
  });
  for (const cleanup of cleanups.splice(0)) cleanup();

  // ---------- 2. 빌드 ----------
  const builds = [
    ["web", ["-f", "web/Dockerfile", "--build-arg", `NEXT_PUBLIC_API_BASE_URL=${apiBase}`]],
    ["api", ["-f", "api/Dockerfile"]],
    ["migration", ["-f", "api/Dockerfile", "--target", "migration"]],
    ["worker", ["-f", "worker/Dockerfile"]],
  ];
  for (const [key, buildArgs] of builds) {
    await check("빌드", `${key} 이미지`, () => {
      mustDocker(["build", "--load", "-q", ...buildArgs, "--build-arg", `SOURCE_REVISION=${revision}`, "-t", image[key], "."], { timeoutMs: 1_200_000 });
      cleanups.push(() => keepImages || docker(["image", "rm", "-f", image[key]]));
      const [id, arch, user] = mustDocker(["image", "inspect", "-f", "{{.Id}} {{.Os}}/{{.Architecture}} {{.Config.User}}", image[key]]).stdout.trim().split(" ");
      imageInfo[key] = `${id} ${arch}`;
      expect(user === "1000:1000", `실행 사용자 ${user}`);
      return `${arch} ${id.slice(0, 19)} user=${user}`;
    });
  }
  // 교체 시험용: 같은 소스에 표식만 다른 다음 판본 api 이미지
  mustDocker(["build", "--load", "-q", "-f", "api/Dockerfile", "--build-arg", `SOURCE_REVISION=${revision}-r2`, "-t", image.apiNext, "."], { timeoutMs: 1_200_000 });
  cleanups.push(() => keepImages || docker(["image", "rm", "-f", image.apiNext]));
  imageInfo.apiNext = mustDocker(["image", "inspect", "-f", "{{.Id}} {{.Os}}/{{.Architecture}}", image.apiNext]).stdout.trim();
  for (const [label, value] of [["http 외부 주소", "http://api:3001"], ["/v1 포함", "https://catchu.invalid/v1"], ["경로가 붙은 주소", "https://catchu.invalid/api"], ["주소 없음", ""]]) {
    await check("빌드", `web 빌드 입력 거부: ${label}`, () => {
      const out = docker(["build", "--load", "--progress=plain", "-f", "web/Dockerfile", "--target", "build", "--build-arg", `NEXT_PUBLIC_API_BASE_URL=${value}`, "."]);
      expect(out.code !== 0 && /\[image-build-env\] NEXT_PUBLIC_API_BASE_URL/.test(out.text), `code=${out.code}`);
    });
  }
  await check("빌드", "web 빌드 입력 거부: 개발 로그인 표시", () => {
    const out = docker(["build", "--load", "--progress=plain", "-f", "web/Dockerfile", "--target", "build", "--build-arg", `NEXT_PUBLIC_API_BASE_URL=https://catchu.invalid`, "--build-arg", "NEXT_PUBLIC_DEV_LOGIN_ENABLED=true", "."]);
    expect(out.code !== 0 && /\[image-build-env\] .*NEXT_PUBLIC_DEV_LOGIN_ENABLED/.test(out.text), `code=${out.code}`);
  });

  // ---------- 3. 이미지 내용(망 없음) ----------
  const inImage = (img, script, options) => docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--entrypoint", "sh", img, "-c", script], options);
  await check("web", "실행 파일·환경 파일, 세 이미지의 앱 파일 쓰기 권한", () => {
    const out = inImage(image.web, "test -f server.js && test -d .next/static && test ! -e public && find / -xdev -name '.env*' 2>/dev/null | wc -l");
    const envCount = Number(out.stdout.trim());
    expect(out.code === 0 && envCount === 0, `code=${out.code} env=${envCount}`);
    // 읽기 전용 파일시스템에서는 쓰기 가능 여부를 가릴 수 없으므로 이 확인만 쓰기 가능한 상태로 실행한다.
    for (const img of [image.web, image.api, image.worker]) {
      const probe = docker(["run", "--rm", "--network", "none", "--cap-drop", "ALL", "--entrypoint", "sh", img, "-c", "find /app /opt /usr/local -xdev -writable ! -type l 2>/dev/null | wc -l; find /app $(test -d /opt/uv-python && echo /opt/uv-python) ! -user 0 2>/dev/null | wc -l"]);
      const [writable, notRoot] = probe.stdout.trim().split("\n").map(Number);
      expect(probe.code === 0 && writable === 0 && notRoot === 0, `${img} writable=${writable} notRoot=${notRoot}`);
    }
    const label = mustDocker(["image", "inspect", "-f", '{{index .Config.Labels "io.catchu.web.public-api-base-url"}}', image.web]).stdout.trim();
    expect(label === apiBase, `표식 ${label}`);
    return `공개 API 주소 표식 ${label}`;
  });
  await check("api", "운영 의존성만 있고 개발 도구가 없다", () => {
    const out = inImage(image.api, "for p in ts-node typescript @types/node eslint pg-cloudflare; do test ! -e node_modules/$p || echo found:$p; done; node -e \"for (const m of ['typeorm','pg','class-validator','ajv-formats/dist/formats','yaml','jose','@nestjs/platform-express']) require(m)\" && echo loaded");
    expect(out.code === 0 && !/found:/.test(out.stdout) && /loaded/.test(out.stdout), out.text.trim().slice(0, 300));
    return "ts-node·typescript·@types/node 없음, 운영 모듈 로드";
  });
  await check("api", "계약 YAML을 실제 검증기로 읽는다", () => {
    const fixtures = path.join(ROOT, "worker/fixtures/m1-synthetic");
    const payload = { results: {}, events: {} };
    for (const file of readdirSync(path.join(fixtures, "results"))) payload.results[file] = JSON.parse(readFileSync(path.join(fixtures, "results", file), "utf8"));
    for (const file of readdirSync(path.join(fixtures, "events"))) payload.events[file] = JSON.parse(readFileSync(path.join(fixtures, "events", file), "utf8"));
    const script = `const {WorkerMessageValidator}=require('/app/api/dist/analysis-receiver/worker-message.validator.js');
const v=new WorkerMessageValidator('${CONTRACT}');let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const x=JSON.parse(s);
const r=Object.fromEntries(Object.entries(x.results).map(([k,m])=>[k,v.result(m)]));const e=Object.fromEntries(Object.entries(x.events).map(([k,m])=>[k,v.progress(m)]));
console.log(JSON.stringify({r,e,empty:v.result({})}))});`;
    const out = docker(["run", "--rm", "-i", "--network", "none", "--read-only", "--cap-drop", "ALL", image.api, "node", "-e", script], { input: JSON.stringify(payload) });
    expect(out.code === 0, out.text.slice(0, 300));
    const parsed = JSON.parse(out.stdout.trim());
    const accepted = Object.entries(parsed.r).filter(([, ok]) => ok).map(([file]) => file);
    const rejected = Object.entries(parsed.r).filter(([, ok]) => !ok).map(([file]) => file);
    expect(rejected.length === 1 && rejected[0] === "unidentifiable-missing-attempt-id.json", `거부 ${rejected.join(",")}`);
    expect(Object.values(parsed.e).every(Boolean) && parsed.empty === false, "이벤트·빈 객체 판정");
    return `결과 ${accepted.length}건 통과, 식별 불가 자료·빈 객체 거부, 이벤트 ${Object.keys(parsed.e).length}건 통과`;
  });
  await check("migration", "migration 이미지는 소스 실행 도구를 가진다", () => {
    const out = inImage(image.migration, "test -e node_modules/ts-node && test -f src/database/data-source.ts && test ! -e dist && echo ok");
    expect(out.code === 0 && /ok/.test(out.stdout), out.text.slice(0, 200));
  });
  await check("비밀값·설정", "Dockerfile에 비밀값 이름의 빌드 입력·환경변수가 없다", () => {
    const found = [];
    for (const file of ["web/Dockerfile", "api/Dockerfile", "worker/Dockerfile"]) {
      const instructions = readFileSync(path.join(ROOT, file), "utf8").replace(/\\\n/g, " ").split("\n");
      for (const line of instructions) {
        if (/^\s*(ARG|ENV)\b/.test(line) && /(SECRET|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|_KEY\b)/i.test(line)) found.push(`${file}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(found.length === 0, found.join("; "));
    return "ARG·ENV 이름 검사(값은 실행할 때 주입)";
  });
  await check("worker", "Python 판본·운영 의존성·개발 도구 부재", () => {
    const out = inImage(image.worker, ".venv/bin/python -c \"import sys,importlib.util as u;assert sys.version.split()[0]=='3.12.10',sys.version;missing=[m for m in ['fastapi','uvicorn','jsonschema','yaml','referencing','rfc3339_validator','rfc3986_validator'] if not u.find_spec(m)];dev=[m for m in ['pytest','mypy','ruff','httpx2'] if u.find_spec(m)];assert not missing and not dev,(missing,dev);import ssl;print('ok', ssl.OPENSSL_VERSION)\" && test -f /app/worker/fixtures/m1-synthetic/context.sample.json && test -f " + CONTRACT + "/worker-messages.yaml && echo layout");
    expect(out.code === 0 && /ok/.test(out.stdout) && /layout/.test(out.stdout), out.text.slice(0, 300));
    return `3.12.10, 개발 그룹 없음, 계약 YAML·합성 자료 배치, Python 내장 ${(/OpenSSL [\d.]+/.exec(out.stdout) ?? ["OpenSSL ?"])[0]}`;
  });
  const scenarios = {
    "succeeded-one-candidate": ["SUCCEEDED", 1], empty: ["EMPTY", 0], "partial-failed": ["PARTIAL_FAILED", 1], failed: ["FAILED", 0],
    "two-candidates-same-work": ["SUCCEEDED", 2], "draft-failed": ["PARTIAL_FAILED", null], "reflection-failed": ["PARTIAL_FAILED", null],
    "title-failed": ["SUCCEEDED", null], "execution-unknown": [null, null],
  };
  await check("worker", "WEB_CONCURRENCY=4에서도 프로세스 1개", async () => {
    const probe = `${PROJECT}-concurrency`;
    mustDocker(["run", "-d", "--name", probe, "--network", "none", "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL", "-e", "WEB_CONCURRENCY=4", image.worker]);
    try {
      await sleep(3000);
      const lines = mustDocker(["top", probe, "-o", "pid,args"]).stdout.trim().split("\n").slice(1);
      expect(lines.length === 1 && /--workers 1/.test(lines[0]), `프로세스 ${lines.length}개`);
    } finally {
      docker(["rm", "-f", probe]);
    }
  });
  await check("worker", "MOCK 시나리오 9개(읽기 전용·망 없음)", () => {
    const failed = [];
    for (const [scenario, [outcome, candidates]] of Object.entries(scenarios)) {
      const out = docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", image.worker, ".venv/bin/python", "-m", "app.processing", scenario]);
      try {
        const parsed = JSON.parse(out.stdout);
        const result = parsed.result;
        const ok = out.code === 0 && (outcome === null ? result === null && parsed.events.at(-1)?.state === "UNCERTAIN"
          : result?.outcome === outcome && result?.sourceMode === "MOCK" && (candidates === null || result.candidates.length === candidates));
        if (!ok) failed.push(scenario);
      } catch {
        failed.push(scenario);
      }
    }
    expect(failed.length === 0, `실패 ${failed.join(",")}`);
    return "README 기대 종결값과 일치";
  });

  // ---------- 4. 합성 환경 실행 ----------
  must("bash", [path.join(DEPLOY, "scripts/make-local-env.sh"), envDir], {
    env: {
      CATCHU_SINGLE_NAME: PROJECT, CATCHU_WEB_IMAGE: image.web, CATCHU_API_IMAGE: image.api, CATCHU_MIGRATION_IMAGE: image.migration,
      CATCHU_WORKER_IMAGE: image.worker, CATCHU_WEB_PORT: String(PORTS.web), CATCHU_API_PORT: String(PORTS.api), CATCHU_WORKER_PORT: String(PORTS.worker),
    },
  });
  // 정리는 등록 역순으로 돈다: compose 밖에서 망에 붙인 컨테이너를 먼저 지우고 → compose down → 남은 망을 지운다.
  cleanups.push(() => docker(["network", "rm", `${PROJECT}_db`, `${PROJECT}_default`]));
  cleanups.push(() => docker([...compose(["--profile", "migration", "down", "-v", "--remove-orphans", "-t", "30"])]));
  cleanups.push(() => docker(["rm", "-f", ...docker(["ps", "-aq", "--filter", `name=^${PROJECT}-`]).stdout.split("\n").filter(Boolean)]));
  const envValues = (file) => Object.fromEntries(readFileSync(path.join(envDir, file), "utf8").split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const apiEnv = envValues("api.env");
  const secrets = [apiEnv.AUTH_JWT_SECRET, apiEnv.LINK_GRANT_SECRET, apiEnv.DB_PASSWORD, envValues("migration.env").DB_PASSWORD, envValues("db.env").POSTGRES_PASSWORD].filter(Boolean);
  const wrongCa = path.join(work, "wrong-ca.pem");
  must("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=catchu wrong CA", "-keyout", path.join(work, "wrong-ca.key"), "-out", wrongCa]);
  run("chmod", ["644", wrongCa]);

  const first = replace(["--migrate"]);
  await check("설치", "처음 설치: migration → api → worker → web", () => {
    expect(first.code === 0, `replace code=${first.code}\n${first.text.slice(-800)}`);
    // 컨테이너가 아직 없는 상태를 조회 실패가 아니라 "없음"으로 판정하고 진행했는지 본다.
    const absent = ["web", "api", "worker"].filter((service) => !first.text.includes(`교체 전 ${service}: 컨테이너 없음`));
    expect(absent.length === 0, `컨테이너 없음 기록이 없는 서비스 ${absent.join(",")}`);
    const pulled = /합성 DB 이미지를 받았습니다/.test(first.text) ? "합성 DB 이미지를 받음, " : "합성 DB 이미지는 이미 있음, ";
    return pulled + (/중지 시작부터 web 정상 확인까지 \d+초/.exec(first.text) ?? [""])[0];
  });
  const psql = (sql) => mustDocker(["exec", name("db"), "psql", "-U", "postgres", "-d", "catchu", "-Atc", sql]).stdout.trim();
  const migrationFiles = readdirSync(path.join(ROOT, "api/src/database/migrations")).filter((file) => file.endsWith(".ts")).length;

  await check("web", "기본 화면·정적 자산·보안 헤더", async () => {
    const res = await fetch(`http://127.0.0.1:${PORTS.web}/`);
    const html = await res.text();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(res.status === 200 && html.includes("CatchU web"), `status=${res.status}`);
    expect(csp.includes(`connect-src 'self' ${apiBase}`) && csp.includes("frame-ancestors 'none'"), `CSP ${csp}`);
    expect(res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "nosniff·Referrer-Policy");
    expect(res.headers.get("strict-transport-security") === "max-age=300" && !res.headers.has("x-powered-by"), "HSTS·X-Powered-By");
    const assets = [...new Set(html.match(/\/_next\/static\/[^"']+\.(?:js|css)/g) ?? [])];
    const js = assets.find((asset) => asset.endsWith(".js"));
    const css = assets.find((asset) => asset.endsWith(".css"));
    for (const [asset, type] of [[js, "javascript"], [css, "text/css"]]) {
      expect(asset, `${type} 자산을 HTML에서 찾지 못함`);
      const assetRes = await fetch(`http://127.0.0.1:${PORTS.web}${asset}`);
      expect(assetRes.status === 200 && (assetRes.headers.get("content-type") ?? "").includes(type), `${asset} ${assetRes.status}`);
    }
    return `CSP connect-src에 ${apiBase}, JS·CSS 200`;
  });
  await check("api", "health와 앱 계정의 TLS DB 조회", async () => {
    const health = await fetch(`http://127.0.0.1:${PORTS.api}/health`);
    expect(health.status === 200 && (await health.json()).status === "ok", `health ${health.status}`);
    expect(health.headers.get("content-security-policy") === "default-src 'none'; frame-ancestors 'none'" && health.headers.get("strict-transport-security") === "max-age=300", "api 보안 헤더");
    const token = randomBytes(32).toString("base64url");
    const unlock = await fetch(`http://127.0.0.1:${PORTS.api}/v1/public/links/${token}/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"password":"x"}' });
    const body = await unlock.json();
    expect(unlock.status === 404 && body.code === "LINK_UNAVAILABLE", `unlock ${unlock.status} ${body.code}`);
    const ssl = psql("select string_agg(distinct a.usename || ':' || s.ssl || ':' || coalesce(s.version,''), ',') from pg_stat_ssl s join pg_stat_activity a using(pid) where a.usename = 'catchu_app'");
    expect(/^catchu_app:(t|true):TLSv1\.[23]$/.test(ssl), `pg_stat_ssl ${ssl}`);
    return `공개 링크 조회 404(LINK_UNAVAILABLE), DB 세션 ${ssl}`;
  });
  await check("worker", "health", async () => {
    const res = await fetch(`http://127.0.0.1:${PORTS.worker}/health`);
    expect(res.status === 200 && (await res.json()).status === "ok", `status=${res.status}`);
  });
  await check("단일 실행", "서비스마다 프로세스 1개", () => {
    const counts = ["api", "worker", "web"].map((service) => {
      // compose health 확인(fetch·urlopen)이 잠깐 띄우는 프로세스는 세지 않는다.
      const lines = mustDocker(["top", name(service), "-o", "pid,args"]).stdout.trim().split("\n").slice(1).filter((line) => !/fetch\(|urlopen/.test(line));
      return [service, lines.length];
    });
    expect(counts.every(([, count]) => count === 1), JSON.stringify(counts));
    return counts.map(([service, count]) => `${service}=${count}`).join(" ");
  });
  await check("migration", "적용 이력·소유자·앱 계정 권한", () => {
    const count = Number(psql("select count(*) from migrations"));
    expect(count === migrationFiles, `이력 ${count}건, 파일 ${migrationFiles}개`);
    const owners = psql("select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public'");
    expect(owners === "catchu_migrator", `소유자 ${owners}`);
    const denied = docker(["exec", name("db"), "psql", "-U", "postgres", "-d", "catchu", "-c", "set role catchu_app; create table catchu_check_denied(x int);"]);
    expect(denied.code !== 0 && /permission denied/.test(denied.text), "앱 계정 CREATE 거부");
    return `이력 ${count}건, 소유 catchu_migrator, 앱 계정 CREATE 거부`;
  });
  await check("migration", "순차 재실행은 적용할 것이 없다", () => {
    const runName = `${PROJECT}-migration-rerun`;
    const out = docker([...compose(["--profile", "migration", "run", "-T", "--no-deps", "--name", runName, "migration"])]);
    docker(["rm", "-f", runName]);
    expect(out.code === 0 && /No migrations are pending/.test(out.text), `code=${out.code}`);
    expect(Number(psql("select count(*) from migrations")) === migrationFiles, "이력 수 변화");
    return "동시 실행 안전성은 이 검사로 확인하지 않는다";
  });

  // ---------- 5. TLS·설정 거부 ----------
  const dbIp = mustDocker(["inspect", "-f", `{{(index .NetworkSettings.Networks "${PROJECT}_db").IPAddress}}`, name("db")]).stdout.trim();
  // sslmode=false면 PGSSLMODE를 주지 않아 이미지 기본값을 쓴다.
  const oneShot = (img, envFile, extra, ca = path.join(envDir, "tls/ca.pem"), sslmode = true) => docker(["run", "--rm", "--network", `${PROJECT}_db`, "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL",
    "--env-file", path.join(envDir, envFile), ...(sslmode ? ["-e", "PGSSLMODE=verify-full"] : []), "-e", "NODE_EXTRA_CA_CERTS=/run/catchu/db-ca.pem",
    "-v", `${ca}:/run/catchu/db-ca.pem:ro`, ...extra, img], { timeoutMs: 90_000 });
  const tlsCases = [
    ["api", "틀린 CA", image.api, "api.env", [], wrongCa, /self[- ]signed certificate|unable to (get|verify)/i],
    ["api", "인증서에 없는 호스트(IP 접속)", image.api, "api.env", ["-e", `DB_HOST=${dbIp}`], undefined, /not in the cert's list|does not match/i],
    ["api", "평문 연결", image.api, "api.env", ["-e", "PGSSLMODE=disable"], undefined, /no pg_hba\.conf entry.*no encryption/i],
    ["migration", "틀린 CA", image.migration, "migration.env", [], wrongCa, /self[- ]signed certificate|unable to (get|verify)/i],
    ["migration", "인증서에 없는 호스트(IP 접속)", image.migration, "migration.env", ["-e", `DB_HOST=${dbIp}`], undefined, /not in the cert's list|does not match/i],
    ["migration", "평문 연결", image.migration, "migration.env", ["-e", "PGSSLMODE=disable"], undefined, /no pg_hba\.conf entry.*no encryption/i],
    ["api", "PGSSLMODE 없이 실행(이미지 기본값으로 검증)", image.api, "api.env", ["-e", `DB_HOST=${dbIp}`], undefined, /not in the cert's list|does not match/i, false],
    ["migration", "PGSSLMODE 없이 실행(이미지 기본값으로 검증)", image.migration, "migration.env", ["-e", `DB_HOST=${dbIp}`], undefined, /not in the cert's list|does not match/i, false],
  ];
  for (const [group, label, img, envFile, extra, ca, pattern, sslmode = true] of tlsCases) {
    await check(group, `DB TLS 거부: ${label}`, () => {
      const out = oneShot(img, envFile, extra, ca, sslmode);
      expect(out.code !== 0 && !out.timedOut && pattern.test(out.text), `code=${out.code} timedOut=${out.timedOut}`);
      return `종료 코드 ${out.code}`;
    });
  }
  await check("비밀값·설정", "env 파일의 NODE_TLS_REJECT_UNAUTHORIZED=0으로 DB 인증서 검증을 끌 수 없다", () => {
    // 대조: compose 밖에서 같은 값을 직접 주면 검증이 꺼져 접속된다(이 검사가 실제로 가르는지 확인).
    const bypass = oneShot(image.migration, "migration.env", ["-e", `DB_HOST=${dbIp}`, "-e", "NODE_TLS_REJECT_UNAUTHORIZED=0"]);
    expect(bypass.code === 0, `대조 실행 code=${bypass.code}`);
    const file = path.join(envDir, "migration.env");
    const original = readFileSync(file, "utf8");
    writeFileSync(file, `${original.replace(/^DB_HOST=.*$/m, `DB_HOST=${dbIp}`)}NODE_TLS_REJECT_UNAUTHORIZED=0\n`);
    try {
      const out = docker(compose(["--profile", "migration", "run", "--rm", "-T", "--no-deps", "migration"]), { timeoutMs: 90_000 });
      expect(out.code !== 0 && /not in the cert's list|does not match/i.test(out.text), `code=${out.code}`);
    } finally {
      writeFileSync(file, original);
    }
    return "직접 실행은 검증이 꺼지고, compose 실행은 고정값(1)으로 거부";
  });
  const configCases = [
    ["LINK_GRANT_SECRET 없음", ["-e", "LINK_GRANT_SECRET="], /LINK_GRANT_SECRET is required/],
    ["LINK_GRANT_SECRET가 AUTH_JWT_SECRET와 같음", ["-e", `LINK_GRANT_SECRET=${apiEnv.AUTH_JWT_SECRET.toUpperCase()}`], /must differ/],
    ["AUTH_JWT_SECRET 형식 오류", ["-e", "AUTH_JWT_SECRET=not-a-key"], /AUTH_JWT_SECRET must be/],
    ["AUTH_JWT_SECRET 없음", ["-e", "AUTH_JWT_SECRET="], /AUTH_JWT_SECRET/],
    ["http CORS 출처", ["-e", "CORS_ALLOWED_ORIGINS=http://localhost:3000"], /CORS_ALLOWED_ORIGINS/],
    ["http 공유 링크 주소", ["-e", "SHARE_LINK_WEB_BASE_URL=http://catchu.invalid"], /SHARE_LINK_WEB_BASE_URL/],
  ];
  for (const [label, extra, pattern] of configCases) {
    await check("비밀값·설정", `api 기동 거부: ${label}`, () => {
      const out = oneShot(image.api, "api.env", ["-e", "NODE_ENV=production", ...extra]);
      expect(out.code === 1 && pattern.test(out.text), `code=${out.code}`);
    });
  }
  await check("비밀값·설정", "production에서 개발 로그인 플래그를 켜도 403", async () => {
    const devName = `${PROJECT}-devlogin`;
    mustDocker(["run", "-d", "--name", devName, "--network", `${PROJECT}_db`, "--env-file", path.join(envDir, "api.env"), "-e", "NODE_ENV=production",
      "-e", "DEV_LOGIN_ENABLED=true", "-e", "PGSSLMODE=verify-full", "-e", "NODE_EXTRA_CA_CERTS=/run/catchu/db-ca.pem",
      "-v", `${path.join(envDir, "tls/ca.pem")}:/run/catchu/db-ca.pem:ro`, image.api]);
    try {
      const probe = "fetch('http://127.0.0.1:3001/health').then(()=>fetch('http://127.0.0.1:3001/v1/auth/dev-login',{method:'POST',headers:{'content-type':'application/json'},body:'{\"memberId\":\"00000000-0000-4000-8000-000000000001\"}'})).then(r=>{console.log(r.status);process.exit(0)},()=>process.exit(1))";
      let status = null;
      for (let i = 0; i < 30 && status === null; i += 1) {
        const out = docker(["exec", devName, "node", "-e", probe]);
        if (out.code === 0) status = out.stdout.trim();
        else await sleep(1000);
      }
      expect(status === "403", `status=${status}`);
    } finally {
      collect("개발 로그인 시험 api 로그", ["logs", devName]);
      docker(["rm", "-f", devName]);
    }
  });
  await check("망", "worker는 합성 DB 망에 닿지 않는다", () => {
    const out = docker(["exec", name("worker"), "/app/worker/.venv/bin/python", "-c",
      `import socket\ntry:\n socket.getaddrinfo('db',5432)\n print('resolved')\nexcept OSError:\n print('no-name')\ntry:\n socket.create_connection(('${dbIp}',5432),3)\n print('connected')\nexcept OSError:\n print('no-route')`]);
    expect(/no-name/.test(out.stdout) && /no-route/.test(out.stdout), out.stdout.trim());
    return "이름 해석 실패·IP 연결 실패";
  });

  // ---------- 6. 계획 교체 ----------
  // 컨테이너 inspect에는 주입한 환경변수가 들어 있으므로 비밀값 검사용 출력에 넣지 않는다.
  const inspect = (container) => JSON.parse(mustDocker(["inspect", container], { capture: false }).stdout)[0];
  // 세 서비스 중 지금 실행 중인 것. 조회가 실패하면 "멈춤"으로 읽지 않고 그 시험을 실패시킨다.
  const runningNow = () => ["api", "worker", "web"].filter((service) => {
    const out = docker(["inspect", "-f", "{{.State.Running}}", name(service)]);
    if (out.code !== 0) throw new Error(`${service} 실행 상태를 조회하지 못함(code=${out.code})`);
    return out.stdout.trim() === "true";
  });
  const oldApi = inspect(name("api"));
  const composeText = readFileSync(composeEnv, "utf8");
  writeFileSync(composeEnv, composeText.replace(`CATCHU_API_IMAGE=${image.api}`, `CATCHU_API_IMAGE=${image.apiNext}`));
  const swap = replace();
  await check("교체", "api 새 판본으로 교체: 이전 실행 종료 뒤 새 실행 시작", () => {
    expect(swap.code === 0, `replace code=${swap.code}\n${swap.text.slice(-600)}`);
    const newApi = inspect(name("api"));
    const oldState = /api: (\w+) exited exit=(\d+) started=\S+ finished=(\S+)/.exec(swap.text);
    expect(oldState && oldState[1] === oldApi.Id, "종료 확인 기록에 이전 api가 없음");
    expect(newApi.Id !== oldApi.Id && newApi.Image !== oldApi.Image, "컨테이너·이미지가 바뀌지 않음");
    expect(["0", "143"].includes(oldState[2]), `이전 api 종료 코드 ${oldState[2]}(137이면 강제 종료)`);
    const finished = Date.parse(oldState[3]);
    const started = Date.parse(newApi.State.StartedAt);
    expect(finished < started, "새 실행이 이전 실행 종료 전에 시작됨");
    return `이전 종료 코드 ${oldState[2]}, 종료→새 시작 ${((started - finished) / 1000).toFixed(1)}초, ${(/중지 시작부터 web 정상 확인까지 \d+초/.exec(swap.text) ?? [""])[0]}`;
  });
  const strayName = `${PROJECT}-stray-api`;
  mustDocker(["run", "-d", "--name", strayName, "--label", `com.docker.compose.project=${PROJECT}`, "--label", "com.docker.compose.service=api",
    "--network", "none", image.apiNext, "node", "-e", "setInterval(() => {}, 1e9)"]);
  const blocked = replace();
  await check("교체", "같은 라벨의 api가 남아 있으면 새 실행을 시작하지 않는다", () => {
    expect(blocked.code === 3, `replace code=${blocked.code}`);
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 3, web·api·worker 모두 멈춘 상태 유지";
  });
  docker(["rm", "-f", strayName]);
  psql("alter role catchu_migrator nologin");
  const migrationFail = replace(["--migrate"]);
  psql("alter role catchu_migrator login");
  await check("교체", "migration이 실패하면 새 실행을 시작하지 않는다", () => {
    expect(migrationFail.code === 4, `replace code=${migrationFail.code}`);
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    const kept = docker(["ps", "-a", "--filter", `name=^${PROJECT}-migration-`, "--format", "{{.Names}} {{.Status}}"]).stdout.trim();
    expect(/Exited \((?!0\))\d+\)/.test(kept), `남긴 실행 ${kept}`);
    return "종료 코드 4, 실패한 migration 컨테이너를 남김";
  });
  const leftoverBlocked = replace();
  await check("교체", "실패한 migration 실행이 남아 있으면 되돌리기·재시작도 멈춘다", () => {
    expect(leftoverBlocked.code === 5, `replace code=${leftoverBlocked.code}`);
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 5";
  });
  // 운영자가 남긴 실행을 확인하고 지운 상황
  docker(["rm", "-f", ...docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${PROJECT}`, "--filter", "label=com.docker.compose.service=migration"]).stdout.split("\n").filter(Boolean)]);
  const recovered = replace();
  await check("교체", "원인 해결 뒤 다시 시작", () => {
    expect(recovered.code === 0, `replace code=${recovered.code}`);
  });
  // web을 SIGSTOP으로 멈춰 SIGTERM에 응답하지 못하게 한 뒤 교체한다. 대기 상한(2초)이 지나 Docker가 강제 종료(137)한다.
  mustDocker(["kill", "--signal", "SIGSTOP", name("web")]);
  const forced = replace(["--stop-timeout", "2"]);
  await check("교체", "대기 상한을 넘어 강제 종료되면 새 실행을 시작하지 않는다", () => {
    expect(forced.code === 7, `replace code=${forced.code}`);
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    expect(/web: \w+ exited exit=137/.test(forced.text), "web 강제 종료(137) 기록 없음");
    return "web 137, 종료 코드 7";
  });
  const resumed = replace();
  await check("교체", "원인 확인 뒤 다시 실행하면 이어서 시작", () => {
    expect(resumed.code === 0, `replace code=${resumed.code}`);
  });
  // 가짜 docker: PATH 앞에 두어 정해진 호출만 실패시키거나 그 호출 뒤에 상태를 바꾸고(예: api 다시 시작), 나머지는 실제 docker로
  // 넘긴다. 실제 데몬은 멈추지 않는다.
  // 모드마다 폴더를 따로 둔다(replace-single.sh는 CATCHU_*를 지우고 BASE_ENV는 COMPOSE_·CATCHU_를 빼므로 환경변수로 넘기지 않는다).
  // marker는 5단계 시작(api를 띄우는 up) 뒤에만, stopped는 2단계 중지 명령 뒤에만 오류를 넣을 때 쓴다.
  // 규칙에 맞지 않는 호출(2·3단계, 합성 DB의 up 등)은 실제 docker로 지나간다.
  const realDocker = must("sh", ["-c", "command -v docker"]).stdout.trim();
  const dockerShim = (mode, rule) => {
    const dir = path.join(work, `docker-shim-${mode}`);
    mkdirSync(dir);
    writeFileSync(path.join(dir, "docker"), `#!/usr/bin/env bash
marker="${dir}/started"
stopped="${dir}/stopped"
if [ "$1" = compose ] && [[ " $* " == *" up "* ]] && [ "\${@: -1}" = api ]; then : > "$marker"; fi
if [ "$1" = compose ] && [[ " $* " == *" stop "* ]]; then : > "$stopped"; fi
${rule}
exec "${realDocker}" "$@"
`, { mode: 0o755 });
    return { PATH: `${dir}:${process.env.PATH}` };
  };
  // worker 자리에 기동하지 못하는 이미지(migration 이미지: DB 설정이 없어 바로 끝난다)를 넣어 api가 뜬 뒤 실패하게 한다.
  const composeNow = readFileSync(composeEnv, "utf8");
  try {
    writeFileSync(composeEnv, composeNow.replace(`CATCHU_WORKER_IMAGE=${image.worker}`, `CATCHU_WORKER_IMAGE=${image.migration}`));
    const healthFail = replace();
    await check("교체", "새 실행이 정상 확인에 실패하면 먼저 시작한 서비스도 다시 멈추고 종료를 확인한다", () => {
      expect(healthFail.code === 6, `replace code=${healthFail.code}`);
      expect(/api 시작/.test(healthFail.text) && /새 실행 실패: worker/.test(healthFail.text), "api 시작 뒤 worker 실패 기록 없음");
      expect(/세 서비스의 종료를 확인했습니다/.test(healthFail.text), "종료 확인 기록 없음");
      const running = runningNow();
      expect(running.length === 0, `실행 중 ${running.join(",")}`);
      return "종료 코드 6, api·worker·web 모두 멈춤";
    });
    // 다시 멈춘 뒤 상태 조회(docker ps)만 실패시킨다. 중지는 실제로 일어나지만 확인할 수 없으므로 6이 아니라 3이어야 한다.
    const healthFailUnknown = replace([], dockerShim("ps-unknown",
      `if [ -e "$marker" ] && [ "$1" = ps ]; then echo "검사용 가짜 Docker 오류: 상태 조회" >&2; exit 1; fi`));
    await check("교체", "새 실행 실패 뒤 상태 조회가 실패하면 멈췄다고 보지 않는다", () => {
      expect(healthFailUnknown.code === 3, `replace code=${healthFailUnknown.code}`);
      expect(/실행 상태를 확인하지 못했습니다\. 멈췄다고 보지 않습니다/.test(healthFailUnknown.text), "조회 실패 기록 없음");
      expect(!/종료를 확인했습니다/.test(healthFailUnknown.text), "조회하지 못했는데 종료 확인을 기록함");
      const running = runningNow();
      expect(running.length === 0, `실행 중 ${running.join(",")}`);
      return "종료 코드 3, 종료 확인 기록 없음(실제로는 세 서비스 멈춤)";
    });
    // 다시 멈출 때 api 중지만 실패시킨다. 서비스별로 중지하므로 web·worker는 멈추고, api가 남아 3이어야 한다.
    // 서비스 인자를 지우는 방식은 쓰지 않는다(인자 없는 compose stop은 합성 DB까지 멈춘다).
    const healthFailLeft = replace([], dockerShim("api-left",
      `if [ -e "$marker" ] && [ "$1" = compose ] && [[ " $* " == *" stop "* ]] && [ "\${@: -1}" = api ]; then echo "검사용 가짜 Docker 오류: 중지" >&2; exit 1; fi`));
    await check("교체", "새 실행 실패 뒤 다시 멈추지 못한 서비스가 남으면 종료 코드 3", () => {
      expect(healthFailLeft.code === 3, `replace code=${healthFailLeft.code}`);
      expect(/중지 명령이 실패했습니다: api/.test(healthFailLeft.text) && /api 실행이 남아 있습니다/.test(healthFailLeft.text), "중지 실패·남은 실행 기록 없음");
      const running = runningNow();
      expect(running.length === 1 && running[0] === "api", `실행 중 ${running.join(",")}`);
      return "종료 코드 3, api만 남음";
    });
  } finally {
    writeFileSync(composeEnv, composeNow);
  }
  const restored = replace();
  await check("교체", "원래 이미지로 다시 시작", () => {
    expect(restored.code === 0, `replace code=${restored.code}`);
  });
  // web 중지 명령만 실패하는 가짜 docker로 교체한다. 나머지(api·worker)도 멈추고, 종료 확인에서 종료 코드 3으로 끝나야 한다.
  const stopFail = replace([], dockerShim("web-stop",
    `if [ "$1" = compose ] && [[ " $* " == *" stop "* ]] && [ "\${@: -1}" = web ]; then echo "검사용 가짜 Docker 오류" >&2; exit 1; fi`));
  await check("교체", "중지 명령 하나가 실패해도 나머지를 멈추고 종료 확인에서 멈춘다", () => {
    expect(stopFail.code === 3, `replace code=${stopFail.code}`);
    expect(/중지 명령이 실패했습니다: web/.test(stopFail.text), "실패 기록 없음");
    const running = runningNow();
    expect(running.length === 1 && running[0] === "web", `실행 중 ${running.join(",")}`);
    return "web만 남고 api·worker 멈춤, 종료 코드 3";
  });
  const afterStopFail = replace();
  await check("교체", "원인 해결 뒤 다시 실행하면 이어서 시작", () => {
    expect(afterStopFail.code === 0, `replace code=${afterStopFail.code}`);
  });
  // web을 SIGSTOP으로 멈춰 대기 상한(2초) 뒤 강제 종료(137)되게 하고, 중지 뒤 api의 상태·종료 코드 inspect만 실패시킨다.
  // 조회하지 못한 api 때문에 3으로 멈추되, 이미 확인한 web 137과 교체 전에 실행 중이던 서비스를 함께 적어야 한다
  // (다시 실행하면 멈춘 web은 강제 종료 판정에서 빠지므로 운영자가 확인할 대상이다).
  mustDocker(["kill", "--signal", "SIGSTOP", name("web")]);
  const forcedUnknown = replace(["--stop-timeout", "2", "--migrate"], dockerShim("forced-unknown",
    `if [ -e "$stopped" ] && [ "$1" = inspect ] && [[ " $* " == *"{{.State.Running}} {{.State.ExitCode}}"* ]] && [ "\${@: -1}" = "${name("api")}" ]; then echo "검사용 가짜 Docker 오류: api 종료 코드 조회" >&2; exit 1; fi`));
  await check("교체", "강제 종료(137)와 다른 서비스의 조회 실패가 겹치면 3으로 멈추고 137을 함께 적는다", () => {
    expect(forcedUnknown.code === 3, `replace code=${forcedUnknown.code}`);
    expect(/확인하지 못했습니다: api\./.test(forcedUnknown.text) && /강제 종료\(137\)된 서비스도 있습니다: web\./.test(forcedUnknown.text), "조회 실패·137 기록 없음");
    expect(/교체 전 실행 중: web api worker\./.test(forcedUnknown.text), "교체 전 실행 중 기록 없음");
    expect(![/migration 실행:/, /api 시작/].some((step) => step.test(forcedUnknown.text)), "migration·새 실행을 시도함");
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 3, 출력에 api 조회 실패·web 137·교체 전 실행 중 서비스";
  });
  const afterForcedUnknown = replace();
  await check("교체", "종료 코드를 확인한 뒤 다시 실행하면 이어서 시작", () => {
    expect(afterForcedUnknown.code === 0, `replace code=${afterForcedUnknown.code}`);
  });
  // 교체를 시작할 때의 실행 상태 조회(이름으로 찾는 docker ps)만 실패시킨다. 실행 중이었는지 모르면 강제 종료를 가릴 수 없으므로
  // 아무것도 멈추지 않고 3이어야 한다. --migrate를 주어 migration도 시작하지 않는지 본다.
  const preUnknown = replace(["--migrate"], dockerShim("pre-unknown",
    `if [ ! -e "$stopped" ] && [ "$1" = ps ] && [[ " $* " == *" name="* ]]; then echo "검사용 가짜 Docker 오류: 교체 전 조회" >&2; exit 1; fi`));
  await check("교체", "교체를 시작할 때 상태 조회가 실패하면 아무것도 멈추지 않고 종료 코드 3", () => {
    expect(preUnknown.code === 3, `replace code=${preUnknown.code}`);
    expect(/교체 전 web 실행 상태를 확인하지 못했습니다/.test(preUnknown.text), "조회 실패 기록 없음");
    expect(![/web·api 중지/, /migration 실행:/, /api 시작/].some((step) => step.test(preUnknown.text)), "중지·migration·새 실행을 시도함");
    const running = runningNow();
    expect(running.length === 3, `실행 중 ${running.join(",")}`);
    return "종료 코드 3, 세 서비스는 그대로 실행 중, 중지·migration·새 실행 없음";
  });
  // 중지 뒤 실행 상태·종료 코드를 읽는 inspect만 실패시킨다. 강제 종료(137) 여부를 모르므로 migration·새 실행 없이 3이어야 한다.
  const exitUnknown = replace(["--migrate"], dockerShim("exit-unknown",
    `if [ -e "$stopped" ] && [ "$1" = inspect ] && [[ " $* " == *"{{.State.Running}} {{.State.ExitCode}}"* ]]; then echo "검사용 가짜 Docker 오류: 종료 코드 조회" >&2; exit 1; fi`));
  await check("교체", "중지 뒤 종료 코드 조회가 실패하면 migration·새 실행 없이 종료 코드 3", () => {
    expect(exitUnknown.code === 3, `replace code=${exitUnknown.code}`);
    expect(/실행 상태·종료 코드를 확인하지 못했습니다/.test(exitUnknown.text), "조회 실패 기록 없음");
    expect(![/migration 실행:/, /api 시작/].some((step) => step.test(exitUnknown.text)), "migration·새 실행을 시도함");
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 3, 세 서비스 멈춤, migration·새 실행 없음";
  });
  // migration 성공을 확인한 뒤의 실행 컨테이너 삭제(docker rm)만 실패시킨다. 실패·불명으로 안내하지 않고 성공 기록과 컨테이너를
  // 남긴 채 8로 멈춰야 한다. 이어서 정리 없이 다시 실행하면 5, 운영자가 지운 뒤 다시 실행하면 이어서 시작한다.
  const cleanupFail = replace(["--migrate"], dockerShim("rm-fail",
    `if [ "$1" = rm ]; then echo "검사용 가짜 Docker 오류: 삭제" >&2; exit 1; fi`));
  const keptRun = /실행 컨테이너\((\S+)\)를 지우지 못했습니다/.exec(cleanupFail.text)?.[1];
  await check("교체", "migration 성공 뒤 실행 컨테이너를 지우지 못하면 성공 기록과 컨테이너를 남기고 종료 코드 8", () => {
    expect(cleanupFail.code === 8, `replace code=${cleanupFail.code}`);
    expect(keptRun && cleanupFail.text.includes(`migration 성공: ${keptRun}`), "성공·실행 이름 기록 없음");
    expect(![/migration 실패/, /결과가 불분명/, /api 시작/].some((step) => step.test(cleanupFail.text)), "실패·불명으로 안내했거나 새 실행을 시작함");
    const kept = docker(["inspect", "-f", "{{.State.Status}} {{.State.ExitCode}}", keptRun]).stdout.trim();
    expect(kept === "exited 0", `남긴 실행 ${kept}`);
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return `종료 코드 8, ${keptRun} exited 0 보존, 세 서비스 멈춤`;
  });
  const afterCleanupFail = replace();
  await check("교체", "남긴 실행을 지우지 않고 다시 실행하면 남은 실행으로 보고 종료 코드 5", () => {
    expect(afterCleanupFail.code === 5, `replace code=${afterCleanupFail.code}`);
    expect(keptRun && afterCleanupFail.text.includes(keptRun) && /8\(migration 성공·정리 실패\)/.test(afterCleanupFail.text), "남은 실행·8 안내 없음");
    expect(runningNow().length === 0, "새 실행을 시작함");
  });
  // 운영자가 exited 0을 확인하고 직접 지운 상황
  if (keptRun) docker(["rm", keptRun]);
  const afterManualCleanup = replace();
  await check("교체", "남긴 실행을 지운 뒤 --migrate 없이 다시 실행하면 이어서 시작", () => {
    expect(afterManualCleanup.code === 0, `replace code=${afterManualCleanup.code}`);
  });
  // web까지 띄운 직후 api를 다시 시작시키고(뒤 서비스를 띄우는 동안 다시 시작된 상황) 곧바로 SIGSTOP으로 멈춰 healthy가 되지
  // 못하게 한다(health는 starting, 실행 수는 1). 실행 수만 세면 완료로 끝나므로, 완료 전 health 재확인으로 6이어야 한다.
  const healthRegressed = replace(["--stop-timeout", "2"], dockerShim("health-regressed",
    `if [ "$1" = compose ] && [[ " $* " == *" up "* ]] && [ "\${@: -1}" = web ]; then
  "${realDocker}" "$@"; code=$?
  if [ "$code" = 0 ]; then "${realDocker}" restart -t 0 "${name("api")}" >/dev/null && "${realDocker}" kill --signal SIGSTOP "${name("api")}" >/dev/null; fi
  exit "$code"
fi`));
  await check("교체", "세 서비스를 띄운 직후 api가 다시 시작돼 healthy가 아니면 완료로 보지 않고 다시 멈춘다", () => {
    expect(healthRegressed.code === 6, `replace code=${healthRegressed.code}`);
    expect(/완료 확인 실패\. 정상\(healthy\)이 아닌 서비스: api\(starting\)\./.test(healthRegressed.text), "health 재확인 기록 없음");
    expect(/세 서비스의 종료를 확인했습니다/.test(healthRegressed.text) && !/완료\. 중지 시작부터/.test(healthRegressed.text), "완료로 끝났거나 종료 확인 기록 없음");
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 6, api health=starting(실행 수 1), 세 서비스 멈춤";
  });
  const afterHealthRegressed = replace();
  await check("교체", "원인 확인 뒤 다시 실행하면 이어서 시작(health 재확인 통과)", () => {
    expect(afterHealthRegressed.code === 0, `replace code=${afterHealthRegressed.code}`);
  });
  // 세 서비스를 멈춘 뒤 migration 이미지 ID 조회(image inspect -f)만 실패시킨다. 문서에 없는 코드로 끝나지 않고, migration을
  // 시작하지 않은 채 2로 멈춰야 한다. 중지 전의 같은 조회(대상 이미지 기록)는 실제 docker로 지나간다.
  const migrationPrepFail = replace(["--migrate"], dockerShim("migration-prep",
    `if [ -e "$stopped" ] && [ "$1" = image ] && [ "$2" = inspect ] && [ "$3" = -f ]; then echo "검사용 가짜 Docker 오류: 이미지 조회" >&2; exit 1; fi`));
  await check("교체", "세 서비스를 멈춘 뒤 migration 이미지를 확인하지 못하면 migration을 시작하지 않고 종료 코드 2", () => {
    expect(migrationPrepFail.code === 2, `replace code=${migrationPrepFail.code}`);
    expect(/migration 이미지\(\S+\)를 확인하지 못했습니다\. web·api·worker는 멈춘 상태이고 migration은 시작하지 않았습니다\./.test(migrationPrepFail.text), "준비 조회 실패 기록 없음");
    expect(![/migration 실행:/, /api 시작/].some((step) => step.test(migrationPrepFail.text)), "migration·새 실행을 시도함");
    const running = runningNow();
    expect(running.length === 0, `실행 중 ${running.join(",")}`);
    return "종료 코드 2, 세 서비스 멈춤, migration·새 실행 없음";
  });
  const afterMigrationPrepFail = replace(["--migrate"]);
  await check("교체", "Docker가 응답한 뒤 --migrate로 다시 실행하면 이어서 시작", () => {
    expect(afterMigrationPrepFail.code === 0 && /No migrations are pending/.test(afterMigrationPrepFail.text), `replace code=${afterMigrationPrepFail.code}`);
  });

  // ---------- 7. 종료 신호와 비밀값 ----------
  for (const service of ["web", "worker", "api"]) {
    await check("종료", `${service} SIGTERM 종료`, () => {
      try {
        const started = Date.now();
        mustDocker(["stop", "-t", "30", name(service)]);
        const seconds = (Date.now() - started) / 1000;
        const state = inspect(name(service)).State;
        expect(!state.Running && [0, 143].includes(state.ExitCode) && seconds < 30, `exit=${state.ExitCode} ${seconds.toFixed(1)}초`);
        return `exit=${state.ExitCode}, ${seconds.toFixed(1)}초`;
      } finally {
        // 중지·조회가 실패해도 로그는 모은다. 모으지 못하면 비밀값 검사가 그 로그 없이 통과하지 않는다.
        collect(`${service} 로그`, ["logs", name(service)]);
      }
    });
  }
  collect("db 로그", ["logs", name("db")]);
  // 합성 비밀값은 이미지를 만든 뒤에 생기므로 이 검사의 의미는 실행 로그·출력이다. 이미지 쪽은 맥락 미끼·Dockerfile 이름 검사가 맡는다.
  await check("비밀값·설정", "합성 비밀값이 실행 로그·출력(이미지 설정·기록 포함)에 없다", () => {
    for (const img of Object.values(image)) {
      collect(`${img} 설정`, ["image", "inspect", img]);
      collect(`${img} 기록`, ["history", "--no-trunc", "--format", "{{.CreatedBy}}", img]);
    }
    const verdict = secretVerdict(secrets, captured, collectFailed);
    expect(secrets.length === 5 && verdict.ok, verdict.detail);
    return verdict.detail;
  });

  // ---------- 8. 정리 확인 판정 ----------
  // 이 실행의 컨테이너·볼륨·망·검사 이미지가 아직 있는 시점이다. 조회 실패는 "남은 자원 없음"으로 답하는 가짜 docker에서 한 조회만
  // 실패시켜 넣는다(실제 데몬은 멈추지 않는다). 실제로 남은 자원은 실제 docker 조회로 본다. 맨 끝 정리 기록이 "조회 정상·남은 자원 없음" 사례다.
  const fakeDocker = (mode, rule) => {
    const dir = path.join(work, `docker-fake-${mode}`);
    mkdirSync(dir);
    writeFileSync(path.join(dir, "docker"), `#!/usr/bin/env bash\n${rule}\nexit 0\n`, { mode: 0o755 });
    return { PATH: `${dir}:${process.env.PATH}` };
  };
  const down = 'echo "Cannot connect to the Docker daemon (검사용 가짜)" >&2; exit 1';
  const absent = path.join(work, "docker-absent");
  mkdirSync(absent);
  await check("정리", "자원 조회가 실패하면(조회별·docker 없음·시간 초과) 정리 통과로 보지 않고 전체 종료 코드를 1로 한다", () => {
    const cases = [
      ["컨테이너(이름)", { env: fakeDocker("name", `if [ "$1" = ps ] && [[ " $* " == *" name=^"* ]]; then ${down}; fi`) }, ["컨테이너(이름)"]],
      ["컨테이너(라벨)", { env: fakeDocker("label", `if [ "$1" = ps ] && [[ " $* " == *" label="* ]]; then ${down}; fi`) }, ["컨테이너(라벨)"]],
      ["볼륨", { env: fakeDocker("volume", `if [ "$1" = volume ]; then ${down}; fi`) }, ["볼륨"]],
      ["망", { env: fakeDocker("network", `if [ "$1" = network ]; then ${down}; fi`) }, ["망"]],
      ["이미지", { env: fakeDocker("image", `if [ "$1" = image ]; then ${down}; fi`) }, ["이미지"]],
      ["docker 없음", { env: { PATH: absent } }, LEFTOVER_QUERIES.map(([scope]) => scope)],
      ["시간 초과", { env: fakeDocker("slow", "exec sleep 5"), timeoutMs: 300 }, LEFTOVER_QUERIES.map(([scope]) => scope)],
    ];
    const wrong = [];
    for (const [label, options, scopes] of cases) {
      const state = { ...inspectLeftovers(options), files: [] };
      const verdict = cleanupVerdict(state);
      const failedScopes = state.failedQueries.map((query) => query.scope).join(",");
      const ok = !verdict.ok && state.found.length === 0 && failedScopes === scopes.join(",") && verdict.detail.includes(PROJECT)
        && (label !== "시간 초과" || state.failedQueries.every((query) => query.timedOut))
        && exitCodeFor([{ status: "pass" }, { status: verdict.ok ? "pass" : "fail" }]) === 1;
      if (!ok) wrong.push(`${label}: 통과=${verdict.ok} 실패 조회=${failedScopes}`);
    }
    const quiet = cleanupVerdict({ ...inspectLeftovers({ env: fakeDocker("empty", "") }), files: [] });
    expect(quiet.ok && exitCodeFor([{ status: "pass" }]) === 0, "조회 정상·자원 없음이 통과가 아님");
    expect(wrong.length === 0, wrong.join("; "));
    return `실패 사례 ${cases.length}개 모두 정리 실패·종료 코드 1, 조회 정상·자원 없음은 통과`;
  });
  // --keep이면 검사 이미지는 남은 자원으로 세지 않으므로 이미지 항목은 지우는 실행에서만 기대한다.
  await check("정리", "실제로 남은 컨테이너·볼륨·망·검사 이미지를 이름과 함께 정리 실패로 기록한다", () => {
    const state = { ...inspectLeftovers(), files: [] };
    const verdict = cleanupVerdict(state);
    const expected = [`container ${name("api")}`, `volume ${PROJECT}_db-data`, `network ${PROJECT}_db`, ...(keepImages ? [] : [`image ${image.web}`])];
    const missing = expected.filter((item) => !state.found.includes(item) || !verdict.detail.includes(item));
    expect(state.failedQueries.length === 0, `조회 실패 ${state.failedQueries.map((query) => query.scope).join(",")}`);
    expect(!verdict.ok && missing.length === 0, `빠진 항목 ${missing.join(", ")}`);
    return `남은 자원 ${state.found.length}개 감지${keepImages ? "(--keep: 검사 이미지 제외)" : ""}`;
  });
  // 시작 전 확인(main 맨 앞)이 쓰는 조회도 같은 방식으로 실패를 가르는지 본다. 이 시점에는 이 실행의 자원이 있으므로 가짜 docker로만 본다.
  await check("정리", "시작 전 다른 검사 자원 확인도 조회 실패를 자원 없음으로 보지 않는다", () => {
    const wrong = [];
    for (const [label, env, scopes] of [
      ["볼륨", fakeDocker("before-volume", `if [ "$1" = volume ]; then ${down}; fi`), ["볼륨"]],
      ["docker 없음", { PATH: absent }, OTHER_CHECK_QUERIES.map(([scope]) => scope)],
    ]) {
      const failedScopes = runQueries(OTHER_CHECK_QUERIES, { env }).failedQueries.map((query) => query.scope).join(",");
      if (failedScopes !== scopes.join(",")) wrong.push(`${label}: 실패 조회=${failedScopes}`);
    }
    expect(runQueries(OTHER_CHECK_QUERIES, { env: fakeDocker("before-empty", "") }).failedQueries.length === 0, "조회 정상인데 실패로 봄");
    expect(wrong.length === 0, wrong.join("; "));
    return "조회 실패·docker 없음은 실패로 가르고, 조회 정상은 통과";
  });
  await check("비밀값·설정", "로그·이미지 기록을 모으지 못하면 비밀값 검사를 통과로 보지 않는다", () => {
    const sample = [randomBytes(32).toString("hex")];
    const failed = secretVerdict(sample, ["정상 출력"], ["web 로그 code=1"]);
    const leaked = secretVerdict(sample, [`출력 ${sample[0].toUpperCase()}`], []);
    const clean = secretVerdict(sample, ["정상 출력"], []);
    expect(!failed.ok && !leaked.ok && clean.ok, `수집 실패 ${failed.ok}, 노출 ${leaked.ok}, 정상 ${clean.ok}`);
    return "수집 실패·비밀값 노출은 실패, 정상 출력은 통과";
  });
}

// 조회 묶음 실행. 조회마다 종료 코드 0일 때만 성공으로 본다. 조회 실패·docker 없음·시간 초과를 "자원 없음"으로 읽지 않는다.
function runQueries(queries, { env, timeoutMs = 60_000 } = {}) {
  const found = new Set();
  const failedQueries = [];
  for (const [scope, queryArgs] of queries) {
    const out = docker(queryArgs, { capture: false, env, timeoutMs });
    if (out.code !== 0) {
      failedQueries.push({ scope, code: out.code, timedOut: out.timedOut });
      continue;
    }
    for (const line of out.stdout.split("\n").filter(Boolean)) found.add(line);
  }
  return { found: [...found], failedQueries };
}
const describeFailure = (query) => `${query.scope} ${query.timedOut ? "시간 초과" : query.code === null ? "실행하지 못함" : `code=${query.code}`}`;
// 시작 전 확인: 다른 검사(다른 작업 폴더 포함)가 남긴 catchu-check-* 자원.
const OTHER_CHECK_QUERIES = [
  ["컨테이너", ["ps", "-a", "--filter", "name=^catchu-check-", "--format", "container {{.Names}}"]],
  ["볼륨", ["volume", "ls", "--filter", "name=catchu-check-", "--format", "volume {{.Name}}"]],
  ["망", ["network", "ls", "--filter", "name=catchu-check-", "--format", "network {{.Name}}"]],
];
// 이 실행이 만든 자원. 검사 이미지는 이 실행의 태그로 찾는다(맥락 검사 이미지 포함).
const LABEL_FILTER = `label=com.docker.compose.project=${PROJECT}`;
const IMAGE_FILTER = `reference=catchu-check-*:${tag}*`;
const LEFTOVER_QUERIES = [
  ["컨테이너(이름)", ["ps", "-a", "--filter", `name=^${PROJECT}-`, "--format", "container {{.Names}}"]],
  ["컨테이너(라벨)", ["ps", "-a", "--filter", LABEL_FILTER, "--format", "container {{.Names}}"]],
  ["볼륨", ["volume", "ls", "--filter", LABEL_FILTER, "--format", "volume {{.Name}}"]],
  ["망", ["network", "ls", "--filter", LABEL_FILTER, "--format", "network {{.Name}}"]],
  ["이미지", ["image", "ls", "--filter", IMAGE_FILTER, "--format", "image {{.Repository}}:{{.Tag}}"]],
];
// --keep으로 일부러 남긴 검사 이미지는 남은 자원으로 보지 않는다(맥락 검사 이미지처럼 남길 이유가 없는 이미지는 그대로 센다).
function inspectLeftovers(options = {}) {
  const state = runQueries(LEFTOVER_QUERIES, options);
  const kept = new Set(keepImages ? Object.values(image).map((ref) => `image ${ref}`) : []);
  return { ...state, found: state.found.filter((item) => !kept.has(item)) };
}
// 정리 판정. 조회가 모두 성공하고 남은 자원·미끼 파일이 없을 때만 통과다. 프로젝트 이름과 확인 명령을 남기고, Docker 오류 원문은 넣지 않는다.
function cleanupVerdict({ found, failedQueries, files }) {
  const ok = found.length === 0 && files.length === 0 && failedQueries.length === 0;
  if (ok) return { ok, detail: `프로젝트 ${PROJECT}, 조회 ${LEFTOVER_QUERIES.length}건 모두 성공` };
  const parts = [`프로젝트 ${PROJECT}`];
  if (found.length + files.length > 0) parts.push(`남은 자원: ${[...found, ...files].join(", ")}`);
  if (failedQueries.length > 0) {
    parts.push(`확인하지 못한 조회(자원이 남았을 수 있음): ${failedQueries.map(describeFailure).join(", ")}`);
  }
  parts.push(`직접 확인: docker ps -a --filter name=^${PROJECT}- 와 docker ps -a·volume ls·network ls --filter ${LABEL_FILTER}, docker image ls --filter '${IMAGE_FILTER}'`);
  return { ok, detail: parts.join(". ") };
}
// 비밀값 노출 판정. 출력을 모으지 못한 곳이 있으면 빈 출력으로 통과시키지 않는다.
function secretVerdict(secretList, texts, failures) {
  if (failures.length > 0) return { ok: false, detail: `출력을 모으지 못한 곳 ${failures.length}개: ${failures.slice(0, 5).join(", ")}` };
  const haystack = texts.join("\n").toLowerCase();
  const found = secretList.filter((secret) => haystack.includes(secret.toLowerCase()));
  return { ok: found.length === 0, detail: `비밀값 ${secretList.length}개 × 출력 ${texts.length}건${found.length ? `, 발견 ${found.length}개` : ""}` };
}
const exitCodeFor = (list) => (list.some((result) => result.status === "fail") ? 1 : 0);

let cleanupState = null;
function cleanupAll() {
  if (cleanupState) return cleanupState;
  for (const cleanup of cleanups.reverse()) {
    try { cleanup(); } catch { /* 남은 자원은 아래에서 따로 확인한다 */ }
  }
  // 임시 폴더에는 합성 비밀값·TLS 키가 있어 정리 결과와 관계없이 지운다. 남은 자원은 프로젝트 이름(라벨·이름 접두사)만으로 확인·정리할 수 있다.
  rmSync(work, { recursive: true, force: true });
  const files = DECOYS.filter((decoy) => existsSync(path.join(ROOT, decoy))).map((decoy) => `file ${decoy}`);
  cleanupState = { ...inspectLeftovers(), files };
  return cleanupState;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    console.error(`[check-images] ${signal}: 만든 컨테이너·망·볼륨·검사 이미지(--keep 제외)·임시 폴더·미끼 파일을 지우고 끝냅니다`);
    const verdict = cleanupVerdict(cleanupAll());
    if (!verdict.ok) console.error(`[check-images] 정리를 끝내지 못했거나 확인하지 못했습니다. ${verdict.detail}`);
    process.exit(130);
  });
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  record("준비", "검사 진행", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
} finally {
  const cleanup = cleanupAll();
  const verdict = cleanupVerdict(cleanup);
  record("정리", "이 검사가 만든 컨테이너·볼륨·망·검사 이미지(--keep 제외)·미끼 파일이 남지 않았다(확인하지 못해도 실패)", verdict.ok,
    verdict.ok ? verdict.detail : `${verdict.detail}. 확인 뒤 직접 지웁니다`);
  const failed = results.filter((result) => result.status === "fail");
  exitCode = exitCodeFor(results);
  const images = Object.fromEntries(Object.entries(image).map(([key, ref]) => [key, { ref, id: imageInfo[key] ?? "빌드 안 됨", kept: keepImages }]));
  if (reportPath) {
    const cleanupReport = { project: PROJECT, found: [...cleanup.found, ...cleanup.files], failedQueries: cleanup.failedQueries };
    writeFileSync(reportPath, `${JSON.stringify({ revision, project: PROJECT, images, cleanup: cleanupReport, results }, null, 2)}\n`);
  }
  console.log(`[check-images] ${results.length - failed.length}/${results.length} 통과${failed.length ? `, 실패 ${failed.length}` : ""}`);
}
process.exit(exitCode);
