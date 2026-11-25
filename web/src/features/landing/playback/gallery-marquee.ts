import type { MotionPreference } from "./motion";
import { createFrame, need, type Scope } from "./scope";

/** 카드 줄이 흐르는 속도(px/ms). 초당 20px. */
const SPEED = 0.02;

/**
 * Catch 예시 카드 줄. 줄 전체가 한 방향으로 흐르고, 같은 카드 묶음을 한 번 더 붙여 이음매 없이 돈다
 * (둘째 묶음은 보조기기와 포커스에서 뺀다).
 * 사용자가 누른 일시정지는 화면 밖이나 다른 탭에 다녀와도 유지된다. 다시 누르면 멈춘 자리에서 이어 흐른다.
 * 동작 줄이기에서는 흐르지 않는 정적 예시다.
 */
export function mountGalleryMarquee(page: HTMLElement, scope: Scope, motion: MotionPreference) {
  const gallery = page.querySelector<HTMLElement>(".catch-gallery34");
  if (!gallery) return;
  const viewport = need(gallery, ".catch-gallery-viewport34");
  const track = need(gallery, ".catch-gallery-track34");
  const group = need(gallery, ".catch-gallery-group34");
  const button = need<HTMLButtonElement>(gallery, "button");
  let distance = 0;
  let last: number | null = null;
  let paused = false;

  const visible = () => {
    const rect = viewport.getBoundingClientRect();
    return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) >= Math.min(rect.height * 0.35, 120);
  };
  const active = () => !paused && !motion.reduced && !document.hidden && visible();

  const render = () => {
    const reduce = motion.reduced;
    const width = group.getBoundingClientRect().width;
    const offset = width ? distance % width : 0;
    gallery.dataset.static = String(reduce);
    track.style.transform = reduce ? "none" : `translate3d(${-offset}px,0,0)`;
    button.textContent = paused ? "재생" : "일시정지";
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Catch 예시 카드 이동 재생" : "Catch 예시 카드 이동 일시정지");
    gallery.dataset.state = reduce ? "reduced" : paused ? "user-paused" : document.hidden ? "tab-hidden" : !visible() ? "offscreen" : "playing";
  };

  const frame = createFrame(scope, (now) => {
    if (active()) {
      if (last !== null) distance += (now - last) * SPEED;
      last = now;
    } else last = null;
    render();
    if (active()) frame.request();
  });
  const sync = () => {
    frame.cancel();
    last = null;
    render();
    if (active()) frame.request();
  };

  scope.listen(button, "click", () => {
    paused = !paused;
    sync();
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(sync, { threshold: [0, 0.35, 0.5, 1] });
    observer.observe(viewport);
    scope.add(() => observer.disconnect());
  }
  scope.listen(window, "scroll", sync, { passive: true });
  scope.listen(window, "resize", sync, { passive: true });
  scope.listen(document, "visibilitychange", sync);
  scope.listen(window, "pagehide", sync);
  scope.listen(window, "pageshow", sync);
  motion.onChange(sync);
  sync();
}
