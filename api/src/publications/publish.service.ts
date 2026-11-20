// 발행(POST /v1/publications, U4 W3·BR4·BR5, 계약 C-08 publish-sequence, 성능 설계 「판정 위치와 순서」, 신뢰성 설계 「발행 트랜잭션 경계」).
// 발행 프리셋 U1(기능 명세 W4, BR3.1~BR3.8, 계약 P-2): 요청은 프리셋 ID 1~5개이고, 프리셋을 트랜잭션 밖에서 한 번 읽어 편 항목으로 끝까지 발행한다.
// 판정 순서: 빈도(429) → 입력(400) → 동의(403) → 프리셋 펴기(404) → 빈 프리셋·편 항목 20개(400) → 트랜잭션 밖 토큰·scrypt →
// 트랜잭션(하루 횟수 → 원본 잠금·재읽기 → 자격(확인 필요 → 기록 문제 → 보호 → 비공개) → 전체 글 → 쓰기 → chunkInTransaction → 커밋) →
// 커밋 뒤 작업 등록(실패는 로그만) → 201. 비공개 Catch는 CATCH_PRIVATE로 막고 공개로 바꾸지 않는다(BR3.6, 12월 PRIVATE→PUBLIC 전환 없앰).
// PDF 항목이 있으면 U8 C-17 순서를 끼운다(pdf-publish.ts): 토큰 뒤 사전 확인(DONE) → ID 선생성 → position 순 복사(실패면 접두어 정리·500) →
// 트랜잭션 안 텍스트 자료 잠금 뒤 PDF FOR SHARE 재확인 → 전체 글에 PDF 쪽 글 포함 → published_item·published_pdf_page → 트랜잭션 실패면
// 접두어 정리·원래 오류. PDF가 없으면 FileStorage를 부르지 않는다(BR5.6). 전체 글에 PDF 포함은 팀장 결정 2026-11-10
// (https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176, OQ-U4-4 종결).
// 새 Catch NC2(계약 C3, 성능 설계 「발행 읽기 설계」): 잠금 조회가 저장소 등록 이름·작성자 설명 시각을, 근거 조회가 한계를 더 읽고, 소속 기록 조회 하나로
// 근거마다 본인 커밋 여부를 정한다. 등록 이름을 읽지 못한 Catch가 있으면 커밋 뒤 경고 한 줄을 남긴다(안전망).
// 발행 프리셋 U1: 잠금 SQL·사본 내용·글자 수·자격 판정은 src/publishable-source/로 옮겼고(프리셋 경로와 같은 규칙), 여기서는 잠근 행에 쓴다.
import { HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AiConsentGate } from '../ai-consent/ai-consent.gate';
import { AiRun } from '../ai-run/ai-run';
import type { AiRunKind } from '../ai-run/ai-run-spec';
import { ApiError, type ErrorCode } from '../common/errors';
import type { BlockedSource } from '../common/errors/api-error';
import { FILE_STORAGE, type FileStorage, publishedPdfKey } from '../file-storage/file-storage';
import { DailyRunLimit } from '../daily-run-limit/daily-run-limit';
import { ExpandedPreset, PresetStore } from '../presets/preset-store';
import { CatchUnpublishableReason, blockingCatches, protectionRepositoryIds } from '../publishable-source/eligibility';
import {
  CatchSourceRow, buildCatchSnapshot, buildTextMaterialSnapshot, catchTitle, snapshotTextLength,
} from '../publishable-source/source-content';
import {
  SourceKind, TextMaterialSourceRow, idsOf, lockCatches, lockTextMaterials, readEvidenceForPublish, readProtections,
} from '../publishable-source/source-reader';
import { PUBLISHED_INDEX_WRITER } from '../published-index/published-index.module';
import type { PublishedIndexWriter } from '../published-index/published-index-writer';
import { hashLinkPassword } from '../share-links/link-password';
import { buildRecipientLinkUrl, generateLinkToken } from '../share-links/link-token';
import { RequestRateLimiter } from '../share-links/request-rate-limiter';
import { SHARE_LINKS_CONFIG, ShareLinksConfig } from '../share-links/share-links.config';
import {
  type LockedPdf, type PdfPublishItem, assertPdfsDone, cleanupPrefix, copyPdfPages, copyPdfs, lockPdfsForPublish, pdfItems,
} from './pdf-publish';
import { PUBLICATION_TTL_HOURS } from './publication.entity';
import { PublicationState } from './publication-state';
import { Clock, PUBLICATION_LIMITS, PUBLICATIONS_CLOCK, PUBLISH_RATE_LIMITER, SNAPSHOT_TEXT_TOTAL_MAX } from './publications-config';
import { PublicationsLog } from './publications-log';
import { PublishInput, PublishItem, isUuid, publishInput } from './publish-input';
import { ItemSnapshot } from './published-snapshot';

