export type ClipboardLike = { writeText(text: string): Promise<void> };

/**
 * 클립보드 쓰기. 실제로 쓰기에 성공했을 때만 true다(초안 §4.8: 성공 후에만 복사 완료 표시).
 * 클립보드를 쓸 수 없는 환경(권한 거부·비보안 출처 등)은 false로 돌려주고, 화면은 수동 복사를 안내한다.
 * 복사 성공은 클립보드 쓰기 성공만 뜻하며 이후 열람을 보장하지 않는다.
 */
export async function copyText(clipboard: ClipboardLike | undefined, text: string): Promise<boolean> {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
