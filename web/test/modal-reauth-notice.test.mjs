import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// 모달 안 재인증 안내(#467 공용화). 통합 전환·공통 인증 판정·현재 주소를 대역으로 바꿔, 언제 무엇을 그리는지만 본다.
// 안내 자체(확인 창·이동)는 test/auth-screens-session.test.mjs가 `ReauthNotice`로 본다.
const moduleUrl = new URL("../src/components/auth/modal-reauth-notice.tsx", import.meta.url);
const stub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const controlUrl = stub("export const control = { enabled: false, gate: { action: 'show', reauth: false }, pathname: '/assets', authCalls: 0 };");
const integrationUrl = stub(`import { control } from ${JSON.stringify(controlUrl)}; export const authSessionIntegrationEnabled = control.enabled;`);
const STUBS = {
  "next/navigation": stub(`import { control } from ${JSON.stringify(controlUrl)}; export const usePathname = () => control.pathname;`),
  "./use-auth": stub(`import { control } from ${JSON.stringify(controlUrl)}; export const useAuth = () => { control.authCalls += 1; return { status: 'synthetic' }; };`),
  "@/lib/auth-gate": stub(`import { control } from ${JSON.stringify(controlUrl)}; export const decideAuthGate = () => control.gate;`),
  "./reauth-notice": stub(`import { createElement } from ${JSON.stringify(import.meta.resolve("react"))}; export const ReauthNotice = (props) => createElement('aside', { 'data-return-to': String(props.returnTo), 'data-variant': String(props.variant) }, 'reauth');`),
};

async function load(enabled) {
  const { control } = await import(controlUrl);
  control.enabled = enabled;
  // 통합 전환은 모듈을 불러올 때 정해지므로 판마다 다른 주소로 다시 불러온다.
  const integration = `${integrationUrl}#${enabled}`;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.startsWith(moduleUrl.href)) {
        if (specifier === "@/lib/auth-integration") return { url: integration, shortCircuit: true };
        if (specifier === "@/lib/member-navigation") return nextResolve(new URL("../src/lib/member-navigation.ts", import.meta.url).href, context);
        if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith(moduleUrl.href)) return nextLoad(url, context);
      return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(moduleUrl, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    },
  });
  try {
    return { ...(await import(`${moduleUrl.href}?enabled=${enabled}`)), control };
  } finally {
    hooks.deregister();
  }
}

test("통합 전환이 꺼져 있으면 공통 인증 상태를 읽지 않고 아무것도 그리지 않는다", async () => {
  const { ModalReauthNotice, control } = await load(false);
  control.gate = { action: "show", reauth: true };
  control.authCalls = 0;
  assert.equal(renderToStaticMarkup(createElement(ModalReauthNotice)), "");
  assert.equal(control.authCalls, 0);
});

test("통합 전환이 켜져 있으면 재인증이 필요할 때만 안내를 그리고, 돌아올 주소는 지금 회원 화면 주소다", async () => {
  const { ModalReauthNotice, control } = await load(true);
  control.pathname = "/assets";
  control.gate = { action: "show", reauth: true };
  assert.equal(renderToStaticMarkup(createElement(ModalReauthNotice)), '<aside data-return-to="/assets" data-variant="undefined">reauth</aside>');

  for (const gate of [{ action: "show", reauth: false }, { action: "restoring", reauth: true }, { action: "redirect", reauth: false }]) {
    control.gate = gate;
    assert.equal(renderToStaticMarkup(createElement(ModalReauthNotice)), "", JSON.stringify(gate));
  }
});
