/**
 * 페이지 주소. 정본은 web README 「페이지 주소」 표이며, 구분(확정·제안·미정)도 그 표를 따른다.
 * 주소를 바꿀 때는 README 표와 이 파일을 함께 고친다.
 */
export const routes = {
  /** 서비스 소개(비로그인 홈). 로그아웃 성공 후 목적지. */
  landing: "/",
  /** 로그인 진입. 회원 경로 가드의 이동 목적지(#106 PR②). */
  login: "/login",
  /** Google 로그인 콜백(#287). api `GOOGLE_REDIRECT_URI`와 같아야 한다. 통합 시험 전환을 끄면 404. */
  googleCallback: "/google/callback",
  /** 로그인 후 홈. 회원 헤더의 로고 목적지. */
  home: "/home",
  /** 최초 프로필 입력(W02). */
  profileSetup: "/profile/setup",
  /** 상세 프로필(W02-P). 프로필 메뉴의 [프로필 보기] 목적지. */
  profile: "/profile",
  /** 프로필 수정(W02). */
  profileEdit: "/profile/edit",
  /** GitHub 연동(W02-G). */
  profileGithub: "/profile/github",
  /** 내 자산(Catch 탭). 필터·상세는 쿼리 `repositoryId`·`catchId`(B 제안). */
  assets: "/assets",
  /** 텍스트 자료 목록·편집(U4 W2). */
  materials: "/materials",
  /** 공유 링크 목록·발급·복사·중단. */
  links: "/links",
} as const;

/** 수신자 링크. token은 경로에만 두고 쿼리·로그에 싣지 않는다. */
export function recipientLinkPath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

/** 수신자 Catch 상세. 직접 진입해도 접근 판정·비밀번호 확인을 먼저 한다. */
export function recipientCatchPath(token: string, catchId: string): string {
  return `${recipientLinkPath(token)}/catches/${encodeURIComponent(catchId)}`;
}
