// 발행 프리셋 U2 — 상단 메뉴·프리셋 목록·프리셋 편집 화면 시험(M1~M3, BR1~BR3, BR5.1의 web 쪽, NFR1·NFR3·NFR5·NFR6).
//
// 먼저 정한 시나리오·기대 결과·실패 조건은 unit-test-instructions.md 「시나리오」의 메뉴·목록·편집·저장·이탈·지우기 묶음이다(Step 2).
// 세부 시험 코드는 구현 뒤 썼다(team.md Testing Posture: custom). Build and Test 되돌아가기 1(2026-11-21)의 시나리오는
// code-generation-plan.md Step 12 표다(첫 저장 뒤 라우터 이동·「저장했습니다.」 한 번 넘기기, 다시 열기 뒤 결과 반영).
// - 기대: 메뉴 순서와 「프리셋」만 현재 자리, 목록 한 번 부르기와 상태 넷, 편집 화면 요청 수 고정, 담기·빼기·순서·20개·60,000자 막힘,
//         세기 실패는 막지 않음, 늦은 응답 버림, 저장 이름 검사·결과 표·첫 저장 뒤 PUT, 저장 중 모두 막힘, 지우기 확인·실패, 이름은 글자로만.
// - 실패로 보는 것: 「발행본」이 함께 켜짐, 실패가 0개로 보임, 막히지 않음, 두 번 담김, 세기 실패로 단추가 모두 막힘, 옛 목록이 덮어씀,
//         요청이 감(이름 오류), POST가 다시 감, 입력이 사라짐, 확인 없이 지워짐, 태그로 그려짐.
//
// 원본 tsx를 변환해 불러온다(`u2-render.mjs`). 서버는 계약 모양 대역(api/docs/presets.md)이며 실제 브라우저·api·DB 검증이 아니다.
// 320px 폭 헤더·편집 화면 확인은 Build and Test에서 브라우저로 한다.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

globalThis.__presetsNav = { pathname: "/presets", router: { push() {}, replace() {} } };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") {
      return {
        url: "data:text/javascript,export const usePathname = () => globalThis.__presetsNav.pathname; export const useRouter = () => globalThis.__presetsNav.router;",
        shortCircuit: true, format: "module",
      };
    }
    return nextResolve(specifier, context);
  },
});

const { routes, presetEditPath } = await load("lib/routes.ts");
const { safeNextPath } = await load("lib/member-navigation.ts");
const presetsApi = await load("features/presets/presets-api.ts");
const {
  createPresetsApi, presetSaveFailureOf, presetSaveFailureText, ITEMS_FULL_TEXT, TOTAL_OVER_TEXT, UNPUBLISHABLE_REASON_TEXT, PRESET_LIMIT_TEXT,
} = presetsApi;
const { createCatchApi } = await load("features/assets/catch-api.ts");
const { MemberHeader } = await load("components/header/member-header.tsx");
const { PresetsListView, presetSummaryLine } = await load("features/presets/presets-list-view.tsx");
const { createPresetsListModel } = await load("features/presets/presets-list-screen.tsx");
const { createPresetEditorModel, createSavedNoticeHandOff } = await load("features/presets/preset-editor-screen.tsx");
const { PresetEditorView, LINK_NOTICE_TEXT, OVER_LIMIT_TEXT, LENGTH_UNKNOWN_TEXT } = await load("features/presets/preset-editor-view.tsx");
const { UNSAVED_MESSAGE } = await load("features/profile/use-unsaved-guard.ts");

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const C1 = "c1111111-1111-4111-8111-111111111111";
const C2 = "c2222222-2222-4222-8222-222222222222";
const C3 = "c3333333-3333-4333-8333-333333333333";
const M1 = "a1111111-1111-4111-8111-111111111111";
const PDF_DONE = "f1111111-1111-4111-8111-111111111111";
const PDF_PENDING = "f2222222-2222-4222-8222-222222222222";
const AT = "2026-11-20T01:02:03.456Z";
const LOOKUP_FAILED = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

const summary = (presetId, overrides = {}) => ({
  presetId, name: "자기소개서", itemCount: 4, textLength: 12_300, overLimit: false, unpublishableCount: 0, unpublishableItems: [], ...overrides,
});
const measured = (kind, sourceId, textLength = 1000, unpublishableReason = null, title = `자료 ${sourceId.slice(0, 2)}`) =>
  ({ kind, sourceId, title, textLength, unpublishableReason });
/** 본인 Catch 목록 응답 항목 중 화면이 읽는 칸만 둔 합성 Catch(공개·확인·보호 아님). */
const catchAsset = (catchId, { title = `Catch ${catchId.slice(0, 2)}`, repositoryId = "repo-1", hasAuthorDescription = true, mismatch = false } = {}) => ({
  catchId, title, visibility: "PUBLIC", mismatch, restriction: "NONE", repositoryId, hasAuthorDescription,
  confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
});
const catchPage = (items, nextCursor = null) => ({ kind: "success", status: 200, data: { items, page: { nextCursor } } });
const materialPage = (items, nextCursor = null) => ({ kind: "ok", value: { items, page: { nextCursor } } });
const material = (textMaterialId, title = "자기소개 본문") => ({ textMaterialId, title, updatedAt: AT });
const pdfPage = (items, nextCursor = null) => ({ kind: "ok", value: { items, page: { nextCursor } } });
const pdf = (pdfMaterialId, extractionState = "DONE") => ({
  pdfMaterialId, title: `PDF ${extractionState}`, fileSizeBytes: 2048, pageCount: extractionState === "DONE" ? 2 : null, extractionState, failureCode: null,
});
const detailOf = (items, name = "자기소개서") => ({ kind: "ok", value: { presetId: P1, name, items } });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * 편집 화면 대역. 응답은 이름별 대기열에서 차례로 꺼낸다(값 또는 deferred). 세기는 대기열이 비면 `lengths`(자료 ID → 글자 수, 없으면 1000)로 답한다.
 * 저장소 목록은 응답을 정하지 않으면 실패다(이름만 빠짐).
 */
function fakeEditor(responses = {}) {
  const calls = [];
  const queue = Object.fromEntries(Object.entries(responses).filter(([key]) => key !== "lengths").map(([key, value]) => [key, [...value]]));
  const lengths = responses.lengths ?? {};
  const next = (name) => {
    const value = queue[name]?.shift();
    if (value === undefined) throw new Error(`no response for ${name}`);
    return value && typeof value.promise === "object" ? value.promise : Promise.resolve(value);
  };
  return {
    calls,
    presets: {
      get: (presetId, signal) => { calls.push({ name: "get", presetId, signal }); return next("get"); },
      create: (draft) => { calls.push({ name: "create", body: structuredClone(draft) }); return next("create"); },
      update: (presetId, draft) => { calls.push({ name: "update", presetId, body: structuredClone(draft) }); return next("update"); },
      remove: (presetId) => { calls.push({ name: "remove", presetId }); return next("remove"); },
      measure: (items, signal) => {
        calls.push({ name: "measure", items: structuredClone(items), signal });
        if (queue.measure?.length) return next("measure");
        return Promise.resolve({ kind: "ok", value: { items: items.map((item) => measured(item.kind, item.sourceId, lengths[item.sourceId] ?? 1000)) } });
      },
    },
    catches: { list: (filter, cursor, signal) => { calls.push({ name: "catches", filter, cursor, signal }); return next("catches"); } },
    materials: { list: (cursor, signal) => { calls.push({ name: "materials", cursor, signal }); return next("materials"); } },
    pdfs: { list: (cursor, signal) => { calls.push({ name: "pdfs", cursor, signal }); return next("pdfs"); } },
    repositories: { repositories: (signal) => {
      calls.push({ name: "repositories", signal });
      return queue.repositories?.length ? next("repositories") : Promise.resolve(LOOKUP_FAILED);
    } },
  };
}

/** 편집 화면 의존 대역. 이동(`replace`)은 기록만 하고, 「저장했습니다.」 넘기기는 시험마다 새로 만들어 시험끼리 섞이지 않는다. */
function editorDeps({ answer = true, savedNotice = createSavedNoticeHandOff() } = {}) {
  const d = { token: "session-a", answer, confirms: [], moves: [], savedNotice };
  d.session = () => d.token;
  d.confirm = (message) => { d.confirms.push(message); return d.answer; };
  d.replace = (path) => { d.moves.push(path); };
  return d;
}