export { PublishIntegrityError } from '../publishable-source/eligibility';

/** 발행 응답(U4 기능 명세 「작성자 API」). 토큰은 `url` 안에만 있다(BR10.2). */
export interface PublishResponse {
  publicationId: string;
  url: string;
  state: PublicationState;
  publishedAt: Date;
  expiresAt: Date;
  passwordProtected: boolean;
}

interface PreparedItem {
  item: PublishItem;
  title: string;
  snapshot: ItemSnapshot;
  /** 이 항목이 전체 글에 더하는 코드 포인트 수. PDF는 잠근 쪽 글 합이며, 같은 PDF가 두 프리셋에 있으면 두 번 더한다(BR3.4, R-05) */
  textLength: number;
}

/** 막힘 이유(PublishableSource)와 응답 코드의 대응(계약 P-2 rules). */
const BLOCK_CODES: Record<CatchUnpublishableReason, ErrorCode> = {
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  SOURCE_RESTRICTED: 'SOURCE_RESTRICTED',
  PRIVATE: 'CATCH_PRIVATE',
};

interface StoredPublication {
  publicationId: string;
  publishedAt: Date;
  expiresAt: Date;
  /** 저장소 등록 이름을 읽지 못해 repositoryName을 뺀 Catch가 있었는지(NC2 안전망). 커밋된 뒤에만 로그로 남긴다. */
  repositoryNameMissing: boolean;
}

