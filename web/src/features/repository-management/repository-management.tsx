"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAnalysisRequestApi, type AnalysisRequestApi } from "@/features/analysis-request/analysis-request-api";
import { AnalysisRequestSection, RetryRequest } from "@/features/analysis-request/analysis-request-section";
import { createAnalysisRequestStore } from "@/features/analysis-request/analysis-request-store";
import type { RepositoryManagementBindings } from "@/features/assets/assets-connected";
import { api as client } from "@/lib/api";
import { routes } from "@/lib/routes";
import { loadConnectedRepositories, type GitHubState, type RepositoryApi } from "./repository-api";
import { createRepositoryRegistrationStore } from "./repository-registration-store";
import {
  canShowCatches, connectedRepositories, connectionCheckView, requestConnectionNotice, showsPendingRequestEntry, STATUS_LABEL, statusDetails, statusIcon,
  type ConnectedRepository, type ConnectionCheckView, type StatusIcon,
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
/**
 * 「연결된 저장소」 상태. `checking`은 선정 목록의 연결 필요(403) 뒤 연동 상태를 다시 읽는 중이다.
 * 실패에 `github`가 있으면 재조회로 확인한 연결 해제·재인증 필요라서 연동 안내를 보인다(#153).
 */
type ConnectedState = { state: "loading" } | { state: "checking" } | { state: "ready"; value: ConnectedRepository[] }
  | ConnectionCheckView["connected"];

/** 제품 화면의 분석 고지·요청 호출. 모듈 단위로 한 번 만든다(회원 토큰·기준 주소는 api.member가 맡는다). */
const memberRequestApi = createAnalysisRequestApi(client.member);

/** 요청 영역을 쓰지 않는 조립(connectSection)에서 구독할 대상이 없을 때. */
const noSubscription = () => () => {};

const GLYPH: Record<StatusIcon, string> = { analyzing: "…", success: "✓", partial: "!", failed: "×" };
const timeFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

function formatTime(value: string): string {
  return timeFormat.format(new Date(value));
}

/**
 * 내 자산 Catch 탭 위쪽의 GitHub 저장소 연결 관리 영역과 모달(D, #153).
 * 조회 실패를 0건으로, 실행 불명·반영 실패·복구를 분석 실패로 바꿔 보이지 않는다. 새 분석·재요청은 자동으로 부르지 않는다.
 * 서버가 retry.allowed를 참으로 준 최신 요청에는 아코디언 안에 #154의 [동의하고 다시 요청]을 그린다(같은 요청 상태 객체).
 */
export function RepositoryManagement({ api, bindings, requestApi, connectSection }: Props) {
  const [github, setGithub] = useState<Load<GitHubState>>({ state: "loading" });
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<ConnectedState>({ state: "loading" });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const areaActionRef = useRef<HTMLDivElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const loadVersion = useRef(0);
  /** 연동 상태 조회의 차례. 나중에 시작한 조회(다시 불러오기·목록 뒤 재조회)의 결과만 영역 표시에 반영한다. */
  const githubVersion = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  /** 화면에 보이는 연동 상태. 목록 조회가 끝났을 때 그사이 연동이 돌아왔는지 판단하는 데만 쓴다. */
  const githubShown = useRef<Load<GitHubState>>(github);
  useEffect(() => { githubShown.current = github; }, [github]);
  const titleId = useId();

  /** 응답을 받은 뒤에만 상태를 바꾼다. 처음 조회는 로딩 상태로 시작하고, 다시 불러오기는 버튼에서 로딩으로 바꾼다. */
  const fetchGithub = useCallback((signal?: AbortSignal) => {
    const version = ++githubVersion.current;
    void api.githubState(signal).then((result) => {
      if (signal?.aborted || version !== githubVersion.current) return;
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
    const current = () => version === loadVersion.current;
    let githubRun = -1;
    // 선정 목록이 연결 필요(403)를 알리면 /me를 한 번 다시 읽는다(목록 재전송·자동 반복 없음). 닫기·새 조회·화면 해제는 이 조회를 취소한다.
    void loadConnectedRepositories(api, abort.signal, () => {
      if (!current()) return;
      githubRun = ++githubVersion.current;
      setConnected({ state: "checking" });
    }).then((result) => {
      if (!current()) return;
      // 이름을 합칠 선정 목록이나 상태 이력 중 하나라도 실패하면 부분 목록을 보여 주지 않는다.
      if (result.kind !== "connection") {
        setConnected(result.kind === "ready"
          ? { state: "ready", value: connectedRepositories(result.repositories, result.analyses) } : { state: "failed" });
        // 영역이 연결 해제·재인증 필요인데 선정 목록을 받았으면(이력 실패와 무관) 연동이 그사이 돌아왔을 수 있다.
        // 목록 403 뒤 재조회와 같은 규칙으로 /me를 한 번 다시 읽어 확인된 값만 반영한다(실패는 조회 실패, 추정하지 않음).
        const shown = githubShown.current;
        if ((result.kind === "ready" || result.listed) && shown.state === "ready" && shown.value !== "CONNECTED") {
          const run = ++githubVersion.current;
          void api.githubState(abort.signal).then((github) => {
            if (current() && run === githubVersion.current) setGithub(connectionCheckView(github).github);
          });
        }
        return;
      }
      const view = connectionCheckView(result.github);
      // 이 재조회 뒤에 시작한 연동 상태 조회([다시 불러오기])가 있으면 그 결과를 덮지 않는다.
      if (githubRun === githubVersion.current) setGithub(view.github);
      setConnected(view.connected);
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
  const [registrationStore] = useState(() => requestStore ? createRepositoryRegistrationStore(api.register, async (repositoryId, signal) => {
    await requestStore.load(); if (!signal.aborted) requestStore.select(repositoryId);
  }, () => requestStore.select(null)) : null);
  useEffect(() => () => registrationStore?.dispose(), [registrationStore]);
  // 확인하지 못한 요청이 남았는지는 #154 상태 객체의 phase만 읽는다(상태 복제·영속 보관 없음).
  // 연동 상태가 연결 해제 등으로 바뀌어 [연결 관리]가 사라져도 그 요청의 결과를 확인하러 모달을 다시 열 수 있게 한다.
  const requestPhase = useSyncExternalStore(requestStore?.subscribe ?? noSubscription,
    () => requestStore?.getSnapshot().phase ?? "editing", () => "editing" as const);
  const pendingEntry = showsPendingRequestEntry(github, requestPhase);
  // 서버가 접수를 연결 필요로 거부했는지(#154 안내의 연동 링크). 거부 판정·키 처리는 #154 상태 객체가 그대로 한다.
  const rejectedForConnection = useSyncExternalStore(requestStore?.subscribe ?? noSubscription,
    () => requestStore?.getSnapshot().message?.action === "github", () => false);
  const connectionNotice = requestConnectionNotice(github, rejectedForConnection, connected.state);
  // 서버가 연결 필요로 거부하면 열려 있는 모달의 「연결된 저장소」를 다시 불러와 연동 상태를 다시 확인한다
  // (목록 403 → /me 재조회). 거부 안내와 같은 갱신에서 조회 중으로 바뀌어, 확인 전에는 새 요청을 받지 않는다.
  useEffect(() => {
    if (!open || !requestStore) return;
    let rejected = requestStore.getSnapshot().message?.action === "github";
    return requestStore.subscribe(() => {
      const now = requestStore.getSnapshot().message?.action === "github";
      if (now && !rejected) loadConnected();
      rejected = now;
    });
  }, [open, requestStore, loadConnected]);
  // 확인된 연동 상태가 바뀌면 입력 단계의 #154 목록·고지를 기존 load()로 다시 읽는다. 연결 해제면 서버가 목록을 거부해
  // 상태 객체도 새 요청 본문을 만들 수 없고, 다시 연결되면 오래된 목록 대신 새 목록·고지에서 사용자가 고르고 동의한다.
  // 요청 중·응답 불명·빈도 제한이면 읽지 않고(#154 규칙), 입력 단계로 돌아온 뒤 읽는다.
  const requestLoadedFor = useRef<GitHubState | null>(null);
  const connection = github.state === "ready" ? github.value : null;
  useEffect(() => { if (connection !== "CONNECTED") registrationStore?.cancel(); }, [connection, registrationStore]);
  useEffect(() => {
    if (!requestStore || connection === null || requestLoadedFor.current === connection) return;
    if (open && requestPhase === "editing") {
      requestLoadedFor.current = connection;
      void requestStore.load();
    } else {
      requestLoadedFor.current = null;
    }
  }, [requestStore, connection, open, requestPhase]);
  // 접수·거부 결과가 진행 상태를 바꿨을 수 있으면 열려 있는 모달의 「연결된 저장소」를 다시 불러온다.
  // 그 조회가 실패해도 접수 결과 안내는 바꾸지 않는다(각자 따로 표시). 닫혀 있으면 부르지 않는다.
  useEffect(() => (open && requestStore ? requestStore.watchStatusChanges(loadConnected) : undefined),
    [open, requestStore, loadConnected]);

  // 열림 상태와 dialog를 맞춘다. 닫을 때는 연 버튼으로 초점을 돌린다.
  // 연 버튼이 그사이 사라졌으면(재조회로 연결 해제·재인증 필요·연동 상태 조회 실패가 된 경우) 영역에 남은 연동 링크·버튼으로 돌린다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      (openButtonRef.current ?? areaActionRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])"))?.focus();
    }
  }, [open]);

  function openModal() {
    bindings.onOpen();
    setExpanded(new Set());
    setOpen(true);
    loadConnected();
    // 입력 단계면 open()이 목록·고지를 읽으므로 같은 연동 상태로 다시 읽지 않게 표시한다.
    if (requestStore?.getSnapshot().phase === "editing" && github.state === "ready") requestLoadedFor.current = github.value;
    void requestStore?.open();
  }

  function stopLoading() {
    ++loadVersion.current;
    loadAbort.current?.abort();
  }

  /** 일반 닫기(닫기 버튼·X·Esc·바깥 클릭). B가 현재 필터로 목록을 다시 불러온다. */
  function closeModal() {
    if (!open) return;
    registrationStore?.cancel();
    stopLoading();
    setOpen(false);
    bindings.onClosed();
  }

  /** [이 저장소 Catch 보기]. 모달을 닫고 onShowRepository만 부른다(onClosed 중복 호출 없음). */
  function showRepository(repositoryId: string) {
    registrationStore?.cancel();
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
        {pendingEntry && (
          <p className={styles.muted}>결과를 확인하지 못한 분석 요청이 있습니다. [보낸 분석 요청 확인]에서 같은 요청으로 결과를 확인할 수 있습니다.</p>
        )}
      </div>
      <div ref={areaActionRef} className={styles.areaAction}>
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
        {pendingEntry && (
          // 새 요청이 아니라 남아 있는 요청의 확인용이다. 여는 것만으로 요청을 보내지 않는다.
          <button ref={openButtonRef} type="button" className={styles.secondaryButton} onClick={openModal}>보낸 분석 요청 확인</button>
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
                  disabled={connected.state === "loading" || connected.state === "checking"}>상태 새로고침</button>
              </div>
              <ConnectedList connected={connected} expanded={expanded} titleId={titleId}
                onToggle={toggle} onShowRepository={showRepository} onRetry={loadConnected}
                renderRetry={requestStore ? (latest) => (
                  <RetryRequest store={requestStore} target={latest} connectionNotice={connectionNotice} />
                ) : undefined} />
            </section>

            <section className={styles.block} aria-labelledby={`${titleId}-connect`}>
              <h3 id={`${titleId}-connect`}>저장소 등록과 분석 요청</h3>
              {requestStore ? <AnalysisRequestSection store={requestStore} connectionNotice={connectionNotice} registration={registrationStore ?? undefined} /> : connectSection}
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

function ConnectedList({ connected, expanded, titleId, onToggle, onShowRepository, onRetry, renderRetry }: {
  connected: ConnectedState;
  expanded: ReadonlySet<string>;
  titleId: string;
  onToggle: (repositoryId: string) => void;
  onShowRepository: (repositoryId: string) => void;
  onRetry: () => void;
  /** 서버가 재요청을 허용한 최신 요청에 그릴 재요청 영역(#154). 허용 여부는 그 영역이 서버 값으로 다시 확인한다. */
  renderRetry?: (latest: ConnectedRepository["latest"]) => ReactNode;
}) {
  if (connected.state === "loading") return <p className={styles.muted} role="status">저장소 상태를 불러오고 있습니다.</p>;
  if (connected.state === "checking") return <p className={styles.muted} role="status">GitHub 연동 상태를 다시 확인하고 있습니다.</p>;
  if (connected.state === "failed" && connected.github) {
    const reauth = connected.github === "REAUTH_REQUIRED";
    return (
      <div className={styles.lookupFailed} role="alert">
        <p>{reauth ? "GitHub 연동을 다시 확인해야 저장소 상태를 불러올 수 있습니다." : "GitHub가 연동되어 있지 않아 저장소 상태를 불러올 수 없습니다."} 분석이 실패한 것은 아닙니다.</p>
        <Link href={routes.profileGithub} className={styles.secondaryButton}>{reauth ? "GitHub 다시 연동하기" : "GitHub 연동하기"}</Link>
      </div>
    );
  }
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
                  <p className={styles.muted}>등록 목록에서 이 저장소의 이름을 찾지 못해 식별자로 표시합니다.</p>
                )}
                {item.latest.retryAllowed && renderRetry?.(item.latest)}
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
