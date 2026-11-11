# U10 브라우저 검사 환경 재생성 기록

작성일: 2026-11-10. 11월 6일 성공한 실행 구성을 보존한 기록이다. 이번 중단 정리에서는 아래 명령을 실행하지 않았다. 제품 코드·인증 설정·AI-DLC 설정을 바꾸는 절차가 아니다.

## 적용 조건과 확인 순서

- 작업 폴더는 기존 CatchU-u10, PowerShell 기본 사용자 권한이다. Docker 및 AI-DLC는 명령마다 `require_escalated`를 사용하고 영구 허용 규칙이나 Windows 관리자 실행을 추가하지 않는다.
- 재개 요청 전에는 실행하지 않는다. R-01 문서 경로 재검토만 할 때는 이 환경이 필요하지 않다.
- 이미지 `catchu-u7-api:20261029-schema-r2`의 고정 ID는 아래 명령과 같다. 기존 확인 결과 이미지 기본 사용자는 `1000:1000`, Node는 `24.21.0`이다. 호스트 Node를 대신 쓰지 않는다. 생성 전 이미지 사용자·기존 U10 네트워크·DB·Valkey와 127.0.0.1의 3311/3310 포트, 동일 이름의 컨테이너 부재를 제한 조회한다.
- 2026-11-10 보존 확인 시 DB와 Valkey는 exited였다. 필요하면 기존 승인 범위에서 이름·이미지·마운트 일치를 먼저 확인하고 기존 두 컨테이너만 start한다. 삭제·재생성·초기화하지 않는다.
- API는 기존 `catchu_u10_dev`를 사용한다. 영향 검사 DB는 `catchu_u10_test`이며 서로 바꾸지 않는다. DB 마이그레이션·synchronize·초기화를 실행하지 않는다.
- API부터 한 번 생성한다. 출력된 새 컨테이너 ID를 기록하고 최대 300초 안에 현재 StartedAt 이후 로그의 `U10_JD_BROWSER_API_READY`와 `/health` 200, 본문의 status=ok를 확인한다. 과거 로그의 준비 표식을 사용하지 않는다. API가 준비되지 않으면 web을 생성하지 않는다.
- 성공했던 최신 API 재시작은 209초에 READY 및 health 200, web은 38초에 준비 및 63초에 login 200이었다. 이는 과거 관측이며 다음 기동의 결과를 보장하지 않는다.
- web을 한 번 생성해 새 ID를 기록한다. 복사·설정 보완 표식과 Next 준비 로그뿐 아니라 `http://127.0.0.1:3310/login`의 실제 200 응답을 확인한다.
- HTTP 요청은 PowerShell `Invoke-WebRequest -ErrorAction Stop`으로 처리한다. `-SkipHttpErrorCheck`를 사용하면 상태 코드가 200인지 별도로 검사하고 실패를 숨기지 않는다.
- 실패하면 같은 컨테이너의 제한된 상태·비밀값을 제외한 로그·내부/호스트 HTTP를 확인한다. 설정 변경·반복 재생성 없이 원인을 보고하고 해당 실행에서 생성한 ID만 정리한다.

## API 생성 명령

11월 6일 성공한 명령의 구성이다. DB 사용자·암호는 기존 DB 컨테이너에서 선택 조회해 메모리 변수로 전달하며 출력하지 않는다. **전달한 DB 접속값은 생성된 API 컨테이너의 Config.Env에 보관된다.** 단순히 메모리에만 존재하는 것으로 설명하지 않는다. JWT와 grant 서명용 값은 bootstrap에서 프로세스별 임시 생성되므로 재기동 뒤 새 로그인·grant 발급이 필요할 수 있다.

