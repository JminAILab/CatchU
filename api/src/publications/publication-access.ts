// 계약 C-10 링크 조건 판정과 사본 읽기(U4 제공). 웹·질의응답·JD 요약·MCP가 같은 판정을 쓴다(NFR1, FR4.2, FR5.1).
// 이름·자료형·의미·오류를 바꾸는 변경은 깨는 변경이라 소비 Unit(U5·U10·U9)과 합의한 뒤 계약 수정 PR로 한다.
import { PublicationState } from './publication-state';
import { PublishedSnapshot } from './published-snapshot';

export type { PublicationState } from './publication-state';
export type { PublishedSnapshot, PublishedSnapshotItem } from './published-snapshot';

export interface RecipientAccess {
  publicationId: string;
  ownerMemberId: string;
  passwordProtected: boolean;
  expiresAt: Date;
}

export interface OwnerAccess {
  publicationId: string;
  state: PublicationState;
}

export interface PublicationAccess {
  /**
   * 받은 사람 판정. 호출마다 다시 판정한다(캐시 없음).
   * 순서: 토큰으로 발행본 찾기 → 삭제·중지·만료(LinkUnavailable) → 비밀번호 링크면 grant 확인(LinkPasswordRequired).
   * grant는 publicationId에 묶인다. MCP 받은 링크 도구는 grant 없이(null) 부르므로 비밀번호 링크는 LinkPasswordRequired다.
   */
  resolveForRecipient(token: string, grant: string | null, now: Date): Promise<RecipientAccess>;
  /** 작성자 판정. 본인 발행본이면 중지·만료 뒤에도 돌려준다. 남의 발행본·없는 발행본은 구분 없이 NotFound */
  resolveForOwner(memberId: string, publicationId: string): Promise<OwnerAccess>;
  /** 발행 사본만 읽는다(원본 Catch·자료를 읽지 않음). 받은 사람 쪽은 resolveForRecipient를 통과한 뒤에만 부른다 */
  readSnapshot(publicationId: string): Promise<PublishedSnapshot>;
}

/** 없음·삭제·중지·만료를 구분하지 않는다. 받은 사람 경로는 404 LINK_UNAVAILABLE로 응답한다 */
export class LinkUnavailable extends Error {
  constructor() {
    super('link unavailable');
    this.name = 'LinkUnavailable';
  }
}

/** grant 없음·서명 틀림·다른 발행본 grant·grant 만료. 받은 사람 경로는 401 LINK_PASSWORD_REQUIRED로 응답한다 */
export class LinkPasswordRequired extends Error {
  constructor() {
    super('link password required');
    this.name = 'LinkPasswordRequired';
  }
}

/** 작성자 쪽에서 남의 발행본·없는 발행본. 작성자 경로는 404 RESOURCE_UNAVAILABLE로 응답한다 */
export class NotFound extends Error {
  constructor() {
    super('publication not found');
    this.name = 'NotFound';
  }
}