@Injectable()
export class PublishService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SHARE_LINKS_CONFIG) private readonly config: ShareLinksConfig,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
    @Inject(PUBLISH_RATE_LIMITER) private readonly rateLimiter: RequestRateLimiter,
    private readonly consent: AiConsentGate,
    private readonly dailyLimit: DailyRunLimit,
    private readonly aiRun: AiRun,
    @Inject(PUBLISHED_INDEX_WRITER) private readonly indexWriter: PublishedIndexWriter,
    private readonly log: PublicationsLog,
    @Inject(FILE_STORAGE) private readonly files: FileStorage,
    private readonly presets: PresetStore,
  ) {}

  async publish(memberId: string, body: unknown): Promise<PublishResponse> {
    const owner = memberId.toLowerCase();
    try {
      if (!isUuid(owner)) throw new ApiError('AUTH_INVALID');
      // 회원별 발행 빈도(BR4.8, 임시값)는 입력 검사·해시·저장보다 먼저 센다. 거부한 요청은 세지 않고 아무것도 저장하지 않는다.
      const rate = this.rateLimiter.take(owner, this.clock());
      if (!rate.allowed) throw new ApiError('RATE_LIMITED', { retryAfterSeconds: rate.retryAfterSeconds });
      const input = publishInput(body);
      // 동의가 없으면 하루 횟수를 쓰지 않는다(BR4.7, C-04).
      await this.consent.require(owner);
      // 프리셋은 트랜잭션 밖에서 한 번 읽어 펴고, 그 내용으로 끝까지 발행한다(BR3.2, 기능 설계 Q3). 남의 것·없는 것은 404다(NFR2.4).
      const items = flattenPresets(await this.presets.expand(owner, input.presetIds));
      // 토큰·검증값은 잠금 시간을 줄이려고 트랜잭션 밖에서 먼저 만든다(BR5.4). 비밀번호 원문은 여기서 끝난다.
      const linkToken = generateLinkToken();
      const passwordVerifier = input.password === undefined ? null : await hashLinkPassword(input.password);
      // C-17 1단계: 사본 키가 ID로 정해지므로 발행본·항목 ID를 트랜잭션 전에 만든다(BR5.1). 편 항목마다 하나다(BR3.7).
      const publicationId = randomUUID();
      const publishedItemIds = items.map(() => randomUUID());
      const pdfs = pdfItems(items, publishedItemIds);
      if (pdfs.length > 0) {
        // 사전 확인(트랜잭션 밖·복사 전, BR4.1) → 2·3단계 복사(BR5.2·BR5.3).
        await assertPdfsDone(this.dataSource, owner, pdfs);
        await copyPdfs(this.files, owner, publicationId, pdfs);
      }

      let stored: StoredPublication;
      try {
        stored = await this.dataSource.transaction('READ COMMITTED', (manager) =>
          this.store(manager, owner, { input, items, linkToken, passwordVerifier, publicationId, publishedItemIds, pdfs }));
      } catch (error) {
        // 5단계: 트랜잭션 실패면 접두어를 한 번 정리하고 원래 오류를 그대로 응답한다(BR5.4). 정리 실패는 로그만(BR5.5).
        if (pdfs.length > 0) await cleanupPrefix(this.files, owner, publicationId, 5);
        throw error;
      }

      this.log.publishSucceeded(stored.publicationId, owner);
      // 안전망 경고는 커밋된 발행에서만 남긴다. 롤백되면 이 줄에 오지 않는다(NC2 관측 설계).
      if (stored.repositoryNameMissing) this.log.snapshotRepositoryNameMissing(stored.publicationId, owner);
      // 커밋 뒤에만 등록한다. 실패해도 발행은 성공이며 다시 등록하지 않는다(BR5.5, 팀장 결정 2026-11-03 1).
      await this.enqueue('EMBED_PUBLICATION', stored.publicationId);
      await this.enqueue('BASE_SUMMARY', stored.publicationId);
      return {
        publicationId: stored.publicationId,
        url: buildRecipientLinkUrl(this.config.webBaseUrl, linkToken),
        state: 'ACTIVE',
        publishedAt: stored.publishedAt,
        expiresAt: stored.expiresAt,
        passwordProtected: passwordVerifier !== null,
      };
    } catch (error) {
      this.log.publishFailed(isUuid(owner) ? owner : null, errorCodeOf(error));
      throw error;
    }
  }

  /** 발행 트랜잭션(BR5.1). 어느 단계든 예외면 전체가 되돌아가고 하루 횟수도 함께 되돌아간다(BR5.2). */
  private async store(manager: EntityManager, owner: string, job: PublishJob): Promise<StoredPublication> {
    const { input, items, publicationId, publishedItemIds, pdfs } = job;
    await assertMemberExists(manager, owner);
    const now = this.clock();
    if (await this.dailyLimit.consume(owner, 'BASE_SUMMARY', now, manager) === 'LIMIT_REACHED') throw new ApiError('DAILY_LIMIT_REACHED');

    // 잠그는 원본 ID는 종류별로 중복을 없앤 집합이다(BR3.7, NFR6.4). 같은 자료가 여러 프리셋에 있어도 한 번씩 잠근다.
    const catchIds = idsOf(items, 'CATCH');
    const materialIds = idsOf(items, 'TEXT_MATERIAL');
    // 잠금 순서: Catch를 catch_id 오름차순으로, 그다음 텍스트 자료를 text_material_id 오름차순으로(NFR4.6, 교착 방지).
    const catches = catchIds.length === 0 ? new Map<string, CatchSourceRow>() : await lockCatches(manager, owner, catchIds);
    const materials = materialIds.length === 0 ? new Map<string, TextMaterialSourceRow>() : await lockTextMaterials(manager, owner, materialIds);
    // 남의 것·없는 것은 구분하지 않는다(BR4.1, NFR1.1). 프리셋을 읽은 뒤 자료가 지워졌어도 여기서 404다.
    if (catchIds.some((id) => !catches.has(id)) || materialIds.some((id) => !materials.has(id))) throw new NotFoundException();
    // U4 잠금 뒤에 PDF를 pdf_material_id 오름차순 FOR SHARE로 잠그고 DONE을 다시 확인한다(U8 BR4.2). PDF가 없으면 부르지 않는다.
    const lockedPdfs = pdfs.length === 0 ? new Map<string, LockedPdf>() : await lockPdfsForPublish(manager, owner, pdfs);

    await assertCatchesPublishable(manager, owner, catchIds.map((id) => catches.get(id)!), items);
    const evidence = catchIds.length === 0 ? [] : await readEvidenceForPublish(manager, owner, catchIds, catches);
    // 사본 내용은 편 항목마다 만든다(BR3.7). 같은 Catch가 두 프리셋에 있으면 같은 내용의 사본이 둘이다.
    const prepared = items.map((item): PreparedItem => {
      if (item.kind === 'CATCH') {
        const row = catches.get(item.sourceId)!;
        const snapshot = buildCatchSnapshot(row, evidence.filter((e) => e.catchId === row.catchId));
        return { item, title: catchTitle(row), snapshot, textLength: snapshotTextLength(snapshot) };
      }
      if (item.kind === 'PDF_MATERIAL') {
        const pdf = lockedPdfs.get(item.sourceId)!;
        return { item, title: pdf.title, snapshot: { pageCount: pdf.pageCount }, textLength: pdf.textLength };
      }
      const row = materials.get(item.sourceId)!;
      const snapshot = buildTextMaterialSnapshot(row.body);
      return { item, title: row.title, snapshot, textLength: snapshotTextLength(snapshot) };
    });
    // 전체 글은 잠근 뒤 다시 읽은 원본으로 트랜잭션 안에서 센다(BR4.5, NFR4.3). PDF 항목은 잠근 pdf_page_text의 쪽 글(코드 포인트)을
    // 더한다(팀장 결정 2026-11-10, OQ-U4-4 종결 — 60,000자 그대로). 편 항목마다 더하므로 같은 자료(PDF 포함)가 두 프리셋에 있으면 두 번 센다
    // (BR3.4, NFR2.13). 잠금 결과 Map의 값을 그대로 합하지 않는다.
    const total = prepared.reduce((sum, { textLength }) => sum + textLength, 0);
    if (total > SNAPSHOT_TEXT_TOTAL_MAX) {
      throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'presetIds', reason: 'maxTotalLength' }] } });
    }

    const [row]: { publishedAt: Date; expiresAt: Date }[] = await manager.query(`
      INSERT INTO publication (publication_id, member_id, title, link_token_reference, password_protection_reference, published_at, expires_at, stopped_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + interval '${PUBLICATION_TTL_HOURS} hours', NULL)
      RETURNING published_at AS "publishedAt", expires_at AS "expiresAt"`,
    [publicationId, owner, input.title, job.linkToken, job.passwordVerifier, now]);
    for (const [index, { item, title, snapshot }] of prepared.entries()) {
      const publishedItemId = publishedItemIds[index];
      const pdfCopyKey = item.kind === 'PDF_MATERIAL' ? publishedPdfKey(owner, publicationId, publishedItemId) : null;
      // position은 발행본 전체에 1부터 이어 매기고, 프리셋 순번·이름은 읽은 때의 값을 복사한다(P-3, BR3.8).
      await manager.query(`
        INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key,
          preset_ordinal, preset_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [publishedItemId, publicationId, index + 1, item.kind, item.sourceId, title, JSON.stringify(snapshot), pdfCopyKey,
        item.presetOrdinal, item.presetName]);
      // PDF 사본 쪽 행은 그 시점 pdf_page_text를 복사해 고정한다(U8 BR4.3). 편 항목마다 따로 복사한다.
      if (item.kind === 'PDF_MATERIAL') await copyPdfPages(manager, publishedItemId, lockedPdfs.get(item.sourceId)!);
    }
    // 같은 manager로 조각을 나눈다. 앞선 사본만 조각이 된다(BR4.2). 예외면 발행 전체가 되돌아간다(C-08).
    await this.indexWriter.chunkInTransaction(manager, publicationId, now);
    const repositoryNameMissing = prepared.some(({ item, snapshot }) => item.kind === 'CATCH' && !('repositoryName' in snapshot));
    return { publicationId, publishedAt: new Date(row.publishedAt), expiresAt: new Date(row.expiresAt), repositoryNameMissing };
  }

  private async enqueue(kind: AiRunKind, publicationId: string): Promise<void> {
    // runKey·payload는 C-02·docs/published-index.md·docs/rag-answer.md 규칙 그대로다.
    const result = await this.aiRun.enqueueAfterCommit(kind, `${kind}-${publicationId}`, { publicationId });
    this.log.enqueueResult(publicationId, kind, result);
  }
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 발행이 끝날 때까지 회원 삭제를 막는다. 다른 DB 오류는 서버 오류로 둔다(제출 1과 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

/** 트랜잭션 밖에서 준비한 발행 한 건. */
interface PublishJob {
  input: PublishInput;
  items: PublishItem[];
  linkToken: string;
  passwordVerifier: string | null;
  publicationId: string;
  publishedItemIds: readonly string[];
  pdfs: readonly PdfPublishItem[];
}

/**
 * 프리셋을 고른 순서대로, 그 안에서 프리셋 안 자료 순서대로 이어 붙인다(BR3.2). 항목이 0개인 프리셋이 있으면 400 `presetIds[i]` emptyPreset
 * (BR3.3, 계약 R-02), 편 항목이 20개를 넘으면 400 `presetIds` maxItems다(BR3.4). 같은 자료가 두 프리셋에 있으면 두 번 센다.
 */
function flattenPresets(presets: readonly ExpandedPreset[]): PublishItem[] {
  const empty = presets.flatMap((preset, index) => preset.items.length === 0 ? [{ field: `presetIds[${index}]`, reason: 'emptyPreset' }] : []);
  if (empty.length > 0) throw new ApiError('VALIDATION_FAILED', { details: { violations: empty } });
  const items = presets.flatMap((preset) => preset.items.map((ref): PublishItem => ({
    ...ref, presetId: preset.presetId, presetOrdinal: preset.ordinal, presetName: preset.name,
  })));
  if (items.length > PUBLICATION_LIMITS.itemsMax) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'presetIds', reason: 'maxItems' }] } });
  }
  return items;
}

/** 막힌 자료가 든 편 항목마다 한 줄(BR3.5). 같은 자료가 두 프리셋에 있으면 프리셋마다 한 줄이다. */
function blockedSourcesOf(items: readonly PublishItem[], kind: SourceKind, sourceIds: readonly string[]): BlockedSource[] {
  const blocked = new Set(sourceIds);
  return items.filter((item) => item.kind === kind && blocked.has(item.sourceId))
    .map((item) => ({ presetId: item.presetId, kind: item.kind, sourceId: item.sourceId }));
}

/**
 * 고른 모든 Catch의 발행 자격을 잠근 행으로 판정한다(BR3.5·BR7.4, docs/catch-visibility.md). 판정은 PublishableSource의 순수 함수
 * (blockingCatches)이고, 보호 관측은 그 전에 FOR SHARE로 한 번 읽는다. 지금 순서대로 미확인 409 CONFIRMATION_REQUIRED → 원 요청 불일치·
 * 보호 관측 없음·불완전은 서버 오류(500) → 확인된 SOURCE_PRIVATE 409 SOURCE_RESTRICTED → 비공개 409 CATCH_PRIVATE이고, 막힌 Catch는
 * details.blockedSources로만 알린다(계약 P-2). 비공개 Catch를 공개로 바꾸지 않는다(BR3.6).
 */
async function assertCatchesPublishable(
  manager: EntityManager, owner: string, rows: CatchSourceRow[], items: readonly PublishItem[],
): Promise<void> {
  if (rows.length === 0) return;
  const repositoryIds = protectionRepositoryIds(rows);
  const protections = repositoryIds.length === 0 ? new Map() : await readProtections(manager, owner, repositoryIds, true);
  const block = blockingCatches(owner, rows, protections);
  if (block === null) return;
  throw new ApiError(BLOCK_CODES[block.reason], { details: { blockedSources: blockedSourcesOf(items, 'CATCH', block.catchIds) } });
}

/** 로그에 남길 오류 코드: 업무 코드가 있으면 그 코드, 404 예외는 RESOURCE_UNAVAILABLE, 그 밖은 INTERNAL_ERROR. */
function errorCodeOf(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error instanceof NotFoundException) return 'RESOURCE_UNAVAILABLE';
  if (error instanceof HttpException && error.getStatus() === 400) return 'INVALID_REQUEST';
  return 'INTERNAL_ERROR';
}
