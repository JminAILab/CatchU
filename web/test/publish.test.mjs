// U4 제출 2 — 발행 화면(W3) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S4~S7의 작성자 쪽, 신뢰성 설계 「작성자 실패 안내」 NFR7.5,
// BR4.1~BR4.9·BR5.6, #416 2026-11-02·11-03 [링크 열기] 결정). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 본인 Catch·텍스트 자료에서 고르고 위/아래로 순서를 바꾼다. 확인 안 된 Catch·보호된 Catch는 이유와 함께 고를 수 없다(BR4.2).
//         비공개 Catch에는 "발행하면 이 Catch는 공개로 바뀝니다"를 보인다(BR4.4). 고르는 동안 서버에 아무것도 보내지 않는다.
//         [다음]은 제목 1~50자·비밀번호 8~64자·항목 1~20개를 먼저 검사하고(BR4.1·BR4.5), 확인 단계는 항목·순서·비밀번호 여부·90일 만료를 보인다(BR4.6).
//         [발행]은 응답까지 버튼을 막는다(BR4.9). 201과 응답 모양이 맞을 때만 완료 화면이고, 완료 화면의 [링크 열기]는 [URL 복사]와 같은 `url`을
//         `target="_blank"`·`rel="noopener noreferrer"`로 열며 `ACTIVE`일 때만 보인다(#416).
// - 실패 조건(입력 유지): 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED는 10월 문구와 함께 `details.catchIds`의 Catch를 표시하고 다른 Catch는 그대로 둔다.
//         404는 목록을 다시 불러오라는 안내, 400은 칸별 안내, 403은 동의 창(창을 거친 뒤에도 403이면 안내 문구), 429 DAILY_LIMIT_REACHED는
//         "오늘 한도에 도달했습니다", 429 RATE_LIMITED는 `retryAfterSeconds` 동안 [발행]을 막고 자동으로 다시 보내지 않으며(없으면 시간을 추정하지 않음),
//         500·통신 실패는 "발행되지 않았습니다"와 다시 시도다. 어떤 경우든 고른 항목·순서·제목·비밀번호 입력은 그대로다.
// - 실패로 보는 것: 접수만으로 완료 표시, 실패 때 입력 소실, 고를 수 없는 Catch가 골라짐, 빈도 초과 뒤 자동 재전송, [링크 열기]가 `ACTIVE`가 아닌데 보임,
//         조작 요소에 data-testid 없음.
//
// 원본 tsx를 변환해 불러온다. 서버는 계약 모양 대역(기능 명세 「작성자 API」)이며 실제 브라우저·api·DB 검증이 아니다. 동의 창은 통과 실행기로 대신한다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { U2_ERROR_MESSAGES } from "../src/lib/u2-error-messages.ts";
import {
  CATCH_REJECTION_TEXT, PUBLISH_FAILED_TEXT, SOURCE_UNAVAILABLE_TEXT, TOTAL_TEXT_LIMIT_TEXT, createPublicationsApi, publishDraftErrors,
  publishFailureLines, publishOutcome, rateLimitedText,
} from "../src/features/publications/publications-api.ts";
import { INELIGIBLE_REASONS, catchSourceOf } from "../src/features/publications/publish-sources.ts";
import { EXPIRY_NOTICE, PRIVATE_CATCH_NOTICE } from "../src/features/publications/publication-format.ts";

const srcUrl = new URL("../src/", import.meta.url);
const screenUrl = new URL("../src/features/publications/publish-screen.tsx", import.meta.url);
const viewUrl = new URL("../src/features/publications/publish-view.tsx", import.meta.url);
const API_STUB = new URL("./__publications-stubs__/api.mjs", import.meta.url).href;
const LINK_STUB = new URL("./u2-next-link-stub.mjs", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/api") return { url: API_STUB, shortCircuit: true };
    if (specifier === "next/link") return { url: LINK_STUB, shortCircuit: true };
    const candidates = (base) => [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((candidate) => existsSync(candidate));
    if (specifier.startsWith("@/")) return { url: candidates(new URL(specifier.slice(2), srcUrl)).href, shortCircuit: true };
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".tsx")) {
      const base = new URL(specifier, context.parentURL);
      if (!/\.(tsx?|css|mjs|js)$/.test(base.pathname)) {
        const url = candidates(base);
        if (url) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === API_STUB) return { format: "module", shortCircuit: true, source: "export const api = { member: async () => ({ kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }) };" };
    if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url.endsWith(".tsx")) {
      return {
        format: "module", shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});
const { PublishScreen, createPublishModel, passthroughConsent, publishStatusLines } = await import(screenUrl.href);
const { PublishConfirmView, PublishDoneView, PublishFormView, SelectedListView, SourcePickerView } = await import(viewUrl.href);
hooks.deregister();

const AT = "2026-11-03T01:02:03.456Z";
const EXPIRES = "2027-02-01T01:02:03.456Z";
const PUB = "99999999-9999-4999-8999-999999999999";
const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const C3 = "33333333-3333-4333-8333-333333333333";
const M1 = "44444444-4444-4444-8444-444444444444";
const URL_OK = "https://web.example/s/synthetic-token-0000000000000000000000000000";

/** 10월 `GET /catches` 응답 항목 중 발행 화면이 읽는 칸만 둔 합성 Catch. 새 Catch NC1에서 저장소·작성자 설명 여부를 더했다. */
const catchAsset = (catchId, { title = "Catch 제목", visibility = "PUBLIC", confirmed = true, restriction = "NONE", mismatch = false,
  repositoryId = "repo-1", hasAuthorDescription = true } = {}) => ({
  catchId, title, visibility, mismatch, restriction, repositoryId, hasAuthorDescription,
  confirmation: { workFactsConfirmed: confirmed, contributionConfirmed: confirmed },
});
const published = (overrides = {}) => ({ publicationId: PUB, url: URL_OK, state: "ACTIVE", publishedAt: AT, expiresAt: EXPIRES, passwordProtected: false, ...overrides });
const success = (data, status = 201) => ({ kind: "success", status, data });
const apiError = (status, code, extra = {}) => ({ kind: "api-error", status, code, message: "합성 메시지", ...extra });
const LOOKUP_FAILED = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const catchPage = (items, nextCursor = null) => ({ kind: "success", status: 200, data: { items, page: { nextCursor } } });
const materialPage = (items, nextCursor = null) => ({ kind: "ok", value: { items, page: { nextCursor } } });
const material = (textMaterialId, title = "자료 제목") => ({ textMaterialId, title, updatedAt: AT });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

