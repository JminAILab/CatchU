"use client";
import { useEffect } from "react";

export const UNSAVED_MESSAGE = "저장하지 않은 입력이 있습니다. 이동하시겠습니까?";

/**
 * 미저장 입력이 있을 때 새로고침·창 닫기와 링크 이동을 확인한다. 머무르기를 고르면 이동하지 않고 입력을 유지한다.
 * 브라우저 내부 뒤로/앞으로 이동과 버튼형 로그아웃은 이 훅의 범위가 아니다.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
}