const defaultLists = () => ({
  catches: [catchPage([catchAsset(C1), catchAsset(C2), catchAsset(C3)])],
  materials: [materialPage([material(M1)])],
  pdfs: [pdfPage([pdf(PDF_DONE), pdf(PDF_PENDING, "PENDING")])],
});
const count = (api, name) => api.calls.filter((call) => call.name === name).length;

async function openEditor(responses = {}, { presetId = null, deps = editorDeps() } = {}) {
  const api = fakeEditor({ ...defaultLists(), ...responses });
  const model = createPresetEditorModel(api, presetId, deps);
  await model.open();
  return { api, model, deps };
}

const noop = () => {};
const editorHtml = (model, repositories = []) => renderToStaticMarkup(createElement(PresetEditorView, {
  state: model.store.get(), repositories, onRetryDetail: noop, onName: noop, onWrittenOnly: noop, onRetrySources: noop, onMoreCatches: noop,
  onMoreMaterials: noop, onMorePdfs: noop, onToggle: noop, onMoveUp: noop, onMoveDown: noop, onRemove: noop, onSave: noop, onDelete: noop,
  onReloadAfterSave: noop,
}));
const optionOf = (html, id) => new RegExp(`<button[^>]*data-source-id="${id}"[^>]*>.*?</button>`, "s").exec(html)?.[0] ?? "";
const listHtml = (state, presets = []) => renderToStaticMarkup(createElement(PresetsListView, { state, presets, onRetry: noop, onNew: noop }));

// ── 프리셋 호출 ────────────────────────────────────────────────────────────────────────────────────────────

test("호출: 목록·상세·만들기·고치기·지우기·세기의 경로·방법·몸통이 계약(P-1)과 같고 ID는 인코딩한다", async () => {
  const calls = [];
  const replies = [
    { kind: "success", status: 200, data: { presets: [summary(P1)] } },
    { kind: "success", status: 200, data: { presetId: P1, name: "자기소개서", items: [measured("CATCH", C1)] } },
    { kind: "success", status: 201, data: { presetId: P2 } },
    { kind: "success", status: 200, data: { presetId: P1 } },
    { kind: "success", status: 204, data: null },
    { kind: "success", status: 200, data: { items: [measured("CATCH", C1, 77)] } },
  ];
  const api = createPresetsApi(async (path, request) => { calls.push({ path, method: request.method, body: request.body }); return replies.shift(); });
  assert.deepEqual(await api.list(), { kind: "ok", value: { presets: [summary(P1)] } });
  assert.equal((await api.get(P1)).kind, "ok");
  const items = [{ kind: "CATCH", sourceId: C1, title: "버려질 칸", textLength: 3, reason: null }];
  assert.deepEqual(await api.create({ name: "이름", items }), { kind: "ok", value: { presetId: P2 } });
  assert.equal((await api.update(P1, { name: "이름", items })).kind, "ok");
  assert.deepEqual(await api.remove(P1), { kind: "ok", value: null });
  assert.equal((await api.measure([{ kind: "CATCH", sourceId: C1 }])).value.items[0].textLength, 77);
  assert.deepEqual(calls, [
    { path: "/presets", method: "GET", body: undefined },
    { path: `/presets/${P1}`, method: "GET", body: undefined },
    { path: "/presets", method: "POST", body: { name: "이름", items: [{ kind: "CATCH", sourceId: C1 }] } },
    { path: `/presets/${P1}`, method: "PUT", body: { name: "이름", items: [{ kind: "CATCH", sourceId: C1 }] } },
    { path: `/presets/${P1}`, method: "DELETE", body: undefined },
    { path: "/presets/measure", method: "POST", body: { items: [{ kind: "CATCH", sourceId: C1 }] } },
  ]);
  const odd = createPresetsApi(async (path) => { calls.push(path); return { kind: "success", status: 200, data: { presetId: "a/b", name: "x", items: [] } }; });
  await odd.get("a/b");
  assert.equal(calls.at(-1), "/presets/a%2Fb");
  assert.equal(presetEditPath("a/b"), "/presets/a%2Fb");
});

test("호출: 모양이 틀린 200·다른 상태 코드·예외는 모르는 실패이고, 404는 찾을 수 없음, 세기 응답 순서가 다르면 실패다", async () => {
  const reply = (result) => createPresetsApi(async () => result);
  for (const data of [{ presets: [{ ...summary(P1), name: "" }] }, { presets: [{ ...summary(P1), itemCount: -1 }] }, { presets: [{ ...summary(P1),
    unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "t", reason: "SOMETHING" }] }] }, {}]) {
    assert.deepEqual(await reply({ kind: "success", status: 200, data }).list(), { kind: "failed", failure: "failed" });
  }
  assert.deepEqual(await reply({ kind: "api-error", status: 404, code: "RESOURCE_UNAVAILABLE", message: "m" }).get(P1), { kind: "failed", failure: "not-found" });
  assert.deepEqual(await reply({ kind: "success", status: 200, data: { presetId: P2, name: "x", items: [] } }).get(P1), { kind: "failed", failure: "failed" });
  assert.deepEqual(await createPresetsApi(async () => { throw new Error("network"); }).list(), { kind: "failed", failure: "failed" });
  assert.deepEqual(await reply({ kind: "success", status: 200, data: { items: [measured("CATCH", C2)] } }).measure([{ kind: "CATCH", sourceId: C1 }]),
    { kind: "failed", failure: "failed" });
  assert.deepEqual(await reply({ kind: "success", status: 200, data: { presetId: P1 } }).create({ name: "x", items: [] }), { kind: "failed", failure: "failed" },
    "만들기는 201만 성공이다");
});

test("저장 실패 구분: 400 name·items maxTotalLength·그 밖 items, 409 PRESET_LIMIT_REACHED, 404, 5xx·끊김을 나누고 글은 기능 설계 결과 표와 같다", () => {
  const error = (status, code, violations) => ({ kind: "api-error", status, code, message: "m", ...(violations ? { details: { violations } } : {}) });
  const cases = [
    [error(400, "VALIDATION_FAILED", [{ field: "name", reason: "maxLength" }]), "name", "이름을 1~50자로 써 주세요."],
    [error(400, "VALIDATION_FAILED", [{ field: "items", reason: "maxTotalLength" }]), "max-total-length", "전체 글이 60,000자를 넘어 저장할 수 없습니다. 자료를 빼 주세요."],
    [error(400, "VALIDATION_FAILED", [{ field: "items", reason: "maxItems" }]), "items", "저장하지 못했습니다. 다시 시도해 주세요."],
    [error(409, "PRESET_LIMIT_REACHED"), "limit-reached", "프리셋은 50개까지 만들 수 있습니다."],
    [error(404, "RESOURCE_UNAVAILABLE"), "not-found", "담은 자료나 프리셋을 찾을 수 없습니다. 목록을 다시 불러와 주세요."],
    [error(500, "INTERNAL_ERROR"), "failed", "저장하지 못했습니다. 다시 시도해 주세요."],
    [LOOKUP_FAILED, "failed", "저장하지 못했습니다. 다시 시도해 주세요."],
  ];
  for (const [result, failure, text] of cases) {
    assert.equal(presetSaveFailureOf(result), failure, failure);
    assert.equal(presetSaveFailureText(failure), text, failure);
  }
});

test("BR5.1 본인 Catch 호출: publishable을 켜면 쿼리에 publishable=true(걸러 보기면 authorDescription=written도), 없으면 지금 쿼리 그대로다", async () => {
  const paths = [];
  // 응답 검사(isCatch)를 통과하는 합성 Catch 한 개.
  const full = (overrides = {}) => ({
    ...catchAsset(C1), sourceRequestId: "req-1", sourceResultId: "res-1", sourceCandidateId: "cand-1", workFacts: [], subjectContribution: "",
    evidence: [], draft: { status: "NOT_GENERATED", content: null }, reflection: { status: "NOT_GENERATED", questions: [] }, sourceMode: "MOCK",
    revisitFacts: [], ...overrides,
  });
  const transport = async (path) => { paths.push(path); return { kind: "success", status: 200, data: { items: [full()], page: { nextCursor: null } } }; };
  const catches = createCatchApi(transport);
  assert.equal((await catches.list({ repositoryId: "", authorDescription: "all", publishable: true }, null)).kind, "success");
  await catches.list({ repositoryId: "", authorDescription: "written", publishable: true }, "cur");
  await catches.list({ repositoryId: "", authorDescription: "all" }, null);
  assert.deepEqual(paths, [
    "/catches?limit=20&publishable=true",
    "/catches?limit=20&authorDescription=written&publishable=true&cursor=cur",
    "/catches?limit=20",
  ]);
  // publishable로 받았는데 비공개·미확인·보호 Catch가 섞인 200은 성공으로 보지 않는다.
  const leaky = createCatchApi(async () => ({ kind: "success", status: 200, data: { items: [full({ visibility: "PRIVATE" })], page: { nextCursor: null } } }));
  assert.equal((await leaky.list({ repositoryId: "", authorDescription: "all", publishable: true }, null)).kind, "lookup-failed");
  assert.equal((await leaky.list({ repositoryId: "", authorDescription: "all" }, null)).kind, "success", "내 자산 화면은 지금처럼 받는다");
});

