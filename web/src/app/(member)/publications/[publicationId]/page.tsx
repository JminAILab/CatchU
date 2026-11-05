import { PublicationDetailPage } from "@/features/publications/publication-detail-screen";

/** 발행본 상세(U4 W5). 주소의 발행본 ID로 본인 발행본을 연다. 남의 것·없는 것은 api가 404로 구분하지 않는다. */
export default async function PublicationDetailRoute({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  return <PublicationDetailPage publicationId={publicationId} />;
}
