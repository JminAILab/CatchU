import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import type { RunStatus } from '../ai-run/ai-run-spec';
import { inValues } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { Publication } from '../publications/publication.entity';

/** C-02 table-convention의 상태 이름 그대로(BR3.3). */
export const INDEX_STATUSES = ['PENDING', 'DONE', 'FAILED'] as const satisfies readonly RunStatus[];

/**
 * 발행본 하나의 색인 상태와 처리 시한(U3 소유, 기능 설계 entities.md PublicationIndex, 계약 C-02·C-08).
 *
 * - 발행 트랜잭션 안에서 chunkInTransaction이 PENDING·마감 = 발행 시각 + 10분으로 만든다(BR1.8).
 * - 상태는 PENDING→DONE, PENDING→FAILED, FAILED→PENDING([검색 다시 준비])만 바뀐다.
 * - 발행본 삭제·작성자 탈퇴 때 연쇄 삭제된다(C-06).
 */
@Entity('publication_index')
@ForeignKey(() => Publication, ['publicationId'], ['publicationId'], deleteWithParent)
@Check(inValues('status', INDEX_STATUSES))
export class PublicationIndex {
  @PrimaryColumn({ type: 'uuid' })
  publicationId!: string;

  @Column({ type: 'varchar' })
  status!: RunStatus;

  @Column({ type: 'timestamptz' })
  deadlineAt!: Date;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}
