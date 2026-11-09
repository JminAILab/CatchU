/**
 * 화면 상태를 React 밖에 두는 작은 저장소. 화면은 `useSyncExternalStore(store.subscribe, store.get, store.get)`로 읽고,
 * 시험은 같은 저장소의 상태 전이를 브라우저 없이 확인한다(U4 작성자 편집 화면).
 */
export type ViewStore<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createViewStore<T>(initial: T): ViewStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
