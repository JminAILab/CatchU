// U4 제출 2 — 발행 화면(W3) 시험. 발행 프리셋 U2(M4, BR4.1~BR4.7, NFR6.1·NFR6.5·NFR6.6)에서 자료 고르기를 프리셋 고르기로 바꿨다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S4~S7의 작성자 쪽, 신뢰성 설계 「작성자 실패 안내」 NFR7.5,
// 발행 프리셋 U2 unit-test-instructions 「시나리오」의 발행 묶음). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 프리셋 목록을 한 번 불러 프리셋을 1~5개 고르고 위/아래로 순서를 정한다. 고를 수 없는 프리셋은 이유 하나(항목 0개 → 발행할 수 없는 자료
//         → 항목 20개 → 60,000자)와 함께 막히고, 다섯 개를 고르면 안 고른 단추가 막히며 5개 안내는 목록 위에 한 번만 보인다(aria-live).
//         [다음]은 제목 1~50자·비밀번호 8~64자·프리셋 1~5개를 먼저 검사하고, 확인 단계는 제목·비밀번호 여부·90일 만료와 「고른 프리셋과 순서」를 보인다.
//         발행 요청은 { title, password?, presetIds }(고른 순서)이고 items 칸은 없다. [발행]은 응답까지 버튼을 막고, 201과 응답 모양이 맞을 때만 완료 화면이다.
// - 실패 조건(입력 유지): 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED·CATCH_PRIVATE와 400 추출 미완료는 목록을 한 번 다시 불러와
//         「‘(프리셋)’ 프리셋의 ‘(자료)’ 때문에 발행할 수 없습니다.」 줄을 보이고(이름을 못 찾으면 종류·「고른 프리셋」), 404는 없어진 프리셋을 고른 목록에서 빼며,
//         400 presetIds는 「고른 프리셋으로는 발행할 수 없습니다.」와 목록 다시 불러오기, 403·429·401·500은 지금 그대로다. 고른 프리셋·제목·비밀번호는 남는다.
// - 실패로 보는 것: items를 보냄, 실패가 0개로 보임, 6번째가 골라짐, 이유가 둘 보임, 어느 자료인지 없음·빈 따옴표, 공개 전환 안내가 보임,
//         접수만으로 완료 표시, 빈도 초과 뒤 자동 재전송, 이름이 태그로 그려짐.
//
// 원본 tsx를 변환해 불러온다. 서버는 계약 모양 대역(api/docs/publications.md·presets.md)이며 실제 브라우저·api·DB 검증이 아니다. 동의 창은 통과 실행기로 대신한다.
// 지금까지 이 파일에 있던 자료 고르기(Catch·텍스트 자료·PDF, 걸러 보기, 저장소 이름) 시험은 그 동작을 옮긴 프리셋 편집 화면 시험(presets.test.mjs)으로 옮겼다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { U2_ERROR_MESSAGES } from "../src/lib/u2-error-messages.ts";
import {
  CATCH_PRIVATE_TEXT, CATCH_REJECTION_TEXT, PRESET_INVALID_TEXT, PRESETS_FULL_TEXT, PUBLISH_FAILED_TEXT, PUBLISH_LIMITS, SOURCE_UNAVAILABLE_TEXT,
  PDF_EXTRACTION_INCOMPLETE_TEXT, blockedSourceLines, createPublicationsApi, presetBlockReason, publishDraftErrors, publishFailureLines, publishOutcome,
  rateLimitedText,
} from "../src/features/publications/publications-api.ts";
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
const { PresetPickerView, PublishConfirmView, PublishDoneView, PublishFormView, SelectedPresetsView } = await import(viewUrl.href);
hooks.deregister();

const AT = "2026-11-03T01:02:03.456Z";
const EXPIRES = "2027-02-01T01:02:03.456Z";
const PUB = "99999999-9999-4999-8999-999999999999";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const C1 = "c1111111-1111-4111-8111-111111111111";
const URL_OK = "https://web.example/s/synthetic-token-0000000000000000000000000000";

/** `GET /v1/presets`의 프리셋 하나(api/docs/presets.md `PresetSummary`). */
const preset = (presetId, overrides = {}) => ({
  presetId, name: `프리셋 ${presetId.slice(0, 1)}`, itemCount: 3, textLength: 8100, overLimit: false, unpublishableCount: 0, unpublishableItems: [], ...overrides,
});
const presetList = (presets) => ({ kind: "ok", value: { presets } });
const LIST_FAILED = { kind: "failed", failure: "failed" };
const published = (overrides = {}) => ({ publicationId: PUB, url: URL_OK, state: "ACTIVE", publishedAt: AT, expiresAt: EXPIRES, passwordProtected: false, ...overrides });
const success = (data, status = 201) => ({ kind: "success", status, data });
const apiError = (status, code, extra = {}) => ({ kind: "api-error", status, code, message: "합성 메시지", ...extra });
const LOOKUP_FAILED = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

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
    presets: { list: (signal) => { calls.push({ name: "presets", signal }); return next("presets"); } },
    publications: { publishRaw: (body) => { calls.push({ name: "publish", body: structuredClone(body) }); return next("publish"); } },
  };
}
const count = (api, name) => api.calls.filter((call) => call.name === name).length;

function deps({ now = 1_000_000 } = {}) {
  const d = { token: "session-a", clock: now, session: () => d.token, now: () => d.clock };
  return d;
}

