"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AssetsView, assetTabs, type AssetTab, type LoadState } from "./assets-view";
import { previewCatches, previewRepositories } from "./fixtures";
import styles from "./assets.module.css";

function loadState(value: string | null): LoadState {
  return value === "loading" || value === "error" ? value : "ready";
}

export function AssetsPreview() {
  const params = useSearchParams();
  const pathname = usePathname();
  const scenario = params.get("scenario") ?? "ready";
  const selectedTab = params.get("tab");
  const tab: AssetTab = assetTabs.find((item) => item.id === selectedTab)?.id ?? "catch";

  function changeQuery(changes: Record<string, string | null>) {
    // 빠르게 연속 선택해도 이전 렌더의 검색값으로 앞선 선택을 덮어쓰지 않는다.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const url = `${pathname}${next.size ? `?${next}` : ""}`;
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, "", url);
    }
  }

  return (
    <div className={styles.preview}>
      <aside className={styles.previewToolbar} aria-label="개발용 미리보기 도구">
        <div><strong>CatchU · 내 자산 미리보기</strong><p>모두 임시 데이터입니다. 실제 로그인·분석·저장·공개는 실행하지 않습니다.</p></div>
        <div className={styles.previewControls}>
          <label>목록 예시
            <select value={["ready", "empty", "loading", "error"].includes(scenario) ? scenario : "ready"}
              onChange={(event) => changeQuery({ scenario: event.target.value, catchId: null })}>
              <option value="ready">정상 목록</option><option value="empty">빈 목록</option>
              <option value="loading">불러오는 중</option><option value="error">조회 실패</option>
            </select>
          </label>
          <label>상세 예시
            <select value={loadState(params.get("detailScenario"))}
              onChange={(event) => changeQuery({ detailScenario: event.target.value })}>
              <option value="ready">정상 상세</option><option value="loading">불러오는 중</option><option value="error">조회 실패</option>
            </select>
          </label>
        </div>
      </aside>
      <AssetsView items={scenario === "empty" ? [] : previewCatches} repositories={previewRepositories}
        repositoryId={params.get("repositoryId") ?? ""} tab={tab}
        listState={loadState(scenario)} detailState={loadState(params.get("detailScenario"))}
        selectedId={params.get("catchId")}
        onTabChange={(nextTab) => changeQuery({ tab: nextTab === "catch" ? null : nextTab, catchId: null })}
        onRepositoryChange={(repositoryId) => changeQuery({ repositoryId: repositoryId || null, catchId: null })}
        onOpen={(catchId) => changeQuery({ catchId })} onClose={() => changeQuery({ catchId: null })}
        onRetryList={() => changeQuery({ scenario: "ready" })}
        onRetryDetail={() => changeQuery({ detailScenario: "ready" })}
        repositoryManagement={
          <section className={styles.managementPlaceholder} aria-label="저장소 연결 관리 삽입 자리">
            <div><h2>GitHub 저장소 연결 관리</h2><p>저장소 연결과 분석 상태를 확인하는 영역이 이곳에 들어갑니다.</p></div>
            <span className={styles.placeholderLabel}>연결 관리 영역 · 연동 예정</span>
          </section>
        } />
      <footer className={styles.previewFooter}>미리보기 전용 화면 · 정상·빈 목록·조회 실패를 각각 확인할 수 있습니다.</footer>
    </div>
  );
}
