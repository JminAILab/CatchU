import { demoConfig, type DemoConfig, type DemoKey } from "./demo-config";
import { flattenActions, samplePointer, type FlatAction, type Point } from "./pointer-path";
import { clamp01, need, setText, smoothstep } from "./scope";

/**
 * 시연 한 개(대표·기능 1~4·면접관)의 화면을 "어느 장면의 몇 ms"라는 위치 하나로 그린다.
 * 타이머가 없다. 시계는 부르는 쪽(대표 재생기·스크롤 제어)이 갖고, 여기서는 그 시각의 모습만 만든다.
 * 그래서 화면 밖·비활성 탭에서 시계가 멈추면 포인터·타이핑·확대·내부 이동도 같이 멈추고, 돌아오면 그 자리에서 이어진다.
 *
 * 마크업(demos/)의 시간표 속성을 읽는다.
 * - data-from / data-until: 그 시각 사이에만 보인다
 * - data-type(-start/-end): 그 사이에 글자가 한 자씩 찍힌다
 * - data-disable-before / -after: 그 시각 전·후에는 눌 수 없는 모습(aria-disabled)
 * - data-read-from / -until: 읽는 줄 강조
 * - data-target: 포인터가 향하는 자리
 * 어떤 속성도 실제 클릭·입력·요청으로 이어지지 않는다.
 */
export type ScenePosition = { scene: number; local: number; elapsed: number };
export type SceneSnapshot = ScenePosition & { completed: number; summary: boolean; state: string };

export type ScenePlayer = {
  root: HTMLElement;
  key: DemoKey;
  config: DemoConfig;
  duration: number;
  actions: FlatAction[];
  stage: HTMLElement;
  frames: HTMLElement[];
  summary: HTMLElement;
  caption: HTMLElement;
  pointer: HTMLElement;
  pulse: HTMLElement;
  /** 마지막으로 그린 장면 표식. 같으면 장면 전환 작업을 건너뛴다. */
  stamp: string;
  /** 포인터가 도착할 자리(무대 크기에 대한 비율). 도착한 뒤에는 요소가 움직여도 따라가지 않는다. */
  anchorPoints: Record<string, Point | undefined>;
  anchorSize: string;
  pointerCycle: number;
};

export type RenderOptions = {
  /** 요약 화면일 때 자막을 숨길지(대표 시연만). */
  hideCaptionWithSummary: boolean;
  /**
   * 클릭한 요소가 시간표에 따라 화면에서 사라진 뒤 포인터를 몇 ms에 걸쳐 지울지.
   * null이면 요소가 사라져도 포인터를 그대로 둔다(면접관 시연).
   */
  pointerLeaveFade: number | null;
};

export function createScenePlayer(root: HTMLElement, caption: HTMLElement = need(root, "[data-caption]")): ScenePlayer {
  const key = root.dataset.player as DemoKey;
  const config = demoConfig[key];
  if (!config) throw new Error(`unknown demo: ${key}`);
  return {
    root,
    key,
    config,
    duration: config.durations.reduce((a, b) => a + b, 0),
    actions: flattenActions(config),
    stage: need(root, ".stage14"),
    frames: [...root.querySelectorAll<HTMLElement>(".frame14")],
    summary: need(root, "[data-summary]"),
    caption,
    pointer: need(root, ".cursor16"),
    pulse: need(root, ".pulse16"),
    stamp: "",
    anchorPoints: {},
    anchorSize: "",
    pointerCycle: -1,
  };
}

/** 그 장면에서 `scene`번째 장면이 시작하는 시각(시연 전체 기준). */
export function sceneOffset(config: DemoConfig, scene: number) {
  return config.durations.slice(0, scene).reduce((a, b) => a + b, 0);
}

function targetOf(frame: HTMLElement, name: string) {
  return frame.querySelector<HTMLElement>(`[data-target="${name}"]`);
}

