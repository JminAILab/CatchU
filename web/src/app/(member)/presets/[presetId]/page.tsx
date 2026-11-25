import { PresetEditorPage } from "@/features/presets/preset-editor-screen";

/** 프리셋 고치기(발행 프리셋 U2 M3). 남의 것·없는 것은 api가 404로 구분하지 않는다. */
export default async function PresetEditRoute({ params }: { params: Promise<{ presetId: string }> }) {
  const { presetId } = await params;
  return <PresetEditorPage presetId={presetId} />;
}
