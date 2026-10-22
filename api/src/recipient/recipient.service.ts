import { Injectable } from '@nestjs/common';
import { emptyCatchQuery } from '../catches/owner-catch-input';
import { PublicCatchResponse, PublicCatchStore } from '../catches/public-catch-store';
import { ApiError } from '../common/errors';
import { OwnerProfileReader, OwnerPublicProfile } from '../member-profile/owner-profile-reader';
import { assertOwnerAvailable, LinkAccessService } from '../share-links/link-access.service';
import { PublicProfileResponse, toPublicProfile } from './public-profile-response';

export interface PublicCollectionResponse {
  profile: PublicProfileResponse;
  catches: PublicCatchResponse[];
  page: { nextCursor: string | null };
}

/**
 * 비로그인 수신자 조회(#151). 판정 순서는 계약대로 링크(존재·중단·만료) → 소유 회원 상태 → 비밀번호(grant) → 현재 허용 자료다.
 *
 * - 링크·소유 회원·grant 판정은 #150 `LinkAccessService.assertReadable`, Catch는 B `PublicCatchStore`,
 *   공개 프로필은 A `OwnerProfileReader`를 그대로 쓴다. 공개·보호 조건과 페이지 규칙을 여기서 다시 구현하지 않는다.
 * - 매 요청(다음 페이지 포함) 링크·소유 회원·grant와 현재 공개 조건을 다시 판정한다. cursor는 조회 위치일 뿐 권한이 아니다.
 * - 링크마다 프로필·Catch 사본을 만들지 않고, 링크 소유자의 현재 자료를 읽는다.
 * - 링크 제목·링크 ID·소유자 ID·연결 상태는 응답에 넣지 않는다.
 */
@Injectable()
export class RecipientService {
  constructor(
    private readonly access: LinkAccessService,
    private readonly catches: PublicCatchStore,
    private readonly owners: OwnerProfileReader,
  ) {}

  async collection(token: string, grant: string | undefined, query: unknown): Promise<PublicCollectionResponse> {
    const link = await this.access.assertReadable(token, grant);
    // 쿼리(cursor·limit)는 링크·비밀번호 판정 뒤에 검사한다. 정상 0건은 빈 배열이고, 조회 실패는 그대로 오류다.
    const page = await this.catches.list(link.ownerId, query);
    const profile = toPublicProfile(await this.readProfile(token, link.ownerId));
    return { profile, catches: page.catches, page: page.page };
  }

  /**
   * 접근 판정과 분리된 프로필 조회(계약 「P — 수신자 API」).
   * - 이용 가능이면 그 프로필, 비활성이면 그 조회 시점의 결과로 바로 404 LINK_UNAVAILABLE이다.
   * - 회원 없음은 이 조회만으로 원인을 단정하지 않고, 링크와 소유 회원을 같은 시점으로 **한 번** 다시 판정한다.
   *   링크 불가·비활성은 404, 같은 시점의 회원 없음은 500, 둘 다 유효하면 같은 시점에서 프로필을 한 번 다시 읽는다.
   *   그 재조회는 소유 회원 상태와 프로필을 한 문장으로 읽으므로 판정과 프로필이 같은 시점이다. 다시 반복하지 않는다.
   * - 필수 프로필 누락(OwnerProfileMissingError)과 DB 오류는 감싸지 않고 그대로 던져 500이 된다. 빈 프로필로 바꾸지 않는다.
   */
  private async readProfile(token: string, ownerId: string): Promise<OwnerPublicProfile> {
    const read = await this.owners.readPublicProfile(ownerId);
    if (read.ownerState === 'AVAILABLE') return read.profile;
    if (read.ownerState === 'INACTIVE') throw new ApiError('LINK_UNAVAILABLE');
    return this.access.withLinkSnapshot(token, async (link, manager) => {
      const again = await this.owners.readPublicProfile(link.ownerId, manager);
      if (again.ownerState === 'AVAILABLE') return again.profile;
      assertOwnerAvailable(again.ownerState);
      // assertOwnerAvailable은 AVAILABLE이 아닌 상태에서 항상 던진다. 여기에 닿으면 상태 값이 계약 밖이다.
      throw new Error('Unexpected owner state');
    });
  }

  async catch(token: string, grant: string | undefined, catchId: string, query: unknown): Promise<PublicCatchResponse> {
    // 비밀번호를 확인하지 않은 요청에는 Catch 존재 여부를 검사해 알리지 않는다(계약).
    const link = await this.access.assertReadable(token, grant);
    emptyCatchQuery(query);
    // 숨김·보호·다른 회원·없는 Catch는 모두 같은 404 RESOURCE_UNAVAILABLE이다(PublicCatchStore).
    return this.catches.get(link.ownerId, catchId);
  }
}