const defaultPresets = () => [preset(P1, { name: "자기소개서", itemCount: 4, textLength: 12_300 }), preset(P2, { name: "포트폴리오" }), preset(P3, { name: "기술" })];

/** 프리셋 둘을 고르고 제목을 넣어 확인 단계까지 간 모델. */
async function readyModel(responses = {}, d = deps(), consent = passthroughConsent) {
  const api = fakeClients({ presets: [presetList(defaultPresets()), presetList(defaultPresets())], ...responses });
  const model = createPublishModel(api, consent, d);
  await model.open();
  model.togglePreset(P1);
  model.togglePreset(P2);
  model.setTitle("  발행본 제목  ");
  assert.equal(model.toConfirm(), true);
  return { api, model };
}

const noop = () => {};
const pickerHtml = (presets, selected = [], props = {}) => renderToStaticMarkup(createElement(PresetPickerView, {
  presets: { state: "ready", items: presets }, selected, disabled: false, onRetry: noop, onToggle: noop, ...props,
}));
const optionOf = (html, id) => new RegExp(`<button[^>]*data-preset-id="${id}"[^>]*>.*?</button>`, "s").exec(html)?.[0] ?? "";
const chosen = (...entries) => entries.map(([presetId, name]) => ({ presetId, name }));

test("API: 발행은 POST /publications에 { title, password?, presetIds }를 그대로 보내고, 201과 응답 모양이 맞을 때만 성공이다. 예외는 조회 실패로 돌려준다", async () => {
  const calls = [];
  const member = async (path, request) => { calls.push({ path, method: request?.method, body: request?.body }); return success(published()); };
  const api = createPublicationsApi(member);
  const body = { title: "제목", password: "12345678", presetIds: [P2, P1] };
  assert.deepEqual(publishOutcome(await api.publishRaw(body)), { kind: "ok", value: published() });
  assert.deepEqual(calls, [{ path: "/publications", method: "POST", body }]);
  const throwing = createPublicationsApi(async () => { throw new Error("network"); });
  assert.deepEqual(await throwing.publishRaw(body), LOOKUP_FAILED);
  for (const wrong of [success(published(), 200), success(published({ url: "" })), success(published({ state: "PENDING" }))]) {
    assert.deepEqual(publishOutcome(wrong), { kind: "failed", failure: { kind: "failed" } });
  }
});

test("발행 실패 구분: 막힘 셋과 추출 미완료는 blockedSources를, 400 presetIds는 preset-invalid, 404는 찾을 수 없음, 나머지는 지금 그대로다", () => {
  const blocked = [{ presetId: P1, kind: "CATCH", sourceId: C1 }];
  const cases = [
    [apiError(409, "CONFIRMATION_REQUIRED", { details: { blockedSources: blocked } }), { kind: "confirmation-required", blockedSources: blocked }],
    [apiError(409, "SOURCE_RESTRICTED", { details: { blockedSources: blocked } }), { kind: "source-restricted", blockedSources: blocked }],
    [apiError(409, "CATCH_PRIVATE", { details: { blockedSources: blocked } }), { kind: "catch-private", blockedSources: blocked }],
    [apiError(409, "CATCH_PRIVATE"), { kind: "catch-private", blockedSources: [] }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "presetIds", reason: "extractionIncomplete" }], blockedSources: blocked } }),
      { kind: "extraction-incomplete", blockedSources: blocked }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "presetIds[1]", reason: "emptyPreset" }] } }), { kind: "preset-invalid" }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "presetIds", reason: "maxItems" }] } }), { kind: "preset-invalid" }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "presetIds", reason: "maxTotalLength" }] } }), { kind: "preset-invalid" }],
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "title", reason: "maxLength" }] } }), { kind: "validation", violations: [{ field: "title", reason: "maxLength" }] }],
    [apiError(404, "RESOURCE_UNAVAILABLE"), { kind: "source-unavailable" }],
    [apiError(403, "AI_CONSENT_REQUIRED"), { kind: "consent-required" }],
    [apiError(429, "DAILY_LIMIT_REACHED"), { kind: "daily-limit" }],
    [apiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 }), { kind: "rate-limited", retryAfterSeconds: 30 }],
    [apiError(429, "RATE_LIMITED"), { kind: "rate-limited" }],
    [apiError(401, "AUTH_INVALID"), { kind: "login-expired" }],
    [apiError(409, "FUTURE_CODE"), { kind: "failed" }],
    [apiError(500, "INTERNAL_ERROR"), { kind: "failed" }],
    [LOOKUP_FAILED, { kind: "failed" }],
  ];
  for (const [response, failure] of cases) assert.deepEqual(publishOutcome(response), { kind: "failed", failure }, response.code ?? response.kind);
  for (const [, failure] of cases) assert.equal(publishFailureLines(failure)[0], PUBLISH_FAILED_TEXT, failure.kind);
  assert.deepEqual(publishFailureLines({ kind: "catch-private", blockedSources: [] }), [PUBLISH_FAILED_TEXT, "비공개 Catch는 발행할 수 없습니다."]);
  assert.equal(CATCH_PRIVATE_TEXT, "비공개 Catch는 발행할 수 없습니다.");
  assert.deepEqual(publishFailureLines({ kind: "confirmation-required", blockedSources: [] }), [PUBLISH_FAILED_TEXT, CATCH_REJECTION_TEXT["confirmation-required"]]);
  assert.deepEqual(publishFailureLines({ kind: "source-restricted", blockedSources: [] }), [PUBLISH_FAILED_TEXT, "원본 저장소가 보호되어 지금은 공개할 수 없습니다."]);
  assert.deepEqual(publishFailureLines({ kind: "extraction-incomplete", blockedSources: [] }), [PUBLISH_FAILED_TEXT, PDF_EXTRACTION_INCOMPLETE_TEXT]);
  assert.deepEqual(publishFailureLines({ kind: "preset-invalid" }), [PUBLISH_FAILED_TEXT, "고른 프리셋으로는 발행할 수 없습니다. 목록을 다시 확인해 주세요."]);
  assert.equal(PRESET_INVALID_TEXT, "고른 프리셋으로는 발행할 수 없습니다. 목록을 다시 확인해 주세요.");
  assert.deepEqual(publishFailureLines({ kind: "source-unavailable" }), [PUBLISH_FAILED_TEXT, "고른 프리셋이나 그 안의 자료를 찾을 수 없습니다."]);
  assert.equal(SOURCE_UNAVAILABLE_TEXT, "고른 프리셋이나 그 안의 자료를 찾을 수 없습니다.");
  assert.equal(publishFailureLines({ kind: "daily-limit" })[1], U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED);
  assert.match(rateLimitedText(30), /30초/);
  assert.doesNotMatch(rateLimitedText(undefined), /\d+초/);
  assert.deepEqual(publishFailureLines({ kind: "validation", violations: [{ field: "title", reason: "x" }, { field: "password", reason: "y" }, { field: "presetIds[0]", reason: "isUuid" }] }).slice(1),
    ["제목은 1~50자(앞뒤 공백 제외)로 입력해 주세요.", "비밀번호는 8~64자로 입력해 주세요.", "프리셋은 1~5개이며 같은 프리셋을 두 번 고를 수 없습니다."]);
  assert.match(publishFailureLines({ kind: "consent-required" })[1], /동의/);
});

