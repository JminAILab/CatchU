import { routes } from "./routes.ts";

/**
 * 회원 화면 이동 판정(web README 「주소 원칙」). 화면·라우터와 분리해 테스트한다.
 */

/** 로그인 후 돌아갈 수 있는 회원 경로. 로그인 진입·수신자·서비스 소개는 복귀 대상이 아니다. */
const MEMBER_PATH_PREFIXES = [routes.home, routes.profile, routes.assets, routes.materials, routes.jds, routes.publications];
const PARSE_BASE = "http://catchu.invalid";
const MAX_NEXT_LENGTH = 2048;

function isMemberPathname(pathname: string): boolean {
  return MEMBER_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** `next` 값이 서비스 안 회원 경로일 때만 그 경로(쿼리·해시 포함)를 돌려준다. 아니면 null. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NEXT_LENGTH) return null;
  // 다른 사이트로 가는 `//host`, 역슬래시·제어 문자 우회를 받지 않는다.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (!URL.canParse(value, PARSE_BASE)) return null;
  const url = new URL(value, PARSE_BASE);
  if (url.origin !== PARSE_BASE || !isMemberPathname(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 로그인 진입 주소. 회원 경로에서 왔을 때만 `next`를 붙인다. 토큰·grant는 주소에 넣지 않는다. */
export function loginPath(currentPath?: string): string {
  const next = safeNextPath(currentPath);
  return next ? `${routes.login}?next=${encodeURIComponent(next)}` : routes.login;
}

/** `GET /v1/me` 조회 상태. 조회 실패는 이름 미저장으로 보지 않는다. */
export type MeLookup =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "loaded"; displayName: string };

export type MemberEntryDecision =
  | { action: "wait" }
  | { action: "retry" }
  | { action: "allow" }
  | { action: "redirect"; to: string };

/**
 * 토큰이 있는 회원이 회원 경로에 들어올 때의 판정.
 * 조회 중에는 판단을 미루고, 실패는 다시 불러오기, 이름이 빈 문자열이면 최초 입력으로 보낸다.
 * 이미 최초 입력 화면이면 다시 보내지 않는다.
 * 최초 입력 화면은 이름이 빈 회원만 연다. 이름이 있으면 최초 입력을 거친 뒤와 같은 `/home`으로 보낸다
 * (이름이 저장된 회원의 상세 `/profile`·수정 `/profile/edit`은 그대로 연다).
 *
 * 회원 경로 가드가 GET /v1/me 성공 결과로 호출한다.
 */
export function decideMemberEntry(me: MeLookup, pathname: string): MemberEntryDecision {
  if (me.state === "loading") return { action: "wait" };
  if (me.state === "failed") return { action: "retry" };
  if (me.displayName === "") {
    return pathname === routes.profileSetup ? { action: "allow" } : { action: "redirect", to: routes.profileSetup };
  }
  if (pathname === routes.profileSetup) return { action: "redirect", to: routes.home };
  return { action: "allow" };
}

/**
 * 로그인 직후 목적지. 이름이 저장된 회원만 검증된 `next`로 돌아가고, 아니면 `/home`.
 * 이름이 빈 문자열이면 최초 입력으로 보낸다. 최초 입력 저장 뒤에는 회원 정보를 다시 불러온 다음 `/home`으로 간다.
 *
 * `displayName`을 모르면(#135 전) null을 넘긴다. 이때는 `next` 또는 `/home`으로 보낸다.
 */
export function afterLoginPath(displayName: string | null, next: string | null | undefined): string {
  if (displayName === "") return routes.profileSetup;
  return safeNextPath(next) ?? routes.home;
}
