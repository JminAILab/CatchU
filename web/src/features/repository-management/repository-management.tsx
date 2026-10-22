"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createAnalysisRequestApi, type AnalysisRequestApi } from "@/features/analysis-request/analysis-request-api";
import { AnalysisRequestSection } from "@/features/analysis-request/analysis-request-section";
import { createAnalysisRequestStore } from "@/features/analysis-request/analysis-request-store";
import type { RepositoryManagementBindings } from "@/features/assets/assets-connected";
import { api as client } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { GitHubState, RepositoryApi } from "./repository-api";
import {
  canShowCatches, connectedRepositories, STATUS_LABEL, statusDetails, statusIcon,
  type ConnectedRepository, type StatusIcon,
} from "./repository-status";
import styles from "./repository-management.module.css";

type Props = {
  api: RepositoryApi;
  /** B(#172)가 주는 콜백. 모달 열기 직전 onOpen, 일반 닫기 onClosed, [이 저장소 Catch 보기]는 onShowRepository만 부른다. */
  bindings: RepositoryManagementBindings;
  /**
   * 분석 고지 조회·첫 분석 요청 API(#154). 생략하면 #106의 api.member로 만든 제품 호출을 쓴다.
   * 미리보기·시험은 합성 호출을 넘긴다. 처음 렌더에서 받은 값을 계속 쓴다.
   */
  requestApi?: AnalysisRequestApi;
  /** 「연결할 수 있는 저장소」 자리를 직접 채울 때. 주면 #154 요청 영역 대신 이것을 그린다. */
  connectSection?: ReactNode;
};

type Load<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

/** 제품 화면의 분석 고지·요청 호출. 모듈 단위로 한 번 만든다(회원 토큰·기준 주소는 api.member가 맡는다). */
const memberRequestApi = createAnalysisRequestApi(client.member);

const GLYPH: Record<StatusIcon, string> = { analyzing: "…", success: "✓", partial: "!", failed: "×" };
const timeFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

function formatTime(value: string): string {
  return timeFormat.format(new Date(value));
}

/**
 * 내 자산 Catch 탭 위쪽의 GitHub 저장소 연결 관리 영역과 모달(D, #153).
 * 조회 실패를 0건으로, 실행 불명·반영 실패·복구를 분석 실패로 바꿔 보이지 않는다. 새 분석·재요청은 자동으로 부르지 않는다.
 */
