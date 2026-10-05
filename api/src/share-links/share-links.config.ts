import { buildRecipientLinkUrl, generateLinkToken } from './link-token';

export interface ShareLinksConfig {
  /** 수신자 URL(`<webBaseUrl>/s/<token>`)을 만들 web 주소 */
  webBaseUrl: string;
}

export const SHARE_LINKS_CONFIG = Symbol('SHARE_LINKS_CONFIG');

/** 개발·테스트에서 값이 없을 때 쓰는 web 개발 서버 주소 */
export const DEV_SHARE_LINK_WEB_BASE_URL = 'http://localhost:3000';

/**
 * 공유 URL의 web 주소. 여러 개일 수 있는 CORS 허용 출처와 섞지 않고 이 값 하나만 쓴다.
 * - production에서 지정하지 않거나 형식이 틀리면 기동을 멈춘다. 운영 설정 누락을 배포 때 바로 알고, 잘못된 URL을 발급하지 않게 한다.
 * - 개발·테스트에서 지정하지 않으면 web 개발 서버 주소를 쓴다.
 */
export function readShareLinksConfig(env: NodeJS.ProcessEnv = process.env): ShareLinksConfig {
  const value = env.SHARE_LINK_WEB_BASE_URL?.trim();
  if (!value) {
    if (env.NODE_ENV === 'production') throw new Error('SHARE_LINK_WEB_BASE_URL is required in production');
    return { webBaseUrl: DEV_SHARE_LINK_WEB_BASE_URL };
  }
  try {
    buildRecipientLinkUrl(value, generateLinkToken());
  } catch {
    throw new Error('SHARE_LINK_WEB_BASE_URL must be an absolute http(s) URL without query, fragment or credentials');
  }
  return { webBaseUrl: value };
}
