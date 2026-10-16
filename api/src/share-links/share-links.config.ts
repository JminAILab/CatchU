import { isDevelopmentOrTest } from '../common/node-env';
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
 * - 형식이 틀리면 기동을 멈춘다. 잘못된 URL을 발급하지 않게 한다.
 * - http 주소는 NODE_ENV가 development·test일 때만 받고, 이때 지정하지 않으면 web 개발 서버 주소를 쓴다.
 * - 그 밖(production·미지정 포함)에서는 https 주소가 없으면 기동을 멈춘다(#218). 링크 비밀번호와 토큰이 평문으로 오가지 않게 하고,
 *   운영 설정 누락을 배포 때 바로 알게 한다.
 */
export function readShareLinksConfig(env: NodeJS.ProcessEnv = process.env): ShareLinksConfig {
  const allowHttp = isDevelopmentOrTest(env);
  const value = env.SHARE_LINK_WEB_BASE_URL?.trim();
  if (!value) {
    if (!allowHttp) throw new Error('SHARE_LINK_WEB_BASE_URL is required unless NODE_ENV is development or test');
    return { webBaseUrl: DEV_SHARE_LINK_WEB_BASE_URL };
  }
  try {
    buildRecipientLinkUrl(value, generateLinkToken());
  } catch {
    throw new Error('SHARE_LINK_WEB_BASE_URL must be an absolute http(s) URL without query, fragment or credentials');
  }
  if (!allowHttp && new URL(value).protocol !== 'https:') {
    throw new Error('SHARE_LINK_WEB_BASE_URL must be an https URL unless NODE_ENV is development or test');
  }
  return { webBaseUrl: value };
}
