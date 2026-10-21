import { RecipientCatchPage } from "@/features/recipient/recipient-screen";

/** 수신자 Catch 상세(W7 V03, #152). 직접 진입해도 링크 판정·비밀번호 확인을 먼저 한다. */
export default async function RecipientCatchDetailPage({ params }: { params: Promise<{ token: string; catchId: string }> }) {
  const { token, catchId } = await params;
  return <RecipientCatchPage token={token} catchId={catchId} />;
}
