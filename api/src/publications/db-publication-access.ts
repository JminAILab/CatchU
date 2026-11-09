// 계약 C-10 PublicationAccess의 DB 구현(U4 제출 2, 기능 설계 BR6.1·BR6.2·BR6.4·BR6.5, 보안 설계 「링크 판정」·「소유 회원 비활성 (R-06)」,
// NFR1.3·NFR1.4·NFR1.6·NFR1.12·NFR4.7). 판정 결과·사본을 캐시하지 않고 호출마다 DB에서 다시 판정한다.
// 앱에는 PublicationsModule이 PUBLICATION_ACCESS 토큰으로 등록한다. 시험용 메모리 가짜(in-memory-publication-access.ts)는 운영 코드에 두지 않는다.
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OwnerProfileReader } from '../member-profile/owner-profile-reader';
import { LINK_GRANT_KEY, verifyLinkGrant } from '../share-links/link-grant';
import { isLinkTokenFormat } from '../share-links/link-token';
import {
  LinkPasswordRequired, LinkUnavailable, NotFound, OwnerAccess, PublicationAccess, RecipientAccess,
} from './publication-access';
import { publicationState } from './publication-state';
import { Clock, PUBLICATIONS_CLOCK } from './publications-config';
import { isUuid } from './publish-input';
import { ItemSnapshot, PublishedItemKind, PublishedPdfPage, PublishedSnapshot, PublishedSnapshotItem } from './published-snapshot';

/** publication 한 행. 토큰 원문(`linkTokenReference`)은 링크 주소를 만들 때만 쓰고 로그·오류·다른 응답 칸에 싣지 않는다(BR10.2). */
export interface PublicationRow {
  publicationId: string;
  memberId: string;
  title: string;
  linkTokenReference: string;
  passwordProtectionReference: string | null;
  publishedAt: Date;
  expiresAt: Date;
  stoppedAt: Date | null;
}

interface ItemRow {
  publishedItemId: string;
  position: number;
  itemKind: PublishedItemKind;
  title: string;
  snapshot: ItemSnapshot;
}

interface PdfPageRow extends PublishedPdfPage {
  publishedItemId: string;
}

/**
 * 같은 판정 시점에 유효한 발행본의 소유 회원 행이 없다(데이터 불일치, #416 OQ-U4-NFR-6 결정 2026-11-05).
 * 공통 필터가 500 INTERNAL_ERROR(고정 본문)로 응답하며 토큰·SQL을 담지 않는다.
 */
export class PublicationOwnerMissing extends Error {
  override readonly name = 'PublicationOwnerMissing';

  constructor() {
    super('유효한 발행본의 소유 회원 행이 없습니다.');
  }
}

/** unlock 판정 결과(제출 3). 검증값은 비밀번호 비교에만 쓰고 응답·로그에 싣지 않는다. */
export interface UnlockJudgement {
  publicationId: string;
  expiresAt: Date;
  /** 비밀번호 링크의 scrypt 검증값. 비밀번호 없는 링크는 null */
  passwordVerifier: string | null;
}

export const PUBLICATION_COLUMNS = `publication_id AS "publicationId", member_id AS "memberId", title,
  link_token_reference AS "linkTokenReference", password_protection_reference AS "passwordProtectionReference",
  published_at AS "publishedAt", expires_at AS "expiresAt", stopped_at AS "stoppedAt"`;

/** 작성자 조건(`member_id = 인증 회원`)으로 발행본 한 행을 읽는다. 남의 것·없는 것은 구분 없이 null(BR6.5, NFR1.1). */
export async function readOwnedPublication(manager: EntityManager, memberId: string, publicationId: string): Promise<PublicationRow | null> {
  if (!isUuid(memberId) || !isUuid(publicationId)) return null;
  const rows: PublicationRow[] = await manager.query(
    `SELECT ${PUBLICATION_COLUMNS} FROM publication WHERE member_id = $1 AND publication_id = $2`,
    [memberId.toLowerCase(), publicationId.toLowerCase()]);
  return rows[0] ?? null;
}

