import type { MotionPreference } from "./motion";
import { createScenePlayer, renderScene, sceneOffset, type ScenePlayer, type ScenePosition } from "./scene-renderer";
import { clamp01, createFrame, need, setStyle, setText, type Scope } from "./scope";
import { planFit, readViewport, viewportGutter } from "./viewport-fit";

/**
 * 기능 1~4 구간. 파란 영역 하나를 화면에 고정해 두고, 페이지 스크롤 위치로 13개 단계 중 하나를 고른다.
 *
 * 규칙
 * - 스크롤은 단계를 고를 뿐 재생 프레임을 움직이지 않는다. 단계마다 자기 진행 시간이 있다.
 * - 끝난 단계는 결과 화면을 유지한다. 끝나기 전에 떠난 단계는 돌아오면 멈춘 자리에서 이어진다.
 * - 경계에서는 28px을 더 넘어야 하고, 그 자리에 120ms 머물러야 단계가 바뀐다(경계 흔들림 방지).
 *   빠르게 여러 단계를 지나치면 중간 단계는 재생하지 않고 멈춘 곳의 단계만 고른다.
 * - 화면 밖이거나, 탭이 꺼져 있거나, 포인터가 향하는 자리가 가려져 있으면 시간이 흐르지 않는다.
 * - 영역이 화면 높이에 들어가지 않으면 영역 안쪽을 스크롤하게 하고 안내 문구를 보인다.
 * - 바로가기 버튼은 그 기능의 첫 단계로 옮기고 그 기능을 처음부터 다시 보여 준다. 휠·터치 입력은 가로채지 않는다.
 * - 동작 줄이기에서는 재생 없이 각 단계의 결과 화면을 바로 보인다.
 * 서버 호출·클립보드·포커스 이동·실제 입력·저장이 없다.
 */
const KEYS = ["records", "evidence", "verification", "publication"] as const;
type StoryKey = (typeof KEYS)[number];
/** [장면, 원래 시간표의 시작, 끝, 이 단계에서 쓰는 길이(ms)] */
type Segment = readonly [scene: number, from: number, to: number, duration: number];
type Step = { key: StoryKey; label: string; segments: readonly Segment[]; result: string; duration: number; elapsed: number; done: boolean };

const STEP_DEFS: ReadonlyArray<readonly [StoryKey, string, readonly Segment[], string]> = [
  ["records", "저장소 목록·선택", [[0, 0, 2600, 2600], [0, 5000, 5000, 200]], "선택한 저장소와 분석 안내를 읽습니다. 선택만으로 분석을 요청하지 않습니다."],
  ["records", "분석 안내·요청", [[0, 10500, 14000, 3000]], "동의하고 분석 요청 → 요청 접수. 분석 완료와 구분합니다."],
  ["records", "분석 중·완료", [[1, 1500, 5000, 3500]], "상태 새로고침 후 분석 완료 결과를 확인합니다. 실제 분석 시간을 나타내지 않습니다."],
  ["records", "Catch 목록", [[1, 7200, 9300, 2100], [2, 0, 0, 250]], "이 저장소 Catch 보기 → sample-project의 Catch 목록."],
  ["evidence", "Catch 설명 읽기", [[0, 0, 0, 0]], "Catch 내용과 해당 근거 항목을 읽습니다."],
  ["evidence", "근거 열기·원본 확인", [[0, 2500, 4600, 2100], [1, 0, 0, 200]], "원본 근거 열기 → GitHub 새 탭. 시연 안의 탭 전환이며 실제 새 탭은 열지 않습니다."],
  ["evidence", "코드 패널 확대", [[1, 1800, 3100, 1300]], "GitHub 새 탭에서 변경 부분을 확인합니다. CatchU 안의 코드 화면이 아닙니다."],
  ["verification", "맞는지 보기·미공개", [[0, 300, 4400, 4100]], "CatchU 탭으로 돌아와 Catch 내용이 맞는지 봅니다. 공개하기 전에는 나만 봅니다."],
  ["verification", "공개 켜기", [[0, 5400, 7600, 2200]], "공개 전환 단추를 켜 공개합니다. 언제든 다시 숨길 수 있습니다."],
  ["publication", "자료 선택·순서", [[0, 500, 4700, 4200]], "자기소개 → Catch. 선택한 항목에 하나씩 추가됩니다."],
  ["publication", "제목 입력·발행 내용 확인", [[0, 6500, 9000, 2200], [0, 9000, 12500, 3500], [0, 12500, 14400, 700], [0, 14400, 16300, 1900], [1, 0, 0, 200]], "제목을 넣고 발행할 내용을 확인합니다. 아직 발행 전입니다."],
  ["publication", "발행·URL 복사", [[1, 2800, 5000, 2200], [1, 5000, 7400, 500], [2, 700, 3300, 2600]], "발행 → URL 복사. 실제 발행이나 클립보드를 사용하지 않습니다."],
  ["publication", "받은 사람의 첫 화면", [[3, 0, 0, 250]], "여기부터는 링크를 받은 사람이 보는 화면입니다."],
];
/** 기능별 단계 번호 묶음 */
const GROUPS: ReadonlyArray<readonly number[]> = [[0, 1, 2, 3], [4, 5, 6], [7, 8], [9, 10, 11, 12]];
/** 단계마다 차지하는 스크롤 길이의 비율(데스크톱·모바일) */
const DESKTOP_WEIGHTS = [1, 1, 1, 1, 0.8, 1, 0.8, 1.2, 1, 1.1, 1.5, 1.2, 0.8];
const MOBILE_WEIGHTS = [1.2, 1, 1, 1, 0.9, 1, 0.9, 1.3, 1, 1.2, 1.5, 1.2, 1];
const EDGE_HYSTERESIS_PX = 28;
const SETTLE_MS = 120;
const INTRO_MS = 800;
const COPY_MS = 720;

