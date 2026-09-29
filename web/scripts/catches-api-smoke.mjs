import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { createAssetsStore } from "../src/features/assets/assets-store.ts";
import { readApiResponse } from "../src/lib/api-response.ts";

// 실행할 API는 B의 API PR을 포함해야 한다. A/E·worker 입력은 일회용 합성 자료다.
const apiRoot = path.resolve(process.env.CATCH_API_ROOT ?? "../api");
const require = createRequire(path.join(apiRoot, "package.json"));
require("reflect-metadata");
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require(path.join(apiRoot, "test/support/catch-db-fixture.cjs"));
const { Global, Module } = require("@nestjs/common");
const { APP_INTERCEPTOR, NestFactory } = require("@nestjs/core");
const { DataSource } = require("typeorm");
const { SignJWT } = require("jose");
const { AuthModule } = require(path.join(apiRoot, "dist/auth/auth.module"));
const { AccessTokenService } = require(path.join(apiRoot, "dist/auth/access-token.service"));
const { ErrorsModule } = require(path.join(apiRoot, "dist/common/errors/errors.module"));
const { NoStoreInterceptor } = require(path.join(apiRoot, "dist/common/http/no-store.interceptor"));
const { CatchesModule } = require(path.join(apiRoot, "dist/catches/catches.module"));
const { configureApp } = require(path.join(apiRoot, "dist/app.setup"));
const { registerCandidates } = require(path.join(apiRoot, "dist/catches/registration-service"));
process.env.AUTH_JWT_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = "600";
process.env.NODE_ENV = "test";
delete process.env.DEV_LOGIN_ENABLED;
let fixture;
let app;
try {
  fixture = await createCatchDbFixture(readCatchTestDatabase());
  const db = fixture.dataSource;
  class FixtureDatabaseModule {}
  Global()(FixtureDatabaseModule);
  Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
  class TestModule {}
  Module({ imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, CatchesModule],
    providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  await configureApp(app);
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl();
  const owner = randomUUID();
  async function seed(ownerId, repositoryId, count) {
    const candidates = Array.from({ length: count }, () => candidate("candidate-" + randomUUID(), "work-" + randomUUID()));
    const input = await fixture.receipt({ ownerId, candidates });
    await db.query("UPDATE analysis_request SET repository_id = $1 WHERE request_id = $2", [repositoryId, input.requestId]);
    await db.query(`INSERT INTO repository_protection
      (protection_id, owner_id, repository_id, confirmed_source_state, observation_provenance, observed_at, applied_restriction)
      VALUES ($1,$2,$3,$4,$5,$6,'NONE')`,
      [randomUUID(), ownerId, repositoryId, { state: "PUBLIC", synthetic: true }, { kind: "SYNTHETIC_FIXTURE" }, new Date()]);
    return db.transaction((manager) => registerCandidates(manager, input));
  }
  const own = await seed(owner, "synthetic-repo-a", 21);
  await seed(owner, "synthetic-repo-b", 1);
  const foreign = await seed(randomUUID(), "synthetic-repo-a", 1);
  const token = (await app.get(AccessTokenService).issue(owner)).accessToken;
  let authorization = "Bearer " + token;
  let putCount = 0;
  const transport = async (url, options) => {
    if (options.method === "PUT") ++putCount;
    return readApiResponse(fetch(origin + "/v1" + url, {
      method: options.method, cache: options.cache, signal: options.signal ?? AbortSignal.timeout(5000),
      headers: { ...(authorization === undefined ? {} : { Authorization: authorization }), "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }));
  };
  const api = createCatchApi(transport);
  const store = createAssetsStore(api);
  await store.refresh("synthetic-repo-a");
  assert.equal(store.getSnapshot().listState, "ready");
  assert.equal(store.getSnapshot().items.length, 20);
  assert.ok(store.getSnapshot().nextCursor);
  await store.loadMore();
  assert.equal(store.getSnapshot().items.length, 21);
  assert.equal(store.getSnapshot().nextCursor, null);
  assert.ok(store.getSnapshot().items.every((item) => item.repositoryId === "synthetic-repo-a"));
  await store.selectRepository("synthetic-repo-b");
  assert.equal(store.getSnapshot().items.length, 1);
  await store.selectRepository("synthetic-empty");
  assert.equal(store.getSnapshot().listState, "ready");
  assert.equal(store.getSnapshot().items.length, 0);
  await store.openDetail(own[0].catchId);
  assert.equal(store.getSnapshot().detail.catchId, own[0].catchId);
  assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
  await store.openDetail(foreign[0].catchId);
  assert.equal(store.getSnapshot().detailError.code, "RESOURCE_UNAVAILABLE");
  assert.equal(store.getSnapshot().detail, undefined);
  const unauth = createCatchApi(async (url) => readApiResponse(fetch(origin + "/v1" + url)));
  assert.equal((await unauth.detail(own[0].catchId)).code, "AUTH_REQUIRED");
  await store.refresh("synthetic-repo-a");
  await store.openDetail(own[0].catchId);
  const publicStore = app.get(require(path.join(apiRoot, "dist/catches/public-catch-store")).PublicCatchStore);
  assert.equal((await publicStore.list(owner, {})).catches.length, 0);
  await store.update({ kind: "confirmation" });
  assert.equal(store.getSnapshot().detail.confirmation.workFactsConfirmed, true);
  assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
  assert.equal((await publicStore.list(owner, {})).catches.length, 0);
  await store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(store.getSnapshot().detail.visibility, "PUBLIC");
  assert.equal((await publicStore.list(owner, {})).catches[0].catchId, own[0].catchId);
  await store.update({ kind: "mismatch", mismatch: true });
  assert.equal(store.getSnapshot().detail.mismatch, true);
  assert.equal(store.getSnapshot().detail.visibility, "PUBLIC");
  await store.update({ kind: "mismatch", mismatch: false });
  assert.equal(store.getSnapshot().detail.mismatch, false);
  await store.update({ kind: "visibility", visibility: "PRIVATE" });
  assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
  assert.equal((await publicStore.list(owner, {})).catches.length, 0);
  // #176의 실제 JWT 거절을 B가 빈 목록·저장 성공으로 바꾸지 않는지 확인한다.
  // 토큰은 이 검사 프로세스의 메모리에만 두며 A 회원 클라이언트·OAuth 연결을 대신하지 않는다.
  const now = Math.floor(Date.now() / 1000);
  const expiredToken = await new SignJWT({}).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(owner).setIssuer("catchu-api").setAudience("catchu-member-api")
    .setIssuedAt(now - 120).setExpirationTime(now - 60)
    .sign(Buffer.from(process.env.AUTH_JWT_SECRET, "hex"));
  const tokenParts = token.split(".");
  const invalidSignature = Buffer.from(tokenParts[2], "base64url");
  invalidSignature[0] ^= 1;
  const tamperedToken = [...tokenParts.slice(0, 2), invalidSignature.toString("base64url")].join(".");
  const authCases = [
    { name: "미인증", authorization: undefined, code: "AUTH_REQUIRED" },
    { name: "만료", authorization: "Bearer " + expiredToken, code: "AUTH_INVALID" },
    { name: "서명 변조", authorization: "Bearer " + tamperedToken, code: "AUTH_INVALID" },
    { name: "잘못된 헤더", authorization: "Basic synthetic-invalid", code: "AUTH_INVALID" },
  ];
  function assertAuthError(error, expectedCode) {
    assert.equal(error?.kind, "api-error");
    assert.equal(error.status, 401);
    assert.equal(error.code, expectedCode);
  }
  for (const authCase of authCases) {
    authorization = authCase.authorization;
    const denied = createAssetsStore(api);
    await denied.refresh("synthetic-repo-a");
    assert.equal(denied.getSnapshot().listState, "error", authCase.name);
    assertAuthError(denied.getSnapshot().listError, authCase.code);
    assert.equal(denied.getSnapshot().nextCursor, null);
    await denied.openDetail(own[0].catchId);
    assert.equal(denied.getSnapshot().detailState, "error", authCase.name);
    assertAuthError(denied.getSnapshot().detailError, authCase.code);
    assert.equal(denied.getSnapshot().detail, undefined);
    denied.dispose();
  }
  const changes = [
    { kind: "confirmation" }, { kind: "mismatch", mismatch: true },
    { kind: "visibility", visibility: "PUBLIC" }, { kind: "visibility", visibility: "PRIVATE" },
  ];
  let authCatchIndex = 1;
  for (const authCase of authCases.slice(0, 3)) {
    for (const change of changes) {
      authorization = "Bearer " + token;
      const catchId = own[authCatchIndex++].catchId;
      // 공개·숨김은 선행 확인과 실제 초기 공개 상태를 준비해, 인증 거절 때문에 DB가 그대로임을 확인한다.
      if (change.kind === "visibility") {
        assert.equal((await api.update(catchId, { kind: "confirmation" })).kind, "success");
        if (change.visibility === "PRIVATE") {
          assert.equal((await api.update(catchId, { kind: "visibility", visibility: "PUBLIC" })).kind, "success");
        }
      }
      const authStore = createAssetsStore(api);
      await authStore.refresh("synthetic-repo-a");
      await authStore.loadMore();
      assert.equal(authStore.getSnapshot().listState, "ready");
      assert.ok(authStore.getSnapshot().items.some((item) => item.catchId === catchId));
      await authStore.openDetail(catchId);
      assert.equal(authStore.getSnapshot().detailState, "ready");
      const beforeDetail = structuredClone(authStore.getSnapshot().detail);
      const beforeItems = structuredClone(authStore.getSnapshot().items);
      const beforeRow = await db.query("SELECT * FROM catch_asset WHERE catch_id = $1", [catchId]);
      const beforePuts = putCount;
      authorization = authCase.authorization;
      await authStore.update(change);
      assert.equal(authStore.getSnapshot().mutation.status, "error");
      assertAuthError(authStore.getSnapshot().mutation.error, authCase.code);
      assert.deepEqual(authStore.getSnapshot().detail, beforeDetail);
      assert.deepEqual(authStore.getSnapshot().items, beforeItems);
      assert.equal(putCount, beforePuts + 1);
      await authStore.update(change);
      assert.equal(putCount, beforePuts + 1, "같은 Catch를 반복 저장하지 않는다");
      await authStore.openDetail(catchId, true);
      assert.equal(authStore.getSnapshot().detailState, "error");
      assertAuthError(authStore.getSnapshot().detailError, authCase.code);
      assert.equal(authStore.getSnapshot().mutation.status, "error", "실패한 조회는 저장 오류를 해제하지 않는다");
      await authStore.update(change);
      assert.equal(putCount, beforePuts + 1);
      assert.deepEqual(await db.query("SELECT * FROM catch_asset WHERE catch_id = $1", [catchId]), beforeRow);
      authorization = "Bearer " + token;
      await authStore.openDetail(catchId, true);
      assert.equal(authStore.getSnapshot().detailState, "ready");
      assert.equal(authStore.getSnapshot().mutation, null);
      assert.deepEqual(authStore.getSnapshot().detail, beforeDetail);
      assert.equal(putCount, beforePuts + 1, "인증 복구·재조회만으로 자동 저장하지 않는다");
      await authStore.update(change);
      assert.equal(authStore.getSnapshot().mutation.status, "success");
      assert.equal(putCount, beforePuts + 2, "사용자가 다시 저장할 때만 PUT을 보낸다");
      const [afterRow] = await db.query("SELECT * FROM catch_asset WHERE catch_id = $1", [catchId]);
      if (change.kind === "confirmation") {
        assert.equal(afterRow.work_facts_confirmed, true);
        assert.equal(afterRow.contribution_confirmed, true);
      } else if (change.kind === "mismatch") assert.equal(afterRow.mismatch, change.mismatch);
      else assert.equal(afterRow.visibility, change.visibility);
      assert.notDeepEqual(afterRow, beforeRow[0]);
      authStore.dispose();
    }
  }
  authorization = "Bearer " + token;
  // 화면의 마지막 조회 뒤 보호 상태가 변해도 API 거절을 성공으로 표시하지 않는다.
  await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1 AND repository_id = $2",
    [owner, "synthetic-repo-a"]);
  await store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(store.getSnapshot().mutation.error.code, "SOURCE_RESTRICTED");
  assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
  await store.openDetail(own[0].catchId, true);
  assert.equal(store.getSnapshot().detail.restriction, "SOURCE_PRIVATE");
  const foreignMutation = await api.update(foreign[0].catchId, { kind: "confirmation" });
  assert.equal(foreignMutation.code, "RESOURCE_UNAVAILABLE");
  store.dispose();
  console.log("통과: B web 호출 경계 → 실제 Nest HTTP·JWT·PostgreSQL 목록/필터/21건 페이지/0건/직접 상세/확인·별도 공개·불일치·숨김/C 공개 자료 제외/보호 거절/타인 거부 + 인증 오류 4종 목록·상세/인증 오류 3종 × 저장 4종 대상 Catch 행 무변경·반복 차단·인증 복구 후 수동 재시도 (A/E·worker는 합성, 회원 클라이언트·OAuth 미연결)");
} finally {
  try { if (app) await app.close(); } finally { if (fixture) await fixture.close(); }
}


