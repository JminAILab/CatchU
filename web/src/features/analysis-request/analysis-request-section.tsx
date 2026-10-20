"use client";

import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { routes } from "@/lib/routes";
import type { AnalyzableRepository } from "../repository-management/repository-api";
import { repositoryDisplayName } from "../repository-management/repository-status";
import type { AnalysisRequestStore, Load, RequestSnapshot } from "./analysis-request-store";
import styles from "./analysis-request.module.css";

/**
 * 저장소 연결 관리 모달 아래쪽 「연결할 수 있는 저장소」(#154).
 * 서버가 허용한 저장소를 고르고, 현재 고지를 버튼 앞에 보인 뒤 버튼 하나로 동의와 첫 요청을 보낸다.
 * 고지 본문은 React 텍스트로만 그린다(HTML로 해석하지 않음). 줄바꿈은 CSS로 살린다.
 */
/**
 * 연결 상태 때문에 새 요청을 받지 않을 때 보일 안내(#153 조립이 정한다).
 * 연결 해제·재인증 필요가 확인됐거나, 연결 필요 거부 뒤 연동 상태를 다시 확인하는 중이다.
 */
export type ConnectionNotice = "DISCONNECTED" | "REAUTH_REQUIRED" | "CHECKING";

/**
 * `connectionNotice`가 있으면 입력 단계에서 저장소 선택·고지·[동의하고 분석 요청] 대신 재연동 안내를 보인다.
 * 이미 보낸 요청(요청 중·응답 불명·빈도 제한)의 표시와 [같은 요청 다시 보내기], 결과 안내는 그대로다.
 */
