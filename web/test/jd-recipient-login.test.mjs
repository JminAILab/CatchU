/** #638: 공용 인증 상태를 넣어 JD 로그인 입구의 복원 중·실패·계정 전환 표시를 검사한다. 실제 브라우저 시험은 별도다. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

process.env.NEXT_PUBLIC_AUTH_SESSION_INTEGRATION = "true";
// 정적 렌더는 원래 서버의 restoring 스냅샷을 쓴다. 이 검사에서는 브라우저가 읽는 실제 store 스냅샷을 훅에 넣는다.
const snapshotKey = Symbol.for("catchu-test-638-jd-auth-store");
const authHooks = `
  const store = () => globalThis[Symbol.for("catchu-test-638-jd-auth-store")];
  export const useAuth = () => store().getSnapshot();
  export const useLoginChangeDetected = () => store().loginChangeDetected();
`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/components/auth/use-auth") && context.parentURL?.endsWith("/features/jd/jd-session.ts")) {
      return { url: `data:text/javascript,${encodeURIComponent(authHooks)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
after(() => { hook.deregister(); delete globalThis[snapshotKey]; });

const { authRuntime } = await load("lib/auth-runtime.ts");
const { currentJdSession } = await load("features/jd/jd-session.ts");
const { createJdApi } = await load("features/jd/jd-api.ts");
const { JdSummaryPanel } = await load("features/jd/jd-summary-panel.tsx");
const store = authRuntime().store;
globalThis[snapshotKey] = store;
let requests = 0;
const client = createJdApi(async () => { requests++; throw new Error("화면 그리기는 API를 보내지 않는다"); });
const token = "jd-recipient-synthetic-token".padEnd(43, "0");
const html = () => renderToStaticMarkup(createElement(JdSummaryPanel, {
  token, client, isLoggedIn: currentJdSession().loggedIn, getGrant() { return null; }, onAccessLost() {}, showEvidence() {},
}));

test("#638 복원 응답 전에는 확인 안내만, 복원 확인 실패 뒤에는 토큰 없는 로그인 입구를 보인다", () => {
  assert.equal(currentJdSession().checking, true);
  const restoring = html();
  assert.match(restoring, /로그인 상태를 확인하고 있습니다\./);
  assert.doesNotMatch(restoring, /jd-summary-login|jd-summary-start/);
  const ticket = store.refreshStarted();
  assert.ok(ticket);
  store.refreshFailed(ticket, "not-consumed");
  assert.equal(currentJdSession().checking, false);
  assert.equal(currentJdSession().loggedIn, false);
  const unconfirmed = html();
  assert.match(unconfirmed, /href="\/login\?entry=recipient"/);
  assert.match(unconfirmed, /내 JD와 결과는 나만 보며, 지원자는 볼 수 없습니다\./);
  assert.match(unconfirmed, /이 화면의 질의응답 대화는 새로 시작됩니다\./);
  assert.doesNotMatch(unconfirmed, /로그인 상태를 확인하고 있습니다/);
  assert.ok(!unconfirmed.includes(token), "로그인 링크·표시에는 받은 링크 토큰이 없다");
  assert.equal(requests, 0);
});

test("#638 로그인 완료·로그아웃 대기 및 불명·계정 전환은 공용 세션 판정대로 JD 입구를 바꾼다", () => {
  store.signedIn("synthetic-member-one");
  assert.equal(currentJdSession().checking, false);
  assert.equal(currentJdSession().loggedIn, true);
  const firstGeneration = currentJdSession().identity;
  assert.doesNotMatch(html(), /jd-summary-login/);
  assert.match(html(), /jd-manage-link/);
  const ticket = store.logoutStarted();
  assert.ok(ticket);
  assert.equal(currentJdSession().loggedIn, false);
  assert.match(html(), /jd-summary-login/);
  store.logoutSettled("unknown", ticket);
  assert.equal(currentJdSession().loggedIn, false);
  assert.match(html(), /jd-summary-login/);
  store.signedIn("synthetic-member-two");
  assert.notEqual(currentJdSession().identity, firstGeneration);
  assert.equal(currentJdSession().loggedIn, true);
  assert.doesNotMatch(html(), /jd-summary-login/);
  store.invalidateByLoginMarker({ allowRestore: false });
  assert.equal(currentJdSession().loggedIn, false);
  assert.match(html(), /jd-summary-login/);
  assert.equal(requests, 0);
});