// ── 상단 메뉴 ────────────────────────────────────────────────────────────────────────────────────────────

test("BR1.1·BR1.2 메뉴는 「내 자산 · 텍스트 자료 · 프리셋 · 발행본 · JD 관리」이고 프리셋 주소 셋에서는 「프리셋」만 현재 자리다", () => {
  const menu = (pathname) => {
    globalThis.__presetsNav.pathname = pathname;
    const html = renderToStaticMarkup(createElement(MemberHeader, {}));
    const nav = /<nav[^>]*aria-label="주요 메뉴"[^>]*>(.*?)<\/nav>/s.exec(html)[1];
    return [...nav.matchAll(/<a([^>]*)>([^<]*)<\/a>/g)].slice(1).map(([, attributes, label]) => [label, /aria-current="page"/.test(attributes)]);
  };
  for (const pathname of ["/presets", "/presets/new", `/presets/${P1}`]) {
    assert.deepEqual(menu(pathname), [["내 자산", false], ["텍스트 자료", false], ["프리셋", true], ["발행본", false], ["JD 관리", false]], pathname);
  }
  assert.deepEqual(menu("/publications/new").filter(([, current]) => current), [["발행본", true]]);
  assert.deepEqual([routes.presets, routes.presetNew], ["/presets", "/presets/new"]);
  globalThis.__presetsNav.pathname = "/presets";
});

test("프리셋 주소는 로그인 뒤 돌아올 수 있는 회원 경로다(web README 「코드 추가 위치」의 복귀 허용 목록)", () => {
  for (const path of ["/presets", "/presets/new", `/presets/${P1}`]) assert.equal(safeNextPath(path), path, path);
  assert.equal(safeNextPath("/presetsx"), null);
});

// ── 프리셋 목록 ────────────────────────────────────────────────────────────────────────────────────────────

test("목록 모델: 목록을 한 번 부르고, 실패는 오류 상태(0개 아님)이며 다시 불러오기와 로그인이 바뀐 뒤 응답 버리기", async () => {
  const fifty = Array.from({ length: 50 }, (_, index) => summary(`p${String(index).padStart(7, "0")}-0000-4000-8000-000000000000`));
  const calls = [];
  const replies = [{ kind: "failed", failure: "failed" }, { kind: "ok", value: { presets: fifty } }];
  const d = { token: "a", session: () => d.token };
  const model = createPresetsListModel({ list: (signal) => { calls.push(signal); return Promise.resolve(replies.shift()); } }, d);
  assert.equal(model.store.get().state, "loading");
  await model.load();
  assert.deepEqual(model.store.get(), { state: "error", presets: [] });
  await model.load();
  assert.equal(model.store.get().state, "ready");
  assert.equal(model.store.get().presets.length, 50);
  assert.equal(calls.length, 2, "50개도 한 번에 받는다(쪽 나눔 없음)");
  const late = deferred();
  const stale = createPresetsListModel({ list: () => late.promise }, d);
  const loading = stale.load();
  d.token = "b";
  late.resolve({ kind: "ok", value: { presets: fifty } });
  await loading;
  assert.equal(stale.store.get().state, "loading");
});

test("BR2.2 목록 화면: 불러오는 중·없음·실패를 다른 글로 보이고, 실패에는 [다시 불러오기]만 있고 0개 안내가 없다", () => {
  assert.match(listHtml("loading"), /role="status"[^>]*>프리셋 목록을 불러오고 있습니다\./);
  assert.match(listHtml("ready"), /data-testid="presets-empty">아직 만든 프리셋이 없습니다\. \[새 프리셋\]으로 만들어 보세요\./);
  const failed = listHtml("error");
  assert.match(failed, /role="alert"[^>]*><p>프리셋 목록을 불러오지 못했습니다\.<\/p>/);
  assert.match(failed, /data-testid="presets-list-retry"[^>]*>다시 불러오기</);
  assert.doesNotMatch(failed, /presets-empty|아직 만든 프리셋/);
  assert.match(failed, /<h1>프리셋<\/h1>/);
});

test("BR2.1·NFR1 목록 줄: 이름·「항목 N개 · M자」(쉼표)·발행할 수 없는 자료 수·상한 넘음을 글자로, <고치기>는 링크이고 읽히는 이름이 「(이름) 고치기」다", () => {
  const presets = [
    summary(P1, { unpublishableCount: 1, unpublishableItems: [{ kind: "CATCH", sourceId: C1, title: "Catch C", reason: "PRIVATE" }] }),
    summary(P2, { name: "<b>x</b>", itemCount: 20, textLength: 61_200, overLimit: true }),
  ];
  assert.equal(presetSummaryLine(presets[0]), "항목 4개 · 12,300자 · 발행할 수 없는 자료 1개");
  assert.equal(presetSummaryLine(presets[1]), "항목 20개 · 61,200자 · 상한을 넘었습니다");
  assert.equal(presetSummaryLine(summary(P1, { itemCount: 3, textLength: 8100 })), "항목 3개 · 8,100자");
  const html = listHtml("ready", presets);
  assert.deepEqual([...html.matchAll(/data-testid="preset-row-summary">([^<]*)</g)].map((match) => match[1]),
    ["항목 4개 · 12,300자 · 발행할 수 없는 자료 1개", "항목 20개 · 61,200자 · 상한을 넘었습니다"]);
  assert.match(html, new RegExp(`<a href="/presets/${P1}" aria-label="자기소개서 고치기" data-testid="preset-row-edit">고치기</a>`));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"), "이름은 글자로만 그린다(BR3.11)");
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /aria-label="&lt;b&gt;x&lt;\/b&gt; 고치기"/);
});

test("BR2.3 50개면 [새 프리셋] 단추가 disabled이고 막힌 이유를 단추 설명으로 이어 보이며, 49개면 막지 않는다", () => {
  const many = (n) => Array.from({ length: n }, (_, index) => summary(`p${String(index).padStart(7, "0")}-0000-4000-8000-000000000000`));
  const full = listHtml("ready", many(50));
  assert.match(full, /<button type="button"[^>]*data-testid="presets-new-button" disabled=""[^>]*aria-describedby="presets-full-notice"[^>]*>새 프리셋<\/button>/);
  assert.match(full, new RegExp(`id="presets-full-notice"[^>]*>${PRESET_LIMIT_TEXT}<`));
  assert.equal((full.match(/data-testid="preset-row"/g) ?? []).length, 50, "50개를 한 번에 보인다");
  const room = listHtml("ready", many(49));
  assert.match(room, /data-testid="presets-new-button"(?![^>]*disabled)/);
  assert.doesNotMatch(room, /presets-full-notice/);
});

// ── 편집: 열기·요청 수 ──────────────────────────────────────────────────────────────────────────────────

