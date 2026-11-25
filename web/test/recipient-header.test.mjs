import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createAuthStore } from "../src/lib/auth-state.ts";
import { authScreenMessages } from "../src/lib/auth-screen-messages.ts";
import { createMemberLogoutControl, logoutView } from "../src/lib/member-session-screen.ts";
import { load } from "./u2-render.mjs";

// #638의 실제 헤더를 합성 회원 상태로 그린다. 외부 통신·Next 라우터만 대역이다.
// 화면 배치·실제 Google/쿠키 검사는 아니며, 로그아웃 상태와 안내는 기존 공용 제어를 사용한다.
const headerUrl = new URL("../src/components/header/recipient-header.tsx", import.meta.url).href;
const profileUrl = new URL("../src/components/header/profile-menu.tsx", import.meta.url).href;
const logoutUrl = new URL("../src/components/auth/member-logout.tsx", import.meta.url).href;
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const navigation = moduleUrl(`
  export const useParams = () => ({ token: globalThis.__recipientHeaderHarness.token });
  export const useRouter = () => ({ push: (path) => globalThis.__recipientHeaderHarness.navigated.push(path) });
  export const usePathname = () => '/home';
`);
const authHooks = moduleUrl(`
  export const useAuth = () => globalThis.__recipientHeaderHarness.store.getSnapshot();
  export const useEnsureRestored = () => { globalThis.__recipientHeaderHarness.restores++; };
`);
const jdSession = moduleUrl(`
  export const useJdSession = () => {
    const h = globalThis.__recipientHeaderHarness;
    const auth = h.store.getSnapshot();
    return { checking: auth.status === 'restoring' && !auth.restoreUnconfirmed,
      loggedIn: auth.status === 'signed-in' && auth.sessionHold === null && !h.store.loginChangeDetected() };
  };
`);
const logoutHook = moduleUrl(`
  export { LogoutStatus } from ${JSON.stringify(logoutUrl)};
  export const useMemberLogout = (args) => globalThis.__recipientHeaderHarness.useLogout(args);
`);
const loginReturn = moduleUrl(`
  export const beginRecipientLogin = (token) => {
    globalThis.__recipientHeaderHarness.loginTokens.push(token); return '/login?entry=recipient';
  };
  export const clearRecipientReturnOnArrival = (token) => { globalThis.__recipientHeaderHarness.arrivals.push(token); };
`);
const runtime = moduleUrl(`
  export const authRuntime = () => {
    const h = globalThis.__recipientHeaderHarness; h.runtimeReads++;
    return { session: { logout: () => h.logout() } };
  };
`);
const headerReact = moduleUrl("export const useEffect = (fn) => { globalThis.__recipientHeaderHarness.effects.push(fn); };");
const profileReact = moduleUrl(`
  import * as React from ${JSON.stringify(reactUrl)};
  export * from ${JSON.stringify(reactUrl)};
  export const useState = (initial) => React.useState(globalThis.__recipientHeaderHarness.openMenu ? true : initial);
`);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") return { url: navigation, shortCircuit: true };
    if (context.parentURL === profileUrl && specifier === "react") return { url: profileReact, shortCircuit: true };
    if (context.parentURL === headerUrl) {
      const stubs = {
        react: headerReact,
        "../auth/use-auth": authHooks,
        "../auth/member-logout": logoutHook,
        "../../features/jd/jd-session": jdSession,
        "../../lib/auth-integration": moduleUrl("export const authSessionIntegrationEnabled = true;"),
        "../../lib/auth-runtime": runtime,
        "../../lib/recipient-login-return": loginReturn,
      };
      if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { RecipientHeader } = await load("components/header/recipient-header.tsx");
const { RecipientHeaderView } = await load("components/header/recipient-header-view.tsx");
const { CommonPreview } = await load("app/preview/common/common-preview.tsx");
const { default: RecipientLayout } = await load("app/s/layout.tsx");
const { MemberHeader } = await load("components/header/member-header.tsx");
const { ProfileMenu } = await load("components/header/profile-menu.tsx");
const html = (component, props = {}) => renderToStaticMarkup(createElement(component, props));
const plain = (markup) => markup.replace(/<[^>]*>/g, "");
let h;

beforeEach(() => {
  const store = createAuthStore();
  let complete;
  h = globalThis.__recipientHeaderHarness = {
    store, token: "a".repeat(43), restores: 0, runtimeReads: 0, openMenu: false,
    effects: [], arrivals: [], loginTokens: [], navigated: [], logoutCalls: 0,
    logout() {
      h.logoutCalls++;
      const ticket = store.logoutStarted();
      return new Promise((resolve) => { complete = (result) => {
        store.logoutSettled(result, ticket);
        resolve({ kind: "settled", result });
      }; });
    },
    finishLogout(result) { complete(result); },
  };
  const control = createMemberLogoutControl({ logout: () => h.logoutArgs.logout(), confirmLeave: () => true });
  h.useLogout = (args) => {
    h.logoutArgs = args;
    return { ...logoutView(args.snapshot, control.getLocal()), onLogout: () => control.request(args.snapshot) };
  };
});

function currentView() {
  const wrapper = RecipientHeader();
  const fragment = wrapper.type(wrapper.props);
  return fragment.props.children[0];
}

test("상단 바: 확인 중은 빈 자리, 복원 실패·재인증은 로그인, 확인된 회원은 프로필이다", () => {
  assert.equal(plain(html(RecipientHeader)), "CatchU");
  const ticket = h.store.refreshStarted();
  h.store.refreshFailed(ticket, "outcome-unknown");
  assert.equal(plain(html(RecipientHeader)), "CatchU로그인");
  h.store.signedIn("synthetic-member");
  assert.equal(plain(html(RecipientHeader)), "CatchU프로필");
  const refresh = h.store.refreshStarted();
  h.store.refreshFailed(refresh, "outcome-unknown");
  assert.equal(plain(html(RecipientHeader)), "CatchU로그인");
  assert.equal(h.restores, 4, "JD 패널의 존재에 기대지 않고 헤더 자체가 복원을 시작한다");
});

test("다른 탭의 로그인 변경을 감지하면 JD와 같은 조건으로 기존 프로필을 숨긴다", () => {
  h.store.signedIn("old-member");
  h.store.invalidateByLoginMarker({ allowRestore: false });
  assert.equal(plain(html(RecipientHeader)), "CatchU로그인");
});

test("공통 수신자 레이아웃은 자료·비밀번호·열람 불가·조회 실패 모두에서 같은 인증 헤더를 붙인다", () => {
  h.store.signedIn("member");
  for (const screen of ["발행본 자료", "비밀번호가 필요한 링크입니다", "이 링크는 열람할 수 없습니다.", "발행본을 불러오지 못했습니다"]) {
    const markup = html(RecipientLayout, { children: createElement("main", null, screen) });
    assert.ok(markup.includes(screen));
    assert.match(markup, /<header[\s\S]*프로필[\s\S]*<\/header><main>/);
  }
  assert.equal(h.restores, 4);
});

test("로그인 단추는 현재 토큰을 탭 복귀 보관에만 넘기고 토큰 없는 로그인 주소로 이동한다", () => {
  const view = currentView();
  view.props.onLogin();
  assert.deepEqual(h.loginTokens, [h.token]);
  assert.deepEqual(h.navigated, ["/login?entry=recipient"]);
  assert.ok(!html(RecipientHeader).includes(h.token));
  for (const effect of h.effects) effect();
  assert.ok(h.arrivals.length > 0);
  assert.ok(h.arrivals.every((token) => token === h.token));
});

test("로그아웃 진행·결과 불명에도 프로필이 남고 메뉴 로그아웃은 막히며 헤더 아래에 같은 안내를 쓴다", async () => {
  h.store.signedIn("member");
  const request = currentView().props.onLogout();
  h.openMenu = true;
  let markup = html(RecipientHeader);
  assert.match(markup, /프로필/);
  assert.match(markup, /disabled="" aria-busy="true"/);
  assert.match(markup, /로그아웃하는 중/);
  h.finishLogout("unknown");
  await request;
  markup = html(RecipientHeader);
  assert.match(markup, /disabled="" aria-busy="false"/);
  assert.ok(!markup.includes("로그아웃하는 중"));
  assert.ok(markup.includes(authScreenMessages.logoutUnknownRetry));
  assert.ok(markup.indexOf("</header>") < markup.indexOf('role="alert"'));
  assert.match(markup, /다시 시도/);
  assert.deepEqual(h.navigated, [], "로그아웃은 페이지를 이동시키지 않는다");
});

test("로그아웃 실패는 회원 안내와 재시도를 보이고, 성공하면 현재 화면에서 로그인 전 표시가 된다", async () => {
  h.store.signedIn("member");
  let request = currentView().props.onLogout();
  h.finishLogout("failed");
  await request;
  assert.ok(html(RecipientHeader).includes(authScreenMessages.logoutFailedRetry));
  request = currentView().props.onLogout();
  h.finishLogout("done");
  await request;
  assert.equal(plain(html(RecipientHeader)), "CatchU로그인");
  assert.deepEqual(h.navigated, []);
});

test("수신자 표시 부품은 작성자 메뉴·대화 초기화 안내 없이 기존 menuItem과 이동 없는 브랜드를 쓴다", () => {
  const markup = html(RecipientHeaderView, { status: "signed-out", onLogin() {} });
  assert.match(markup, /<span class="brandStatic">CatchU<\/span>/);
  assert.match(markup, /<button type="button" class="menuItem">로그인<\/button>/);
  for (const excluded of ["내 자산", "텍스트 자료", "프리셋", "발행본", "JD 관리", "새로 시작"]) {
    assert.ok(!markup.includes(excluded), excluded);
  }
});

test("공통 미리보기의 수신자 세 상태는 실제 인증·복원·복귀 저장 없이 나란히 보인다", () => {
  const markup = html(CommonPreview);
  for (const label of ["수신자 헤더 — 모의 로그인 전", "수신자 헤더 — 모의 로그인 확인 중", "수신자 헤더 — 모의 로그인 뒤"]) {
    assert.ok(markup.includes(label), label);
  }
  assert.equal(h.restores, 0);
  assert.equal(h.runtimeReads, 0);
  assert.deepEqual(h.effects, []);
  assert.deepEqual(h.loginTokens, []);
});

test("선택 prop을 주지 않은 기존 회원 헤더·프로필 메뉴의 연결 전/정상/진행 표시는 유지된다", () => {
  h.openMenu = true;
  let markup = html(MemberHeader);
  assert.match(markup, /연결 전/);
  for (const item of ["내 자산", "텍스트 자료", "프리셋", "발행본", "JD 관리", "프로필 보기"]) assert.ok(markup.includes(item));
  markup = html(ProfileMenu, { onLogout() {} });
  assert.match(markup, /<button type="button" class="profileMenuItem" aria-busy="false">로그아웃<\/button>/);
  markup = html(ProfileMenu, { onLogout() {}, logoutPending: true });
  assert.match(markup, /disabled="" aria-busy="true">로그아웃하는 중/);
});
