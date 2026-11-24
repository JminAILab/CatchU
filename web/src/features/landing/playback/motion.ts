import type { Scope } from "./scope";

/** 운영체제의 「동작 줄이기」 설정. 켜져 있으면 시연은 재생하지 않고 결과 화면만 보인다. */
export type MotionPreference = {
  readonly reduced: boolean;
  /** 설정이 바뀌면 부른다. */
  onChange(handler: () => void): void;
};

export function watchMotionPreference(scope: Scope): MotionPreference {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  return {
    get reduced() {
      return media.matches;
    },
    onChange(handler) {
      scope.listen(media, "change", handler);
    },
  };
}
