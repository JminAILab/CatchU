// DOM 없는 모달 조립 단위 검사. React JSX는 그대로 두고 상태/효과 경계만 제어한다.
// 실제 dialog/초점/키보드는 브라우저 검증이 맡는다.
import * as React from 'react';
let active = null;
export const useState = initial => (active?.useState ?? React.useState)(initial);
export const useRef = initial => (active?.useRef ?? React.useRef)(initial);
export const useEffect = (effect, deps) => (active?.useEffect ?? React.useEffect)(effect, deps);
export const useCallback = (callback, deps) => (active?.useCallback ?? React.useCallback)(callback, deps);
export const useId = () => (active?.useId ?? React.useId)();
export const useSyncExternalStore = (subscribe, snapshot, server) => (active?.useSyncExternalStore ?? React.useSyncExternalStore)(subscribe, snapshot, server);

export function createHookHarness(component, props) {
  const slots = []; let index = 0; let pending = [];
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, at) => Object.is(value, right[at]));
  const hooks = {
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useRef(initial) { const at = index++; return slots[at] ??= { current: initial }; },
    useId() { return 'u7-hook-' + index++; },
    useCallback(callback, deps) { const at = index++; if (!equal(slots[at]?.deps, deps)) slots[at] = { deps, callback }; return slots[at].callback; },
    useEffect(effect, deps) { const at = index++; if (!equal(slots[at]?.deps, deps)) { const prior = slots[at]; slots[at] = { deps };
      pending.push(() => { prior?.cleanup?.(); slots[at].cleanup = effect(); }); } },
  };
  return {
    render() { index = 0; active = hooks; try { return component(props); } finally { active = null; } },
    effects() { const work = pending; pending = []; for (const effect of work) effect(); },
    dispose() { for (const value of slots) value?.cleanup?.(); },
  };
}
