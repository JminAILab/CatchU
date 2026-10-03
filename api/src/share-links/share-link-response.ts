import { buildRecipientLinkUrl } from './link-token';
import { ShareLink } from './share-link.entity';
import { shareLinkState, ShareLinkState } from './share-link-state';

/** 회원 API `ShareLink` 응답. 발급·같은 키 재요청이 같은 모양을 쓴다(목록은 #148). */
export interface ShareLinkResponse {
  linkId: string;
  title: string;
  url: string;
  passwordRequired: boolean;
  createdAt: string;
  expiresAt: string;
  stoppedAt: string | null;
  state: ShareLinkState;
}

/** 상태는 저장하지 않고 응답 시각으로 구한다. 비밀번호 검증값·토큰은 `url` 밖으로 내보내지 않는다. */
export function toShareLinkResponse(link: ShareLink, webBaseUrl: string, now: Date): ShareLinkResponse {
  return {
    linkId: link.linkId,
    title: link.title,
    url: buildRecipientLinkUrl(webBaseUrl, link.linkTokenReference),
    passwordRequired: link.passwordProtectionReference !== null,
    createdAt: link.issuedAt.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    stoppedAt: link.stoppedAt?.toISOString() ?? null,
    state: shareLinkState(link, now),
  };
}