```powershell
$u10Image = 'sha256:ca31ea5bd429e78cbd4f02206bbdf4703ff5fb400957bf61a9cb6eb4e000348f'
$u10Root = 'C:\Users\aica_\OneDrive\Desktop\github\CatchU-u10'
$u10PgLines = @(docker inspect --format '{{range .Config.Env}}{{if or (eq (index (split . "=") 0) "POSTGRES_USER") (eq (index (split . "=") 0) "POSTGRES_PASSWORD")}}{{println .}}{{end}}{{end}}' catchu-u10-db-20261104)
if ($LASTEXITCODE -ne 0) { throw 'U10 DB 접속 설정 조회 실패' }
$u10PgValues = @{}
foreach ($u10Line in $u10PgLines) { $u10Pair = $u10Line -split '=', 2; if ($u10Pair.Count -eq 2) { $u10PgValues[$u10Pair[0]] = $u10Pair[1] } }
if ([string]::IsNullOrEmpty($u10PgValues['POSTGRES_USER']) -or [string]::IsNullOrEmpty($u10PgValues['POSTGRES_PASSWORD'])) { throw 'U10 DB 접속 설정 누락' }
$u10OldDbUser = [Environment]::GetEnvironmentVariable('DB_USER', 'Process')
$u10OldDbPassword = [Environment]::GetEnvironmentVariable('DB_PASSWORD', 'Process')
$u10ApiBootstrap = 'if(process.versions.node!=="24.21.0")throw new Error("NODE_VERSION_MISMATCH"); require("reflect-metadata"); const {randomBytes}=require("node:crypto"); process.env.AUTH_JWT_SECRET=randomBytes(32).toString("hex"); process.env.LINK_GRANT_SECRET=randomBytes(32).toString("hex"); require("ts-node/register"); const {NestFactory}=require("@nestjs/core"); const {AppModule}=require("./src/app.module.ts"); const {configureApp}=require("./src/app.setup.ts"); (async()=>{const app=await NestFactory.create(AppModule,{abortOnError:false}); try{await configureApp(app); app.enableShutdownHooks(); await app.listen(3001,"0.0.0.0"); console.log("U10_JD_BROWSER_API_READY");}catch(error){await app.close(); throw error;}})().catch(error=>{console.error("U10_JD_BROWSER_API_START_FAILED",error.name); process.exitCode=1;});'
$u10ApiArgs = @('run', '--detach', '--name', 'catchu-u10-api-browser-20261106', '--pull=never', '--restart=no', '--network', 'catchu-u10-test-20261104', '-p', '127.0.0.1:3311:3001', '--mount', "type=bind,source=$u10Root\api,target=/workspace/api,readonly", '--workdir', '/workspace/api')
$u10ApiEnv = @('NODE_ENV=development', 'PORT=3001', 'BIND_HOST=0.0.0.0', 'DB_HOST=catchu-u10-db-20261104', 'DB_PORT=5432', 'DB_NAME=catchu_u10_dev', 'DB_USER', 'DB_PASSWORD', 'PGSSLMODE=disable', 'DEV_LOGIN_ENABLED=true', 'AUTH_ACCESS_TOKEN_TTL_SECONDS=900', 'AUTH_WEB_ORIGIN=http://127.0.0.1:3310', 'CORS_ALLOWED_ORIGINS=http://127.0.0.1:3310', 'SHARE_LINK_WEB_BASE_URL=http://127.0.0.1:3310', 'GOOGLE_LOGIN_ENABLED=false', 'GITHUB_CONNECTION_ENABLED=false', 'WORKER_CONTEXT_ENABLED=false', 'DEV_ANALYSIS_INJECTION_ENABLED=false', 'CATCHU_GENERATION_API_KEY=', 'CATCHU_EMBEDDING_API_KEY=', 'CATCHU_QUEUE_REDIS_URL=', 'FILE_STORAGE_DRIVER=', 'FILE_STORAGE_LOCAL_ROOT=')
foreach ($u10Setting in $u10ApiEnv) { $u10ApiArgs += @('--env', $u10Setting) }
$u10ApiArgs += @('--entrypoint', 'node', $u10Image, '-e', $u10ApiBootstrap)
try {
    [Environment]::SetEnvironmentVariable('DB_USER', $u10PgValues['POSTGRES_USER'], 'Process')
    [Environment]::SetEnvironmentVariable('DB_PASSWORD', $u10PgValues['POSTGRES_PASSWORD'], 'Process')
    docker @u10ApiArgs
    if ($LASTEXITCODE -ne 0) { throw 'U10 API 컨테이너 기동 실패' }
} finally {
    [Environment]::SetEnvironmentVariable('DB_USER', $u10OldDbUser, 'Process')
    [Environment]::SetEnvironmentVariable('DB_PASSWORD', $u10OldDbPassword, 'Process')
    $u10PgValues.Clear(); $u10PgLines = $null; $u10Line = $null; $u10Pair = $null; $u10OldDbUser = $null; $u10OldDbPassword = $null
}
```

