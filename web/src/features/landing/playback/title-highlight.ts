import type { MotionPreference } from "./motion";
import { clamp01, createFrame, smoothstep, type Scope } from "./scope";

/** 줄 등장 → 0.4초 쉼 → 포인터가 「근거」를 끌어 칠하기까지 전체 길이(ms). */
const DURATION_MS = 5570;

/**
 * 첫 제목의 등장과 「근거」 강조. 방문마다 한 번 재생하고, 끝나면 칠해진 채로 둔다.
 * 화면에 보이고 탭이 켜져 있을 때만 시간이 흐른다. 동작 줄이기에서는 처음부터 끝 모습이다.
 * 브라우저의 글자 선택·입력·포커스를 건드리지 않는다. 포인터는 그림이다.
 */
export function mountTitleHighlight(page: HTMLElement, scope: Scope, motion: MotionPreference) {
  const title = page.querySelector<HTMLElement>(".hero h1");
  const word = title?.querySelector<HTMLElement>(".title-evidence33");
  const pointer = title?.querySelector<SVGElement>(".title-pointer35");
  if (!title || !word || !pointer) return;
  const lines = [...title.querySelectorAll<HTMLElement>(".headline-line34")];
  let elapsed = 0;
  let last: number | null = null;

  const visible = () => {
    const rect = title.getBoundingClientRect();
    return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) >= Math.min(rect.height * 0.6, window.innerHeight * 0.5);
  };
  const active = () => !motion.reduced && !document.hidden && visible() && elapsed < DURATION_MS;
  const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);

  const render = () => {
    const reduce = motion.reduced;
    const t = reduce ? DURATION_MS : elapsed;
    lines.forEach((line, index) => {
      const progress = clamp01((t - index * 170) / 1200);
      line.style.transform = `translate3d(0,${(1 - easeOut(progress)) * (line.offsetHeight + 3)}px,0)`;
      line.style.opacity = "1";
    });
    // 두 줄은 1370ms에 자리를 잡는다. 포인터는 400ms 쉰 뒤 다가온다.
    const approach = smoothstep(clamp01((t - 1770) / 800));
    const fill = clamp01((t - 2870) / 2200);
    const wordRect = word.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const x = wordRect.left - titleRect.left + (t < 2870 ? -36 * (1 - approach) : fill * wordRect.width);
    const y = wordRect.bottom - titleRect.top + 2;
    word.style.setProperty("--fill33", String(fill));
    pointer.style.transform = `translate3d(${x}px,${y}px,0)`;
    pointer.style.opacity = String(reduce ? 0 : clamp01((t - 1770) / 200) * clamp01((DURATION_MS - t) / 400));
    title.dataset.state = reduce ? "reduced" : elapsed >= DURATION_MS ? "complete" : document.hidden ? "tab-hidden" : !visible() ? "offscreen" : "playing";
  };

  const frame = createFrame(scope, (now) => {
    if (active()) {
      if (last !== null) elapsed = Math.min(DURATION_MS, elapsed + now - last);
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

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(sync, { threshold: [0, 0.6, 1] });
    observer.observe(title);
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
