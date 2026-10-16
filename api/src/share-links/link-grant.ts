import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isDevelopmentOrTest } from '../common/node-env';

/**
 * 비밀번호 링크의 열람 증표(grant, #150 9/29 결정).
 * - 서버 비밀키로 서명한 토큰이다. 회원 JWT 키와 분리한 `LINK_GRANT_SECRET`을 쓴다.
 * - 링크 ID와 만료 시각만 담는다. 수명은 발급 후 2시간이며 링크 만료 시각을 넘지 않는다.
 * - 서버에 저장하지 않으므로 개별 회수는 없다. 중단·만료는 매 요청 링크를 다시 판정해 막는다.
 * - 값은 `X-Link-Grant` 헤더로만 받으며, 로그·오류에 넣지 않는다.
 */

export const LINK_GRANT_KEY = Symbol('LINK_GRANT_KEY');
export const LINK_GRANT_TTL_MS = 2 * 60 * 60 * 1000;

const VERSION = 'g1';
const MAX_GRANT_LENGTH = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 서명 키. 64자리 hex(32바이트) `LINK_GRANT_SECRET`을 쓴다.
 * - 값이 없거나 빈 문자열이면 NODE_ENV가 development·test일 때만 프로세스마다 무작위 키를 만든다
 *   (재시작하면 이전 grant는 무효, 다시 비밀번호 입력).
 * - 그 밖(production·미지정·다른 값)에서는 기동을 멈춘다(#242). 재시작이나 여러 대 실행에서 grant가 통하지 않는
 *   설정 누락을 배포 때 바로 알게 한다.
 * 오류 메시지에 키 값을 넣지 않는다.
 */
export function readLinkGrantKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.LINK_GRANT_SECRET;
  if (secret === undefined || secret === '') {
    if (!isDevelopmentOrTest(env)) throw new Error('LINK_GRANT_SECRET is required unless NODE_ENV is development or test');
    return randomBytes(32);
  }
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error('LINK_GRANT_SECRET must be a random 32-byte key encoded as 64 hex characters');
  if (secret.toLowerCase() === env.AUTH_JWT_SECRET?.toLowerCase()) throw new Error('LINK_GRANT_SECRET must differ from AUTH_JWT_SECRET');
  return Buffer.from(secret, 'hex');
}

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(`${VERSION}.${payload}`, 'utf8').digest('base64url');
}

/** 링크 하나에 묶인 grant를 만든다. 만료는 min(발급 + 2시간, 링크 만료)이다. */
export function issueLinkGrant(key: Buffer, linkId: string, linkExpiresAt: Date, now: Date): string {
  if (!UUID_PATTERN.test(linkId)) throw new TypeError('linkId must be a lowercase uuid');
  const expiresAt = Math.min(now.getTime() + LINK_GRANT_TTL_MS, linkExpiresAt.getTime());
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw new TypeError('grant must expire in the future');
  const payload = Buffer.from(JSON.stringify([linkId, expiresAt]), 'utf8').toString('base64url');
  return `${VERSION}.${payload}.${sign(key, payload)}`;
}

/** grant가 이 링크의 것이고 서명이 맞으며 아직 만료되지 않았는지. 형식이 틀리면 예외 없이 false다. */
export function verifyLinkGrant(key: Buffer, grant: unknown, linkId: string, now: Date): boolean {
  if (typeof grant !== 'string' || grant.length > MAX_GRANT_LENGTH) return false;
  const parts = grant.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [, payload, signature] = parts;
  const expected = Buffer.from(sign(key, payload), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!Array.isArray(decoded) || decoded.length !== 2) return false;
  const [grantLinkId, expiresAt] = decoded as unknown[];
  return grantLinkId === linkId && typeof expiresAt === 'number' && Number.isFinite(expiresAt) && now.getTime() < expiresAt;
}