실제 AppModule·configureApp을 사용하되 제품 main.ts의 분석 시한 스케줄러를 시작하지 않는 bootstrap이다. 큐·외부 AI 키·분석 주입·Google/GitHub 연동을 끈 범위다. 이 환경의 통과를 실제 큐·스케줄러·외부 AI 통합 통과로 기록하지 않는다.

## web 생성 명령

기존 로컬 파일 `.aidlc-engine/u10-web-runtime-start-431e8a3a.ps1`의 내용을 아래에 보존한다. 원본 web은 읽기 전용, 임시 실행 사본만 tmpfs에 쓰며 node_modules는 별도 읽기 전용이다. `process.execArgv=[]`를 유지한다. 원본 .next·next-env.d.ts·원본 권한·마운트 루트 권한은 바꾸지 않는다.

```powershell
$u10Image = 'sha256:ca31ea5bd429e78cbd4f02206bbdf4703ff5fb400957bf61a9cb6eb4e000348f'
$u10WebRoot = 'C:\Users\aica_\OneDrive\Desktop\github\CatchU-u10\web'
$u10WebBootstrap = 'if(process.versions.node!=="24.21.0")throw new Error("NODE_VERSION_MISMATCH");
process.execArgv=[];
if(process.getuid()!==1000)throw new Error("WEB_UID_MISMATCH");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const source="/source-web",target="/workspace/web";
const excluded=name=>[".next","node_modules",".git","next-env.d.ts"].includes(name)||name.startsWith(".env");
const roots=fs.readdirSync(source,{withFileTypes:true}).filter(e=>!excluded(e.name)).map(e=>e.name).sort();
const pairs=[];
function inventory(src,rel){
 const s=fs.lstatSync(src);
 if(s.isSymbolicLink())throw new Error("COPY_SOURCE_SYMLINK");
 if(s.isDirectory()){for(const e of fs.readdirSync(src,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(!excluded(e.name))inventory(path.join(src,e.name),path.join(rel,e.name));}}
 else if(s.isFile())pairs.push(rel); else throw new Error("COPY_SOURCE_TYPE");
}
for(const name of roots)inventory(path.join(source,name),name);
fs.accessSync(target,fs.constants.W_OK|fs.constants.X_OK);
for(const name of roots)fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true,filter:p=>!excluded(path.basename(p))});
const config=path.join(target,"tsconfig.json");
try{fs.accessSync(config,fs.constants.W_OK);}catch{const st=fs.lstatSync(config);if(!st.isFile()||st.isSymbolicLink())throw new Error("TEMP_CONFIG_TYPE");fs.chmodSync(config,(st.mode&511)|128);fs.accessSync(config,fs.constants.W_OK);}
const digest=crypto.createHash("sha256");
for(const rel of pairs.sort()){const a=fs.readFileSync(path.join(source,rel)),b=fs.readFileSync(path.join(target,rel));if(!a.equals(b))throw new Error("COPY_CONTENT_MISMATCH");digest.update(rel+"\0"+crypto.createHash("sha256").update(a).digest("hex")+"\n");}
const probe=path.join(target,".u10-write-probe-"+crypto.randomBytes(8).toString("hex"));
fs.writeFileSync(probe,"ok",{flag:"wx"});if(fs.readFileSync(probe,"utf8")!=="ok")throw new Error("TEMP_WRITE_PROBE_FAILED");fs.unlinkSync(probe);
console.log("U10_WEB_COPY_READY "+JSON.stringify({files:pairs.length,sha256:digest.digest("hex"),writable:true,uid:process.getuid()}));
const runtimeConfigPath=path.join(target,"next.config.ts");
const runtimeConfigStat=fs.lstatSync(runtimeConfigPath);
if(!runtimeConfigStat.isFile()||runtimeConfigStat.isSymbolicLink())throw new Error("TEMP_NEXT_CONFIG_TYPE");
const runtimeConfigBefore=fs.readFileSync(runtimeConfigPath,"utf8");
const runtimeConfigAnchor="const nextConfig: NextConfig = {";
if(runtimeConfigBefore.split(runtimeConfigAnchor).length!==2||/\ballowedDevOrigins\s*:/.test(runtimeConfigBefore))throw new Error("TEMP_NEXT_CONFIG_ANCHOR");
const runtimeConfigNewline=runtimeConfigBefore.includes("\r\n")?"\r\n":"\n";
const runtimeConfigAddition="  allowedDevOrigins: [''127.0.0.1''],";
const runtimeConfigAfter=runtimeConfigBefore.replace(runtimeConfigAnchor,runtimeConfigAnchor+runtimeConfigNewline+runtimeConfigAddition);
try{fs.accessSync(runtimeConfigPath,fs.constants.W_OK);}catch{fs.chmodSync(runtimeConfigPath,(runtimeConfigStat.mode&511)|128);fs.accessSync(runtimeConfigPath,fs.constants.W_OK);}
fs.writeFileSync(runtimeConfigPath,runtimeConfigAfter,"utf8");
if(fs.readFileSync(runtimeConfigPath,"utf8")!==runtimeConfigAfter)throw new Error("TEMP_NEXT_CONFIG_WRITE");
for(const rel of pairs){const a=fs.readFileSync(path.join(source,rel)),b=fs.readFileSync(path.join(target,rel));if(rel==="next.config.ts"){if(a.toString("utf8")!==runtimeConfigBefore||b.toString("utf8")!==runtimeConfigAfter)throw new Error("TEMP_NEXT_CONFIG_PARITY");}else if(!a.equals(b))throw new Error("TEMP_OTHER_FILE_MISMATCH");}
console.log("U10_WEB_RUNTIME_CONFIG_APPLIED "+JSON.stringify({file:"next.config.ts",added:runtimeConfigAddition.trim(),sourceSha256:crypto.createHash("sha256").update(runtimeConfigBefore).digest("hex"),runtimeSha256:crypto.createHash("sha256").update(runtimeConfigAfter).digest("hex"),otherFilesUnchanged:true}));
process.argv=["node","next","dev","--hostname","0.0.0.0","--port","3000"];
require("./node_modules/next/dist/bin/next");'
$u10WebArgs = @('run', '--detach', '--name', 'catchu-u10-web-browser-20261106', '--pull=never', '--restart=no', '--network', 'catchu-u10-test-20261104', '-p', '127.0.0.1:3310:3000', '--mount', "type=bind,source=$u10WebRoot,target=/source-web,readonly", '--mount', 'type=tmpfs,destination=/workspace/web,tmpfs-mode=1777', '--mount', "type=bind,source=$u10WebRoot\node_modules,target=/workspace/web/node_modules,readonly", '--workdir', '/workspace/web', '--env', 'NODE_ENV=development', '--env', 'NEXT_TELEMETRY_DISABLED=1', '--env', 'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3311', '--env', 'NEXT_PUBLIC_DEV_LOGIN_ENABLED=true', '--env', 'NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true', '--entrypoint', 'node', $u10Image, '-e', $u10WebBootstrap)
docker @u10WebArgs
if ($LASTEXITCODE -ne 0) { throw 'U10 web 컨테이너 기동 실패' }
```