test("NFR6.2 고치기 열기: 상세 1 + 저장소 목록 1 + 고르기 목록 3 + 세기 최대 3이고, Catch 목록은 publishable 조건이며 h1은 「프리셋 고치기」다", async () => {
  const { api, model } = await openEditor({ get: [detailOf([measured("CATCH", C1, 400)])] }, { presetId: P1 });
  assert.deepEqual(["get", "repositories", "catches", "materials", "pdfs"].map((name) => count(api, name)), [1, 1, 1, 1, 1]);
  assert.equal(count(api, "measure"), 3);
  assert.deepEqual(api.calls.find((call) => call.name === "catches").filter, { repositoryId: "", authorDescription: "all", publishable: true });
  // 세기는 그 쪽의 고를 수 있는 자료만: 추출 중 PDF는 보내지 않는다(NFR6.4: 한 쪽 20개 이하).
  const pdfMeasure = api.calls.find((call) => call.name === "measure" && call.items[0].kind === "PDF_MATERIAL");
  assert.deepEqual(pdfMeasure.items, [{ kind: "PDF_MATERIAL", sourceId: PDF_DONE }]);
  assert.ok(api.calls.filter((call) => call.name === "measure").every((call) => call.items.length <= 20));
  const state = model.store.get();
  assert.equal(state.load, "ready");
  assert.equal(state.name, "자기소개서");
  assert.equal(state.dirty, false);
  const html = editorHtml(model);
  assert.match(html, /<h1>프리셋 고치기<\/h1>/);
  assert.match(html, /data-testid="preset-delete"[^>]*>프리셋 지우기</);
  assert.match(html, /<a href="\/presets" data-testid="preset-editor-back-link">프리셋 목록으로<\/a>/);
  assert.ok(html.includes(LINK_NOTICE_TEXT));
  // 담기·빼기·순서는 요청하지 않는다(NFR6.5).
  const before = api.calls.length;
  model.toggle("CATCH", C2); model.moveUp(1); model.remove(0);
  assert.equal(api.calls.length, before);
});

test("NFR6.2 새 프리셋 열기: 상세를 부르지 않고 h1은 「새 프리셋」, [프리셋 지우기]가 없으며 고를 수 있는 자료가 없는 쪽은 세지 않는다", async () => {
  const { api, model } = await openEditor({ catches: [catchPage([])], pdfs: [pdfPage([pdf(PDF_PENDING, "PENDING")])] });
  assert.equal(count(api, "get"), 0);
  assert.equal(count(api, "measure"), 1, "텍스트 자료 쪽만 센다");
  const html = editorHtml(model);
  assert.match(html, /<h1>새 프리셋<\/h1>/);
  assert.doesNotMatch(html, /preset-delete/);
  assert.match(html, /data-testid="preset-items-empty">아직 담은 자료가 없습니다\./);
  assert.match(html, /data-testid="preset-catches-empty"/);
});

test("NFR6.3 [더 보기] 한 번은 그 목록 1 + 세기 1이고, 걸러 보기를 바꾸면 Catch 첫 쪽 1 + 세기 1이며 publishable과 written을 함께 보낸다", async () => {
  const { api, model } = await openEditor({
    catches: [catchPage([catchAsset(C1)], "cursor-1"), catchPage([catchAsset(C2)]), catchPage([catchAsset(C3)])],
  });
  const before = { catches: count(api, "catches"), measure: count(api, "measure") };
  await model.loadMoreCatches();
  assert.deepEqual([count(api, "catches") - before.catches, count(api, "measure") - before.measure], [1, 1]);
  assert.deepEqual(model.store.get().catches.items.map((item) => item.catchId), [C1, C2]);
  await model.setWrittenOnly(true);
  assert.deepEqual([count(api, "catches") - before.catches, count(api, "measure") - before.measure], [2, 2]);
  assert.deepEqual(api.calls.filter((call) => call.name === "catches").at(-1).filter, { repositoryId: "", authorDescription: "written", publishable: true });
  assert.equal(count(api, "repositories"), 1, "저장소 목록은 다시 부르지 않는다");
});

test("NFR5.2 상세 404는 「프리셋을 찾을 수 없습니다.」와 목록 링크만, 그 밖의 실패는 「프리셋을 불러오지 못했습니다.」와 [다시 불러오기]다", async () => {
  const missing = await openEditor({ get: [{ kind: "failed", failure: "not-found" }] }, { presetId: P1 });
  const notFound = editorHtml(missing.model);
  assert.match(notFound, /role="alert" data-testid="preset-editor-not-found">프리셋을 찾을 수 없습니다\./);
  assert.match(notFound, /preset-editor-back-link/);
  assert.doesNotMatch(notFound, /preset-save|preset-sources/);
  const broken = await openEditor({ get: [{ kind: "failed", failure: "failed" }, detailOf([])] }, { presetId: P1 });
  assert.match(editorHtml(broken.model), /프리셋을 불러오지 못했습니다\.<\/p><button[^>]*data-testid="preset-editor-retry"/);
  await broken.model.loadDetail();
  assert.equal(broken.model.store.get().load, "ready");
});

// ── 편집: 담기·막힘·순서 ───────────────────────────────────────────────────────────────────────────────

test("BR3.3 같은 단추를 두 번 누르면 담겼다가 빠지고 aria-pressed가 바뀌며, 담긴 줄에 종류 표지와 제목이 보인다", async () => {
  const { model } = await openEditor();
  model.toggle("CATCH", C1);
  model.toggle("TEXT_MATERIAL", M1);
  assert.deepEqual(model.store.get().items.map((item) => [item.kind, item.sourceId, item.textLength]), [["CATCH", C1, 1000], ["TEXT_MATERIAL", M1, 1000]]);
  assert.equal(model.store.get().dirty, true);
  let html = editorHtml(model);
  assert.match(optionOf(html, C1), /aria-pressed="true"/);
  assert.match(html, /<h2 id="preset-items-title">담긴 자료와 순서 \(항목 2개 · 2,000자\)<\/h2>/);
  model.toggle("CATCH", C1);
  html = editorHtml(model);
  assert.match(optionOf(html, C1), /aria-pressed="false"/);
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [M1]);
  // 추출 중 PDF와 목록에 없는 자료는 담기지 않는다.
  model.toggle("PDF_MATERIAL", PDF_PENDING);
  model.toggle("CATCH", "c9999999-9999-4999-8999-999999999999");
  assert.equal(model.store.get().items.length, 1);
});

test("BR3.4 20개를 담으면 안 담긴 단추가 모두 막히고 단추 안에 「항목은 20개까지 담을 수 있습니다」가 보이며 21개째는 담기지 않는다", async () => {
  const twenty = Array.from({ length: 20 }, (_, index) => catchAsset(`d${String(index).padStart(7, "0")}-0000-4000-8000-000000000000`));
  const { model } = await openEditor({ catches: [catchPage([...twenty, catchAsset(C1)])], lengths: {} });
  for (const item of twenty) model.toggle("CATCH", item.catchId);
  model.toggle("CATCH", C1);
  model.toggle("TEXT_MATERIAL", M1);
  assert.equal(model.store.get().items.length, 20);
  const html = editorHtml(model);
  for (const id of [C1, M1, PDF_DONE]) {
    assert.match(optionOf(html, id), /disabled=""/, id);
    assert.ok(optionOf(html, id).includes(ITEMS_FULL_TEXT), id);
  }
  assert.doesNotMatch(optionOf(html, twenty[0].catchId), /disabled=""/, "담긴 단추는 빼야 하므로 막지 않는다");
  assert.equal(ITEMS_FULL_TEXT, "항목은 20개까지 담을 수 있습니다");
});

test("BR3.4 담으면 60,000자를 넘는 자료는 막히고 「전체 글이 60,000자를 넘습니다」가 보이며, 세기 실패한 쪽은 글자 이유로 막지 않는다", async () => {
  const { model } = await openEditor({ lengths: { [C1]: 59_000, [C2]: 1000, [C3]: 1001 } });
  model.toggle("CATCH", C1);
  let html = editorHtml(model);
  assert.doesNotMatch(optionOf(html, C2), /disabled=""/, "합이 정확히 60,000자면 막지 않는다");
  assert.match(optionOf(html, C3), /disabled=""/);
  assert.ok(optionOf(html, C3).includes(TOTAL_OVER_TEXT));
  model.toggle("CATCH", C3);
  assert.equal(model.store.get().items.length, 1);
  // 세기가 실패한 쪽(텍스트 자료): 글자 수를 모르므로 막지 않고, 담으면 머리에 「글자 수를 세지 못했습니다」.
  const failed = await openEditor({ lengths: { [C1]: 59_500 }, measure: [{ kind: "ok", value: { items: [C1, C2, C3].map((id) => measured("CATCH", id, id === C1 ? 59_500 : 10)) } }, { kind: "failed", failure: "failed" }, { kind: "ok", value: { items: [measured("PDF_MATERIAL", PDF_DONE, 10)] } }] });
  failed.model.toggle("CATCH", C1);
  html = editorHtml(failed.model);
  assert.doesNotMatch(optionOf(html, M1), /disabled=""/);
  assert.doesNotMatch(optionOf(html, M1), /preset-source-reason/);
  failed.model.toggle("TEXT_MATERIAL", M1);
  assert.match(editorHtml(failed.model), new RegExp(`담긴 자료와 순서 \\(항목 2개 · ${LENGTH_UNKNOWN_TEXT}\\)`));
});