/** 요소를 감싼 data-until 시각. 없으면 끝까지 남는다. */
function leavesAt(element: HTMLElement | null) {
  const wrapper = element?.closest<HTMLElement>("[data-until]");
  return wrapper ? Number(wrapper.dataset.until) : Infinity;
}

export function renderScene(player: ScenePlayer, snapshot: SceneSnapshot, options: RenderOptions) {
  const { root, config } = player;
  Object.assign(root.dataset, {
    state: snapshot.state,
    elapsed: String(Math.round(snapshot.elapsed)),
    completed: String(snapshot.completed),
    scene: String(snapshot.scene),
    local: String(Math.round(snapshot.local)),
  });

  const stamp = [snapshot.summary, snapshot.scene, snapshot.completed].join(":");
  if (stamp !== player.stamp) {
    player.stamp = stamp;
    player.frames.forEach((frame, index) => {
      const on = !snapshot.summary && index === snapshot.scene;
      frame.classList.toggle("is-current", on);
      frame.setAttribute("aria-hidden", String(!on));
    });
    player.summary.classList.toggle("is-hidden", !snapshot.summary);
    player.summary.setAttribute("aria-hidden", String(!snapshot.summary));
    player.caption.textContent = config.captions[snapshot.scene];
    if (options.hideCaptionWithSummary) player.caption.style.visibility = snapshot.summary ? "hidden" : "";
  }

  const { pointer, pulse } = player;
  pointer.style.opacity = "0";
  pointer.style.visibility = "hidden";
  pulse.style.opacity = "0";
  pulse.style.visibility = "hidden";
  root.dataset.pointerPhase = "hidden";
  root.dataset.pointerTarget = "";
  for (const frame of player.frames) frame.querySelectorAll(".aim16,.pressed16").forEach((element) => element.classList.remove("aim16", "pressed16"));
  if (snapshot.summary) return;

  if (player.pointerCycle !== snapshot.completed) {
    player.pointerCycle = snapshot.completed;
    player.anchorPoints = {};
  }
  const stageRect = player.stage.getBoundingClientRect();
  const frame = player.frames[snapshot.scene];
  const sceneActions = config.actions[snapshot.scene] || [];
  const t = snapshot.local;

  const cacheAnchors = () => {
    const resized = player.anchorSize !== `${stageRect.width}:${stageRect.height}`;
    sceneActions.forEach((action, index) => {
      const key = `${snapshot.scene}:${index}`;
      if (player.anchorPoints[key] && t > action.arrive && !resized) return;
      const target = targetOf(frame, action.target);
      if (!target || !target.getClientRects().length) return;
      const rect = target.getBoundingClientRect();
      // 체크 칸과 입력칸은 가운데, 버튼은 오른쪽 아래 안쪽을 가리킨다.
      const center = target.classList.contains("check16") || target.dataset.cursorAnchor === "center";
      player.anchorPoints[key] = {
        x: (rect.left - stageRect.left + (center ? rect.width / 2 : rect.width - 13)) / stageRect.width,
        y: (rect.top - stageRect.top + (center ? rect.height / 2 : rect.height - 9)) / stageRect.height,
      };
    });
  };
  cacheAnchors();

  // 코드 패널만 확대(기능 2).
  const code = frame.querySelector<HTMLElement>(".code-focus22");
  if (code) code.style.setProperty("--panel-zoom", String(smoothstep(clamp01((t - 1800) / 1300))));

  // 같은 편집 화면 안에서 아래 칸으로 이동(기능 4). 이동이 끝나기 전에는 아래 칸의 포인터 자리를 다시 잰다.
  const edit = frame.querySelector<HTMLElement>(".publication-track22");
  if (edit) {
    const panes = edit.children as HTMLCollectionOf<HTMLElement>;
    const distance = panes[1].offsetTop - panes[0].offsetTop;
    edit.style.transform = `translate3d(0,${-distance * smoothstep(clamp01((t - 6500) / 1200))}px,0)`;
    if (t < 7700) {
      sceneActions.forEach((action, index) => {
        if (["title", "title-rest", "next"].includes(action.target)) delete player.anchorPoints[`${snapshot.scene}:${index}`];
      });
    }
  }

  frame.querySelectorAll<HTMLElement>("[data-read-from]").forEach((element) => {
    const from = Number(element.dataset.readFrom);
    const until = Number(element.dataset.readUntil);
    element.style.setProperty("--read26", String(Math.max(0, Math.min(1, (t - from) / 300, (until - t) / 300))));
  });
  frame.querySelectorAll<HTMLElement>("[data-from],[data-until]").forEach((element) => {
    const hidden = t < Number(element.dataset.from || 0) || (element.dataset.until !== undefined && t >= Number(element.dataset.until));
    if (element.hidden !== hidden) element.hidden = hidden;
  });
  frame.querySelectorAll<HTMLElement>("[data-type]").forEach((element) => {
    const letters = Array.from(element.dataset.type || "");
    const start = Number(element.dataset.typeStart);
    const end = Number(element.dataset.typeEnd);
    const count = Math.min(letters.length, Math.max(0, Math.floor(((t - start) / (end - start)) * letters.length)));
    setText(element, letters.slice(0, count).join(""));
  });
  frame.querySelectorAll<HTMLElement>("[data-disable-before],[data-disable-after]").forEach((element) => {
    const disabled = t < Number(element.dataset.disableBefore || 0) || (element.dataset.disableAfter !== undefined && t >= Number(element.dataset.disableAfter));
    element.setAttribute("aria-disabled", String(disabled));
  });
  // 질문하기 버튼은 글자가 있을 때만 누를 수 있는 모습이다.
  const ask = targetOf(frame, "ask");
  if (ask) {
    const text = frame.querySelector("[data-type]")?.textContent || "";
    ask.setAttribute("aria-disabled", String(!text.trim() || text.length > 500 || t >= Number(ask.dataset.disableAfter)));
  }
  cacheAnchors();
  player.anchorSize = `${stageRect.width}:${stageRect.height}`;

  const points: Record<string, Point | undefined> = {};
  for (const [key, point] of Object.entries(player.anchorPoints)) {
    if (point) points[key] = { x: point.x * stageRect.width, y: point.y * stageRect.height };
  }
  const time = snapshot.elapsed % player.duration;
  const path = samplePointer(player.actions, time, snapshot.scene, points, { x: stageRect.width - 34, y: stageRect.height - 38 });
  if (!path) return;
  const action = path.action;
  const target = targetOf(frame, action.target);
  if (!target) return;

  target.classList.toggle("aim16", path.aim && action.kind !== "move");
  if (path.pressed) target.classList.add("pressed16");
  pointer.style.transform = `translate3d(${path.x}px,${path.y}px,0)`;
  let shown = path.opacity;
  let visible = true;
  if (options.pointerLeaveFade !== null) {
    // 클릭한 요소가 시간표에 따라 사라졌으면 포인터도 사라진다. 바로 앞 동작의 요소가 사라진 뒤 시작하는 동작은 새로 나타난다.
    const gone = leavesAt(target);
    const leaving = path.clicked && t >= gone ? Math.max(0, 1 - (t - gone) / options.pointerLeaveFade) : 1;
    const before: FlatAction | undefined = player.actions[player.actions.indexOf(action) - 1];
    const returning = before && before.scene === snapshot.scene && before.click !== null && t >= leavesAt(targetOf(frame, before.target)) ? clamp01((time - action.start) / 120) : 1;
    shown = path.opacity * leaving * returning;
    visible = shown > 0;
  }
  pointer.style.opacity = String(shown);
  pointer.style.visibility = visible ? "visible" : "hidden";
  root.dataset.pointerTarget = action.target;
  root.dataset.pointerPhase = path.phase;
  if (path.clicked) {
    pulse.style.visibility = "visible";
    pulse.style.opacity = String(0.65 * path.pulse);
    pulse.style.transform = `translate3d(${path.to.x}px,${path.to.y}px,0) scale(${0.35 + (1 - path.pulse)})`;
  }
}
