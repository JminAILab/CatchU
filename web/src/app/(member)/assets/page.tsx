import { Suspense } from "react";
import { LoadingState } from "@/components/status/status";
import { AssetsMemberPage } from "@/features/assets/assets-member-page";

export default function AssetsPage() {
  return (
    <Suspense fallback={<LoadingState>내 자산 화면을 준비하고 있습니다.</LoadingState>}>
      <AssetsMemberPage />
    </Suspense>
  );
}
