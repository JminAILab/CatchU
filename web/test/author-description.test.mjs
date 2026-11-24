// U4 제출 1 — Catch 상세의 작성자 설명 편집(W1) 시험. 새 Catch NC1에서 8칸 편집·링크 목록·안내 문구로 바꿨고,
// #634에서 늘 보이는 칸 셋(칸마다 안내 한 줄)과 글이 저장된 옛 칸으로 줄이고 링크 목록을 없앴다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S1, BR1.3·BR2.1~BR2.3, NFR7, 새 Catch US1.1·US1.2·US2.1·US3.1·US3.2, BR1.5·BR4.3~BR4.5, #634 완료 기준).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 상세는 기록에서 확인한 내용·Catch 설명 초안·생각해 볼 질문 아래에 작성자 설명을 둔다. AI 초안은 설명 입력칸에 들어가지 않는다.
//         설명이 없으면 편집 칸은 「이 작업에서 정한 것」·「어떻게 확인했고 무엇을 고쳤나」·「짚어 볼 곳」 셋이 이 순서로 보이는 label인 3줄 글칸이다.
//         앞 두 칸 아래 안내 한 줄을 그 글칸이 설명으로 읽고, 「짚어 볼 곳」 아래 안내 네 가지(「위 근거」 없음), 칸 제목 포함 합계 글자 줄이 있다.
//         글이 저장된 옛 칸은 원래 자리에 원래 제목으로 보인다. Tab 순서는 보이는 글칸 → [설명 저장]이다.
//         저장 응답이 200이고 모양이 맞을 때만 "저장됨"을 보인다. 합친 글 4,000자(코드 포인트)까지 저장을 보내고, 4,001자는 보내지 않고 안내한다.
//         저장하지 않은 입력이 있으면 이탈 경고 대상(dirty)이다. 저장에 성공하면 dirty가 풀린다.
// - 실패 조건(입력 유지): 5xx·연결 끊김·400·성공 형식 오류는 "저장되지 않았습니다"와 이유를 보이고 입력을 지우지 않는다.
//         401 AUTH_REQUIRED·AUTH_INVALID는 로그인 만료 안내를 함께 보이고 입력을 남긴다. 실패한 뒤에도 dirty다.
// - 실패로 보는 것: 요청 접수만으로 "저장됨", 실패 때 입력이 사라짐, 초안이 설명칸을 채움, 조작 요소에 data-testid 없음,
//         관련 커밋을 넣는 단추·목록이 있음, 칸 글의 태그 꼴 글이 HTML로 해석됨, 「발행하면 면접관에게 열릴 링크」가 남음, 저장된 옛 칸이 숨음.
//
// 합성 응답과 서버 렌더링만 쓴다. 실제 브라우저·서버 연결 검증이 아니다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  applyDescriptionSave, authorDescriptionInputError, createAuthorDescriptionApi, isAuthorDescription, isDescriptionDirty,
} from "../src/features/assets/author-description-api.ts";
import { EDIT_TITLES, SECTION_TITLES, sectionTexts } from "../src/lib/author-description-sections.ts";
import { LOGIN_EXPIRED_TEXT, SAVE_FAILED_TEXT, SAVED_TEXT, editStatusLines } from "../src/lib/save-outcome.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const srcUrl = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
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
const { AuthorDescriptionPanel, FIELD_GUIDES, POINT_HINTS } = await import(new URL("../src/features/assets/author-description-panel.tsx", import.meta.url).href);
const { AssetsView } = await import(new URL("../src/features/assets/assets-view.tsx", import.meta.url).href);
hooks.deregister();

