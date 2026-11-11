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

/** 10월 `GET /catches` 응답 항목 중 발행 화면이 읽는 칸만 둔 합성 Catch. */
const catchAsset = (catchId, { title = "Catch 제목", visibility = "PUBLIC", confirmed = true, restriction = "NONE", mismatch = false } = {}) => ({
  catchId, title, visibility, mismatch, restriction,
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
    catches: { list: (repositoryId, cursor, signal) => { calls.push({ name: "catches", repositoryId, cursor, signal }); return next("catches"); } },
    materials: { list: (cursor, signal) => { calls.push({ name: "materials", cursor, signal }); return next("materials"); } },
    publications: { publishRaw: (body) => { calls.push({ name: "publish", body: structuredClone(body) }); return next("publish"); } },
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
  assert.deepEqual(model.store.get().selected.at(-1), { kind: "TEXT_MATERIAL", sourceId: M1, title: "자료 제목", visibility: null });
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
