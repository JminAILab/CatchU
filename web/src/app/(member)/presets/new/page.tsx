import { PresetEditorPage } from "@/features/presets/preset-editor-screen";

/** 새 프리셋(발행 프리셋 U2 M3). 첫 저장 뒤에는 고치기 주소로 옮기고(뒤로 가기 기록을 더하지 않음), 옮긴 화면이 「저장했습니다.」를 한 번 보인다. */
export default function PresetNewRoute() {
  return <PresetEditorPage presetId={null} />;
}
