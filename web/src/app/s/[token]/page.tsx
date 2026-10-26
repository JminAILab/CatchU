import { RecipientCollectionPage } from "@/features/recipient/recipient-screen";

/**
 * 공유 링크 수신자 첫 화면(W7 V02, #152). 회원 로그인 없이 연다. 링크 토큰은 경로에만 두고 쿼리·로그에 싣지 않는다.
 * 접근 판정·비밀번호 분기·자료 조회는 브라우저에서 수신자 API로 한다.
 */
export default async function RecipientLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RecipientCollectionPage token={token} />;
}
