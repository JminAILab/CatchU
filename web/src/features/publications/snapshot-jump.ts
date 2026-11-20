import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveEvidenceTarget, type EvidenceLocation, type EvidenceTarget } from "../recipient/recipient-slots.ts";
import type { PublishedSnapshot } from "./publications-api.ts";
import { groupByPreset, publishedItemDomId, type PresetGroup, type SnapshotHighlight, type TabNotice } from "./snapshot-view.tsx";

/**
 * 발행본 자료의 열린 탭과 출처 이동(발행 프리셋 U3 흐름 1의 8·흐름 3, BR4.1~BR4.3, NFR1.2·NFR5.5). 받은 사람 화면과 작성자 발행본 상세가 함께 쓴다.
 *
 * - 열린 탭·옮길 대상·알림 글을 한 상태로 갖는다. 출처 단추(`showEvidence`)는 대상 항목의 탭과 대상을 한 번의 상태 바뀜에서 함께 바꾸고,
 *   탭이 바뀌었으면 「(프리셋 이름) 탭을 열었습니다」 알림을 낸다. 같은 탭이면 알림을 바꾸지 않는다. [답으로 돌아가기]는 없다.
 * - 모든 탭 패널이 그려져 있어, 그린 뒤의 효과에서 지금처럼 항목에 초점(`preventScroll`)을 두고 첫 강조나 항목 시작이 보이게 옮긴다.
 * - 사본이 다시 와도(다시 조회) 같은 순번이 있으면 열린 탭을 그대로, 없으면 첫 탭을 연다. 탭을 바꿔도 요청을 보내지 않는다(NFR5.1).
 * - 프리셋 이름·자료 제목을 기록에 넘기지 않는다(NFR4.3).
 */

/** 옮길 대상. `seq`는 같은 위치를 다시 눌러도 다시 옮기게 한다. */
export type JumpTarget = EvidenceTarget & { readonly seq: number };
/** `preset`은 사람이나 출처 이동이 마지막으로 연 순번이다. 사본에 없으면 화면은 첫 탭을 연다(`presetAfterRefresh`). */
export type SnapshotJumpState = { readonly preset: number | null; readonly target: JumpTarget | null; readonly notice: TabNotice | null };
export const INITIAL_JUMP_STATE: SnapshotJumpState = { preset: null, target: null, notice: null };

/** 열린 탭(NFR5.5): 이전 순번이 사본에 있으면 그대로, 없으면 첫 탭. 묶음이 없으면 null. */
export function presetAfterRefresh(groups: readonly PresetGroup[], previous: number | null): number | null {
  if (groups.length === 0) return null;
  return previous !== null && groups.some((group) => group.ordinal === previous) ? previous : groups[0].ordinal;
}

/**
 * 출처 단추를 누른 뒤의 상태(BR4.1·BR4.2). 가리킨 항목이 사본에 없으면 지금 상태 그대로다(옮길 곳이 없다).
 * 대상 항목의 순번이 열린 탭과 다르면 열린 탭·대상·알림을 함께 바꾸고, 같으면 대상만 바꾼다.
 */
export function jumpToEvidence(state: SnapshotJumpState, snapshot: PublishedSnapshot, location: EvidenceLocation): SnapshotJumpState {
  const resolved = resolveEvidenceTarget(snapshot, location);
  if (resolved === null) return state;
  const groups = groupByPreset(snapshot);
  const group = groups.find((candidate) => candidate.items.some((item) => item.publishedItemId === resolved.publishedItemId));
  if (group === undefined) return state;
  const target: JumpTarget = { ...resolved, seq: (state.target?.seq ?? 0) + 1 };
  if (group.ordinal === presetAfterRefresh(groups, state.preset)) return { ...state, preset: group.ordinal, target };
  return { preset: group.ordinal, target, notice: { ordinal: group.ordinal, presetName: group.name, seq: (state.notice?.seq ?? 0) + 1 } };
}

/** 탭을 누르거나 화살표로 옮긴 뒤의 상태. 출처 이동 알림은 지운다(지난 알림이 다른 탭에 남지 않게). 대상은 그대로다. */
export function choosePreset(state: SnapshotJumpState, ordinal: number): SnapshotJumpState {
  return state.preset === ordinal && state.notice === null ? state : { ...state, preset: ordinal, notice: null };
}

/** `snapshot-view.tsx`·`published-pdf-item.tsx`가 강조 범위에 그리는 `<mark>`. 항목 안에서 첫 번째를 스크롤 대상으로 삼는다. */
const HIGHLIGHT_SELECTOR = 'mark[data-testid="snapshot-highlight"]';

export type SnapshotJump = {
  /** 열린 탭의 순번. 사본이 없으면 null. */
  readonly activePreset: number | null;
  readonly changePreset: (ordinal: number) => void;
  readonly showEvidence: (location: EvidenceLocation) => void;
  /** 사본이 있을 때만 강조 범위. */
  readonly highlight: SnapshotHighlight | null;
  readonly notice: TabNotice | null;
};

/** `snapshot`은 지금 보이는 사본이다. 보이지 않는 단계(불러오는 중·비밀번호 입력 등)면 null을 넘기고, 그동안 출처 단추는 아무것도 하지 않는다. */
export function useSnapshotJump(snapshot: PublishedSnapshot | null): SnapshotJump {
  const [state, setState] = useState<SnapshotJumpState>(INITIAL_JUMP_STATE);
  const groups = useMemo(() => (snapshot === null ? [] : groupByPreset(snapshot)), [snapshot]);
  const showEvidence = useCallback((location: EvidenceLocation) => {
    if (snapshot === null) return;
    setState((previous) => jumpToEvidence(previous, snapshot, location));
  }, [snapshot]);
  const changePreset = useCallback((ordinal: number) => setState((previous) => choosePreset(previous, ordinal)), []);
  const { target } = state;
  // 강조 범위가 있으면 항목 안 첫 `<mark>`를 화면 가운데에, 없거나 못 찾으면 항목 시작을 보이고, 초점은 항목에 두되 다시 튀지 않게 한다
  // (PR #482 리뷰). 탭과 대상이 한 번에 바뀌므로 이 효과가 돌 때 대상 항목의 패널은 이미 열려 있다.
  useEffect(() => {
    if (target === null) return;
    const element = document.getElementById(publishedItemDomId(target.publishedItemId));
    if (!element) return;
    const mark = target.highlight === null ? null : element.querySelector<HTMLElement>(HIGHLIGHT_SELECTOR);
    (mark ?? element).scrollIntoView({ block: mark === null ? "start" : "center" });
    element.focus({ preventScroll: true });
  }, [target]);
  return {
    activePreset: presetAfterRefresh(groups, state.preset),
    changePreset,
    showEvidence,
    highlight: snapshot !== null && target !== null ? target.highlight : null,
    notice: state.notice,
  };
}
