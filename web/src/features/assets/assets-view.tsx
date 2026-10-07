"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { CatchAsset, RepositoryOption } from "./types";
import styles from "./assets.module.css";

export type LoadState = "ready" | "loading" | "error";
export type AssetTab = "catch" | "portfolio" | "introduction" | "resume";
export const assetTabs: { id: AssetTab; label: string }[] = [
  { id: "catch", label: "Catch" },
  { id: "portfolio", label: "포트폴리오" },
  { id: "introduction", label: "자기소개서" },
  { id: "resume", label: "이력서" },
];

type AssetsViewProps = {
  dataMode?: "preview" | "api";
  detailItem?: CatchAsset;
  detailActions?: ReactNode;
  listMessage?: string;
  detailMessage?: string;
  hasMore?: boolean;
  moreState?: "idle" | "loading" | "error";
  onLoadMore?: () => void;
  items: readonly CatchAsset[];
  repositories: readonly RepositoryOption[];
  repositoryNotice?: ReactNode;
  repositoryId: string;
  tab: AssetTab;
  listState: LoadState;
  detailState: LoadState;
  selectedId: string | null;
  // D 담당의 연결 관리 영역이 들어갈 자리. 실제 모달 구현과 분리한다.
  repositoryManagement: ReactNode;
  onTabChange: (tab: AssetTab) => void;
  onRepositoryChange: (repositoryId: string) => void;
  onOpen: (catchId: string) => void;
  onClose: () => void;
  onRetryList: () => void;
  onRetryDetail: () => void;
};

function confirmationLabel(item: CatchAsset) {
  const { workFactsConfirmed, contributionConfirmed } = item.confirmation;
  if (workFactsConfirmed && contributionConfirmed) return "확인 완료";
  if (workFactsConfirmed || contributionConfirmed) return "일부 확인";
  return "확인 전";
}

function StatusBadges({ item }: { item: CatchAsset }) {
  return (
    <div className={styles.badges} aria-label="Catch 상태">
      <span className={styles.badge}>{confirmationLabel(item)}</span>
      <span className={item.visibility === "PUBLIC" ? styles.publicBadge : styles.badge}>
        {item.visibility === "PUBLIC" ? "공개 설정" : "미공개"}
      </span>
      {item.mismatch && <span className={styles.warningBadge}>불일치 표시됨</span>}
      {item.restriction === "SOURCE_PRIVATE" && (
        <span className={styles.warningBadge}>원본 비공개 · 외부 열람 제한</span>
      )}
    </div>
  );
}

function StateMessage({ title, children, retry }: {
  title: string;
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className={styles.state} role="status">
      <h3>{title}</h3>
      <p>{children}</p>
      {retry && <button className={styles.secondaryButton} onClick={retry}>다시 불러오기</button>}
    </div>
  );
}