const UPDATED_AT = "2026-10-29T01:02:03.456Z";
const success = (data, status = 200) => ({ kind: "success", status, data });
const apiError = (status, code) => ({ kind: "api-error", status, code, message: "합성 메시지" });
const texts = (patch = {}) => ({ ...sectionTexts(null), ...patch });
const MERGED = "어떻게 확인했고 무엇을 고쳤나";

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
    loadState: "ready", texts: texts(), savedTexts: texts(), status: { kind: "idle" }, dirty: false,
    onChange() {}, onSave() {}, onRetry() {}, ...props,
  }));
}
const textareas = (html) => [...html.matchAll(/<textarea([^>]*)>([\s\S]*?)<\/textarea>/g)].map((match) => ({ attrs: match[1], value: match[2] }));
const attr = (attrs, name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const labelsOf = (html) => [...html.matchAll(/<label for="([^"]+)"[^>]*>([^<]+)<\/label>/g)].map((match) => ({ for: match[1], text: match[2] }));

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

test("화면 값: 실패하면 칸 입력을 그대로 두고 dirty가 남으며, 성공해야 저장됨이고 서버 값을 다시 나눠 공백 저장은 빈칸이 된다", () => {
  const editing = { texts: texts({ "맡은 부분": "저장 전 입력" }), savedTexts: texts({ "더 쓰기": "예전 설명" }), status: { kind: "saving" } };
  assert.equal(isDescriptionDirty(editing), true);
  const failed = applyDescriptionSave(editing, { kind: "failed", failure: "server" });
  assert.deepEqual(failed.texts, editing.texts);
  assert.deepEqual(failed.savedTexts, editing.savedTexts);
  assert.equal(isDescriptionDirty(failed), true);
  assert.deepEqual(editStatusLines(failed.status), { tone: "alert", lines: [SAVE_FAILED_TEXT, "서버에서 처리하지 못했습니다. 잠시 뒤 다시 저장해 주세요."] });

  const expired = applyDescriptionSave(editing, { kind: "failed", failure: "login-expired" });
  assert.deepEqual(expired.texts, editing.texts);
  assert.deepEqual(editStatusLines(expired.status).lines, [SAVE_FAILED_TEXT, LOGIN_EXPIRED_TEXT]);

  const saved = applyDescriptionSave(editing, { kind: "saved", value: { authorDescription: "【맡은 부분】\n저장 전 입력", authorDescriptionUpdatedAt: UPDATED_AT } });
  assert.deepEqual(saved, { texts: editing.texts, savedTexts: editing.texts, status: { kind: "saved" } });
  assert.equal(isDescriptionDirty(saved), false);
  assert.deepEqual(editStatusLines(saved.status), { tone: "status", lines: [SAVED_TEXT] });
  assert.equal(editStatusLines({ kind: "saving" }).lines.includes(SAVED_TEXT), false);

  const cleared = applyDescriptionSave({ ...editing, texts: texts({ "맡은 부분": "   " }) }, { kind: "saved", value: { authorDescription: null, authorDescriptionUpdatedAt: null } });
  assert.deepEqual(cleared, { texts: texts(), savedTexts: texts(), status: { kind: "saved" } });
});

test("길이 검사: 합친 글 4,000자(코드 포인트)는 보내고 4,001자는 보내지 않고 안내한다", () => {
  assert.equal(authorDescriptionInputError("가".repeat(3998) + "😀😀"), null);
  assert.equal(authorDescriptionInputError("   "), null);
  assert.match(authorDescriptionInputError("가".repeat(3999) + "😀😀"), /4,000자까지/);
  assert.equal(isAuthorDescription({ authorDescription: "x", authorDescriptionUpdatedAt: "날짜 아님" }), false);
});

test("설명 영역: 조작 요소에 data-testid가 있고, 저장 중에는 보이는 칸 모두와 버튼이 잠기며 실패 안내가 입력과 함께 보인다", () => {
  const ready = panel({ texts: texts({ [MERGED]: "쓰던 설명" }), dirty: true });
  for (const id of ["catch-author-description", "catch-author-description-input", "catch-author-description-save"]) {
    assert.ok(ready.includes(`data-testid="${id}"`), id);
  }
  assert.ok(ready.includes(">쓰던 설명</textarea>"));
  assert.ok(ready.includes("저장하지 않은 변경이 있습니다."));
  assert.ok(ready.includes("AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다."));

  const saving = panel({ texts: texts({ [MERGED]: "쓰던 설명" }), savedTexts: texts({ "맡은 부분": "옛 칸 글" }), status: { kind: "saving" }, dirty: true });
  const savingFields = textareas(saving);
  assert.equal(savingFields.length, 4);
  assert.ok(savingFields.every((field) => /disabled=""/.test(field.attrs)), "저장 중에는 보이는 칸 모두 쓸 수 없다(BR4.5)");
  // #636 리뷰: 저장 단추는 `disabled`가 아니라 `aria-disabled`로 막아, 누른 단추에 초점이 남는다.
  const saveButton = (html) => html.match(/<button[^>]*data-testid="catch-author-description-save"[^>]*>/)?.[0] ?? "";
  assert.match(saveButton(saving), /aria-disabled="true"/);
  assert.doesNotMatch(saveButton(saving), /\sdisabled=/, "저장 중에도 단추는 초점을 잃지 않는다");
  assert.ok(saving.includes(">저장 중…</button>"));
  assert.doesNotMatch(saving, new RegExp(SAVED_TEXT + "<"));
  assert.ok(textareas(ready).every((field) => !/disabled/.test(field.attrs)));
  assert.doesNotMatch(saveButton(ready), /disabled/);

  const failed = panel({ texts: texts({ [MERGED]: "쓰던 설명" }), status: { kind: "failed", failure: "login-expired" }, dirty: true });
  assert.ok(failed.includes(">쓰던 설명</textarea>"));
  assert.ok(failed.includes(`<p>${SAVE_FAILED_TEXT}</p>`));
  assert.ok(failed.includes(LOGIN_EXPIRED_TEXT));
  assert.match(failed, /role="alert"/);

  const error = panel({ loadState: "error", loadFailureText: LOGIN_EXPIRED_TEXT });
  assert.ok(error.includes('data-testid="catch-author-description-retry"'));
  assert.doesNotMatch(error, /<textarea/);

  const script = panel({ texts: texts({ "이 작업에서 정한 것": "<script>alert(1)</script>" }) });
  assert.ok(script.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(script, /<script>/);
});

test("#634 설명이 없으면 글칸은 「이 작업에서 정한 것」·「어떻게 확인했고 무엇을 고쳤나」·「짚어 볼 곳」 셋만 이 순서로 보이는 label이고 3줄로 시작한다", () => {
  const html = panel({});
  const labels = labelsOf(html);
  assert.deepEqual(labels.map((label) => label.text), ["이 작업에서 정한 것", "어떻게 확인했고 무엇을 고쳤나", "짚어 볼 곳"]);
  const fields = textareas(html);
  assert.equal(fields.length, 3);
  assert.deepEqual(fields.map((field) => attr(field.attrs, "id")), labels.map((label) => label.for));
  assert.deepEqual(fields.map((field) => attr(field.attrs, "data-section")), EDIT_TITLES);
  assert.ok(fields.every((field) => attr(field.attrs, "rows") === "3"));
  // 지금의 숨은 이름표 「작성자 설명」과 6줄 글칸, 접힌 칸은 없다.
  assert.doesNotMatch(html, /visually-hidden">작성자 설명|rows="6"|<details/);
});

test("#634 앞 두 칸은 칸 제목과 글칸 사이에 정한 안내 한 줄이 보이고 「짚어 볼 곳」에는 칸 안내 줄이 없다", () => {
  const html = panel({});
  assert.deepEqual(FIELD_GUIDES, {
    "이 작업에서 정한 것": "무엇이 문제였고 왜 이렇게 정했는지 적으세요. 버린 방법이나 팀에서 맡은 부분도 여기에 쓰면 됩니다.",
    [MERGED]: "무엇으로 확인했고 결과는 어땠는지, AI가 낸 것 가운데 버리거나 고친 것이 있으면 함께 적으세요.",
  });
  const guides = [...html.matchAll(/<p id="[^"]+"[^>]*data-testid="catch-author-description-guide">([^<]*)<\/p>/g)].map((match) => match[1]);
  assert.deepEqual(guides, [FIELD_GUIDES["이 작업에서 정한 것"], FIELD_GUIDES[MERGED]]);
  for (const title of ["이 작업에서 정한 것", MERGED]) {
    const label = html.indexOf(`>${title}</label>`);
    const guide = html.indexOf(FIELD_GUIDES[title]);
    const field = html.indexOf(`data-section="${title}"`);
    assert.ok(label < guide && guide < field, `${title}: 칸 제목 → 안내 → 글칸`);
  }
});

test("BR4.5·#634 첫 글칸은 공개 범위 안내와 자기 안내를, 둘째 글칸은 자기 안내를, 짚어 볼 곳은 그 안내를, [설명 저장]은 합계 줄을 aria-describedby로 가리킨다", () => {
  const html = panel({});
  const fields = textareas(html);
  const describedBy = fields.map((field) => attr(field.attrs, "aria-describedby"));
  const noticeId = html.match(/<p id="([^"]+)"[^>]*>이 글은 링크를 가진 누구나/)[1];
  const guideIds = [...html.matchAll(/<p id="([^"]+)"[^>]*data-testid="catch-author-description-guide"/g)].map((match) => match[1]);
  const hintsId = html.match(/<ul id="([^"]+)"[^>]*data-testid="catch-author-description-hints"/)[1];
  const countId = html.match(/<p id="([^"]+)"[^>]*data-testid="catch-author-description-count"/)[1];
  assert.equal(guideIds.length, 2);
  assert.deepEqual(describedBy, [`${noticeId} ${guideIds[0]}`, guideIds[1], hintsId]);
  assert.match(html, new RegExp(`<button[^>]*data-testid="catch-author-description-save"[^>]*aria-describedby="${countId}"`));
  // 옛 칸은 안내 줄이 없어 가리키는 설명도 없다.
  const old = textareas(panel({ savedTexts: texts({ "맡은 부분": "옛 글" }), texts: texts({ "맡은 부분": "옛 글" }) }));
  assert.equal(attr(old.find((field) => attr(field.attrs, "data-section") === "맡은 부분").attrs, "aria-describedby"), undefined);
});

test("#634 Tab 순서는 세 글칸 → [설명 저장]이고 그 사이에 다른 조작 요소가 없다", () => {
  const html = panel({});
  const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
  const focusables = [...form.matchAll(/<(textarea|button|a|input|select)\b[^>]*>/g)].map((match) => match[1] === "textarea" ? attr(match[0], "data-section") : match[1]);
  assert.deepEqual(focusables, [...EDIT_TITLES, "button"]);
  assert.doesNotMatch(form, /tabindex/);
});

test("#634 글이 저장된 옛 칸은 원래 자리에 원래 제목으로 보이고, 지우는 도중에도 남으며, 저장된 글이 비면 보이지 않는다", () => {
  const saved = texts({ "맡은 부분": "로그인 화면", "AI가 낸 것 가운데 받아들이지 않았거나 고친 것": "고친 것", "더 쓰기": "덧붙임" });
  const shown = labelsOf(panel({ texts: saved, savedTexts: saved })).map((label) => label.text);
  assert.deepEqual(shown, ["이 작업에서 정한 것", "맡은 부분", "AI가 낸 것 가운데 받아들이지 않았거나 고친 것", MERGED, "짚어 볼 곳", "더 쓰기"]);
  assert.deepEqual(shown, SECTION_TITLES.filter((title) => shown.includes(title)), "읽기 목록 순서 자리");
  // 지우는 도중(지금 글은 비었지만 저장된 글은 있음)과 저장 실패 뒤에도 칸이 남는다.
  const clearing = labelsOf(panel({ texts: { ...saved, "맡은 부분": "" }, savedTexts: saved, dirty: true })).map((label) => label.text);
  assert.ok(clearing.includes("맡은 부분"));
  // 비우고 저장에 성공하면(저장된 글도 비면) 보이지 않는다.
  const cleared = { ...saved, "맡은 부분": "" };
  assert.ok(!labelsOf(panel({ texts: cleared, savedTexts: cleared })).some((label) => label.text === "맡은 부분"));
  // 칸 제목 없는 옛 자유 글은 「더 쓰기」 칸에 열린다.
  const free = sectionTexts("칸 제목 없는 옛 글");
  const freeHtml = panel({ texts: free, savedTexts: free });
  assert.ok(freeHtml.includes('data-section="더 쓰기"'));
  assert.ok(freeHtml.includes(">칸 제목 없는 옛 글</textarea>"));
});

test("AC3.2.1·AC3.2.2 편집 안내 첫 문장과 공개 범위 안내가 있고 「경험의 맥락·판단·배운 점을 자유롭게 적어 주세요.」는 없다", () => {
  const html = panel({});
  const notice = html.slice(html.indexOf("</h3>"), html.indexOf("<form"));
  assert.ok(notice.indexOf("쓰고 싶은 칸만 한두 문장씩 쓰면 됩니다. 빈 칸은 면접관에게 보이지 않습니다.") >= 0);
  assert.ok(notice.indexOf("쓰고 싶은 칸만") < notice.indexOf("AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다."));
  assert.ok(notice.includes("비워 두고 저장하면 설명이 지워집니다."));
  assert.ok(notice.indexOf("비워 두고 저장하면") < notice.indexOf("이 글은 링크를 가진 누구나 보고 외부 AI로도 보냅니다. 다른 사람의 이름·평가와 비밀값은 쓰지 마세요."));
  assert.doesNotMatch(html, /경험의 맥락·판단·배운 점을 자유롭게 적어 주세요/);
});

test("AC2.1.1·AC2.1.2·#634 「짚어 볼 곳」 칸 아래에 커밋 화면 한 가지 방법의 안내 네 가지가 「위 근거」 없이 보이고, 관련 커밋을 넣는 단추나 목록은 없다", () => {
  const html = panel({});
  // Step 15 확인 중 팀장 발견(2026-11-10)으로 다섯 가지에서 넷으로 줄였다(Copy permalink·한글 파일 이름 안내를 빼고 메모 안내를 바꿈).
  assert.equal(POINT_HINTS.length, 4);
  const pointField = html.indexOf('data-section="짚어 볼 곳"');
  const hints = html.match(/data-testid="catch-author-description-hints">([\s\S]*?)<\/ul>/)[1];
  assert.ok(html.indexOf('data-testid="catch-author-description-hints"') > pointField);
  assert.ok(html.indexOf('data-testid="catch-author-description-hints"') < html.indexOf('data-testid="catch-author-description-count"'));
  assert.deepEqual([...hints.matchAll(/<li>([^<]*)<\/li>/g)].map((match) => match[1]), POINT_HINTS);
  // #634: 근거가 이 칸 위에만 있지 않게 될 배치(#635)에 맞춰 「위 근거」를 「근거」로 썼다.
  assert.equal(POINT_HINTS[1], "근거의 본인 커밋을 열고, 바뀐 줄의 줄 번호를 누르세요(여러 줄이면 Shift를 누른 채 끝 줄 번호도 누르세요). 주소창의 주소를 그대로 붙이세요.");
  assert.equal(POINT_HINTS[3], "관련 커밋은 근거의 본인 커밋 주소를 붙이세요.");
  assert.doesNotMatch(hints, /위 근거/);
  assert.ok(POINT_HINTS.includes("메모에 파일 이름과 짚을 까닭을 적으세요."));
  assert.ok(!POINT_HINTS.some((hint) => hint.includes("Copy permalink") || hint.includes("한글")));
  // 버튼은 [설명 저장] 하나뿐이고 커밋을 고르는 선택 칸·체크 칸이 없다.
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<select|type="checkbox"/);
});