test("NFR5.1 세기가 늦으면 단추를 먼저 그리고 글자 이유는 응답 뒤에 붙으며, 그 사이 담은 자료도 응답이 오면 글자 수를 안다", async () => {
  const slow = deferred();
  const api = fakeEditor({ ...defaultLists(), measure: [slow, { kind: "ok", value: { items: [measured("TEXT_MATERIAL", M1, 10)] } }, { kind: "ok", value: { items: [measured("PDF_MATERIAL", PDF_DONE, 10)] } }] });
  const model = createPresetEditorModel(api, null, editorDeps());
  const opening = model.open();
  await tick(); await tick();
  assert.equal(model.store.get().catches.state, "ready", "목록 응답이 오면 단추를 먼저 그린다");
  model.toggle("TEXT_MATERIAL", M1);
  model.toggle("CATCH", C1);
  assert.equal(model.store.get().items.find((item) => item.sourceId === C1).textLength, null);
  assert.doesNotMatch(optionOf(editorHtml(model), C2), /disabled=""/);
  slow.resolve({ kind: "ok", value: { items: [measured("CATCH", C1, 30_000), measured("CATCH", C2, 30_000), measured("CATCH", C3, 5)] } });
  await opening;
  assert.equal(model.store.get().items.find((item) => item.sourceId === C1).textLength, 30_000);
  const html = editorHtml(model);
  assert.ok(optionOf(html, C2).includes(TOTAL_OVER_TEXT), "30,010 + 30,000 > 60,000");
  assert.doesNotMatch(optionOf(html, C3), /disabled=""/);
});

test("NFR 요구 검토 R-02 걸러 보기를 바꾼 뒤 늦게 온 옛 목록과 옛 세기 응답은 버리고 새 목록만 보인다", async () => {
  // 옛 목록이 늦게 옴.
  const oldList = deferred();
  const listApi = fakeEditor({ catches: [oldList, catchPage([catchAsset(C3)])], materials: [materialPage([])], pdfs: [pdfPage([])] });
  const listModel = createPresetEditorModel(listApi, null, editorDeps());
  const opening = listModel.open();
  await tick();
  await listModel.setWrittenOnly(true);
  assert.deepEqual(listModel.store.get().catches.items.map((item) => item.catchId), [C3]);
  oldList.resolve(catchPage([catchAsset(C1), catchAsset(C2)]));
  await opening;
  assert.deepEqual(listModel.store.get().catches.items.map((item) => item.catchId), [C3], "옛 목록이 덮어쓰지 않는다");
  assert.equal(listApi.calls.find((call) => call.name === "catches").signal.aborted, true, "앞 요청은 끊는다");
  assert.equal(count(listApi, "measure"), 1, "버린 옛 목록은 세지 않는다");

  // 옛 목록은 왔고 그 세기가 늦게 옴.
  const oldMeasure = deferred();
  const api = fakeEditor({
    catches: [catchPage([catchAsset(C1), catchAsset(C2)]), catchPage([catchAsset(C3)])], materials: [materialPage([])], pdfs: [pdfPage([])],
    measure: [oldMeasure, { kind: "ok", value: { items: [measured("CATCH", C3, 5)] } }],
  });
  const model = createPresetEditorModel(api, null, editorDeps());
  const first = model.open();
  await tick(); await tick();
  assert.equal(count(api, "measure"), 1);
  await model.setWrittenOnly(true);
  oldMeasure.resolve({ kind: "ok", value: { items: [measured("CATCH", C1, 59_999), measured("CATCH", C2, 1)] } });
  await first;
  assert.equal(model.store.get().lengths[`CATCH:${C1}`], undefined, "옛 세기 응답은 글자 이유를 붙이지 않는다");
  assert.equal(model.store.get().lengths[`CATCH:${C3}`], 5);
});

test("BR3.5 셋째의 [위로]는 둘째로 옮기고, 첫 [위로]·끝 [아래로]는 막히며 읽히는 이름은 「(제목) 위로」 꼴이다", async () => {
  const { model } = await openEditor();
  model.toggle("CATCH", C1); model.toggle("CATCH", C2); model.toggle("CATCH", C3);
  model.moveUp(2);
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [C1, C3, C2]);
  model.moveUp(0); model.moveDown(2);
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [C1, C3, C2], "끝에서 더 옮기지 않는다");
  const html = editorHtml(model);
  assert.match(html, /<button[^>]*data-testid="preset-move-up"[^>]*disabled=""[^>]*aria-label="Catch c1 위로"/);
  assert.match(html, /<button[^>]*data-testid="preset-move-down"[^>]*disabled=""[^>]*aria-label="Catch c2 아래로"/);
  assert.match(html, /aria-label="Catch c3 위로"/);
  assert.deepEqual([...html.matchAll(/data-testid="preset-selected-item" data-source-id="([^"]+)"/g)].map((match) => match[1]), [C1, C3, C2]);
});

test("BR3.6·BR3.7 상세의 이유 넷은 담긴 줄마다 글자로 남고, 글자 합 61,200이면 머리 안내를 보이되 [저장]은 막지 않는다", async () => {
  const items = [
    measured("CATCH", C1, 20_000, "PRIVATE", "Catch C"), measured("CATCH", C2, 20_000, "SOURCE_RESTRICTED"),
    measured("CATCH", C3, 20_000, "CONFIRMATION_REQUIRED"), measured("PDF_MATERIAL", PDF_PENDING, 1200, "EXTRACTION_INCOMPLETE"),
  ];
  const { model } = await openEditor({ get: [detailOf(items)] }, { presetId: P1 });
  const html = editorHtml(model);
  assert.equal((html.match(/data-testid="preset-selected-item"/g) ?? []).length, 4, "줄이 사라지지 않는다");
  assert.deepEqual([...html.matchAll(/data-testid="preset-item-reason">([^<]*)</g)].map((match) => match[1]), [
    "비공개로 바뀌어 발행할 수 없습니다", "원본 저장소가 보호되어 발행할 수 없습니다",
    "작업 사실과 나의 기여를 먼저 확인해야 발행할 수 있습니다", "글 추출이 끝나지 않아 발행할 수 없습니다",
  ]);
  assert.deepEqual(Object.keys(UNPUBLISHABLE_REASON_TEXT).sort(), ["CONFIRMATION_REQUIRED", "EXTRACTION_INCOMPLETE", "PRIVATE", "SOURCE_RESTRICTED"]);
  assert.match(html, /담긴 자료와 순서 \(항목 4개 · 61,200자\)/);
  assert.match(html, new RegExp(`data-testid="preset-over-limit">${OVER_LIMIT_TEXT}<`));
  assert.match(html, /data-testid="preset-save"(?![^>]*disabled)/);
});

// ── 저장 ────────────────────────────────────────────────────────────────────────────────────────────────

test("BR3.1 빈 이름·공백만·51자는 요청하지 않고 이름 칸 아래 「이름을 1~50자로 써 주세요.」와 aria-invalid를 보이며 담은 자료는 남는다", async () => {
  const { api, model } = await openEditor({ create: [{ kind: "failed", failure: "failed" }] });
  model.toggle("CATCH", C1);
  for (const name of ["", "   ", "가".repeat(51)]) {
    model.setName(name);
    await model.save();
    assert.equal(model.store.get().nameError, true, JSON.stringify(name));
  }
  assert.equal(count(api, "create"), 0);
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [C1]);
  const html = editorHtml(model);
  assert.match(html, /<input id="preset-name-input"[^>]*aria-invalid="true"[^>]*aria-describedby="preset-name-help preset-name-error"/);
  assert.match(html, /id="preset-name-error" role="alert"[^>]*>이름을 1~50자로 써 주세요\.</);
  assert.match(html, /<h2 id="preset-name-title"><label for="preset-name-input">이름<\/label><\/h2>/);
  assert.match(html, /id="preset-name-help"[^>]*>이 이름이 받은 사람 화면의 탭 이름으로 보입니다\. \(1~50자\)</);
  // 앞뒤 공백을 빼고 1~50자(코드 포인트)면 보낸다. 이름은 앞뒤 공백을 뺀 글로 보낸다.
  model.setName(` ${"😀".repeat(50)} `);
  await model.save();
  assert.deepEqual(api.calls.filter((call) => call.name === "create").map((call) => call.body.name), ["😀".repeat(50)]);
  assert.equal(model.store.get().nameError, false);
});

