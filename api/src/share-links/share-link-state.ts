/**
 * 공유 링크 상태 판정(ERD ShareLink 제약, #148 9/29 팀장 결정).
 * - 유효: `stoppedAt`이 없고 현재 시각이 `expiresAt`보다 이르다.
 * - 중단이 만료보다 우선한다. 이미 중단한 링크는 만료 시각이 지나도 STOPPED다.
 * - 만료는 배치로 바꾸지 않고 요청 시각으로 판정한다.
 */

export type ShareLinkState = 'ACTIVE' | 'STOPPED' | 'EXPIRED';

export interface ShareLinkTimes {
  expiresAt: Date;
  stoppedAt: Date | null;
}

function assertTime(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }
}

export function shareLinkState(link: ShareLinkTimes, now: Date): ShareLinkState {
  assertTime(link.expiresAt, 'expiresAt');
  assertTime(now, 'now');
  if (link.stoppedAt !== null) {
    assertTime(link.stoppedAt, 'stoppedAt');
    return 'STOPPED';
  }
  return now.getTime() < link.expiresAt.getTime() ? 'ACTIVE' : 'EXPIRED';
}

export function isShareLinkValidAt(link: ShareLinkTimes, now: Date): boolean {
  return shareLinkState(link, now) === 'ACTIVE';
}
