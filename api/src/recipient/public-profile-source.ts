/**
 * 수신자 공개 프로필 공급자(#151). A가 제공할 읽기 전용 함수의 자리다([10/13 확인 요청](https://github.com/JminAILab/CatchU/issues/151#issuecomment-6137981301)).
 *
 * - 링크 판정(#150)을 통과한 링크의 소유자 ID로만 부른다. 수신자 입력으로 회원을 고르지 않는다.
 * - 계약 `PublicProfile`의 자가 입력 네 항목만 돌려준다. 본인용 `Member` 응답(회원 ID·연동 상태 등)을 넘기지 않는다.
 * - GitHub 계정 필드는 OQ-A2 계약 수정 전이라 받지 않는다.
 * - 조회 실패·필수 행 누락·비활성 소유자의 처리는 A와 합의 전이다. 공급자가 던진 예외를 그대로 전달하며, 빈 프로필로 바꾸지 않는다.
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
