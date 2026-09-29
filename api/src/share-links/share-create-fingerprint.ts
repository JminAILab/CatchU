import { createHash } from 'node:crypto';
import { verifyLinkPassword } from './link-password';
import type { ShareCreateInput } from './share-create';

/**
 * 링크 발급 멱등 처리용 본문 정규화(ERD IdempotencyRecord.requestFingerprint).
 * 계약: 같은 키·정규화한 같은 본문은 기존 결과, 다른 본문은 409 IDEMPOTENCY_CONFLICT.
 *
 * 정규화 기준
 * - `validateShareCreate`를 통과한 값만 받는다. 제목은 앞뒤 공백만 제거한 값이며, 필드 순서·제목 앞뒤 공백은 결과에 영향이 없다.
 * - 제목 안쪽 공백·대소문자·유니코드 조합은 바꾸지 않는다. 제목 유일성 판정(trim만)과 같은 기준이다.
 * - 비밀번호는 지문에 넣지 않고 "설정 여부"만 넣는다. 짧은 비밀번호의 해시를 지문으로 저장하면 추측 공격으로
 *   원문을 알아낼 수 있어서다. 같은 키로 다시 보낸 비밀번호는 저장된 검증값(scrypt)으로 비교한다.
 *
 * 주의: 비밀번호만 다른 요청도 지문은 같다. 지문 일치만 보고 기존 응답을 돌려주면 안 된다.
 * 같은 키 재요청은 반드시 "기존 멱등 기록과 연결된 링크 조회 → isSameShareCreate() → 같으면 기존 응답, 다르면 409" 순서로 처리한다.
 */

const FINGERPRINT_VERSION = 1;
const OPERATION = 'createShareLink';

export function shareCreateFingerprint(input: ShareCreateInput): string {
  if (typeof input?.title !== 'string' || input.title.length === 0 || input.title !== input.title.trim()) {
    throw new TypeError('input must be the validated ShareCreate value');
  }
  const passwordSet = typeof input.password === 'string';
  const canonical = JSON.stringify([OPERATION, FINGERPRINT_VERSION, input.title, passwordSet]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface StoredShareCreate {
  /** 멱등 기록의 requestFingerprint */
  requestFingerprint: string;
  /** 그 기록이 가리키는 ShareLink의 비밀번호 검증값. 비밀번호 없는 링크는 null */
  passwordVerifier: string | null;
}

/**
 * 같은 키로 다시 온 요청이 처음 요청과 같은 본문인지 판정한다.
 * true면 기존 링크를 200으로 돌려주고, false면 409로 거절한다.
 */
export async function isSameShareCreate(input: ShareCreateInput, stored: StoredShareCreate): Promise<boolean> {
  if (shareCreateFingerprint(input) !== stored.requestFingerprint) return false;
  const passwordSet = typeof input.password === 'string';
  // 지문에 비밀번호 설정 여부가 들어 있으므로, 여기서 설정 여부가 어긋나면 기록과 링크가 맞지 않는 서버 자료 오류다.
  // 사용자에게 409로 알리지 않고 서버 오류(500)로 올린다.
  if (passwordSet !== (stored.passwordVerifier !== null)) {
    throw new Error('idempotency record and share link are inconsistent');
  }
  if (!passwordSet) return true;
  return verifyLinkPassword(input.password as string, stored.passwordVerifier as string);
}