test("AC1.2.2 합계 글자 줄은 칸 제목 포함 합친 글의 글자 수이고 한 칸에 더 치면 늘어난다", () => {
  const two = texts({ "맡은 부분": "가나", "짚어 볼 곳": "다" });
  const count = (html) => html.match(/data-testid="catch-author-description-count">([^<]*)/)[1];
  // 「【맡은 부분】\n가나\n\n【짚어 볼 곳】\n다」 = 7 + 1 + 2 + 2 + 8 + 1 + 1
  assert.equal(count(panel({ texts: two })), "22 / 4,000자 (칸 제목 포함)");
  assert.equal(count(panel({ texts: { ...two, "맡은 부분": "가나라" } })), "23 / 4,000자 (칸 제목 포함)");
  assert.equal((panel({ texts: two }).match(/칸 제목 포함/g) ?? []).length, 1, "합계 줄은 하나");
});

test("#634 「발행하면 면접관에게 열릴 링크」 제목·목록·안내 줄이 없다(링크를 쓴 칸이 있어도)", () => {
  const commit = "https://github.com/o/r/commit/ba6bba8c0123456789abcdef0123456789abcdef";
  const html = panel({ texts: texts({ "짚어 볼 곳": `${commit} 관련 커밋` }) });
  assert.doesNotMatch(html, /발행하면 면접관에게 열릴 링크|이미 보낸 발행본에는 반영되지 않습니다|<h4|catch-author-description-link/);
  assert.ok(html.includes(`>${commit} 관련 커밋</textarea>`), "쓴 링크는 글칸에 그대로다");
});

