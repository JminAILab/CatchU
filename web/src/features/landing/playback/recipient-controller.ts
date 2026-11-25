import type { MotionPreference } from "./motion";
import { createScenePlayer, renderScene, sceneOffset, type ScenePosition } from "./scene-renderer";
import { clamp01, createFrame, need, setStyle, setText, type Scope } from "./scope";
import { mapStep } from "./story-controller";
import { planFit, readViewport, type FitPlan, type ViewportMetrics } from "./viewport-fit";

/**
 * 면접관(링크를 받은 사람) 시연. 기능 구간과 같은 규칙으로 페이지 스크롤이 여섯 단계 중 하나를 고른다.
 * 단계마다 진행 시간을 갖고, 끝난 단계는 결과를 유지하며, 끝나기 전에 떠난 단계는 돌아오면 이어진다.
 *
 * 배치는 들어가는 것 중 가장 넉넉한 것을 고른다.
 *   설명+시연 묶음 그대로(stacked) → 글 주변 장식 여백을 줄인 묶음(compact) → 창 안 빈자리도 줄인 묶음(tight)
 *   → 설명은 흘려보내고 시연만 고정(demo). 그래도 넘치면 시연 영역 안쪽을 스크롤한다.
 * 글자는 줄이지 않는다. 휴대폰 주소창이 오르내리며 높이가 바뀌어도 배치가 뒤집히지 않게 작은 화면 높이(svh)를 기준으로 삼는다.
 * 휠 가로채기·서버 호출·클립보드·포커스 이동·실제 입력·저장이 없다.
 */
type Segment = readonly [scene: number, from: number, to: number, duration: number];
type Step = { label: string; segments: readonly Segment[]; duration: number; elapsed: number; done: boolean };
type Arrangement = "stacked" | "compact" | "tight" | "demo";
type Measured = { natural: number; stage: number; pad: number; required: number; plan: FitPlan };
type Anchor = { index: number; ratio: number } | null;

const STEP_DEFS: ReadonlyArray<readonly [string, readonly Segment[]]> = [
  ["소개 읽기", [[0, 0, 6500, 5200]]],
  ["Catch 내용·근거 자세히 보기", [[1, 1800, 6000, 4200]]],
  ["질문 입력", [[2, 0, 5600, 5600]]],
  ["질문하기", [[2, 6200, 9400, 3200]]],
  ["답변 읽기·인용 근거 선택", [[3, 4200, 7200, 3000]]],
  ["같은 발행본의 근거 위치", [[4, 0, 0, 250]]],
];
const WEIGHTS = [1.1, 1, 1.3, 1, 1, 0.8];
const EDGE_HYSTERESIS_PX = 28;
const SETTLE_MS = 120;

/** 단계별 시작 위치와 전체 스크롤 길이. 모바일은 기능 구간과 같은 긴 띠를 쓴다. */
export function recipientBands(width: number, height: number) {
  const unit = width <= 760 ? Math.round(Math.max(400, Math.min(520, height * 0.65))) : Math.round(Math.max(260, Math.min(310, height * 0.36)));
  let cursor = 0;
  const offsets = WEIGHTS.map((weight) => {
    const start = cursor;
    cursor += unit * weight;
    return Math.round(start);
  });
  return { offsets, total: Math.ceil(cursor), unit };
}

/** 대상이 읽히는 범위 안에 있는가. 범위보다 큰 대상은 범위의 60% 이상을 채우면 된다. */
export function readableRect(rect: { top: number; bottom: number; left: number; right: number; width: number; height: number }, clip: { top: number; bottom: number; left: number; right: number }) {
  if (!(rect.width > 0 && rect.height > 0)) return false;
  const room = clip.bottom - clip.top;
  if (rect.height > room) return Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top) >= room * 0.6 && rect.right > clip.left && rect.left < clip.right;
  return rect.top >= clip.top - 2 && rect.bottom <= clip.bottom + 2 && rect.left >= clip.left - 2 && rect.right <= clip.right + 2;
}

