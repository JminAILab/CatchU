import type { JdRecipientContext } from "./jd-types.ts";

type AccessCallbacks = Pick<JdRecipientContext, "getGrant" | "onAccessLost">;

/** 한 링크의 U4 콜백만 보관한다. grant 값은 복사하지 않고 매 요청 최신 제공자에서 읽는다. */
export function createJdRecipientCallbacks(initial: AccessCallbacks) {
  let current = initial;
  return {
    getGrant: () => current.getGrant(),
    onAccessLost: (code: Parameters<AccessCallbacks["onAccessLost"]>[0]) => current.onAccessLost(code),
    update(callbacks: AccessCallbacks) { current = callbacks; },
  };
}