export function AssetsView(props: AssetsViewProps) {
  const { items, repositories, repositoryId, tab, listState, selectedId, detailState } = props;
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousSelectedRef.current && !selectedId) {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else headingRef.current?.focus({ preventScroll: true });
    }
    previousSelectedRef.current = selectedId;
  }, [selectedId]);
  const visibleItems = items.filter((item) => !repositoryId || item.repositoryId === repositoryId);
  const selected = props.dataMode === "api" ? props.detailItem : items.find((item) => item.catchId === selectedId);
  const selectedRepository = repositories.find((repo) => repo.repositoryId === repositoryId);

  return (
    <main className={styles.workspace}>
      <div className={styles.pageHeading}>
        <p className={styles.eyebrow}>MY ASSETS</p>
        <h1 ref={headingRef} tabIndex={-1}>내 자산</h1>
        <p>기록에서 찾은 경험을 살펴보고, 근거와 나의 기여를 확인하세요.</p>
      </div>

      <nav className={styles.tabs} aria-label="자산 종류">
        {assetTabs.map(({ id, label }) => (
          <button key={id} className={tab === id ? styles.activeTab : styles.tab}
            aria-current={tab === id ? "page" : undefined} onClick={() => props.onTabChange(id)}>
            {label}{id !== "catch" && <span>준비 중</span>}
          </button>
        ))}
      </nav>

      {tab !== "catch" ? (
        <StateMessage title={`${assetTabs.find((item) => item.id === tab)?.label} 준비 중`}>
          현재는 Catch에서 분석으로 찾은 경험과 근거를 확인할 수 있습니다.
        </StateMessage>
      ) : (
        <>
          {props.repositoryManagement}
          <section className={styles.listSection} aria-labelledby="catch-list-title">
            <div className={styles.listHeading}>
              <div><h2 id="catch-list-title">내 Catch</h2><p>카드를 눌러 설명과 근거를 자세히 살펴보세요.</p></div>
              <label className={styles.filter}>저장소
                <select value={repositoryId} onChange={(event) => props.onRepositoryChange(event.target.value)}>
                  <option value="">전체 저장소</option>
                  {repositoryId && !selectedRepository && <option value={repositoryId}>저장소 이름 확인 전</option>}
                  {repositories.map((repo) => <option key={repo.repositoryId} value={repo.repositoryId}>{repo.name}</option>)}
                </select>
              </label>
            </div>

            {props.repositoryNotice}
            {listState === "loading" ? (
              <StateMessage title="Catch를 불러오고 있습니다">목록을 확인하고 있어요. 잠시만 기다려 주세요.</StateMessage>
            ) : listState === "error" ? (
              <StateMessage title="Catch 목록을 불러오지 못했습니다" retry={props.onRetryList}>
                {props.listMessage ?? "조회에 문제가 생겼습니다. Catch가 없다는 뜻은 아닙니다."}
              </StateMessage>
            ) : props.dataMode !== "api" && repositoryId && !selectedRepository ? (
              <StateMessage title="저장소를 찾을 수 없습니다">필터에서 다른 저장소를 선택해 주세요.</StateMessage>
            ) : visibleItems.length === 0 ? (
              <StateMessage title={repositoryId ? "이 저장소에서 표시할 Catch가 없습니다" : "아직 표시할 Catch가 없습니다"}>
                저장소 연결과 분석 상태는 위쪽 연결 관리에서 확인할 수 있습니다.
              </StateMessage>
            ) : (
              <>
                <p className={styles.count} aria-live="polite">{props.dataMode === "api" ? "불러온 " : ""}{visibleItems.length}개의 Catch</p>
                <ul className={styles.grid}>
                  {visibleItems.map((item) => (
                    <li key={item.catchId} className={styles.card}>
                      <p className={styles.repository}>{repositories.find((repo) => repo.repositoryId === item.repositoryId)?.name ?? "저장소 정보 없음"}</p>
                      <h3><button className={styles.cardTitle} onClick={(event) => {
                        returnFocusRef.current = event.currentTarget;
                        props.onOpen(item.catchId);
                      }}>{item.title}</button></h3>
                      <StatusBadges item={item} />
                      <p className={styles.summary}>{item.workFacts[0] || "상세에서 근거를 확인해 주세요."}</p>
                      <div className={styles.cardFooter}><span>근거 {item.evidence.length}개</span><span>상세 보기 ↗</span></div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {listState === "ready" && props.hasMore && <div className={styles.pagination}>
              {props.moreState === "error" && <p role="alert">{props.listMessage ?? "다음 목록을 불러오지 못했습니다."}</p>}
              <button className={styles.secondaryButton} disabled={props.moreState === "loading"} onClick={props.onLoadMore}>
                {props.moreState === "loading" ? "불러오는 중…" : props.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
              </button>
            </div>}
          </section>
        </>
      )}

      {selectedId && tab === "catch" && (
        <CatchDetail key={selectedId} item={selected} state={detailState}
          repositoryName={repositories.find((repo) => repo.repositoryId === selected?.repositoryId)?.name}
          onClose={props.onClose} onRetry={props.onRetryDetail} dataMode={props.dataMode} errorMessage={props.detailMessage} actions={props.detailActions} />
      )}
    </main>
  );
}

function CatchDetail({ item, state, repositoryName, onClose, onRetry, dataMode = "preview", errorMessage, actions }: {
  dataMode?: "preview" | "api";
  errorMessage?: string;
  actions?: ReactNode;
  item?: CatchAsset;
  state: LoadState;
  repositoryName?: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="catch-detail-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles.dialogHeading}>
        <div><p className={styles.eyebrow}>CATCH DETAIL{dataMode === "preview" ? " · 임시 데이터" : ""}</p><h2 id="catch-detail-title">Catch 상세</h2></div>
        <button className={styles.secondaryButton} autoFocus onClick={onClose}>닫기</button>
      </div>
      {state === "loading" ? <StateMessage title="상세 내용을 불러오고 있습니다">근거와 설명을 확인하고 있어요.</StateMessage>
        : state === "error" ? <StateMessage title="상세 내용을 불러오지 못했습니다" retry={onRetry}>{errorMessage ?? "현재는 결과를 확인할 수 없습니다. 다시 불러와 주세요."}</StateMessage>
        : !item ? <StateMessage title="이 Catch를 열 수 없습니다">목록으로 돌아가 확인할 Catch를 다시 선택해 주세요.</StateMessage>
        : <>
          <p className={styles.repository}>{repositoryName ?? "저장소 정보 없음"}</p>
          <h3 className={styles.detailTitle}>{item.title}</h3>
          <StatusBadges item={item} />
          <p className={styles.readOnlyNotice}>{dataMode === "preview" ? "예시 자료입니다. 확인·불일치·공개 설정은 바뀌지 않습니다." : item.sourceMode === "MOCK" ? "합성 자료로 생성된 Catch입니다. 실제 분석 결과와 구분해 확인해 주세요." : "확인과 공개 선택은 별도입니다."}</p>
          <section className={styles.detailSection}><h3>작업에서 확인된 사실</h3>
            {item.workFacts.length ? <ul>{item.workFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul> : <p>제공된 작업 사실이 없습니다.</p>}
          </section>
          <section className={styles.detailSection}><h3>나의 기여</h3><p>{item.subjectContribution || "제공된 기여 설명이 없습니다."}</p></section>
          <section className={styles.detailSection}><h3>근거</h3>
            {item.evidence.length === 0 ? <p>제공된 근거가 없습니다.</p> : item.evidence.map((evidence, index) => (
              <article key={evidence.catchEvidenceId} className={styles.evidence}>
                <h4>근거 {index + 1}</h4>
                <p className={styles.sourceUrl}>{dataMode === "api" && item.sourceMode === "LIVE" && safeEvidenceUrl(evidence.sourceUrl)
                  ? <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">원본 근거 열기</a> : evidence.sourceUrl}</p>
                <p className={styles.small}>{dataMode === "preview" || item.sourceMode === "MOCK" ? "가상 근거 주소 · 외부 연결 없음 · " : ""}판본 {evidence.sourceRevision}</p>
                <ul>{evidence.representedFacts.map((fact, factIndex) => <li key={factIndex}>{fact}</li>)}</ul>
                <p><strong>기여 범위:</strong> {evidence.contributionScope}</p>
                {evidence.coverageLimits.length > 0 && <div><strong>이 근거로 알 수 없는 것</strong><ul>{evidence.coverageLimits.map((limit, limitIndex) => <li key={limitIndex}>{limit}</li>)}</ul></div>}
              </article>
            ))}
          </section>
          <section className={styles.detailSection}><h3>Catch 설명 초안</h3>
            {item.draft.status === "GENERATED" && item.draft.content !== null ? <p className={styles.draft}>{item.draft.content}</p>
              : <p>{item.draft.status === "FAILED" ? "설명 초안을 생성하지 못했습니다. 위의 사실과 근거는 확인할 수 있습니다." : "생성된 설명 초안이 없습니다."}</p>}
          </section>
          <section className={styles.detailSection}><h3>생각해 볼 질문 <span className={styles.small}>본인만 확인</span></h3>
            {item.reflection.status === "GENERATED" && item.reflection.questions.length > 0 ? <ul>{item.reflection.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
              : <p>{item.reflection.status === "FAILED" ? "질문을 생성하지 못했습니다." : "생성된 질문이 없습니다."}</p>}
            <p className={styles.small}>질문에 대한 답변을 저장하는 기능은 제공하지 않습니다.</p>
          </section>
          <section className={styles.detailSection}><h3>현재 확인 상태</h3>
            <dl className={styles.confirmations}>
              <div><dt>작업 사실</dt><dd>{item.confirmation.workFactsConfirmed ? "확인 완료" : "확인 전"}</dd></div>
              <div><dt>나의 기여</dt><dd>{item.confirmation.contributionConfirmed ? "확인 완료" : "확인 전"}</dd></div>
              <div><dt>불일치 표시</dt><dd>{item.mismatch ? "있음" : "없음"}</dd></div>
            </dl>
            <p className={styles.small}>내용 확인과 공개 선택은 별도입니다. 팝업을 열어도 확인 완료로 바뀌지 않습니다.</p>
          </section>
        </>}
      {state === "ready" && item && actions}
      <div className={styles.dialogFooter}><button className={styles.primaryButton} onClick={onClose}>목록으로 돌아가기</button></div>
    </dialog>
  );
}

function safeEvidenceUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
