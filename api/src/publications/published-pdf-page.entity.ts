import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { PublishedItem } from './publication.entity';

/**
 * 발행 때 pdf_page_text를 복사해 고정한 발행본 소유 쪽 사본(계약 C-07 published_pdf_page, U8이 만든다).
 *
 * - 열 모양·외래 키·UNIQUE는 C-07 그대로다. 발행 항목(published_item, item_kind PDF_MATERIAL)을 따라 지워진다(C-06).
 * - `readable = (text <> '')`는 C-07의 "읽을 수 없는 쪽은 빈 문자열"을 양방향으로 굳힌 제약 강화다. 원본 표 pdf_page_text와
 *   같은 규칙이어야 INSERT ... SELECT 복사(BR4.3)가 실패하지 않는다. 열 모양은 바꾸지 않는 C-07 더하는 변경이다.
 * - 발행 뒤 갱신하지 않는다(사본). 원본이 바뀌거나 지워져도 바뀌지 않는다(BR4.4). U3 조각 나누기·U5 근거 강조·받은 사람 화면이 읽는다.
 */
@Entity('published_pdf_page')
@ForeignKey(() => PublishedItem, ['publishedItemId'], ['publishedItemId'], deleteWithParent)
@Unique(['publishedItemId', 'pageNumber'])
@Check('"page_number" >= 1')
@Check(`"readable" = ("text" <> '')`)
export class PublishedPdfPage {
  @PrimaryColumn({ type: 'uuid' })
  publishedPdfPageId: string = randomUUID();

  @Column({ type: 'uuid' })
  publishedItemId!: string;

  @Column({ type: 'integer' })
  pageNumber!: number;

  /** 읽을 수 없는 쪽은 빈 문자열. 신뢰할 수 없는 입력이라 화면은 텍스트 노드로만 그린다(BR3.5) */
  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'boolean' })
  readable!: boolean;
}