test("입력 검사(기능 설계 검토 R-04): 제목 1~50자·비밀번호 8~64자(다듬지 않음)·프리셋 1~5개, 0개와 6개는 정해진 글이다", () => {
  assert.equal(PUBLISH_LIMITS.presets, 5);
  assert.deepEqual(publishDraftErrors({ title: ` ${"가".repeat(48)}😀😀 `, usePassword: true, password: " 1234567", presetCount: 5 }), []);
  assert.deepEqual(publishDraftErrors({ title: "제목", usePassword: false, password: "", presetCount: 1 }), []);
  assert.deepEqual(publishDraftErrors({ title: "  ", usePassword: true, password: "1234567", presetCount: 0 }),
    ["제목을 입력해 주세요.", "비밀번호는 8~64자로 입력해 주세요.", "프리셋을 하나 이상 골라 주세요."]);
  assert.deepEqual(publishDraftErrors({ title: "가".repeat(51), usePassword: true, password: "a".repeat(65), presetCount: 6 }),
    ["제목은 50자까지 쓸 수 있습니다.", "비밀번호는 8~64자로 입력해 주세요.", "프리셋은 5개까지 고를 수 있습니다."]);
});

test("BR4.2 고를 수 없는 이유는 항목 0개 → 발행할 수 없는 자료(「외 N개」) → 고르면 20개 넘음 → 고르면 60,000자 넘음 순서로 하나만 고른다", () => {
  const empty = preset(P1, { itemCount: 0, textLength: 0, unpublishableCount: 1, unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "Catch C", reason: "PRIVATE" }] });
  assert.equal(presetBlockReason(empty, [], false), "담긴 자료가 없어 고를 수 없습니다");
  const three = preset(P1, { itemCount: 15, unpublishableCount: 3, unpublishableItems: ["Catch C", "Catch D", "Catch E"].map((title, i) => ({ kind: "CATCH", sourceId: `s${i}`, title, reason: "PRIVATE" })) });
  assert.equal(presetBlockReason(three, [preset(P2, { itemCount: 10 })], false), "발행할 수 없는 자료가 있습니다: Catch C 외 2개", "자료 이유가 상한보다 앞선다");
  assert.equal(presetBlockReason({ ...three, unpublishableCount: 1, unpublishableItems: three.unpublishableItems.slice(0, 1) }, [], false), "발행할 수 없는 자료가 있습니다: Catch C");
  // 같은 자료가 두 프리셋에 있어도 프리셋의 항목 수를 그대로 더한다(두 번 셈).
  const big = preset(P3, { itemCount: 11 });
  assert.equal(presetBlockReason(big, [preset(P2, { itemCount: 10 })], false), "고르면 항목이 20개를 넘습니다");
  assert.equal(presetBlockReason(preset(P3, { itemCount: 10 }), [preset(P2, { itemCount: 10 })], false), null, "합이 정확히 20개면 고를 수 있다");
  assert.equal(presetBlockReason(preset(P3, { textLength: 30_001 }), [preset(P2, { textLength: 30_000 })], false), "고르면 전체 글이 60,000자를 넘습니다");
  assert.equal(presetBlockReason(preset(P3, { textLength: 61_200, overLimit: true }), [], false), "고르면 전체 글이 60,000자를 넘습니다", "혼자 넘는 프리셋도 같은 이유");
  // 이미 고른 프리셋은 막지 않는다. 다섯 개가 찼으면 상한 이유는 숨긴다.
  assert.equal(presetBlockReason(big, [big], false), null);
  assert.equal(presetBlockReason(preset(P3, { textLength: 61_200 }), [], true), null);
  assert.equal(presetBlockReason(empty, [], true), "담긴 자료가 없어 고를 수 없습니다");
});

