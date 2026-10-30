import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { inValues } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { PublishedItem } from '../publications/publication.entity';
import { CHUNK_SOURCE_KINDS, type ChunkSourceKind } from './chunker';
import { EMBEDDING_DIMENSION, MAX_CHUNK_LENGTH } from './embedding-config';

/**
 * 발행 사본 한 필드의 한 부분과 그 임베딩(U3 소유, 기능 설계 entities.md PublishedChunk, 계약 C-06·C-07·C-08).
 *
 * - `text`는 fieldPath가 가리키는 사본 필드 문자열의 [charStart, charEnd) 그대로다(UTF-16 코드 단위, BR1.2).
 * - `(publicationId, publishedItemId)` 복합 외래 키로 같은 발행본의 항목만 가리키고, 항목·발행본 삭제 때 연쇄 삭제된다(C-06).
 * - `catchEvidenceUrls`는 발행 트랜잭션 안에서 함께 저장한다. 검색은 이 칸만 읽고 published_item을 읽지 않는다(BR1.10·BR5.8).
 * - `embedding`은 발행 때 비어 있고 임베딩 작업이 발행본 단위로 한 번에 채운다(BR2.4). 근사 색인은 두지 않는다(NFR4.4).
 */
@Entity('published_chunk')
@ForeignKey(() => PublishedItem, ['publicationId', 'publishedItemId'], ['publicationId', 'publishedItemId'], deleteWithParent)
@Unique(['publicationId', 'seq'])
@Check('"seq" >= 1')
@Check('"char_start" >= 0')
@Check(`"char_end" > "char_start" AND "char_end" - "char_start" <= ${MAX_CHUNK_LENGTH}`)
@Check('"pdf_page" IS NULL OR "pdf_page" >= 1')
@Check(inValues('source_kind', CHUNK_SOURCE_KINDS))
export class PublishedChunk {
  @PrimaryColumn({ type: 'uuid' })
  chunkId: string = randomUUID();

  @Column({ type: 'uuid' })
  publicationId!: string;

  @Column({ type: 'uuid' })
  publishedItemId!: string;

  @Column({ type: 'integer' })
  seq!: number;

  @Column({ type: 'text' })
  fieldPath!: string;

  @Column({ type: 'integer' })
  charStart!: number;

  @Column({ type: 'integer' })
  charEnd!: number;

  @Column({ type: 'integer', nullable: true })
  pdfPage!: number | null;

  @Column({ type: 'varchar' })
  sourceKind!: ChunkSourceKind;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  catchEvidenceUrls!: string[];

  @Column({ type: 'vector', length: EMBEDDING_DIMENSION, nullable: true })
  embedding!: number[] | null;
}
