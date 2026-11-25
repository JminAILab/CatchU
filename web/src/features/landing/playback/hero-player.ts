import { DemoClock } from "./demo-clock";
import type { MotionPreference } from "./motion";
import { createScenePlayer, renderScene } from "./scene-renderer";
import { createFrame, type Scope } from "./scope";

/** 등장 효과가 끝난 뒤 재생을 시작하기까지 기다리는 시간(ms). */
const ENTRANCE_MS = 720;
/** 첫 프레임이 이 시간 안에 오지 않으면 재생할 수 없는 환경으로 보고 요약 화면으로 바꾼다. */
const FIRST_TICK_LIMIT_MS = 2500;

/**
 * 대표 자동 시연과 등장 효과(data-reveal16)를 맡는다.
 * - 무대가 충분히 보이고, 탭이 켜져 있고, 등장이 끝났을 때만 시계가 흐른다.
 * - 일곱 장면을 세 번 돌면 세 화면 요약으로 바꾸고 그대로 둔다.
 * - 동작 줄이기에서는 처음부터 요약이다.
 * - 프레임 예약이나 화면 관찰을 쓸 수 없으면 요약 화면으로 물러난다(fallback16).
 * 실제 클릭·포커스 이동·소리·저장·서버 호출이 없다.
 */
export function mountHeroPlayer(page: HTMLElement, scope: Scope, motion: MotionPreference) {
  const root = page.querySelector<HTMLElement>(".demo16.hero14");
  if (!root) return;

  const fallback = () => {
    page.classList.add("fallback16");
    root.dataset.state = "fallback";
    root.querySelectorAll(".frame14").forEach((frame) => {
      frame.classList.remove("is-current");
      frame.setAttribute("aria-hidden", "true");
    });
    const summary = root.querySelector("[data-summary]");
    summary?.classList.remove("is-hidden");
    summary?.setAttribute("aria-hidden", "false");
    const caption = root.querySelector<HTMLElement>("[data-caption]");
    if (caption) caption.style.visibility = "hidden";
  };

  try {
    if (!("requestAnimationFrame" in window) || !("IntersectionObserver" in window)) {
      fallback();
      return;
    }
    const player = createScenePlayer(root);
    const clock = new DemoClock(player.config.durations);
    const reveals = [...page.querySelectorAll<HTMLElement>("[data-reveal16]")];
    const reveal = root.closest<HTMLElement>("[data-reveal16]");
    let last: number | null = null;
    let firstTick = false;

    const visiblePart = (rect: DOMRect) => ({
      height: Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)),
      width: Math.max(0, Math.min(rect.right, document.documentElement.clientWidth) - Math.max(rect.left, 0)),
    });
    /** 등장 효과로 옮겨 놓은 만큼을 뺀, 원래 자리의 사각형. */
    const restingRect = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const transform = getComputedStyle(element).transform;
      const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
      return new DOMRect(rect.left - (matrix?.m41 || 0), rect.top - (matrix?.m42 || 0), rect.width, rect.height);
    };
    const revealEligible = (element: HTMLElement) => {
      const rect = restingRect(element);
      const shown = visiblePart(rect);
      return rect.top <= window.innerHeight * 0.78 && shown.height >= Math.min(rect.height * 0.35, window.innerHeight * 0.25) && shown.width >= rect.width * 0.75;
    };
    const enter = (element: HTMLElement, at: number) => {
      if (element.classList.contains("entered16")) return;
      element.classList.add("entered16");
      element.dataset.revealAt = String(at);
    };

    const readGeometry = (now: number) => {
      const reduce = motion.reduced;
      page.classList.toggle("reduced16", reduce);
      for (const element of reveals) {
        if (element.classList.contains("entered16")) continue;
        if (reduce) enter(element, now - ENTRANCE_MS);
        else if (revealEligible(element)) enter(element, now);
      }
      const rect = player.stage.getBoundingClientRect();
      const shown = visiblePart(rect);
      const inside = shown.height >= Math.min(rect.height * 0.55, window.innerHeight * 0.58) && shown.width >= rect.width * 0.75;
      if (inside !== clock.inView) {
        clock.inView = inside;
        last = null;
      }
      clock.ready = !reveal || (reveal.classList.contains("entered16") && now - Number(reveal.dataset.revealAt) >= ENTRANCE_MS);
      clock.reduced = reduce;
      clock.visible = document.visibilityState === "visible";
    };
    const draw = () => renderScene(player, clock.snapshot(), { hideCaptionWithSummary: true, pointerLeaveFade: 250 });
    const needFrame = (now: number) => clock.running || reveals.some((element) => element.classList.contains("entered16") && now - Number(element.dataset.revealAt) < 1150);

    const frame = createFrame(scope, (now) => {
      readGeometry(now);
      if (clock.running) {
        firstTick = true;
        if (last !== null) clock.advance(now - last);
        last = now;
      } else last = null;
      draw();
      if (needFrame(now)) schedule();
    });
    const schedule = () => {
      if (document.visibilityState === "visible") frame.request();
    };
    const sync = () => {
      const now = performance.now();
      readGeometry(now);
      last = null;
      draw();
      if (needFrame(now)) schedule();
    };

    page.classList.add("motion16-ready");
    const observer = new IntersectionObserver(sync, { threshold: [0, 0.25, 0.55, 0.75, 1] });
    reveals.forEach((element) => observer.observe(element));
    observer.observe(player.stage);
    scope.add(() => observer.disconnect());
    scope.listen(window, "scroll", sync, { passive: true });
    scope.listen(window, "resize", sync, { passive: true });
    scope.listen(document, "visibilitychange", () => {
      frame.cancel();
      sync();
    });
    scope.listen(window, "pagehide", () => {
      frame.cancel();
      clock.visible = false;
      last = null;
      draw();
    });
    scope.listen(window, "pageshow", sync);
    motion.onChange(sync);
    sync();

    const timer = window.setTimeout(() => {
      if (clock.running && !firstTick) {
        clock.failed = true;
        draw();
      }
    }, FIRST_TICK_LIMIT_MS);
    scope.add(() => window.clearTimeout(timer));
  } catch (error) {
    fallback();
    page.dataset.demoError = error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
  }
}

/** 다른 구간이 대표 재생기의 등장 효과가 켜졌는지 확인할 때 쓴다. */
export function entranceMotionReady(page: HTMLElement) {
  return page.classList.contains("motion16-ready");
}