/** 호출을 기록하고 정해 둔 응답(값 또는 deferred)을 차례로 돌려주는 대역. */
function fakeClients(responses = {}) {
  const calls = [];
  const queue = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, [...v]]));
  const next = (name) => {
    const value = queue[name]?.shift();
    if (value === undefined) throw new Error(`no response for ${name}`);
    return value && typeof value.promise === "object" ? value.promise : Promise.resolve(value);
  };
  return {
    calls,
    catches: { list: (filter, cursor, signal) => { calls.push({ name: "catches", filter, cursor, signal }); return next("catches"); } },
    materials: { list: (cursor, signal) => { calls.push({ name: "materials", cursor, signal }); return next("materials"); } },
    publications: { publishRaw: (body) => { calls.push({ name: "publish", body: structuredClone(body) }); return next("publish"); } },
    // 저장소 목록(`RepositoryApi.repositories`): 응답을 정하지 않으면 실패로 돌려 이름만 빠지게 한다. 부른 횟수를 센다.
    repositories: { repositories: (signal) => { calls.push({ name: "repositories", signal }); return queue.repositories?.length ? next("repositories") : Promise.resolve(LOOKUP_FAILED); } },
  };
}

function deps({ now = 1_000_000 } = {}) {
  const d = { token: "session-a", clock: now, session: () => d.token, now: () => d.clock };
  return d;
}

const defaultSources = () => ({
  catches: [catchPage([catchAsset(C1, { title: "공개 Catch" }), catchAsset(C2, { title: "비공개 Catch", visibility: "PRIVATE" }), catchAsset(C3, { title: "미확인 Catch", confirmed: false })])],
  materials: [materialPage([material(M1, "자기소개")])],
});

/** 항목 셋을 고르고 제목을 넣어 확인 단계까지 간 모델. */
async function readyModel(responses, d = deps(), consent = passthroughConsent) {
  const api = fakeClients({ ...defaultSources(), ...responses });
  const model = createPublishModel(api, consent, d);
  await model.loadSources();
  model.toggleCatch(C1);
  model.toggleCatch(C2);
  model.toggleMaterial(M1);
  model.setTitle("  발행본 제목  ");
  assert.equal(model.toConfirm(), true);
  return { api, model };
}

test("API: 발행은 POST /publications에 본문 그대로 보내고, 201과 응답 모양이 맞을 때만 성공이다. 예외는 조회 실패로 돌려준다", async () => {
  const calls = [];
  const member = async (path, request) => { calls.push({ path, method: request?.method, body: request?.body }); return success(published()); };
  const api = createPublicationsApi(member);
  const body = { title: "제목", password: "12345678", items: [{ kind: "CATCH", sourceId: C1 }, { kind: "TEXT_MATERIAL", sourceId: M1 }] };
  assert.deepEqual(publishOutcome(await api.publishRaw(body)), { kind: "ok", value: published() });
  assert.deepEqual(calls, [{ path: "/publications", method: "POST", body }]);
  assert.equal(calls[0].body.password, "12345678"); // 비밀번호는 다듬지 않고 본문에만 싣는다
  const throwing = createPublicationsApi(async () => { throw new Error("network"); });
  assert.deepEqual(await throwing.publishRaw(body), LOOKUP_FAILED);
  // 200·토큰 없는 url·모르는 상태는 성공으로 보지 않는다(접수만으로 성공 표시 금지).
  for (const wrong of [success(published(), 200), success(published({ url: "" })), success(published({ state: "PENDING" }))]) {
    assert.deepEqual(publishOutcome(wrong), { kind: "failed", failure: { kind: "failed" } });
  }
});

test("발행 실패 구분: 작성자 실패 안내 표의 각 응답을 구분하고 409는 details.catchIds를, 429 빈도 초과는 retryAfterSeconds를 넘긴다", () => {
  const cases = [
    [apiError(409, "CONFIRMATION_REQUIRED", { details: { catchIds: [C3] } }), { kind: "confirmation-required", catchIds: [C3] }],
    [apiError(409, "SOURCE_RESTRICTED", { details: { catchIds: [C1, C2] } }), { kind: "source-restricted", catchIds: [C1, C2] }],
    [apiError(409, "SOURCE_RESTRICTED"), { kind: "source-restricted", catchIds: [] }],
    [apiError(404, "RESOURCE_UNAVAILABLE"), { kind: "source-unavailable" }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "title", reason: "maxLength" }] } }), { kind: "validation", violations: [{ field: "title", reason: "maxLength" }] }],
    [apiError(403, "AI_CONSENT_REQUIRED"), { kind: "consent-required" }],
    [apiError(429, "DAILY_LIMIT_REACHED"), { kind: "daily-limit" }],
    [apiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 }), { kind: "rate-limited", retryAfterSeconds: 30 }],
    [apiError(429, "RATE_LIMITED"), { kind: "rate-limited" }],
    [apiError(401, "AUTH_INVALID"), { kind: "login-expired" }],
    [apiError(500, "INTERNAL_ERROR"), { kind: "failed" }],
    [LOOKUP_FAILED, { kind: "failed" }],
  ];
  for (const [response, failure] of cases) assert.deepEqual(publishOutcome(response), { kind: "failed", failure }, response.code ?? response.kind);

  // 안내 문구: 첫 줄은 "발행되지 않았습니다", 409는 10월 Catch 문구, 하루 한도는 U2 문구, 빈도 초과는 남은 초가 있을 때만 적는다.
  for (const [, failure] of cases) assert.equal(publishFailureLines(failure)[0], PUBLISH_FAILED_TEXT, failure.kind);
  assert.equal(publishFailureLines({ kind: "confirmation-required", catchIds: [] })[1], CATCH_REJECTION_TEXT["confirmation-required"]);
  assert.equal(CATCH_REJECTION_TEXT["confirmation-required"], "작업 사실과 나의 기여를 먼저 확인해 주세요.");
  assert.equal(CATCH_REJECTION_TEXT["source-restricted"], "원본 저장소가 보호되어 지금은 공개할 수 없습니다.");
  assert.equal(publishFailureLines({ kind: "source-unavailable" })[1], SOURCE_UNAVAILABLE_TEXT);
  assert.equal(publishFailureLines({ kind: "daily-limit" })[1], U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED);
  assert.equal(U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED, "오늘 한도에 도달했습니다");
  assert.match(rateLimitedText(30), /30초/);
  assert.doesNotMatch(rateLimitedText(undefined), /\d+초/);
  assert.deepEqual(publishFailureLines({ kind: "validation", violations: [{ field: "title", reason: "x" }, { field: "password", reason: "y" }, { field: "items[0].kind", reason: "z" }] }).slice(1),
    ["제목은 1~50자(앞뒤 공백 제외)로 입력해 주세요.", "비밀번호는 8~64자로 입력해 주세요.", "항목은 1~20개이며 같은 항목을 두 번 고를 수 없습니다."]);
  assert.match(publishFailureLines({ kind: "validation", violations: [{ field: "snapshotText", reason: "max" }] })[1], /전체 글/);
  assert.match(publishFailureLines({ kind: "consent-required" })[1], /동의/);
});

