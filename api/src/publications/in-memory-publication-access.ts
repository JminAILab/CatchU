import { randomUUID } from 'node:crypto';
import {
  LinkPasswordRequired, LinkUnavailable, NotFound, OwnerAccess, PublicationAccess, RecipientAccess,
} from './publication-access';
import { publicationState } from './publication-state';
import { PublishedSnapshot, PublishedSnapshotItem } from './published-snapshot';

/** 가짜 구현에 넣는 시험 발행본. 비밀번호 원문·검증값 대신 비밀번호 링크인지만 둔다 */
export interface FakePublication {
  publicationId: string;
  ownerMemberId: string;
  token: string;
  passwordProtected: boolean;
  title: string;
  publishedAt: Date;
  expiresAt: Date;
  stoppedAt: Date | null;
  items: PublishedSnapshotItem[];
}

/**
 * C-10 `PublicationAccess`의 메모리 가짜 구현(U4 첫 경계 제출). 소비 Unit(U5·U10·U9)의 시험에서 합성 제공자로 쓴다.
 * 시험 발행본·grant를 넣으면 판정 결과(RecipientAccess·OwnerAccess·LinkUnavailable·LinkPasswordRequired·NotFound)와
 * 사본을 정할 수 있다. grant 서명은 흉내 내지 않고 이 객체가 발급한 값만 통과시킨다.
 *
 * 시험 전용이다. 앱 모듈에 등록하지 않으며 실제 DB 구현은 U4 본체에서 만든다.
 */
export class InMemoryPublicationAccess implements PublicationAccess {
  private readonly publications = new Map<string, FakePublication>();
  private readonly grants = new Map<string, { publicationId: string; expiresAt: Date }>();

  /** resolveForOwner는 계약상 시각을 받지 않으므로 상태 계산에 이 시계를 쓴다 */
  constructor(private readonly clock: () => Date = () => new Date()) {}

  /** 같은 publicationId가 있으면 바꾼다(중지·만료 상황은 stoppedAt·expiresAt을 바꿔 넣는다) */
  put(publication: FakePublication): void {
    this.publications.set(publication.publicationId, structuredClone(publication));
  }

  /** 발행본 삭제 상황 */
  remove(publicationId: string): void {
    this.publications.delete(publicationId);
  }

  /** 비밀번호 통과 뒤 받은 grant 상황. 받은 값을 resolveForRecipient에 그대로 넘긴다 */
  issueGrant(publicationId: string, expiresAt: Date): string {
    const grant = `fake-grant-${randomUUID()}`;
    this.grants.set(grant, { publicationId, expiresAt });
    return grant;
  }

  async resolveForRecipient(token: string, grant: string | null, now: Date): Promise<RecipientAccess> {
    const publication = [...this.publications.values()].find((p) => p.token === token);
    if (!publication || publicationState(publication.stoppedAt, publication.expiresAt, now) !== 'ACTIVE') {
      throw new LinkUnavailable();
    }
    if (publication.passwordProtected) {
      const issued = grant === null ? undefined : this.grants.get(grant);
      if (!issued || issued.publicationId !== publication.publicationId || now.getTime() >= issued.expiresAt.getTime()) {
        throw new LinkPasswordRequired();
      }
    }
    return {
      publicationId: publication.publicationId,
      ownerMemberId: publication.ownerMemberId,
      passwordProtected: publication.passwordProtected,
      expiresAt: new Date(publication.expiresAt),
    };
  }

  async resolveForOwner(memberId: string, publicationId: string): Promise<OwnerAccess> {
    const publication = this.publications.get(publicationId);
    if (!publication || publication.ownerMemberId !== memberId) throw new NotFound();
    return { publicationId, state: publicationState(publication.stoppedAt, publication.expiresAt, this.clock()) };
  }

  /** 상태(중지·만료)는 판정하지 않고 사본만 돌려준다. 없으면(삭제) NotFound. DB 구현과 같다(#416 OQ-U4-NFR-5 결정 A) */
  async readSnapshot(publicationId: string): Promise<PublishedSnapshot> {
    const publication = this.publications.get(publicationId);
    if (!publication) throw new NotFound();
    return {
      title: publication.title,
      publishedAt: new Date(publication.publishedAt),
      expiresAt: new Date(publication.expiresAt),
      items: structuredClone(publication.items).sort((a, b) => a.position - b.position),
    };
  }
}
