// C-10 PublicationAccess 오류 → U5 HTTP 응답 대응표(계약 C-10·C-12, 기능 설계 BR2.1·BR6.1·BR6.4·BR7.1, security-design NFR1.1·NFR1.2).
// 받은 사람 경로 둘(질의응답·요약)과 작성자 경로 둘(요약·다시 만들기)이 같이 쓴다. 대응표에 없는 오류는 그대로 다시 던진다.
import { ApiError, type ErrorCode } from '../common/errors';
import { LinkPasswordRequired, LinkUnavailable, NotFound } from '../publications/publication-access';

/** 경로별 대응표 함수의 모양. */
export type ErrorCodeOf = (error: unknown) => ErrorCode | null;

/**
 * 받은 사람 경로. 없음·삭제·중지·만료는 구분 없이 404 LINK_UNAVAILABLE, 비밀번호 필요·grant 거부는 401 LINK_PASSWORD_REQUIRED.
 * 판정 뒤 사본을 읽는 사이 발행본이 지워진 경우(NotFound)도 받은 사람에게는 같은 404다.
 */
export function recipientAccessCode(error: unknown): ErrorCode | null {
  if (error instanceof LinkUnavailable || error instanceof NotFound) return 'LINK_UNAVAILABLE';
  if (error instanceof LinkPasswordRequired) return 'LINK_PASSWORD_REQUIRED';
  return null;
}

/** 작성자 경로. 남의 발행본과 없는 발행본을 구분하지 않는 404 RESOURCE_UNAVAILABLE. */
export function ownerAccessCode(error: unknown): ErrorCode | null {
  return error instanceof NotFound ? 'RESOURCE_UNAVAILABLE' : null;
}

/** 대응표에 있으면 ApiError로 바꿔 던지고, 없으면 원래 오류를 그대로 던진다(삼키지 않는다). */
export function rethrowAccessError(error: unknown, codeOf: ErrorCodeOf): never {
  const code = codeOf(error);
  if (code !== null) throw new ApiError(code);
  throw error;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 경로로 받은 발행본 ID는 조회 전에 형식을 본다. 틀리면 없는 발행본과 같은 404다(CONVENTIONS 「ID 형식 확인」). */
export function assertPublicationId(publicationId: string): void {
  if (!UUID.test(publicationId)) throw new ApiError('RESOURCE_UNAVAILABLE');
}