export function RepositoryManagement({ api, bindings, requestApi, connectSection }: Props) {
  const [github, setGithub] = useState<Load<GitHubState>>({ state: "loading" });
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<Load<ConnectedRepository[]>>({ state: "loading" });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const loadVersion = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const titleId = useId();

  /** 응답을 받은 뒤에만 상태를 바꾼다. 처음 조회는 로딩 상태로 시작하고, 다시 불러오기는 버튼에서 로딩으로 바꾼다. */
  const fetchGithub = useCallback((signal?: AbortSignal) => {
    void api.githubState(signal).then((result) => {
      if (signal?.aborted) return;
      setGithub(result.kind === "success" ? { state: "ready", value: result.data } : { state: "failed" });
    });
  }, [api]);

  useEffect(() => {
    const abort = new AbortController();
    fetchGithub(abort.signal);
    return () => abort.abort();
  }, [fetchGithub]);

  function retryGithub() {
    setGithub({ state: "loading" });
    fetchGithub();
  }

  const loadConnected = useCallback(() => {
    const version = ++loadVersion.current;
    loadAbort.current?.abort();
    const abort = new AbortController();
    loadAbort.current = abort;
    setConnected({ state: "loading" });
    void Promise.all([api.repositories(abort.signal), api.analyses(abort.signal)]).then(([repositories, analyses]) => {
      if (version !== loadVersion.current) return;
      // 이름을 합칠 선정 목록이나 상태 이력 중 하나라도 실패하면 부분 목록을 보여 주지 않는다.
      if (repositories.kind !== "success" || analyses.kind !== "success") { setConnected({ state: "failed" }); return; }
      setConnected({ state: "ready", value: connectedRepositories(repositories.data, analyses.data) });
    });
  }, [api]);

  useEffect(() => () => { ++loadVersion.current; loadAbort.current?.abort(); }, []);

  // #154 요청 상태. 모달을 닫아도 버리지 않아, 응답 불명으로 붙잡은 키·본문이 다시 열었을 때도 남는다.
  // 이 컴포넌트가 내려가면(회원 변경·화면 이동) 버린다.
  const [requestStore] = useState(() => connectSection === undefined ? createAnalysisRequestStore({
    repositories: (signal) => api.analyzableRepositories(signal),
    requests: requestApi ?? memberRequestApi,
  }) : null);
  useEffect(() => () => requestStore?.dispose(), [requestStore]);
  // 접수·거부 결과가 진행 상태를 바꿨을 수 있으면 열려 있는 모달의 「연결된 저장소」를 다시 불러온다.
  // 그 조회가 실패해도 접수 결과 안내는 바꾸지 않는다(각자 따로 표시). 닫혀 있으면 부르지 않는다.
  useEffect(() => (open && requestStore ? requestStore.watchStatusChanges(loadConnected) : undefined),
    [open, requestStore, loadConnected]);

  // 열림 상태와 dialog를 맞춘다. 닫을 때는 연 버튼으로 초점을 돌린다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      openButtonRef.current?.focus();
    }
  }, [open]);

  function openModal() {
    bindings.onOpen();
    setExpanded(new Set());
    setOpen(true);
    loadConnected();
    void requestStore?.open();
  }

  function stopLoading() {
    ++loadVersion.current;
    loadAbort.current?.abort();
  }

  /** 일반 닫기(닫기 버튼·X·Esc·바깥 클릭). B가 현재 필터로 목록을 다시 불러온다. */
  function closeModal() {
    if (!open) return;
    stopLoading();
    setOpen(false);
    bindings.onClosed();
  }

  /** [이 저장소 Catch 보기]. 모달을 닫고 onShowRepository만 부른다(onClosed 중복 호출 없음). */
  function showRepository(repositoryId: string) {
    stopLoading();
    setOpen(false);
    bindings.onShowRepository(repositoryId);
  }

  function toggle(repositoryId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(repositoryId)) next.delete(repositoryId); else next.add(repositoryId);
      return next;
    });
  }

  return (
    <section className={styles.area} aria-labelledby={`${titleId}-area`}>
      <div className={styles.areaText}>
        <h2 id={`${titleId}-area`} className={styles.areaTitle}>GitHub 저장소 연결 관리</h2>
        <AreaMessage github={github} />
      </div>
      <div className={styles.areaAction}>
        {github.state === "failed" && (
          <button type="button" className={styles.secondaryButton} onClick={retryGithub}>다시 불러오기</button>
        )}
        {github.state === "ready" && github.value === "CONNECTED" && (
          <button ref={openButtonRef} type="button" className={styles.primaryButton} onClick={openModal}>연결 관리</button>
        )}
        {github.state === "ready" && github.value !== "CONNECTED" && (
          <Link href={routes.profileGithub} className={styles.primaryButton}>
            {github.value === "REAUTH_REQUIRED" ? "GitHub 다시 연동하기" : "GitHub 연동하기"}
          </Link>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={`${titleId}-dialog`}
        // Esc: 브라우저 기본 닫기 대신 같은 닫기 경로를 써서 B 목록 갱신과 초점 복귀를 맞춘다.
        onCancel={(event) => { event.preventDefault(); closeModal(); }}
        // 내용은 안쪽 패널에 있으므로 dialog 자체를 누르고 뗐다면 배경을 누른 것이다(창 안에서 시작한 끌기는 제외).
        onPointerDown={(event) => { pressStartedOnBackdrop.current = event.target === event.currentTarget; }}
        onClick={(event) => {
          const onBackdrop = event.target === event.currentTarget && pressStartedOnBackdrop.current;
          pressStartedOnBackdrop.current = false;
          if (onBackdrop) closeModal();
        }}
      >
        {open && (
          <div className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2 id={`${titleId}-dialog`}>GitHub 저장소 연결 관리</h2>
              <button type="button" className={styles.closeIcon} aria-label="닫기" onClick={closeModal}>×</button>
            </header>

            <section className={styles.block} aria-labelledby={`${titleId}-connected`}>
              <div className={styles.blockHeading}>
                <div>
                  <h3 id={`${titleId}-connected`}>연결된 저장소</h3>
                  <p className={styles.muted}>분석을 요청한 저장소입니다. 상태를 누르면 자세한 내용이 보입니다.</p>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={loadConnected}
                  disabled={connected.state === "loading"}>상태 새로고침</button>
              </div>
              <ConnectedList connected={connected} expanded={expanded} titleId={titleId}
                onToggle={toggle} onShowRepository={showRepository} onRetry={loadConnected} />
            </section>

            <section className={styles.block} aria-labelledby={`${titleId}-connect`}>
              <h3 id={`${titleId}-connect`}>연결할 수 있는 저장소</h3>
              {requestStore ? <AnalysisRequestSection store={requestStore} /> : connectSection}
            </section>

            <footer className={styles.panelFooter}>
              <button type="button" className={styles.secondaryButton} onClick={closeModal}>닫기</button>
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}

function AreaMessage({ github }: { github: Load<GitHubState> }) {
  if (github.state === "loading") return <p className={styles.muted} role="status">연동 상태를 확인하고 있습니다.</p>;
  if (github.state === "failed") return <p className={styles.error} role="alert">연동 상태를 불러오지 못했습니다.</p>;
  if (github.value === "CONNECTED") return <p className={styles.muted}>연결한 저장소의 분석 상태를 확인하고, 새 저장소를 연결합니다.</p>;
  if (github.value === "REAUTH_REQUIRED") return <p className={styles.muted}>GitHub 연동을 다시 확인해야 저장소를 연결할 수 있습니다.</p>;
  return <p className={styles.muted}>GitHub 계정을 연동하면 공개 저장소를 골라 분석을 요청할 수 있습니다.</p>;
}

function ConnectedList({ connected, expanded, titleId, onToggle, onShowRepository, onRetry }: {
  connected: Load<ConnectedRepository[]>;
  expanded: ReadonlySet<string>;
  titleId: string;
  onToggle: (repositoryId: string) => void;
  onShowRepository: (repositoryId: string) => void;
  onRetry: () => void;
}) {
  if (connected.state === "loading") return <p className={styles.muted} role="status">저장소 상태를 불러오고 있습니다.</p>;
  if (connected.state === "failed") {
    return (
      <div className={styles.lookupFailed} role="alert">
        <p>저장소 상태를 불러오지 못했습니다. 분석이 실패한 것은 아닙니다.</p>
        <button type="button" className={styles.secondaryButton} onClick={onRetry}>다시 불러오기</button>
      </div>
    );
  }
  if (connected.value.length === 0) return <p className={styles.muted}>아직 분석을 요청한 저장소가 없습니다.</p>;
  return (
    <ul className={styles.list}>
      {connected.value.map((item) => {
        const icon = statusIcon(item.latest);
        const isOpen = expanded.has(item.repositoryId);
        const detailId = `${titleId}-${item.repositoryId}`;
        return (
          <li key={item.repositoryId} className={styles.item}>
            <button type="button" className={styles.row} aria-expanded={isOpen} aria-controls={detailId}
              onClick={() => onToggle(item.repositoryId)}>
              <span className={styles.name}>{item.displayName ?? `저장소 ${item.repositoryId}`}</span>
              <span className={`${styles.badge} ${styles[icon]}`}>
                <span aria-hidden="true">{GLYPH[icon]}</span> {STATUS_LABEL[icon]}
              </span>
            </button>
            {isOpen && (
              <div id={detailId} className={styles.detail}>
                {statusDetails(item.latest).map((line) => <p key={line}>{line}</p>)}
                <p className={styles.muted}>마지막 갱신 {formatTime(item.latest.updatedAt)}</p>
                {item.displayName === null && (
                  <p className={styles.muted}>선정 목록에서 이 저장소의 이름을 찾지 못해 식별자로 표시합니다.</p>
                )}
                {canShowCatches(item.latest) && (
                  <button type="button" className={styles.primaryButton} onClick={() => onShowRepository(item.repositoryId)}>
                    이 저장소 Catch 보기
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
