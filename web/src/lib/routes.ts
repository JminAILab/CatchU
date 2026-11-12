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
  /** 개인정보 처리방침(#496). 로그인 없이 연다. 첫 화면 바닥글 링크의 목적지이며 Google 로그인 앱 Branding에 적는 방침 주소다. */
  privacy: "/privacy",
  /** 로그인 후 홈. 회원 헤더의 로고 목적지. */
  home: "/home",
  /** 최초 프로필 입력(W02). */
  profileSetup: "/profile/setup",
  /** 상세 프로필(W02-P). 프로필 메뉴의 [프로필 보기] 목적지. */
  profile: "/profile",
  /** 프로필 수정(W02). */
  profileEdit: "/profile/edit",
  /** GitHub 연동(W02-G). 상세 프로필·홈 안내·저장소 연결 관리의 미연동 안내가 가리킨다. */
  profileGithub: "/profile/github",
  /** GitHub 연동 콜백(#253). api의 GITHUB_OAUTH_CALLBACK_URL이 가리키는 web 주소다. 화면 사이 이동 목적지로 쓰지 않는다. */
  githubCallback: "/github/callback",
  /** Claude 연결 관리(12월 U6). 상세 프로필·시작 안내가 가리킨다. */
  profileClaude: "/profile/claude",
  /** Claude 연결 승인(12월 U6). api `/authorize`가 쿼리와 함께 보내는 web 주소다. 화면 사이 이동 목적지로 쓰지 않는다. */
  profileClaudeAuthorize: "/profile/claude/authorize",
  /** 내 자산(Catch 목록·저장소 연결 관리). 필터·상세는 쿼리 `repositoryId`·`catchId`(B 제안). */
  assets: "/assets",
  /** 텍스트 자료 목록·편집(U4 W2). */
  materials: "/materials",
  /** 발행본 목록(U4 W5). */
  publications: "/publications",
  /** 발행(U4 W3). 본인 Catch·텍스트 자료를 골라 고정 발행본과 링크를 만든다. 10월 `/links`(공유 링크 발급·관리)는 U4 제출 3(W6)에서 이 화면으로 대체했다. */
  publicationNew: "/publications/new",
} as const;

/** 발행본 상세(U4 W5). 사본·상태·링크 주소·중지·삭제. */
export function publicationDetailPath(publicationId: string): string {
  return `${routes.publications}/${encodeURIComponent(publicationId)}`;
}

/** 받은 사람 링크(U4 W4). token은 경로에만 두고 쿼리·로그에 싣지 않는다. 10월 `/s/[token]/catches/[catchId]`(Catch 상세)는 W6에서 없앴다. */
export function recipientLinkPath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}