// NFR 설계 Q1 B(2026-11-21 변경, Build and Test 되돌아가기 1): 첫 저장 뒤 라우터의 replace로 고치기 주소에 옮기고,
// 「저장했습니다.」는 그 프리셋 ID와 함께 한 번만 넘긴다. 시나리오는 code-generation-plan.md Step 12 표다.

/** 새 프리셋을 열어 이름·Catch 하나를 담고 첫 저장(201, P1)까지 한다. */
async function firstSave(d) {
  const first = await openEditor({ create: [{ kind: "ok", value: { presetId: P1 } }] }, { deps: d });
  first.model.setName(" 지원용 ");
  first.model.toggle("CATCH", C1);
  await first.model.save();
  return first;
}

test("NFR 설계 Q1 B 새 프리셋 첫 저장(201)은 「저장하지 않은 변경」을 끈 뒤 /presets/{id}로 한 번 옮기고(replace), 그 자리에서 상세를 다시 부르지 않으며 replaceState를 쓰지 않는다", async () => {
  const d = editorDeps();
  const { api, model } = await openEditor({ create: [{ kind: "ok", value: { presetId: P1 } }] }, { deps: d });
  model.setName(" 지원용 ");
  model.toggle("CATCH", C1);
  let dirtyWhenMoved = null;
  d.replace = (path) => { dirtyWhenMoved = model.isDirty(); d.moves.push(path); };
  await model.save();
  assert.deepEqual(api.calls.find((call) => call.name === "create").body, { name: "지원용", items: [{ kind: "CATCH", sourceId: C1 }] });
  assert.deepEqual(d.moves, [`/presets/${P1}`]);
  assert.equal(dirtyWhenMoved, false, "옮기기 전에 「저장하지 않은 변경」이 꺼져 이탈 경고가 이동을 막지 않는다");
  assert.equal(count(api, "get"), 0, "상세는 옮긴 화면이 열 때 부른다");
  const state = model.store.get();
  assert.equal(state.presetId, P1, "옮기기 전에 다시 눌러도 POST가 아니라 PUT이다");
  assert.equal(state.status.kind, "saved");
  // 화면은 라우터의 replace만 넘기고, 주소만 바꾸는 history.replaceState는 부르지 않는다.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/features/presets/preset-editor-screen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /replaceState\(/);
  assert.match(source, /replace: \(path\) => router\.replace\(path\)/);
  assert.doesNotMatch(source, /router\.push\(/);
  // 접근성 점검 A9: 넘겨받은 「저장했습니다.」는 상세 준비 렌더 뒤 효과에서 넣고, 넣었으면 초점을 [저장]에 둔다(U2 기능 설계 「저장 결과」,
  // #629 리뷰: 옮긴 화면은 새로 만들어져 Tab이 머리글로 갔다).
  assert.match(source, /useEffect\(\(\) => \{ if \(view\.load === "ready" && model\.showHandedNotice\(\)\) document\.getElementById\(SAVE_BUTTON_ID\)\?\.focus\(\); \}, \[view\.load, model\]\);/);
});

test("NFR 설계 Q1 B 옮긴 화면을 같은 ID로 만들면 상세를 불러 고치기 상태로 그리고 「저장했습니다.」를 한 번 보이며, 그 화면의 저장은 PUT·이동 없음·다시 불러오기다", async () => {
  const d = editorDeps();
  const first = await firstSave(d);
  first.model.dispose();
  const moved = await openEditor({
    get: [detailOf([measured("CATCH", C1, 1234)], "지원용"), detailOf([measured("CATCH", C1, 1234), measured("TEXT_MATERIAL", M1, 77)], "지원용")],
    update: [{ kind: "ok", value: { presetId: P1 } }],
  }, { presetId: P1, deps: d });
  let state = moved.model.store.get();
  assert.equal(state.load, "ready");
  assert.equal(state.name, "지원용");
  assert.deepEqual(state.items.map((item) => [item.sourceId, item.textLength]), [[C1, 1234]]);
  assert.equal(count(moved.api, "get"), 1);
  // 접근성 점검 A9: 상세가 준비된 첫 렌더의 상태 칸은 비어 있고, 그 뒤(화면 효과) 「저장했습니다.」가 들어간다.
  assert.equal(state.status.kind, "idle");
  let html = editorHtml(moved.model);
  assert.match(html, /<p role="status"[^>]*data-testid="preset-editor-status"><\/p>/);
  assert.equal(moved.model.showHandedNotice(), true, "글을 넣었으면 참이라 화면이 [저장]에 초점을 둔다");
  assert.equal(moved.model.store.get().status.kind, "saved");
  html = editorHtml(moved.model);
  assert.match(html, /<h1>프리셋 고치기<\/h1>/);
  assert.match(html, /<p role="status"[^>]*data-testid="preset-editor-status">저장했습니다\.<\/p>/);
  assert.match(html, /data-testid="preset-delete"/);
  assert.equal(moved.model.showHandedNotice(), false, "두 번째는 넣지 않아 초점도 옮기지 않는다");
  assert.equal(moved.model.store.get().status.kind, "saved", "두 번 불러도 한 번만 넣는다");
  // 새로 고침·다시 열기: 같은 ID로 다시 만들어도 「저장했습니다.」는 없다.
  const again = await openEditor({ get: [detailOf([measured("CATCH", C1, 1234)], "지원용")] }, { presetId: P1, deps: d });
  assert.equal(again.model.showHandedNotice(), false);
  assert.equal(again.model.store.get().status.kind, "idle");
  assert.match(editorHtml(again.model), /data-testid="preset-editor-status"><\/p>/);
  // 옮긴 화면에서 저장: PUT이고 POST는 가지 않으며, 다시 옮기지 않고 상세를 다시 불러 글자 수를 맞춘다.
  moved.model.toggle("TEXT_MATERIAL", M1);
  html = editorHtml(moved.model);
  assert.match(html, /data-testid="preset-editor-status"><\/p>/, "다음 변경이 생기면 「저장했습니다.」는 사라진다");
  await moved.model.save();
  assert.equal(count(moved.api, "create"), 0);
  assert.deepEqual(moved.api.calls.filter((call) => call.name === "update").map((call) => call.presetId), [P1]);
  assert.equal(count(first.api, "create"), 1, "프리셋은 한 번만 만들어진다");
  assert.deepEqual(d.moves, [`/presets/${P1}`]);
  assert.equal(count(moved.api, "get"), 2);
  state = moved.model.store.get();
  assert.equal(state.status.kind, "saved");
  assert.equal(state.items[1].textLength, 77);
});

test("NFR 설계 Q1 B 「저장했습니다.」는 다른 프리셋 화면에 보이지 않고, 다른 편집 화면을 연 뒤에는 남긴 ID의 화면에서도 보이지 않는다", async () => {
  const d = editorDeps();
  await firstSave(d);
  const other = await openEditor({ get: [detailOf([])] }, { presetId: P2, deps: d });
  assert.equal(other.model.showHandedNotice(), false);
  assert.equal(other.model.store.get().status.kind, "idle");
  const late = await openEditor({ get: [detailOf([])] }, { presetId: P1, deps: d });
  assert.equal(late.model.showHandedNotice(), false);
  assert.equal(late.model.store.get().status.kind, "idle");
  // 새 프리셋 화면을 열어도 지운다.
  await firstSave(d);
  const fresh = await openEditor({}, { deps: d });
  assert.equal(fresh.model.showHandedNotice(), false);
  assert.equal(fresh.model.store.get().status.kind, "idle");
  const afterNew = await openEditor({ get: [detailOf([])] }, { presetId: P1, deps: d });
  assert.equal(afterNew.model.showHandedNotice(), false);
  assert.equal(afterNew.model.store.get().status.kind, "idle");
});

test("Build and Test 되돌아가기 1 ② open → dispose → open(Strict Mode 흉내) 뒤에도 상세가 그려지고, 넘겨받은 「저장했습니다.」가 남으며, 저장 결과가 반영된다", async () => {
  const d = editorDeps();
  d.savedNotice.leave(P1);
  const lists = defaultLists();
  const api = fakeEditor({
    catches: [...lists.catches, ...defaultLists().catches], materials: [...lists.materials, ...defaultLists().materials],
    pdfs: [...lists.pdfs, ...defaultLists().pdfs],
    get: [detailOf([measured("CATCH", C1)]), detailOf([measured("CATCH", C1, 321)]), detailOf([measured("CATCH", C1, 321), measured("CATCH", C2)])],
    update: [{ kind: "ok", value: { presetId: P1 } }],
  });
  const model = createPresetEditorModel(api, P1, d);
  const firstOpen = model.open();
  assert.equal(model.showHandedNotice(), false, "상세가 준비되기 전에는 넣지 않고 초점도 옮기지 않는다");
  assert.equal(model.store.get().status.kind, "idle", "상세가 준비되기 전에는 넣지 않는다");
  model.dispose();
  await model.open();
  await firstOpen;
  assert.equal(api.calls.filter((call) => call.name === "get")[0].signal.aborted, true, "처음 연 상세 요청은 정리 때 끊긴다");
  let state = model.store.get();
  assert.equal(state.load, "ready", "「프리셋을 불러오고 있습니다.」에 멈추지 않는다");
  assert.equal(state.items[0].textLength, 321);
  assert.equal(model.showHandedNotice(), true);
  state = model.store.get();
  assert.equal(state.status.kind, "saved", "처음 열 때 꺼낸 표시가 다시 열어도 남는다");
  assert.equal(state.catches.state, "ready");
  model.toggle("CATCH", C2);
  await model.save();
  state = model.store.get();
  assert.equal(state.status.kind, "saved", "「저장하고 있습니다.」에 멈추지 않는다");
  assert.equal(state.dirty, false);
  assert.equal(count(api, "update"), 1);
  assert.match(editorHtml(model), /data-testid="preset-editor-status">저장했습니다\.</);
});

test("마지막 dispose() 뒤 늦게 온 상세·저장 결과는 버리고 상태를 바꾸지 않으며, 첫 저장이면 옮기지도 표시를 남기지도 않는다", async () => {
  const detail = deferred();
  const api = fakeEditor({ ...defaultLists(), get: [detail] });
  const model = createPresetEditorModel(api, P1, editorDeps());
  const opening = model.open();
  model.dispose();
  detail.resolve(detailOf([measured("CATCH", C1)]));
  await opening;
  assert.equal(model.store.get().load, "loading");
  const update = deferred();
  const editing = await openEditor({ get: [detailOf([])], update: [update] }, { presetId: P1 });
  const updating = editing.model.save();
  editing.model.dispose();
  update.resolve({ kind: "ok", value: { presetId: P1 } });
  await updating;
  assert.equal(editing.model.store.get().status.kind, "saving");
  assert.equal(count(editing.api, "get"), 1, "버린 저장 뒤에는 상세를 다시 부르지 않는다");
  const d = editorDeps();
  const create = deferred();
  const fresh = await openEditor({ create: [create] }, { deps: d });
  fresh.model.setName("지원용");
  const creating = fresh.model.save();
  fresh.model.dispose();
  create.resolve({ kind: "ok", value: { presetId: P1 } });
  await creating;
  assert.deepEqual(d.moves, []);
  assert.equal(fresh.model.store.get().presetId, null);
  assert.equal(d.savedNotice.take(P1), false, "표시를 남기지 않는다");
});

test("NFR 설계 security 4 저장 중에는 이름·고르기·순서·걸러 보기·저장·지우기를 모두 막고 「저장하고 있습니다.」를 보이며 입력이 바뀌지 않는다", async () => {
  const pending = deferred();
  const { api, model } = await openEditor({ get: [detailOf([measured("CATCH", C1)]), detailOf([measured("CATCH", C1)])], update: [pending] }, { presetId: P1 });
  model.toggle("CATCH", C2);
  const saving = model.save();
  assert.equal(model.store.get().status.kind, "saving");
  model.setName("바꾸려 함"); model.toggle("CATCH", C3); model.moveUp(1); model.remove(0);
  await model.setWrittenOnly(true);
  await model.deletePreset();
  await model.save();
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [C1, C2]);
  assert.equal(model.store.get().name, "자기소개서");
  assert.equal(count(api, "update"), 1);
  assert.equal(count(api, "remove"), 0);
  const html = editorHtml(model);
  assert.match(html, /data-testid="preset-editor-status">저장하고 있습니다\.</);
  for (const id of ["preset-name-input", "preset-save", "preset-delete", "preset-written-only", "preset-move-up", "preset-remove"]) {
    assert.match(html, new RegExp(`data-testid="${id}"[^>]*disabled=""|disabled=""[^>]*data-testid="${id}"`), id);
  }
  assert.ok([C1, C2, C3, M1].every((id) => /disabled=""/.test(optionOf(html, id))));
  pending.resolve({ kind: "ok", value: { presetId: P1 } });
  await saving;
  assert.equal(model.store.get().status.kind, "saved");
});

