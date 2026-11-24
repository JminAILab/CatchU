import { createFrame, type Scope } from "./scope";
import { readViewport } from "./viewport-fit";

/** 마지막 안내 덩어리(문구·버튼·여백)가 보이는 높이에 다 들어갈 때만 잠깐 고정해도 된다. */
export function endingHolds(blockHeight: number, viewportHeight: number, header: number) {
  return blockHeight > 0 && blockHeight <= viewportHeight - header + 1;
}

/**
 * 마지막 시작 안내의 짧은 고정(CSS sticky)을 켤지 끌지만 정한다(data-pin45).
 * 낮은 화면에서 버튼이 화면 아래로 밀린 채 고정되는 일을 막는다. 페이지를 움직이거나 입력을 막지 않는다.
 */
export function mountEndingPin(page: HTMLElement, scope: Scope) {
  const section = page.querySelector<HTMLElement>("#ending");
  const pin = section?.querySelector<HTMLElement>(".ending-pin45");
  if (!section || !pin || !("requestAnimationFrame" in window)) return;

  const frame = createFrame(scope, () => {
    const metrics = readViewport(page);
    const value = String(endingHolds(pin.getBoundingClientRect().height, metrics.height, metrics.header));
    if (section.dataset.pin45 !== value) section.dataset.pin45 = value;
  });
  const schedule = () => frame.request();

  scope.listen(window, "resize", schedule, { passive: true });
  scope.listen(window, "pageshow", schedule);
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(schedule);
    observer.observe(pin);
    scope.add(() => observer.disconnect());
  }
  document.fonts?.ready.then(schedule);
  schedule();
}
