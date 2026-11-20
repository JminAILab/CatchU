import { needsConnection, type RepositoryApi } from "../repository-management/repository-api.ts";
import type { RepositoryOption } from "./types";

export type RepositoryOptionsSnapshot = {
  /** `connection`: GitHub 연결이 없거나 다시 연동해야 한다(403 `GITHUB_CONNECTION_REQUIRED`). 조회 실패가 아니며 연동 안내는 위쪽 연결 관리가 맡는다. */
  state: "loading" | "ready" | "error" | "connection";
  repositories: readonly RepositoryOption[];
};

/** Catch 조회와 독립적으로 저장소 이름을 읽는다. 응답 검증·페이지 순회는 RepositoryApi가 맡는다. */
export function createRepositoryOptionsStore(api: Pick<RepositoryApi, "repositories">) {
  let snapshot: RepositoryOptionsSnapshot = { state: "loading", repositories: [] };
  const listeners = new Set<() => void>();
  let version = 0;
  let controller: AbortController | undefined;
  const emit = (next: RepositoryOptionsSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  async function refresh(): Promise<void> {
    const currentVersion = ++version;
    controller?.abort();
    const currentController = new AbortController();
    controller = currentController;
    emit({ state: "loading", repositories: snapshot.repositories });
    try {
      const result = await api.repositories(currentController.signal);
      if (currentVersion !== version) return;
      if (result.kind === "success") {
        const repositories = [...new Map(result.data.map((repository) => [repository.repositoryId, {
          repositoryId: repository.repositoryId,
          name: `${repository.ownerLogin}/${repository.name}`,
        }])).values()];
        emit({ state: "ready", repositories });
      } else {
        emit({ state: needsConnection(result) ? "connection" : "error", repositories: snapshot.repositories });
      }
    } catch {
      if (currentVersion === version) emit({ state: "error", repositories: snapshot.repositories });
    } finally {
      if (controller === currentController) controller = undefined;
    }
  }

  function dispose() {
    ++version;
    controller?.abort();
    controller = undefined;
    snapshot = { state: "loading", repositories: [] };
    listeners.clear();
    // StrictMode의 effect cleanup/setup에서는 같은 store로 다시 구독·조회할 수 있다.
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    dispose,
  };
}

export type RepositoryOptionsStore = ReturnType<typeof createRepositoryOptionsStore>;