test("BR4.1 모델: 목록을 한 번 불러 프리셋 둘을 고르고 순서를 바꿔 발행하면 { title, password?, presetIds }를 고른 순서로 보내고 items는 없다", async () => {
  const api = fakeClients({ presets: [presetList(defaultPresets())], publish: [success(published({ passwordProtected: true }))] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  assert.equal(count(api, "presets"), 1);
  model.togglePreset(P1);
  model.togglePreset(P2);
  model.moveUp(1);
  model.setTitle(" 지원용 ");
  model.setUsePassword(true);
  model.setPassword("secret-pass-1");
  assert.equal(count(api, "publish") + count(api, "presets"), 1, "고르는 동안 요청하지 않는다(NFR6.5)");
  assert.deepEqual(model.store.get().selected, [{ presetId: P2, name: "포트폴리오" }, { presetId: P1, name: "자기소개서" }]);
  assert.equal(model.toConfirm(), true);
  await model.submit();
  const [body] = api.calls.filter((call) => call.name === "publish").map((call) => call.body);
  assert.deepEqual(body, { title: "지원용", presetIds: [P2, P1], password: "secret-pass-1" });
  assert.equal(Object.hasOwn(body, "items"), false);
  assert.equal(model.store.get().step, "done");
  assert.deepEqual(model.store.get().result, { ...published({ passwordProtected: true }), title: "지원용" });
  assert.equal(model.isDirty(), false);
  model.reset();
  assert.deepEqual(model.store.get().selected, []);
  assert.equal(count(api, "presets"), 1, "새로 발행해도 목록은 다시 부르지 않는다");
});

test("BR4.3 다섯 개를 고르면 안 고른 단추가 모두 막히고 「프리셋은 5개까지 고를 수 있습니다.」가 목록 위 aria-live 칸에 한 번 보이며 6번째는 골라지지 않는다", async () => {
  const six = [P1, P2, P3, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"]
    .map((id) => preset(id, { itemCount: 1, textLength: 100 }));
  const special = [preset("77777777-7777-4777-8777-777777777777", { itemCount: 0, textLength: 0 }), preset("88888888-8888-4888-8888-888888888888", { itemCount: 1, textLength: 70_000, overLimit: true })];
  const api = fakeClients({ presets: [presetList([...six, ...special])] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  for (const item of six) model.togglePreset(item.presetId);
  assert.equal(model.store.get().selected.length, 5);
  const html = pickerHtml(model.store.get().presets.items, model.store.get().selected);
  assert.equal((html.match(/프리셋은 5개까지 고를 수 있습니다\./g) ?? []).length, 1);
  assert.match(html, new RegExp(`<p[^>]*aria-live="polite"[^>]*>${PRESETS_FULL_TEXT}</p>`));
  assert.match(optionOf(html, six[5].presetId), /aria-pressed="false" disabled=""/);
  assert.doesNotMatch(optionOf(html, six[5].presetId), /publish-preset-reason/);
  assert.match(optionOf(html, special[0].presetId), /담긴 자료가 없어 고를 수 없습니다/, "항목 0개 이유는 그대로 보인다");
  assert.doesNotMatch(optionOf(html, special[1].presetId), /60,000자/, "상한 이유는 숨긴다");
  assert.match(optionOf(html, six[0].presetId), /aria-pressed="true"(?![^>]*disabled)/, "고른 단추는 뺄 수 있다");
  // 4개면 안내 칸은 비어 있다(칸은 늘 있다).
  model.remove(0);
  assert.match(pickerHtml(model.store.get().presets.items, model.store.get().selected), /aria-live="polite" data-testid="publish-presets-full"><\/p>/);
});

test("BR4.4 프리셋 목록: 불러오는 중·없음(<프리셋 만들러 가기>만)·실패([다시 불러오기], 0개로 보이지 않음)를 구분하고 다시 불러온다", async () => {
  const api = fakeClients({ presets: [LIST_FAILED, presetList([])] });
  const model = createPublishModel(api, passthroughConsent, deps());
  assert.match(pickerHtml([], [], { presets: model.store.get().presets }), /role="status">프리셋 목록을 불러오고 있습니다\./);
  await model.open();
  const failed = pickerHtml([], [], { presets: model.store.get().presets });
  assert.match(failed, /role="alert"[^>]*><p>프리셋 목록을 불러오지 못했습니다\.<\/p><button[^>]*data-testid="publish-presets-retry"[^>]*>다시 불러오기</);
  assert.doesNotMatch(failed, /publish-presets-empty|아직 만든 프리셋/);
  await model.loadPresets();
  const empty = pickerHtml([], [], { presets: model.store.get().presets });
  assert.match(empty, /data-testid="publish-presets-empty">아직 만든 프리셋이 없습니다\. <a href="\/presets" data-testid="publish-presets-create-link">프리셋 만들러 가기<\/a>/);
  assert.doesNotMatch(empty, /publish-preset-option/);
  assert.equal(count(api, "presets"), 2);
});

test("BR4.1 [다음]: 프리셋 0개면 「프리셋을 하나 이상 골라 주세요.」를 보이고 확인 단계로 가지 않는다", async () => {
  const api = fakeClients({ presets: [presetList(defaultPresets())] });
  const model = createPublishModel(api, passthroughConsent, deps());
  await model.open();
  model.setTitle("제목");
  assert.equal(model.toConfirm(), false);
  assert.deepEqual(model.store.get().status, { kind: "invalid", messages: ["프리셋을 하나 이상 골라 주세요."] });
  assert.equal(model.store.get().step, "edit");
  model.togglePreset(P1);
  assert.equal(model.store.get().status.kind, "idle", "고르면 검사 거부 안내는 지운다");
});

test("BR4.5 확인 단계: 제목·비밀번호·만료와 「고른 프리셋과 순서」를 고른 순서대로 보이고, 자료 목록·작성자 설명 없는 Catch 안내·공개 전환 안내는 없다", () => {
  const html = renderToStaticMarkup(createElement(PublishConfirmView, {
    presets: chosen([P2, "포트폴리오"], [P1, "<b>자기소개서</b>"]), title: " 지원용 ", usePassword: true, submitting: false, lockSeconds: 0, statusLines: null,
    onBack: noop, onSubmit: noop,
  }));
  assert.match(html, /<dt>제목<\/dt><dd>지원용<\/dd>/);
  assert.match(html, /<dt>고른 프리셋과 순서<\/dt><dd><ol[^>]*data-testid="publish-confirm-presets"><li>포트폴리오<\/li><li>&lt;b&gt;자기소개서&lt;\/b&gt;<\/li><\/ol>/);
  assert.ok(html.includes('data-testid="publish-confirm-password">설정됨<'));
  assert.ok(html.includes(EXPIRY_NOTICE));
  assert.doesNotMatch(html, /작성자 설명이 없는 Catch|publish-confirm-description-notice|publish-confirm-private-notice|항목 \(/);
  assert.ok(!html.includes(PRIVATE_CATCH_NOTICE));
  assert.match(html, /data-testid="publish-submit"(?![^>]*disabled)/);
  const submitting = renderToStaticMarkup(createElement(PublishConfirmView, {
    presets: chosen([P1, "A"]), title: "t", usePassword: false, submitting: true, lockSeconds: 0, statusLines: null, onBack: noop, onSubmit: noop,
  }));
  assert.match(submitting, /data-testid="publish-submit"[^>]*disabled=""/);
  assert.ok(submitting.includes('data-testid="publish-submitting"'));
});

test("BR4.6 409 CATCH_PRIVATE blockedSources 한 줄: 목록을 한 번 다시 불러와 「‘P’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다.」를 보이고 입력·고른 프리셋을 남긴 채 편집 단계로 간다", async () => {
  const reloaded = defaultPresets().map((item) => item.presetId === P1
    ? { ...item, unpublishableCount: 1, unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "Catch C", reason: "PRIVATE" }] } : item);
  const { api, model } = await readyModel({
    presets: [presetList(defaultPresets()), presetList(reloaded)],
    publish: [apiError(409, "CATCH_PRIVATE", { details: { blockedSources: [{ presetId: P1, kind: "CATCH", sourceId: C1 }] } })],
  });
  model.store.set((prev) => ({ ...prev, usePassword: true, password: "secret-pass-1" }));
  await model.submit();
  const state = model.store.get();
  assert.equal(count(api, "presets"), 2, "목록은 한 번만 다시 부른다(NFR6.6)");
  assert.equal(count(api, "publish"), 1, "자동으로 다시 발행하지 않는다");
  assert.equal(state.step, "edit");
  assert.deepEqual(state.selected.map((entry) => entry.presetId), [P1, P2], "막힌 프리셋도 고른 목록에 남는다");
  assert.equal(state.title, "  발행본 제목  ");
  assert.equal(state.password, "secret-pass-1");
  assert.deepEqual(publishStatusLines(state.status, state.blockedLines), {
    tone: "alert", lines: [PUBLISH_FAILED_TEXT, "비공개 Catch는 발행할 수 없습니다.", "‘자기소개서’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다."],
  });
  // 새 목록으로 단추 막힘도 다시 정한다. 고른 프리셋은 뺄 수 있게 막지 않는다.
  const html = pickerHtml(state.presets.items, state.selected);
  assert.match(optionOf(html, P1), /aria-pressed="true"(?![^>]*disabled)/);
  const form = renderToStaticMarkup(createElement(PublishFormView, {
    title: state.title, usePassword: true, password: state.password, disabled: false, statusLines: publishStatusLines(state.status, state.blockedLines),
    onTitle: noop, onUsePassword: noop, onPassword: noop, onNext: noop,
  }));
  assert.match(form, /role="alert"[^>]*data-testid="publish-status"><p>발행되지 않았습니다<\/p><p>비공개 Catch는 발행할 수 없습니다\.<\/p><p>‘자기소개서’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다\.<\/p>/);
});

test("BR4.6 이름을 못 찾으면 자료 자리에 종류(Catch·텍스트 자료·PDF 자료), 프리셋 자리에 「고른 프리셋」을 쓰고, 다시 불러오기가 실패하면 지금 목록으로 찾는다", async () => {
  const presets = [preset(P1, { name: "<b>P</b>", unpublishableItems: [{ kind: "PDF_MATERIAL", sourceId: "s-1", title: "포트폴리오.pdf", reason: "EXTRACTION_INCOMPLETE" }] })];
  assert.deepEqual(blockedSourceLines([
    { presetId: P1, kind: "PDF_MATERIAL", sourceId: "s-1" }, { presetId: P1, kind: "CATCH", sourceId: "s-2" },
    { presetId: P1, kind: "TEXT_MATERIAL", sourceId: "s-3" }, { presetId: P3, kind: "CATCH", sourceId: "s-4" },
  ], presets), [
    "‘<b>P</b>’ 프리셋의 ‘포트폴리오.pdf’ 때문에 발행할 수 없습니다.", "‘<b>P</b>’ 프리셋의 Catch 때문에 발행할 수 없습니다.",
    "‘<b>P</b>’ 프리셋의 텍스트 자료 때문에 발행할 수 없습니다.", "고른 프리셋의 Catch 때문에 발행할 수 없습니다.",
  ]);
  assert.ok(blockedSourceLines([{ presetId: P3, kind: "CATCH", sourceId: "x" }], []).every((line) => !line.includes("‘’")), "빈 따옴표를 만들지 않는다");

  // 다시 불러오기 실패: 고르기 전 목록(지금 가진 목록)으로 이름을 찾는다. 이름은 글자로만 그린다.
  const before = [preset(P1, { name: "<b>자기소개서</b>", unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "Catch C", reason: "PRIVATE" }] }), preset(P2)];
  const { api, model } = await readyModel({
    presets: [presetList(before), LIST_FAILED],
    publish: [apiError(409, "SOURCE_RESTRICTED", { details: { blockedSources: [{ presetId: P1, kind: "CATCH", sourceId: C1 }] } })],
  });
  await model.submit();
  const state = model.store.get();
  assert.equal(count(api, "presets"), 2);
  assert.equal(state.presets.state, "error");
  assert.deepEqual(state.blockedLines, ["‘<b>자기소개서</b>’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다."]);
  const form = renderToStaticMarkup(createElement(PublishFormView, {
    title: state.title, usePassword: false, password: "", disabled: false, statusLines: publishStatusLines(state.status, state.blockedLines),
    onTitle: noop, onUsePassword: noop, onPassword: noop, onNext: noop,
  }));
  assert.ok(form.includes("‘&lt;b&gt;자기소개서&lt;/b&gt;’ 프리셋의"));
  assert.doesNotMatch(form, /<b>/);
});

test("404·400 presetIds: 안내를 보이고 목록을 다시 불러오며, 404는 새 목록에 없는 프리셋을 고른 목록에서 뺀다", async () => {
  const gone = await readyModel({
    presets: [presetList(defaultPresets()), presetList(defaultPresets().filter((item) => item.presetId !== P2))],
    publish: [apiError(404, "RESOURCE_UNAVAILABLE")],
  });
  await gone.model.submit();
  assert.equal(count(gone.api, "presets"), 2);
  assert.deepEqual(gone.model.store.get().selected.map((entry) => entry.presetId), [P1]);
  assert.equal(gone.model.store.get().step, "edit");
  assert.deepEqual(publishStatusLines(gone.model.store.get().status).lines, [PUBLISH_FAILED_TEXT, SOURCE_UNAVAILABLE_TEXT]);

  const invalid = await readyModel({
    publish: [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "presetIds[0]", reason: "emptyPreset" }] } })],
  });
  await invalid.model.submit();
  assert.equal(count(invalid.api, "presets"), 2);
  assert.deepEqual(invalid.model.store.get().selected.map((entry) => entry.presetId), [P1, P2], "400은 고른 목록을 바꾸지 않는다");
  assert.equal(invalid.model.store.get().step, "edit");
  assert.deepEqual(publishStatusLines(invalid.model.store.get().status).lines, [PUBLISH_FAILED_TEXT, PRESET_INVALID_TEXT]);

  // 404 뒤 다시 불러오기가 실패하면 고른 목록을 그대로 둔다(무엇이 없어졌는지 모름).
  const unknown = await readyModel({ presets: [presetList(defaultPresets()), LIST_FAILED], publish: [apiError(404, "RESOURCE_UNAVAILABLE")] });
  await unknown.model.submit();
  assert.deepEqual(unknown.model.store.get().selected.map((entry) => entry.presetId), [P1, P2]);
});

