import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommonPreview } from "./common-preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "공통 레이아웃 미리보기 | CatchU",
  robots: { index: false, follow: false },
};

export default function CommonPreviewPage() {
  // 인증 없이 모의 상태만 보는 개발 도구. 배포용 실행에서는 404다.
  if (process.env.NODE_ENV !== "development") notFound();
  return <CommonPreview />;
}
