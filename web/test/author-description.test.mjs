// U4 제출 1 — Catch 상세의 작성자 설명 편집(W1) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S1, BR1.3·BR2.1~BR2.3, NFR7). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 상세는 기록에서 확인한 내용·작성자 설명·AI 설명 초안을 다른 제목으로 나눠 보인다. AI 초안은 설명 입력칸에 들어가지 않는다.
//         저장 응답이 200이고 모양이 맞을 때만 "저장됨"을 보인다. 4,000자(코드 포인트)까지 저장을 보내고, 4,001자는 보내지 않고 안내한다.
//         저장하지 않은 입력이 있으면 이탈 경고 대상(dirty)이다. 저장에 성공하면 dirty가 풀린다.
// - 실패 조건(입력 유지): 5xx·연결 끊김·400·성공 형식 오류는 "저장되지 않았습니다"와 이유를 보이고 입력을 지우지 않는다.
//         401 AUTH_REQUIRED·AUTH_INVALID는 로그인 만료 안내를 함께 보이고 입력을 남긴다. 실패한 뒤에도 dirty다.
// - 실패로 보는 것: 요청 접수만으로 "저장됨", 실패 때 입력이 사라짐, 초안이 설명칸을 채움, 조작 요소에 data-testid 없음.
//
// 합성 응답과 서버 렌더링만 쓴다. 실제 브라우저·서버 연결 검증이 아니다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  applyDescriptionSave, authorDescriptionInputError, createAuthorDescriptionApi, isAuthorDescription, isDescriptionDirty,
} from "../src/features/assets/author-description-api.ts";
import { LOGIN_EXPIRED_TEXT, SAVE_FAILED_TEXT, SAVED_TEXT, editStatusLines } from "../src/lib/save-outcome.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const transpiled = [
  new URL("../src/features/assets/author-description-panel.tsx", import.meta.url),
  new URL("../src/features/assets/assets-view.tsx", import.meta.url),
];
const cssUrl = new URL("../src/features/assets/assets.module.css", import.meta.url);
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === cssUrl.href) return { format: "module", shortCircuit: true, source: "export default {};" };
    const target = transpiled.find((item) => item.href === url);
    if (!target) return nextLoad(url, context);
    return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(target, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { AuthorDescriptionPanel } = await import(transpiled[0].href);
const { AssetsView } = await import(transpiled[1].href);
hooks.deregister();

const UPDATED_AT = "2026-10-29T01:02:03.456Z";
const success = (data, status = 200) => ({ kind: "success", status, data });
const apiError = (status, code) => ({ kind: "api-error", status, code, message: "합성 메시지" });

function fakeMember(...responses) {
  const calls = [];
  return {
    calls,
    member: async (path, request) => {
      calls.push({ path, method: request?.method, body: request?.body });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

function panel(props) {
  return renderToStaticMarkup(createElement(AuthorDescriptionPanel, {
    loadState: "ready", value: "", status: { kind: "idle" }, dirty: false,
    onChange() {}, onSave() {}, onRetry() {}, ...props,
  }));
}

test("저장: 200과 맞는 모양일 때만 저장 성공이고, 경로·본문은 정한 그대로 보낸다", async () => {
  const value = { authorDescription: "  쓴 그대로  ", authorDescriptionUpdatedAt: UPDATED_AT };
  const fake = fakeMember(success(value));
  const api = createAuthorDescriptionApi(fake.member);
  assert.deepEqual(await api.save("catch/1", "  쓴 그대로  "), { kind: "saved", value });
  assert.deepEqual(fake.calls, [{ path: "/catches/catch%2F1/description", method: "PUT", body: { description: "  쓴 그대로  " } }]);

  // 접수(202)·모양 오류·두 칸 불일치는 저장 성공이 아니다.
  for (const response of [
    success(value, 202), success({ authorDescription: "x" }),
    success({ authorDescription: null, authorDescriptionUpdatedAt: UPDATED_AT }),
    success({ authorDescription: "  ", authorDescriptionUpdatedAt: UPDATED_AT }),
  ]) {
    assert.deepEqual(await createAuthorDescriptionApi(fakeMember(response).member).save("c", "x"),
      { kind: "failed", failure: "unknown" });
  }
});

test("저장 실패 구분: 로그인 만료·검증·없음·서버·연결 끊김·예외를 저장 실패로 돌려준다", async () => {
  const cases = [
    [apiError(401, "AUTH_INVALID"), "login-expired"],
    [apiError(401, "AUTH_REQUIRED"), "login-expired"],
    [apiError(400, "VALIDATION_FAILED"), "validation"],
    [apiError(404, "RESOURCE_UNAVAILABLE"), "not-found"],
    [apiError(500, "INTERNAL_ERROR"), "server"],
    [{ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }, "unknown"],
    [new Error("network"), "unknown"],
  ];
  for (const [response, failure] of cases) {
    const api = createAuthorDescriptionApi(fakeMember(response).member);
    assert.deepEqual(await api.save("c", "설명"), { kind: "failed", failure });
  }
  const read = createAuthorDescriptionApi(fakeMember(apiError(401, "AUTH_INVALID")).member);
  assert.deepEqual(await read.read("c"), { kind: "failed", failure: "login-expired" });
  const loaded = createAuthorDescriptionApi(fakeMember(success({ authorDescription: null, authorDescriptionUpdatedAt: null })).member);
  assert.deepEqual(await loaded.read("c"), { kind: "loaded", value: { authorDescription: null, authorDescriptionUpdatedAt: null } });
});

test("화면 값: 실패하면 입력을 그대로 두고 dirty가 남으며, 성공해야 저장됨이고 공백 저장은 빈칸이 된다", () => {
  const editing = { value: "저장 전 입력", saved: "예전 설명", status: { kind: "saving" } };
  assert.equal(isDescriptionDirty(editing), true);
  const failed = applyDescriptionSave(editing, { kind: "failed", failure: "server" });
  assert.equal(failed.value, "저장 전 입력");
  assert.equal(failed.saved, "예전 설명");
  assert.equal(isDescriptionDirty(failed), true);
  assert.deepEqual(editStatusLines(failed.status), { tone: "alert", lines: [SAVE_FAILED_TEXT, "서버에서 처리하지 못했습니다. 잠시 뒤 다시 저장해 주세요."] });

  const expired = applyDescriptionSave(editing, { kind: "failed", failure: "login-expired" });
  assert.equal(expired.value, "저장 전 입력");
  assert.deepEqual(editStatusLines(expired.status).lines, [SAVE_FAILED_TEXT, LOGIN_EXPIRED_TEXT]);

  const saved = applyDescriptionSave(editing, { kind: "saved", value: { authorDescription: "저장 전 입력", authorDescriptionUpdatedAt: UPDATED_AT } });
  assert.deepEqual(saved, { value: "저장 전 입력", saved: "저장 전 입력", status: { kind: "saved" } });
  assert.equal(isDescriptionDirty(saved), false);
  assert.deepEqual(editStatusLines(saved.status), { tone: "status", lines: [SAVED_TEXT] });
  assert.equal(editStatusLines({ kind: "saving" }).lines.includes(SAVED_TEXT), false);

  const cleared = applyDescriptionSave({ ...editing, value: "   " }, { kind: "saved", value: { authorDescription: null, authorDescriptionUpdatedAt: null } });
  assert.deepEqual(cleared, { value: "", saved: "", status: { kind: "saved" } });
});

test("길이 검사: 4,000자(코드 포인트)는 보내고 4,001자는 보내지 않고 안내한다", () => {
  assert.equal(authorDescriptionInputError("가".repeat(3998) + "😀😀"), null);
  assert.equal(authorDescriptionInputError("   "), null);
  assert.match(authorDescriptionInputError("가".repeat(3999) + "😀😀"), /4,000자까지/);
  assert.equal(isAuthorDescription({ authorDescription: "x", authorDescriptionUpdatedAt: "날짜 아님" }), false);
});

test("설명 영역: 조작 요소에 data-testid가 있고, 저장 중에는 버튼·입력이 잠기며 실패 안내가 입력과 함께 보인다", () => {
  const ready = panel({ value: "쓰던 설명", dirty: true });
  for (const id of ["catch-author-description", "catch-author-description-input", "catch-author-description-save"]) {
    assert.ok(ready.includes(`data-testid="${id}"`), id);
  }
  assert.ok(ready.includes(">쓰던 설명</textarea>"));
  assert.ok(ready.includes("저장하지 않은 변경이 있습니다."));
  assert.ok(ready.includes("AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다."));

  const saving = panel({ value: "쓰던 설명", status: { kind: "saving" }, dirty: true });
  assert.match(saving, /<textarea[^>]*disabled=""/);
  assert.match(saving, /<button[^>]*data-testid="catch-author-description-save"[^>]*disabled=""/);
  assert.doesNotMatch(saving, new RegExp(SAVED_TEXT + "<"));

  const failed = panel({ value: "쓰던 설명", status: { kind: "failed", failure: "login-expired" }, dirty: true });
  assert.ok(failed.includes(">쓰던 설명</textarea>"));
  assert.ok(failed.includes(`<p>${SAVE_FAILED_TEXT}</p>`));
  assert.ok(failed.includes(LOGIN_EXPIRED_TEXT));
  assert.match(failed, /role="alert"/);

  const error = panel({ loadState: "error", loadFailureText: LOGIN_EXPIRED_TEXT });
  assert.ok(error.includes('data-testid="catch-author-description-retry"'));
  assert.doesNotMatch(error, /<textarea/);

  const script = panel({ value: "<script>alert(1)</script>" });
  assert.ok(script.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("Catch 상세: 기록 내용·작성자 설명·AI 초안을 다른 제목으로 나누고, 초안은 설명칸에 들어가지 않는다", () => {
  const item = { ...previewCatches[0], draft: { status: "GENERATED", content: "[합성] AI가 만든 초안" } };
  const editor = createElement(AuthorDescriptionPanel, {
    loadState: "ready", value: "[합성] 작성자가 쓴 설명", status: { kind: "idle" }, dirty: false,
    onChange() {}, onSave() {}, onRetry() {},
  });
  const html = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId, descriptionEditor: editor,
    repositories: [], repositoryId: "", tab: "catch", listState: "ready", detailState: "ready", repositoryManagement: null,
  }));
  const facts = html.indexOf("작업에서 확인된 사실");
  const description = html.indexOf("작성자 설명 <span");
  const draft = html.indexOf("<h3>Catch 설명 초안</h3>");
  assert.ok(facts > 0 && description > facts && draft > description, "기록 → 작성자 설명 → AI 초안 순서");
  const textarea = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  assert.equal(textarea, "[합성] 작성자가 쓴 설명");
  assert.doesNotMatch(textarea, /AI가 만든 초안/);

  // 편집 영역을 넘기지 않으면(10월 미리보기 등) 그리지 않는다.
  const without = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId,
    repositories: [], repositoryId: "", tab: "catch", listState: "ready", detailState: "ready", repositoryManagement: null,
  }));
  assert.doesNotMatch(without, /catch-author-description/);
});
