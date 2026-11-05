// U4 발행본 모듈(제출 2, 보안 설계 「PublicationsModule 공급자 구성 (R-01)」·「재사용하는 10월 도구」, 논리 구성 요소 「의존 방향 (R-05)」).
// share-links 폴더에서는 표·API·Nest 모듈에 의존하지 않는 도구만 가져온다. ShareLinksModule·share-links.service·link-access.service·
// RecipientModule은 import하지 않는다(10월 작성자·받은 사람 경로는 제출 3 W6에서 이 모듈의 받은 사람 컨트롤러로 바꾼다).
import { Module } from '@nestjs/common';
import { AiConsentModule } from '../ai-consent/ai-consent.module';
import { AiRunModule } from '../ai-run/ai-run.module';
import { DailyRunLimitModule } from '../daily-run-limit/daily-run-limit.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { OwnerProfileReaderModule } from '../member-profile/owner-profile-reader.module';
import { PublishedIndexModule } from '../published-index/published-index.module';
import { LINK_GRANT_KEY, readLinkGrantKey } from '../share-links/link-grant';
import { RequestRateLimiter } from '../share-links/request-rate-limiter';
import { readShareLinksConfig, SHARE_LINKS_CONFIG } from '../share-links/share-links.config';
import { DbPublicationAccess } from './db-publication-access';
import { PublicationManageService } from './publication-manage.service';
import { PUBLICATION_ACCESS, PUBLICATIONS_CLOCK, PUBLISH_RATE_LIMIT, PUBLISH_RATE_LIMITER } from './publications-config';
import { PublicationsController } from './publications.controller';
import { PublicationsLog } from './publications-log';
import { PublishService } from './publish.service';

export { PUBLICATION_ACCESS, PUBLICATIONS_CLOCK, PUBLISH_RATE_LIMITER } from './publications-config';

/**
 * - grant 키·web 주소 설정은 useFactory라 앱 기동 때 한 번 검사한다: 운영 설정(NODE_ENV가 development·test가 아님)에서 `LINK_GRANT_SECRET`
 *   없음·64자 hex 아님·`AUTH_JWT_SECRET`과 같음, `SHARE_LINK_WEB_BASE_URL` 없음·http면 기동을 멈춘다(#218·#242, NFR1.5·NFR1.6).
 *   환경변수 이름은 10월 그대로라 배포 설정을 바꾸지 않는다.
 * - unlock 정책·제어(`UNLOCK_POLICY`·`UNLOCK_CONTROLS`)는 제출 3의 받은 사람 unlock이 쓸 때 함께 넣는다. 지금 등록하면
 *   ShareLinksModule의 같은 토큰과 인스턴스가 둘이 되어 `app.get(UNLOCK_CONTROLS, { strict: false })`로 제한기를 얻는 10월 unlock
 *   시험이 실제 unlock 경로와 다른 제한기를 보게 된다(PR #468 CI). 제한기는 프로세스 메모리이며 api 하나 전제다(NFR4.13).
 * - 발행 빈도 제한기는 10월 발급 제한기와 같은 설정 모양의 새 인스턴스다(키 공간이 겹치지 않는다).
 * - C-10 DB 구현은 `PUBLICATION_ACCESS` 토큰으로 내보낸다. U5는 `RagAnswerModule.register({ publicationAccess: PUBLICATION_ACCESS,
 *   imports: [PublicationsModule] })`처럼 받는다(docs/publications.md 「C-10 PublicationAccess」).
 * - imports: `OwnerProfileReaderModule`(소유 회원 상태, #416 OQ-U4-NFR-6 결정), U2 `AiRunModule`·`DailyRunLimitModule`·`AiConsentModule`·
 *   `FileStorageModule`, U3 `PublishedIndexModule`(`PUBLISHED_INDEX_WRITER`). TypeORM 엔티티는 앱의 DataSource가 `*.entity.ts`를 찾는다.
 */
@Module({
  imports: [OwnerProfileReaderModule, AiRunModule, DailyRunLimitModule, AiConsentModule, FileStorageModule, PublishedIndexModule],
  controllers: [PublicationsController],
  providers: [
    { provide: LINK_GRANT_KEY, useFactory: () => readLinkGrantKey() },
    { provide: SHARE_LINKS_CONFIG, useFactory: () => readShareLinksConfig() },
    { provide: PUBLISH_RATE_LIMITER, useFactory: () => new RequestRateLimiter(PUBLISH_RATE_LIMIT) },
    { provide: PUBLICATIONS_CLOCK, useValue: () => new Date() },
    PublicationsLog,
    DbPublicationAccess,
    { provide: PUBLICATION_ACCESS, useExisting: DbPublicationAccess },
    PublishService,
    PublicationManageService,
  ],
  exports: [PUBLICATION_ACCESS],
})
export class PublicationsModule {}
