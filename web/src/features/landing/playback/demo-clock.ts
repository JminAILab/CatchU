import { HERO_REPEATS } from "./demo-config";

export type ClockSnapshot = {
  elapsed: number;
  scene: number;
  local: number;
  completed: number;
  summary: boolean;
  state: "fallback" | "reduced" | "complete" | "tab-hidden" | "offscreen" | "entering" | "playing";
};

/**
 * 대표 시연의 시계. 화면에 보이고(inView), 탭이 켜져 있고(visible), 등장이 끝났을 때(ready)만 흐른다.
 * 정해진 횟수를 다 돌았거나, 동작 줄이기이거나, 재생할 수 없으면 요약 화면(summary)을 가리킨다.
 * 진행 시간은 어디에도 저장하지 않는다. 새로고침하면 0부터다.
 */
export class DemoClock {
  readonly durations: number[];
  readonly duration: number;
  elapsed = 0;
  inView = false;
  visible = true;
  reduced = false;
  failed = false;
  ready = false;

  constructor(durations: number[]) {
    this.durations = durations;
    this.duration = durations.reduce((a, b) => a + b, 0);
  }

  get done() {
    return this.elapsed >= this.duration * HERO_REPEATS;
  }

  get running() {
    return this.inView && this.visible && this.ready && !this.reduced && !this.failed && !this.done;
  }

  advance(ms: number) {
    if (this.running) this.elapsed = Math.min(this.duration * HERO_REPEATS, this.elapsed + Math.max(0, ms));
  }

  snapshot(): ClockSnapshot {
    let local = this.elapsed % this.duration;
    let scene = 0;
    while (scene < this.durations.length - 1 && local >= this.durations[scene]) local -= this.durations[scene++];
    const summary = this.done || this.reduced || this.failed;
    const last = this.durations.length - 1;
    return {
      elapsed: this.elapsed,
      scene: summary ? last : scene,
      local: summary ? this.durations[last] : local,
      completed: Math.min(HERO_REPEATS, Math.floor(this.elapsed / this.duration)),
      summary,
      state: this.failed ? "fallback" : this.reduced ? "reduced" : this.done ? "complete" : !this.visible ? "tab-hidden" : !this.inView ? "offscreen" : !this.ready ? "entering" : "playing",
    };
  }
}