type StoryPlayer = ScenePlayer & { position: ScenePosition; inView: boolean; drawnStep: number };
type Measured = { requiredHeight: number; navHeight: number };
type Anchor = { index: number; ratio: number } | null;

/** 단계 안에서 흐른 시간을 원래 시간표의 (장면, 시각)으로 바꾼다. */
export function mapStep(step: Pick<Step, "elapsed" | "duration" | "segments">, sceneStart: (scene: number) => number): ScenePosition {
  let t = Math.min(step.elapsed, step.duration);
  for (let i = 0; i < step.segments.length; i++) {
    const [scene, from, to, duration] = step.segments[i];
    if (t < duration || i === step.segments.length - 1) {
      const local = duration ? from + (to - from) * clamp01(t / duration) : to;
      return { scene, local, elapsed: sceneStart(scene) + local };
    }
    t -= duration;
  }
  throw new Error("step has no segments");
}

/** 모바일의 단계별 시작 위치와 전체 스크롤 길이 */
export function mobileBands(height: number) {
  const unit = Math.round(Math.max(400, Math.min(520, height * 0.65)));
  let cursor = 0;
  const offsets = MOBILE_WEIGHTS.map((weight) => {
    const start = cursor;
    cursor += unit * weight;
    return Math.round(start);
  });
  return { offsets, travel: Math.ceil(cursor), unit };
}

export function mountStory(page: HTMLElement, scope: Scope, motion: MotionPreference) {
  const story = page.querySelector<HTMLElement>("#story");
  if (!story) return;
  try {
    run(page, story, scope, motion);
  } catch (error) {
    // 고정 구간을 쓸 수 없으면 기능 네 개를 차례로 읽는 정적 배치로 물러난다.
    story.dataset.layout = "static";
    story.dataset.error36 = error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
  }
}

