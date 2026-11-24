import type { Scope } from "./scope";

/**
 * 브라우저에서 실제로 쓸 수 있는 높이를 한 곳에서 읽는다. 기능 구간·면접관 구간·마지막 안내가 같은 값을 쓴다.
 * 기기나 모니터 이름으로 나누지 않고 창 크기만 본다.
 */
export type ViewportMetrics = { width: number; height: number; header: number; gutter: number; available: number };
export type FitPlan = { top: number; available: number; deficit: number; fit: boolean };

/** 고정(fixed·sticky) 헤더가 가리는 높이. 페이지와 함께 올라가는 헤더는 0이다. */
function headerOffset(page: HTMLElement) {
  const header = page.querySelector<HTMLElement>(".site-header");
  if (!header) return 0;
  const style = getComputedStyle(header);
  const rect = header.getBoundingClientRect();
  return ["fixed", "sticky"].includes(style.position) ? Math.max(0, Math.min(rect.bottom, rect.height)) : 0;
}

/** 화면 가장자리에 남기는 여백. 좁거나 낮은 화면은 8px, 그 밖은 16px. */
export function viewportGutter(width: number, height: number) {
  return width <= 760 || height <= 700 ? 8 : 16;
}

/** `required` 높이를 헤더 아래 남은 공간의 가운데에 둔다. 들어가지 않으면 여백 아래에서 시작하고 fit이 false다. */
export function planFit(height: number, header: number, required: number, gutter: number): FitPlan {
  const available = Math.max(0, height - header - 2 * gutter);
  return { top: header + Math.max(gutter, (height - header - required) / 2), available, deficit: Math.max(0, required - available), fit: required <= available };
}

/** 지금 창 크기를 읽고, 고정되지 않은 구간이 쓰는 헤더 높이 변수를 맞춘다. */
export function readViewport(page: HTMLElement): ViewportMetrics {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const gutter = viewportGutter(width, height);
  const header = Math.ceil(headerOffset(page));
  const value = `${header}px`;
  if (page.style.getPropertyValue("--header-offset44") !== value) page.style.setProperty("--header-offset44", value);
  return { width, height, header, gutter, available: Math.max(0, height - header - 2 * gutter) };
}

export function watchViewportFit(page: HTMLElement, scope: Scope) {
  const apply = () => {
    readViewport(page);
  };
  apply();
  scope.listen(window, "resize", apply, { passive: true });
  scope.listen(window, "pageshow", apply);
  const header = page.querySelector(".site-header");
  if (header && "ResizeObserver" in window) {
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    scope.add(() => observer.disconnect());
  }
}