test("모델: 그 밖의 실패 응답마다 고른 프리셋·순서·제목을 남기고, 입력을 고쳐야 하는 실패만 편집 단계로 돌아가며 목록을 다시 부르지 않는다", async () => {
  const cases = [
    [apiError(400, "VALIDATION_FAILED", { details: { violations: [{ field: "title", reason: "maxLength" }] } }), "validation", "edit"],
    [apiError(403, "AI_CONSENT_REQUIRED"), "consent-required", "confirm"],
    [apiError(429, "DAILY_LIMIT_REACHED"), "daily-limit", "confirm"],
    [apiError(429, "RATE_LIMITED"), "rate-limited", "confirm"],
    [apiError(401, "AUTH_INVALID"), "login-expired", "confirm"],
    [apiError(500, "INTERNAL_ERROR"), "failed", "confirm"],
    [LOOKUP_FAILED, "failed", "confirm"],
  ];
  for (const [response, kind, step] of cases) {
    const { api, model } = await readyModel({ publish: [response] });
    const before = model.store.get();
    await model.submit();
    const after = model.store.get();
    assert.equal(after.status.failure.kind, kind);
    assert.equal(after.step, step, kind);
    assert.deepEqual(after.selected, before.selected, kind);
    assert.equal(after.title, "  발행본 제목  ", kind);
    assert.equal(after.result, null, kind);
    assert.equal(after.retryAt, null, kind);
    assert.equal(after.blockedLines, null, kind);
    assert.equal(count(api, "presets"), 1, kind);
    assert.equal(model.isDirty(), true, kind);
    assert.equal(publishStatusLines(after.status).lines[0], PUBLISH_FAILED_TEXT);
  }
  // 막힘 줄은 다음 발행 요청을 보낼 때 비운다.
  const { model } = await readyModel({ publish: [apiError(409, "CATCH_PRIVATE", { details: { blockedSources: [{ presetId: P1, kind: "CATCH", sourceId: C1 }] } }), success(published())] });
  await model.submit();
  assert.equal(model.store.get().blockedLines.length, 1);
  model.remove(0);
  assert.equal(model.toConfirm(), true);
  await model.submit();
  assert.equal(model.store.get().blockedLines, null);
  assert.equal(model.store.get().step, "done");
});

