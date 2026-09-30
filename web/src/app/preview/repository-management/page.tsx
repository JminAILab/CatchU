import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RepositoryManagementPreview } from "@/features/repository-management/repository-management-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "저장소 연결 관리 미리보기 | CatchU", robots: { index: false, follow: false } };

export default function Page() {
  // 모의 상태만 보는 개발 도구. 배포용 실행에서는 404다.
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={<p>미리보기를 준비하고 있습니다.</p>}><RepositoryManagementPreview /></Suspense>;
}
