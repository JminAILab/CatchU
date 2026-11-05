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
   * 순서: 토큰으로 발행본 찾기 → 삭제·중지·만료(LinkUnavailable) → 작성자 비활성(LinkUnavailable, 404)·작성자 회원 행 없음(내부 오류, 500)
   *   → 비밀번호 링크면 grant 확인(LinkPasswordRequired). 작성자 판정은 중지·만료 다음, 비밀번호 앞이다(#416 OQ-U4-NFR-6 결정, 2026-11-05).
   * grant는 publicationId에 묶인다. MCP 받은 링크 도구는 grant 없이(null) 부르므로 비밀번호 링크는 LinkPasswordRequired다.
   * 판정 통과 뒤 같은 요청이 진행되는 동안 중지·만료·작성자 비활성이 커밋되거나 만료 시각이 지나도, 그 요청을 그것만을 이유로
   * 취소하지 않는다. 그 요청의 접수·횟수 차감은 유효하고, 차단은 다음 요청의 재판정으로 한다(#416 OQ-U4-NFR-5 결정 A, 2026-11-04;
   * 작성자 비활성은 OQ-U4-NFR-6 결정, 2026-11-05).
   */
  resolveForRecipient(token: string, grant: string | null, now: Date): Promise<RecipientAccess>;
  /** 작성자 판정. 본인 발행본이면 중지·만료 뒤에도 돌려준다. 남의 발행본·없는 발행본은 구분 없이 NotFound */
  resolveForOwner(memberId: string, publicationId: string): Promise<OwnerAccess>;
  /**
   * 발행 사본만 읽는다(원본 Catch·자료를 읽지 않음). 받은 사람 쪽은 resolveForRecipient를 통과한 뒤에만 부른다.
   * 발행본 상태(중지·만료)는 판정하지 않으며, 판정 뒤 커밋된 중지·만료는 같은 요청의 사본 읽기에 반영되지 않는다.
   * 발행본 행이 없으면(삭제) 빈 사본 대신 NotFound. 받은 사람 경로는 판정 뒤 삭제로 확인된 경우에만, 곧 이 NotFound이거나
   * 그 요청의 쓰기가 발행본(publication_id)을 참조하는 외래 키 제약에서 거부된 경우(SQLSTATE 23503이고 거부한 제약이 publication을
   * 참조하는 것일 때)에 그 요청의 저장·차감을 되돌리고 404 LINK_UNAVAILABLE로 응답한다. 다른 제약의 23503을 포함해 삭제로
   * 확인되지 않은 DB 오류는 500 그대로다. 매핑은 각 소비 Unit이 자기 경로에서 한다(#416 OQ-U4-NFR-5 결정 A, 2026-11-04).
   */
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

/**
 * 작성자 쪽에서 남의 발행본·없는 발행본(작성자 경로는 404 RESOURCE_UNAVAILABLE로 응답한다)과 readSnapshot의 발행본 없음.
 * 받은 사람 경로에서 판정 뒤 만난 NotFound는 삭제로 보고 404 LINK_UNAVAILABLE로 응답한다(#416 OQ-U4-NFR-5 결정 A, 2026-11-04)
 */
export class NotFound extends Error {
  constructor() {
    super('publication not found');
    this.name = 'NotFound';
  }
}