test("모델: 빈도 초과(429 RATE_LIMITED, Retry-After)는 남은 초 동안 [발행]을 막고 자동으로 다시 보내지 않으며, 시간이 지나면 사용자가 다시 누를 수 있다", async () => {
  const d = deps({ now: 1_000_000 });
  const { api, model } = await readyModel({ publish: [apiError(429, "RATE_LIMITED", { retryAfterSeconds: 30 }), success(published())] }, d);
  await model.submit();
  assert.equal(model.store.get().step, "confirm");
  assert.equal(model.store.get().retryAt, 1_000_000 + 30_000);
  assert.equal(model.retryWaitSeconds(), 30);
  assert.equal(model.canSubmit(), false);
  await model.submit();
  d.clock += 30_000;
  assert.equal(model.canSubmit(), true);
  assert.equal(count(api, "publish"), 1, "시간이 지나도 자동으로 보내지 않는다");
  await model.submit();
  assert.equal(count(api, "publish"), 2);
  assert.equal(model.store.get().step, "done");
  const locked = renderToStaticMarkup(createElement(PublishConfirmView, {
    presets: chosen([P1, "A"]), title: "t", usePassword: false, submitting: false, lockSeconds: 12,
    statusLines: publishStatusLines({ kind: "failed", failure: { kind: "rate-limited", retryAfterSeconds: 12 } }), onBack: noop, onSubmit: noop,
  }));
  assert.match(locked, /data-testid="publish-submit"[^>]*disabled=""/);
  assert.ok(locked.includes("12초 뒤에 [발행]을 누를 수 있습니다."));
});

