"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AuthorDescriptionFilter, CatchAsset, RepositoryOption } from "./types";
import styles from "./assets.module.css";

export type LoadState = "ready" | "loading" | "error";
// 자산 종류 탭은 두지 않는다. 텍스트 자료는 헤더의 [텍스트 자료](/materials)에서 관리한다(#416 2026-11-03 팀장 요청).
// 공개 상태 걸러 보기는 목록 자료의 visibility만 쓴다. 빈 값은 전체다.
export type VisibilityFilter = "" | CatchAsset["visibility"];
const visibilityLabels: Record<CatchAsset["visibility"], string> = { PUBLIC: "공개 설정", PRIVATE: "미공개" };
const emptyVisibilityTitles: Record<CatchAsset["visibility"], string> = { PUBLIC: "공개 설정한 Catch가 없습니다", PRIVATE: "미공개 Catch가 없습니다" };
export function parseVisibilityFilter(value: string | null): VisibilityFilter {
  return value === "PUBLIC" || value === "PRIVATE" ? value : "";
}
// 작성자 설명 걸러 보기(새 Catch BR5.4). 저장소처럼 목록 요청 조건으로 서버에서 거르고, 주소 매개변수의 그 밖 값은 전체다.
const authorDescriptionLabels: Record<AuthorDescriptionFilter, string> = { all: "전체", written: "씀", unwritten: "안 씀" };
const emptyAuthorDescriptionTitles: Record<Exclude<AuthorDescriptionFilter, "all">, string> = {
  written: "작성자 설명을 쓴 Catch가 없습니다", unwritten: "작성자 설명을 쓰지 않은 Catch가 없습니다",
};
export function parseAuthorDescriptionFilter(value: string | null): AuthorDescriptionFilter {
  return value === "written" || value === "unwritten" ? value : "all";
}
const matchesAuthorDescription = (item: CatchAsset, filter: AuthorDescriptionFilter) =>
  filter === "all" || item.hasAuthorDescription === (filter === "written");

type AssetsViewProps = {
  dataMode?: "preview" | "api";
  detailItem?: CatchAsset;
  detailActions?: ReactNode;
  /** 작성자 설명 편집 영역. 「생각해 볼 질문」 아래, 현재 확인 상태 위에 둔다(새 Catch BR4.1). 없으면 그리지 않는다. */
  descriptionEditor?: ReactNode;
  listMessage?: string;
  detailMessage?: string;
  hasMore?: boolean;
  moreState?: "idle" | "loading" | "error";
  onLoadMore?: () => void;
  items: readonly CatchAsset[];
  repositories: readonly RepositoryOption[];
  repositoryNotice?: ReactNode;
  repositoryId: string;
  visibility: VisibilityFilter;
  /** 없으면 전체다. API 방식은 서버가 거른 목록을 받고, 미리보기 방식은 고정 자료를 화면 안에서 거른다. */
  authorDescription?: AuthorDescriptionFilter;
  listState: LoadState;
  detailState: LoadState;
  selectedId: string | null;
  // D 담당의 연결 관리 영역이 들어갈 자리. 실제 모달 구현과 분리한다.
  repositoryManagement: ReactNode;
  onRepositoryChange: (repositoryId: string) => void;
  onVisibilityChange: (visibility: VisibilityFilter) => void;
  onAuthorDescriptionChange?: (authorDescription: AuthorDescriptionFilter) => void;
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
        {visibilityLabels[item.visibility]}
      </span>
      {item.mismatch && <span className={styles.warningBadge}>불일치 표시됨</span>}
      {item.restriction === "SOURCE_PRIVATE" && (
        <span className={styles.warningBadge}>원본 비공개 · 외부 열람 제한</span>
      )}
    </div>
  );
}

function hasGeneratedDraft(item: CatchAsset) {
  return item.draft.status === "GENERATED" && item.draft.content !== null && item.draft.content.trim().length > 0;
}

