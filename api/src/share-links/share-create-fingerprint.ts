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
 * 같은 키 재요청은 반드시 "기존 멱등 기록과 연결된 링크 조회 → isSameShareCreate()(또는 matchStoredShareCreate()와
 * 잠금 밖의 verifyPendingPassword()) → 같으면 기존 응답, 다르면 409" 순서로 처리한다.
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

/** 비밀번호까지 같은지 확인하려고 남긴 비교 대상. 잠금을 놓은 뒤 `verifyLinkPassword`로 비교한다. */
export interface PendingPasswordCheck {
  password: string;
  verifier: string;
}

export type StoredShareCreateMatch =
  | { same: false }
  | { same: true; passwordCheck: PendingPasswordCheck | null };

/**
 * 본문 지문과 비밀번호 설정 여부까지만 판정한다. 해시를 계산하지 않으므로 키 잠금 안에서 불러도 CPU·메모리를 오래 쓰지 않는다.
 * `same: true`이고 `passwordCheck`가 있으면 호출한 쪽이 반드시 그 값을 비교해야 같은 본문으로 볼 수 있다.
 * 비교 대상은 이 호출이 읽은 저장값이므로, 비교를 잠금 밖으로 옮겨도 판정 대상이 바뀌지 않는다.
 */
export function matchStoredShareCreate(input: ShareCreateInput, stored: StoredShareCreate): StoredShareCreateMatch {
  if (shareCreateFingerprint(input) !== stored.requestFingerprint) return { same: false };
  const passwordSet = typeof input.password === 'string';
  // 지문에 비밀번호 설정 여부가 들어 있으므로, 여기서 설정 여부가 어긋나면 기록과 링크가 맞지 않는 서버 자료 오류다.
  // 사용자에게 409로 알리지 않고 서버 오류(500)로 올린다.
  if (passwordSet !== (stored.passwordVerifier !== null)) {
    throw new Error('idempotency record and share link are inconsistent');
  }
  if (!passwordSet) return { same: true, passwordCheck: null };
  return { same: true, passwordCheck: { password: input.password as string, verifier: stored.passwordVerifier as string } };
}

/** 비교 대상이 있으면 비밀번호가 같을 때만 true다. 대상이 없으면(비밀번호 없는 링크) true다. */
export async function verifyPendingPassword(check: PendingPasswordCheck | null): Promise<boolean> {
  return check === null ? true : verifyLinkPassword(check.password, check.verifier);
}

/**
 * 같은 키로 다시 온 요청이 처음 요청과 같은 본문인지 판정한다.
 * true면 기존 링크를 200으로 돌려주고, false면 409로 거절한다.
 * 비밀번호 해시 비교를 이 함수 안에서 한다. 키 잠금 안에서는 `matchStoredShareCreate`를 쓰고 비교는 잠금 밖에서 한다.
 */
export async function isSameShareCreate(input: ShareCreateInput, stored: StoredShareCreate): Promise<boolean> {
  const match = matchStoredShareCreate(input, stored);
  return match.same && verifyPendingPassword(match.passwordCheck);
}