test("모델: 발행 중에는 다시 보내거나 고르지 않고, 동의 창을 닫거나 기록이 실패하면 보내지 않은 채 입력을 남기며, 로그인이 바뀐 뒤 응답은 반영하지 않는다", async () => {
  const pending = deferred();
  const { api, model } = await readyModel({ publish: [pending] });
  const submitting = model.submit();
  assert.equal(model.store.get().status.kind, "submitting");
  await model.submit();
  model.backToEdit();
  model.setTitle("바꾸려 함");
  assert.equal(model.store.get().title, "  발행본 제목  ");
  pending.resolve(success(published()));
  await submitting;
  assert.equal(count(api, "publish"), 1);
  assert.equal(model.store.get().step, "done");

  const declined = await readyModel({}, deps(), async () => ({ kind: "declined" }));
  await declined.model.submit();
  assert.match(publishStatusLines(declined.model.store.get().status).lines.join(" "), /동의하지 않아/);
  assert.equal(declined.model.store.get().selected.length, 2);
  const consentFailed = await readyModel({}, deps(), async () => ({ kind: "consent-failed", result: apiError(500, "INTERNAL_ERROR") }));
  await consentFailed.model.submit();
  assert.equal(consentFailed.model.store.get().status.kind, "consent-failed");

  const late = deferred();
  const d = deps();
  const changed = await readyModel({ publish: [late] }, d);
  const saving = changed.model.submit();
  d.token = "session-b";
  late.resolve(success(published()));
  await saving;
  assert.equal(changed.model.store.get().step, "confirm");
  // 로그인이 바뀐 뒤 온 프리셋 목록도 버린다.
  const slow = deferred();
  const d2 = deps();
  const stale = createPublishModel(fakeClients({ presets: [slow] }), passthroughConsent, d2);
  const opening = stale.open();
  d2.token = "session-b";
  slow.resolve(presetList(defaultPresets()));
  await opening;
  assert.equal(stale.store.get().presets.state, "loading");
});