test("400 items·maxTotalLength는 전체 글 60,000자 상한과 자료 빼기·원문 줄이기 안내이고, 항목 개수·중복 안내와 구분된다(Codex P2)", () => {
  const itemsCount = "항목은 1~20개이며 같은 항목을 두 번 고를 수 없습니다.";
  assert.match(TOTAL_TEXT_LIMIT_TEXT, /60,000자/);
  assert.match(TOTAL_TEXT_LIMIT_TEXT, /자료를 빼거나/);
  assert.match(TOTAL_TEXT_LIMIT_TEXT, /원문을 줄인/);
  // 전체 글 초과만: 개수·중복 안내를 보이지 않는다.
  assert.deepEqual(publishFailureLines({ kind: "validation", violations: [{ field: "items", reason: "maxTotalLength" }] }),
    [PUBLISH_FAILED_TEXT, TOTAL_TEXT_LIMIT_TEXT]);
  // 개수·중복 이유는 그대로 개수·중복 안내다.
  for (const reason of ["arrayMinSize", "arrayMaxSize", "unique", "x"]) {
    assert.deepEqual(publishFailureLines({ kind: "validation", violations: [{ field: "items", reason }] }), [PUBLISH_FAILED_TEXT, itemsCount], reason);
  }
  assert.deepEqual(publishFailureLines({ kind: "validation", violations: [{ field: "items[3].kind", reason: "isEnum" }] }), [PUBLISH_FAILED_TEXT, itemsCount]);
  // 둘이 함께 오면 두 안내를 각각 한 번씩, 온 순서대로 보인다.
  assert.deepEqual(publishFailureLines({ kind: "validation", violations: [
    { field: "items", reason: "arrayMaxSize" }, { field: "items", reason: "maxTotalLength" }, { field: "items", reason: "maxTotalLength" },
  ] }), [PUBLISH_FAILED_TEXT, itemsCount, TOTAL_TEXT_LIMIT_TEXT]);
});

test("입력 검사: 제목 1~50자(앞뒤 공백 제외)·비밀번호 8~64자(다듬지 않음)·항목 1~20개를 넘기면 보내지 않는다", () => {
  assert.deepEqual(publishDraftErrors({ title: ` ${"가".repeat(48)}😀😀 `, usePassword: true, password: " 1234567", itemCount: 20 }), []);
  assert.deepEqual(publishDraftErrors({ title: "제목", usePassword: false, password: "", itemCount: 1 }), []);
  assert.deepEqual(publishDraftErrors({ title: "  ", usePassword: true, password: "1234567", itemCount: 0 }),
    ["제목을 입력해 주세요.", "비밀번호는 8~64자로 입력해 주세요.", "발행할 항목을 하나 이상 골라 주세요."]);
  assert.deepEqual(publishDraftErrors({ title: "가".repeat(51), usePassword: true, password: "a".repeat(65), itemCount: 21 }),
    ["제목은 50자까지 쓸 수 있습니다.", "비밀번호는 8~64자로 입력해 주세요.", "항목은 20개까지 고를 수 있습니다."]);
  // 고를 수 있는 Catch 판정(BR4.2): 확인 완료이고 보호되지 않은 것만.
  assert.equal(catchSourceOf(catchAsset(C1)).eligible, true);
  assert.deepEqual(catchSourceOf(catchAsset(C3, { confirmed: false })).reason, INELIGIBLE_REASONS.unconfirmed);
  assert.deepEqual(catchSourceOf(catchAsset(C3, { restriction: "SOURCE_PRIVATE" })).reason, INELIGIBLE_REASONS.restricted);
  assert.equal(catchSourceOf(catchAsset(C1, { title: null })).title, "제목 없는 Catch");
});

