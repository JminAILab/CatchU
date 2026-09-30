import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AssetsApiPreview } from "@/features/assets/assets-api-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 자산 API 동작 예시 | CatchU", robots: { index: false, follow: false } };
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={<p>미리보기를 준비하고 있습니다.</p>}><AssetsApiPreview /></Suspense>;
}

