import { RecipientPublicationPage } from "@/features/recipient/recipient-screen";

/**
 * 받은 사람 발행본 화면(U4 제출 3 W4, 계약 C-11·C-12). 회원 로그인 없이 연다. 링크 토큰은 경로에만 두고 쿼리·로그에 싣지 않는다.
 * 접근 판정·비밀번호 분기·사본 조회는 브라우저에서 받은 사람 API로 한다. 10월 `/s/[token]/catches/[catchId]`(Catch 상세)는 W6에서 없앴다.
 */
export default async function RecipientLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RecipientPublicationPage token={token} />;
}
