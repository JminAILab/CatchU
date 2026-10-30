import type { RepositoryApi } from "./repository-api.ts";

export type RegistrationState = { url: string; phase: "editing" | "registering" | "registered"; message: string | null; failed: boolean };
export const REGISTRATION_ERRORS: Record<string, string> = {
  REPOSITORY_URL_INVALID: "https://github.com/소유자/저장소 형식의 저장소 루트 주소를 입력해 주세요.",
  REPOSITORY_PRIVATE: "비공개이거나 없는 저장소라 확인할 수 없습니다. 공개 저장소 주소인지 확인해 주세요.",
  REPOSITORY_UNSUPPORTED: "이 저장소는 현재 지원 조건에 맞지 않아 등록할 수 없습니다.",
  REPOSITORY_UNVERIFIED: "GitHub에서 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  GITHUB_CONNECTION_REQUIRED: "GitHub 연결을 다시 확인한 뒤 등록해 주세요.",
};

export function createRepositoryRegistrationStore(register: RepositoryApi["register"], onRegistered: (repositoryId: string, signal: AbortSignal) => Promise<void>, onChanged: () => void = () => {}) {
  let state: RegistrationState = { url: "", phase: "editing", message: null, failed: false };
  let version = 0;
  let abort: AbortController | undefined;
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<RegistrationState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    change(url: string) { if (state.phase !== "registering") { onChanged(); emit({ url, phase: "editing", message: null, failed: false }); } },
    async submit() {
      if (state.phase === "registering" || !state.url.trim()) return;
      const current = ++version;
      abort = new AbortController();
      emit({ phase: "registering", message: null, failed: false });
      try {
        const result = await register(state.url.trim(), abort.signal);
        if (current !== version) return;
        if (result.kind !== "success") {
          emit({ phase: "editing", failed: true, message: result.kind === "api-error" ? REGISTRATION_ERRORS[result.code] ?? "저장소를 등록하지 못했습니다. 잠시 후 다시 확인해 주세요." : "등록 결과를 확인하지 못했습니다. 같은 주소로 다시 등록하면 기존 등록을 확인합니다." });
          return;
        }
        await onRegistered(result.data.repositoryId, abort.signal);
        if (current !== version) return;
        emit({ phase: "registered", message: "저장소를 등록했습니다. 아래 분석 안내를 확인하고 새로 동의해야 분석을 요청합니다.", failed: false });
      } catch {
        if (current === version) emit({ phase: "editing", failed: true, message: "등록 결과를 확인하지 못했습니다. 같은 주소로 다시 확인해 주세요." });
      }
    },
    cancel() { ++version; abort?.abort(); if (state.phase === "registering") emit({ phase: "editing", message: null }); },
    dispose() { ++version; abort?.abort(); emit({ url: "", phase: "editing", message: null, failed: false }); listeners.clear(); },
  };
}
export type RepositoryRegistrationStore = ReturnType<typeof createRepositoryRegistrationStore>;
