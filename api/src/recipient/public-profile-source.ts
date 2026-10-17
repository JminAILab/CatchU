/**
 * 수신자 공개 프로필 공급자(#151). A가 제공할 읽기 전용 함수의 자리다([10/13 확인 요청](https://github.com/JminAILab/CatchU/issues/151#issuecomment-6137981301)).
 *
 * - 링크 판정(#150)을 통과한 링크의 소유자 ID로만 부른다. 수신자 입력으로 회원을 고르지 않는다.
 * - 계약 `PublicProfile`의 자가 입력 네 항목만 돌려준다. 본인용 `Member` 응답(회원 ID·연동 상태 등)을 넘기지 않는다.
 * - GitHub 계정은 9/20 결정의 공개 항목이지만 계약(PublicProfile)에 아직 필드가 없어(OQ-A2) 받지 않는다.
 * - 공급자가 던진 예외는 종류와 관계없이 500으로 바꾼다(`recipient.service.ts`). 빈 프로필로 채우지 않는다.
 *   비활성 소유자 등 사유별 수신 응답은 A와 합의 전이며, 이 500은 그 전까지의 임시 처리다.
 *
 * 실제 공급자가 정해지기 전까지 이 인터페이스의 구현은 시험의 대역뿐이며, 수신자 모듈은 기본 앱에 등록하지 않는다(`recipient.module.ts`).
 */
export interface PublicProfileFields {
  displayName: string;
  introduction: string;
  desiredRole: string;
  skills: string[];
}

export interface PublicProfileSource {
  read(ownerId: string): Promise<PublicProfileFields>;
}

export const PUBLIC_PROFILE_SOURCE = Symbol('PUBLIC_PROFILE_SOURCE');
