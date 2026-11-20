import { PresetEditorPage } from "@/features/presets/preset-editor-screen";

/** 새 프리셋(발행 프리셋 U2 M3). 첫 저장 뒤에는 화면을 새로 그리지 않고 주소만 고치기 주소로 바꾼다. */
export default function PresetNewRoute() {
  return <PresetEditorPage presetId={null} />;
}