test("NFR 설계 검토 R-04 저장 뒤 상세가 늦게 와도 그 사이 담은 자료는 남고, 같은 자료의 글자 수·이유만 서버 값으로 바뀐다", async () => {
  const reload = deferred();
  const { model } = await openEditor({
    get: [detailOf([measured("CATCH", C1, 100)]), reload], update: [{ kind: "ok", value: { presetId: P1 } }],
  }, { presetId: P1 });
  const saving = model.save();
  await tick(); await tick();
  assert.equal(model.store.get().status.kind, "saved");
  model.toggle("CATCH", C2);
  reload.resolve(detailOf([measured("CATCH", C1, 5000, "PRIVATE", "서버 제목")], "서버 이름"));
  await saving;
  // C1은 글자 수·이유만 바뀌고 제목은 그대로다. 그 사이 담은 C2는 남는다.
  assert.deepEqual(model.store.get().items.map((item) => [item.sourceId, item.textLength, item.reason, item.title]), [
    [C1, 5000, "PRIVATE", "자료 c1"], [C2, 1000, null, "Catch c2"],
  ]);
  assert.equal(model.store.get().name, "자기소개서", "이름 칸은 덮어쓰지 않는다");
  assert.equal(model.store.get().dirty, true, "그 사이 담은 것은 저장하지 않은 변경이다");
});

test("저장 실패 표: 409·400 maxTotalLength·400 그 밖·404·5xx·끊김은 이유별 글(role=alert)이고 이름·담은 자료·순서가 남으며 404는 목록 링크를 보인다", async () => {
  for (const failure of ["limit-reached", "max-total-length", "items", "not-found", "failed"]) {
    const { model } = await openEditor({ create: [{ kind: "failed", failure }] });
    model.setName("지원용");
    model.toggle("CATCH", C2); model.toggle("CATCH", C1);
    await model.save();
    const state = model.store.get();
    assert.deepEqual(state.status, { kind: "save-failed", failure }, failure);
    assert.equal(state.name, "지원용");
    assert.deepEqual(state.items.map((item) => item.sourceId), [C2, C1]);
    assert.equal(state.dirty, true);
    assert.equal(state.presetId, null);
    const html = editorHtml(model);
    assert.ok(html.includes(`role="alert" class="error" data-testid="preset-editor-alert"><p>${presetSaveFailureText(failure)}</p>`), failure);
    assert.equal(/data-testid="preset-editor-alert">.*<a href="\/presets">프리셋 목록으로<\/a>/s.test(html), failure === "not-found", failure);
    assert.match(html, /data-testid="preset-save"(?![^>]*disabled)/);
  }
  // 400 name은 이름 칸 아래에만 보이고 일반 안내 칸은 없다.
  const named = await openEditor({ create: [{ kind: "failed", failure: "name" }] });
  named.model.setName("지원용");
  await named.model.save();
  const html = editorHtml(named.model);
  assert.match(html, /data-testid="preset-name-error"/);
  assert.doesNotMatch(html, /preset-editor-alert/);
});

test("저장은 됐는데 상세를 다시 불러오지 못하면 「저장했습니다. 내용을 다시 불러오지 못했습니다.」와 [다시 불러오기]를 보이고, 다시 불러오면 「저장했습니다.」다", async () => {
  const { model } = await openEditor({
    get: [detailOf([measured("CATCH", C1)]), { kind: "failed", failure: "failed" }, detailOf([measured("CATCH", C1, 7)])],
    update: [{ kind: "ok", value: { presetId: P1 } }],
  }, { presetId: P1 });
  await model.save();
  let html = editorHtml(model);
  assert.match(html, /data-testid="preset-editor-status">저장했습니다\. 내용을 다시 불러오지 못했습니다\.</);
  assert.match(html, /data-testid="preset-editor-reload"/);
  await model.reloadAfterSave();
  html = editorHtml(model);
  assert.match(html, /data-testid="preset-editor-status">저장했습니다\.</);
  assert.equal(model.store.get().items[0].textLength, 7);
});