/** 자동 생성 안내. 목록과 상세가 같은 컴포넌트를 써서 「설명」을 「설명 초안」으로 함께 바꾼다(CR1 BR6.3). */
function GeneratedContentNotice({ item }: { item?: CatchAsset }) {
  const hasTitle = !item || item.title !== null;
  const hasDraft = !item || hasGeneratedDraft(item);
  const subject = hasTitle ? (hasDraft ? "제목과 설명 초안" : "제목") : hasDraft ? "설명 초안" : null;
  return (
    <p className={styles.readOnlyNotice}>
      {subject && <>{subject}은 CatchU가 GitHub 기록에서 자동으로 만들었습니다<br /></>}
      사실과 다르면 불일치를 표시하거나 공개하지 마세요.
    </p>
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
  const { items, repositories, repositoryId, visibility, listState, selectedId, detailState } = props;
  const authorDescription = props.authorDescription ?? "all";
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
  const repositoryItems = items.filter((item) => !repositoryId || item.repositoryId === repositoryId);
  // 서버가 준 목록에 해당한다. API 방식은 서버가 이미 걸렀으므로 다시 거르지 않는다. 설명을 저장해도 지금 쪽은 그대로다(BR5.6).
  const filteredItems = props.dataMode === "api" ? repositoryItems : repositoryItems.filter((item) => matchesAuthorDescription(item, authorDescription));
  const visibleItems = filteredItems.filter((item) => !visibility || item.visibility === visibility);
  const selected = props.dataMode === "api" ? props.detailItem : items.find((item) => item.catchId === selectedId);
  const selectedRepository = repositories.find((repo) => repo.repositoryId === repositoryId);

  return (
    <main className={styles.workspace}>
      <div className={styles.pageHeading}>
        <p className={styles.eyebrow}>MY ASSETS</p>
        <h1 ref={headingRef} tabIndex={-1}>내 자산</h1>
        <p>기록에서 찾은 경험을 살펴보고, 근거와 나의 기여를 확인하세요.</p>
      </div>

      {props.repositoryManagement}
      <section className={styles.listSection} aria-labelledby="catch-list-title">
        <div className={styles.listOverview}>
          <div className={styles.listHeading}>
            <div><h2 id="catch-list-title">내 Catch</h2><p>카드를 눌러 설명과 근거를 자세히 살펴보세요.</p></div>
            <div className={styles.filters}>
              <label className={styles.filter}>저장소
                <select value={repositoryId} onChange={(event) => props.onRepositoryChange(event.target.value)}>
                  <option value="">전체 저장소</option>
                  {repositoryId && !selectedRepository && <option value={repositoryId}>저장소 이름 확인 전</option>}
                  {repositories.map((repo) => <option key={repo.repositoryId} value={repo.repositoryId}>{repo.name}</option>)}
                </select>
              </label>
              <label className={styles.filter}>공개 상태
                <select value={visibility} onChange={(event) => props.onVisibilityChange(parseVisibilityFilter(event.target.value))}>
                  <option value="">전체</option>
                  <option value="PUBLIC">{visibilityLabels.PUBLIC}</option>
                  <option value="PRIVATE">{visibilityLabels.PRIVATE}</option>
                </select>
              </label>
              <label className={styles.filter}>작성자 설명
                <select value={authorDescription} data-testid="assets-author-description-filter"
                  onChange={(event) => props.onAuthorDescriptionChange?.(parseAuthorDescriptionFilter(event.target.value))}>
                  {(["all", "written", "unwritten"] as const).map((value) => <option key={value} value={value}>{authorDescriptionLabels[value]}</option>)}
                </select>
              </label>
            </div>
          </div>

          <GeneratedContentNotice />
          {props.repositoryNotice}
        </div>
        {listState === "loading" ? (
          <StateMessage title="Catch를 불러오고 있습니다">목록을 확인하고 있어요. 잠시만 기다려 주세요.</StateMessage>
        ) : listState === "error" ? (
          <StateMessage title="Catch 목록을 불러오지 못했습니다" retry={props.onRetryList}>
            {props.listMessage ?? "조회에 문제가 생겼습니다. Catch가 없다는 뜻은 아닙니다."}
          </StateMessage>
        ) : props.dataMode !== "api" && repositoryId && !selectedRepository ? (
          <StateMessage title="저장소를 찾을 수 없습니다">필터에서 다른 저장소를 선택해 주세요.</StateMessage>
        ) : authorDescription !== "all" && filteredItems.length === 0 ? (
          // BR5.5: 작성자 설명 조건으로 거른 결과가 비면 「아직 표시할 Catch가 없습니다」보다 먼저 보이고 저장소 연결 문구는 붙이지 않는다.
          <StateMessage title={`${repositoryId ? "이 저장소에 " : ""}${emptyAuthorDescriptionTitles[authorDescription]}`}>
            작성자 설명을 전체로 바꾸면 다른 Catch를 볼 수 있습니다.
          </StateMessage>
        ) : repositoryItems.length === 0 ? (
          <StateMessage title={repositoryId ? "이 저장소에서 표시할 Catch가 없습니다" : "아직 표시할 Catch가 없습니다"}>
            저장소 연결과 분석 상태는 위쪽 연결 관리에서 확인할 수 있습니다.
          </StateMessage>
        ) : visibility && visibleItems.length === 0 ? (
          <StateMessage title={`${repositoryId ? "이 저장소에 " : ""}${emptyVisibilityTitles[visibility]}`}>
            {props.hasMore ? "불러온 Catch 중에는 없습니다. 더 보기로 이어서 불러오거나 공개 상태를 전체로 바꿔 보세요."
              : "공개 상태를 전체로 바꾸면 다른 Catch를 볼 수 있습니다."}
          </StateMessage>
        ) : (
          <>
            <p className={styles.count} aria-live="polite">{props.dataMode === "api" ? "불러온 " : ""}{visibleItems.length}개의 Catch</p>
            <ul className={styles.grid}>
              {visibleItems.map((item) => (
                <li key={item.catchId} className={styles.card}>
                  <div className={styles.cardMeta}>
                    <p className={styles.repository}>{repositories.find((repo) => repo.repositoryId === item.repositoryId)?.name ?? "저장소 정보 없음"}</p>
                    <StatusBadges item={item} />
                  </div>
                  {item.title !== null && <h3><button className={styles.cardTitle} onClick={(event) => {
                    returnFocusRef.current = event.currentTarget;
                    props.onOpen(item.catchId);
                  }}><span className={styles.titleClamp}>{item.title}</span></button></h3>}
                  <p className={styles.summary}>{item.workFacts[0] || "상세에서 근거를 확인해 주세요."}</p>
                  <div className={styles.cardFooter}><span>근거 {item.evidence.length}개</span>
                    {item.title === null ? <button className={styles.cardDetails} onClick={(event) => {
                      returnFocusRef.current = event.currentTarget;
                      props.onOpen(item.catchId);
                    }}>상세 보기 ↗</button> : <span>상세 보기 ↗</span>}
                  </div>
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

      {selectedId && (
        <CatchDetail key={selectedId} item={selected} state={detailState}
          repositoryName={repositories.find((repo) => repo.repositoryId === selected?.repositoryId)?.name}
          onClose={props.onClose} onRetry={props.onRetryDetail} dataMode={props.dataMode} errorMessage={props.detailMessage} actions={props.detailActions}
          descriptionEditor={props.descriptionEditor} />
      )}
    </main>
  );
}

function CatchDetail({ item, state, repositoryName, onClose, onRetry, dataMode = "preview", errorMessage, actions, descriptionEditor }: {
  dataMode?: "preview" | "api";
  errorMessage?: string;
  actions?: ReactNode;
  descriptionEditor?: ReactNode;
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
    <dialog ref={dialogRef} className={`${styles.dialog} ${styles.catchDialog}`} aria-labelledby="catch-detail-title"
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
          {item.title !== null && <h3 className={styles.detailTitle}>{item.title}</h3>}
          <StatusBadges item={item} />
          <GeneratedContentNotice item={item} />
          <p className={dataMode === "preview" || item.sourceMode === "MOCK" ? styles.readOnlyNotice : `${styles.readOnlyNotice} ${styles.subtleNotice}`}>{dataMode === "preview" ? "예시 자료입니다. 확인·불일치·공개 설정은 바뀌지 않습니다." : item.sourceMode === "MOCK" ? "합성 자료로 생성된 Catch입니다. 실제 분석 결과와 구분해 확인해 주세요." : "확인과 공개 선택은 별도입니다."}</p>
          <div className={styles.factGrid}>
            <section className={styles.factPanel}><h3>작업에서 확인된 사실</h3>
              {item.workFacts.length ? <ul>{item.workFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul> : <p>제공된 작업 사실이 없습니다.</p>}
            </section>
            <section className={styles.factPanel}><h3>나의 기여</h3><p>{item.subjectContribution || "제공된 기여 설명이 없습니다."}</p></section>
          </div>
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
          {/* 새 Catch BR4.1: 근거 → (다시 볼 곳, NC3) → Catch 설명 초안 → 생각해 볼 질문 → 작성자 설명 → 현재 확인 상태. 초안과 질문을 보고 아래 칸에 쓴다. */}
          {/* CR3 BR7.1: 설명 초안이 NOT_GENERATED면 칸(제목·안내 글)을 그리지 않는다. FAILED·GENERATED는 그대로다. */}
          {item.draft.status !== "NOT_GENERATED" && <section className={styles.detailSection}><h3>Catch 설명 초안</h3>
            {hasGeneratedDraft(item) ? <p className={styles.draft}>{item.draft.content}</p>
              : <p>{item.draft.status === "FAILED" ? "설명 초안을 생성하지 못했습니다. 위의 사실과 근거는 확인할 수 있습니다." : "생성된 설명 초안이 없습니다."}</p>}
          </section>}
          <section className={styles.detailSection}><h3>생각해 볼 질문 <span className={styles.small}>본인만 확인</span></h3>
            {item.reflection.status === "GENERATED" && item.reflection.questions.length > 0 ? <ul>{item.reflection.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
              : <p>{item.reflection.status === "FAILED" ? "질문을 생성하지 못했습니다." : "생성된 질문이 없습니다."}</p>}
            <p className={styles.small}>질문을 보고 아래 칸에 자기 말로 적어 보세요.</p>
          </section>
          {descriptionEditor}
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