export function mountRecipient(page: HTMLElement, scope: Scope, motion: MotionPreference) {
  const area = page.querySelector<HTMLElement>("#recipient");
  if (!area) return;
  const root = area.querySelector<HTMLElement>('[data-player="recipient"]');
  let failed = false;
  let stop = () => {};

  /** 스크립트가 없을 때와 같은, 마지막 화면을 보이는 보통 흐름으로 물러난다. */
  const fallback = (error: unknown) => {
    failed = true;
    stop();
    for (const name of ["pin44", "layout44", "sized44", "sizing44", "overflow44", "reduced44"]) delete area.dataset[name];
    area.dataset.error44 = error instanceof Error ? `${error.name}: ${error.message}` : "unavailable";
    if (!root) return;
    root.querySelectorAll(".frame14").forEach((frame) => {
      frame.classList.remove("is-current");
      frame.setAttribute("aria-hidden", "true");
    });
    const summary = root.querySelector("[data-summary]");
    summary?.classList.remove("is-hidden");
    summary?.setAttribute("aria-hidden", "false");
  };

  try {
    if (!root || !("requestAnimationFrame" in window) || !("ResizeObserver" in window)) throw new Error("recipient scroll prerequisites missing");
    const shell = need(area, ".shell");
    const head = need(area, ".recipient-head");
    const demo = need(area, ".recipient-demo");
    const player = createScenePlayer(root);
    const stepNote = root.querySelector(".demo-label14 span:last-child");
    const steps: Step[] = STEP_DEFS.map(([label, segments]) => ({ label, segments, duration: segments.reduce((sum, segment) => sum + segment[3], 0), elapsed: 0, done: false }));
    const reduced = () => motion.reduced;
    const positionOf = (step: Step): ScenePosition => mapStep(step, (scene) => sceneOffset(player.config, scene));
    const render = (position: ScenePosition) => renderScene(player, { ...position, state: "scroll", completed: 0, summary: false }, { hideCaptionWithSummary: false, pointerLeaveFade: null });

    // 영역이 안쪽으로 스크롤될 때 자막 뒤에 붙는 안내.
    const hint = document.createElement("span");
    hint.className = "inner-hint57";
    scope.add(() => hint.remove());
    let inner: "" | "more" | "end" = "";
    const setCaption = (text: string, note: string) => {
      const caption = player.caption;
      if (caption.childNodes.length !== 2 || caption.firstChild?.nodeValue !== text || caption.lastChild !== hint) {
        caption.textContent = text;
        caption.append(hint);
      }
      setText(hint, note ? ` · ${note}` : "");
    };

    let active = -1;
    let pending = -1;
    let pendingAt = 0;
    let last: number | null = null;
    let dirty = true;
    let boundsDirty = false;
    let drawn = -1;
    let everDrawn = false;
    let inView = true;
    let pinnedSince: number | null = null;
    let bounds: number[] = [];
    let offsets: number[] = [];
    let distance = 1800;
    let top = 16;
    let geometryKey = "";
    let measured: Measured | null = null;
    let pin: "bundle" | "demo" = "bundle";
    let overflow = false;
    let headOuter = 0;
    let anchor: Anchor = null;
    let resizeAnchor: Anchor = null;
    let resizePending = false;
    let resizeAt = -1e9;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    // 폭 0짜리 자 두 개로 작은 화면 높이(주소창 보임)와 큰 화면 높이(주소창 숨김)를 잰다. 단위를 모르는 브라우저에서는 0이 나온다.
    const ruler = (unit: string) => {
      const element = document.createElement("div");
      element.setAttribute("aria-hidden", "true");
      element.style.cssText = `position:fixed;top:0;left:0;width:0;pointer-events:none;height:100${unit}`;
      page.append(element);
      scope.add(() => element.remove());
      return element;
    };
    const smallRuler = ruler("svh");
    const largeRuler = ruler("lvh");
    const viewportBars = () => {
      const small = smallRuler.getBoundingClientRect().height;
      const large = largeRuler.getBoundingClientRect().height;
      return small > 0 && large >= small ? { small, range: large - small } : { small: 0, range: 0 };
    };
    const host = () => (pin === "demo" ? demo : shell);

    // ── 크기 재기 ───────────────────────────────────────────────────────
    const sampleTimes = (scene: number) => {
      const times = new Set<number>([0, player.config.durations[scene] - 1]);
      player.frames[scene].querySelectorAll<HTMLElement>("[data-from],[data-until],[data-type-end]").forEach((element) => {
        for (const name of ["from", "until", "typeEnd"]) {
          const value = element.dataset[name];
          if (value !== undefined) {
            const n = Number(value);
            times.add(Math.max(0, n - 1));
            times.add(n);
          }
        }
      });
      for (const step of steps) {
        for (const [frame, from, to] of step.segments) {
          if (frame === scene) {
            times.add(from);
            times.add(to);
          }
        }
      }
      return [...times].filter((t) => t >= 0 && t < player.config.durations[scene]).sort((a, b) => a - b);
    };
    /** 보일 수 있는 모든 장면 상태 가운데 가장 큰 창 높이. */
    const naturalWindow = () => {
      let natural = 0;
      for (let scene = 0; scene < player.frames.length; scene++) {
        const windowElement = player.frames[scene].querySelector(".app-window");
        if (!windowElement) continue;
        for (const time of sampleTimes(scene)) {
          render({ scene, local: time, elapsed: sceneOffset(player.config, scene) + time });
          natural = Math.max(natural, windowElement.getBoundingClientRect().height);
        }
      }
      return Math.ceil(natural);
    };
    const setArrangement = (next: Arrangement) => {
      pin = next === "demo" ? "demo" : "bundle";
      area.dataset.layout44 = next === "compact" || next === "tight" ? next : "stacked";
      area.dataset.pin44 = pin;
    };
    const evaluate = (metrics: ViewportMetrics, candidate: Arrangement, knownNatural: number): Measured => {
      // 창 그림자를 위해 둘레에 남기는 자리. tight는 덜 남긴다.
      const mobile = metrics.width <= 760;
      const pad = candidate === "tight" ? 20 : mobile ? 30 : 40;
      const base = mobile ? 0 : 510;
      setArrangement(candidate);
      const natural = knownNatural || naturalWindow();
      const minimum = natural + pad;
      setStyle(area, "--window-height44", `${natural}px`);
      setStyle(area, "--stage-height44", `${minimum}px`);
      area.dataset.sized44 = "true";
      const overhead = Math.max(0, Math.ceil(host().getBoundingClientRect().height) - minimum);
      // 데스크톱은 높이가 모자랄 때만 무대를 줄이고, 가장 큰 장면보다 작게 하지 않는다. 모바일은 가장 큰 장면만큼만 잡는다.
      const stage = Math.ceil(mobile ? minimum : Math.max(minimum, Math.min(base, Math.floor(metrics.available - overhead))));
      const required = overhead + stage;
      return { natural, stage, pad, required, plan: planFit(metrics.height, metrics.header, required, metrics.gutter) };
    };
    const measure = (metrics: ViewportMetrics) => {
      let result: Measured | null = null;
      let wide = 0;
      area.dataset.sizing44 = "true";
      area.dataset.overflow44 = "false";
      try {
        for (const candidate of ["stacked", "compact", "tight", "demo"] as const) {
          // demo의 창 폭은 stacked와 같으므로 다시 재지 않는다.
          result = evaluate(metrics, candidate, candidate === "demo" ? wide : 0);
          if (candidate === "stacked") wide = result.natural;
          if (result.plan.fit) break;
        }
        if (result && !result.plan.fit) {
          // 실제 스크롤바가 창을 좁힌다. 그 폭으로 다시 잰다.
          area.dataset.overflow44 = "true";
          result = evaluate(metrics, "demo", 0);
          if (result.plan.fit) area.dataset.overflow44 = "false";
        }
        if (!result) throw new Error("recipient layout not measured");
        setStyle(area, "--stage-height44", `${result.stage}px`);
        setStyle(area, "--window-height44", `${result.stage - result.pad}px`);
      } finally {
        delete area.dataset.sizing44;
        player.anchorPoints = {};
        player.anchorSize = "";
        player.stamp = "";
      }
      return result;
    };
    const measureBounds = () => {
      const padTop = parseFloat(getComputedStyle(area).paddingTop) || 0;
      const start = area.getBoundingClientRect().top + window.scrollY + padTop + headOuter - top;
      bounds = offsets.map((offset) => start + offset);
    };
    const layout = () => {
      const metrics = readViewport(page);
      const small = viewportBars().small;
      const basis = small > 0 ? Math.min(metrics.height, Math.round(small)) : metrics.height;
      // 배치 선택·무대·단계 띠는 작은 화면 높이로 정한다. 가운데 맞춤만 지금 높이를 따른다.
      const steady = { ...metrics, height: basis, available: Math.max(0, basis - metrics.header - 2 * metrics.gutter) };
      const key = [metrics.width, basis, metrics.header, reduced()].join(":");
      if (key !== geometryKey || !measured) {
        measured = measure(steady);
        geometryKey = key;
      }
      const fit = planFit(metrics.height, metrics.header, measured.required, metrics.gutter);
      overflow = !measured.plan.fit;
      const hostHeight = overflow ? steady.available : measured.required;
      top = overflow ? metrics.header + metrics.gutter : fit.top;
      const band = recipientBands(metrics.width, basis);
      offsets = band.offsets;
      distance = band.total;
      const padTop = parseFloat(getComputedStyle(area).paddingTop) || 0;
      headOuter = pin === "demo" ? head.getBoundingClientRect().height + (parseFloat(getComputedStyle(head).marginBottom) || 0) : 0;
      // 고정이 끝나는 자리를 화면 아래에 맞추려고 뒤쪽 여백을 블록 위쪽 공간만큼 둔다.
      const tail = Math.max(padTop, Math.round(metrics.height - top - hostHeight));
      setStyle(area, "--sticky-top44", `${top}px`);
      setStyle(area, "--available-height44", `${steady.available}px`);
      setStyle(area, "--tail-pad44", `${tail}px`);
      setStyle(area, "--section-height44", `${Math.ceil(padTop + headOuter + hostHeight + distance + 60 + tail)}px`);
      if (overflow) {
        demo.tabIndex = 0;
        demo.setAttribute("role", "group");
        demo.setAttribute("aria-label", "수신자 시연, 아래 내용은 이 영역을 스크롤해 확인");
      } else {
        demo.removeAttribute("tabindex");
        demo.removeAttribute("role");
        demo.removeAttribute("aria-label");
      }
      area.dataset.reduced44 = String(reduced());
      measureBounds();
    };

    // ── 재생 조건 ───────────────────────────────────────────────────────
    /** 고정되기 조금 전에 블록 전체가 화면에 들어올 수 있다(예: #recipient 링크). 첫 단계는 그때부터 시작해도 된다. */
    const fullyShown = () => {
      const rect = host().getBoundingClientRect();
      return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    };
    const near = () => {
      const rect = area.getBoundingClientRect();
      return rect.bottom > -window.innerHeight && rect.top < 2 * window.innerHeight;
    };
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) >= Math.min(300, rect.height * 0.55, window.innerHeight * 0.45) && rect.right > 0 && rect.left < window.innerWidth;
    };
    /** 구간의 등장 효과가 끝난 뒤에 재생한다. */
    const entered = (now: number) => {
      if (reduced() || !page.classList.contains("motion16-ready")) return true;
      if (demo.classList.contains("entered16")) return now - Number(demo.dataset.revealAt || 0) >= 720;
      if (pinnedSince === null) pinnedSince = now;
      return now - pinnedSince >= 1800;
    };
    /** 누르거나 읽거나 글자를 넣는 자리가 보이는 범위 밖이면 시간을 쓰지 않는다. */
    const actionReadable = (step: Step) => {
      const position = positionOf(step);
      const frame = player.frames[position.scene];
      const t = position.local;
      const target = (player.config.actions[position.scene] || []).find((action) => t >= action.start - 100 && t <= action.end)?.target;
      const element = target ? frame.querySelector<HTMLElement>(`[data-target="${target}"]`) : null;
      if (!element) return true;
      const clip = { top: 0, bottom: window.innerHeight - 6, left: 0, right: window.innerWidth };
      if (overflow) {
        const box = demo.getBoundingClientRect();
        clip.top = Math.max(0, box.top);
        clip.bottom = Math.min(clip.bottom, box.bottom);
        clip.left = Math.max(0, box.left);
        clip.right = Math.min(window.innerWidth, box.right);
      }
      const rect = element.getBoundingClientRect();
      // 입력칸은 안쪽 상자로 판단한다. 테두리와 안쪽 여백에는 포인터도 글자도 놓이지 않는다.
      if (element.querySelector("[data-type]")) {
        const style = getComputedStyle(element);
        const px = (value: string) => parseFloat(value) || 0;
        const inner = {
          top: rect.top + px(style.borderTopWidth) + px(style.paddingTop),
          bottom: rect.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
          left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
          right: rect.right - px(style.borderRightWidth) - px(style.paddingRight),
        };
        if (inner.bottom > inner.top && inner.right > inner.left) return readableRect({ ...inner, width: inner.right - inner.left, height: inner.bottom - inner.top }, clip);
      }
      return readableRect(rect, clip);
    };

    // ── 단계 선택 ───────────────────────────────────────────────────────
    const select = (index: number) => {
      if (index === active) return;
      const previous = active;
      const step = steps[index];
      if (reduced()) {
        step.done = true;
        step.elapsed = step.duration;
      }
      active = index;
      last = null;
      Object.assign(area.dataset, { step44: String(index), transition44: previous < 0 ? "enter" : index < previous ? "resume-back" : "resume-forward" });
    };
    const desired = () => {
      let index = 0;
      for (let n = 1; n < bounds.length; n++) {
        if (window.scrollY >= bounds[n]) index = n;
        else break;
      }
      return index;
    };
    const choose = (now: number) => {
      if (document.hidden || !bounds.length) return;
      const index = desired();
      if (reduced()) {
        if (window.scrollY >= bounds[0] && index !== active) select(index);
        pending = -1;
        return;
      }
      if (active < 0) {
        if (window.scrollY >= bounds[0]) select(index);
        else if (index === 0 && fullyShown()) select(0);
        return;
      }
      if (index === active) {
        pending = -1;
        return;
      }
      const delta = index - active;
      // 경계에서는 조금 더 넘어야 하고, 잠깐 머물러야 바뀐다(양쪽 방향 모두).
      if (Math.abs(delta) === 1) {
        const edge = delta > 0 ? bounds[index] + EDGE_HYSTERESIS_PX : bounds[active] - EDGE_HYSTERESIS_PX;
        if (delta > 0 ? window.scrollY < edge : window.scrollY > edge) {
          pending = -1;
          return;
        }
      }
      if (pending !== index) {
        pending = index;
        pendingAt = now;
        return;
      }
      if (now - pendingAt < SETTLE_MS) return;
      select(index);
      pending = -1;
    };
    const capture = () => {
      if (active < 0 || !bounds.length) return null;
      const end = bounds[0] + distance;
      if (window.scrollY < bounds[0] || window.scrollY >= end) return null;
      const start = bounds[active];
      const stopAt = bounds[active + 1] ?? end;
      return { index: active, ratio: clamp01((window.scrollY - start) / Math.max(1, stopAt - start)) };
    };
    /** 크기가 바뀐 뒤에도 같은 단계의 같은 자리에 둔다. 진행 시간과 결과는 그대로다. */
    const restoreViewport = () => {
      if (!resizePending) return;
      resizePending = false;
      const kept = resizeAnchor;
      if (!kept || kept.index !== active) return;
      const start = bounds[active];
      const stopAt = bounds[active + 1] ?? bounds[0] + distance;
      const margin = Math.min(40, (stopAt - start) / 4);
      const y = Math.max(start + margin, Math.min(stopAt - margin, start + kept.ratio * (stopAt - start)));
      pending = -1;
      last = null;
      if (Math.abs(window.scrollY - y) >= 1) window.scrollTo({ top: y, left: window.scrollX, behavior: "instant" });
    };

    const display = () => {
      const index = Math.max(0, active);
      const step = steps[index];
      const position = positionOf(step);
      render(position);
      setCaption(player.config.captions[position.scene], inner !== "end" ? "" : !step.done ? "이 영역의 끝입니다" : index < steps.length - 1 ? "이 영역의 끝입니다 · 페이지를 내려 다음 단계로" : "이 영역의 끝입니다 · 아래로 이어집니다");
      if (stepNote) setText(stepNote, inner === "more" ? `${index + 1}/${steps.length} · 아래에 내용이 더 있습니다` : `${index + 1}/${steps.length} — 스크롤로 다음 단계`);
      if ((area.dataset.inner57 || "") !== inner) area.dataset.inner57 = inner;
      Object.assign(root.dataset, {
        step: String(index),
        stepElapsed: String(Math.round(step.elapsed)),
        stepDuration: String(step.duration),
        stepDone: String(step.done),
        state: reduced() ? "reduced" : step.done ? "result" : document.hidden ? "tab-hidden" : !inView ? "offscreen" : "playing",
      });
      if (step.done || reduced()) player.pulse.style.visibility = "hidden";
      if (reduced()) player.pointer.style.visibility = "hidden";
      drawn = index;
      everDrawn = true;
    };

    const tick = (now: number) => {
      const remeasured = dirty;
      if (dirty) {
        layout();
        dirty = false;
        boundsDirty = false;
      } else if (boundsDirty) {
        measureBounds();
        boundsDirty = false;
      }
      restoreViewport();
      choose(now);
      const step = active >= 0 ? steps[active] : null;
      const index = Math.max(0, active);
      // 화면에서 멀고 이미 그렸으면 읽지도 쓰지도 않고 시계도 세운다.
      if (everDrawn && !remeasured && drawn === index && !near()) {
        last = null;
        anchor = capture();
        area.dataset.running44 = "false";
        if (!document.hidden && pending >= 0) schedule();
        return;
      }
      if (step && reduced() && !step.done) {
        step.done = true;
        step.elapsed = step.duration;
      }
      // 새로 고른 장면은 한 번 그린 뒤에야 가림 여부로 재생을 막을 수 있다.
      const fresh = !!step && (remeasured || drawn !== index);
      const stageVisible = visible(player.stage);
      inView = stageVisible;
      inner = overflow ? (demo.scrollHeight - demo.clientHeight - demo.scrollTop > 2 ? "more" : "end") : "";
      const hasEntered = !!step && entered(now);
      const readable = !!step && !fresh && actionReadable(step);
      const running = !!(step && hasEntered && !step.done && !reduced() && !document.hidden && stageVisible && readable);
      if (running && step) {
        if (last !== null) step.elapsed = Math.min(step.duration, step.elapsed + Math.min(100, now - last));
        last = now;
        if (step.elapsed >= step.duration) {
          step.done = true;
          last = null;
        }
      } else last = null;
      display();
      area.dataset.running44 = String(running);
      area.dataset.paused44 = !step || step.done ? "" : !hasEntered ? "entrance" : !stageVisible ? "offscreen" : !readable ? "target-outside-view" : "";
      anchor = capture();
      if (!document.hidden && (running || pending >= 0 || fresh || (step && !step.done && !hasEntered))) schedule();
    };
    const frame = createFrame(scope, (now) => {
      try {
        tick(now);
      } catch (error) {
        fallback(error);
      }
    });
    stop = () => frame.cancel();
    const schedule = () => {
      if (!failed) frame.request();
    };
    const sync = () => {
      last = null;
      dirty = true;
      schedule();
    };
    const resized = () => {
      const now = performance.now();
      const width = window.innerWidth;
      const height = window.innerHeight;
      // window와 visualViewport가 같은 변화를 한 번씩 알린다. 두 번째 알림과 확대 제스처는 새 크기가 없으니 자리를 다시 잡지 않는다.
      if (width === lastWidth && height === lastHeight) {
        sync();
        return;
      }
      // 터치 스크롤 중 주소창만큼만 높이가 바뀐 것이면 스크롤 위치는 손가락에 맡긴다.
      const range = viewportBars().range;
      const chromeOnly = range > 0 && width === lastWidth && height !== lastHeight && Math.abs(height - lastHeight) <= range + 2;
      lastWidth = width;
      lastHeight = height;
      if (chromeOnly) resizePending = false;
      else {
        // 연속된 변화의 첫 알림이 바뀌기 전 자리를 붙든다.
        if (now - resizeAt > 250) resizeAnchor = anchor;
        resizeAt = now;
        resizePending = true;
      }
      pending = -1;
      sync();
    };

    scope.listen(window, "scroll", schedule, { passive: true });
    scope.listen(
      demo,
      "scroll",
      () => {
        last = null;
        schedule();
      },
      { passive: true },
    );
    scope.listen(window, "resize", resized, { passive: true });
    if (window.visualViewport) scope.listen(window.visualViewport, "resize", resized, { passive: true });
    scope.listen(document, "visibilitychange", () => {
      last = null;
      if (document.hidden) frame.cancel();
      sync();
    });
    scope.listen(window, "pagehide", () => {
      last = null;
      frame.cancel();
    });
    scope.listen(window, "pageshow", sync);
    motion.onChange(sync);
    // 위쪽 구간(특히 기능 구간)의 높이가 창 크기에 따라 바뀌면 이 구간이 밀린다. 단계 경계를 다시 읽는다.
    const observers = [
      new ResizeObserver(() => {
        boundsDirty = true;
        if (performance.now() - resizeAt < 250) resizePending = true;
        schedule();
      }),
      new ResizeObserver(() => {
        dirty = true;
        schedule();
      }),
    ];
    observers[0].observe(document.body);
    observers[1].observe(head);
    const header = page.querySelector(".site-header");
    if (header) observers[1].observe(header);
    scope.add(() => observers.forEach((observer) => observer.disconnect()));
    document.fonts?.ready.then(() => {
      if (scope.disposed) return;
      geometryKey = "";
      sync();
    });
    sync();
  } catch (error) {
    fallback(error);
  }
}
