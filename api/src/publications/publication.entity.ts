import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { inValues, lengthBetween } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { ItemSnapshot, PUBLISHED_ITEM_KINDS, PublishedItemKind } from './published-snapshot';

/** 발행 시각부터 정확히 90×24시간(계약 C-07). */
export const PUBLICATION_TTL_HOURS = 2160;

/**
 * 고정 발행본과 그 링크 하나(계약 C-07, U4 소유).
 *
 * - 상태(ACTIVE·STOPPED·EXPIRED)는 칼럼으로 저장하지 않고 `stoppedAt`·`expiresAt`과 현재 시각으로 구한다(publication-state.ts).
 * - `linkTokenReference`는 토큰 원문이다(10월 share_link와 같음, #162 합의). 링크 주소 밖의 응답·로그·오류에는 싣지 않는다.
 * - 비밀번호 원문·grant는 저장하지 않는다. `passwordProtectionReference`는 10월 방식의 검증값이며 발행 뒤 바뀌지 않는다.
 * - 제목 길이 상한은 DB 제약이 아니라 U4 API 검증이다.
 */
@Entity('publication')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check(lengthBetween('title', 1))
@Check(`"expires_at" = "published_at" + interval '${PUBLICATION_TTL_HOURS} hours'`)
@Check('"stopped_at" IS NULL OR "stopped_at" >= "published_at"')
@Index(['memberId'])
export class Publication {
  @PrimaryColumn({ type: 'uuid' })
  publicationId: string = randomUUID();

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', unique: true })
  linkTokenReference!: string;

  @Column({ type: 'text', nullable: true })
  passwordProtectionReference!: string | null;

  @Column({ type: 'timestamptz' })
  publishedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  stoppedAt!: Date | null;
}

/**
 * 발행본에 고정한 항목 하나(계약 C-07, U4 소유). 원본(`sourceId`)과는 외래 키 없이 발행본 수명을 따른다.
 *
 * - 항목 수 상한은 DB 제약이 아니라 U4 API 검증이다. DB는 계약대로 `position >= 1`만 막는다.
 * - `unique(publicationId, publishedItemId)`는 U3 published_chunk의 복합 외래 키가 가리킬 부모 짝이다(C-06).
 * - PDF_MATERIAL 항목과 그 쪽 사본(published_pdf_page)은 U8이 만든다(후순위).
 */
@Entity('published_item')
@ForeignKey(() => Publication, ['publicationId'], ['publicationId'], deleteWithParent)
@Unique(['publicationId', 'position'])
@Unique(['publicationId', 'publishedItemId'])
@Check('"position" >= 1')
@Check(inValues('item_kind', PUBLISHED_ITEM_KINDS))
@Check(`("item_kind" = 'PDF_MATERIAL') = ("pdf_copy_key" IS NOT NULL)`)
export class PublishedItem {
  @PrimaryColumn({ type: 'uuid' })
  publishedItemId: string = randomUUID();

  @Column({ type: 'uuid' })
  publicationId!: string;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'varchar' })
  itemKind!: PublishedItemKind;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'jsonb' })
  snapshot!: ItemSnapshot;

  @Column({ type: 'text', nullable: true })
  pdfCopyKey!: string | null;
}
