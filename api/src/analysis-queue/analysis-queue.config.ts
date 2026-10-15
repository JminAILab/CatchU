import { isDevelopmentOrTest } from '../common/node-env';

export interface AnalysisQueueConfig {
  /** 비밀번호가 들어 있을 수 있어 주소 전체를 비밀값으로 다룬다. 로그·오류에 내지 않는다. */
  readonly redisUrl: string;
  readonly prefix: string;
}

export const DEFAULT_QUEUE_PREFIX = 'catchu';

// worker(app/consumer/settings.py)와 같은 판정이다. 큐 주소·접두사는 worker와 같은 설정 이름을 쓴다.
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const PREFIX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DATABASE_PATH = /^(?:\/(?:[0-9]{1,2})?)?$/;

class AnalysisQueueConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'AnalysisQueueConfigError'; }
}

/**
 * 큐 연결 설정. 큐 주소가 없으면 null이고 큐 모듈을 조립하지 않는다(어느 환경에서나 기동은 막지 않는다).
 * 운영(NODE_ENV가 development·test가 아님)은 rediss:// + 비밀번호만, 개발·시험은 redis://도 받는다.
 */
export function readAnalysisQueueConfig(env: NodeJS.ProcessEnv = process.env): AnalysisQueueConfig | null {
  const redisUrl = env.CATCHU_QUEUE_REDIS_URL;
  if (redisUrl === undefined || redisUrl === '') return null;
  if (!validRedisUrl(redisUrl, isDevelopmentOrTest(env))) {
    throw new AnalysisQueueConfigError('CATCHU_QUEUE_REDIS_URL이 유효하지 않습니다'
      + '(운영은 비밀번호가 든 rediss://만, 개발·시험은 redis://도 받습니다. 질의 문자열·#·DB 번호 밖의 경로는 받지 않습니다).');
  }
  return Object.freeze({ redisUrl, prefix: readPrefix(env.CATCHU_QUEUE_PREFIX) });
}

function readPrefix(value: string | undefined): string {
  if (value === undefined || value === '') return DEFAULT_QUEUE_PREFIX;
  if (!PREFIX.test(value)) throw new AnalysisQueueConfigError('CATCHU_QUEUE_PREFIX는 영문·숫자·_·-로 64자 이하여야 합니다(첫 글자는 영문·숫자).');
  return value;
}

function validRedisUrl(value: string, development: boolean): boolean {
  // 공백·제어문자·비ASCII가 없어야 한다. 질의 문자열은 ioredis 연결 옵션(TLS 끄기 등)이 되므로 받지 않는다.
  if (!/^[\x21-\x7e]+$/.test(value) || value.includes('?') || value.includes('#')) return false;
  // ioredis는 소문자 rediss://로 시작할 때만 TLS를 켠다. 대문자 접두사는 TLS 없이 붙으므로 어느 환경에서나 거부한다.
  const tls = value.startsWith('rediss://');
  if (!tls && !(development && value.startsWith('redis://'))) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!HOST.test(url.hostname) || !DATABASE_PATH.test(url.pathname)) return false;
  if (url.port !== '' && (Number(url.port) < 1 || Number(url.port) > 65535)) return false;
  let password: string;
  try {
    // ioredis가 생성자에서 decodeURIComponent로 푼다. 풀리지 않는 값은 여기서 거부한다.
    decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    return false;
  }
  return development || password.length > 0;
}
