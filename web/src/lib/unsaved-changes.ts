/**
 * 미저장 입력 확인(#51 「미저장 변경이 있으면 취소·이동·로그아웃 전에 이탈 확인」). 로그아웃과 재인증의 [다시 로그인]이 같은 수단을 쓴다(#251 접점 답변 2).
 *
 * 화면은 잃을 수 있는 정보가 있는 동안 판정 함수를 등록하고, 로그아웃·다시 로그인은 이동 전에 등록을 읽어 묻는다.
 * 어떤 상태를 확인 대상으로 볼지는 각 화면 담당이 정한다. 이 파일은 등록된 판정과 그 사유만 모은다.
 *
 * 확인 사유([#287 A 답변 1](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6310239160))
 * - `unsaved-input`: 저장하지 않은 입력. 사유를 생략한 기존 등록(`useUnsavedChanges(dirty)`)이 이것이다.
 * - `unconfirmed-analysis-request`: 접수 결과를 확인하지 못한 분석 요청의 확인·재전송 정보(#153·#154).
 * - 등록은 사유와 상관없이 하나씩 따로 붙고 풀린다. 같은 사유를 여러 곳에서 등록할 수 있고, 하나를 풀어도 나머지는 남는다.
 *   중복을 없애는 것은 `activeReasons()`가 돌려주는 표시용 사유뿐이다.
 * - 문구·확인 창·이동은 확인 흐름(#287)이 정한다. 이 파일은 사유별 문구나 정책을 두지 않는다.
 */

/** 확인 사유. 순서는 `activeReasons()`가 돌려주는 순서다. */
export const UNSAVED_REASONS = ["unsaved-input", "unconfirmed-analysis-request"] as const;
export type UnsavedReason = (typeof UNSAVED_REASONS)[number];

export type UnsavedRegistry = {
  /**
   * 판정 함수를 등록한다. 사유를 생략하면 `unsaved-input`이다. 돌려준 함수를 부르면 이 등록만 푼다(여러 번 불러도 같다).
   * 판정 함수는 읽을 때마다 불리므로 등록 시점의 값을 붙잡지 말고 현재 상태를 읽게 둔다.
   */
  register(isDirty: () => boolean, reason?: UnsavedReason): () => void;
  /** 저장하지 않은 입력(`unsaved-input`)이 있는지. 기존 확인 흐름이 쓰는 값이라 다른 사유는 넣지 않는다. */
  hasUnsaved(): boolean;
  /** 지금 판정이 참인 사유. 부를 때마다 등록된 판정을 새로 읽고, 같은 사유는 한 번만 `UNSAVED_REASONS` 순서로 돌려준다. */
  activeReasons(): UnsavedReason[];
};

export function createUnsavedRegistry(): UnsavedRegistry {
  type Entry = { isDirty: () => boolean; reason: UnsavedReason };
  // 같은 함수를 두 번 등록해도 각각 풀 수 있게 등록마다 새 항목을 만든다.
  const entries = new Set<Entry>();
  const active = (reason: UnsavedReason) => {
    for (const entry of entries) if (entry.reason === reason && entry.isDirty()) return true;
    return false;
  };
  return {
    register(isDirty, reason = "unsaved-input") {
      if (!UNSAVED_REASONS.includes(reason)) throw new Error(`알 수 없는 확인 사유: ${String(reason)}`);
      const entry: Entry = { isDirty, reason };
      entries.add(entry);
      return () => { entries.delete(entry); };
    },
    hasUnsaved: () => active("unsaved-input"),
    activeReasons: () => UNSAVED_REASONS.filter(active),
  };
}

/** 탭마다 하나. */
export const unsavedChanges = createUnsavedRegistry();

/** 확인창. 계속하면 true, 머무르면 false. 브라우저에서는 `window.confirm`이다. */
export type ConfirmDialog = (message: string) => boolean;

/** 미저장 입력이 있을 때만 묻는다. 없으면 묻지 않고 true(계속). */
export function confirmDiscardUnsaved(registry: Pick<UnsavedRegistry, "hasUnsaved">, confirm: ConfirmDialog, message: string): boolean {
  return !registry.hasUnsaved() || confirm(message);
}
