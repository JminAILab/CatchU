"use client";
import { useEffect } from "react";

/** Navigation API의 `navigate` 이벤트 중 이 가드가 쓰는 부분. 지원하지 않는 브라우저에는 `window.navigation`이 없다. */
export type TraverseEvent = {
  navigationType: string;
  cancelable: boolean;
  destination: { url: string; sameDocument: boolean };
  preventDefault(): void;
};

/**
 * 저장하지 않은 입력이 있을 때 브라우저 뒤로·앞으로 가기를 묻는다(BR2.2). 머무르면 이동을 취소해 주소·기록·입력이 그대로다.
 * 같은 문서 안의 이동은 라우터가 popstate에서 바로 반영해 편집 화면이 해제되므로, 그보다 먼저 오는 `navigate`에서 묻는다.
 * - 다른 문서로의 이동은 `useUnsavedGuard`의 beforeunload가 맡는다. 같은 주소로의 이동과 기록 추가(링크·`pushState`)는 묻지 않는다.
 * - 브라우저가 취소를 허용하지 않는 이동(`cancelable=false`)은 묻지 않는다. Chrome은 한 번 취소한 뒤 사용자 조작 없이 다시 누른 뒤로 가기를 이렇게 보낸다.
 */
export function unsavedTraverseGuard(isDirty: () => boolean, currentUrl: () => string, confirm: (message: string) => boolean, message: string) {
  return (event: TraverseEvent) => {
    if (event.navigationType !== "traverse" || !event.cancelable || !event.destination.sameDocument) return;
    if (event.destination.url === currentUrl() || !isDirty()) return;
    if (!confirm(message)) event.preventDefault();
  };
}

/** `useUnsavedGuard`와 함께 쓰는 뒤로·앞으로 가기 확인. Navigation API가 없는 브라우저에서는 아무것도 하지 않는다. */
export function useUnsavedTraverseGuard(dirty: boolean, message: string) {
  useEffect(() => {
    const navigation = (window as { navigation?: EventTarget }).navigation;
    if (!dirty || !navigation) return;
    const guard = unsavedTraverseGuard(() => true, () => window.location.href, (text) => window.confirm(text), message);
    const onNavigate = (event: Event) => guard(event as unknown as TraverseEvent);
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, [dirty, message]);
}