@Injectable()
export class DbPublicationAccess implements PublicationAccess {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(LINK_GRANT_KEY) private readonly grantKey: Buffer,
    private readonly owners: OwnerProfileReader,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
  ) {}

  /** 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 판정한다(발행본과 소유 회원 상태를 같은 스냅샷으로 읽는다). */
  async resolveForRecipient(token: string, grant: string | null, now: Date): Promise<RecipientAccess> {
    // 형식이 틀린 토큰은 트랜잭션을 열지 않고 끝낸다(NFR1.12). 같은 검사가 아래에도 있어 manager 경로도 같은 순서다.
    if (!isLinkTokenFormat(token)) throw new LinkUnavailable();
    return this.readOnly((manager) => this.resolveForRecipientIn(manager, token, grant, now));
  }

  /**
   * 넘겨받은 manager로 판정한다. U4 열람 경로(제출 3)가 판정과 사본 읽기를 한 트랜잭션에 묶을 때 쓴다(보안 설계 R-04).
   * manager는 활성 REPEATABLE READ(이상) 트랜잭션이어야 한다(OwnerProfileReader가 요구).
   * 순서: 토큰 형식 → 발행본 조회 → 중지·만료 → 소유 회원 비활성(404)·회원 없음(500) → 비밀번호 링크면 grant.
   */
  async resolveForRecipientIn(manager: EntityManager, token: string, grant: string | null, now: Date): Promise<RecipientAccess> {
    const publication = await this.readUsablePublicationIn(manager, token, now);
    if (publication.passwordProtectionReference !== null
      && !verifyLinkGrant(this.grantKey, grant, publication.publicationId, now)) {
      throw new LinkPasswordRequired();
    }
    return {
      publicationId: publication.publicationId,
      ownerMemberId: publication.memberId,
      passwordProtected: publication.passwordProtectionReference !== null,
      expiresAt: new Date(publication.expiresAt),
    };
  }

  /**
   * unlock용 판정(U4 제출 3, 계약 밖의 클래스 메서드). grant를 보지 않고 토큰 형식 → 발행본 → 중지·만료 → 소유 회원 상태까지만 판정해
   * 비밀번호 검증값을 돌려준다(BR6.3 ①, 10월 `usableLink`와 같은 순서). 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 돌고 돌아오기 전에 닫힌다.
   */
  async resolveForUnlock(token: string, now: Date): Promise<UnlockJudgement> {
    if (!isLinkTokenFormat(token)) throw new LinkUnavailable();
    const publication = await this.readOnly((manager) => this.readUsablePublicationIn(manager, token, now));
    return {
      publicationId: publication.publicationId,
      expiresAt: new Date(publication.expiresAt),
      passwordVerifier: publication.passwordProtectionReference,
    };
  }

  /**
   * 지금 열 수 있는 발행본 한 행. 순서: 토큰 형식 → 발행본 조회 → 중지·만료 → 소유 회원 비활성(404)·회원 행 없음(500).
   * 발행본과 소유 회원 상태는 같은 스냅샷(manager)으로 읽는다. grant는 보지 않는다.
   */
  private async readUsablePublicationIn(manager: EntityManager, token: string, now: Date): Promise<PublicationRow> {
    // 형식이 틀린 토큰은 조회 없이 없는 링크와 같다(NFR1.12, 10월 동작 그대로).
    if (!isLinkTokenFormat(token)) throw new LinkUnavailable();
    const rows: PublicationRow[] = await manager.query(
      `SELECT ${PUBLICATION_COLUMNS} FROM publication WHERE link_token_reference = $1`, [token]);
    const publication = rows[0];
    if (!publication || publicationState(publication.stoppedAt, publication.expiresAt, now) !== 'ACTIVE') throw new LinkUnavailable();
    // #416 OQ-U4-NFR-6 결정(2026-11-05): 비활성 소유자(작성자)는 다른 불가 사유와 같은 404, 회원 행 없음은 데이터 불일치 500. 중지·만료 다음, grant 앞.
    const ownerState = await this.owners.readOwnerState(publication.memberId, manager);
    if (ownerState === 'INACTIVE') throw new LinkUnavailable();
    if (ownerState === 'NO_MEMBER') throw new PublicationOwnerMissing();
    return publication;
  }

  /** 계약상 시각을 받지 않으므로 상태 계산에 모듈 시계를 쓴다. 중지가 만료보다 우선한다(BR6.5). */
  async resolveForOwner(memberId: string, publicationId: string): Promise<OwnerAccess> {
    const publication = await readOwnedPublication(this.dataSource.manager, memberId, publicationId);
    if (!publication) throw new NotFound();
    return {
      publicationId: publication.publicationId,
      state: publicationState(publication.stoppedAt, publication.expiresAt, this.clock()),
    };
  }

  readSnapshot(publicationId: string): Promise<PublishedSnapshot> {
    return this.readOnly((manager) => this.readSnapshotIn(manager, publicationId));
  }

  /**
   * published_item만 읽는다(원본 catch_asset·text_material은 읽지 않음, BR6.4·NFR1.4).
   * 발행본 행이 없으면 빈 사본을 만들지 않고 NotFound로 실패한다(계약의 NotFound, #416 OQ-U4-NFR-5 결정 2026-11-04).
   * 상태(중지·만료·소유 회원)는 판정하지 않는다. 판정 뒤 커밋된 중지·만료는 다음 호출의 resolveForRecipient가 막는다.
   * PDF 항목(U8)이 있을 때만 쪽 사본 표를 읽는다. U4 항목의 pdfPages는 null이다.
   */
  async readSnapshotIn(manager: EntityManager, publicationId: string): Promise<PublishedSnapshot> {
    if (!isUuid(publicationId)) throw new NotFound();
    const id = publicationId.toLowerCase();
    const rows: Pick<PublicationRow, 'title' | 'publishedAt' | 'expiresAt'>[] = await manager.query(
      'SELECT title, published_at AS "publishedAt", expires_at AS "expiresAt" FROM publication WHERE publication_id = $1', [id]);
    const publication = rows[0];
    if (!publication) throw new NotFound();
    const items: ItemRow[] = await manager.query(`
      SELECT published_item_id AS "publishedItemId", position, item_kind AS "itemKind", title, snapshot
      FROM published_item WHERE publication_id = $1 ORDER BY position ASC`, [id]);
    const pages = items.some((item) => item.itemKind === 'PDF_MATERIAL') ? await readPdfPages(manager, id) : new Map<string, PublishedPdfPage[]>();
    return {
      title: publication.title,
      publishedAt: new Date(publication.publishedAt),
      expiresAt: new Date(publication.expiresAt),
      items: items.map((item): PublishedSnapshotItem => ({
        publishedItemId: item.publishedItemId,
        position: item.position,
        itemKind: item.itemKind,
        title: item.title,
        snapshot: item.snapshot,
        pdfPages: item.itemKind === 'PDF_MATERIAL' ? pages.get(item.publishedItemId) ?? [] : null,
      })),
    };
  }

  private readOnly<T>(run: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      return run(manager);
    });
  }
}

/** 쪽별 사본(published_pdf_page, U8 소유)을 항목별로 모은다. U4는 PDF 항목을 만들지 않으므로 지금은 불리지 않는다. */
async function readPdfPages(manager: EntityManager, publicationId: string): Promise<Map<string, PublishedPdfPage[]>> {
  const rows: PdfPageRow[] = await manager.query(`
    SELECT p.published_item_id AS "publishedItemId", p.page_number AS "pageNumber", p.text, p.readable
    FROM published_pdf_page p JOIN published_item i ON i.published_item_id = p.published_item_id
    WHERE i.publication_id = $1 ORDER BY p.published_item_id, p.page_number`, [publicationId]);
  const pages = new Map<string, PublishedPdfPage[]>();
  for (const row of rows) {
    const list = pages.get(row.publishedItemId) ?? [];
    list.push({ pageNumber: row.pageNumber, text: row.text, readable: row.readable });
    pages.set(row.publishedItemId, list);
  }
  return pages;
}