test("AC3.1.1 Catch 상세: 기록 내용 → Catch 설명 초안 → 작성자 설명 순서이고, 초안은 설명칸에 들어가지 않는다", () => {
  const item = { ...previewCatches[0], draft: { status: "GENERATED", content: "[합성] AI가 만든 초안" } };
  const editor = createElement(AuthorDescriptionPanel, {
    loadState: "ready", texts: texts({ "더 쓰기": "[합성] 작성자가 쓴 설명" }), savedTexts: texts({ "더 쓰기": "[합성] 작성자가 쓴 설명" }),
    status: { kind: "idle" }, dirty: false,
    onChange() {}, onSave() {}, onRetry() {},
  });
  const html = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId, descriptionEditor: editor,
    repositories: [], repositoryId: "", tab: "catch", listState: "ready", detailState: "ready", repositoryManagement: null,
  }));
  const facts = html.indexOf("작업에서 확인된 사실");
  const draft = html.indexOf("<h3>Catch 설명 초안</h3>");
  const questions = html.indexOf("<h3>생각해 볼 질문");
  const description = html.indexOf("작성자 설명 <span");
  assert.ok(facts > 0 && draft > facts && questions > draft && description > questions, "기록 → AI 초안 → 질문 → 작성자 설명 순서");
  const values = textareas(html).map((field) => field.value);
  assert.deepEqual(values.filter(Boolean), ["[합성] 작성자가 쓴 설명"]);
  assert.ok(values.every((value) => !/AI가 만든 초안/.test(value)));

  // 편집 영역을 넘기지 않으면(10월 미리보기 등) 그리지 않는다.
  const without = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId,
    repositories: [], repositoryId: "", tab: "catch", listState: "ready", detailState: "ready", repositoryManagement: null,
  }));
  assert.doesNotMatch(without, /catch-author-description/);
});