// ── 지우기·이탈 ─────────────────────────────────────────────────────────────────────────────────────────

test("BR3.9 지우기는 이름을 밝힌 확인을 거치고, 취소하면 그대로, 204·404면 목록으로, 그 밖의 실패는 안내와 함께 지우기 전 상태로 남는다", async () => {
  const cancel = await openEditor({ get: [detailOf([])] }, { presetId: P1, deps: editorDeps({ answer: false }) });
  await cancel.model.deletePreset();
  assert.deepEqual(cancel.deps.confirms, ["‘자기소개서’ 프리셋을 지울까요? 이미 보낸 발행본은 그대로 남습니다."]);
  assert.equal(count(cancel.api, "remove"), 0);
  assert.equal(cancel.model.store.get().left, false);
  for (const reply of [{ kind: "ok", value: null }, { kind: "failed", failure: "not-found" }]) {
    const done = await openEditor({ get: [detailOf([])], remove: [reply] }, { presetId: P1 });
    done.model.setName("바꾼 이름");
    await done.model.deletePreset();
    assert.equal(done.model.store.get().left, true);
    assert.equal(done.model.isDirty(), false, "지운 뒤에는 경고 없이 목록으로 간다");
  }
  const failed = await openEditor({ get: [detailOf([])], remove: [{ kind: "failed", failure: "failed" }] }, { presetId: P1 });
  failed.model.setName("바꾼 이름");
  await failed.model.deletePreset();
  assert.equal(failed.model.store.get().left, false);
  assert.equal(failed.model.isDirty(), true, "바뀐 입력은 그대로 바뀜이다");
  assert.match(editorHtml(failed.model), /data-testid="preset-editor-alert"><p>지우지 못했습니다\. 다시 시도해 주세요\.<\/p>/);
  // 새 프리셋에는 지우기가 없다.
  const fresh = await openEditor();
  await fresh.model.deletePreset();
  assert.equal(fresh.deps.confirms.length, 0);
});

test("BR3.10 이름·담기·순서를 바꾸면 저장하지 않은 변경이 되고 경고 글은 텍스트 자료 화면과 같으며, 저장하면 풀린다", async () => {
  assert.equal(UNSAVED_MESSAGE, "저장하지 않은 입력이 있습니다. 이동하시겠습니까?");
  for (const change of [(m) => m.setName("새 이름"), (m) => m.toggle("CATCH", C1), (m) => m.moveUp(1)]) {
    const { model } = await openEditor({ get: [detailOf([measured("CATCH", C1), measured("CATCH", C2)])] }, { presetId: P1 });
    assert.equal(model.isDirty(), false);
    change(model);
    assert.equal(model.isDirty(), true);
  }
  const { model } = await openEditor({ get: [detailOf([]), detailOf([])], update: [{ kind: "ok", value: { presetId: P1 } }] }, { presetId: P1 });
  model.setName("새 이름");
  await model.save();
  assert.equal(model.isDirty(), false);
});

test("NFR3.1·NFR1 편집 화면: <b>·<img onerror> 이름과 제목은 글자로만 그리고, 고르기는 aria-pressed 단추이며 막힘 이유는 단추 안 글자다", async () => {
  const { model } = await openEditor({
    get: [detailOf([measured("CATCH", C1, 59_990, null, "<img src=x onerror=alert(1)>")], "<b>x</b>")],
    catches: [catchPage([catchAsset(C1, { title: "<img src=x onerror=alert(1)>" }), catchAsset(C2, { title: "<b>c</b>", hasAuthorDescription: false, mismatch: true })])],
    lengths: { [C2]: 20 },
  }, { presetId: P1 });
  const html = editorHtml(model, [{ repositoryId: "repo-1", name: "synthetic-owner/TheMe" }]);
  assert.doesNotMatch(html, /<img|<b>/);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.match(html, /value="&lt;b&gt;x&lt;\/b&gt;"/);
  const c2 = optionOf(html, C2);
  assert.match(c2, /<button type="button"[^>]*aria-pressed="false" disabled=""/);
  assert.match(c2, /data-testid="preset-catch-subline">synthetic-owner\/TheMe · 설명 안 씀 · 불일치 표시됨</, "공개 상태 글은 뺀다(M3)");
  assert.ok(c2.includes(TOTAL_OVER_TEXT));
  assert.match(optionOf(html, C1), /aria-pressed="true"/);
  assert.doesNotMatch(html, /저장소마다 3~5개를 권합니다|최대 20개/, "M3에 없는 옛 머리 두 줄은 그리지 않는다");
  assert.match(html, /<h2 id="preset-sources-title">담을 자료 고르기<\/h2>/);
  assert.match(html, /<h3>내 Catch<\/h3>.*<h3>내 텍스트 자료<\/h3>.*<h3>내 PDF 자료<\/h3>/s);
  assert.match(html, /글 추출이 완료된 PDF만 고를 수 있습니다\./);
  for (const id of ["preset-name-input", "preset-save", "preset-delete", "preset-written-only", "preset-catch-option", "preset-material-option",
    "preset-pdf-option", "preset-move-up", "preset-move-down", "preset-remove", "preset-editor-back-link"]) {
    assert.ok(html.includes(`data-testid="${id}"`), id);
  }
});

test("발행 화면에서 옮겨 온 고르기 동작: 추출 중 PDF는 상태·이유와 함께 막히고, 걸러 보기로 목록에서 빠진 담긴 Catch는 남으며, 목록 실패는 0개가 아니고 저장소 이름만 빠진다", async () => {
  const { api, model } = await openEditor({
    catches: [catchPage([catchAsset(C1, { hasAuthorDescription: false }), catchAsset(C2)]), catchPage([]), { kind: "lookup-failed", status: 500, code: "LOOKUP_FAILED" }],
  });
  model.toggle("CATCH", C1);
  let html = editorHtml(model);
  const pending = optionOf(html, PDF_PENDING);
  assert.match(pending, /data-state="PENDING" aria-pressed="false" disabled=""/);
  assert.match(pending, /data-testid="preset-pdf-state">글 추출 중</);
  assert.match(pending, /data-testid="preset-source-reason">글 추출이 끝난 뒤 발행에 넣을 수 있습니다/);
  assert.match(optionOf(html, PDF_DONE), /data-testid="preset-pdf-state">완료 2쪽</);
  // 저장소 목록을 못 불러왔으면 작은 줄에서 저장소 이름만 빠진다.
  assert.match(optionOf(html, C1), /data-testid="preset-catch-subline">설명 안 씀</);
  assert.doesNotMatch(optionOf(html, C2), /preset-catch-subline/);
  // 걸러 보기를 켜서 C1이 목록에서 빠져도 담긴 C1은 남고, 맞는 Catch가 없으면 그 글을 보인다.
  await model.setWrittenOnly(true);
  assert.deepEqual(model.store.get().items.map((item) => item.sourceId), [C1]);
  html = editorHtml(model);
  assert.match(html, /<label[^>]*><input type="checkbox" data-testid="preset-written-only" checked=""\/>작성자 설명을 쓴 Catch만 보기<\/label>/);
  assert.match(html, /data-testid="preset-catches-written-empty">작성자 설명을 쓴 Catch가 없습니다</);
  // 목록 실패는 0개로 보이지 않고 [목록 다시 불러오기]가 있으며, 걸러 보기는 그대로 쓸 수 있다.
  await model.setWrittenOnly(false);
  html = editorHtml(model);
  assert.match(html, /role="alert"[^>]*><p>Catch 목록을 불러오지 못했습니다\. Catch가 없다는 뜻은 아닙니다\. 다시 불러와 주세요\.<\/p><button[^>]*data-testid="preset-sources-retry"/);
  assert.doesNotMatch(html, /preset-catches-empty/);
  assert.match(html, /data-testid="preset-written-only"(?![^>]*disabled)/);
  assert.equal(count(api, "repositories"), 1);
});

test("NFR4.1 프리셋 화면 파일은 console을 부르지 않는다", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = new URL("../src/features/presets/", import.meta.url);
  for (const name of await readdir(dir)) {
    if (!/\.tsx?$/.test(name)) continue;
    assert.doesNotMatch(await readFile(new URL(name, dir), "utf8"), /console\./, name);
  }
});
