/**
 * 미저장 입력 확인(#51 「미저장 변경이 있으면 취소·이동·로그아웃 전에 이탈 확인」). 로그아웃과 재인증의 [다시 로그인]이 같은 수단을 쓴다(#251 접점 답변 2).
 *
 * 화면은 작성 중인 입력이 있는 동안 판정 함수를 등록하고, 로그아웃·다시 로그인은 이동 전에 `confirmDiscardUnsaved()`로 묻는다.
 * 어떤 입력을 미저장으로 볼지는 각 화면 담당이 정한다. 이 파일은 등록된 판정만 모은다.
 */
export type UnsavedRegistry = {
  /** 판정 함수를 등록한다. 돌려준 함수를 부르면 등록을 푼다. */
  register(isDirty: () => boolean): () => void;
  /** 등록된 화면 중 하나라도 미저장 입력이 있는지. */
  hasUnsaved(): boolean;
};

export function createUnsavedRegistry(): UnsavedRegistry {
  const checks = new Set<() => boolean>();
  return {
    register(isDirty) {
      // 같은 함수를 두 번 등록해도 각각 풀 수 있게 감싼다.
      const entry = () => isDirty();
      checks.add(entry);
      return () => { checks.delete(entry); };
    },
    hasUnsaved() {
      for (const check of checks) if (check()) return true;
      return false;
    },
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
