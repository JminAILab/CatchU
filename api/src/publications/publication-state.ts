export const PUBLICATION_STATES = ['ACTIVE', 'STOPPED', 'EXPIRED'] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/**
 * 발행본 상태는 저장하지 않고 이 함수로만 구한다(U4 기능 설계 Publication.state).
 * 중지가 만료보다 우선하고, 만료 시각과 같은 순간부터 만료다.
 */
export function publicationState(stoppedAt: Date | null, expiresAt: Date, now: Date): PublicationState {
  if (stoppedAt !== null) return 'STOPPED';
  return now.getTime() >= expiresAt.getTime() ? 'EXPIRED' : 'ACTIVE';
}