복사·해시 확인 뒤 임시 next.config.ts에만 `allowedDevOrigins: ['127.0.0.1']` 한 줄을 넣는다. 이 차이를 제외한 원본 일치를 검사하고 시작한다. 11월 6일 최종 사본은 321개 파일, 집계 SHA256 `836f507a97601b8d838afb19fa243af4ebc03ab95544539f8564c38cdce8522b`였다. 이후 원본이 바뀌면 사본을 갱신하고 새 일치 결과를 기록한다. 이 과거 해시를 새로운 소스에 강제하지 않는다.

수동 Chrome에서 HMR 101·폰트 200·auth/refresh 401 및 개발용 로그인 폼 표시를 확인해 초기 로그인 대기는 해소됐다. 원본 인증 설정을 수정하지 않았다. URL 확인에 실패했던 native Chrome 자동 조작 경로는 반복하지 않는다.

## 사용 후 정리

새로 생성한 API·web의 **그 실행 ID**를 제한 inspect로 확인한 뒤 `docker stop --timeout 30 <확인한 ID>`, `docker rm <확인한 ID>`를 각각 실행한다. 아래 중단 기록의 과거 ID를 새 실행의 ID로 재사용하지 않는다. `-v`, volume prune, network rm, DB 초기화는 사용하지 않는다. ID 필터 조회로 삭제를 확인하고 기존 DB·Valkey·네트워크·볼륨 보존을 별도로 확인한다.

남길 자원:
- DB: `catchu-u10-db-20261104`
- Valkey: `catchu-u10-valkey-20261104`
- 네트워크: `catchu-u10-test-20261104`
- DB 볼륨: `e457e09245a1f505ae86b2cf89c49e28aac65cb3825aa965a3eddf915f847ce6`
