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
  const transport = async (url, options) => readApiResponse(fetch(origin + "/v1" + url, {
    method: options.method, cache: options.cache, signal: options.signal ?? AbortSignal.timeout(5000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }));
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
  store.dispose();
  console.log("통과: B web 호출 경계 → 실제 Nest HTTP·JWT·PostgreSQL 목록/필터/21건 페이지/0건/직접 상세/타인 거부/미인증 거부 (A/E·worker는 합성)");
} finally {
  try { if (app) await app.close(); } finally { if (fixture) await fixture.close(); }
}