test("완료 화면: [링크 열기]는 [URL 복사]와 같은 url을 새 탭 속성으로 열고 ACTIVE일 때만 보이며, [URL 복사]·상세 이동은 상태와 관계없이 있다", () => {
  const active = renderToStaticMarkup(createElement(PublishDoneView, { result: { ...published({ passwordProtected: true }), title: "지원용" }, onNew() {} }));
  assert.match(active, new RegExp(`<a[^>]*href="${URL_OK}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*data-testid="publication-open-link"`));
  assert.ok(active.includes(`data-testid="publish-result-url">${URL_OK}<`));
  assert.ok(active.includes(`href="/publications/${PUB}"`));
  assert.ok(active.includes("비밀번호도 따로 전달해야 합니다"));
  for (const state of ["STOPPED", "EXPIRED"]) {
    const closed = renderToStaticMarkup(createElement(PublishDoneView, { result: { ...published({ state }), title: "지원용" }, onNew() {} }));
    assert.doesNotMatch(closed, /publication-open-link/, state);
    assert.ok(closed.includes('data-testid="publication-copy-url"'), state);
  }
});

test("고르기·고른 목록·입력 화면: 단추에 이름·「항목 N개 · M자」·이유가 글자로 있고 이름은 태그로 그리지 않으며, 순서 단추 이름은 「(이름) 위로」, 공개 전환 안내는 없다", () => {
  const presets = [preset(P1, { name: "<b>자기소개서</b>", itemCount: 4, textLength: 12_300 }), preset(P2, { name: "빈 프리셋", itemCount: 0, textLength: 0 }),
    preset(P3, { name: "옛 프리셋", unpublishableCount: 1, unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "<img src=x onerror=alert(1)>", reason: "PRIVATE" }] })];
  const html = pickerHtml(presets, chosen([P1, "<b>자기소개서</b>"]));
  assert.match(html, /<h2 id="publish-presets-title">프리셋 고르기<\/h2>/);
  assert.match(optionOf(html, P1), /aria-pressed="true".*&lt;b&gt;자기소개서&lt;\/b&gt;.*항목 4개 · 12,300자/s);
  assert.match(optionOf(html, P2), /aria-pressed="false" disabled="".*항목 0개 · 0자.*data-testid="publish-preset-reason">담긴 자료가 없어 고를 수 없습니다</s);
  assert.ok(optionOf(html, P3).includes("발행할 수 없는 자료가 있습니다: &lt;img src=x onerror=alert(1)&gt;"));
  assert.doesNotMatch(html, /<b>|<img/);
  assert.ok(!html.includes(PRIVATE_CATCH_NOTICE));
  const selected = renderToStaticMarkup(createElement(SelectedPresetsView, {
    presets: chosen([P1, "<b>자기소개서</b>"], [P2, "포트폴리오"]), disabled: false, onMoveUp: noop, onMoveDown: noop, onRemove: noop,
  }));
  assert.match(selected, /<h2 id="publish-selected-title">고른 프리셋과 순서 \(2\/5\)<\/h2>/);
  assert.match(selected, /data-testid="publish-move-up"[^>]*disabled=""[^>]*aria-label="&lt;b&gt;자기소개서&lt;\/b&gt; 위로"/);
  assert.match(selected, /data-testid="publish-move-down"[^>]*disabled=""[^>]*aria-label="포트폴리오 아래로"/);
  assert.match(selected, /aria-label="포트폴리오 빼기"/);
  assert.match(renderToStaticMarkup(createElement(SelectedPresetsView, { presets: [], disabled: false, onMoveUp: noop, onMoveDown: noop, onRemove: noop })),
    /고른 프리셋과 순서 \(0\/5\).*data-testid="publish-selected-empty">아직 고른 프리셋이 없습니다\./s);
  const form = renderToStaticMarkup(createElement(PublishFormView, {
    title: "제목", usePassword: true, password: "secret-pass-1", disabled: false, statusLines: null, onTitle: noop, onUsePassword: noop, onPassword: noop, onNext: noop,
  }));
  for (const id of ["publish-form", "publish-title-input", "publish-use-password", "publish-password-input", "publish-to-confirm"]) assert.ok(form.includes(`data-testid="${id}"`), id);
  assert.doesNotMatch(form, />secret-pass-1</);
  const screen = renderToStaticMarkup(createElement(PublishScreen, { api: fakeClients(), deps: deps(), consent: passthroughConsent }));
  assert.match(screen, /<h1>발행<\/h1>/);
  assert.ok(screen.includes('data-testid="publish-presets"'));
  assert.doesNotMatch(screen, /발행할 자료 고르기|저장소마다 3~5개를 권합니다|publish-sources/);
});

test("발행 중에는 고르기·순서를 바꾸지 않고, 막힘 줄은 같은 프리셋·자료의 줄을 하나씩 보인다(줄 열쇠가 겹쳐도 사라지지 않음)", async () => {
  const pending = deferred();
  const { model } = await readyModel({ publish: [pending] });
  const submitting = model.submit();
  model.backToEdit();
  model.togglePreset(P3);
  model.moveUp(1);
  model.remove(0);
  assert.deepEqual(model.store.get().selected.map((entry) => entry.presetId), [P1, P2]);
  pending.resolve(success(published()));
  await submitting;
  await tick();
  const lines = { tone: "alert", lines: [PUBLISH_FAILED_TEXT, "같은 줄", "같은 줄"] };
  const form = renderToStaticMarkup(createElement(PublishFormView, {
    title: "", usePassword: false, password: "", disabled: false, statusLines: lines, onTitle: noop, onUsePassword: noop, onPassword: noop, onNext: noop,
  }));
  assert.equal((form.match(/<p>같은 줄<\/p>/g) ?? []).length, 2);
});
