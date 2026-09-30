import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AssetsPreview } from "@/features/assets/assets-preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "내 자산 미리보기 | CatchU",
  robots: { index: false, follow: false },
};

export default function AssetsPreviewPage() {
  // 인증 없이 합성 자료만 보는 개발 도구. 제품 경로는 #106에서 연결한다.
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <Suspense fallback={<p>미리보기를 준비하고 있습니다.</p>}>
      <AssetsPreview />
    </Suspense>
  );
}