test("모델: 목록을 읽어 고르고 순서를 바꾼다. 고를 수 없는 Catch는 골라지지 않고, 고르는 동안 서버에 보내지 않으며, 20개를 넘지 않는다", async () => {
  const many = Array.from({ length: 25 }, (_, i) => catchAsset(`a${i}0000000-0000-4000-8000-000000000000`, { title: `C${i}` }));
  const api = fakeClients({ catches: [catchPage([catchAsset(C3, { confirmed: false }), ...many], "cursor-1"), catchPage([catchAsset(C1)])], materials: [materialPage([material(M1)])] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.loadSources();
  assert.equal(model.store.get().catches.state, "ready");
  assert.equal(model.store.get().catches.items[0].eligible, false);
  model.toggleCatch(C3); // 미확인 Catch
  model.toggleCatch("00000000-0000-4000-8000-000000000000"); // 목록에 없는 Catch
  assert.deepEqual(model.store.get().selected, []);
  for (const item of many) model.toggleCatch(item.catchId);
  model.toggleMaterial(M1);
  assert.equal(model.store.get().selected.length, 20);
  assert.equal(model.store.get().selected.some((s) => s.kind === "TEXT_MATERIAL"), false);
  // 빼고, 순서를 바꾸고, 같은 항목을 다시 누르면 빠진다.
  model.remove(0);
  model.toggleMaterial(M1);
  assert.deepEqual(model.store.get().selected.at(-1), { kind: "TEXT_MATERIAL", sourceId: M1, title: "자료 제목", visibility: null, hasAuthorDescription: null });
  model.moveUp(19);
  assert.equal(model.store.get().selected[18].sourceId, M1);
  model.moveDown(18);
  model.moveDown(19); // 맨 아래는 더 내리지 않는다
  model.moveUp(0);
  assert.equal(model.store.get().selected[19].sourceId, M1);
  model.toggleMaterial(M1);
  assert.equal(model.store.get().selected.length, 19);
  // [더 보기]는 이어 붙인다. 고르는 동안 발행 요청은 없다.
  await model.loadMoreCatches();
  assert.equal(model.store.get().catches.items.at(-1).catchId, C1);
  assert.equal(api.calls.some((c) => c.name === "publish"), false);
  assert.equal(model.isDirty(), true);
  model.dispose();
});

test("모델: [다음]은 검사를 통과해야 확인 단계로 가고, [발행] 성공(201)은 요청 본문 순서대로 보내며 완료 화면에 응답의 url·상태·만료를 둔다", async () => {
  const api = fakeClients({ ...defaultSources(), publish: [success(published({ passwordProtected: true }))] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.loadSources();
  assert.equal(model.toConfirm(), false);
  assert.deepEqual(model.store.get().status, { kind: "invalid", messages: ["제목을 입력해 주세요.", "발행할 항목을 하나 이상 골라 주세요."] });
  model.toggleCatch(C2);
  model.toggleCatch(C1);
  model.toggleMaterial(M1);
  model.moveUp(2);
  model.setTitle(" 지원용 ");
  assert.equal(model.store.get().status.kind, "idle"); // 입력을 바꾸면 검사 거부 안내는 지운다
  model.setUsePassword(true);
  model.setPassword("secret-pass-1");
  assert.equal(model.toConfirm(), true);
  assert.equal(model.store.get().step, "confirm");
  assert.equal(model.canSubmit(), true);
  await model.submit();
  const state = model.store.get();
  assert.equal(state.step, "done");
  assert.deepEqual(state.result, { ...published({ passwordProtected: true }), title: "지원용" });
  assert.deepEqual(api.calls.filter((c) => c.name === "publish").map((c) => c.body), [{
    title: "지원용", password: "secret-pass-1",
    items: [{ kind: "CATCH", sourceId: C2 }, { kind: "TEXT_MATERIAL", sourceId: M1 }, { kind: "CATCH", sourceId: C1 }],
  }]);
  assert.equal(model.isDirty(), false);
  model.reset();
  assert.equal(model.store.get().step, "edit");
  assert.deepEqual(model.store.get().selected, []);
  assert.equal(model.store.get().catches.items.length, 3); // 목록은 다시 읽지 않는다
});

test("모델: 실패 응답마다 고른 항목·순서·제목·비밀번호 입력을 그대로 두고, 409는 catchIds의 Catch만 표시하며 입력 수정이 필요한 실패만 편집 단계로 돌아간다", async () => {
  const cases = [
    [apiError(409, "CONFIRMATION_REQUIRED", { details: { catchIds: [C2] } }), "confirmation-required", "edit"],
    [apiError(409, "SOURCE_RESTRICTED", { details: { catchIds: [C1] } }), "source-restricted", "edit"],
    [apiError(404, "RESOURCE_UNAVAILABLE"), "source-unavailable", "edit"],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "title", reason: "maxLength" }] } }), "validation", "edit"],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "items", reason: "maxTotalLength" }] } }), "validation", "edit"],
    [apiError(403, "AI_CONSENT_REQUIRED"), "consent-required", "confirm"],
    [apiError(429, "DAILY_LIMIT_REACHED"), "daily-limit", "confirm"],
    [apiError(429, "RATE_LIMITED"), "rate-limited", "confirm"],
    [apiError(401, "AUTH_INVALID"), "login-expired", "confirm"],
    [apiError(500, "INTERNAL_ERROR"), "failed", "confirm"],
    [LOOKUP_FAILED, "failed", "confirm"],
  ];
  for (const [response, kind, step] of cases) {
    const { api, model } = await readyModel({ publish: [response] });
    model.store.set((prev) => ({ ...prev })); // 상태 객체 유지 확인용
    const before = model.store.get();
    await model.submit();
    const after = model.store.get();
    assert.equal(after.status.kind, "failed", kind);
    assert.equal(after.status.failure.kind, kind);
    assert.equal(after.step, step, kind);
    assert.deepEqual(after.selected, before.selected, kind);
    assert.equal(after.title, "  발행본 제목  ", kind);
    assert.equal(after.result, null, kind);
    assert.equal(api.calls.filter((c) => c.name === "publish").length, 1, kind);
    assert.equal(model.isDirty(), true, kind);
    assert.equal(after.retryAt, null, kind); // Retry-After가 없으면 시간을 추정하지 않는다
    if (kind === "confirmation-required") assert.deepEqual(after.flagged, { catchIds: [C2], reason: kind });
    else if (kind === "source-restricted") assert.deepEqual(after.flagged, { catchIds: [C1], reason: kind });
    else assert.equal(after.flagged, null, kind);
    const lines = publishStatusLines(after.status);
    assert.equal(lines.tone, "alert");
    assert.equal(lines.lines[0], PUBLISH_FAILED_TEXT);
    if (kind === "validation") {
      // 전체 글 초과는 전체 글 안내만, 제목 초과는 제목 안내만 보인다. 둘 다 선택·순서·입력은 위에서 확인한 대로 그대로다.
      const totalLength = response.details.violations[0].reason === "maxTotalLength";
      assert.equal(lines.lines.includes(TOTAL_TEXT_LIMIT_TEXT), totalLength, kind);
      assert.equal(lines.lines.some((line) => line.startsWith("항목은 1~20개")), false, kind);
    }
  }
  // 409 표시는 다음 발행 요청을 보낼 때 비우고, 다시 확인 단계로 가도 입력은 그대로다.
  const { model } = await readyModel({ publish: [apiError(409, "CONFIRMATION_REQUIRED", { details: { catchIds: [C2] } }), success(published())] });
  await model.submit();
  model.remove(1); // 표시된 Catch를 뺀다
  assert.equal(model.toConfirm(), true);
  assert.equal(model.store.get().flagged.catchIds[0], C2);
  await model.submit();
  assert.equal(model.store.get().flagged, null);
  assert.equal(model.store.get().step, "done");
});

