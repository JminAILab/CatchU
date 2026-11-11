// 발행 PDF 사본 열람(U8 기능 명세 W4, 계약 C-10·C-12 더하는 변경, 업무 규칙 BR6.1·BR6.2·BR6.5·BR6.6·BR6.7, 신뢰성 설계 「열람」).
// 받은 사람과 작성자 경로가 같이 쓴다. 내려주는 것은 원본(materialKey)이 아니라 발행 때 복사해 둔 사본(published_item.pdf_copy_key)이다.
// 판정은 U4의 C-10 구현(DbPublicationAccess)을 그대로 거치고, 항목은 판정으로 얻은 발행본에 속한 PDF_MATERIAL 행만 연다.
// 시도 제한은 두지 않는다(BR6.7). 토큰·grant·파일 키·제목은 로그·오류·헤더에 넣지 않는다.
import type { ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { errorName } from '../ai-run/ai-run-spec';
import { FILE_STORAGE, FileNotFound, type FileStorage } from '../file-storage/file-storage';
import { isLinkTokenFormat } from '../share-links/link-token';
import { DbPublicationAccess } from './db-publication-access';
import { LinkPasswordRequired, LinkUnavailable, NotFound, type RecipientAccess } from './publication-access';
import { Clock, PUBLICATIONS_CLOCK } from './publications-config';
import { isUuid } from './publish-input';
import { toApiError, unavailable } from './recipient-access.service';

/** 사본 열람 응답 헤더 4종(BR6.6, 보안 설계 §6, NFR1.10). 파일 이름은 고정값이고 제목을 넣지 않는다. */
const PDF_COPY_HEADERS = Object.freeze({
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline; filename="document.pdf"',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

/** 열 수 있다고 판정된 사본 하나. `pdfCopyKey`는 저장소 호출에만 쓰고 밖으로 내보내지 않는다. */
export interface PublishedPdfCopy {
  publicationId: string;
  publishedItemId: string;
  pdfCopyKey: string;
}

@Injectable()
export class PublishedPdfViewService {
  private readonly logger = new Logger('PdfView');

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DbPublicationAccess,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * 받은 사람 판정과 항목 조회(BR6.1·BR6.2). U4 열람(`RecipientAccessService.read`)과 같이 읽기 전용 REPEATABLE READ 트랜잭션 하나에서
   * `resolveForRecipientIn` → 항목 조회를 한다. 판정이 먼저라, 비밀번호 링크에 grant가 없으면 항목이 있든 없든 401이다.
   * 다른 발행본의 항목·PDF가 아닌 항목·없는 항목·UUID 모양이 아닌 ID는 링크 불가와 구분 없이 404 LINK_UNAVAILABLE이다.
   */
  async findForRecipient(token: string, grant: string | undefined, itemId: string): Promise<PublishedPdfCopy> {
    // 로그에는 UUID 모양인 항목 ID만 적는다(요청이 보낸 임의 문자열을 그대로 적지 않는다).
    const publishedItemId = isUuid(itemId) ? itemId.toLowerCase() : null;
    if (!isLinkTokenFormat(token)) {
      this.denied(404, null, publishedItemId);
      throw unavailable();
    }
    const now = this.clock();
    // 판정으로 알게 된 발행본. 링크를 찾지 못했거나 열 수 없으면 null로 남는다(토큰은 로그에 적지 않으므로 식별자가 없다).
    const seen: { publicationId: string | null } = { publicationId: null };
    try {
      return await this.dataSource.transaction('REPEATABLE READ', async (manager) => {
        await manager.query('SET TRANSACTION READ ONLY');
        let access: RecipientAccess;
        try {
          access = await this.access.resolveForRecipientIn(manager, token, grant ?? null, now);
        } catch (error) {
          // grant 거부는 링크 자체는 열 수 있는 상태라는 뜻이므로, 기록에 쓸 발행본 ID를 같은 스냅샷에서 읽는다.
          if (error instanceof LinkPasswordRequired) seen.publicationId = await readPublicationIdByToken(manager, token);
          throw error;
        }
        seen.publicationId = access.publicationId;
        const copy = await readPdfCopy(manager, access.publicationId, itemId);
        if (copy === null) throw new LinkUnavailable();
        return copy;
      });
    } catch (error) {
      if (error instanceof LinkPasswordRequired) this.denied(401, seen.publicationId, publishedItemId);
      else if (error instanceof LinkUnavailable || error instanceof NotFound) this.denied(404, seen.publicationId, publishedItemId);
      throw toApiError(error);
    }
  }

  /**
   * 열람 거부 기록(관측 요구사항 NFR6.1 「열람 실패 코드(401·404·500)」, 관측 설계 §1 `PDF_VIEW_FAILED`). 요청마다 한 줄이고 응답은 바꾸지 않는다.
   * 상태 코드와 기존 ID만 적는다. 토큰·grant·요청 원문은 넣지 않는다(NFR6.2, BR6.7). 이유 칸은 500(file-missing / storage)에만 값이 있다.
   * 발행본 ID는 판정·소유 확인으로 확인된 값만, 항목 ID는 UUID 모양인 요청 값만 적는다. 작성자 경로는 인증된 회원 ID를 함께 적는다
   * (받은 사람 경로에는 회원이 없어 칸 자체가 없다).
   */
  private denied(status: 401 | 404, publicationId: string | null, publishedItemId: string | null, memberId?: string): void {
    this.logger.warn({ event: 'PDF_VIEW_FAILED', stage: 'before-headers', status, reason: null, publicationId, publishedItemId,
      ...(memberId === undefined ? {} : { memberId }), error: null });
  }

  /**
   * 작성자 판정과 항목 조회(BR6.6). `resolveForOwner`는 중지·만료를 막지 않으므로 그 뒤에도 연다.
   * 남의 발행본·없는 발행본·형식이 틀린 ID와, 그 발행본에 없는 항목·PDF가 아닌 항목은 모두 같은 404다.
   */
  async findForOwner(memberId: string, publicationId: string, itemId: string): Promise<PublishedPdfCopy> {
    const requester = memberId.toLowerCase();
    const publishedItemId = isUuid(itemId) ? itemId.toLowerCase() : null;
    let owned: string;
    try {
      ({ publicationId: owned } = await this.access.resolveForOwner(memberId, publicationId));
    } catch (error) {
      if (error instanceof NotFound) {
        // 소유 확인 전: 요청이 가리킨 발행본이 본인 것인지 확인되지 않았으므로 발행본 ID는 적지 않는다.
        this.denied(404, null, publishedItemId, requester);
        throw new NotFoundException();
      }
      throw error;
    }
    const copy = await readPdfCopy(this.dataSource.manager, owned, itemId);
    if (copy === null) {
      // 소유 확인 뒤: 본인 발행본으로 확인된 ID를 적는다.
      this.denied(404, owned, publishedItemId, requester);
      throw new NotFoundException();
    }
    return copy;
  }

  /**
   * 사본을 응답에 내려준다(BR6.5, 신뢰성 설계 「열람(헤더 전)」·「열람(전송 도중)」). 헤더를 보내기 전에 `get`을 열어 성공을 확인하고
   * (파일 없음·저장소 실패는 그대로 던져 500), 그 뒤 스트림을 그대로 파이프한다. Range 요청은 보지 않고 늘 전체를 200으로 준다.
   * 전송 도중 오류는 상태 코드를 바꿀 수 없으므로 연결을 끊고 로그만 남긴다. 작성자 원본 열람(pdf-materials.controller.ts)과 같은 순서다.
   */
  async send(response: ServerResponse, copy: PublishedPdfCopy): Promise<void> {
    let stream: Readable;
    try {
      stream = await this.files.get(copy.pdfCopyKey);
    } catch (error) {
      this.logger.error({ event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 500, reason: error instanceof FileNotFound ? 'file-missing' : 'storage',
        publicationId: copy.publicationId, publishedItemId: copy.publishedItemId, error: errorName(error) });
      throw error;
    }
    for (const [name, value] of Object.entries(PDF_COPY_HEADERS)) response.setHeader(name, value);
    response.statusCode = 200;
    try {
      await pipeline(stream, response);
    } catch (error) {
      // pipeline이 두 스트림을 이미 끊었다. 받는 쪽이 먼저 끊은 경우(premature close)는 우리 실패가 아니라 기록하지 않는다.
      if ((error as { code?: unknown }).code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      this.logger.error({ event: 'PDF_VIEW_FAILED', stage: 'streaming', status: 'aborted', reason: 'storage',
        publicationId: copy.publicationId, publishedItemId: copy.publishedItemId, error: errorName(error) });
      if (!response.destroyed) response.destroy();
    }
  }
}

/** 토큰으로 발행본 ID만 읽는다(grant 거부 기록용). 토큰 값은 조회 조건에만 쓴다. */
async function readPublicationIdByToken(manager: EntityManager, token: string): Promise<string | null> {
  const rows: { publicationId: string }[] = await manager.query(
    'SELECT publication_id AS "publicationId" FROM publication WHERE link_token_reference = $1', [token]);
  return rows[0]?.publicationId ?? null;
}

/** 그 발행본에 속한 PDF 항목의 사본 키(BR6.2). 발행본 조건을 함께 걸어 다른 발행본의 항목 ID로는 찾지 못한다. */
async function readPdfCopy(manager: EntityManager, publicationId: string, itemId: string): Promise<PublishedPdfCopy | null> {
  if (!isUuid(itemId)) return null;
  const rows: { publishedItemId: string; pdfCopyKey: string }[] = await manager.query(
    `SELECT published_item_id AS "publishedItemId", pdf_copy_key AS "pdfCopyKey" FROM published_item
     WHERE publication_id = $1 AND published_item_id = $2 AND item_kind = 'PDF_MATERIAL'`,
    [publicationId, itemId.toLowerCase()]);
  const row = rows[0];
  return row ? { publicationId, publishedItemId: row.publishedItemId, pdfCopyKey: row.pdfCopyKey } : null;
}