export function AnalysisRequestSection({ store, connectionNotice }: { store: AnalysisRequestStore; connectionNotice?: ConnectionNotice }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const baseId = useId();
  const { repositories, notice, selectedId, phase, retryAt, pendingRepositoryId, message } = snapshot;
  const [, setTick] = useState(0);
  const waitSeconds = retryAt === null ? 0 : store.retryWaitSeconds();
  const limitedWaiting = waitSeconds > 0;

  // 시간 경과는 화면에만 반영하고 자동 전송하지 않는다. 모달을 닫거나 기한이 지나면 타이머를 정리한다.
  useEffect(() => {
    if (!limitedWaiting) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [limitedWaiting, retryAt]);
  const editing = phase === "editing";
  // 입력 단계에서만 막는다. 이미 보낸 요청의 확인·재전송은 연결 상태와 관계없이 그대로 둔다.
  const blockedNotice = editing ? connectionNotice : undefined;
  const selected = repositories.state === "ready" ? repositories.value.find((item) => item.repositoryId === selectedId) ?? null : null;
  const pendingName = pendingRepositoryId === null ? null : nameOf(repositories, pendingRepositoryId);

  return (
    <div className={styles.section}>
      {blockedNotice ? (
        <ConnectionRequired notice={blockedNotice} linked={message?.action === "github"} />
      ) : (<>
      <RepositoryChoices repositories={repositories} selectedId={selectedId} disabled={!editing}
        name={`${baseId}-repository`} onSelect={(id) => store.select(id)} onRetry={() => { void store.loadRepositories(); }} />

      <section className={styles.notice} aria-labelledby={`${baseId}-notice`}>
        <h4 id={`${baseId}-notice`}>분석 안내</h4>
        <NoticeBody notice={notice} labelledBy={`${baseId}-notice`} onRetry={() => { void store.loadNotice(); }} />
      </section>

      {editing && selected && notice.state === "ready" && (
        <p className={styles.muted}>
          선택한 저장소: {repositoryDisplayName(selected)} · 허용 범위 판본 {selected.allowedScopeRevision}
        </p>
      )}

      <p className={styles.muted}>
        [동의하고 분석 요청]을 누르면 위 안내에 동의하고 선택한 저장소의 분석을 요청합니다. 이 동의는 이번 요청에만 쓰입니다.
      </p>
      </>)}

      {pendingName && (
        <p className={styles.pending}>
          {phase === "submitting" ? "요청 중인 저장소: " : phase === "limited" ? "다시 보낼 요청: " : "결과를 확인할 요청: "}<strong>{pendingName}</strong>
        </p>
      )}

      {message && (
        <div className={message.tone === "error" ? styles.messageError : message.tone === "success" ? styles.messageSuccess : styles.messageInfo}
          role={message.tone === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.action === "github" && <Link href={routes.profileGithub} className={styles.inlineLink}>GitHub 연동 확인하기</Link>}
        </div>
      )}

      {limitedWaiting && (
        <p className={styles.muted} role="status">같은 요청을 다시 보내기까지 {waitSeconds}초 남았습니다.</p>
      )}

      <div className={styles.actions}>
        {phase === "editing" && !blockedNotice && (
          <button type="button" className={styles.primaryButton} disabled={!store.canSubmit()} onClick={() => { void store.submit(); }}>
            동의하고 분석 요청
          </button>
        )}
        {phase === "submitting" && (
          <button type="button" className={styles.primaryButton} disabled aria-busy="true">요청 중…</button>
        )}
        {(phase === "unknown" || phase === "limited") && (
          <button type="button" className={styles.primaryButton} disabled={!store.canResend()} onClick={() => { void store.resend(); }}>
            같은 요청 다시 보내기
          </button>
        )}
      </div>
    </div>
  );
}

/** 연결 해제·재인증 필요·확인 중의 재연동 안내. 거부 안내에 이미 연동 링크가 있으면 링크를 겹쳐 보이지 않는다. */
function ConnectionRequired({ notice, linked }: { notice: ConnectionNotice; linked: boolean }) {
  if (notice === "CHECKING") return <p className={styles.muted} role="status">GitHub 연동 상태를 확인하고 있습니다.</p>;
  const reauth = notice === "REAUTH_REQUIRED";
  return (
    <div className={styles.lookupFailed}>
      <p>{reauth ? "GitHub 연동을 다시 확인해야 새 분석을 요청할 수 있습니다." : "GitHub가 연동되어 있지 않아 새 분석을 요청할 수 없습니다."} 연동한 뒤 저장소와 분석 안내를 다시 확인해 주세요.</p>
      {!linked && <Link href={routes.profileGithub} className={styles.inlineLink}>{reauth ? "GitHub 다시 연동하기" : "GitHub 연동하기"}</Link>}
    </div>
  );
}

function nameOf(repositories: RequestSnapshot["repositories"], repositoryId: string): string {
  const found = repositories.state === "ready" ? repositories.value.find((item) => item.repositoryId === repositoryId) : undefined;
  return found ? repositoryDisplayName(found) : `저장소 ${repositoryId}`;
}

function NoticeBody({ notice, labelledBy, onRetry }: {
  notice: RequestSnapshot["notice"];
  labelledBy: string;
  onRetry: () => void;
}) {
  if (notice.state === "loading") return <p className={styles.muted} role="status">분석 안내를 불러오고 있습니다.</p>;
  if (notice.state === "failed") {
    return (
      <div className={styles.lookupFailed} role="alert">
        <p>분석 안내를 불러오지 못했습니다. 안내를 확인해야 분석을 요청할 수 있습니다.</p>
        <button type="button" className={styles.secondaryButton} onClick={onRetry}>안내 다시 불러오기</button>
      </div>
    );
  }
  if (notice.state === "unavailable") {
    // 서버가 지금은 고지를 줄 수 없다고 판정했다. 다시 동의를 유도하지 않는다.
    return (
      <div className={styles.lookupFailed} role="alert">
        <p>지금은 분석을 요청할 수 없습니다.</p>
        <button type="button" className={styles.secondaryButton} onClick={onRetry}>다시 확인</button>
      </div>
    );
  }
  return (
    <>
      {/* 길 수 있어 스크롤 영역에 둔다. 키보드로도 스크롤할 수 있게 초점을 받는다. */}
      <div className={styles.noticeText} tabIndex={0} aria-labelledby={labelledBy}>{notice.value.text}</div>
      <p className={styles.revision}>안내 판본 {notice.value.noticeRevision}</p>
    </>
  );
}

function RepositoryChoices({ repositories, selectedId, disabled, name, onSelect, onRetry }: {
  repositories: Load<readonly AnalyzableRepository[]>;
  selectedId: string | null;
  disabled: boolean;
  name: string;
  onSelect: (repositoryId: string) => void;
  onRetry: () => void;
}) {
  if (repositories.state === "loading") return <p className={styles.muted} role="status">분석할 수 있는 저장소를 불러오고 있습니다.</p>;
  if (repositories.state === "failed") {
    return (
      <div className={styles.lookupFailed} role="alert">
        <p>분석할 수 있는 저장소를 불러오지 못했습니다. 저장소가 없다는 뜻은 아닙니다.</p>
        <button type="button" className={styles.secondaryButton} onClick={onRetry}>다시 불러오기</button>
      </div>
    );
  }
  if (repositories.state === "unavailable") {
    return (
      <div className={styles.lookupFailed} role="alert">
        {repositories.code === "GITHUB_CONNECTION_REQUIRED" ? (
          <>
            <p>GitHub 연동을 다시 확인해야 분석할 저장소를 고를 수 있습니다.</p>
            <Link href={routes.profileGithub} className={styles.inlineLink}>GitHub 연동 확인하기</Link>
          </>
        ) : (
          <>
            <p>지금은 분석할 저장소를 고를 수 없습니다.</p>
            <button type="button" className={styles.secondaryButton} onClick={onRetry}>다시 확인</button>
          </>
        )}
      </div>
    );
  }
  if (repositories.value.length === 0) return <p className={styles.muted}>지금 분석을 요청할 수 있는 저장소가 없습니다.</p>;
  return (
    <fieldset className={styles.choices} disabled={disabled}>
      <legend>분석할 저장소</legend>
      {repositories.value.map((item) => (
        <label key={item.repositoryId} className={styles.choice}>
          <input type="radio" name={name} value={item.repositoryId} checked={selectedId === item.repositoryId}
            onChange={() => onSelect(item.repositoryId)} />
          <span className={styles.choiceName}>{repositoryDisplayName(item)}</span>
        </label>
      ))}
    </fieldset>
  );
}
