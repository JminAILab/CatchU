// 작성자 발행본 관리(U4 W5·BR8.1·BR8.2·BR8.4, 신뢰성 설계 「삭제」·「링크 중지」, NFR5.3~NFR5.7, NFR4.11).
// 목록·상세·중지·삭제. C-09 합의 전이라 indexState 칸과 reindex 경로는 두지 않는다(OQ-U4-5).
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { FILE_STORAGE, type FileStorage, publicationPrefix } from '../file-storage/file-storage';
import { buildRecipientLinkUrl } from '../share-links/link-token';
import { SHARE_LINKS_CONFIG, ShareLinksConfig } from '../share-links/share-links.config';
import { DbPublicationAccess, PublicationRow, readOwnedPublication } from './db-publication-access';
import { PublicationState, publicationState } from './publication-state';
import { Clock, PUBLICATIONS_CLOCK } from './publications-config';
import { PublicationsLog } from './publications-log';
import { PublicationQuery, isUuid, nextPublicationCursor, publicationQuery } from './publish-input';
import { PublishedSnapshot } from './published-snapshot';

/** 목록 항목(U4 기능 명세 「작성자 API」, C-09 합의 전이라 indexState 없음). 토큰은 `url` 안에만 있다. */
export interface PublicationListItem {
  publicationId: string;
  title: string;
  url: string;
  state: PublicationState;
  publishedAt: Date;
  expiresAt: Date;
  passwordProtected: boolean;
}

export interface PublicationPage {
  items: PublicationListItem[];
  page: { nextCursor: string | null };
}

/** 상세(「작성자 API」 표 그대로). 제목·발행·만료 시각은 snapshot 안에 있다. */
export interface PublicationDetail {
  publicationId: string;
  url: string;
  state: PublicationState;
  passwordProtected: boolean;
  snapshot: PublishedSnapshot;
}

export interface StopResponse {
  state: PublicationState;
  stoppedAt: Date | null;
}

type ListRow = Omit<PublicationRow, 'memberId'> & { cursorAt: string };