test("모델: 빈도 초과(429 RATE_LIMITED, Retry-After)는 남은 초 동안 [발행]을 막고 자동으로 다시 보내지 않으며, 시간이 지나면 사용자가 다시 누를 수 있다", async () => {
  const d = deps({ now: 1_000_000 });
  const { api, model } = await readyModel({ publish: [apiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 }), success(published())] }, d);
  await model.submit();
  const state = model.store.get();
  assert.equal(state.step, "confirm");
  assert.deepEqual(state.status.failure, { kind: "rate-limited", retryAfterSeconds: 30 });
  assert.equal(state.retryAt, 1_000_000 + 30_000);
  assert.equal(model.retryWaitSeconds(), 30);
  assert.equal(model.canSubmit(), false);
  await model.submit(); // 막힌 동안 누르면 보내지 않는다
  d.clock += 15_000;
  assert.equal(model.retryWaitSeconds(), 15);
  await model.submit();
  assert.equal(api.calls.filter((c) => c.name === "publish").length, 1);
  d.clock += 15_000;
  assert.equal(model.retryWaitSeconds(), 0);
  assert.equal(model.canSubmit(), true);
  assert.equal(api.calls.filter((c) => c.name === "publish").length, 1); // 시간이 지나도 자동으로 보내지 않는다
  await model.submit();
  assert.equal(api.calls.filter((c) => c.name === "publish").length, 2);
  assert.equal(model.store.get().step, "done");
  assert.equal(model.store.get().retryAt, null);
});

test("모델: 발행 중에는 다시 보내지 않고, 동의 창을 닫거나 동의 기록이 실패하면 보내지 않은 채 입력을 남기며, 로그인이 바뀐 뒤 응답은 반영하지 않는다", async () => {
  const pending = deferred();
  const { api, model } = await readyModel({ publish: [pending] });
  const submitting = model.submit();
  assert.equal(model.store.get().status.kind, "submitting");
  assert.equal(model.canSubmit(), false);
  await model.submit();
  model.backToEdit(); // 발행 중에는 돌아가지 않는다
  model.setTitle("바꾸려 함");
  assert.equal(model.store.get().step, "confirm");
  assert.equal(model.store.get().title, "  발행본 제목  ");
  pending.resolve(success(published()));
  await submitting;
  assert.equal(api.calls.filter((c) => c.name === "publish").length, 1);
  assert.equal(model.store.get().step, "done");

  // 동의 창을 닫음: 요청을 보내지 않는다(동의 실행기가 declined를 돌려준다).
  const declined = await readyModel({}, deps(), async () => ({ kind: "declined" }));
  await declined.model.submit();
  assert.equal(declined.model.store.get().status.kind, "declined");
  assert.match(publishStatusLines(declined.model.store.get().status).lines.join(" "), /동의하지 않아/);
  assert.equal(declined.model.store.get().selected.length, 3);
  assert.equal(declined.model.store.get().step, "confirm");

  // 동의 기록 실패.
  const consentFailed = await readyModel({}, deps(), async () => ({ kind: "consent-failed", result: apiError(500, "INTERNAL_ERROR") }));
  await consentFailed.model.submit();
  assert.equal(consentFailed.model.store.get().status.kind, "consent-failed");
  assert.equal(consentFailed.model.store.get().title, "  발행본 제목  ");

  // 동의 뒤 한 번 다시 보낸 결과도 같은 해석을 거친다(동의 실행기가 두 번째 결과를 돌려준다).
  const retried = await readyModel({ publish: [success(published())] }, deps(),
    async (request) => ({ kind: "result", result: await request(), retried: true }));
  await retried.model.submit();
  assert.equal(retried.model.store.get().step, "done");

  // 로그인이 바뀐 뒤 도착한 성공은 반영하지 않는다.
  const late = deferred();
  const d = deps();
  const changed = await readyModel({ publish: [late] }, d);
  const saving = changed.model.submit();
  d.token = "session-b";
  late.resolve(success(published()));
  await saving;
  assert.equal(changed.model.store.get().step, "confirm");
  assert.equal(changed.model.store.get().result, null);

  // 목록 조회 실패는 0건으로 보이지 않고 다시 불러온다.
  const failedList = fakeClients({ catches: [LOOKUP_FAILED, catchPage([catchAsset(C1)])], materials: [{ kind: "failed", failure: "server" }, materialPage([])] });
  const m2 = createPublishModel(failedList, passthroughConsent, deps());
  await m2.loadSources();
  assert.equal(m2.store.get().catches.state, "error");
  assert.equal(m2.store.get().materials.state, "error");
  await m2.loadSources();
  assert.equal(m2.store.get().catches.items.length, 1);
  assert.deepEqual(m2.store.get().materials, { state: "ready", items: [], nextCursor: null, moreState: "idle" });
});

test("완료 화면: [링크 열기]는 [URL 복사]와 같은 url을 새 탭 속성으로 열고 ACTIVE일 때만 보이며, [URL 복사]·상세 이동은 상태와 관계없이 있다", () => {
  const active = renderToStaticMarkup(createElement(PublishDoneView, { result: { ...published({ passwordProtected: true }), title: "지원용" }, onNew() {} }));
  assert.ok(active.includes('data-testid="publish-done"'));
  assert.match(active, new RegExp(`<a[^>]*href="${URL_OK}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*data-testid="publication-open-link"`));
  assert.ok(active.includes(`data-testid="publish-result-url">${URL_OK}<`));
  assert.ok(active.includes('data-testid="publication-copy-url"'));
  assert.ok(active.includes(`href="/publications/${PUB}"`));
  assert.ok(active.includes('data-testid="publish-result-detail-link"'));
  assert.ok(active.includes("비밀번호도 따로 전달해야 합니다"));
  assert.ok(active.includes("유효"));
  for (const state of ["STOPPED", "EXPIRED"]) {
    const closed = renderToStaticMarkup(createElement(PublishDoneView, { result: { ...published({ state }), title: "지원용" }, onNew() {} }));
    assert.doesNotMatch(closed, /publication-open-link/, state);
    assert.ok(closed.includes('data-testid="publication-copy-url"'), state);
  }
});

