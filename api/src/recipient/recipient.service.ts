import { Inject, Injectable } from '@nestjs/common';
import { emptyCatchQuery } from '../catches/owner-catch-input';
import { PublicCatchResponse, PublicCatchStore } from '../catches/public-catch-store';
import { LinkAccessService } from '../share-links/link-access.service';
import { PUBLIC_PROFILE_SOURCE, PublicProfileSource } from './public-profile-source';
import { PublicProfileResponse, toPublicProfile } from './public-profile-response';

export interface PublicCollectionResponse {
  profile: PublicProfileResponse;
  catches: PublicCatchResponse[];
  page: { nextCursor: string | null };
}

/**
 * 비로그인 수신자 조회(#151). 판정 순서는 계약대로 링크(존재·중단·만료) → 비밀번호(grant) → 현재 허용 자료다.
 *
 * - 링크 판정은 #150 `LinkAccessService.assertReadable`, Catch는 B `PublicCatchStore`를 그대로 쓴다.
 *   공개·보호 조건과 페이지 규칙을 여기서 다시 구현하지 않는다.
 * - 매 요청(다음 페이지 포함) 링크·grant와 현재 공개 조건을 다시 판정한다. cursor는 조회 위치일 뿐 권한이 아니다.
 * - 링크마다 프로필·Catch 사본을 만들지 않고, 링크 소유자의 현재 자료를 읽는다.
 * - 링크 제목·링크 ID·소유자 ID는 응답에 넣지 않는다.
 */
@Injectable()
export class RecipientService {
  constructor(
    private readonly access: LinkAccessService,
    private readonly catches: PublicCatchStore,
    @Inject(PUBLIC_PROFILE_SOURCE) private readonly profiles: PublicProfileSource,
  ) {}

  async collection(token: string, grant: string | undefined, query: unknown): Promise<PublicCollectionResponse> {
    const link = await this.access.assertReadable(token, grant);
    // 쿼리(cursor·limit)는 링크·비밀번호 판정 뒤에 검사한다. 정상 0건은 빈 배열이고, 조회 실패는 그대로 오류다.
    const page = await this.catches.list(link.ownerId, query);
    const profile = toPublicProfile(await this.profiles.read(link.ownerId));
    return { profile, catches: page.catches, page: page.page };
  }

  async catch(token: string, grant: string | undefined, catchId: string, query: unknown): Promise<PublicCatchResponse> {
    // 비밀번호를 확인하지 않은 요청에는 Catch 존재 여부를 검사해 알리지 않는다(계약).
    const link = await this.access.assertReadable(token, grant);
    emptyCatchQuery(query);
    // 숨김·보호·다른 회원·없는 Catch는 모두 같은 404 RESOURCE_UNAVAILABLE이다(PublicCatchStore).
    return this.catches.get(link.ownerId, catchId);
  }
}
