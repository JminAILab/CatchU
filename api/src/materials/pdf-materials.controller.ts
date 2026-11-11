import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Controller, Delete, Get, HttpCode, Inject, Logger, NotFoundException, Param, Post, Query, Req, Res } from '@nestjs/common';
import { AiConsentGate } from '../ai-consent/ai-consent.gate';
import { errorName } from '../ai-run/ai-run-spec';
import { CurrentMemberId } from '../auth/auth.decorators';
import { ApiError } from '../common/errors';
import { FILE_STORAGE, FileNotFound, type FileStorage, materialKey } from '../file-storage/file-storage';
import { PDF_EXTRACT_DISPATCHER, type PdfExtractDispatchResult, type PdfExtractDispatcher } from '../pdf-extraction/pdf-extract.dispatcher';
import { pdfExtractMessage } from '../pdf-extraction/pdf-extraction-spec';
import { readPdfUpload } from './pdf-material-input';
import { type OwnedPdfMaterial, PdfMaterialCreated, PdfMaterialStore } from './pdf-material-store';
import { emptyQuery, isUuid } from './text-material-input';

/** 원본 열람 응답 헤더 4종(BR6.6, NFR1.10). 제목은 넣지 않는다. */
const PDF_FILE_HEADERS = Object.freeze({
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline; filename="material.pdf"',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

/**
 * PDF 자료 API(U8 기능 명세 W1, 계약 C-04·C-05·C-16). 인증은 전역 Guard, /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * 클래스·메서드에 `@Public()`을 붙이지 않는다(NFR1.1).
 *
 * 업로드 순서(BR1.3·BR1.6·BR2.4, 성능 설계): 인증 → 동의(본문을 읽기 전) → multipart 검사 → FileStorage.put → 트랜잭션(잠금·COUNT·INSERT)
 * → 커밋 → 추출 요청 발송(실패는 로그만) → 201. put 뒤 DB 실패·벌 수 초과는 파일을 한 번 지운다.
 * 로그에는 pdfMaterialId·memberId·사건 이름·단계·오류 이름만 남긴다. 키·제목·파일 이름·글은 넣지 않는다(관측 설계 §1, NFR1.4).
 */
@Controller('pdf-materials')
export class PdfMaterialsController {
  private readonly logger = new Logger('PdfMaterials');

  constructor(
    private readonly materials: PdfMaterialStore,
    private readonly consent: AiConsentGate,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    @Inject(PDF_EXTRACT_DISPATCHER) private readonly dispatcher: PdfExtractDispatcher,
  ) {}

  @Post()
  async create(
    @CurrentMemberId() memberId: string,
    @Query() query: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<PdfMaterialCreated> {
    emptyQuery(query);
    const owner = memberId.toLowerCase();
    await this.consent.require(owner);
    const upload = await readPdfUpload(request, response);
    const pdfMaterialId = randomUUID();
    const storageKey = materialKey(owner, pdfMaterialId);
    try {
      await this.files.put(storageKey, upload.buffer, 'application/pdf');
    } catch (error) {
      this.storeFailed('put', pdfMaterialId, owner, error);
      throw error;
    }
    let created: PdfMaterialCreated;
    try {
      created = await this.materials.create(owner, { pdfMaterialId, title: upload.title, storageKey, fileSizeBytes: upload.fileSizeBytes });
    } catch (error) {
      // 벌 수 초과(400)는 업무 거부라 기록하지 않고, 그 밖의 DB 실패만 남긴다. 둘 다 파일을 한 번 지운다(BR1.6).
      if (!(error instanceof ApiError)) this.storeFailed('db', pdfMaterialId, owner, error);
      await this.compensate(storageKey, pdfMaterialId, owner);
      throw error;
    }
    await this.dispatch(pdfMaterialId, owner);
    return created;
  }

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: unknown) {
    return this.materials.list(memberId, query);
  }

  @Get(':pdfMaterialId')
  get(@CurrentMemberId() memberId: string, @Param('pdfMaterialId') id: string, @Query() query: unknown) {
    emptyQuery(query);
    return this.materials.get(memberId, id);
  }

  /**
   * 작성자 원본 열람(W1-C, BR6.5·BR6.6, 성능 설계 「열람 전송」). 본인 자료가 아니면 404이고 `PDF_VIEW_FAILED` 한 줄을 남긴다.
   * 헤더를 보내기 전에 get을 열어 성공을 확인하고(실패는 500),
   * 그 뒤 스트림을 응답에 그대로 파이프한다. 전송 도중 오류는 상태 코드를 바꿀 수 없으므로 연결을 끊고 로그만 남긴다.
   */
  @Get(':pdfMaterialId/file')
  async file(
    @CurrentMemberId() memberId: string,
    @Param('pdfMaterialId') id: string,
    @Query() query: unknown,
    @Res() response: ServerResponse,
  ): Promise<void> {
    emptyQuery(query);
    let owned: OwnedPdfMaterial;
    try {
      owned = await this.materials.findOwned(memberId, id);
    } catch (error) {
      // 남의 자료·없는 자료·형식이 틀린 ID의 404도 열람 실패로 한 줄 남긴다(관측 요구사항 NFR6.1 「열람 실패 코드(401·404·500)」, BR6.6).
      // 응답은 그대로다. 자료 ID는 소유가 확인되지 않은 요청 값이라 UUID 모양일 때만 적고, 요청 원문은 적지 않는다(NFR6.2).
      if (error instanceof NotFoundException) {
        this.logger.warn({ event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 404, reason: null,
          pdfMaterialId: isUuid(id) ? id.toLowerCase() : null, memberId: memberId.toLowerCase(), error: null });
      }
      throw error;
    }
    let stream: Readable;
    try {
      stream = await this.files.get(owned.storageKey);
    } catch (error) {
      this.logger.error({ event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 500, reason: error instanceof FileNotFound ? 'file-missing' : 'storage',
        pdfMaterialId: owned.pdfMaterialId, memberId: memberId.toLowerCase(), error: errorName(error) });
      throw error;
    }
    for (const [name, value] of Object.entries(PDF_FILE_HEADERS)) response.setHeader(name, value);
    response.statusCode = 200;
    try {
      await pipeline(stream, response);
    } catch (error) {
      // pipeline이 두 스트림을 이미 끊었다. 받는 쪽이 먼저 끊은 경우(premature close)는 우리 실패가 아니라 기록하지 않는다.
      if ((error as { code?: unknown }).code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      this.logger.error({ event: 'PDF_VIEW_FAILED', stage: 'streaming', status: 'aborted', reason: 'storage',
        pdfMaterialId: owned.pdfMaterialId, memberId: memberId.toLowerCase(), error: errorName(error) });
      if (!response.destroyed) response.destroy();
    }
  }

  /** 삭제(W1-D, BR1.7): 소유 확인 → 파일 먼저(없는 키도 성공) → 성공하면 행 삭제(쪽 연쇄) → 204. 저장소 실패면 500이고 DB는 그대로다. */
  @Delete(':pdfMaterialId')
  @HttpCode(204)
  async remove(@CurrentMemberId() memberId: string, @Param('pdfMaterialId') id: string, @Query() query: unknown): Promise<void> {
    emptyQuery(query);
    const owned = await this.materials.findOwned(memberId, id);
    try {
      await this.files.delete(owned.storageKey);
    } catch (error) {
      this.logger.error({ event: 'PDF_DELETE_STORAGE_FAILED', pdfMaterialId: owned.pdfMaterialId, memberId: memberId.toLowerCase(), error: errorName(error) });
      throw error;
    }
    await this.materials.remove(memberId, id);
  }

  private storeFailed(stage: 'put' | 'db' | 'compensate-delete', pdfMaterialId: string, memberId: string, error: unknown): void {
    this.logger.error({ event: 'PDF_UPLOAD_STORE_FAILED', stage, pdfMaterialId, memberId, error: errorName(error) });
  }

  /** put 뒤 DB 쓰기 실패·벌 수 초과의 보상: 파일을 한 번 지운다. 그 삭제도 실패하면 로그만 남긴다(남은 파일은 탈퇴 때 memberPrefix로 지워진다). */
  private async compensate(storageKey: string, pdfMaterialId: string, memberId: string): Promise<void> {
    try {
      await this.files.delete(storageKey);
    } catch (error) {
      this.storeFailed('compensate-delete', pdfMaterialId, memberId, error);
    }
  }

  /** 커밋 뒤 추출 요청 발송(BR2.4). 실패·예외는 `PDF_EXTRACT_ENQUEUE_FAILED`만 남기고 응답은 그대로 둔다. 자료는 시한으로 FAILED가 된다. */
  private async dispatch(pdfMaterialId: string, memberId: string): Promise<void> {
    let result: PdfExtractDispatchResult;
    try {
      result = await this.dispatcher.dispatchAfterCommit(pdfExtractMessage(pdfMaterialId, memberId));
    } catch (error) {
      result = { outcome: 'ENQUEUE_FAILED', error: errorName(error) };
    }
    if (result.outcome === 'ENQUEUE_FAILED') {
      this.logger.warn({ event: 'PDF_EXTRACT_ENQUEUE_FAILED', pdfMaterialId, memberId, error: result.error });
    }
  }
}
