import { Module } from '@nestjs/common';
import { AiConsentModule } from '../ai-consent/ai-consent.module';
import { readAnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { PDF_EXTRACT_DISPATCHER, PDF_EXTRACT_QUEUE_CONFIG, QueuePdfExtractDispatcher } from '../pdf-extraction/pdf-extract.dispatcher';
import { PdfMaterialStore } from './pdf-material-store';
import { PdfMaterialsController } from './pdf-materials.controller';
import { TextMaterialStore } from './text-material-store';
import { TextMaterialsController } from './text-materials.controller';

/**
 * 자료 모듈. 텍스트 자료(U4 W2, 계약 C-13)와 PDF 자료(U8 W1, 계약 C-04·C-05·C-16). DataSource는 공통 DB 모듈 또는 시험 모듈이 공급한다.
 * `publications`를 import하지 않는다(U4 비기능 설계 「의존 방향」). U6은 이 모듈이 아니라 표를 member_id로 걸러 읽는다.
 * PDF 업로드는 AiConsentGate(C-04)·FileStorage(C-05)·추출 요청 발송기(C-16)를 받는다. 큐 주소(CATCHU_QUEUE_REDIS_URL)가 없으면
 * 발송기는 연결하지 않고 발송 실패를 돌려주며 업로드는 그대로 201이다(U8 BR2.4).
 */
@Module({
  imports: [FileStorageModule, AiConsentModule],
  controllers: [TextMaterialsController, PdfMaterialsController],
  providers: [
    TextMaterialStore,
    PdfMaterialStore,
    { provide: PDF_EXTRACT_QUEUE_CONFIG, useFactory: () => readAnalysisQueueConfig() },
    { provide: PDF_EXTRACT_DISPATCHER, useClass: QueuePdfExtractDispatcher },
  ],
})
export class MaterialsModule {}
