import type { DemoAction, DemoConfig } from "./demo-config";
import { clamp01, smoothstep } from "./scope";

/** 시연 전체 시간 위에 펼친 포인터 동작. 시각은 시연 처음부터 잰다. */
export type FlatAction = DemoAction & { scene: number; key: string };
export type Point = { x: number; y: number };

export type PointerSample = {
  action: FlatAction;
  from: Point;
  to: Point;
  x: number;
  y: number;
  opacity: number;
  phase: "moving" | "click" | "hold" | "dwell";
  clicked: boolean;
  pressed: boolean;
  pulse: number;
  aim: boolean;
};

/** 장면별 동작을 시연 전체 시간으로 옮긴다. */
export function flattenActions(config: DemoConfig): FlatAction[] {
  let offset = 0;
  const result: FlatAction[] = [];
  config.durations.forEach((duration, scene) => {
    (config.actions[scene] || []).forEach((action, index) =>
      result.push({
        ...action,
        scene,
        key: `${scene}:${index}`,
        start: offset + action.start,
        arrive: offset + action.arrive,
        click: action.click === null ? null : offset + action.click,
        end: offset + action.end,
      }),
    );
    offset += duration;
  });
  return result;
}

/**
 * 어느 시각에 포인터가 어디에 어떤 모습으로 있는지 계산한다. 자기 타이머가 없고 재생 시계의 시각만 쓴다.
 * 같은 장면의 앞 동작에서 이어 움직이고, 클릭한 뒤에는 흐려진다(다음 동작이 같은 장면이면 남는다).
 */
export function samplePointer(actions: FlatAction[], time: number, scene: number, points: Record<string, Point | undefined>, initial: Point): PointerSample | null {
  let index = -1;
  for (let i = 0; i < actions.length; i++) {
    if (time >= actions[i].start) index = i;
    else break;
  }
  if (index < 0) return null;
  const action = actions[index];
  const previous: FlatAction | undefined = actions[index - 1];
  const next: FlatAction | undefined = actions[index + 1];
  const to = points[action.key];
  if (action.scene !== scene || !to) return null;
  const from = (previous && points[previous.key]) || initial;
  const fraction = clamp01((time - action.start) / (action.arrive - action.start));
  const ease = smoothstep(fraction);
  const keep = !!next && next.scene === scene;
  if (time >= action.end && !keep) return null;
  const clicked = action.click !== null && time >= action.click;
  const sinceClick = action.click === null ? 0 : time - action.click;
  const carry = !!previous && previous.scene === scene;
  const opacity = (carry ? 1 : clamp01((time - action.start) / 120)) * (keep ? 1 : clicked ? clamp01(1 - (sinceClick - 200) / 250) : 1);
  return {
    action,
    from,
    to,
    x: from.x + (to.x - from.x) * ease,
    y: from.y + (to.y - from.y) * ease,
    opacity,
    phase: fraction < 1 ? "moving" : clicked && sinceClick < 350 ? "click" : time >= action.end ? "hold" : "dwell",
    clicked,
    pressed: clicked && sinceClick < 160,
    pulse: clicked ? clamp01(1 - sinceClick / 350) : 0,
    aim: fraction === 1 && time < action.end,
  };
}
