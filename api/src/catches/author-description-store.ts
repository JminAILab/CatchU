import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { authorDescriptionInput } from './author-description-input';
import { catchIdInput, isUuid } from './owner-catch-input';

/** 작성자 설명 응답(U4 기능 명세 「작성자 API」). 설명이 없으면 두 칸 모두 null이다. */
export interface AuthorDescriptionResponse {
  authorDescription: string | null;
  authorDescriptionUpdatedAt: Date | null;
}

interface DescriptionRow {
  authorDescription: string | null;
  authorDescriptionUpdatedAt: Date | null;
}

/**
 * Catch 작성자 설명(계약 C-14, U4 소유) 읽기·저장.
 *
 * - 조회 조건에 소유자를 넣는다. 남의 Catch·없는 Catch·UUID 형식이 아닌 ID는 같은 404다(BR10.1, NFR1.1·NFR1.8).
 * - 저장은 덮어쓰기이며 마지막 저장이 남는다. 버전 비교·잠금 경고는 없다(BR2.1).
 * - 설명 두 칸만 바꾼다. AI 초안·확인·공개 상태와 결과 반영 경로는 이 칸을 쓰지 않는다(BR1.3·BR1.4).
 * - 설명 본문은 로그·오류에 남기지 않는다(BR10.2). 이 클래스는 로그를 쓰지 않는다.
 * - `publications`를 import하지 않는다(U4 비기능 설계 「의존 방향」).
 */
@Injectable()
export class AuthorDescriptionStore {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async read(memberId: string, catchIdValue: unknown): Promise<AuthorDescriptionResponse> {
    const owner = ownerId(memberId);
    const catchId = catchIdInput(catchIdValue);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await assertMemberExists(manager, owner);
      if (!isUuid(catchId)) throw new NotFoundException();
      const rows: DescriptionRow[] = await manager.query(`
        SELECT author_description AS "authorDescription", author_description_updated_at AS "authorDescriptionUpdatedAt"
        FROM catch_asset WHERE owner_id = $1 AND catch_id = $2`, [owner, catchId.toLowerCase()]);
      if (rows.length === 0) throw new NotFoundException();
      return toResponse(rows[0]);
    });
  }

  async save(memberId: string, catchIdValue: unknown, body: unknown): Promise<AuthorDescriptionResponse> {
    const description = authorDescriptionInput(body);
    const owner = ownerId(memberId);
    const catchId = catchIdInput(catchIdValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (!isUuid(catchId)) throw new NotFoundException();
      // 설명 두 칸만 갱신하므로 키를 보호하는 외래 키 잠금과 공존한다. 앞뒤 공백만 있으면 두 칸 모두 NULL(BR1.2).
      const [rows] = await manager.query(`
        UPDATE catch_asset
        SET author_description = $3::text,
            author_description_updated_at = CASE WHEN $3::text IS NULL THEN NULL ELSE clock_timestamp() END
        WHERE owner_id = $1 AND catch_id = $2
        RETURNING author_description AS "authorDescription", author_description_updated_at AS "authorDescriptionUpdatedAt"`,
      [owner, catchId.toLowerCase(), description]) as [DescriptionRow[], number];
      if (rows.length === 0) throw new NotFoundException();
      return toResponse(rows[0]);
    });
  }
}

function ownerId(memberId: string): string {
  const value = memberId.toLowerCase();
  if (!isUuid(value)) throw new ApiError('AUTH_INVALID');
  return value;
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 조회·수정이 끝날 때까지 회원 삭제를 막는다. 다른 DB 오류는 서버 오류로 둔다(10월 OwnerCatchStore와 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

function toResponse(row: DescriptionRow): AuthorDescriptionResponse {
  // DB CHECK가 두 칸을 함께 채우거나 함께 비우게 한다. 어긋난 값을 성공으로 내보내지 않는다.
  if ((row.authorDescription === null) !== (row.authorDescriptionUpdatedAt === null)) {
    throw new Error('저장된 Catch 설명 자료가 올바르지 않습니다.');
  }
  return { authorDescription: row.authorDescription, authorDescriptionUpdatedAt: row.authorDescriptionUpdatedAt };
}
