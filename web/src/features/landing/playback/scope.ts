/**
 * 화면을 떠날 때 한꺼번에 정리할 것(이벤트·관찰자·타이머·예약한 프레임)을 모아 두는 묶음.
 * 재생 제어 코드는 직접 addEventListener를 부르지 않고 여기에 등록한다. 그래야 소개 화면을 떠난 뒤 남는 것이 없다.
 */
export type Scope = {
  /** 이벤트를 걸고, 정리할 때 뗀다. */
  listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void;
  /** 정리할 때 부를 함수를 더한다. */
  add(dispose: () => void): void;
  /** 정리가 끝났는지. 늦게 도착한 콜백(글꼴 로딩 등)이 이미 떠난 화면을 건드리지 않게 확인한다. */
  readonly disposed: boolean;
  dispose(): void;
};

export function createScope(): Scope {
  const disposers: Array<() => void> = [];
  let disposed = false;
  return {
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      disposers.push(() => target.removeEventListener(type, handler, options));
    },
    add(dispose) {
      disposers.push(dispose);
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // 등록한 순서의 거꾸로 정리한다. 하나가 실패해도 나머지는 정리한다.
      for (const dispose of disposers.reverse()) {
        try {
          dispose();
        } catch {
          // 정리 중 오류는 다음 정리를 막지 않는다. 떠나는 화면이라 보여 줄 곳도 없다.
        }
      }
      disposers.length = 0;
    },
  };
}

/** 예약한 프레임 하나를 들고 있다가 취소할 수 있게 한다. 같은 일을 두 번 예약하지 않는다. */
export function createFrame(scope: Scope, callback: (now: number) => void) {
  let handle = 0;
  scope.add(() => {
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
  });
  return {
    get pending() {
      return handle !== 0;
    },
    request() {
      if (handle || scope.disposed) return;
      handle = requestAnimationFrame((now) => {
        handle = 0;
        callback(now);
      });
    },
    cancel() {
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}

/** 꼭 있어야 하는 요소를 찾는다. 없으면 던져서 그 구간이 정적 화면으로 물러나게 한다. */
export function need<T extends Element = HTMLElement>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`landing element missing: ${selector}`);
  return element;
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smoothstep = (value: number) => value * value * (3 - 2 * value);

export function setText(element: Element, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

export function setStyle(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}