test("확인·입력·고르기 화면: 항목 순서·비밀번호 여부·90일 만료를 보이고, 발행 중·빈도 초과면 [발행]을 막으며, 고를 수 없는 Catch는 이유와 함께 비활성이고 409 표시가 보인다", () => {
  const items = [
    { kind: "CATCH", sourceId: C2, title: "비공개 Catch", visibility: "PRIVATE" },
    { kind: "TEXT_MATERIAL", sourceId: M1, title: "자기소개", visibility: null },
  ];
  const confirm = (props) => renderToStaticMarkup(createElement(PublishConfirmView, {
    items, title: " 지원용 ", usePassword: true, submitting: false, lockSeconds: 0, statusLines: null, onBack() {}, onSubmit() {}, ...props,
  }));
  const idle = confirm({});
  assert.ok(idle.includes(EXPIRY_NOTICE));
  assert.ok(idle.includes('data-testid="publish-confirm-password">설정됨<'));
  assert.ok(idle.includes(PRIVATE_CATCH_NOTICE));
  assert.ok(/비공개 Catch.*자기소개/s.test(idle)); // 고른 순서대로
  assert.match(idle, /data-testid="publish-submit"(?![^>]*disabled)/);
  assert.match(confirm({ submitting: true }), /data-testid="publish-submit"[^>]*disabled=""/);
  assert.ok(confirm({ submitting: true }).includes('data-testid="publish-submitting"'));
  const locked = confirm({ lockSeconds: 12, statusLines: publishStatusLines({ kind: "failed", failure: { kind: "rate-limited", retryAfterSeconds: 12 } }) });
  assert.match(locked, /data-testid="publish-submit"[^>]*disabled=""/);
  assert.ok(locked.includes("12초 뒤에 [발행]을 누를 수 있습니다."));
  assert.ok(locked.includes(`<p>${PUBLISH_FAILED_TEXT}</p>`));
  assert.match(locked, /role="alert"/);

  const form = renderToStaticMarkup(createElement(PublishFormView, {
    title: "제목", usePassword: true, password: "secret-pass-1", disabled: false, statusLines: { tone: "alert", lines: [PUBLISH_FAILED_TEXT, SOURCE_UNAVAILABLE_TEXT] },
    onTitle() {}, onUsePassword() {}, onPassword() {}, onNext() {},
  }));
  for (const id of ["publish-form", "publish-title-input", "publish-use-password", "publish-password-input", "publish-to-confirm", "publish-status"]) {
    assert.ok(form.includes(`data-testid="${id}"`), id);
  }
  assert.match(form, /type="password"/);
  assert.doesNotMatch(form, />secret-pass-1</); // 비밀번호 원문은 안내에 넣지 않는다(입력값으로만 있다)
  assert.ok(form.includes(SOURCE_UNAVAILABLE_TEXT));
  assert.ok(form.includes("받은 사람에게도 보이며 발행 뒤 바꿀 수 없습니다.")); // 발행 제목은 받은 사람 화면 맨 위 제목(h1)으로 보인다

  const catches = { state: "ready", moreState: "idle", nextCursor: "c", items: [catchSourceOf(catchAsset(C1, { title: "공개 Catch" })), catchSourceOf(catchAsset(C2, { title: "비공개 Catch", visibility: "PRIVATE" })), catchSourceOf(catchAsset(C3, { title: "미확인 Catch", confirmed: false }))] };
  const materials = { state: "ready", moreState: "idle", nextCursor: null, items: [material(M1, "자기소개")] };
  const picker = renderToStaticMarkup(createElement(SourcePickerView, {
    catches, materials, selected: items, flagged: { catchIds: [C2], reason: "confirmation-required" }, disabled: false,
    onRetry() {}, onMoreCatches() {}, onMoreMaterials() {}, onToggleCatch() {}, onToggleMaterial() {},
  }));
  assert.match(picker, new RegExp(`data-source-id="${C3}"[^>]*aria-pressed="false"[^>]*disabled=""`));
  assert.ok(picker.includes(INELIGIBLE_REASONS.unconfirmed));
  assert.match(picker, new RegExp(`data-source-id="${C2}"[^>]*aria-pressed="true"`));
  assert.ok(picker.includes('data-testid="publish-catch-flagged"'));
  assert.ok(picker.includes(CATCH_REJECTION_TEXT["confirmation-required"]));
  assert.ok(picker.includes('data-testid="publish-catch-private-notice"'));
  assert.ok(picker.includes('data-testid="publish-catches-more"'));
  assert.doesNotMatch(picker, /publish-materials-more/);
  assert.ok(picker.includes('data-testid="publish-material-option"'));
  const script = renderToStaticMarkup(createElement(SelectedListView, {
    items: [{ kind: "TEXT_MATERIAL", sourceId: M1, title: "<script>alert(1)</script>", visibility: null }], flagged: null, disabled: false, onMoveUp() {}, onMoveDown() {}, onRemove() {},
  }));
  assert.ok(script.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  for (const id of ["publish-move-up", "publish-move-down", "publish-remove", "publish-selected-item"]) assert.ok(script.includes(`data-testid="${id}"`), id);

  const screen = renderToStaticMarkup(createElement(PublishScreen, { api: fakeClients(), deps: deps(), consent: passthroughConsent }));
  assert.match(screen, /<h1>발행<\/h1>/);
  assert.ok(screen.includes('data-testid="publish-sources"'));
  assert.doesNotMatch(screen, /publish-done/);
});

// 새 Catch NC1 — 발행 화면 권장 안내·작은 줄·걸러 보기·확인 안내(US5.1~US5.4, BR6.1~BR6.7, NFR1.2·NFR6.2).
// 먼저 정한 실패 조건: 걸러 보기를 켜면 고른 자료가 빠짐, 체크 칸을 바꿀 때 저장소 목록을 다시 부름, 저장소 목록 실패로 고르기·발행이 막힘,
// 설명 없는 Catch 수 안내가 [발행]을 막음, 저장소별 개수 경고·추천·순위가 보임. 저장소 목록·Catch 목록은 합성 응답이다.
const repositoryList = { kind: "success", data: [{ repositoryId: "repo-1", name: "TheMe", ownerLogin: "synthetic-owner", url: "https://github.com/synthetic-owner/TheMe" }] };
const pickerOf = (items, props = {}) => renderToStaticMarkup(createElement(SourcePickerView, {
  catches: { state: "ready", moreState: "idle", nextCursor: null, items: items.map(catchSourceOf) },
  materials: { state: "ready", moreState: "idle", nextCursor: null, items: [] }, selected: [], flagged: null, disabled: false,
  repositories: [{ repositoryId: "repo-1", name: "synthetic-owner/TheMe" }],
  onRetry() {}, onMoreCatches() {}, onMoreMaterials() {}, onToggleCatch() {}, onToggleMaterial() {}, ...props,
}));
const sublines = (html) => [...html.matchAll(/data-testid="publish-catch-subline">([^<]*)</g)].map((match) => match[1]);
const confirmOf = (items) => renderToStaticMarkup(createElement(PublishConfirmView, {
  items, title: "지원용", usePassword: false, submitting: false, lockSeconds: 0, statusLines: null, onBack() {}, onSubmit() {},
}));
const picked = (catchId, hasAuthorDescription, visibility = "PUBLIC") => ({ kind: "CATCH", sourceId: catchId, title: `Catch ${catchId}`, visibility, hasAuthorDescription });

test("AC5.1.1 「발행할 자료 고르기」 기존 안내 아래에 「저장소마다 3~5개를 권합니다.」 한 줄이 있다", () => {
  const html = pickerOf([catchAsset(C1)]);
  const limit = html.indexOf("고른 순서대로 발행본에 들어갑니다.");
  const recommendation = html.indexOf('data-testid="publish-sources-recommendation">저장소마다 3~5개를 권합니다.</p>');
  assert.ok(limit >= 0 && recommendation > limit && recommendation < html.indexOf("<h3>내 Catch</h3>"));
});

test("AC5.1.2 한 저장소의 Catch 7개를 골라 확인 단계까지 가도 저장소별 개수 경고·추천·순위가 없다", () => {
  const seven = Array.from({ length: 7 }, (_, index) => picked(`c${index}`, true));
  const html = confirmOf(seven) + pickerOf(Array.from({ length: 7 }, (_, index) => catchAsset(`c${index}`)), { selected: seven });
  assert.doesNotMatch(html, /너무 많|개를 넘|추천|순위|경고/);
  assert.equal((html.match(/저장소마다 3~5개를 권합니다/g) ?? []).length, 1, "권장 안내는 고르기의 한 줄뿐");
  assert.match(confirmOf(seven), /data-testid="publish-submit"(?![^>]*disabled)/);
});

test("AC5.2.1 「내 Catch」 항목 작은 줄은 저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨 순서이고 「설명 안 씀」은 설명이 없는 Catch에만 있다", () => {
  const html = pickerOf([
    catchAsset(C1, { hasAuthorDescription: true }),
    catchAsset(C2, { hasAuthorDescription: false, visibility: "PRIVATE", mismatch: true }),
    catchAsset(C3, { hasAuthorDescription: false, repositoryId: "repo-unknown" }),
  ]);
  assert.deepEqual(sublines(html), [
    "synthetic-owner/TheMe · 공개", "synthetic-owner/TheMe · 비공개 · 설명 안 씀 · 불일치 표시됨", "공개 · 설명 안 씀",
  ]);
  assert.ok(html.includes('data-testid="publish-catch-private-notice"'), "비공개 안내 줄은 지금처럼 따로 붙는다");
});

test("AC5.2.2 상세에서 설명을 막 저장한 Catch는 발행 화면을 새로 열면 「설명 안 씀」이 없다(열 때마다 새로 불러옴)", async () => {
  const before = fakeClients({ catches: [catchPage([catchAsset(C1, { hasAuthorDescription: false })])], materials: [materialPage([])] });
  const first = createPublishModel(before, passthroughConsent, deps());
  await first.open();
  assert.deepEqual(sublines(pickerOf([], { catches: first.store.get().catches })), ["synthetic-owner/TheMe · 공개 · 설명 안 씀"]);
  first.dispose();
  const after = fakeClients({ catches: [catchPage([catchAsset(C1, { hasAuthorDescription: true })])], materials: [materialPage([])] });
  const reopened = createPublishModel(after, passthroughConsent, deps());
  await reopened.open();
  assert.equal(after.calls.filter((c) => c.name === "catches").length, 1);
  assert.deepEqual(sublines(pickerOf([], { catches: reopened.store.get().catches })), ["synthetic-owner/TheMe · 공개"]);
});

test("AC5.2.3 「설명 안 씀」은 본인 목록 응답의 hasAuthorDescription(「씀」 걸러 보기와 같은 판정)에서만 온다", () => {
  for (const hasAuthorDescription of [true, false]) {
    const source = catchSourceOf(catchAsset(C1, { hasAuthorDescription }));
    assert.equal(source.hasAuthorDescription, hasAuthorDescription);
    assert.equal(sublines(pickerOf([catchAsset(C1, { hasAuthorDescription })]))[0].includes("설명 안 씀"), !hasAuthorDescription);
  }
});

test("AC5.3.2·AC5.3.4 체크 칸은 처음 꺼져 있고 보이는 label이 감싸며, 켜면 written 조건으로 첫 쪽부터 다시 불러오고 개수 줄은 aria-live=polite다", async () => {
  const api = fakeClients({
    catches: [catchPage([catchAsset(C1, { hasAuthorDescription: false }), catchAsset(C2)], "cursor-all"), catchPage([catchAsset(C2)])],
    materials: [materialPage([])],
  });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  assert.equal(model.store.get().writtenOnly, false);
  const toggling = model.setWrittenOnly(true);
  assert.equal(model.store.get().catches.state, "loading");
  await toggling;
  assert.deepEqual(api.calls.filter((c) => c.name === "catches").map((c) => [c.filter, c.cursor]), [
    [{ repositoryId: "", authorDescription: "all" }, null], [{ repositoryId: "", authorDescription: "written" }, null],
  ]);
  assert.deepEqual(model.store.get().catches.items.map((item) => item.catchId), [C2]);
  const html = pickerOf([], { catches: model.store.get().catches, writtenOnly: true });
  assert.match(html, /<label[^>]*><input type="checkbox" data-testid="publish-written-only" checked=""\/>작성자 설명을 쓴 Catch만 보기<\/label>/);
  assert.ok(html.indexOf('data-testid="publish-written-only"') < html.indexOf('data-testid="publish-catch-option"'));
  assert.match(html, /<p[^>]*aria-live="polite"[^>]*>불러온 1개의 Catch<\/p>/);
  assert.doesNotMatch(pickerOf([catchAsset(C1)]), /data-testid="publish-written-only" checked/);
});

test("AC5.3.1 설명 없는 Catch A를 골라 둔 뒤 걸러 보기를 켜면 목록에서 A는 사라지지만 고른 항목과 순서에는 A가 남는다", async () => {
  const api = fakeClients({
    catches: [catchPage([catchAsset(C1, { hasAuthorDescription: false }), catchAsset(C2)]), catchPage([catchAsset(C2)])],
    materials: [materialPage([material(M1)])],
  });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  model.toggleCatch(C1);
  model.toggleMaterial(M1);
  await model.setWrittenOnly(true);
  assert.ok(!model.store.get().catches.items.some((item) => item.catchId === C1));
  assert.deepEqual(model.store.get().selected.map((item) => [item.sourceId, item.hasAuthorDescription]), [[C1, false], [M1, null]]);
  model.toggleCatch(C2);
  assert.deepEqual(model.store.get().selected.map((item) => item.sourceId), [C1, M1, C2]);
  // 목록에 없어도 고른 A는 다시 눌러(고른 항목에서) 뺄 수 있다.
  model.toggleCatch(C1);
  assert.deepEqual(model.store.get().selected.map((item) => item.sourceId), [M1, C2]);
});

test("AC5.3.3 최대 개수만큼 고른 상태(설명 없는 Catch 포함)에서 칸을 켜도 고른 수는 그대로 최대라 더 고를 수 없다", async () => {
  const many = Array.from({ length: 20 }, (_, i) => catchAsset(`b${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`, { hasAuthorDescription: i % 2 === 0 }));
  const extra = catchAsset("c9999999-0000-4000-8000-000000000000");
  const api = fakeClients({ catches: [catchPage(many), catchPage([extra])], materials: [materialPage([])] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  for (const item of many) model.toggleCatch(item.catchId);
  await model.setWrittenOnly(true);
  assert.equal(model.store.get().selected.length, 20);
  model.toggleCatch(extra.catchId);
  assert.equal(model.store.get().selected.length, 20);
  const html = pickerOf([], { catches: model.store.get().catches, selected: model.store.get().selected, writtenOnly: true });
  assert.match(html, new RegExp(`data-source-id="${extra.catchId}"[^>]*aria-pressed="false"[^>]*disabled=""`));
});

test("BR6.4 켰는데 맞는 Catch가 없으면 목록 자리에 「작성자 설명을 쓴 Catch가 없습니다」이고, 체크 칸은 발행 중에만 막히며 목록 실패에도 쓸 수 있다", async () => {
  const empty = pickerOf([], { writtenOnly: true });
  assert.ok(empty.includes('data-testid="publish-catches-written-empty">작성자 설명을 쓴 Catch가 없습니다<'));
  assert.doesNotMatch(empty, /publish-catches-empty"/);
  assert.match(pickerOf([], { disabled: true }), /data-testid="publish-written-only"[^>]*disabled=""/);
  const failed = pickerOf([], { catches: { state: "error", items: [], nextCursor: null, moreState: "idle", errorText: "실패" } });
  assert.ok(failed.includes('data-testid="publish-sources-retry"'));
  assert.doesNotMatch(failed, /data-testid="publish-written-only"[^>]*disabled/);
  // 발행 중에는 모델도 바꾸지 않는다.
  const pending = deferred();
  const { api, model } = await readyModel({ publish: [pending] });
  const submitting = model.submit();
  await model.setWrittenOnly(true);
  assert.equal(model.store.get().writtenOnly, false);
  assert.equal(api.calls.filter((c) => c.name === "catches").length, 1);
  pending.resolve(success(published()));
  await submitting;
});

test("AC5.4.1·AC5.4.2 확인 단계는 고른 자료 가운데 설명 없는 Catch 수를 비공개 안내와 같은 꼴로 알리고 [발행]을 막지 않으며, 0개면 그리지 않는다", () => {
  const two = confirmOf([picked(C1, false, "PRIVATE"), picked(C2, false), picked(C3, true), { kind: "TEXT_MATERIAL", sourceId: M1, title: "자료", visibility: null, hasAuthorDescription: null }]);
  assert.ok(two.includes('data-testid="publish-confirm-description-notice">작성자 설명이 없는 Catch가 2개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다.</p>'));
  assert.ok(two.indexOf('data-testid="publish-confirm-private-notice"') < two.indexOf('data-testid="publish-confirm-description-notice"'));
  assert.match(two, /data-testid="publish-submit"(?![^>]*disabled)/);
  const none = confirmOf([picked(C1, true), picked(C2, true), { kind: "TEXT_MATERIAL", sourceId: M1, title: "자료", visibility: null, hasAuthorDescription: null }]);
  assert.doesNotMatch(none, /publish-confirm-description-notice|작성자 설명이 없는 Catch/);
});

test("NFR1.2 저장소 목록은 화면을 열 때 한 번만 부르고, 체크 칸을 켜고 끄거나 목록을 다시 불러와도 다시 부르지 않는다", async () => {
  const api = fakeClients({
    catches: [catchPage([catchAsset(C1)]), catchPage([catchAsset(C1)]), catchPage([catchAsset(C1)]), catchPage([catchAsset(C1)])],
    materials: [materialPage([]), materialPage([])], repositories: [repositoryList],
  });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  assert.deepEqual(model.repositoryOptions.getSnapshot(), { state: "ready", repositories: [{ repositoryId: "repo-1", name: "synthetic-owner/TheMe" }] });
  await model.setWrittenOnly(true);
  await model.setWrittenOnly(false);
  await model.loadSources();
  assert.equal(api.calls.filter((c) => c.name === "repositories").length, 1);
  assert.equal(api.calls.filter((c) => c.name === "catches").length, 4);
});

test("BR6.2 저장소 목록을 못 불러오면 작은 줄에서 저장소 이름만 빠지고 고르기·발행은 막히지 않는다", async () => {
  const api = fakeClients({ ...defaultSources(), publish: [success(published())] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  assert.equal(model.repositoryOptions.getSnapshot().state, "error");
  const html = pickerOf([], { catches: model.store.get().catches, repositories: model.repositoryOptions.getSnapshot().repositories });
  assert.deepEqual(sublines(html), ["공개", "비공개", "공개"]);
  model.toggleCatch(C1);
  model.setTitle("지원용");
  assert.equal(model.toConfirm(), true);
  await model.submit();
  assert.equal(model.store.get().step, "done");
});