@Injectable()
export class PublicationManageService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SHARE_LINKS_CONFIG) private readonly config: ShareLinksConfig,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    private readonly access: DbPublicationAccess,
    private readonly log: PublicationsLog,
  ) {}

  /** 본인 발행본을 발행 시각 최신순(같은 시각은 ID 역순)으로 cursor로 읽는다(BR8.1). 상태는 응답 시각으로 구한다. */
  async list(memberId: string, rawQuery: unknown): Promise<PublicationPage> {
    const owner = ownerId(memberId);
    const query = publicationQuery(owner, rawQuery);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await assertMemberExists(manager, owner);
      const rows: ListRow[] = await manager.query(`
        SELECT publication_id AS "publicationId", title, link_token_reference AS "linkTokenReference",
          password_protection_reference AS "passwordProtectionReference", published_at AS "publishedAt", expires_at AS "expiresAt",
          stopped_at AS "stoppedAt", to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
        FROM publication
        WHERE member_id = $1 ${query.after ? 'AND (published_at, publication_id) < ($3::timestamptz, $4::uuid)' : ''}
        ORDER BY published_at DESC, publication_id DESC
        LIMIT $2`, pageValues(owner, query));
      const now = this.clock();
      const pageRows = rows.slice(0, query.limit);
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map((row) => this.toListItem(row, now)),
        page: { nextCursor: rows.length > query.limit ? nextPublicationCursor(owner, last.cursorAt, last.publicationId) : null },
      };
    });
  }

  /** 상세: 소유 판정과 사본 읽기를 같은 REPEATABLE READ 스냅샷에서 한다. 중지·만료 뒤에도 본다(BR6.5·BR8.1). */
  async get(memberId: string, idValue: unknown): Promise<PublicationDetail> {
    const owner = ownerId(memberId);
    const publicationId = pathId(idValue);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await assertMemberExists(manager, owner);
      const publication = publicationId === null ? null : await readOwnedPublication(manager, owner, publicationId);
      if (!publication) throw new NotFoundException();
      const snapshot = await this.access.readSnapshotIn(manager, publication.publicationId);
      return {
        publicationId: publication.publicationId,
        url: buildRecipientLinkUrl(this.config.webBaseUrl, publication.linkTokenReference),
        state: publicationState(publication.stoppedAt, publication.expiresAt, this.clock()),
        passwordProtected: publication.passwordProtectionReference !== null,
        snapshot,
      };
    });
  }

  /**
   * 링크 중지(BR8.2, NFR5.7). 행을 잠그고 상태를 다시 구한다: ACTIVE면 stopped_at = now, STOPPED면 처음 값 유지,
   * EXPIRED면 쓰지 않고 { EXPIRED, null }. 되살리기·연장은 없다.
   */
  async stop(memberId: string, idValue: unknown): Promise<StopResponse> {
    const owner = ownerId(memberId);
    const publicationId = pathId(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (publicationId === null) throw new NotFoundException();
      const rows: Pick<PublicationRow, 'stoppedAt' | 'expiresAt'>[] = await manager.query(
        'SELECT stopped_at AS "stoppedAt", expires_at AS "expiresAt" FROM publication WHERE member_id = $1 AND publication_id = $2 FOR UPDATE',
        [owner, publicationId]);
      const publication = rows[0];
      if (!publication) throw new NotFoundException();
      const now = this.clock();
      const state = publicationState(publication.stoppedAt, publication.expiresAt, now);
      if (state === 'STOPPED') return { state, stoppedAt: new Date(publication.stoppedAt as Date) };
      if (state === 'EXPIRED') return { state, stoppedAt: null };
      await manager.query('UPDATE publication SET stopped_at = $3 WHERE member_id = $1 AND publication_id = $2', [owner, publicationId, now]);
      return { state: 'STOPPED', stoppedAt: now };
    });
  }

  /**
   * 삭제(BR8.4, NFR5.3·NFR5.4): 소유 확인 → 파일 저장소의 발행본 접두어 삭제(없으면 성공) → 성공하면 publication 행 삭제(항목·색인·조각·
   * 요약은 외래 키 연쇄). 접두어 삭제가 실패하면 500 INTERNAL_ERROR로 끝내고 DB를 지우지 않는다(사람이 다시 시도).
   */
  async remove(memberId: string, idValue: unknown): Promise<void> {
    const owner = ownerId(memberId);
    const publicationId = pathId(idValue);
    // 목록·상세·중지와 같은 순서로 회원 행을 먼저 확인한다(회원 없음은 401, 없는 발행본·남의 것·형식 오류 ID는 404).
    // 접두어 삭제는 DB 트랜잭션 밖에서 하므로 소유 확인만 짧은 트랜잭션으로 묶는다.
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (publicationId === null) throw new NotFoundException();
      if (await readOwnedPublication(manager, owner, publicationId) === null) throw new NotFoundException();
    });
    if (publicationId === null) throw new NotFoundException();
    try {
      await this.files.deletePrefix(publicationPrefix(owner, publicationId));
    } catch {
      // 원인 종류·경로는 남기지 않는다. 파일 저장소 쪽 로그는 U2가 남긴다.
      this.log.prefixDeleteFailed(publicationId, owner);
      throw new ApiError('INTERNAL_ERROR');
    }
    const [, deleted] = await this.dataSource.query(
      'DELETE FROM publication WHERE member_id = $1 AND publication_id = $2', [owner, publicationId]) as [unknown[], number];
    // 소유 확인 뒤 다른 요청이 먼저 지웠으면 없는 것과 같다.
    if (deleted === 0) throw new NotFoundException();
  }

  private toListItem(row: ListRow, now: Date): PublicationListItem {
    return {
      publicationId: row.publicationId,
      title: row.title,
      url: buildRecipientLinkUrl(this.config.webBaseUrl, row.linkTokenReference),
      state: publicationState(row.stoppedAt, row.expiresAt, now),
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      passwordProtected: row.passwordProtectionReference !== null,
    };
  }
}

function pageValues(owner: string, query: PublicationQuery): unknown[] {
  const values: unknown[] = [owner, query.limit + 1];
  if (query.after) values.push(query.after.publishedAt, query.after.publicationId);
  return values;
}

function ownerId(memberId: string): string {
  const value = memberId.toLowerCase();
  if (!isUuid(value)) throw new ApiError('AUTH_INVALID');
  return value;
}

/** 경로 ID. UUID 형식이 아니면 null이며 호출자는 회원 확인 뒤 없는 발행본과 같은 404로 응답한다(NFR1.8). */
function pathId(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 조회·수정이 끝날 때까지 회원 삭제를 막는다. 다른 DB 오류는 서버 오류로 둔다(제출 1과 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}
