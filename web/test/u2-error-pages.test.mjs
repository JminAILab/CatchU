import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 404·기본 오류 화면(기능 설계 BR8.3, AC16.2.3, 시나리오 S28). 내부 정보(오류 내용·digest·스택)를 보이지 않는다.
const { default: NotFound } = await load("app/not-found.tsx");
const { default: ErrorPage } = await load("app/error.tsx");
const { NOT_FOUND_TEXT, ERROR_TEXT } = await load("components/error-pages/error-page-text.ts");

test("S28 없는 주소는 '페이지를 찾을 수 없습니다'와 홈 링크만 보인다", () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.ok(html.includes(NOT_FOUND_TEXT.title));
  assert.match(html, /<a href="\/"[^>]*data-testid="not-found-home-link"/);
});

test("화면 오류는 '문제가 생겼습니다'와 [다시 시도]·홈 링크를 보이고, 오류 메시지·digest·스택을 넣지 않는다", () => {
  const error = Object.assign(new Error("SECRET_INTERNAL_MESSAGE member=1234"), { digest: "DIGEST_9f8e" });
  error.stack = "Error: SECRET_STACK at internal.ts:1:1";
  const html = renderToStaticMarkup(createElement(ErrorPage, { error, retry() {} }));
  assert.ok(html.includes(ERROR_TEXT.title) && html.includes(ERROR_TEXT.retry));
  assert.ok(html.includes('data-testid="error-page-retry"'));
  assert.match(html, /<a href="\/"[^>]*data-testid="error-page-home-link"/);
  for (const secret of ["SECRET_INTERNAL_MESSAGE", "DIGEST_9f8e", "SECRET_STACK", "1234"]) assert.ok(!html.includes(secret), secret);
});

test("[다시 시도]는 Next가 준 retry를 부른다", async () => {
  let retried = 0;
  const element = ErrorPage({ error: new Error("x"), retry: () => { retried += 1; } });
  const button = findByTestId(element, "error-page-retry");
  button.props.onClick();
  assert.equal(retried, 1);
});

/** React 요소 나무에서 data-testid로 요소를 찾는다(렌더링 없이 이벤트 처리기를 부르기 위해). */
function findByTestId(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.["data-testid"] === id) return node;
  const children = [].concat(node.props?.children ?? []);
  for (const child of children) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}
