import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { TextMaterialQuery, isUuid, nextTextMaterialCursor, textMaterialInput, textMaterialQuery } from './text-material-input';

/** 텍스트 자료 응답(U4 기능 명세 「작성자 API」). */
export interface TextMaterialResponse {
  textMaterialId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TextMaterialListItem {
  textMaterialId: string;
  title: string;
  updatedAt: Date;
}

export interface TextMaterialPage {
  items: TextMaterialListItem[];
  page: { nextCursor: string | null };
}

const COLUMNS = `text_material_id AS "textMaterialId", title, body, created_at AS "createdAt", updated_at AS "updatedAt"`;

/**
 * 텍스트 자료(계약 C-13, U4 소유) 저장소.
 *
 * - 모든 조회·수정·삭제는 `member_id = 인증 회원` 조건을 넣는다. 남의 것·없는 것·UUID 형식이 아닌 ID는 같은 404다(BR3.4, NFR1.1·NFR1.8).
 * - 수정은 덮어쓰기이며 마지막 저장이 남는다. 충돌 감지는 없다(BR2.1).
 * - 삭제는 행만 지운다. 이미 발행한 사본(`published_item`)은 외래 키가 없어 남는다(BR3.5).
 * - 본문은 로그·오류에 남기지 않는다(BR10.2). `publications`를 import하지 않는다(U4 비기능 설계 「의존 방향」).
 */
@Injectable()
export class TextMaterialStore {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async list(memberId: string, rawQuery: unknown): Promise<TextMaterialPage> {
    const owner = ownerId(memberId);
    const query = textMaterialQuery(owner, rawQuery);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await assertMemberExists(manager, owner);
      const rows: (TextMaterialListItem & { cursorAt: string })[] = await manager.query(`
        SELECT text_material_id AS "textMaterialId", title, updated_at AS "updatedAt",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
        FROM text_material
        WHERE member_id = $1 ${pageCondition(query)}
        ORDER BY created_at DESC, text_material_id DESC
        LIMIT $2`, pageValues(owner, query));
      const pageRows = rows.slice(0, query.limit);
      const last = pageRows[pageRows.length - 1];
      const nextCursor = rows.length > query.limit ? nextTextMaterialCursor(owner, last.cursorAt, last.textMaterialId) : null;
      return {
        items: pageRows.map(({ textMaterialId, title, updatedAt }) => ({ textMaterialId, title, updatedAt })),
        page: { nextCursor },
      };
    });
  }

  async create(memberId: string, body: unknown): Promise<TextMaterialResponse> {
    const input = textMaterialInput(body);
    const owner = ownerId(memberId);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      const rows: TextMaterialResponse[] = await manager.query(`
        INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, clock_timestamp(), clock_timestamp())
        RETURNING ${COLUMNS}`, [owner, input.title, input.body]);
      return single(rows);
    });
  }

  async get(memberId: string, idValue: unknown): Promise<TextMaterialResponse> {
    const owner = ownerId(memberId);
    const id = textMaterialId(idValue);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const rows: TextMaterialResponse[] = await manager.query(
        `SELECT ${COLUMNS} FROM text_material WHERE member_id = $1 AND text_material_id = $2`, [owner, id]);
      return single(rows);
    });
  }

  async update(memberId: string, idValue: unknown, body: unknown): Promise<TextMaterialResponse> {
    const input = textMaterialInput(body);
    const owner = ownerId(memberId);
    const id = textMaterialId(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const [rows] = await manager.query(`
        UPDATE text_material SET title = $3, body = $4, updated_at = clock_timestamp()
        WHERE member_id = $1 AND text_material_id = $2
        RETURNING ${COLUMNS}`, [owner, id, input.title, input.body]) as [TextMaterialResponse[], number];
      return single(rows);
    });
  }

  async remove(memberId: string, idValue: unknown): Promise<void> {
    const owner = ownerId(memberId);
    const id = textMaterialId(idValue);
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const [, deleted] = await manager.query(
        'DELETE FROM text_material WHERE member_id = $1 AND text_material_id = $2', [owner, id]) as [unknown[], number];
      if (deleted === 0) throw new NotFoundException();
    });
  }
}

function pageCondition(query: TextMaterialQuery): string {
  return query.after ? 'AND (created_at, text_material_id) < ($3::timestamptz, $4::uuid)' : '';
}

function pageValues(owner: string, query: TextMaterialQuery): unknown[] {
  const values: unknown[] = [owner, query.limit + 1];
  if (query.after) values.push(query.after.createdAt, query.after.textMaterialId);
  return values;
}

function ownerId(memberId: string): string {
  const value = memberId.toLowerCase();
  if (!isUuid(value)) throw new ApiError('AUTH_INVALID');
  return value;
}

/** 경로 ID. UUID 형식이 아니면 null이며 호출자는 회원 확인 뒤 없는 자료와 같은 404로 응답한다(NFR1.8). */
function textMaterialId(value: unknown): string | null {
  if (typeof value !== 'string' || !isUuid(value)) return null;
  return value.toLowerCase();
}

function single(rows: TextMaterialResponse[]): TextMaterialResponse {
  if (rows.length === 0) throw new NotFoundException();
  if (rows.length !== 1) throw new Error('텍스트 자료 조회 결과가 올바르지 않습니다.');
  return rows[0];
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 조회·수정이 끝날 때까지 회원 삭제를 막는다. 다른 DB 오류는 서버 오류로 둔다(10월 OwnerCatchStore와 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}
