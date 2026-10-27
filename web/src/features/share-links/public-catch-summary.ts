import type { CatchApi } from "../assets/catch-api.ts";
import type { CatchAsset } from "../assets/types.ts";
import { routes } from "../../lib/routes.ts";

/**
 * L01 공개 Catch 요약(#149, 공유링크 초안 §4.1·§4.7).
 * 본인 `GET /v1/catches`를 마지막 페이지까지 읽고, 수신자 조회와 같은 기준
 * (`visibility=PUBLIC`·`restriction=NONE`, B 확인 #149 2026-10-26)으로 추린다.
 * - 여러 페이지를 차례로 읽는 동안 자료가 바뀔 수 있어, 수신자 화면과 같은 시점의 확정 목록이 아니다.
 * - 한 페이지라도 실패하면 일부만 보여 주지 않고 조회 실패로 둔다. 실패를 0건으로 바꾸지 않는다.
 * - 같은 cursor가 다시 오거나 페이지 상한을 넘으면 끝까지 읽었다고 볼 수 없어 조회 실패로 둔다.
 */
export const MAX_SUMMARY_PAGES = 50;

export type PublicCatchItem = {
  readonly catchId: string;
  readonly title: string | null;
  /** 제목이 없을 때 구분용으로 보이는 첫 작업 사실. 다른 값을 지어내지 않는다. */
  readonly firstFact: string | null;
};

export type PublicCatchSummaryState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: readonly PublicCatchItem[] }
  | { readonly status: "failed" };

/** 내 자산 상세 진입(B 접점, #168 주소 유지 기준). catchId만으로 상세가 열린다. */
export function assetCatchHref(catchId: string): string {
  return `${routes.assets}?${new URLSearchParams({ catchId })}`;
}

function summarize(item: CatchAsset): PublicCatchItem {
  const fact = item.workFacts.find((value) => value.trim().length > 0) ?? null;
  return { catchId: item.catchId, title: item.title, firstFact: item.title === null ? fact : null };
}

export function createPublicCatchSummary(catches: Pick<CatchApi, "list">) {
  let state: PublicCatchSummaryState = { status: "idle" };
  let run = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();

  const set = (next: PublicCatchSummaryState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  /** 첫 페이지부터 다시 읽는다. 앞선 조회는 취소하고 그 응답은 버린다. */
  async function load(): Promise<void> {
    controller?.abort();
    const current = ++run;
    const abort = new AbortController();
    controller = abort;
    set({ status: "loading" });

    const items: PublicCatchItem[] = [];
    const seenCatches = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let page = 0; page < MAX_SUMMARY_PAGES; page += 1) {
      const result = await catches.list("", cursor, abort.signal);
      if (current !== run) return;
      if (result.kind !== "success") {
        set({ status: "failed" });
        return;
      }
      for (const item of result.data.items) {
        // 읽는 동안 순서가 밀려 같은 Catch가 두 페이지에 나올 수 있다. 처음 본 것만 센다.
        if (seenCatches.has(item.catchId)) continue;
        seenCatches.add(item.catchId);
        // 수신자 조회 기준: 공개이면서 원본 비공개 제한이 없는 Catch만.
        if (item.visibility !== "PUBLIC" || item.restriction !== "NONE") continue;
        items.push(summarize(item));
      }
      const next = result.data.page.nextCursor;
      if (next === null) {
        set({ status: "ready", items });
        return;
      }
      if (seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    }
    set({ status: "failed" });
  }

  return {
    load,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 화면을 떠날 때 진행 중 조회를 취소하고 늦은 응답을 버린다. */
    dispose() {
      run += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export type PublicCatchSummary = ReturnType<typeof createPublicCatchSummary>;
