import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * 공유 링크 비밀번호의 검증값(ERD ShareLink.passwordProtectionReference).
 * 원문은 저장·응답·로그에 남기지 않고, 이 모듈의 반환값만 저장한다.
 * 계약에 따라 비밀번호는 trim·대소문자 변환·유니코드 정규화를 하지 않는다.
 *
 * 저장 형식: `scrypt$1$<N>$<r>$<p>$<salt>$<hash>` (salt·hash는 base64url)
 * 매개변수를 값에 함께 저장하므로 나중에 강도를 올려도 기존 값을 검증할 수 있다.
 */

const FORMAT_PREFIX = 'scrypt';
const FORMAT_VERSION = '1';

// OWASP 비밀번호 저장 권고 조합 N=2^15, r=8, p=3(#219). 한 번 계산에 약 32MiB를 쓰고, p는 메모리를 늘리지 않고
// 같은 계산을 차례로 3번 한다. 이전 값(p=1)으로 저장된 검증값도 아래 허용 범위 안이라 그대로 검증된다.
export const PASSWORD_HASH_PARAMS = { N: 32768, r: 8, p: 3 } as const;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// 저장값을 읽을 때 허용하는 범위. 비정상 값으로 과도한 메모리를 쓰지 않도록 막는다.
const MIN_LOG2_N = 14;
const MAX_LOG2_N = 17;
const MAX_R = 16;
const MAX_P = 4;

/** 저장된 검증값의 형식이 깨졌을 때. 입력 오류가 아니라 서버 자료 무결성 오류(500)로 다룬다. */
export class PasswordVerifierFormatError extends Error {
  constructor() {
    super('password verifier has an invalid format');
    this.name = 'PasswordVerifierFormatError';
  }
}

interface ScryptParams { N: number; r: number; p: number }

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  // 필요한 메모리(128·N·r)보다 여유를 두어 Node 기본 한도(32MiB)에 걸리지 않게 한다.
  const maxmem = 128 * params.N * params.r * 2;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, HASH_BYTES, { ...params, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function assertPassword(password: unknown): asserts password is string {
  // 원문을 오류에 넣지 않는다.
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('password must be a non-empty string');
  }
}

export async function hashLinkPassword(password: string): Promise<string> {
  assertPassword(password);
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, PASSWORD_HASH_PARAMS);
  const { N, r, p } = PASSWORD_HASH_PARAMS;
  return [FORMAT_PREFIX, FORMAT_VERSION, N, r, p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

function parseVerifier(stored: unknown): { params: ScryptParams; salt: Buffer; hash: Buffer } {
  if (typeof stored !== 'string') throw new PasswordVerifierFormatError();
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== FORMAT_PREFIX || parts[1] !== FORMAT_VERSION) {
    throw new PasswordVerifierFormatError();
  }
  const [N, r, p] = parts.slice(2, 5).map((value) => (/^[1-9]\d{0,6}$/.test(value) ? Number(value) : NaN));
  const log2N = Math.log2(N);
  if (!Number.isInteger(log2N) || log2N < MIN_LOG2_N || log2N > MAX_LOG2_N
    || !Number.isInteger(r) || r < 1 || r > MAX_R || !Number.isInteger(p) || p < 1 || p > MAX_P) {
    throw new PasswordVerifierFormatError();
  }
  const [saltText, hashText] = parts.slice(5);
  const isBase64url = (value: string) => /^[A-Za-z0-9_-]+$/.test(value);
  if (!isBase64url(saltText) || !isBase64url(hashText)) throw new PasswordVerifierFormatError();
  const salt = Buffer.from(saltText, 'base64url');
  const hash = Buffer.from(hashText, 'base64url');
  if (salt.length !== SALT_BYTES || hash.length !== HASH_BYTES
    || salt.toString('base64url') !== saltText || hash.toString('base64url') !== hashText) {
    throw new PasswordVerifierFormatError();
  }
  return { params: { N, r, p }, salt, hash };
}

/**
 * 비밀번호가 저장된 검증값과 같은지 확인한다. 비교는 상수 시간으로 한다.
 * 저장값이 깨졌으면 false로 숨기지 않고 PasswordVerifierFormatError를 던진다.
 */
export async function verifyLinkPassword(password: string, stored: string): Promise<boolean> {
  const { params, salt, hash } = parseVerifier(stored);
  assertPassword(password);
  const candidate = await derive(password, salt, params);
  return timingSafeEqual(candidate, hash);
}