function run(page: HTMLElement, story: HTMLElement, scope: Scope, motion: MotionPreference) {
  if (!("requestAnimationFrame" in window) || !("ResizeObserver" in window)) throw new Error("story scroll prerequisites missing");
  const steps: Step[] = STEP_DEFS.map(([key, label, segments, result]) => ({ key, label, segments, result, duration: segments.reduce((sum, segment) => sum + segment[3], 0), elapsed: 0, done: false }));
  const features = [...story.querySelectorAll<HTMLElement>(".story-stack36>.feature")];
  const sticky = need(story, ".story-sticky36");
  const nav = need(story, ".feature-nav42");
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>(".feature-jump42")];
  const hint = need(story, ".inner-hint47");
  const copies = features.map((feature) => need(feature, ".feature-copy"));
  if (features.length !== KEYS.length || buttons.length !== KEYS.length) throw new Error("story features missing");

  // 첫 맞춤 계산 전에 고정 배치의 격자를 적용한다.
  story.dataset.layout = "pinned";
  const players: StoryPlayer[] = features.map((feature) => {
    const root = need(feature, ".scroll-demo36");
    return { ...createScenePlayer(root, need<HTMLElement>(feature, "[data-caption]")), position: { scene: 0, local: 0, elapsed: 0 }, inView: true, drawnStep: -1 };
  });
  const stepNotes = players.map((player) => need(player.root, ".demo-label14 span:last-child"));
  scope.add(() => {
    // 자막을 설명 옆으로 옮겨 두었으면 제자리로 돌려놓는다.
    players.forEach((player) => {
      player.caption.classList.remove("caption-copy38");
      player.stage.after(player.caption);
    });
  });

  const reduced = () => motion.reduced;
  const stepsOf = (key: StoryKey) => steps.filter((step) => step.key === key);
  const positionOf = (player: StoryPlayer, step: Step) => mapStep(step, (scene) => sceneOffset(player.config, scene));

  let mode = "";
  let active = -1;
  let pending = -1;
  let pendingAt = 0;
  let last: number | null = null;
  let dirty = true;
  let bounds: number[] = [];
  let distance = 3900;
  let top = 16;
  let geometryKey = "";
  let measured: Measured = { requiredHeight: 0, navHeight: 0 };
  let shownKey: StoryKey | null = null;
  let viewportAnchor: Anchor = null;
  let resizeAnchor: Anchor = null;
  let resizePending = false;
  const motionState = { intro: 0, introDone: false, copy: 0, copyKey: null as StoryKey | null, last: null as number | null, distance: 16 };

  // ── 영역 안쪽 스크롤 안내 ─────────────────────────────────────────────
  const innerHint = () => {
    const overflowing = story.dataset.overflow43 === "true" && story.dataset.sizing37 !== "true";
    const state = !overflowing ? "" : sticky.scrollHeight - sticky.clientHeight - sticky.scrollTop > 2 ? "more" : "end";
    if (hint.hidden !== !state) hint.hidden = !state;
    if ((story.dataset.inner47 || "") === state) return;
    story.dataset.inner47 = state;
    setText(hint, state === "more" ? "아래에 내용이 더 있습니다 · 먼저 끝까지 내려 보세요" : state === "end" ? "이 영역의 끝입니다 · 페이지를 내려 다음 단계로" : "");
  };

  // ── 단계 선택 ─────────────────────────────────────────────────────────
  const select = (index: number) => {
    if (index === active) return;
    const previous = active;
    const step = steps[index];
    // 스크롤은 장면을 고를 뿐이다. 재생이 끝난 것처럼 꾸미지 않는다(동작 줄이기만 결과를 바로 보인다).
    if (reduced()) {
      step.done = true;
      step.elapsed = step.duration;
    }
    active = index;
    last = null;
    Object.assign(story.dataset, { step: String(index), feature: step.key, transition: previous < 0 ? "enter" : index < previous ? "resume-back" : "resume-forward" });
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
    if (document.hidden) return;
    const index = desired();
    if (reduced()) {
      if (window.scrollY >= bounds[0] && index !== active) select(index);
      pending = -1;
      return;
    }
    if (active < 0) {
      if (window.scrollY >= bounds[0]) select(index);
      return;
    }
    if (index === active) {
      pending = -1;
      return;
    }
    const delta = index - active;
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

  // ── 바로가기·다시 보기 ────────────────────────────────────────────────
  const syncFeature = (key: StoryKey) => {
    const index = KEYS.indexOf(key);
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (motionState.copyKey !== key) {
      motionState.copyKey = key;
      motionState.copy = 0;
      motionState.last = null;
      sticky.scrollTop = 0;
    }
  };
  const activate = () => {
    const key = steps[Math.max(0, active)].key;
    if (shownKey !== key) {
      features.forEach((feature, i) => {
        const on = KEYS[i] === key;
        feature.classList.toggle("active36", on);
        feature.hidden = !on;
        feature.setAttribute("aria-hidden", String(!on));
        feature.inert = !on;
      });
      shownKey = key;
    }
    if (motionState.copyKey !== key) syncFeature(key);
  };
  const jump = (featureIndex: number) => {
    if (dirty) {
      layout();
      dirty = false;
    }
    const first = GROUPS[featureIndex][0];
    for (const i of GROUPS[featureIndex]) Object.assign(steps[i], { elapsed: 0, done: false });
    const player = players[featureIndex];
    player.stamp = "";
    player.anchorPoints = {};
    player.anchorSize = "";
    player.pointerCycle = -1;
    active = -1;
    pending = -1;
    last = null;
    motionState.copyKey = null;
    motionState.copy = 0;
    motionState.last = null;
    sticky.scrollTop = 0;
    select(first);
    const y = Math.max(0, bounds[first] + 40);
    // 버튼을 눌렀을 때만 페이지를 옮긴다.
    window.scrollTo({ top: y, left: window.scrollX, behavior: "instant" });
    activate();
    schedule();
  };
  buttons.forEach((button, index) => scope.listen(button, "click", () => jump(index)));
  // 페이지 안 링크가 기능 하나를 가리키면(푸터의 「Catch란?」 → #evidence) 바로가기와 같은 방식으로 옮긴다.
  // 고정 배치에서는 지금 기능이 아닌 것이 감춰져 있어, 브라우저의 기본 이동으로는 그 자리에 갈 수 없다.
  scope.listen(page, "click", (event) => {
    if (!(event instanceof MouseEvent) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const hash = link?.getAttribute("href") ?? "";
    const index = features.findIndex((feature) => `#${feature.id}` === hash);
    if (index < 0) return;
    event.preventDefault();
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    jump(index);
    // 키보드로 왔으면 다음 Tab이 옮겨 간 자리에서 이어지게 한다.
    buttons[index].focus({ preventScroll: true });
  });

  // ── 영역과 설명의 등장 ────────────────────────────────────────────────
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, top) >= Math.min(300, rect.height * 0.55, window.innerHeight * 0.45) && rect.right > 0 && rect.left < window.innerWidth;
  };
  const animate = (now: number) => {
    if (reduced()) {
      motionState.intro = INTRO_MS;
      motionState.introDone = true;
      motionState.copy = COPY_MS;
      motionState.last = null;
    }
    const canRun = !document.hidden && active >= 0 && visible(sticky) && !reduced();
    const pendingIntro = !motionState.introDone;
    const pendingCopy = motionState.copy < COPY_MS;
    if (canRun && (pendingIntro || pendingCopy)) {
      const delta = motionState.last === null ? 0 : Math.min(100, Math.max(0, now - motionState.last));
      motionState.last = now;
      if (pendingIntro) {
        motionState.intro = Math.min(INTRO_MS, motionState.intro + delta);
        motionState.introDone = motionState.intro >= INTRO_MS;
      }
      motionState.copy = Math.min(COPY_MS, motionState.copy + delta);
    } else motionState.last = null;
    const intro = Math.min(1, motionState.intro / INTRO_MS);
    const copy = Math.min(1, motionState.copy / COPY_MS);
    const ease = (progress: number) => 1 - Math.pow(1 - progress, 3);
    setStyle(story, "--story-rise42", `${((1 - ease(intro)) * motionState.distance).toFixed(2)}px`);
    setStyle(story, "--story-opacity42", String(0.85 + 0.15 * intro));
    setStyle(story, "--copy-rise42", `${((1 - ease(copy)) * (window.innerWidth <= 760 ? 28 : 40)).toFixed(2)}px`);
    setStyle(story, "--copy-opacity42", String(ease(copy)));
    story.dataset.copyMoving42 = String(copy < 1);
    return canRun && (!motionState.introDone || motionState.copy < COPY_MS);
  };

  // ── 그리기 ────────────────────────────────────────────────────────────
  const render = (player: StoryPlayer) => renderScene(player, { ...player.position, state: "scroll", completed: 0, summary: false }, { hideCaptionWithSummary: false, pointerLeaveFade: 150 });
  const draw = (player: StoryPlayer, index: number) => {
    const step = steps[index];
    const group = stepsOf(step.key);
    player.position = positionOf(player, step);
    render(player);
    setText(player.caption, step.result);
    setText(stepNotes[KEYS.indexOf(step.key)], `${KEYS.indexOf(step.key) + 1} · ${group.indexOf(step) + 1}/${group.length} — 스크롤로 다음 단계`);
    Object.assign(player.root.dataset, {
      step: String(index),
      stepElapsed: String(Math.round(step.elapsed)),
      stepDuration: String(step.duration),
      stepDone: String(step.done),
      state: reduced() ? "reduced" : step.done ? "result" : document.hidden ? "tab-hidden" : !player.inView ? "offscreen" : "playing",
    });
    if (step.done) player.pulse.style.visibility = "hidden";
  };
  const display = () => {
    const index = Math.max(0, active);
    const player = players[KEYS.indexOf(steps[index].key)];
    draw(player, index);
    player.drawnStep = index;
    if (reduced()) {
      player.pointer.style.visibility = "hidden";
      player.pulse.style.visibility = "hidden";
    }
  };

  // ── 크기 재기(창 크기·글꼴이 바뀔 때만) ───────────────────────────────
  /** 그 장면에서 화면이 달라지는 시각들. 가장 큰 내용을 기준으로 자리를 잡으려고 모두 그려 본다. */
  const sampleTimes = (player: StoryPlayer, scene: number) => {
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
    for (const step of stepsOf(player.key as StoryKey)) {
      for (const [frame, from, to] of step.segments) {
        if (frame === scene) {
          times.add(from);
          times.add(to);
        }
      }
    }
    return [...times].filter((t) => t >= 0 && t < player.config.durations[scene]).sort((a, b) => a - b);
  };
  const probe = (player: StoryPlayer, scene: number, local: number) => {
    player.position = { scene, local, elapsed: sceneOffset(player.config, scene) + local };
    render(player);
  };
  const placeCaptions = () => {
    // 넓고 낮은 화면에서는 단계 설명을 시연 아래가 아니라 왼쪽 설명 아래에 둔다.
    const aside = window.innerWidth > 760 && window.innerHeight <= 700;
    story.dataset.captionAside38 = String(aside);
    players.forEach((player, i) => {
      player.caption.classList.toggle("caption-copy38", aside);
      if (aside) copies[i].append(player.caption);
      else player.stage.after(player.caption);
    });
  };
  const measureProducts = () => {
    story.dataset.sizing37 = "true";
    const compact = window.innerWidth <= 760 || window.innerHeight < 800;
    story.dataset.compact37 = String(compact);
    placeCaptions();
    story.style.removeProperty("--copy-height39");
    story.style.removeProperty("--stack-height42");
    for (const player of players) {
      player.root.style.removeProperty("--stage-height38");
      player.caption.style.minHeight = "0";
    }
    for (const name of ["--stage-height37", "--caption-height37", "--notice-fit37", "--public-fit37", "--publication-fit37"]) story.style.removeProperty(name);
    const base = getComputedStyle(story);
    const read = (name: string, fallback: number) => parseFloat(base.getPropertyValue(name)) || fallback;
    const baseline = read("--feature-stage-height", 616);
    const baseNotice = read("--notice-height", 152);
    const basePublic = read("--public-height", 184);
    const basePublication = read("--publication-height", 454);
    const inset = read("--feature-inset", 14);
    let notice = 0;
    let publicBlock = 0;
    let publication = 0;
    let maximum = 0;
    let overhead = 0;
    let caption = 0;
    try {
      const naturalHeight = (element: HTMLElement) => {
        const saved = element.style.cssText;
        element.style.height = "auto";
        element.style.minHeight = "0";
        const height = Math.max(element.getBoundingClientRect().height, 0);
        element.style.cssText = saved;
        return height;
      };
      for (const player of players) {
        for (let scene = 0; scene < player.frames.length; scene++) {
          for (const time of sampleTimes(player, scene)) {
            probe(player, scene, time);
            const frame = player.frames[scene];
            const noticeBox = frame.querySelector<HTMLElement>(".notice-reserve21");
            if (noticeBox) notice = Math.max(notice, naturalHeight(noticeBox));
            const publicBox = frame.querySelector<HTMLElement>(".public-block");
            if (publicBox) publicBlock = Math.max(publicBlock, naturalHeight(publicBox));
            const edit = frame.querySelector<HTMLElement>(".publication-edit22");
            if (edit) {
              let paneHeight = 0;
              edit.querySelectorAll<HTMLElement>(".publication-pane22").forEach((pane) => {
                const saved = pane.style.cssText;
                pane.style.minHeight = "0";
                pane.style.height = "auto";
                paneHeight = Math.max(paneHeight, pane.getBoundingClientRect().height, pane.scrollHeight);
                pane.style.cssText = saved;
              });
              publication = Math.max(publication, paneHeight + need(edit, ".app-chrome").getBoundingClientRect().height + 2);
            }
          }
        }
      }
      const reserve = (value: number, baseValue: number) => `${Math.ceil(compact ? value : Math.max(value, baseValue))}px`;
      story.style.setProperty("--notice-fit37", reserve(notice, baseNotice));
      story.style.setProperty("--public-fit37", reserve(publicBlock, basePublic));
      story.style.setProperty("--publication-fit37", reserve(publication, basePublication));
      for (const player of players) {
        for (let scene = 0; scene < player.frames.length; scene++) {
          for (const time of sampleTimes(player, scene)) {
            probe(player, scene, time);
            // 받은 사람 화면처럼 창 바깥에 제목·안내가 붙는 장면도 포함해 잰다.
            const outer = player.frames[scene].firstElementChild;
            if (outer) maximum = Math.max(maximum, outer.getBoundingClientRect().height);
          }
        }
        if (window.innerWidth > 760) {
          for (const step of stepsOf(player.key as StoryKey)) {
            player.caption.textContent = step.result;
            caption = Math.max(caption, player.caption.getBoundingClientRect().height);
          }
        }
      }
      const commonCaption = Math.ceil(caption);
      for (const player of players) player.caption.style.minHeight = `${window.innerWidth <= 760 ? 0 : commonCaption}px`;
      for (const player of players) overhead = Math.max(overhead, Math.ceil(player.root.getBoundingClientRect().height - player.stage.getBoundingClientRect().height));
      const minimum = Math.ceil(maximum + 2 * inset + 2);
      const navHeight = Math.ceil(nav.getBoundingClientRect().height);
      const hostStyle = getComputedStyle(sticky);
      const navGap = parseFloat(hostStyle.rowGap) || 0;
      const hostPadding = (parseFloat(hostStyle.paddingTop) || 0) + (parseFloat(hostStyle.paddingBottom) || 0);
      const tallestCopy = () => Math.ceil(Math.max(...copies.map((copy) => copy.getBoundingClientRect().height)));
      const copyBudget = window.innerWidth <= 760 ? tallestCopy() + 4 + navHeight + navGap : 0;
      // 무대 높이 식은 헤더·여백과 고정 8px만 뺀다. 나머지 아래 여백과 영역 자체의 안쪽 여백을 더해 준다.
      const around = overhead + copyBudget + hostPadding + (viewportGutter(window.innerWidth, window.innerHeight) - 8);
      const height = Math.ceil(window.innerWidth <= 760 ? minimum : Math.max(minimum, Math.min(baseline, window.innerHeight - top - 8 - around)));
      story.style.setProperty("--stage-height37", `${height}px`);
      // 기능과 장면이 바뀌어도 시연 자리의 높이는 하나다.
      for (const player of players) player.root.style.setProperty("--stage-height38", `${height}px`);
      if (window.innerWidth <= 760) story.style.setProperty("--copy-height39", `${tallestCopy()}px`);
      const stackHeight = Math.ceil(Math.max(...features.map((feature) => feature.getBoundingClientRect().height)));
      story.style.setProperty("--stack-height42", `${stackHeight}px`);
      measured = { requiredHeight: (window.innerWidth <= 760 ? stackHeight + navHeight + navGap : Math.max(stackHeight, navHeight)) + hostPadding, navHeight };
    } finally {
      delete story.dataset.sizing37;
      for (const player of players) {
        player.anchorPoints = {};
        player.anchorSize = "";
        player.stamp = "";
      }
    }
  };
  const measureBounds = () => {
    const y = story.getBoundingClientRect().top + window.scrollY + (parseFloat(getComputedStyle(story).paddingTop) || 0) - top;
    if (window.innerWidth <= 760) bounds = mobileBands(window.innerHeight).offsets.map((offset) => y + offset);
    else {
      const sum = DESKTOP_WEIGHTS.reduce((a, b) => a + b, 0);
      let cursor = y;
      bounds = DESKTOP_WEIGHTS.map((weight) => {
        const start = cursor;
        cursor += (distance * weight) / sum;
        return start;
      });
    }
  };
  const layout = () => {
    const metrics = readViewport(page);
    const gutter = metrics.gutter;
    const header = metrics.header;
    top = header + gutter;
    const key = `${window.innerWidth}:${window.innerHeight}:${reduced()}:${top}`;
    if (key !== geometryKey) {
      measureProducts();
      geometryKey = key;
    }
    let plan = planFit(window.innerHeight, header, measured.requiredHeight, gutter);
    // 실제 스크롤바가 생기면 쓸 수 있는 폭이 달라진다. 그 폭으로 다시 잰 뒤 무대 높이를 정한다.
    if ((story.dataset.overflow43 === "true") !== !plan.fit) {
      story.dataset.overflow43 = String(!plan.fit);
      measureProducts();
      plan = planFit(window.innerHeight, header, measured.requiredHeight, gutter);
    }
    const required = measured.requiredHeight;
    top = plan.top;
    setStyle(story, "--sticky-top36", `${top}px`);
    story.dataset.overflow43 = String(!plan.fit);
    sticky.tabIndex = plan.fit ? -1 : 0;
    sticky.setAttribute("aria-label", plan.fit ? "기능 설명 및 시연" : "기능 설명 및 시연, 아래 내용은 이 영역을 스크롤해 확인");
    setStyle(story, "--available-height43", `${plan.available}px`);
    if (mode !== "pinned") {
      mode = "pinned";
      story.dataset.layout = mode;
      last = null;
    }
    distance = window.innerWidth <= 760 ? mobileBands(window.innerHeight).travel : Math.round(Math.max(3400, Math.min(4100, window.innerHeight * 4.8)));
    story.style.setProperty("--scroll-distance36", `${distance}px`);
    story.style.setProperty("--sticky-height36", `${required}px`);
    setStyle(story, "--tail-pad44", `${Math.max(0, Math.round(window.innerHeight - top - Math.min(required, plan.available)))}px`);
    // 낮은 화면에서는 등장할 때 올라오는 거리를 실제 아래 여백까지만 쓴다.
    motionState.distance = Math.max(0, Math.min(window.innerWidth <= 760 ? 16 : 28, window.innerHeight - top - required - 2));
    story.dataset.reduced = String(reduced());
    // 휴대폰에서는 고정된 단계 안내가 고정된 바로가기 아래에 온다.
    setStyle(story, "--label-top47", `${window.innerWidth <= 760 ? measured.navHeight : 0}px`);
    setStyle(story, "--row-gap47", `${parseFloat(getComputedStyle(sticky).rowGap) || 0}px`);
    measureBounds();
    innerHint();
  };

  // ── 가림 대기 ─────────────────────────────────────────────────────────
  /** 지금 포인터가 향하거나 글자를 넣는 자리가 화면에서 읽히는가. 아니면 시간을 쓰지 않고 기다린다. */
  const actionReadable = (player: StoryPlayer, step: Step) => {
    const position = positionOf(player, step);
    const frame = player.frames[position.scene];
    const t = position.local;
    const action = (player.config.actions[position.scene] || []).find((item) => t >= item.start - 100 && t <= item.end);
    let target = action?.target;
    if (player.key === "publication" && position.scene === 0 && t >= 9200 && t <= 12500) target = "title";
    const element = target ? frame.querySelector<HTMLElement>(`[data-target="${target}"]`) : null;
    if (!element) return true;
    // 이미 눌렀고 장면이 그 요소를 치운 경우는 기다리지 않는다(가려진 것과 다르다).
    if (action && action.target === target && action.click !== null && t >= action.click && element.getClientRects().length === 0) return true;
    const clip = { top: 0, bottom: window.innerHeight - 6, left: 0, right: window.innerWidth };
    if (story.dataset.overflow43 === "true") {
      const host = sticky.getBoundingClientRect();
      clip.top = Math.max(0, host.top);
      clip.bottom = Math.min(clip.bottom, host.bottom);
      clip.left = Math.max(0, host.left);
      clip.right = Math.min(window.innerWidth, host.right);
      if (window.innerWidth <= 760) clip.top = Math.max(clip.top, nav.getBoundingClientRect().bottom);
      const note = player.root.querySelector(".demo-label14");
      if (note) clip.top = Math.max(clip.top, note.getBoundingClientRect().bottom);
      // 안쪽 스크롤 안내가 떠 있는 동안에는 그 줄이 영역 아래를 가린다.
      if (!hint.hidden) {
        const cover = hint.getBoundingClientRect();
        if (cover.height > 0) clip.bottom = Math.min(clip.bottom, cover.top);
      }
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= clip.top - 2 && rect.bottom <= clip.bottom + 2 && rect.left >= clip.left - 2 && rect.right <= clip.right + 2;
  };

  // ── 창 크기가 바뀌어도 같은 단계의 같은 자리 ─────────────────────────
  const captureViewport = () => {
    if (active < 0 || !bounds.length) return null;
    const end = bounds[0] + distance;
    if (window.scrollY < bounds[0] || window.scrollY >= end) return null;
    const start = bounds[active];
    const stop = bounds[active + 1] ?? end;
    return { index: active, ratio: clamp01((window.scrollY - start) / Math.max(1, stop - start)) };
  };
  const restoreViewport = () => {
    if (!resizePending) return;
    const anchor = resizeAnchor;
    resizePending = false;
    resizeAnchor = null;
    if (!anchor || anchor.index !== active) return;
    const start = bounds[active];
    const stop = bounds[active + 1] ?? bounds[0] + distance;
    // 경계 근처는 피하되 재생과 등장 상태는 건드리지 않는다.
    const margin = Math.min(40, (stop - start) / 4);
    const y = Math.max(start + margin, Math.min(stop - margin, start + anchor.ratio * (stop - start)));
    pending = -1;
    last = null;
    motionState.last = null;
    window.scrollTo({ top: y, left: window.scrollX, behavior: "instant" });
  };

  // ── 프레임 ────────────────────────────────────────────────────────────
  const frame = createFrame(scope, (now) => {
    const remeasured = dirty;
    if (dirty) {
      layout();
      dirty = false;
    }
    restoreViewport();
    choose(now);
    activate();
    const step: Step | undefined = steps[active];
    const player = step ? players[KEYS.indexOf(step.key)] : null;
    // 재생 도중에 동작 줄이기가 켜지면 지금 단계도 결과 화면으로 바꾼다(단계를 새로 고를 때와 같다).
    if (step && reduced() && !step.done) {
      step.done = true;
      step.elapsed = step.duration;
    }
    // 새로 고른 장면은 한 번 그린 뒤에야 가림 여부로 재생을 막을 수 있다.
    const fresh = !!player && (remeasured || player.drawnStep !== active);
    const stageVisible = !!player && visible(player.stage);
    if (player) player.inView = stageVisible;
    const readable = !!step && !!player && !fresh && actionReadable(player, step);
    const moving = animate(now);
    const ready = motionState.introDone && motionState.copy >= COPY_MS;
    const running = !!(ready && step && !step.done && !reduced() && !document.hidden && stageVisible && readable);
    if (running && step) {
      if (last !== null) step.elapsed = Math.min(step.duration, step.elapsed + Math.min(100, now - last));
      last = now;
      if (step.elapsed >= step.duration) {
        step.done = true;
        last = null;
      }
    } else last = null;
    display();
    story.dataset.running = String(running);
    story.dataset.paused43 = !step || step.done ? "" : !ready ? "entrance" : !stageVisible ? "offscreen" : !readable ? "target-outside-view" : "";
    viewportAnchor = captureViewport();
    if (story.dataset.overflow43 === "true" || story.dataset.inner47) innerHint();
    if (!document.hidden && (running || pending >= 0 || moving || fresh)) schedule();
  });
  const schedule = () => frame.request();
  const sync = () => {
    last = null;
    motionState.last = null;
    dirty = true;
    schedule();
  };
  const resized = () => {
    if (!resizePending) resizeAnchor = viewportAnchor;
    resizePending = true;
    pending = -1;
    sync();
  };

  scope.listen(window, "scroll", schedule, { passive: true });
  scope.listen(
    sticky,
    "scroll",
    () => {
      last = null;
      innerHint();
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
  const header = page.querySelector(".site-header");
  if (header) {
    const observer = new ResizeObserver(() => {
      dirty = true;
      schedule();
    });
    observer.observe(header);
    scope.add(() => observer.disconnect());
  }
  document.fonts?.ready.then(() => {
    if (scope.disposed) return;
    geometryKey = "";
    sync();
  });
  sync();
}
